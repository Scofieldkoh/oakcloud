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
import {
  normalizeKey,
  parseObject,
  formatChoiceAnswer,
  isEmptyValue,
  evaluateCondition,
  parseFormFileNameSettings,
  parseFormNotificationSettings,
  type PublicFormField,
  type PublicFormDefinition,
} from '@/lib/form-utils';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import { getAppBaseUrl, sendEmail, type EmailAttachment } from '@/lib/email';
import { createLogger } from '@/lib/logger';
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
const MAX_NOTIFICATION_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_NOTIFICATION_UPLOAD_ATTACHMENTS = 20;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_NAME_TEMPLATE_PATTERN = /\[([a-zA-Z0-9_]+)\]/g;
const FILE_NAME_INVALID_CHARS_PATTERN = /[<>"/\\|?*\u0000-\u001F]+/g;
const DATA_IMAGE_URI_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const FILE_NAME_FALLBACK = 'file';
const FILE_NAME_MAX_LENGTH = 220;
const DEFAULT_TENANT_TIME_ZONE = 'Asia/Singapore';
const log = createLogger('form-builder');

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

function stripHtmlForPdf(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
      const textContent = stripHtmlForPdf(field.subtext || '');
      return textContent || field.label?.trim() || '-';
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

  if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') {
    const text = formatChoiceAnswer(value);
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

type RepeatSectionPdfConfig = {
  id: string;
  minItems: number;
};

type SubmissionPdfPageItem =
  | { kind: 'field'; field: FormField }
  | {
    kind: 'repeat';
    sectionId: string;
    title: string;
    hint: string | null;
    fields: FormField[];
    rowCount: number;
  };

type SubmissionPdfPage = {
  items: SubmissionPdfPageItem[];
};

function isRepeatStartMarker(field: FormField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start';
}

function isRepeatEndMarker(field: FormField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end';
}

function getRepeatSectionPdfConfig(startField: FormField): RepeatSectionPdfConfig {
  const validation = parseObject(startField.validation);
  const minItemsRaw = typeof validation?.repeatMinItems === 'number' ? Math.trunc(validation.repeatMinItems) : 1;
  const minItems = Math.max(1, Math.min(50, minItemsRaw));
  return {
    id: startField.id || startField.key,
    minItems,
  };
}

function hasAnyAnswerValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasAnyAnswerValue(item));
  }
  return !isEmptyValue(value);
}

function getRepeatRowValue(value: unknown, rowIndex: number): unknown {
  if (Array.isArray(value)) {
    return value[rowIndex];
  }
  return rowIndex === 0 ? value : undefined;
}

function buildRepeatRowAnswers(answers: Record<string, unknown>, rowIndex: number): Record<string, unknown> {
  const rowAnswers: Record<string, unknown> = {};
  for (const [answerKey, answerValue] of Object.entries(answers)) {
    rowAnswers[answerKey] = getRepeatRowValue(answerValue, rowIndex);
  }
  return rowAnswers;
}

