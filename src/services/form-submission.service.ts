import { randomUUID } from 'crypto';
import {
  FormFieldType,
  FormStatus,
  FormSubmissionStatus,
  Prisma,
  type Form,
  type FormField,
  type FormSubmission,
  type FormUpload,
} from '@/generated/prisma';
import { fromBuffer } from 'file-type';
import { createAuditLog } from '@/lib/audit';
import {
  RESPONSE_COLUMN_STATUS_ID,
  RESPONSE_COLUMN_SUBMITTED_ID,
  buildPublicFormSettings,
  evaluateCondition,
  formatChoiceAnswer,
  isEmptyValue,
  parseFormAiSettings,
  parseFormNotificationSettings,
  parseFormSubmissionAiReview,
  parseObject,
  toAnswerRecord,
  toUploadIds,
  type FormSubmissionAiReview,
  type PublicFormDefinition,
  type PublicFormField,
} from '@/lib/form-utils';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import { getAppBaseUrl, sendEmail, type EmailAttachment } from '@/lib/email';
import { createLogger } from '@/lib/logger';
import { generateFormSubmissionAiReview } from '@/services/form-ai.service';
import type { TenantAwareParams } from '@/lib/types';
import { evaluateArithmeticExpression } from '@/lib/safe-math';
import { incrementViewCount } from '@/lib/view-count-buffer';
import type { PublicSubmissionInput } from '@/lib/validations/form-builder';
import {
  applyDefaultTodayAnswers,
  escapeHtml,
  getTenantTimeZone,
  isRepeatEndMarker,
  isRepeatStartMarker,
  toJsonInput,
} from './form-builder.helpers';
import {
  buildSubmissionPdfBuffer,
  resolveSubmissionPdfFileName,
  resolveSubmissionUploadFileNames,
} from './form-pdf.service';
import { loadDraftByAccess } from './form-draft.service';

export type { PublicFormField, PublicFormDefinition };

export interface FormResponseAttachmentListItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface FormResponseSubmissionListItem extends FormSubmission {
  uploadCount: number;
  attachments: FormResponseAttachmentListItem[];
}

export interface FormResponseDraftListItem {
  id: string;
  code: string;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expiresAt: Date;
  lastSavedAt: Date;
  createdAt: Date;
  uploadCount: number;
  attachments: FormResponseAttachmentListItem[];
}

export interface FormResponseDetailResult {
  submission: FormSubmission;
  uploads: FormUpload[];
}

export interface FormDraftDetailResult {
  draft: FormResponseDraftListItem;
  uploads: FormUpload[];
}

export interface DeleteFormResponseResult {
  id: string;
  deletedUploadCount: number;
}

export interface DeleteFormResponseUploadResult {
  id: string;
  submissionId: string;
}

export interface RecentFormSubmissionItem {
  id: string;
  formId: string;
  formTitle: string;
  formSlug: string;
  formStatus: FormStatus;
  submittedAt: Date;
  respondentName: string | null;
  respondentEmail: string | null;
  status: FormSubmissionStatus;
}

export interface FormResponsesQueryInput {
  submissionSortBy?: string;
  submissionSortOrder?: 'asc' | 'desc';
  submissionFilters?: Record<string, string>;
}

export interface FormResponsesResult {
  submissions: FormResponseSubmissionListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  drafts: FormResponseDraftListItem[];
  draftTotal: number;
  draftPage: number;
  draftLimit: number;
  draftTotalPages: number;
  chart: Array<{ date: string; responses: number }>;
}

const MAX_NOTIFICATION_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_NOTIFICATION_UPLOAD_ATTACHMENTS = 20;
const MAX_NOTIFICATION_DOWNLOAD_CONCURRENCY = 4;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESPONSE_ATTACHMENTS_COLUMN_ID = '__submission_attachments';
const log = createLogger('form-builder');

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function formatResponseCellValue(fieldType: FormFieldType | string, value: unknown): string {
  if (value === null || value === undefined) return '-';

  if (fieldType === 'SIGNATURE') {
    return typeof value === 'string' && value.trim().length > 0 ? 'Signed' : '-';
  }

  if (fieldType === 'FILE_UPLOAD') {
    if (Array.isArray(value)) {
      return value.length > 0 ? `${value.length} file${value.length > 1 ? 's' : ''}` : '-';
    }
    return typeof value === 'string' && value.trim().length > 0 ? value : '-';
  }

  if (fieldType === 'SINGLE_CHOICE' || fieldType === 'MULTIPLE_CHOICE') {
    const choiceText = formatChoiceAnswer(value);
    return choiceText || '-';
  }

  if (Array.isArray(value)) {
    const text = value.map((item) => String(item)).join(', ').trim();
    return text || '-';
  }

  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value);
      return text.length > 0 ? text : '-';
    } catch {
      return '-';
    }
  }

  const text = String(value).trim();
  return text || '-';
}

function getSubmissionStatusText(submission: Pick<FormSubmission, 'status' | 'metadata'>): string {
  const aiReview = parseFormSubmissionAiReview(submission.metadata);
  const tokens: string[] = [submission.status];

  if (aiReview?.status === 'queued' || aiReview?.status === 'processing') {
    tokens.push('review pending');
  }

  if (aiReview && aiReview.status === 'completed' && aiReview.reviewRequired) {
    if (!aiReview.warningSignature || aiReview.resolvedWarningSignature !== aiReview.warningSignature) {
      tokens.push('warning review required');
    }
  }

  return tokens.join(' ');
}

function getSubmissionColumnFilterText(
  submission: FormSubmission & { _count: { uploads: number } },
  fieldTypeByKey: Map<string, FormFieldType>,
  columnId: string
): string {
  if (columnId === RESPONSE_COLUMN_SUBMITTED_ID) {
    return `${submission.submittedAt.toISOString()} ${submission.submittedAt.toLocaleString('en-SG')}`.toLowerCase();
  }

  if (columnId === RESPONSE_COLUMN_STATUS_ID) {
    return getSubmissionStatusText(submission).toLowerCase();
  }

  if (columnId === RESPONSE_ATTACHMENTS_COLUMN_ID) {
    return `${submission._count.uploads} file${submission._count.uploads === 1 ? '' : 's'}`.toLowerCase();
  }

  const fieldType = fieldTypeByKey.get(columnId);
  if (!fieldType) {
    return '';
  }

  const answers = toAnswerRecord(submission.answers);
  return formatResponseCellValue(fieldType, answers[columnId]).toLowerCase();
}

