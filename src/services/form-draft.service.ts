import { createHash, randomBytes, randomInt } from 'crypto';
import {
  Prisma,
  type Form,
  type FormDraft,
  type FormField,
  type FormUpload,
} from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  parseFormDraftSettings,
  parseObject,
  toAnswerRecord,
} from '@/lib/form-utils';
import { prisma } from '@/lib/prisma';
import { storage } from '@/lib/storage';
import { getAppBaseUrl, sendEmail } from '@/lib/email';
import { formDraftEmail } from '@/lib/email-templates';
import type { TenantAwareParams } from '@/lib/types';
import type { PublicDraftSaveInput } from '@/lib/validations/form-builder';
import { applyDefaultTodayAnswers, toJsonInput } from './form-builder.helpers';

export interface DeleteFormDraftResult {
  id: string;
}

export interface PublicDraftSaveResult {
  draftCode: string;
  accessToken: string;
  resumeUrl: string;
  expiresAt: Date;
  savedAt: Date;
}

export interface PublicDraftUploadStatus {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PublicDraftResumeResult extends PublicDraftSaveResult {
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  uploadsByFieldKey: Record<string, PublicDraftUploadStatus[]>;
}

const DRAFT_CODE_LENGTH = 5;
const DRAFT_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DRAFT_ACCESS_TOKEN_BYTES = 24;
const MAX_DRAFT_CODE_ATTEMPTS = 20;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function generateDraftCode(): string {
  let result = '';
  for (let index = 0; index < DRAFT_CODE_LENGTH; index += 1) {
    result += DRAFT_CODE_ALPHABET[randomInt(0, DRAFT_CODE_ALPHABET.length)];
  }
  return result;
}

function generateDraftAccessToken(): string {
  return randomBytes(DRAFT_ACCESS_TOKEN_BYTES).toString('base64url');
}

function hashDraftAccessToken(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex');
}

function buildDraftResumeUrl(slug: string, draftCode: string, accessToken: string): string {
  const params = new URLSearchParams({
    draft: draftCode,
    resume: accessToken,
  });
  return `${getAppBaseUrl()}/forms/f/${encodeURIComponent(slug)}?${params.toString()}`;
}

function isUniqueConstraintError(error: unknown, fieldNames: string[]): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
  return fieldNames.some((fieldName) => target.includes(fieldName));
}

function normalizeDraftMetadata(metadata: unknown): Record<string, unknown> {
  const raw = parseObject(metadata);
  if (!raw) return {};

  const normalized: Record<string, unknown> = {};

  if (typeof raw.locale === 'string' && raw.locale.trim().length > 0) {
    normalized.locale = raw.locale.trim().slice(0, 32);
  }

  if (typeof raw.userAgent === 'string' && raw.userAgent.trim().length > 0) {
    normalized.userAgent = raw.userAgent.trim().slice(0, 500);
  }

  const repeatSectionCounts = parseObject(raw.repeatSectionCounts);
  if (repeatSectionCounts) {
    const nextCounts: Record<string, number> = {};
    for (const [key, value] of Object.entries(repeatSectionCounts)) {
      const normalizedKey = key.trim();
      if (!normalizedKey) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      nextCounts[normalizedKey] = Math.max(1, Math.min(50, Math.trunc(value)));
    }
    if (Object.keys(nextCounts).length > 0) {
      normalized.repeatSectionCounts = nextCounts;
    }
  }

  return normalized;
}