function getRepeatSectionRowCount(
  sectionFields: FormField[],
  answers: Record<string, unknown>,
  minItems: number
): number {
  let rowCount = 0;

  for (const field of sectionFields) {
    const value = answers[field.key];
    if (Array.isArray(value)) {
      rowCount = Math.max(rowCount, value.length);
      continue;
    }

    if (hasAnyAnswerValue(value)) {
      rowCount = Math.max(rowCount, 1);
    }
  }

  return Math.max(minItems, rowCount);
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

  const pages: SubmissionPdfPage[] = [{ items: [] }];
  for (let index = 0; index < input.fields.length; index += 1) {
    const field = input.fields[index];

    if (field.type === 'PAGE_BREAK') {
      if (isRepeatStartMarker(field)) {
        const sectionFields: FormField[] = [];
        let cursor = index + 1;

        while (cursor < input.fields.length) {
          const candidate = input.fields[cursor];
          if (isRepeatEndMarker(candidate)) {
            break;
          }
          if (candidate.type === 'PAGE_BREAK') {
            cursor -= 1;
            break;
          }
          if (candidate.type !== 'HIDDEN') {
            sectionFields.push(candidate);
          }
          cursor += 1;
        }

        const sectionConfig = getRepeatSectionPdfConfig(field);
        const rowCount = getRepeatSectionRowCount(sectionFields, input.answers, sectionConfig.minItems);
        const hasData = sectionFields.some((sectionField) => hasAnyAnswerValue(input.answers[sectionField.key]));
        const shouldDisplaySection = evaluateCondition(field.condition, input.answers) || hasData;

        if (shouldDisplaySection && sectionFields.length > 0 && rowCount > 0) {
          pages[pages.length - 1].items.push({
            kind: 'repeat',
            sectionId: sectionConfig.id,
            title: field.label?.trim() || 'Dynamic section',
            hint: field.subtext?.trim() || null,
            fields: sectionFields,
            rowCount,
          });
        }

        index = cursor;
        continue;
      }

      if (isRepeatEndMarker(field)) {
        continue;
      }

      pages.push({ items: [] });
      continue;
    }

    if (field.type === 'HIDDEN') continue;
    if (!evaluateCondition(field.condition, input.answers)) continue;

    pages[pages.length - 1].items.push({ kind: 'field', field });
  }

  const visiblePages = pages.filter((pageItems) => pageItems.items.length > 0);

  for (let pageIndex = 0; pageIndex < visiblePages.length; pageIndex += 1) {
    const pageItems = visiblePages[pageIndex];

    if (visiblePages.length > 1) {
      drawWrapped(`Page ${pageIndex + 1}`, {
        size: 12,
        bold: true,
        color: [0.1, 0.2, 0.36],
        spacingAfter: 2,
      });
    }

    for (const item of pageItems.items) {
      if (item.kind === 'field') {
        const label = item.field.label?.trim() || item.field.key;
        const value = formatResponseFieldValue(item.field, input.answers[item.field.key], uploadsById);
        drawWrapped(label, { size: 10, bold: true, spacingAfter: 1 });
        drawWrapped(value, { size: 10, indent: 8, spacingAfter: 5, allowEmpty: true });
        continue;
      }

      drawWrapped(item.title, {
        size: 11,
        bold: true,
        color: [0.1, 0.2, 0.36],
        spacingAfter: 1,
      });

      if (item.hint) {
        drawWrapped(item.hint, {
          size: 9,
          color: [0.35, 0.39, 0.46],
          indent: 6,
          spacingAfter: 2,
        });
      }

      for (let rowIndex = 0; rowIndex < item.rowCount; rowIndex += 1) {
        const rowAnswers = buildRepeatRowAnswers(input.answers, rowIndex);
        const rowFields = item.fields.filter((field) => evaluateCondition(field.condition, rowAnswers));
        if (rowFields.length === 0) continue;

        drawWrapped(`Card ${rowIndex + 1}`, {
          size: 10,
          bold: true,
          indent: 6,
          color: [0.2, 0.25, 0.33],
          spacingAfter: 1,
        });

        for (const field of rowFields) {
          const label = field.label?.trim() || field.key;
          const rowValue = getRepeatRowValue(input.answers[field.key], rowIndex);
          const value = formatResponseFieldValue(field, rowValue, uploadsById);

          drawWrapped(label, { size: 9, bold: true, indent: 12, spacingAfter: 1 });
          drawWrapped(value, { size: 9, indent: 20, spacingAfter: 3, allowEmpty: true });
        }

        y -= 1;
      }
    }
  }

  return Buffer.from(await pdf.save());
}

function toPdfFileName(formTitle: string, submissionId: string): string {
  const safeTitle = formTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form-response';
  return `${safeTitle}-${submissionId.slice(0, 8)}.pdf`;
}

function normalizeTenantTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_TENANT_TIME_ZONE;
  }

  const candidate = value.trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TENANT_TIME_ZONE;
  }
}

async function getTenantTimeZone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  const settings = parseObject(tenant?.settings);
  return normalizeTenantTimeZone(settings?.timezone);
}

