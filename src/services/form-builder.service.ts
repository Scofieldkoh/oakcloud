import { randomBytes, randomUUID } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  FormFieldType,
  FormStatus,
  Prisma,
  FormSubmissionStatus,
  type Form,
  type FormField,
  type FormSubmission,
  type FormUpload,
} from '@/generated/prisma';
import { fromBuffer } from 'file-type';
import { createAuditLog } from '@/lib/audit';
import { normalizeKey, parseObject, isEmptyValue, evaluateCondition, type PublicFormField, type PublicFormDefinition } from '@/lib/form-utils';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import { getAppBaseUrl, sendEmail } from '@/lib/email';
import type { TenantAwareParams } from '@/lib/types';
import type {
  CreateFormInput,
  FormFieldInput,
  ListFormsQueryInput,
  PublicSubmissionInput,
  UpdateFormInput,
} from '@/lib/validations/form-builder';

export interface FormListItem extends Form {
  fieldCount: number;
  responseCount: number;
  conversionRate: number;
}

export interface FormDetail extends Form {
  fields: FormField[];
}

export interface FormListResult {
  forms: FormListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FormResponsesResult {
  submissions: FormSubmission[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  chart: Array<{ date: string; responses: number }>;
}

export interface FormResponseDetailResult {
  submission: FormSubmission;
  uploads: FormUpload[];
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

export type { PublicFormField, PublicFormDefinition };

const MAX_SLUG_ATTEMPTS = 10;
const PDF_PAGE_WIDTH = 595.28; // A4 width in points
const PDF_PAGE_HEIGHT = 841.89; // A4 height in points
const PDF_MARGIN_X = 42;
const PDF_MARGIN_Y = 44;

function toAnswerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toUploadIds(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function safePdfText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
}

function wrapPdfText(
  text: string,
  font: { widthOfTextAtSize: (text: string, size: number) => number },
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = safePdfText(text).split('\n');

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }

      let chunk = '';
      for (const char of word) {
        const chunkNext = `${chunk}${char}`;
        if (font.widthOfTextAtSize(chunkNext, size) <= maxWidth) {
          chunk = chunkNext;
          continue;
        }
        if (chunk) {
          lines.push(chunk);
        }
        chunk = char;
      }
      current = chunk;
    }

    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function formatResponseFieldValue(
  field: FormField,
  value: unknown,
  uploadsById: Map<string, FormUpload>
): string {
  if (value === null || value === undefined || value === '') {
    if (field.type === 'PARAGRAPH') {
      if (field.inputType === 'info_image') {
        return field.placeholder?.trim() ? `Image: ${field.placeholder.trim()}` : 'Image block';
      }
      if (field.inputType === 'info_url') {
        const link = field.placeholder?.trim();
        const linkLabel = field.subtext?.trim();
        if (link) return linkLabel ? `${linkLabel} (${link})` : link;
        return 'URL block';
      }
      return field.subtext?.trim() || field.label?.trim() || '-';
    }

    return '-';
  }

  if (field.type === 'FILE_UPLOAD') {
    const ids = toUploadIds(value);
    if (ids.length === 0) return '-';
    return ids
      .map((id) => uploadsById.get(id)?.fileName || id)
      .join(', ');
  }

  if (field.type === 'SIGNATURE') {
    if (typeof value === 'string' && value.trim().length > 0) return 'Signature captured';
    return '-';
  }

  if (field.type === 'MULTIPLE_CHOICE' && Array.isArray(value)) {
    const text = value
      .map((item) => String(item))
      .join(', ')
      .trim();
    return text || '-';
  }

  if (field.type === 'HTML') {
    const html = field.subtext || '';
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plainText || '-';
  }

  if (Array.isArray(value)) {
    const text = value.map((item) => String(item)).join(', ').trim();
    return text || '-';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '-';
    }
  }

  const text = String(value).trim();
  return text || '-';
}

async function buildSubmissionPdfBuffer(input: {
  formTitle: string;
  submittedAt: Date;
  respondentName: string | null;
  respondentEmail: string | null;
  status: FormSubmissionStatus;
  fields: FormField[];
  answers: Record<string, unknown>;
  uploads: FormUpload[];
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN_Y;
  const contentWidth = PDF_PAGE_WIDTH - PDF_MARGIN_X * 2;
  const baseLineHeight = 4;

  function ensureSpace(points: number): void {
    if (y - points >= PDF_MARGIN_Y) return;
    page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
    y = PDF_PAGE_HEIGHT - PDF_MARGIN_Y;
  }

  function drawWrapped(
    text: string,
    options: {
      size: number;
      bold?: boolean;
      indent?: number;
      color?: [number, number, number];
      spacingAfter?: number;
      allowEmpty?: boolean;
    }
  ): void {
    const indent = options.indent || 0;
    const lines = wrapPdfText(text, options.bold ? boldFont : regularFont, options.size, contentWidth - indent);
    const font = options.bold ? boldFont : regularFont;
    const [r, g, b] = options.color || [0.13, 0.16, 0.2];
    const lineHeight = options.size + baseLineHeight;
    const drawLines = options.allowEmpty ? lines : lines.filter((line) => line.length > 0);

    for (const line of drawLines) {
      ensureSpace(lineHeight);
      page.drawText(safePdfText(line || ' '), {
        x: PDF_MARGIN_X + indent,
        y: y - options.size,
        size: options.size,
        font,
        color: rgb(r, g, b),
      });
      y -= lineHeight;
    }

    y -= options.spacingAfter || 0;
  }

  const uploadsById = new Map(input.uploads.map((upload) => [upload.id, upload]));

  drawWrapped(input.formTitle || 'Form response', {
    size: 18,
    bold: true,
    color: [0.08, 0.16, 0.28],
    spacingAfter: 4,
  });
  drawWrapped(
    `Submitted: ${new Date(input.submittedAt).toLocaleString('en-SG')} | Status: ${input.status}`,
    { size: 10, color: [0.35, 0.39, 0.46], spacingAfter: 2 }
  );
  drawWrapped(`Respondent: ${input.respondentName || '-'}`, { size: 10, color: [0.35, 0.39, 0.46] });
  drawWrapped(`Email: ${input.respondentEmail || '-'}`, { size: 10, color: [0.35, 0.39, 0.46], spacingAfter: 8 });

  const pages: FormField[][] = [[]];
  for (const field of input.fields) {
    if (field.type === 'PAGE_BREAK') {
      pages.push([]);
      continue;
    }
    if (field.type === 'HIDDEN') continue;
    if (!evaluateCondition(field.condition, input.answers)) continue;
    pages[pages.length - 1].push(field);
  }

  const visiblePages = pages.filter((fields) => fields.length > 0);

  for (let pageIndex = 0; pageIndex < visiblePages.length; pageIndex += 1) {
    const fields = visiblePages[pageIndex];

    if (visiblePages.length > 1) {
      drawWrapped(`Page ${pageIndex + 1}`, {
        size: 12,
        bold: true,
        color: [0.1, 0.2, 0.36],
        spacingAfter: 2,
      });
    }

    for (const field of fields) {
      const label = field.label?.trim() || field.key;
      const value = formatResponseFieldValue(field, input.answers[field.key], uploadsById);
      drawWrapped(label, { size: 10, bold: true, spacingAfter: 1 });
      drawWrapped(value, { size: 10, indent: 8, spacingAfter: 5, allowEmpty: true });
    }
  }

  return Buffer.from(await pdf.save());
}

function toPdfFileName(formTitle: string, submissionId: string): string {
  const safeTitle = formTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form-response';
  return `${safeTitle}-${submissionId.slice(0, 8)}.pdf`;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}


function makeUniqueKey(base: string, used: Set<string>): string {
  let candidate = base;
  let count = 1;

  while (used.has(candidate)) {
    count += 1;
    candidate = `${base}_${count}`;
  }

  used.add(candidate);
  return candidate;
}

function deriveKey(field: FormFieldInput): string {
  if (field.key?.trim()) {
    return normalizeKey(field.key);
  }

  if (field.label?.trim()) {
    return normalizeKey(field.label);
  }

  return normalizeKey(field.type.toLowerCase());
}

function normalizeFieldsForPersistence(fields: FormFieldInput[]): Array<{
  type: FormFieldType;
  label: string | null;
  key: string;
  placeholder: string | null;
  subtext: string | null;
  helpText: string | null;
  inputType: string | null;
  options: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  validation: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  condition: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  isRequired: boolean;
  hideLabel: boolean;
  isReadOnly: boolean;
  layoutWidth: number;
  position: number;
}> {
  const usedKeys = new Set<string>();

  return [...fields]
    .sort((a, b) => a.position - b.position)
    .map((field, idx) => {
      const baseKey = deriveKey(field);
      const key = makeUniqueKey(baseKey, usedKeys);

      return {
        type: field.type as FormFieldType,
        label: field.label?.trim() || null,
        key,
        placeholder: field.placeholder?.trim() || null,
        subtext: field.subtext?.trim() || null,
        helpText: field.helpText?.trim() || null,
        inputType: field.inputType || null,
        options: toJsonInput(field.options ?? null),
        validation: toJsonInput(field.validation ?? null),
        condition: toJsonInput(field.condition ?? null),
        isRequired: field.isRequired ?? false,
        hideLabel: field.hideLabel ?? false,
        isReadOnly: field.isReadOnly ?? false,
        layoutWidth: field.layoutWidth ?? 100,
        position: idx,
      };
    });
}

async function generateUniqueFormSlug(): Promise<string> {
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i += 1) {
    const slug = randomBytes(8).toString('hex');
    const existing = await prisma.form.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) {
      return slug;
    }
  }