async function createFormDraftRecord(
  tx: Prisma.TransactionClient,
  form: Pick<Form, 'id' | 'tenantId'>,
  answers: Record<string, unknown>,
  metadata: Record<string, unknown>,
  expiresAt: Date,
  lastSavedAt: Date
): Promise<{ draft: FormDraft; accessToken: string }> {
  for (let attempt = 0; attempt < MAX_DRAFT_CODE_ATTEMPTS; attempt += 1) {
    const code = generateDraftCode();
    const accessToken = generateDraftAccessToken();

    try {
      const draft = await tx.formDraft.create({
        data: {
          code,
          accessTokenHash: hashDraftAccessToken(accessToken),
          formId: form.id,
          tenantId: form.tenantId,
          answers: answers as Prisma.InputJsonValue,
          metadata: toJsonInput(metadata),
          expiresAt,
          lastSavedAt,
        },
      });

      return { draft, accessToken };
    } catch (error) {
      if (isUniqueConstraintError(error, ['code', 'access_token_hash'])) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to generate draft code');
}

export async function deleteFormDraftsByIds(draftIds: string[]): Promise<number> {
  if (draftIds.length === 0) return 0;

  const drafts = await prisma.formDraft.findMany({
    where: {
      id: { in: draftIds },
    },
    select: {
      id: true,
      uploads: {
        select: {
          storageKey: true,
        },
      },
    },
  });

  if (drafts.length === 0) return 0;

  await Promise.allSettled(
    drafts.flatMap((draft) => draft.uploads.map((upload) => storage.delete(upload.storageKey)))
  );

  const deleted = await prisma.formDraft.deleteMany({
    where: {
      id: { in: drafts.map((draft) => draft.id) },
    },
  });

  return deleted.count;
}

async function loadDraftByCode(input: {
  formId: string;
  tenantId: string;
  draftCode: string;
}): Promise<FormDraft | null> {
  const draft = await prisma.formDraft.findFirst({
    where: {
      code: input.draftCode,
      formId: input.formId,
      tenantId: input.tenantId,
    },
  });

  if (!draft) {
    return null;
  }

  if (draft.expiresAt.getTime() <= Date.now()) {
    await deleteFormDraftsByIds([draft.id]);
    return null;
  }

  return draft;
}

export async function loadDraftByAccess(input: {
  formId: string;
  tenantId: string;
  draftCode: string;
  accessToken: string;
}): Promise<FormDraft | null> {
  const draft = await loadDraftByCode(input);

  if (!draft) {
    return null;
  }

  if (draft.accessTokenHash !== hashDraftAccessToken(input.accessToken)) {
    return null;
  }

  return draft;
}

function collectUploadIdsFromAnswer(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    ids.push(...collectUploadIdsFromAnswer(item));
  }
  return ids;
}

function buildDraftUploadsByFieldKey(
  fields: FormField[],
  answers: Record<string, unknown>,
  uploads: FormUpload[]
): Record<string, PublicDraftUploadStatus[]> {
  const uploadsById = new Map(uploads.map((upload) => [upload.id, upload]));
  const result: Record<string, PublicDraftUploadStatus[]> = {};

  for (const field of fields) {
    if (field.type !== 'FILE_UPLOAD') continue;

    const fieldUploads = collectUploadIdsFromAnswer(answers[field.key])
      .filter((id) => UPLOAD_ID_PATTERN.test(id))
      .map((candidate) => uploadsById.get(candidate))
      .filter((upload): upload is FormUpload => !!upload)
      .map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
      }));

    if (fieldUploads.length === 0) continue;

    result[field.key] = fieldUploads;
  }

  return result;
}

// sanitizePublicAnswers — a draft-local copy (draft saves don't do full validation,
// but we still sanitize to keep answers clean before persisting).
function sanitizeChoiceEntry(entry: unknown): string | { value: string; detailText?: string } | null {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 10_000);
  }

  const record = parseObject(entry);
  if (!record) return null;
  const valueText = typeof record.value === 'string' ? record.value.trim() : '';
  if (!valueText) return null;
  const detailTextRaw = typeof record.detailText === 'string' ? record.detailText.trim() : '';
  const detailText = detailTextRaw ? detailTextRaw.slice(0, 10_000) : '';

  if (!detailText) {
    return { value: valueText.slice(0, 10_000) };
  }

  return {
    value: valueText.slice(0, 10_000),
    detailText,
  };
}

function sanitizePublicAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
  uploadIdSet: Set<string>
): Record<string, unknown> {
  const validKeys = new Set(fields.map((field) => field.key));
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const sanitizedAnswers: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (!validKeys.has(key)) continue;

    const field = fieldsByKey.get(key);
    if (!field) continue;

    switch (field.type) {
      case 'SHORT_TEXT':
      case 'LONG_TEXT':
      case 'DROPDOWN':
        if (typeof value === 'string') {
          sanitizedAnswers[key] = value.slice(0, 10_000);
        } else if (Array.isArray(value)) {
          sanitizedAnswers[key] = value
            .slice(0, 100)
            .map((item) => (typeof item === 'string' ? item.slice(0, 10_000) : ''));
        }
        break;
      case 'SINGLE_CHOICE':
        if (Array.isArray(value)) {
          sanitizedAnswers[key] = value
            .slice(0, 100)
            .map((entry) => sanitizeChoiceEntry(entry) ?? '');
        } else {
          const singleValue = sanitizeChoiceEntry(value);
          if (singleValue) {
            sanitizedAnswers[key] = singleValue;
          }
        }
        break;
      case 'MULTIPLE_CHOICE':
        if (Array.isArray(value)) {
          sanitizedAnswers[key] = value.slice(0, 100).map((entry) => {
            if (Array.isArray(entry)) {
              return entry
                .slice(0, 100)
                .map((candidate) => sanitizeChoiceEntry(candidate))
                .map((candidate) => candidate ?? '');
            }
            return sanitizeChoiceEntry(entry) ?? '';
          });
        }
        break;
      case 'FILE_UPLOAD': {
        const referencedUploadIds = collectUploadIdsFromAnswer(value)
          .filter((id) => UPLOAD_ID_PATTERN.test(id) && uploadIdSet.has(id))
          .slice(0, 100);

        if (referencedUploadIds.length > 0) {
          sanitizedAnswers[key] = referencedUploadIds;
        }
        break;
      }
      case 'SIGNATURE':
        if (typeof value === 'string') {
          sanitizedAnswers[key] = value.slice(0, 100_000);
        } else if (Array.isArray(value)) {
          sanitizedAnswers[key] = value
            .slice(0, 100)
            .map((item) => (typeof item === 'string' ? item.slice(0, 100_000) : ''));
        }
        break;
      case 'HIDDEN':
        if (typeof value === 'string') {
          sanitizedAnswers[key] = value.slice(0, 10_000);
        }
        break;
      default:
        break;
    }
  }

  const totalSize = JSON.stringify(sanitizedAnswers).length;
  if (totalSize > 5_000_000) {
    throw new Error('Submission answers payload is too large. Please reduce the size of your responses.');
  }

  return sanitizedAnswers;
}