function toDateStamps(value: Date, timeZone: string): { dateStamp: string; timeStamp: string; datetimeStamp: string } {
  const resolvedTimeZone = normalizeTenantTimeZone(timeZone);
  const date = new Date(value);

  try {
    const prettyParts = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTimeZone,
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);

    const partValue = (parts: Intl.DateTimeFormatPart[], partType: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === partType)?.value || '';

    const day = String(Number(partValue(prettyParts, 'day') || '0'));
    const monthLong = partValue(prettyParts, 'month');
    const year2 = partValue(prettyParts, 'year');
    const hourRaw = partValue(prettyParts, 'hour');
    const hour = String(Number(hourRaw || '0'));
    const minute = partValue(prettyParts, 'minute');
    const dayPeriod = partValue(prettyParts, 'dayPeriod').replace(/\s+/g, '').toUpperCase();

    const dateStamp = `${day} ${monthLong} ${year2}`;
    const timeStamp = `${hour}.${minute}${dayPeriod}`;
    const datetimeStamp = `${dateStamp} - ${timeStamp}`;

    return {
      dateStamp,
      timeStamp,
      datetimeStamp,
    };
  } catch {
    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(date.getUTCDate());
    const month = monthShort[date.getUTCMonth()] || 'Jan';
    const year2 = String(date.getUTCFullYear()).slice(-2);
    const hour24 = date.getUTCHours();
    const hour12 = String((hour24 % 12) || 12);
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const dayPeriod = hour24 >= 12 ? 'PM' : 'AM';
    const dateStamp = `${day} ${month} ${year2}`;
    const timeStamp = `${hour12}.${minute}${dayPeriod}`;
    return {
      dateStamp,
      timeStamp,
      datetimeStamp: `${dateStamp} - ${timeStamp}`,
    };
  }
}

function normalizeTemplateValue(value: string, maxLength: number = 160): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLength);
}

function toFileNameTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || DATA_IMAGE_URI_PATTERN.test(trimmed)) return '';
    return normalizeTemplateValue(trimmed, 240);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const choiceText = formatChoiceAnswer(value);
  if (choiceText) {
    return normalizeTemplateValue(choiceText, 240);
  }

  if (Array.isArray(value)) {
    const text = value
      .map((item) => toFileNameTemplateValue(item))
      .filter(Boolean)
      .join(', ');
    return normalizeTemplateValue(text, 240);
  }

  const record = parseObject(value);
  if (record && typeof record.value === 'string') {
    return normalizeTemplateValue(record.value, 240);
  }

  try {
    return normalizeTemplateValue(JSON.stringify(value), 240);
  } catch {
    return '';
  }
}

function sanitizeFileNameExtension(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';

  const normalized = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
  if (!/^\.[a-z0-9]{1,15}$/.test(normalized)) {
    return '';
  }

  return normalized;
}

function stripTrailingExtension(value: string): string {
  return value.trim().replace(/\.[a-z0-9]{1,15}$/i, '');
}

function sanitizeFileNameStem(value: string, fallback: string): string {
  const safeFallback = normalizeTemplateValue(
    stripTrailingExtension(fallback)
      .replace(FILE_NAME_INVALID_CHARS_PATTERN, ' ')
      .replace(/\s+/g, ' '),
    180
  ) || FILE_NAME_FALLBACK;

  const cleaned = normalizeTemplateValue(
    stripTrailingExtension(value)
      .replace(FILE_NAME_INVALID_CHARS_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[. ]+|[. ]+$/g, ''),
    180
  );

  return cleaned || safeFallback;
}

function splitFileNameParts(fileName: string): { base: string; extension: string } {
  const trimmed = fileName.trim();
  const match = trimmed.match(/(\.[a-z0-9]{1,15})$/i);

  if (!match) {
    return { base: trimmed, extension: '' };
  }

  return {
    base: trimmed.slice(0, -match[1].length),
    extension: sanitizeFileNameExtension(match[1]),
  };
}

function composeSafeFileName(stem: string, extension: string, fallbackStem: string): string {
  const safeExtension = sanitizeFileNameExtension(extension);
  const safeStem = sanitizeFileNameStem(stem, fallbackStem);
  const maxStemLength = Math.max(1, FILE_NAME_MAX_LENGTH - safeExtension.length);
  const boundedStem = safeStem.slice(0, maxStemLength).replace(/[. ]+$/g, '').trim() || FILE_NAME_FALLBACK;
  return `${boundedStem}${safeExtension}`;
}

function makeUniqueFileName(candidate: string, used: Set<string>): string {
  let nextName = candidate;
  const initialParts = splitFileNameParts(candidate);
  const base = sanitizeFileNameStem(initialParts.base, FILE_NAME_FALLBACK);
  const extension = sanitizeFileNameExtension(initialParts.extension);
  let suffix = 2;

  while (used.has(nextName.toLowerCase())) {
    const counterSuffix = `-${suffix}`;
    const maxBaseLength = Math.max(1, FILE_NAME_MAX_LENGTH - extension.length - counterSuffix.length);
    const nextBase = base.slice(0, maxBaseLength).replace(/[. ]+$/g, '').trim() || FILE_NAME_FALLBACK;
    nextName = `${nextBase}${counterSuffix}${extension}`;
    suffix += 1;
  }

  used.add(nextName.toLowerCase());
  return nextName;
}