function compareSubmissionRows(
  left: FormSubmission & { _count: { uploads: number } },
  right: FormSubmission & { _count: { uploads: number } },
  fieldTypeByKey: Map<string, FormFieldType>,
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): number {
  const direction = sortOrder === 'asc' ? 1 : -1;

  if (sortBy === RESPONSE_COLUMN_SUBMITTED_ID) {
    return (left.submittedAt.getTime() - right.submittedAt.getTime()) * direction;
  }

  if (sortBy === RESPONSE_ATTACHMENTS_COLUMN_ID) {
    return (left._count.uploads - right._count.uploads) * direction;
  }

  const leftValue = sortBy === RESPONSE_COLUMN_STATUS_ID
    ? getSubmissionStatusText(left)
    : getSubmissionColumnFilterText(left, fieldTypeByKey, sortBy);
  const rightValue = sortBy === RESPONSE_COLUMN_STATUS_ID
    ? getSubmissionStatusText(right)
    : getSubmissionColumnFilterText(right, fieldTypeByKey, sortBy);

  const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
  if (comparison !== 0) {
    return comparison * direction;
  }

  return right.submittedAt.getTime() - left.submittedAt.getTime();
}

function removeUploadIdFromAnswerValue(value: unknown, uploadId: string): unknown {
  if (typeof value === 'string') {
    return value.trim() === uploadId ? undefined : value;
  }

  if (!Array.isArray(value)) {
    return value;
  }

  const nextValue: unknown[] = [];

  for (const item of value) {
    if (Array.isArray(item)) {
      const updatedNested = removeUploadIdFromAnswerValue(item, uploadId);
      nextValue.push(Array.isArray(updatedNested) ? updatedNested : []);
      continue;
    }

    const updatedItem = removeUploadIdFromAnswerValue(item, uploadId);
    if (updatedItem !== undefined) {
      nextValue.push(updatedItem);
    }
  }

  return nextValue;
}

function removeUploadFromAnswerRecord(
  answers: Record<string, unknown>,
  uploadId: string,
  fieldKey?: string
): Record<string, unknown> {
  const nextAnswers = { ...answers };
  const updateKey = (key: string): boolean => {
    if (!(key in nextAnswers)) return false;

    const value = nextAnswers[key];
    if (!collectUploadIdsFromAnswer(value).includes(uploadId)) return false;

    const updatedValue = removeUploadIdFromAnswerValue(value, uploadId);
    nextAnswers[key] = updatedValue === undefined ? [] : updatedValue;
    return true;
  };

  const removedFromFieldKey = fieldKey ? updateKey(fieldKey) : false;

  if (!removedFromFieldKey) {
    for (const key of Object.keys(nextAnswers)) {
      updateKey(key);
    }
  }

  return nextAnswers;
}