// Re-export for use in submission service (to avoid duplication)
export { sanitizeChoiceEntry, sanitizePublicAnswers };

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function savePublicDraft(
  slug: string,
  input: PublicDraftSaveInput
): Promise<PublicDraftSaveResult> {
  const form = await prisma.form.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    include: {
      fields: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const draftSettings = parseFormDraftSettings(form.settings);
  if (!draftSettings.enabled) {
    throw new Error('Draft saving is not enabled for this form');
  }

  if ((input.draftCode && !input.accessToken) || (!input.draftCode && input.accessToken)) {
    throw new Error('Draft access is incomplete');
  }

  const uploadIds = [...new Set((input.uploadIds || []).filter((id) => typeof id === 'string' && UPLOAD_ID_PATTERN.test(id)))];
  const uploadIdSet = new Set(uploadIds);

  const answers = applyDefaultTodayAnswers(form.fields, toAnswerRecord(input.answers));
  const sanitizedAnswers = sanitizePublicAnswers(form.fields, answers, uploadIdSet);
  const normalizedMetadata = normalizeDraftMetadata(input.metadata);
  const expiresAt = new Date(Date.now() + draftSettings.autoDeleteDays * 24 * 60 * 60 * 1000);
  const savedAt = new Date();

  const existingDraft = input.draftCode && input.accessToken
    ? await loadDraftByAccess({
      formId: form.id,
      tenantId: form.tenantId,
      draftCode: input.draftCode,
      accessToken: input.accessToken,
    })
    : null;

  if (input.draftCode && input.accessToken && !existingDraft) {
    throw new Error('Draft not found');
  }

  const persisted = await prisma.$transaction(async (tx) => {
    const staleUploads = existingDraft
      ? await tx.formUpload.findMany({
        where: {
          formId: form.id,
          tenantId: form.tenantId,
          draftId: existingDraft.id,
          submissionId: null,
          ...(uploadIds.length > 0 ? { id: { notIn: uploadIds } } : {}),
        },
        select: {
          id: true,
          storageKey: true,
        },
      })
      : [];

    const createdDraftResult = existingDraft
      ? null
      : await createFormDraftRecord(tx, form, sanitizedAnswers, normalizedMetadata, expiresAt, savedAt);

    const draftRecord = existingDraft
      ? await tx.formDraft.update({
        where: { id: existingDraft.id },
        data: {
          answers: sanitizedAnswers as Prisma.InputJsonValue,
          metadata: toJsonInput(normalizedMetadata),
          expiresAt,
          lastSavedAt: savedAt,
        },
      })
      : createdDraftResult!.draft;

    const accessToken = existingDraft ? input.accessToken! : createdDraftResult!.accessToken;

    if (uploadIds.length > 0) {
      const availableUploads = await tx.formUpload.findMany({
        where: {
          id: { in: uploadIds },
          formId: form.id,
          tenantId: form.tenantId,
          submissionId: null,
          ...(existingDraft
            ? {
              OR: [
                { draftId: null },
                { draftId: existingDraft.id },
              ],
            }
            : { draftId: null }),
        },
        select: {
          id: true,
        },
      });

      if (availableUploads.length !== uploadIds.length) {
        throw new Error('Some uploaded files are invalid or already used');
      }

      await tx.formUpload.updateMany({
        where: {
          id: { in: uploadIds },
          formId: form.id,
          tenantId: form.tenantId,
          submissionId: null,
        },
        data: {
          draftId: draftRecord.id,
        },
      });
    }

    if (staleUploads.length > 0) {
      await tx.formUpload.deleteMany({
        where: {
          id: { in: staleUploads.map((upload) => upload.id) },
        },
      });
    }

    return {
      draft: draftRecord,
      accessToken,
      staleUploads,
    };
  });

  if (persisted.staleUploads.length > 0) {
    await Promise.allSettled(
      persisted.staleUploads.map((upload) => storage.delete(upload.storageKey))
    );
  }

  return {
    draftCode: persisted.draft.code,
    accessToken: persisted.accessToken,
    resumeUrl: buildDraftResumeUrl(form.slug, persisted.draft.code, persisted.accessToken),
    expiresAt: persisted.draft.expiresAt,
    savedAt: savedAt,
  };
}

export async function getPublicDraftByCode(
  slug: string,
  draftCode: string,
  accessToken: string
): Promise<PublicDraftResumeResult> {
  const form = await prisma.form.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    include: {
      fields: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const draftSettings = parseFormDraftSettings(form.settings);
  if (!draftSettings.enabled) {
    throw new Error('Draft saving is not enabled for this form');
  }

  const draft = await loadDraftByAccess({
    formId: form.id,
    tenantId: form.tenantId,
    draftCode,
    accessToken,
  });

  if (!draft) {
    throw new Error('Draft not found');
  }

  const uploads = await prisma.formUpload.findMany({
    where: {
      formId: form.id,
      tenantId: form.tenantId,
      draftId: draft.id,
      submissionId: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  const answers = toAnswerRecord(draft.answers);
  const metadata = parseObject(draft.metadata) || {};

  return {
    draftCode: draft.code,
    accessToken,
    resumeUrl: buildDraftResumeUrl(form.slug, draft.code, accessToken),
    expiresAt: draft.expiresAt,
    savedAt: draft.lastSavedAt,
    answers,
    metadata,
    uploadsByFieldKey: buildDraftUploadsByFieldKey(form.fields, answers, uploads),
  };
}

export async function deleteFormDraft(
  formId: string,
  draftId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<DeleteFormDraftResult> {
  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
    },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const draft = await prisma.formDraft.findFirst({
    where: {
      id: draftId,
      formId,
      tenantId: params.tenantId,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (!draft) {
    throw new Error('Draft not found');
  }

  const deletedCount = await deleteFormDraftsByIds([draft.id]);
  if (deletedCount === 0) {
    throw new Error('Draft not found');
  }

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'DELETE',
    entityType: 'FormDraft',
    entityId: draft.id,
    entityName: draft.code,
    summary: `Deleted draft ${draft.code} from "${form.title}"`,
    reason,
    changeSource: 'MANUAL',
  });

  return {
    id: draft.id,
  };
}

export async function emailPublicFormDraft(
  slug: string,
  draftCode: string,
  recipientEmail: string,
  accessToken: string
): Promise<void> {
  const form = await prisma.form.findFirst({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    select: { id: true, tenantId: true, title: true, slug: true },
  });

  if (!form) throw new Error('Form not found');

  const draft = await loadDraftByAccess({
    formId: form.id,
    tenantId: form.tenantId,
    draftCode,
    accessToken,
  });

  if (!draft) throw new Error('Draft not found');

  const resumeUrl = buildDraftResumeUrl(form.slug, draft.code, accessToken);

  const email = recipientEmail.trim().toLowerCase();
  const { subject, html } = formDraftEmail({
    formTitle: form.title,
    resumeUrl,
  });

  const result = await sendEmail({ to: email, subject, html });
  if (!result.success) {
    throw new Error(result.error || 'Failed to send email');
  }
}

export async function cleanupExpiredFormDrafts(): Promise<number> {
  const expiredDrafts = await prisma.formDraft.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
    select: {
      id: true,
    },
  });

  return deleteFormDraftsByIds(expiredDrafts.map((draft) => draft.id));
}