function buildFileNameTemplateVariables(input: {
  formTitle: string;
  formSlug: string;
  submissionId: string;
  submittedAt: Date;
  timeZone: string;
  answers: Record<string, unknown>;
  extra?: Record<string, string>;
}): Record<string, string> {
  const stamps = toDateStamps(input.submittedAt, input.timeZone);
  const variables: Record<string, string> = {
    form_title: normalizeTemplateValue(input.formTitle, 200),
    form_slug: normalizeTemplateValue(input.formSlug, 120),
    submission_id: normalizeTemplateValue(input.submissionId, 80),
    datetime_stamp: stamps.datetimeStamp,
    date_stamp: stamps.dateStamp,
    time_stamp: stamps.timeStamp,
  };

  for (const [answerKey, answerValue] of Object.entries(input.answers)) {
    if (!answerKey) continue;
    variables[answerKey.toLowerCase()] = toFileNameTemplateValue(answerValue);
  }

  for (const [extraKey, extraValue] of Object.entries(input.extra || {})) {
    if (!extraKey) continue;
    variables[extraKey.toLowerCase()] = normalizeTemplateValue(extraValue, 200);
  }

  return variables;
}

function applyFileNameTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(FILE_NAME_TEMPLATE_PATTERN, (_match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    return variables[key] || '';
  });
}

function resolveSubmissionPdfFileName(input: {
  formTitle: string;
  formSlug: string;
  settings: unknown;
  submissionId: string;
  submittedAt: Date;
  timeZone: string;
  answers: Record<string, unknown>;
}): string {
  const fallback = toPdfFileName(input.formTitle, input.submissionId);
  const fileNameSettings = parseFormFileNameSettings(input.settings);

  if (!fileNameSettings.pdfTemplate) {
    return fallback;
  }

  const templateVariables = buildFileNameTemplateVariables({
    formTitle: input.formTitle,
    formSlug: input.formSlug,
    submissionId: input.submissionId,
    submittedAt: input.submittedAt,
    timeZone: input.timeZone,
    answers: input.answers,
  });

  const rendered = applyFileNameTemplate(fileNameSettings.pdfTemplate, templateVariables);
  const fallbackParts = splitFileNameParts(fallback);
  return composeSafeFileName(rendered, '.pdf', fallbackParts.base || 'form-response');
}