async function deleteStoredUploads(
  uploads: Array<Pick<FormUpload, 'id' | 'storageKey'>>,
  context: { formId: string; submissionId?: string }
): Promise<void> {
  if (uploads.length === 0) return;

  const results = await Promise.allSettled(
    uploads.map((upload) => storage.delete(upload.storageKey))
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return;

    const upload = uploads[index];
    if (!upload) return;

    log.error('Failed to delete form upload from storage', {
      formId: context.formId,
      submissionId: context.submissionId,
      uploadId: upload.id,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });
}

async function buildSubmissionNotificationAttachments(input: {
  pdfFileName: string;
  pdfBuffer: Buffer;
  uploads: FormUpload[];
}): Promise<{ attachments: EmailAttachment[]; omittedUploads: number }> {
  const attachments: EmailAttachment[] = [
    {
      filename: input.pdfFileName,
      content: input.pdfBuffer,
      contentType: 'application/pdf',
    },
  ];

  let omittedUploads = 0;
  const uploadsToAttach = input.uploads.slice(0, MAX_NOTIFICATION_UPLOAD_ATTACHMENTS);
  omittedUploads += Math.max(0, input.uploads.length - uploadsToAttach.length);

  // Phase 1: pre-filter based on expected size so we avoid downloading bytes
  // we know won't fit. Mirrors the greedy accept-in-order semantics of the
  // original sequential loop, but without waiting on each download.
  const toDownload: FormUpload[] = [];
  let projectedBytes = input.pdfBuffer.length;
  for (const upload of uploadsToAttach) {
    if (projectedBytes >= MAX_NOTIFICATION_ATTACHMENT_BYTES) {
      omittedUploads += 1;
      continue;
    }
    const expectedSize = Math.max(0, upload.sizeBytes || 0);
    if (expectedSize > 0 && projectedBytes + expectedSize > MAX_NOTIFICATION_ATTACHMENT_BYTES) {
      omittedUploads += 1;
      continue;
    }
    toDownload.push(upload);
    projectedBytes += expectedSize;
  }

  // Phase 2: fetch survivors in small concurrent batches so we improve
  // latency without over-downloading large blobs that may later be dropped.
  let totalBytes = input.pdfBuffer.length;
  for (let i = 0; i < toDownload.length; i += MAX_NOTIFICATION_DOWNLOAD_CONCURRENCY) {
    if (totalBytes >= MAX_NOTIFICATION_ATTACHMENT_BYTES) {
      omittedUploads += toDownload.length - i;
      break;
    }

    const batch = toDownload.slice(i, i + MAX_NOTIFICATION_DOWNLOAD_CONCURRENCY);
    const downloadResults = await Promise.all(
      batch.map(async (upload): Promise<{ upload: FormUpload; content?: Buffer; error?: unknown }> => {
        try {
          const content = await storage.download(upload.storageKey);
          return { upload, content };
        } catch (error) {
          return { upload, error };
        }
      })
    );

    // Apply the real-byte budget in original order.
    for (const { upload, content, error } of downloadResults) {
      if (error || !content) {
        omittedUploads += 1;
        log.error('Failed to load upload for form completion email', {
          formId: upload.formId,
          uploadId: upload.id,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (totalBytes + content.length > MAX_NOTIFICATION_ATTACHMENT_BYTES) {
        omittedUploads += 1;
        continue;
      }
      attachments.push({
        filename: upload.fileName,
        content,
        contentType: upload.mimeType || 'application/octet-stream',
      });
      totalBytes += content.length;
    }
  }

  return { attachments, omittedUploads };
}

export async function sendCompletionNotificationEmailInternal(input: {
  form: Form & { fields: FormField[] };
  submission: FormSubmission;
  uploads: FormUpload[];
  tenantTimeZone: string;
}): Promise<void> {
  const notificationSettings = parseFormNotificationSettings(input.form.settings);
  const recipients = notificationSettings.completionRecipientEmails;
  if (recipients.length === 0) return;

  try {
    const answers = toAnswerRecord(input.submission.answers);
    const aiSettings = parseFormAiSettings(input.form.settings);
    const aiReview = parseFormSubmissionAiReview(input.submission.metadata);
    const aiReviewRequired = aiReview?.status === 'completed' && aiReview.reviewRequired;
    const aiReviewFailed = aiSettings.enabled && aiReview?.status === 'failed';
    const tenant = await prisma.tenant.findUnique({
      where: { id: input.form.tenantId },
      select: { logoUrl: true, name: true },
    });
    const pdfBuffer = await buildSubmissionPdfBuffer({
      formTitle: input.form.title,
      formDescription: input.form.description,
      submittedAt: input.submission.submittedAt,
      respondentName: input.submission.respondentName,
      respondentEmail: input.submission.respondentEmail,
      status: input.submission.status,
      fields: input.form.fields,
      answers,
      uploads: input.uploads,
      tenantLogoUrl: tenant?.logoUrl ?? null,
      tenantName: tenant?.name ?? null,
      formSettings: input.form.settings,
      timeZone: input.tenantTimeZone,
    });
    const pdfFileName = resolveSubmissionPdfFileName({
      formTitle: input.form.title,
      formSlug: input.form.slug,
      settings: input.form.settings,
      submissionId: input.submission.id,
      submittedAt: input.submission.submittedAt,
      timeZone: input.tenantTimeZone,
      answers,
    });

    const { attachments, omittedUploads } = await buildSubmissionNotificationAttachments({
      pdfFileName,
      pdfBuffer,
      uploads: input.uploads,
    });

    const safeFormTitle = escapeHtml(input.form.title);
    const submittedAt = new Date(input.submission.submittedAt).toLocaleString('en-SG');
    const responseUrl = `${getAppBaseUrl()}/forms/${encodeURIComponent(input.form.id)}/responses/${encodeURIComponent(input.submission.id)}`;
    const safeResponseUrl = responseUrl.replace(/"/g, '&quot;');
    const omittedMessage = omittedUploads > 0
      ? `<p><em>${omittedUploads} uploaded file(s) were not attached due to size or attachment limits.</em></p>`
      : '';
    const aiReviewSectionsHtml = aiReview
      ? aiReview.sections.map((section) => {
        if (section.type === 'text' && section.content) {
          return `
            <div style="margin-top:10px;">
              <p style="margin:0 0 6px;font-weight:600;color:#78350f;">${escapeHtml(section.title)}</p>
              <p style="margin:0;color:#78350f;">${escapeHtml(section.content)}</p>
            </div>
          `;
        }

        if (section.type === 'bullet_list' && section.items.length > 0) {
          return `
            <div style="margin-top:10px;">
              <p style="margin:0 0 6px;font-weight:600;color:#78350f;">${escapeHtml(section.title)}</p>
              <ul style="margin:0;padding-left:18px;color:#78350f;">${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>
          `;
        }

        if (section.type === 'key_value' && section.entries.length > 0) {
          return `
            <div style="margin-top:10px;">
              <p style="margin:0 0 6px;font-weight:600;color:#78350f;">${escapeHtml(section.title)}</p>
              <ul style="margin:0;padding-left:18px;color:#78350f;">${section.entries.map((entry) => `<li><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</li>`).join('')}</ul>
            </div>
          `;
        }

        return '';
      }).join('')
      : '';
    const aiReviewHtml = aiReviewRequired
      ? `
        <div style="margin:16px 0;padding:12px 14px;border:1px solid #f59e0b;border-radius:10px;background:#fffbeb;">
          <p style="margin:0 0 8px;font-weight:600;color:#92400e;">AI review flagged this submission for follow-up.</p>
          ${aiReview?.severity ? `<p style="margin:0 0 8px;color:#78350f;"><strong>Severity:</strong> ${escapeHtml(aiReview.severity.toUpperCase())}</p>` : ''}
          ${aiReview?.summary ? `<p style="margin:0 0 8px;color:#78350f;">${escapeHtml(aiReview.summary)}</p>` : ''}
          ${aiReview && aiReview.tags.length > 0 ? `<p style="margin:0 0 8px;color:#78350f;"><strong>Tags:</strong> ${aiReview.tags.map((tag) => escapeHtml(tag)).join(', ')}</p>` : ''}
          ${aiReviewSectionsHtml}
        </div>
      `
      : aiReviewFailed
        ? '<p><em>AI review did not complete before the internal notification was sent.</em></p>'
        : '';
    const html = `
      <p>Hello,</p>
      <p>A new response has been submitted for <strong>${safeFormTitle}</strong>.</p>
      <p>Submitted on: ${submittedAt}</p>
      <p><a href="${safeResponseUrl}">Open completed response</a></p>
      ${aiReviewHtml}
      ${omittedMessage}
      <p>The response PDF and available uploaded files are attached.</p>
    `;

    const result = await sendEmail({
      to: recipients,
      subject: `${aiReviewRequired ? '[AI Review Required] ' : ''}New form submission: ${input.form.title}`,
      html,
      attachments,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send completion notification');
    }
  } catch (error) {
    log.error('Failed to send form completion notification email', {
      formId: input.form.id,
      submissionId: input.submission.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function withSubmissionAiReview(
  metadata: unknown,
  aiReview: FormSubmissionAiReview | null
): Record<string, unknown> | null {
  const nextMetadata = parseObject(metadata) ? { ...(metadata as Record<string, unknown>) } : {};

  if (aiReview) {
    nextMetadata.aiReview = aiReview as unknown as Prisma.InputJsonValue;
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : null;
}

function normalizeUploadIds(uploadIds?: string[]): string[] {
  return [...new Set((uploadIds || []).filter((id) => typeof id === 'string' && UPLOAD_ID_PATTERN.test(id)))];
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

function hasItemValue(item: unknown): boolean {
  if (isEmptyValue(item)) return false;
  const itemRecord = parseObject(item);
  if (itemRecord && 'value' in itemRecord) {
    return typeof itemRecord.value === 'string' && itemRecord.value.trim().length > 0;
  }
  return true;
}

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

function getTodayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function resolveDateBoundary(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'today') return getTodayIsoDate();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function getDateValidationRange(field: FormField): { minDate?: string; maxDate?: string } {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') return {};
  const validation = parseObject(field.validation);
  const minDate = resolveDateBoundary(validation?.minDate);
  const maxDate = resolveDateBoundary(validation?.maxDate);

  return { minDate, maxDate };
}

function formatValidationDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthLabel = months[month - 1];
  if (!monthLabel) return value;

  return `${day} ${monthLabel} ${year}`;
}

function formatValidationNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}

function quoteValidationText(value: string): string {
  return `"${value}"`;
}

function normalizeNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateNumberFormula(formula: string, answersRecord: Record<string, unknown>): number | null {
  const normalizedFormula = formula.trim().replace(/^(>=|<=|>|<|=)\s*/, '');
  const referenced = normalizedFormula.replace(/\[([a-zA-Z][a-zA-Z0-9_]*)\]/g, (_match, fieldKey: string) => {
    const resolved = normalizeNumberValue(answersRecord[fieldKey]);
    return resolved === null ? 'NaN' : String(resolved);
  });

  return evaluateArithmeticExpression(referenced);
}

function getRowAnswerContext(answersRecord: Record<string, unknown>, rowIndex?: number): Record<string, unknown> {
  if (rowIndex === undefined) return answersRecord;

  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answersRecord)) {
    context[key] = Array.isArray(value) ? value[rowIndex] : value;
  }
  return context;
}

function validateDateFieldValue(field: FormField, value: unknown): void {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') return;
  if (typeof value !== 'string') return;

  const normalizedValue = value.trim();
  if (!normalizedValue) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error(`Enter a valid date for ${field.label || field.key}.`);
  }

  const { minDate, maxDate } = getDateValidationRange(field);
  if (minDate && normalizedValue < minDate) {
    throw new Error(`${field.label || field.key} must be on or after ${formatValidationDate(minDate)}.`);
  }
  if (maxDate && normalizedValue > maxDate) {
    throw new Error(`${field.label || field.key} must be on or before ${formatValidationDate(maxDate)}.`);
  }
}

function validateTextFieldValue(field: FormField, value: unknown): void {
  if (field.type !== 'LONG_TEXT' && (field.type !== 'SHORT_TEXT' || field.inputType === 'date' || field.inputType === 'number')) {
    return;
  }
  if (typeof value !== 'string' || value.length === 0) return;

  const validation = parseObject(field.validation);
  const text = value;

  if (typeof validation?.minLength === 'number' && text.length < validation.minLength) {
    throw new Error(`${field.label || field.key} must be at least ${validation.minLength} character${validation.minLength === 1 ? '' : 's'}.`);
  }
  if (typeof validation?.maxLength === 'number' && text.length > validation.maxLength) {
    throw new Error(`${field.label || field.key} must be at most ${validation.maxLength} character${validation.maxLength === 1 ? '' : 's'}.`);
  }
  if (typeof validation?.startsWith === 'string' && validation.startsWith.length > 0 && !text.startsWith(validation.startsWith)) {
    throw new Error(`${field.label || field.key} must begin with ${quoteValidationText(validation.startsWith)}.`);
  }
  if (typeof validation?.containsText === 'string' && validation.containsText.length > 0 && !text.includes(validation.containsText)) {
    throw new Error(`${field.label || field.key} must contain ${quoteValidationText(validation.containsText)}.`);
  }
  if (typeof validation?.notContainsText === 'string' && validation.notContainsText.length > 0 && text.includes(validation.notContainsText)) {
    throw new Error(`${field.label || field.key} must not contain ${quoteValidationText(validation.notContainsText)}.`);
  }
  if (typeof validation?.endsWith === 'string' && validation.endsWith.length > 0 && !text.endsWith(validation.endsWith)) {
    throw new Error(`${field.label || field.key} must end with ${quoteValidationText(validation.endsWith)}.`);
  }
}

function validateNumberFieldValue(field: FormField, value: unknown, answersRecord: Record<string, unknown>): void {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'number') return;
  if (value === null || value === undefined || value === '') return;

  const numericValue = normalizeNumberValue(value);
  if (numericValue === null) {
    throw new Error(`Enter a valid number for ${field.label || field.key}.`);
  }

  const validation = parseObject(field.validation);
  if (typeof validation?.min === 'number' && numericValue < validation.min) {
    throw new Error(`${field.label || field.key} must be at least ${formatValidationNumber(validation.min)}.`);
  }
  if (typeof validation?.max === 'number' && numericValue > validation.max) {
    throw new Error(`${field.label || field.key} must be at most ${formatValidationNumber(validation.max)}.`);
  }
  if (typeof validation?.equal === 'number' && numericValue !== validation.equal) {
    throw new Error(`${field.label || field.key} must equal ${formatValidationNumber(validation.equal)}.`);
  }
  if (typeof validation?.minFormula === 'string' && validation.minFormula.trim().length > 0) {
    const resolved = evaluateNumberFormula(validation.minFormula, answersRecord);
    if (resolved !== null && numericValue < resolved) {
      throw new Error(`${field.label || field.key} must be at least ${formatValidationNumber(resolved)}.`);
    }
  }
  if (typeof validation?.maxFormula === 'string' && validation.maxFormula.trim().length > 0) {
    const resolved = evaluateNumberFormula(validation.maxFormula, answersRecord);
    if (resolved !== null && numericValue > resolved) {
      throw new Error(`${field.label || field.key} must be at most ${formatValidationNumber(resolved)}.`);
    }
  }
  if (typeof validation?.equalFormula === 'string' && validation.equalFormula.trim().length > 0) {
    const resolved = evaluateNumberFormula(validation.equalFormula, answersRecord);
    if (resolved !== null && numericValue !== resolved) {
      throw new Error(`${field.label || field.key} must equal ${formatValidationNumber(resolved)}.`);
    }
  }
}

function validatePublicAnswerConstraints(fields: FormField[], answers: Record<string, unknown>): void {
  for (const field of fields) {
    const value = answers[field.key];

    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        validateDateFieldValue(field, item);
        validateTextFieldValue(field, item);
        validateNumberFieldValue(field, item, getRowAnswerContext(answers, index));
      }
      continue;
    }

    validateDateFieldValue(field, value);
    validateTextFieldValue(field, value);
    validateNumberFieldValue(field, value, answers);
  }
}

function validateRequiredFieldValue(
  field: FormField,
  answers: Record<string, unknown>,
  uploadIdSet: Set<string>
): void {
  if (!field.isRequired) return;

  const value = answers[field.key];

  if (field.type === 'FILE_UPLOAD') {
    const referencedUploadIds = collectUploadIdsFromAnswer(value)
      .filter((id) => UPLOAD_ID_PATTERN.test(id));

    if (referencedUploadIds.length === 0) {
      throw new Error(`${field.label || field.key} is required`);
    }

    const hasMissingUpload = referencedUploadIds.some((id) => !uploadIdSet.has(id));
    if (hasMissingUpload) {
      throw new Error(`${field.label || field.key} has an invalid upload`);
    }

    return;
  }

  if (Array.isArray(value)) {
    const hasAllValues = value.length > 0 && value.every((item) => hasItemValue(item));
    if (!hasAllValues) {
      throw new Error(`${field.label || field.key} is required`);
    }
    return;
  }

  if (!hasItemValue(value)) {
    throw new Error(`${field.label || field.key} is required`);
  }
}

function validateRequiredPublicAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
  uploadIdSet: Set<string>
): void {
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];

    if (isRepeatStartMarker(field)) {
      const sectionVisible = evaluateCondition(parseObject(field.condition), answers);
      let cursor = index + 1;

      while (cursor < fields.length && !isRepeatEndMarker(fields[cursor])) {
        const sectionField = fields[cursor];
        if (
          sectionVisible &&
          sectionField.type !== 'PAGE_BREAK' &&
          sectionField.type !== 'PARAGRAPH' &&
          sectionField.type !== 'HTML' &&
          sectionField.type !== 'HIDDEN' &&
          evaluateCondition(parseObject(sectionField.condition), answers)
        ) {
          validateRequiredFieldValue(sectionField, answers, uploadIdSet);
        }
        cursor += 1;
      }

      index = cursor;
      continue;
    }

    if (
      field.type === 'PAGE_BREAK' ||
      field.type === 'PARAGRAPH' ||
      field.type === 'HTML' ||
      field.type === 'HIDDEN'
    ) {
      continue;
    }

    if (!evaluateCondition(parseObject(field.condition), answers)) {
      continue;
    }

    validateRequiredFieldValue(field, answers, uploadIdSet);
  }
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

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function getFormResponses(
  formId: string,
  tenantId: string,
  page: number,
  limit: number,
  draftPage: number = 1,
  draftLimit: number = 20,
  query: FormResponsesQueryInput = {}
): Promise<FormResponsesResult> {
  const form = await prisma.form.findFirst({
    where: { id: formId, tenantId, deletedAt: null },
    select: {
      id: true,
      fields: {
        select: {
          key: true,
          type: true,
        },
      },
    },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const activeDraftWhere = {
    formId,
    tenantId,
    expiresAt: {
      gt: new Date(),
    },
  } satisfies Prisma.FormDraftWhereInput;

  const fieldTypeByKey = new Map(form.fields.map((field) => [field.key, field.type]));
  const validSubmissionColumnIds = new Set<string>([
    RESPONSE_COLUMN_SUBMITTED_ID,
    RESPONSE_COLUMN_STATUS_ID,
    RESPONSE_ATTACHMENTS_COLUMN_ID,
    ...form.fields.map((field) => field.key),
  ]);
  const submissionSortBy = query.submissionSortBy && validSubmissionColumnIds.has(query.submissionSortBy)
    ? query.submissionSortBy
    : RESPONSE_COLUMN_SUBMITTED_ID;
  const submissionSortOrder = query.submissionSortOrder === 'asc' ? 'asc' : 'desc';
  const normalizedSubmissionFilters = Object.entries(query.submissionFilters || {})
    .map(([columnId, value]) => [columnId, value.trim().toLowerCase()] as const)
    .filter(([columnId, value]) => validSubmissionColumnIds.has(columnId) && value.length > 0);

  // Max rows to scan in memory for filtered/custom-sorted queries (prevents OOM on large forms)
  const IN_MEMORY_SCAN_LIMIT = 5000;

  const submissionBaseWhere = { formId, tenantId, deletedAt: null } satisfies Prisma.FormSubmissionWhereInput;
  const submissionInclude = { _count: { select: { uploads: true } } } as const;

  // Fast path: no filters and sorting by submit date — use DB-level pagination
  const useDbPagination = normalizedSubmissionFilters.length === 0
    && submissionSortBy === RESPONSE_COLUMN_SUBMITTED_ID;

  let paginatedSubmissions: (FormSubmission & { _count: { uploads: number } })[];
  let total: number;

  if (useDbPagination) {
    const [pagedRows, submissionCount, recentSubmissions, drafts, draftTotal] = await Promise.all([
      prisma.formSubmission.findMany({
        where: submissionBaseWhere,
        include: submissionInclude,
        orderBy: { submittedAt: submissionSortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.formSubmission.count({ where: submissionBaseWhere }),
      prisma.formSubmission.findMany({
        where: {
          ...submissionBaseWhere,
          submittedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
        select: { submittedAt: true },
      }),
      prisma.formDraft.findMany({
        where: activeDraftWhere,
        orderBy: { lastSavedAt: 'desc' },
        skip: (draftPage - 1) * draftLimit,
        take: draftLimit,
        select: {
          id: true,
          code: true,
          answers: true,
          metadata: true,
          expiresAt: true,
          lastSavedAt: true,
          createdAt: true,
          _count: { select: { uploads: true } },
        },
      }),
      prisma.formDraft.count({ where: activeDraftWhere }),
    ]);

    paginatedSubmissions = pagedRows;
    total = submissionCount;

    const submissionIds = paginatedSubmissions.map((s) => s.id);
    const draftIds = drafts.map((d) => d.id);

    const [submissionUploads, draftUploads] = await Promise.all([
      submissionIds.length > 0
        ? prisma.formUpload.findMany({
          where: { formId, tenantId, submissionId: { in: submissionIds } },
          select: { id: true, submissionId: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
        : Promise.resolve([]),
      draftIds.length > 0
        ? prisma.formUpload.findMany({
          where: { formId, tenantId, draftId: { in: draftIds }, submissionId: null },
          select: { id: true, draftId: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
        : Promise.resolve([]),
    ]);

    const submissionAttachmentsById = new Map<string, FormResponseAttachmentListItem[]>();
    for (const upload of submissionUploads) {
      if (!upload.submissionId) continue;
      const list = submissionAttachmentsById.get(upload.submissionId) ?? [];
      list.push({ id: upload.id, fileName: upload.fileName, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes, createdAt: upload.createdAt });
      submissionAttachmentsById.set(upload.submissionId, list);
    }

    const draftAttachmentsById = new Map<string, FormResponseAttachmentListItem[]>();
    for (const upload of draftUploads) {
      if (!upload.draftId) continue;
      const list = draftAttachmentsById.get(upload.draftId) ?? [];
      list.push({ id: upload.id, fileName: upload.fileName, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes, createdAt: upload.createdAt });
      draftAttachmentsById.set(upload.draftId, list);
    }

    const today = new Date();
    const chartMap = new Map<string, number>();
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      chartMap.set(date.toISOString().slice(0, 10), 0);
    }
    for (const row of recentSubmissions) {
      const key = row.submittedAt.toISOString().slice(0, 10);
      chartMap.set(key, (chartMap.get(key) ?? 0) + 1);
    }

    return {
      submissions: paginatedSubmissions.map((submission) => {
        const { _count, ...submissionData } = submission;
        return { ...submissionData, uploadCount: _count.uploads, attachments: submissionAttachmentsById.get(submission.id) ?? [] };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      drafts: drafts.map((draft) => ({
        id: draft.id,
        code: draft.code,
        answers: toAnswerRecord(draft.answers),
        metadata: parseObject(draft.metadata) || {},
        expiresAt: draft.expiresAt,
        lastSavedAt: draft.lastSavedAt,
        createdAt: draft.createdAt,
        uploadCount: draft._count.uploads,
        attachments: draftAttachmentsById.get(draft.id) ?? [],
      })),
      draftTotal,
      draftPage,
      draftLimit,
      draftTotalPages: Math.ceil(draftTotal / draftLimit),
      chart: Array.from(chartMap.entries()).map(([date, responses]) => ({ date, responses })),
    };
  }

  // Slow path: filtered or custom-sorted — load in memory with a scan limit
  const [allSubmissions, recentSubmissions, drafts, draftTotal] = await Promise.all([
    prisma.formSubmission.findMany({
      where: submissionBaseWhere,
      include: submissionInclude,
      take: IN_MEMORY_SCAN_LIMIT,
    }),
    prisma.formSubmission.findMany({
      where: {
        ...submissionBaseWhere,
        submittedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      select: { submittedAt: true },
    }),
    prisma.formDraft.findMany({
      where: activeDraftWhere,
      orderBy: { lastSavedAt: 'desc' },
      skip: (draftPage - 1) * draftLimit,
      take: draftLimit,
      select: {
        id: true,
        code: true,
        answers: true,
        metadata: true,
        expiresAt: true,
        lastSavedAt: true,
        createdAt: true,
        _count: { select: { uploads: true } },
      },
    }),
    prisma.formDraft.count({ where: activeDraftWhere }),
  ]);

  const filteredSubmissions = normalizedSubmissionFilters.length === 0
    ? [...allSubmissions]
    : allSubmissions.filter((submission) => normalizedSubmissionFilters.every(([columnId, value]) => (
      getSubmissionColumnFilterText(submission, fieldTypeByKey, columnId).includes(value)
    )));

  filteredSubmissions.sort((left, right) => (
    compareSubmissionRows(left, right, fieldTypeByKey, submissionSortBy, submissionSortOrder)
  ));

  total = filteredSubmissions.length;
  paginatedSubmissions = filteredSubmissions.slice((page - 1) * limit, page * limit);

  const submissionIds = paginatedSubmissions.map((submission) => submission.id);
  const draftIds = drafts.map((draft) => draft.id);

  const [submissionUploads, draftUploads] = await Promise.all([
    submissionIds.length > 0
      ? prisma.formUpload.findMany({
        where: {
          formId,
          tenantId,
          submissionId: { in: submissionIds },
        },
        select: {
          id: true,
          submissionId: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      : Promise.resolve([]),
    draftIds.length > 0
      ? prisma.formUpload.findMany({
        where: {
          formId,
          tenantId,
          draftId: { in: draftIds },
          submissionId: null,
        },
        select: {
          id: true,
          draftId: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      })
      : Promise.resolve([]),
  ]);

  const submissionAttachmentsById = new Map<string, FormResponseAttachmentListItem[]>();
  for (const upload of submissionUploads) {
    if (!upload.submissionId) continue;
    const list = submissionAttachmentsById.get(upload.submissionId) ?? [];
    list.push({
      id: upload.id,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      createdAt: upload.createdAt,
    });
    submissionAttachmentsById.set(upload.submissionId, list);
  }

  const draftAttachmentsById = new Map<string, FormResponseAttachmentListItem[]>();
  for (const upload of draftUploads) {
    if (!upload.draftId) continue;
    const list = draftAttachmentsById.get(upload.draftId) ?? [];
    list.push({
      id: upload.id,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      createdAt: upload.createdAt,
    });
    draftAttachmentsById.set(upload.draftId, list);
  }

  const today = new Date();
  const chartMap = new Map<string, number>();

  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    chartMap.set(key, 0);
  }

  for (const row of recentSubmissions) {
    const key = row.submittedAt.toISOString().slice(0, 10);
    chartMap.set(key, (chartMap.get(key) ?? 0) + 1);
  }

  return {
    submissions: paginatedSubmissions.map((submission) => {
      const attachments = submissionAttachmentsById.get(submission.id) ?? [];
      const { _count, ...submissionData } = submission;
      return {
        ...submissionData,
        uploadCount: _count.uploads,
        attachments,
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    drafts: drafts.map((draft) => ({
      id: draft.id,
      code: draft.code,
      answers: toAnswerRecord(draft.answers),
      metadata: parseObject(draft.metadata) || {},
      expiresAt: draft.expiresAt,
      lastSavedAt: draft.lastSavedAt,
      createdAt: draft.createdAt,
      uploadCount: draft._count.uploads,
      attachments: draftAttachmentsById.get(draft.id) ?? [],
    })),
    draftTotal,
    draftPage,
    draftLimit,
    draftTotalPages: Math.ceil(draftTotal / draftLimit),
    chart: Array.from(chartMap.entries()).map(([date, responses]) => ({ date, responses })),
  };
}

export async function getFormResponseById(
  formId: string,
  submissionId: string,
  tenantId: string
): Promise<FormResponseDetailResult> {
  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  const uploads = await prisma.formUpload.findMany({
    where: {
      formId,
      submissionId,
      tenantId,
    },
    orderBy: { createdAt: 'asc' },
  });

  return { submission, uploads };
}

export async function getFormDraftById(
  formId: string,
  draftId: string,
  tenantId: string
): Promise<FormDraftDetailResult> {
  const draft = await prisma.formDraft.findFirst({
    where: {
      id: draftId,
      formId,
      tenantId,
    },
    select: {
      id: true,
      code: true,
      answers: true,
      metadata: true,
      expiresAt: true,
      lastSavedAt: true,
      createdAt: true,
      _count: {
        select: {
          uploads: true,
        },
      },
    },
  });

  if (!draft) {
    throw new Error('Draft not found');
  }

  const uploads = await prisma.formUpload.findMany({
    where: {
      formId,
      draftId,
      submissionId: null,
      tenantId,
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    draft: {
      id: draft.id,
      code: draft.code,
      answers: toAnswerRecord(draft.answers),
      metadata: parseObject(draft.metadata) || {},
      expiresAt: draft.expiresAt,
      lastSavedAt: draft.lastSavedAt,
      createdAt: draft.createdAt,
      uploadCount: draft._count.uploads,
      attachments: uploads.map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        createdAt: upload.createdAt,
      })),
    },
    uploads,
  };
}

export async function reconcileFormSubmissionCounts(): Promise<{ reconciled: number }> {
  const result = await prisma.$executeRaw`
    UPDATE forms
    SET submissions_count = (
      SELECT COUNT(*)::int
      FROM form_submissions
      WHERE form_submissions.form_id = forms.id
    )
    WHERE deleted_at IS NULL
  `;
  return { reconciled: result };
}

export async function deleteFormResponse(
  formId: string,
  submissionId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<DeleteFormResponseResult> {
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

  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      respondentName: true,
      respondentEmail: true,
    },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  const uploads = await prisma.formUpload.findMany({
    where: {
      formId,
      submissionId,
      tenantId: params.tenantId,
    },
    select: {
      id: true,
      storageKey: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    if (uploads.length > 0) {
      await tx.formUpload.deleteMany({
        where: {
          id: { in: uploads.map((upload) => upload.id) },
        },
      });
    }

    await tx.formSubmission.update({
      where: { id: submission.id },
      data: { deletedAt: new Date() },
    });

    await tx.form.update({
      where: { id: form.id },
      data: {
        submissionsCount: { decrement: 1 },
      },
    });
  });

  await deleteStoredUploads(uploads, { formId, submissionId });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'DELETE',
    entityType: 'FormSubmission',
    entityId: submission.id,
    entityName: submission.respondentName || submission.respondentEmail || submission.id,
    summary: `Deleted response ${submission.id} from "${form.title}"`,
    reason,
    changeSource: 'MANUAL',
  });

  return {
    id: submission.id,
    deletedUploadCount: uploads.length,
  };
}

export async function deleteFormResponseUpload(
  formId: string,
  submissionId: string,
  uploadId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<DeleteFormResponseUploadResult> {
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

  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      answers: true,
    },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  const upload = await prisma.formUpload.findFirst({
    where: {
      id: uploadId,
      formId,
      submissionId,
      tenantId: params.tenantId,
    },
    select: {
      id: true,
      fieldId: true,
      storageKey: true,
      fileName: true,
    },
  });

  if (!upload) {
    throw new Error('Upload not found');
  }

  const field = upload.fieldId
    ? await prisma.formField.findFirst({
      where: {
        id: upload.fieldId,
        formId,
        tenantId: params.tenantId,
      },
      select: {
        key: true,
      },
    })
    : null;

  const nextAnswers = removeUploadFromAnswerRecord(
    toAnswerRecord(submission.answers),
    upload.id,
    field?.key
  );

  await prisma.$transaction(async (tx) => {
    await tx.formSubmission.update({
      where: { id: submission.id },
      data: {
        answers: nextAnswers as Prisma.InputJsonValue,
      },
    });

    await tx.formUpload.delete({
      where: { id: upload.id },
    });
  });

  await deleteStoredUploads([{ id: upload.id, storageKey: upload.storageKey }], { formId, submissionId });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'DELETE',
    entityType: 'FormUpload',
    entityId: upload.id,
    entityName: upload.fileName,
    summary: `Deleted attachment "${upload.fileName}" from response ${submission.id} for "${form.title}"`,
    reason,
    changeSource: 'MANUAL',
  });

  return {
    id: upload.id,
    submissionId: submission.id,
  };
}

export async function listRecentFormSubmissions(
  tenantId: string,
  limit: number = 10
): Promise<RecentFormSubmissionItem[]> {
  const take = Math.min(50, Math.max(1, limit));

  const submissions = await prisma.formSubmission.findMany({
    where: {
      tenantId,
      deletedAt: null,
      form: {
        deletedAt: null,
      },
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
        },
      },
    },
    orderBy: {
      submittedAt: 'desc',
    },
    take,
  });

  return submissions.map((submission) => ({
    id: submission.id,
    formId: submission.formId,
    formTitle: submission.form.title,
    formSlug: submission.form.slug,
    formStatus: submission.form.status,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
  }));
}

export async function getPublicFormBySlug(slug: string): Promise<PublicFormDefinition | null> {
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
      tenant: {
        select: { logoUrl: true, name: true },
      },
    },
  });

  if (!form) {
    return null;
  }

  incrementViewCount(form.id);

  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    settings: buildPublicFormSettings(form.settings),
    fields: form.fields,
    tenantLogoUrl: form.tenant?.logoUrl ?? null,
    tenantName: form.tenant?.name ?? null,
  };
}

export async function createPublicUpload(
  slug: string,
  fieldKey: string,
  file: File
): Promise<FormUpload> {
  const form = await prisma.form.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
      deletedAt: null,
    },
    include: {
      fields: {
        where: { key: fieldKey, type: 'FILE_UPLOAD' },
        take: 1,
      },
    },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const field = form.fields[0];
  if (!field) {
    throw new Error('Upload field not found');
  }

  const validation = parseObject(field.validation);
  const maxFileSizeMb = typeof validation?.maxFileSizeMb === 'number' ? validation.maxFileSizeMb : 50;
  const allowedMimeTypes = Array.isArray(validation?.allowedMimeTypes)
    ? validation.allowedMimeTypes.filter((v): v is string => typeof v === 'string')
    : [];

  const maxBytes = maxFileSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File exceeds ${maxFileSizeMb} MB limit`);
  }

  const extension = StorageKeys.getExtension(file.name, file.type);
  const uploadId = randomUUID();
  const storageKey = `${form.tenantId}/forms/${form.id}/uploads/${uploadId}${extension}`;
  const content = Buffer.from(await file.arrayBuffer());

  const detected = await fromBuffer(content);
  const actualMime = detected?.mime || file.type || 'application/octet-stream';

  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(actualMime)) {
    throw new Error('File type is not allowed');
  }

  await storage.upload(storageKey, content, {
    contentType: actualMime,
    metadata: {
      formId: form.id,
      fieldId: field.id,
      fieldKey: field.key,
      uploadId,
      originalName: file.name,
    },
  });

  return prisma.formUpload.create({
    data: {
      id: uploadId,
      tenantId: form.tenantId,
      formId: form.id,
      fieldId: field.id,
      storageKey,
      fileName: file.name,
      originalFileName: file.name,
      mimeType: actualMime,
      sizeBytes: file.size,
    },
  });
}

export async function createPublicSubmission(
  slug: string,
  input: PublicSubmissionInput
): Promise<FormSubmission> {
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

  if ((input.draftCode && !input.accessToken) || (!input.draftCode && input.accessToken)) {
    throw new Error('Draft access is incomplete');
  }

  const tenantTimeZone = await getTenantTimeZone(form.tenantId);
  const answers = applyDefaultTodayAnswers(form.fields, toAnswerRecord(input.answers));
  const uploadIds = normalizeUploadIds(input.uploadIds);
  const uploadIdSet = new Set(uploadIds);

  validateRequiredPublicAnswers(form.fields, answers, uploadIdSet);
  validatePublicAnswerConstraints(form.fields, answers);

  const sanitizedAnswers = sanitizePublicAnswers(form.fields, answers, uploadIdSet);
  const fieldById = new Map(form.fields.map((field) => [field.id, { key: field.key, validation: field.validation }]));
  const renamedUploadsById = new Map<string, string>();

  const activeDraft = input.draftCode && input.accessToken
    ? await loadDraftByAccess({
      formId: form.id,
      tenantId: form.tenantId,
      draftCode: input.draftCode,
      accessToken: input.accessToken,
    })
    : null;

  if (input.draftCode && input.accessToken && !activeDraft) {
    throw new Error('Draft not found');
  }

  const submissionResult = await prisma.$transaction(async (tx) => {
    let pendingUploads: Array<Pick<FormUpload, 'id' | 'fieldId' | 'fileName' | 'mimeType'>> = [];

    if (uploadIds.length > 0) {
      pendingUploads = await tx.formUpload.findMany({
        where: {
          id: { in: uploadIds },
          formId: form.id,
          tenantId: form.tenantId,
          submissionId: null,
          ...(activeDraft
            ? {
              OR: [
                { draftId: null },
                { draftId: activeDraft.id },
              ],
            }
            : { draftId: null }),
        },
        select: {
          id: true,
          fieldId: true,
          fileName: true,
          mimeType: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (pendingUploads.length !== uploadIds.length) {
        throw new Error('Some uploaded files are invalid or already used');
      }
    }

    const obsoleteDraftUploads = activeDraft
      ? await tx.formUpload.findMany({
        where: {
          formId: form.id,
          tenantId: form.tenantId,
          draftId: activeDraft.id,
          submissionId: null,
          ...(uploadIds.length > 0 ? { id: { notIn: uploadIds } } : {}),
        },
        select: {
          storageKey: true,
        },
      })
      : [];

    const submission = await tx.formSubmission.create({
      data: {
        formId: form.id,
        tenantId: form.tenantId,
        status: FormSubmissionStatus.COMPLETED,
        respondentName: input.respondentName?.trim() || null,
        respondentEmail: input.respondentEmail?.trim() || null,
        answers: sanitizedAnswers as Prisma.InputJsonValue,
        metadata: toJsonInput(input.metadata ?? null),
      },
    });

    if (pendingUploads.length > 0) {
      await tx.formUpload.updateMany({
        where: {
          id: { in: pendingUploads.map((upload) => upload.id) },
          formId: form.id,
          tenantId: form.tenantId,
          submissionId: null,
        },
        data: {
          submissionId: submission.id,
          draftId: null,
        },
      });

      const resolvedUploadFileNames = resolveSubmissionUploadFileNames({
        formTitle: form.title,
        formSlug: form.slug,
        submissionId: submission.id,
        submittedAt: submission.submittedAt,
        timeZone: tenantTimeZone,
        answers: sanitizedAnswers,
        uploads: pendingUploads,
        fieldById,
      });

      for (const [uploadId, fileName] of resolvedUploadFileNames.entries()) {
        renamedUploadsById.set(uploadId, fileName);
      }

      for (const upload of pendingUploads) {
        const nextFileName = resolvedUploadFileNames.get(upload.id);
        if (!nextFileName || nextFileName === upload.fileName) continue;

        await tx.formUpload.update({
          where: { id: upload.id },
          data: { fileName: nextFileName },
        });
      }
    }

    await tx.form.update({
      where: { id: form.id },
      data: {
        submissionsCount: { increment: 1 },
      },
    });

    if (activeDraft) {
      await tx.formDraft.delete({
        where: { id: activeDraft.id },
      });
    }

    return {
      submission,
      obsoleteDraftUploads,
    };
  });

  if (submissionResult.obsoleteDraftUploads.length > 0) {
    await Promise.allSettled(
      submissionResult.obsoleteDraftUploads.map((upload) => storage.delete(upload.storageKey))
    );
  }

  const submissionUploads = await prisma.formUpload.findMany({
    where: {
      formId: form.id,
      submissionId: submissionResult.submission.id,
      tenantId: form.tenantId,
    },
    orderBy: { createdAt: 'asc' },
  });
  const emailUploads = submissionUploads.map((upload) => {
    const renamedFileName = renamedUploadsById.get(upload.id);
    if (!renamedFileName || renamedFileName === upload.fileName) return upload;
    return {
      ...upload,
      fileName: renamedFileName,
    };
  });
  const aiSettings = parseFormAiSettings(form.settings);

  if (aiSettings.enabled) {
    const { queueFormSubmissionAiReviewInternal, triggerQueuedFormAiReviewProcessing } =
      await import('./form-ai.task.service');

    const queuedReviewResult = await queueFormSubmissionAiReviewInternal({
      formId: form.id,
      submissionId: submissionResult.submission.id,
      tenantId: form.tenantId,
      emailNotificationPending: true,
    });

    const queuedMetadata = withSubmissionAiReview(
      submissionResult.submission.metadata,
      queuedReviewResult.aiReview
    );
    const queuedSubmission: FormSubmission = {
      ...submissionResult.submission,
      metadata: queuedMetadata as Prisma.JsonObject,
    };

    await triggerQueuedFormAiReviewProcessing([submissionResult.submission.id]);

    return queuedSubmission;
  }

  await sendCompletionNotificationEmailInternal({
    form,
    submission: submissionResult.submission,
    uploads: emailUploads,
    tenantTimeZone,
  });

  return submissionResult.submission;
}

export async function getSubmissionUploads(
  formId: string,
  submissionId: string,
  tenantId: string
): Promise<FormUpload[]> {
  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId,
      tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  return prisma.formUpload.findMany({
    where: {
      formId,
      submissionId,
      tenantId,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function exportFormResponsesCsv(
  formId: string,
  tenantId: string
): Promise<{ csv: string; fileName: string }> {
  const form = await prisma.form.findFirst({
    where: { id: formId, tenantId, deletedAt: null },
    include: { fields: { orderBy: { position: 'asc' } } },
  });

  if (!form) throw new Error('Form not found');

  const submissions = await prisma.formSubmission.findMany({
    where: { formId, tenantId, deletedAt: null },
    orderBy: { submittedAt: 'desc' },
  });

  const displayFields = form.fields.filter(
    (f) => !['PAGE_BREAK', 'PARAGRAPH', 'HTML'].includes(f.type)
  );
  const fieldKeys = displayFields.map((f) => f.key);
  const fieldLabels = displayFields.map((f) => f.label || f.key);

  const header = ['submission_id', 'submitted_at', 'respondent_name', 'respondent_email', ...fieldLabels];

  const safeCell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const choiceText = formatChoiceAnswer(value);
    if (choiceText) return choiceText;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const rows = submissions.map((sub) => {
    const submissionAnswers = (sub.answers || {}) as Record<string, unknown>;
    return [
      sub.id,
      new Date(sub.submittedAt).toISOString(),
      sub.respondentName || '',
      sub.respondentEmail || '',
      ...fieldKeys.map((key) => safeCell(submissionAnswers[key])),
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const fileName = `${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'form'}-responses.csv`;

  return { csv, fileName };
}

export async function getSubmissionUploadById(
  formId: string,
  submissionId: string,
  uploadId: string,
  tenantId: string
): Promise<FormUpload | null> {
  return prisma.formUpload.findFirst({
    where: {
      id: uploadId,
      formId,
      submissionId,
      tenantId,
    },
  });
}

export async function getDraftUploadById(
  formId: string,
  draftId: string,
  uploadId: string,
  tenantId: string
): Promise<FormUpload | null> {
  return prisma.formUpload.findFirst({
    where: {
      id: uploadId,
      formId,
      draftId,
      submissionId: null,
      tenantId,
    },
  });
}

export async function cleanupOrphanedUploads(maxAgeHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const orphans = await prisma.formUpload.findMany({
    where: {
      draftId: null,
      submissionId: null,
      createdAt: { lt: cutoff },
    },
    select: { id: true, storageKey: true },
  });

  if (orphans.length === 0) return 0;

  await Promise.allSettled(
    orphans.map((orphan) => storage.delete(orphan.storageKey))
  );

  await prisma.formUpload.deleteMany({
    where: {
      id: { in: orphans.map((o) => o.id) },
      submissionId: null,
    },
  });

  return orphans.length;
}