  throw new Error('Failed to generate unique form slug');
}

export async function createForm(
  data: CreateFormInput,
  params: TenantAwareParams
): Promise<Form> {
  const slug = await generateUniqueFormSlug();

  const form = await prisma.form.create({
    data: {
      tenantId: params.tenantId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      status: data.status as FormStatus,
      tags: data.tags ?? [],
      slug,
      createdById: params.userId,
      updatedById: params.userId,
      settings: Prisma.JsonNull,
    },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'CREATE',
    entityType: 'Form',
    entityId: form.id,
    entityName: form.title,
    summary: `Created form "${form.title}"`,
    changeSource: 'MANUAL',
  });

  return form;
}

export async function listForms(
  input: ListFormsQueryInput,
  params: TenantAwareParams
): Promise<FormListResult> {
  const where: Prisma.FormWhereInput = {
    tenantId: params.tenantId,
    deletedAt: null,
    ...(input.status ? { status: input.status as FormStatus } : {}),
  };

  if (input.query?.trim()) {
    where.OR = [
      { title: { contains: input.query.trim(), mode: 'insensitive' } },
      { description: { contains: input.query.trim(), mode: 'insensitive' } },
      { tags: { has: input.query.trim() } },
    ];
  }

  const [forms, total] = await Promise.all([
    prisma.form.findMany({
      where,
      include: {
        _count: {
          select: {
            fields: true,
            submissions: true,
          },
        },
      },
      orderBy: { [input.sortBy]: input.sortOrder },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.form.count({ where }),
  ]);

  return {
    forms: forms.map((form) => ({
      ...form,
      fieldCount: form._count.fields,
      responseCount: form._count.submissions,
      conversionRate: form.viewsCount > 0 ? Number(((form.submissionsCount / form.viewsCount) * 100).toFixed(1)) : 0,
    })),
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.ceil(total / input.limit),
  };
}

export async function getFormById(formId: string, tenantId: string): Promise<FormDetail | null> {
  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      tenantId,
      deletedAt: null,
    },
    include: {
      fields: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!form) {
    return null;
  }

  return form;
}

export async function updateForm(
  formId: string,
  data: UpdateFormInput,
  params: TenantAwareParams,
  reason?: string
): Promise<Form> {
  const existing = await prisma.form.findFirst({
    where: { id: formId, tenantId: params.tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Form not found');
  }

  const nextSlug = data.slug !== undefined ? data.slug.trim() : undefined;
  if (nextSlug !== undefined && nextSlug.length === 0) {
    throw new Error('Public URL segment is required');
  }

  if (nextSlug !== undefined && nextSlug !== existing.slug) {
    const conflict = await prisma.form.findUnique({
      where: { slug: nextSlug },
      select: { id: true },
    });

    if (conflict && conflict.id !== existing.id) {
      throw new Error('Public URL segment is already in use');
    }
  }

  const updated = await prisma.form.update({
    where: { id: formId },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
      ...(data.status !== undefined ? { status: data.status as FormStatus } : {}),
      ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
      ...(data.settings !== undefined ? { settings: toJsonInput(data.settings) } : {}),
      updatedById: params.userId,
    },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'Form',
    entityId: updated.id,
    entityName: updated.title,
    summary: `Updated form "${updated.title}"`,
    reason,
    changeSource: 'MANUAL',
  });

  return updated;
}

export async function saveFormFields(
  formId: string,
  fields: FormFieldInput[],
  params: TenantAwareParams,
  reason?: string
): Promise<FormField[]> {
  const existing = await prisma.form.findFirst({
    where: { id: formId, tenantId: params.tenantId, deletedAt: null },
    select: { id: true, title: true },
  });

  if (!existing) {
    throw new Error('Form not found');
  }

  const normalizedFields = normalizeFieldsForPersistence(fields);

  const savedFields = await prisma.$transaction(async (tx) => {
    await tx.formField.deleteMany({ where: { formId } });

    if (normalizedFields.length > 0) {
      await tx.formField.createMany({
        data: normalizedFields.map((field) => ({
          formId,
          tenantId: params.tenantId,
          type: field.type,
          label: field.label,
          key: field.key,
          placeholder: field.placeholder,
          subtext: field.subtext,
          helpText: field.helpText,
          inputType: field.inputType,
          options: field.options,
          validation: field.validation,
          condition: field.condition,
          isRequired: field.isRequired,
          hideLabel: field.hideLabel,
          isReadOnly: field.isReadOnly,
          layoutWidth: field.layoutWidth,
          position: field.position,
        })),
      });
    }

    return tx.formField.findMany({
      where: { formId },
      orderBy: { position: 'asc' },
    });
  });

  await prisma.form.update({
    where: { id: formId },
    data: { updatedById: params.userId },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'Form',
    entityId: formId,
    entityName: existing.title,
    summary: `Updated fields for form "${existing.title}"`,
    reason,
    metadata: { fieldCount: savedFields.length },
    changeSource: 'MANUAL',
  });

  return savedFields;
}

export async function duplicateForm(
  formId: string,
  params: TenantAwareParams,
  overrideTitle?: string
): Promise<FormDetail> {
  const source = await prisma.form.findFirst({
    where: { id: formId, tenantId: params.tenantId, deletedAt: null },
    include: {
      fields: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!source) {
    throw new Error('Form not found');
  }

  const slug = await generateUniqueFormSlug();
  const title = overrideTitle?.trim() || `${source.title} (Copy)`;

  const duplicated = await prisma.$transaction(async (tx) => {
    const form = await tx.form.create({
      data: {
        tenantId: params.tenantId,
        title,
        description: source.description,
        slug,
        status: 'DRAFT',
        tags: source.tags,
        settings: source.settings ?? Prisma.JsonNull,
        createdById: params.userId,
        updatedById: params.userId,
      },
    });

    if (source.fields.length > 0) {
      await tx.formField.createMany({
        data: source.fields.map((field) => ({
          formId: form.id,
          tenantId: params.tenantId,
          type: field.type,
          label: field.label,
          key: field.key,
          placeholder: field.placeholder,
          subtext: field.subtext,
          helpText: field.helpText,
          inputType: field.inputType,
          options: field.options ?? Prisma.JsonNull,
          validation: field.validation ?? Prisma.JsonNull,
          condition: field.condition ?? Prisma.JsonNull,
          isRequired: field.isRequired,
          hideLabel: field.hideLabel,
          isReadOnly: field.isReadOnly,
          layoutWidth: field.layoutWidth,
          position: field.position,
        })),
      });
    }

    const fields = await tx.formField.findMany({
      where: { formId: form.id },
      orderBy: { position: 'asc' },
    });

    return { ...form, fields };
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'CREATE',
    entityType: 'Form',
    entityId: duplicated.id,
    entityName: duplicated.title,
    summary: `Duplicated form "${source.title}"`,
    metadata: { sourceFormId: source.id },
    changeSource: 'MANUAL',
  });

  return duplicated;
}

export async function deleteForm(
  formId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<Form> {
  const existing = await prisma.form.findFirst({
    where: { id: formId, tenantId: params.tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Form not found');
  }

  const deleted = await prisma.form.update({
    where: { id: formId },
    data: {
      deletedAt: new Date(),
      updatedById: params.userId,
      status: 'ARCHIVED',
    },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'DELETE',
    entityType: 'Form',
    entityId: formId,
    entityName: existing.title,
    summary: `Archived form "${existing.title}"`,
    reason,
    changeSource: 'MANUAL',
  });

  return deleted;
}

export async function getFormResponses(
  formId: string,
  tenantId: string,
  page: number,
  limit: number
): Promise<FormResponsesResult> {
  const form = await prisma.form.findFirst({
    where: { id: formId, tenantId, deletedAt: null },
    select: { id: true },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const [submissions, total, recentSubmissions] = await Promise.all([
    prisma.formSubmission.findMany({
      where: { formId },
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.formSubmission.count({ where: { formId } }),
    prisma.formSubmission.findMany({
      where: {
        formId,
        submittedAt: {
          gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
      },
      select: { submittedAt: true },
    }),
  ]);

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
    submissions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
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

export async function exportFormResponsePdf(
  formId: string,
  submissionId: string,
  tenantId: string
): Promise<{ buffer: Buffer; fileName: string }> {
  const form = await prisma.form.findFirst({
    where: { id: formId, tenantId, deletedAt: null },
    include: {
      fields: {
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!form) {
    throw new Error('Form not found');
  }

  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId,
      tenantId,
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

  const buffer = await buildSubmissionPdfBuffer({
    formTitle: form.title,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
    fields: form.fields,
    answers: toAnswerRecord(submission.answers),
    uploads,
  });

  return {
    buffer,
    fileName: toPdfFileName(form.title, submission.id),
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
    },
  });

  if (!form) {
    return null;
  }

  await prisma.form.update({
    where: { id: form.id },
    data: { viewsCount: { increment: 1 } },
  });

  return {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    settings: form.settings,
    fields: form.fields,
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

  const answers = input.answers as Record<string, unknown>;

  for (const field of form.fields) {
    if (
      field.type === 'PAGE_BREAK' ||
      field.type === 'PARAGRAPH' ||
      field.type === 'HTML' ||
      field.type === 'HIDDEN'
    ) {
      continue;
    }

    const condition = parseObject(field.condition);
    const visible = evaluateCondition(condition, answers);

    if (!visible) {
      continue;
    }

    if (field.isRequired) {
      const value = answers[field.key];
      if (isEmptyValue(value)) {
        throw new Error(`${field.label || field.key} is required`);
      }
    }
  }

  const validKeys = new Set(form.fields.map((f) => f.key));
  const sanitizedAnswers: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (!validKeys.has(key)) continue;

    const field = form.fields.find((f) => f.key === key);
    if (!field) continue;

    switch (field.type) {
      case 'SHORT_TEXT':
      case 'LONG_TEXT':
      case 'DROPDOWN':
      case 'SINGLE_CHOICE':
        if (typeof value === 'string') {
          sanitizedAnswers[key] = value.slice(0, 10_000);
        }
        break;
      case 'MULTIPLE_CHOICE':
        if (Array.isArray(value)) {
          sanitizedAnswers[key] = value
            .filter((v): v is string => typeof v === 'string')
            .slice(0, 100)
            .map((v) => v.slice(0, 10_000));
        }
        break;
      case 'FILE_UPLOAD':
      case 'SIGNATURE':
        if (typeof value === 'string') {
          sanitizedAnswers[key] = value.slice(0, 500_000);
        } else if (Array.isArray(value)) {
          sanitizedAnswers[key] = value
            .filter((v): v is string => typeof v === 'string')
            .slice(0, 20);
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

  const uploadIds = [...new Set(input.uploadIds || [])];

  return prisma.$transaction(async (tx) => {
    if (uploadIds.length > 0) {
      const validUploads = await tx.formUpload.findMany({
        where: {
          id: { in: uploadIds },
          formId: form.id,
          submissionId: null,
        },
        select: { id: true },
      });

      if (validUploads.length !== uploadIds.length) {
        throw new Error('Some uploaded files are invalid or already used');
      }
    }

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

    if (uploadIds.length > 0) {
      await tx.formUpload.updateMany({
        where: {
          id: { in: uploadIds },
          formId: form.id,
          submissionId: null,
        },
        data: {
          submissionId: submission.id,
        },
      });
    }

    await tx.form.update({
      where: { id: form.id },
      data: {
        submissionsCount: { increment: 1 },
      },
    });

    return submission;
  });
}

async function getPublishedFormSubmissionContext(slug: string, submissionId: string): Promise<{
  form: Form & { fields: FormField[] };
  submission: FormSubmission;
  uploads: FormUpload[];
}> {
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

  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId: form.id,
      tenantId: form.tenantId,
    },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  const uploads = await prisma.formUpload.findMany({
    where: {
      formId: form.id,
      submissionId: submission.id,
      tenantId: form.tenantId,
    },
    orderBy: { createdAt: 'asc' },
  });

  return { form, submission, uploads };
}

export async function exportPublicFormResponsePdf(
  slug: string,
  submissionId: string
): Promise<{ buffer: Buffer; fileName: string }> {
  const { form, submission, uploads } = await getPublishedFormSubmissionContext(slug, submissionId);

  const buffer = await buildSubmissionPdfBuffer({
    formTitle: form.title,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
    fields: form.fields,
    answers: toAnswerRecord(submission.answers),
    uploads,
  });

  return {
    buffer,
    fileName: toPdfFileName(form.title, submission.id),
  };
}

export async function emailPublicFormResponsePdfLink(
  slug: string,
  submissionId: string,
  recipientEmail: string,
  downloadToken: string
): Promise<void> {
  const { form, submission } = await getPublishedFormSubmissionContext(slug, submissionId);

  const email = recipientEmail.trim().toLowerCase();
  const downloadUrl = `${getAppBaseUrl()}/api/forms/public/${encodeURIComponent(slug)}/submissions/${encodeURIComponent(submission.id)}/pdf?token=${encodeURIComponent(downloadToken)}`;
  const submissionDate = new Date(submission.submittedAt).toLocaleString('en-SG');
  const safeFormTitle = form.title.replace(/[<>&]/g, (match) => (
    match === '<' ? '&lt;' : match === '>' ? '&gt;' : '&amp;'
  ));

  const subject = `Form response PDF: ${form.title}`;
  const html = `
    <p>Hello,</p>
    <p>Your response PDF for <strong>${safeFormTitle}</strong> is ready.</p>
    <p>Submitted on: ${submissionDate}</p>
    <p><a href="${downloadUrl}">Download response PDF</a></p>
    <p>If you did not request this email, you can ignore it.</p>
  `;

  const result = await sendEmail({
    to: email,
    subject,
    html,
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to send email');
  }
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
    where: { formId, tenantId },
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
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const rows = submissions.map((sub) => {
    const answers = (sub.answers || {}) as Record<string, unknown>;
    return [
      sub.id,
      new Date(sub.submittedAt).toISOString(),
      sub.respondentName || '',
      sub.respondentEmail || '',
      ...fieldKeys.map((key) => safeCell(answers[key])),
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

export async function cleanupOrphanedUploads(maxAgeHours: number = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const orphans = await prisma.formUpload.findMany({
    where: {
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