function resolveSubmissionUploadFileNames(input: {
  formTitle: string;
  formSlug: string;
  submissionId: string;
  submittedAt: Date;
  timeZone: string;
  answers: Record<string, unknown>;
  uploads: Array<Pick<FormUpload, 'id' | 'fieldId' | 'fileName' | 'mimeType'>>;
  fieldById: Map<string, Pick<FormField, 'key' | 'validation'>>;
}): Map<string, string> {
  const usedNames = new Set<string>();
  const renamedByUploadId = new Map<string, string>();

  for (const upload of input.uploads) {
    const fieldMeta = upload.fieldId ? input.fieldById.get(upload.fieldId) : null;
    const validation = parseObject(fieldMeta?.validation);
    const templateRaw = typeof validation?.uploadFileNameTemplate === 'string'
      ? validation.uploadFileNameTemplate.trim()
      : '';

    if (templateRaw.length === 0) {
      usedNames.add(upload.fileName.toLowerCase());
    }
  }

  for (let index = 0; index < input.uploads.length; index += 1) {
    const upload = input.uploads[index];
    const fieldMeta = upload.fieldId ? input.fieldById.get(upload.fieldId) : null;
    const validation = parseObject(fieldMeta?.validation);
    const uploadTemplate = typeof validation?.uploadFileNameTemplate === 'string'
      ? validation.uploadFileNameTemplate.trim()
      : '';
    if (!uploadTemplate) {
      continue;
    }

    const parsedOriginal = splitFileNameParts(upload.fileName);
    const inferredExtension = sanitizeFileNameExtension(
      parsedOriginal.extension || StorageKeys.getExtension(upload.fileName, upload.mimeType)
    );
    const originalBase = sanitizeFileNameStem(parsedOriginal.base, 'upload');
    const originalFileName = composeSafeFileName(originalBase, inferredExtension, 'upload');
    const fieldKey = fieldMeta?.key || '';

    const templateVariables = buildFileNameTemplateVariables({
      formTitle: input.formTitle,
      formSlug: input.formSlug,
      submissionId: input.submissionId,
      submittedAt: input.submittedAt,
      timeZone: input.timeZone,
      answers: input.answers,
      extra: {
        field_key: fieldKey,
        upload_id: upload.id,
        original_filename: originalFileName,
        original_basename: originalBase,
        original_extension: inferredExtension.startsWith('.') ? inferredExtension.slice(1) : inferredExtension,
        file_index: String(index + 1),
      },
    });

    const rendered = applyFileNameTemplate(uploadTemplate, templateVariables);
    const candidate = composeSafeFileName(rendered, inferredExtension, originalBase || 'upload');
    const uniqueFileName = makeUniqueFileName(candidate, usedNames);
    renamedByUploadId.set(upload.id, uniqueFileName);
  }

  return renamedByUploadId;
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

  let totalBytes = input.pdfBuffer.length;
  let omittedUploads = 0;
  const uploadsToAttach = input.uploads.slice(0, MAX_NOTIFICATION_UPLOAD_ATTACHMENTS);
  omittedUploads += Math.max(0, input.uploads.length - uploadsToAttach.length);

  for (const upload of uploadsToAttach) {
    if (totalBytes >= MAX_NOTIFICATION_ATTACHMENT_BYTES) {
      omittedUploads += 1;
      continue;
    }

    const expectedSize = Math.max(0, upload.sizeBytes || 0);
    if (expectedSize > 0 && totalBytes + expectedSize > MAX_NOTIFICATION_ATTACHMENT_BYTES) {
      omittedUploads += 1;
      continue;
    }

    try {
      const content = await storage.download(upload.storageKey);
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
    } catch (error) {
      omittedUploads += 1;
      log.error('Failed to load upload for form completion email', {
        formId: upload.formId,
        uploadId: upload.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { attachments, omittedUploads };
}

async function sendCompletionNotificationEmail(input: {
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
    const pdfBuffer = await buildSubmissionPdfBuffer({
      formTitle: input.form.title,
      submittedAt: input.submission.submittedAt,
      respondentName: input.submission.respondentName,
      respondentEmail: input.submission.respondentEmail,
      status: input.submission.status,
      fields: input.form.fields,
      answers,
      uploads: input.uploads,
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

    const safeFormTitle = input.form.title.replace(/[<>&]/g, (match) => (
      match === '<' ? '&lt;' : match === '>' ? '&gt;' : '&amp;'
    ));
    const submittedAt = new Date(input.submission.submittedAt).toLocaleString('en-SG');
    const omittedMessage = omittedUploads > 0
      ? `<p><em>${omittedUploads} uploaded file(s) were not attached due to size or attachment limits.</em></p>`
      : '';
    const html = `
      <p>Hello,</p>
      <p>A new response has been submitted for <strong>${safeFormTitle}</strong>.</p>
      <p>Submitted on: ${submittedAt}</p>
      ${omittedMessage}
      <p>The response PDF and available uploaded files are attached.</p>
    `;

    const result = await sendEmail({
      to: recipients,
      subject: `New form submission: ${input.form.title}`,
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
  const answers = toAnswerRecord(submission.answers);
  const tenantTimeZone = await getTenantTimeZone(form.tenantId);

  const buffer = await buildSubmissionPdfBuffer({
    formTitle: form.title,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
    fields: form.fields,
    answers,
    uploads,
  });
  const fileName = resolveSubmissionPdfFileName({
    formTitle: form.title,
    formSlug: form.slug,
    settings: form.settings,
    submissionId: submission.id,
    submittedAt: submission.submittedAt,
    timeZone: tenantTimeZone,
    answers,
  });

  return {
    buffer,
    fileName,
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
      tenant: {
        select: { logoUrl: true },
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
    tenantLogoUrl: form.tenant?.logoUrl ?? null,
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
  const tenantTimeZone = await getTenantTimeZone(form.tenantId);

  const answers = input.answers as Record<string, unknown>;
  const uploadIds = [...new Set(input.uploadIds || [])];
  const uploadIdSet = new Set(uploadIds);
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const field of form.fields) {
    if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') continue;
    const validation = parseObject(field.validation);
    if (validation?.defaultToday !== true) continue;

    const currentValue = answers[field.key];
    if (Array.isArray(currentValue)) {
      const nextRows = currentValue.map((rowValue) => (isEmptyValue(rowValue) ? todayIso : rowValue));
      answers[field.key] = nextRows;
      continue;
    }

    if (isEmptyValue(currentValue)) {
      answers[field.key] = todayIso;
    }
  }

  const collectUploadIdsFromAnswer = (value: unknown): string[] => {
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
  };

  const hasItemValue = (item: unknown): boolean => {
    if (isEmptyValue(item)) return false;
    const itemRecord = parseObject(item);
    if (itemRecord && 'value' in itemRecord) {
      return typeof itemRecord.value === 'string' && itemRecord.value.trim().length > 0;
    }
    return true;
  };

  const validateRequiredField = (field: FormField): void => {
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
  };

  for (let index = 0; index < form.fields.length; index += 1) {
    const field = form.fields[index];

    if (isRepeatStartMarker(field)) {
      const sectionVisible = evaluateCondition(parseObject(field.condition), answers);
      let cursor = index + 1;

      while (cursor < form.fields.length && !isRepeatEndMarker(form.fields[cursor])) {
        const sectionField = form.fields[cursor];
        if (
          sectionVisible &&
          sectionField.type !== 'PAGE_BREAK' &&
          sectionField.type !== 'PARAGRAPH' &&
          sectionField.type !== 'HTML' &&
          sectionField.type !== 'HIDDEN' &&
          evaluateCondition(parseObject(sectionField.condition), answers)
        ) {
          validateRequiredField(sectionField);
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

    validateRequiredField(field);
  }

  const validKeys = new Set(form.fields.map((f) => f.key));
  const sanitizedAnswers: Record<string, unknown> = {};

  const sanitizeChoiceEntry = (entry: unknown): string | { value: string; detailText?: string } | null => {
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
  };

  for (const [key, value] of Object.entries(answers)) {
    if (!validKeys.has(key)) continue;

    const field = form.fields.find((f) => f.key === key);
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
          const normalizedMultipleChoice = value.slice(0, 100).map((entry) => {
            if (Array.isArray(entry)) {
              return entry
                .slice(0, 100)
                .map((candidate) => sanitizeChoiceEntry(candidate))
                .map((candidate) => candidate ?? '');
            }
            return sanitizeChoiceEntry(entry) ?? '';
          });
          sanitizedAnswers[key] = normalizedMultipleChoice;
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
          sanitizedAnswers[key] = value.slice(0, 500_000);
        } else if (Array.isArray(value)) {
          sanitizedAnswers[key] = value
            .slice(0, 100)
            .map((item) => (typeof item === 'string' ? item.slice(0, 500_000) : ''));
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
  const fieldById = new Map(form.fields.map((field) => [field.id, { key: field.key, validation: field.validation }]));
  const renamedUploadsById = new Map<string, string>();

  const submission = await prisma.$transaction(async (tx) => {
    let pendingUploads: Array<Pick<FormUpload, 'id' | 'fieldId' | 'fileName' | 'mimeType'>> = [];

    if (uploadIds.length > 0) {
      pendingUploads = await tx.formUpload.findMany({
        where: {
          id: { in: uploadIds },
          formId: form.id,
          submissionId: null,
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
          submissionId: null,
        },
        data: {
          submissionId: submission.id,
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

    return submission;
  });

  const submissionUploads = await prisma.formUpload.findMany({
    where: {
      formId: form.id,
      submissionId: submission.id,
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

  await sendCompletionNotificationEmail({
    form,
    submission,
    uploads: emailUploads,
    tenantTimeZone,
  });

  return submission;
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
  const answers = toAnswerRecord(submission.answers);
  const tenantTimeZone = await getTenantTimeZone(form.tenantId);

  const buffer = await buildSubmissionPdfBuffer({
    formTitle: form.title,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
    fields: form.fields,
    answers,
    uploads,
  });
  const fileName = resolveSubmissionPdfFileName({
    formTitle: form.title,
    formSlug: form.slug,
    settings: form.settings,
    submissionId: submission.id,
    submittedAt: submission.submittedAt,
    timeZone: tenantTimeZone,
    answers,
  });

  return {
    buffer,
    fileName,
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
    const choiceText = formatChoiceAnswer(value);
    if (choiceText) return choiceText;
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
