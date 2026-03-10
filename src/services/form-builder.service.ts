import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { generatePDF } from '@/services/document-export.service';
import {
  FormFieldType,
  FormStatus,
  Prisma,
  FormSubmissionStatus,
  type Form,
  type FormDraft,
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
  normalizeKey,
  parseObject,
  formatChoiceAnswer,
  parseChoiceOptions,
  isEmptyValue,
  evaluateCondition,
  parseFormAiSettings,
  parseFormDraftSettings,
  parseFormFileNameSettings,
  parseFormNotificationSettings,
  parseFormSubmissionAiReview,
  type FormSubmissionAiReview,
  type PublicFormField,
  type PublicFormDefinition,
} from '@/lib/form-utils';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import { getAppBaseUrl, sendEmail, type EmailAttachment } from '@/lib/email';
import { formDraftEmail } from '@/lib/email-templates';
import { createLogger } from '@/lib/logger';
import { generateFormSubmissionAiReview } from '@/services/form-ai.service';
import type { TenantAwareParams } from '@/lib/types';
import { getDefaultModelId } from '@/lib/ai/models';
import { evaluateArithmeticExpression } from '@/lib/safe-math';
import type {
  CreateFormInput,
  FormFieldInput,
  ListFormsQueryInput,
  PublicDraftSaveInput,
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
  tenantLogoUrl: string | null;
  tenantName: string | null;
}

export interface FormListResult {
  forms: FormListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

export interface DeleteFormDraftResult {
  id: string;
}

export interface QueueFormSubmissionAiReviewResult {
  id: string;
  aiReview: FormSubmissionAiReview;
}

export interface ProcessQueuedFormSubmissionAiReviewsResult {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
}

export interface ResolveFormSubmissionAiWarningResult {
  id: string;
  aiReview: FormSubmissionAiReview;
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

export interface FormWarningListItem {
  formId: string;
  formTitle: string;
  formSlug: string;
  formStatus: FormStatus;
  latestSubmissionId: string;
  latestSubmittedAt: Date;
  warningCount: number;
}

export interface FormResponsesQueryInput {
  submissionSortBy?: string;
  submissionSortOrder?: 'asc' | 'desc';
  submissionFilters?: Record<string, string>;
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

export type { PublicFormField, PublicFormDefinition };

const MAX_SLUG_ATTEMPTS = 10;
const MAX_NOTIFICATION_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_NOTIFICATION_UPLOAD_ATTACHMENTS = 20;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_NAME_TEMPLATE_PATTERN = /\[([a-zA-Z0-9_]+)\]/g;
const FILE_NAME_INVALID_CHARS_PATTERN = /[<>"/\\|?*\u0000-\u001F]+/g;
const DATA_IMAGE_URI_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const FILE_NAME_FALLBACK = 'file';
const FILE_NAME_MAX_LENGTH = 220;
const DEFAULT_TENANT_TIME_ZONE = 'Asia/Singapore';
const DRAFT_CODE_LENGTH = 5;
const DRAFT_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DRAFT_ACCESS_TOKEN_BYTES = 24;
const MAX_DRAFT_CODE_ATTEMPTS = 20;
const RESPONSE_ATTACHMENTS_COLUMN_ID = '__submission_attachments';
const log = createLogger('form-builder');

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (match) => (
    match === '<' ? '&lt;' : match === '>' ? '&gt;' : '&amp;'
  ));
}

function toAnswerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

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

function isRepeatStartMarker(field: FormField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start';
}

function isRepeatEndMarker(field: FormField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end';
}

function buildSubmissionPdfHtml(input: {
  formTitle: string;
  formDescription?: string | null;
  submittedAt: Date;
  respondentName: string | null;
  respondentEmail: string | null;
  status: FormSubmissionStatus;
  fields: FormField[];
  answers: Record<string, unknown>;
  uploads: FormUpload[];
  tenantLogoUrl?: string | null;
  tenantName?: string | null;
  formSettings?: unknown;
  timeZone?: string;
}): { contentHtml: string; footerHtml: string } {
  const settings = parseObject(input.formSettings);
  const hideLogo = settings?.hideLogo === true;
  const hideFooter = settings?.hideFooter === true;

  const uploadsById = new Map(input.uploads.map((u) => [u.id, u]));

  const appBase = getAppBaseUrl();
  const logoUrl = !hideLogo && input.tenantLogoUrl
    ? (input.tenantLogoUrl.startsWith('http') ? input.tenantLogoUrl : `${appBase}${input.tenantLogoUrl}`)
    : null;
  const footerText = !hideFooter && input.tenantName ? `\u00a9 ${input.tenantName}` : null;

  const submittedAt = new Date(input.submittedAt).toLocaleString('en-SG', {
    timeZone: input.timeZone ?? 'Asia/Singapore',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  function esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Map layoutWidth (25/33/50/66/75/100) to CSS grid column span out of 12
  function colSpan(layoutWidth: number | null | undefined): number {
    const map: Record<number, number> = { 25: 3, 33: 4, 50: 6, 66: 8, 75: 9, 100: 12 };
    return map[layoutWidth ?? 100] ?? 12;
  }

  function isChoiceInlineRight(field: FormField): boolean {
    const validation = parseObject(field.validation);
    return validation?.choiceInlineRight === true;
  }

  function renderChoiceInlineRight(field: FormField, value: unknown): string {
    const label = esc(field.label?.trim() || field.key);
    const options = parseChoiceOptions(field.options);
    const selectedText = formatChoiceAnswer(value);
    const optionsHtml = options.map((opt) => {
      const isSelected = formatChoiceAnswer(value) !== null &&
        (opt.value === (typeof value === 'string' ? value : (parseObject(value) as { value?: string } | null)?.value));
      return `<span class="choice-option${isSelected ? ' choice-option-selected' : ''}">${esc(opt.label)}</span>`;
    }).join('');
    return `
      <div class="field-inline-right">
        <span class="field-label-inline">${label}</span>
        <span class="choice-options-right">${optionsHtml || (selectedText ? `<span class="choice-option choice-option-selected">${esc(selectedText)}</span>` : `<span class="empty">\u2014</span>`)}</span>
      </div>`;
  }

  function renderFieldValue(field: FormField, value: unknown): string {
    if (field.type === 'SIGNATURE') {
      if (typeof value === 'string' && value.trim().length > 0) {
        return `<img src="${esc(value)}" alt="Signature" style="max-height:80px;max-width:240px;object-fit:contain;display:block;" />`;
      }
      return `<span class="empty">\u2014</span>`;
    }
    if (field.type === 'FILE_UPLOAD') {
      const ids = toUploadIds(value);
      if (ids.length === 0) return `<span class="empty">\u2014</span>`;
      return ids.map((id) => {
        const upload = uploadsById.get(id);
        const name = upload?.originalFileName || upload?.fileName || id;
        return `<div class="file-name">${esc(name)}</div>`;
      }).join('');
    }
    if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE' || field.type === 'DROPDOWN') {
      const text = formatChoiceAnswer(value);
      return text ? esc(text) : `<span class="empty">\u2014</span>`;
    }
    if (value === null || value === undefined || value === '') {
      return `<span class="empty">\u2014</span>`;
    }
    if (Array.isArray(value)) {
      const text = value.map((item) => String(item)).join(', ').trim();
      return text ? esc(text) : `<span class="empty">\u2014</span>`;
    }
    const text = String(value).trim();
    return text ? `<span style="white-space:pre-wrap">${esc(text)}</span>` : `<span class="empty">\u2014</span>`;
  }

  function renderField(field: FormField, value: unknown): string {
    if (field.type === 'PARAGRAPH' || field.type === 'HTML' || field.type === 'HIDDEN') return '';
    const span = colSpan(field.layoutWidth);

    // choiceInlineRight: label on left, selected option pills on right
    if ((field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') && isChoiceInlineRight(field)) {
      return `<div class="field" style="grid-column: span ${span};">${renderChoiceInlineRight(field, value)}</div>`;
    }

    const label = esc(field.label?.trim() || field.key);
    return `
      <div class="field" style="grid-column: span ${span};">
        <div class="field-label">${label}</div>
        <div class="field-value">${renderFieldValue(field, value)}</div>
      </div>`;
  }

  type PdfItem =
    | { kind: 'field'; field: FormField }
    | { kind: 'repeat'; title: string; hint: string | null; fields: FormField[]; rowCount: number };

  const items: PdfItem[] = [];

  for (let i = 0; i < input.fields.length; i++) {
    const field = input.fields[i];

    if (field.type === 'PAGE_BREAK') {
      if (isRepeatStartMarker(field)) {
        const sectionFields: FormField[] = [];
        let cursor = i + 1;
        while (cursor < input.fields.length) {
          const candidate = input.fields[cursor];
          if (isRepeatEndMarker(candidate)) break;
          // Back up so the outer for-loop's i++ lands back on this PAGE_BREAK,
          // which will then be processed as a regular page-break (continue) on the next iteration.
          if (candidate.type === 'PAGE_BREAK') { cursor -= 1; break; }
          if (candidate.type !== 'HIDDEN') sectionFields.push(candidate);
          cursor++;
        }
        const validation = parseObject(field.validation);
        const minItemsRaw = typeof validation?.repeatMinItems === 'number' ? Math.trunc(validation.repeatMinItems) : 1;
        const minItems = Math.max(1, Math.min(50, minItemsRaw));
        let rowCount = 0;
        for (const sf of sectionFields) {
          const v = input.answers[sf.key];
          if (Array.isArray(v)) rowCount = Math.max(rowCount, v.length);
          else if (!isEmptyValue(v)) rowCount = Math.max(rowCount, 1);
        }
        rowCount = Math.max(minItems, rowCount);
        const hasData = sectionFields.some((sf) => {
          const v = input.answers[sf.key];
          return Array.isArray(v) ? v.some((item) => !isEmptyValue(item)) : !isEmptyValue(v);
        });
        if ((evaluateCondition(field.condition, input.answers) || hasData) && sectionFields.length > 0 && rowCount > 0) {
          items.push({ kind: 'repeat', title: field.label?.trim() || 'Section', hint: field.subtext?.trim() || null, fields: sectionFields, rowCount });
        }
        i = cursor;
        continue;
      }
      continue; // repeat_end and regular page breaks — skip (render flat)
    }

    if (field.type === 'HIDDEN') continue;
    if (!evaluateCondition(field.condition, input.answers)) continue;
    items.push({ kind: 'field', field });
  }

  const fieldsHtml = items.map((item) => {
    if (item.kind === 'field') {
      return renderField(item.field, input.answers[item.field.key]);
    }
    const rowsHtml = Array.from({ length: item.rowCount }, (_, rowIndex) => {
      const rowAnswers: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input.answers)) {
        rowAnswers[k] = Array.isArray(v) ? v[rowIndex] : (rowIndex === 0 ? v : undefined);
      }
      const rowFields = item.fields.filter(
        (f) => f.type !== 'HIDDEN' && evaluateCondition(f.condition, rowAnswers)
      );
      if (rowFields.length === 0) return '';
      return `
        <div class="repeat-card">
          <div class="repeat-card-label">Entry ${rowIndex + 1}</div>
          <div class="repeat-card-fields fields-grid">${rowFields.map((f) => renderField(f, rowAnswers[f.key])).join('')}</div>
        </div>`;
    }).join('');

    return `
      <div class="repeat-section">
        <div class="repeat-title">${esc(item.title)}</div>
        ${item.hint ? `<div class="repeat-hint">${esc(item.hint)}</div>` : ''}
        ${rowsHtml}
      </div>`;
  }).join('');

  const contentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 48px 52px 40px; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    font-size: 13px; line-height: 1.5; color: #111827; background: #fff;
  }
  /* --- First-page header --- */
  .header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .header-top { display: flex; align-items: flex-start; gap: 12px; }
  .logo { max-height: 56px; max-width: 180px; object-fit: contain; flex-shrink: 0; }
  .header-text { display: flex; flex-direction: column; }
  .form-title { font-size: 20px; font-weight: 700; color: #111827; line-height: 1.3; }
  .form-submitted { font-size: 12px; color: #6b7280; margin-top: 3px; }
  .form-description { font-size: 12px; color: #6b7280; margin-top: 2px; }
  /* --- Fields grid (12 columns) --- */
  .fields-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px 16px; }
  .field { page-break-inside: avoid; min-width: 0; }
  .field-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .field-value {
    font-size: 13px; color: #111827; background: #f9fafb; border: 1px solid #e5e7eb;
    border-radius: 6px; padding: 8px 12px; min-height: 36px;
    word-break: break-word; overflow-wrap: break-word; white-space: pre-wrap;
  }
  /* --- choiceInlineRight --- */
  .field-inline-right {
    display: flex; align-items: flex-start; gap: 12px; background: #f9fafb;
    border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; min-height: 36px;
  }
  .field-label-inline { font-size: 13px; color: #111827; font-weight: 500; flex: 1 1 0; min-width: 0; word-break: break-word; }
  .choice-options-right { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; flex-shrink: 0; max-width: 55%; }
  .choice-option { font-size: 11px; padding: 2px 9px; border-radius: 9999px; border: 1px solid #d1d5db; color: #6b7280; background: #fff; white-space: normal; word-break: break-word; }
  .choice-option-selected { border-color: #4f46e5; color: #4f46e5; background: #eef2ff; font-weight: 600; }
  /* --- Misc --- */
  .empty { color: #d1d5db; }
  .file-name { color: #374151; word-break: break-all; }
  /* --- Repeat sections (full-width within grid) --- */
  .repeat-section { margin-bottom: 20px; grid-column: span 12; }
  .repeat-title { font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
  .repeat-hint { font-size: 12px; color: #9ca3af; margin-bottom: 10px; }
  .repeat-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fff; page-break-inside: avoid; }
  .repeat-card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="Logo" />` : ''}
      <div class="header-text">
        <h1 class="form-title">${esc(input.formTitle || 'Form Response')}</h1>
        <div class="form-submitted">Submitted: ${esc(submittedAt)} (${esc(input.timeZone ?? 'Asia/Singapore')})</div>
        ${input.formDescription ? `<p class="form-description">${esc(input.formDescription)}</p>` : ''}
      </div>
    </div>
  </div>
  <div class="fields-grid">${fieldsHtml}</div>
</body>
</html>`;

  // Puppeteer footerTemplate renders in the page margin area — never overlaps content.
  // font-size must be set explicitly; Puppeteer resets it to 0 in header/footer context.
  const footerHtml = footerText
    ? `<div style="width:100%;font-family:sans-serif;font-size:9px;color:#9ca3af;text-align:center;padding:0 40px;">${esc(footerText)}</div>`
    : '<div></div>';

  return { contentHtml, footerHtml };
}

async function buildSubmissionPdfBuffer(input: {
  formTitle: string;
  formDescription?: string | null;
  submittedAt: Date;
  respondentName: string | null;
  respondentEmail: string | null;
  status: FormSubmissionStatus;
  fields: FormField[];
  answers: Record<string, unknown>;
  uploads: FormUpload[];
  tenantLogoUrl?: string | null;
  tenantName?: string | null;
  formSettings?: unknown;
  timeZone?: string;
}): Promise<Buffer> {
  const { contentHtml, footerHtml } = buildSubmissionPdfHtml(input);
  return generatePDF(contentHtml, {
    format: 'A4',
    orientation: 'portrait',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    headerHtml: '<div></div>',
    footerHtml,
  });
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

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
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

function buildQueuedSubmissionAiReview(input?: {
  existingReview?: FormSubmissionAiReview | null;
  emailNotificationPending?: boolean;
  requestedByUserId?: string | null;
}): FormSubmissionAiReview & { requestedByUserId?: string | null } {
  const now = new Date().toISOString();
  const existing = input?.existingReview ?? null;

  return {
    status: 'queued',
    reviewRequired: false,
    severity: null,
    summary: null,
    tags: [],
    sections: [],
    model: existing?.model || getDefaultModelId(),
    warningSignature: null,
    resolvedWarningSignature: existing?.resolvedWarningSignature ?? null,
    resolvedAt: existing?.resolvedAt ?? null,
    resolvedByUserId: existing?.resolvedByUserId ?? null,
    resolvedReason: existing?.resolvedReason ?? null,
    queuedAt: now,
    startedAt: null,
    processedAt: null,
    attachmentCount: 0,
    unsupportedAttachmentNames: [],
    omittedAttachmentNames: [],
    error: null,
    emailNotificationPending: input?.emailNotificationPending === true,
    ...(input?.requestedByUserId ? { requestedByUserId: input.requestedByUserId } : {}),
  };
}

function buildProcessingSubmissionAiReview(existingReview: FormSubmissionAiReview): FormSubmissionAiReview {
  return {
    ...existingReview,
    status: 'processing',
    startedAt: new Date().toISOString(),
    processedAt: null,
    error: null,
    tags: [],
    sections: [],
    summary: null,
    severity: null,
    reviewRequired: false,
    warningSignature: existingReview.warningSignature,
  };
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
      tenant: {
        select: { logoUrl: true, name: true },
      },
    },
  });

  if (!form) {
    return null;
  }

  return {
    ...form,
    tenantLogoUrl: form.tenant?.logoUrl ?? null,
    tenantName: form.tenant?.name ?? null,
  };
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
      include: {
        tenant: {
          select: {
            logoUrl: true,
            name: true,
          },
        },
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

    return {
      ...form,
      fields,
      tenantLogoUrl: form.tenant?.logoUrl ?? null,
      tenantName: form.tenant?.name ?? null,
    };
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

  const submissionBaseWhere = { formId, tenantId } satisfies Prisma.FormSubmissionWhereInput;
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

async function queueFormSubmissionAiReviewInternal(input: {
  formId: string;
  submissionId: string;
  tenantId: string;
  requestedByUserId?: string | null;
  emailNotificationPending: boolean;
}): Promise<QueueFormSubmissionAiReviewResult> {
  const submissionWithForm = await prisma.formSubmission.findFirst({
    where: {
      id: input.submissionId,
      formId: input.formId,
      tenantId: input.tenantId,
    },
    include: {
      form: {
        select: {
          id: true,
          title: true,
          settings: true,
        },
      },
    },
  });

  if (!submissionWithForm) {
    throw new Error('Submission not found');
  }

  const aiSettings = parseFormAiSettings(submissionWithForm.form.settings);
  if (!aiSettings.enabled) {
    throw new Error('AI parsing is not enabled for this form');
  }

  const existingReview = parseFormSubmissionAiReview(submissionWithForm.metadata);
  const queuedReview = buildQueuedSubmissionAiReview({
    existingReview,
    emailNotificationPending: input.emailNotificationPending,
    requestedByUserId: input.requestedByUserId,
  });
  const metadataWithAiReview = withSubmissionAiReview(submissionWithForm.metadata, queuedReview);

  await prisma.formSubmission.update({
    where: { id: submissionWithForm.id },
    data: {
      metadata: toJsonInput(metadataWithAiReview),
      aiReviewStatus: queuedReview.status,
    },
  });

  return {
    id: submissionWithForm.id,
    aiReview: queuedReview,
  };
}

async function triggerQueuedFormAiReviewProcessing(submissionIds: string[]): Promise<void> {
  if (submissionIds.length === 0) return;

  void processQueuedFormSubmissionAiReviews({
    submissionIds,
    limit: submissionIds.length,
  }).catch((error) => {
    log.error('Failed to trigger queued form AI review processing', {
      submissionIds,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function queueFormSubmissionAiReview(
  formId: string,
  submissionId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<QueueFormSubmissionAiReviewResult> {
  const result = await queueFormSubmissionAiReviewInternal({
    formId,
    submissionId,
    tenantId: params.tenantId,
    requestedByUserId: params.userId,
    emailNotificationPending: false,
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'FormSubmission',
    entityId: submissionId,
    entityName: submissionId,
    summary: `Queued AI review for form response ${submissionId}`,
    reason,
    changeSource: 'MANUAL',
  });

  await triggerQueuedFormAiReviewProcessing([submissionId]);

  return result;
}

export async function processQueuedFormSubmissionAiReviews(input?: {
  limit?: number;
  submissionIds?: string[];
}): Promise<ProcessQueuedFormSubmissionAiReviewsResult> {
  const limit = Math.max(1, Math.min(input?.limit ?? 10, 50));
  const queuedSubmissions = await prisma.formSubmission.findMany({
    where: {
      ...(input?.submissionIds?.length ? { id: { in: input.submissionIds } } : {}),
      aiReviewStatus: 'queued',
      form: {
        deletedAt: null,
        settings: {
          path: ['aiParsing', 'enabled'],
          equals: true,
        },
      },
    },
    include: {
      form: {
        include: {
          fields: {
            orderBy: { position: 'asc' },
          },
        },
      },
      uploads: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { submittedAt: 'asc' },
    take: limit,
  });

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const submission of queuedSubmissions) {
    const currentReview = parseFormSubmissionAiReview(submission.metadata);
    if (!currentReview || currentReview.status !== 'queued') {
      skipped += 1;
      continue;
    }

    const processingReview = buildProcessingSubmissionAiReview(currentReview);
    const processingMetadata = withSubmissionAiReview(submission.metadata, processingReview);
    const claimResult = await prisma.formSubmission.updateMany({
      where: {
        id: submission.id,
        aiReviewStatus: 'queued',
      },
      data: {
        metadata: toJsonInput(processingMetadata),
        aiReviewStatus: processingReview.status,
      },
    });

    if (claimResult.count === 0) {
      skipped += 1;
      continue;
    }

    processed += 1;

    const processingSubmission: FormSubmission = {
      ...submission,
      metadata: processingMetadata as Prisma.JsonObject,
    };
    const aiReview = await generateFormSubmissionAiReview({
      form: submission.form,
      submission: processingSubmission,
      uploads: submission.uploads,
    });

    if (!aiReview) {
      skipped += 1;
      continue;
    }

    const finalReview: FormSubmissionAiReview = {
      ...aiReview,
      emailNotificationPending: false,
    };
    const finalMetadata = withSubmissionAiReview(processingSubmission.metadata, finalReview);

    await prisma.formSubmission.update({
      where: { id: submission.id },
      data: {
        metadata: toJsonInput(finalMetadata),
        aiReviewStatus: finalReview.status,
        hasUnresolvedAiWarning: finalReview.status === 'completed' && !!finalReview.reviewRequired,
      },
    });

    if (currentReview.emailNotificationPending) {
      await sendCompletionNotificationEmail({
        form: submission.form,
        submission: {
          ...processingSubmission,
          metadata: finalMetadata as Prisma.JsonObject,
        },
        uploads: submission.uploads,
        tenantTimeZone: await getTenantTimeZone(submission.form.tenantId),
      });
    }

    if (finalReview.status === 'completed') {
      completed += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed,
    completed,
    failed,
    skipped,
  };
}

export async function resolveFormSubmissionAiWarning(
  formId: string,
  submissionId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<ResolveFormSubmissionAiWarningResult> {
  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      formId,
      tenantId: params.tenantId,
    },
  });

  if (!submission) {
    throw new Error('Submission not found');
  }

  const aiReview = parseFormSubmissionAiReview(submission.metadata);
  if (!aiReview || aiReview.status !== 'completed' || !aiReview.reviewRequired) {
    throw new Error('No active AI warning to resolve');
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!trimmedReason) {
    throw new Error('Resolution reason is required');
  }

  const resolvedReview: FormSubmissionAiReview = {
    ...aiReview,
    resolvedWarningSignature: aiReview.warningSignature,
    resolvedAt: new Date().toISOString(),
    resolvedByUserId: params.userId,
    resolvedReason: trimmedReason.slice(0, 2000),
  };
  const metadataWithAiReview = withSubmissionAiReview(submission.metadata, resolvedReview);

  await prisma.formSubmission.update({
    where: { id: submission.id },
    data: {
      metadata: toJsonInput(metadataWithAiReview),
      hasUnresolvedAiWarning: false,
    },
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'UPDATE',
    entityType: 'FormSubmission',
    entityId: submission.id,
    entityName: submission.respondentName || submission.respondentEmail || submission.id,
    summary: `Resolved AI warning for response ${submission.id}`,
    reason: trimmedReason,
    changeSource: 'MANUAL',
  });

  return {
    id: submission.id,
    aiReview: resolvedReview,
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

    await tx.formSubmission.delete({
      where: { id: submission.id },
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
      tenant: {
        select: { logoUrl: true, name: true },
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
    formDescription: form.description,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
    fields: form.fields,
    answers,
    uploads,
    tenantLogoUrl: form.tenant?.logoUrl ?? null,
    tenantName: form.tenant?.name ?? null,
    formSettings: form.settings,
    timeZone: tenantTimeZone,
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

export async function listFormsWithWarnings(
  tenantId: string,
  limit: number = 8
): Promise<FormWarningListItem[]> {
  // Use the indexed hasUnresolvedAiWarning column to avoid a full table scan
  const submissions = await prisma.formSubmission.findMany({
    where: {
      tenantId,
      hasUnresolvedAiWarning: true,
      form: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      formId: true,
      submittedAt: true,
      form: {
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  });

  const warningsByForm = new Map<string, FormWarningListItem>();

  for (const submission of submissions) {
    const existing = warningsByForm.get(submission.formId);
    if (existing) {
      existing.warningCount += 1;
      continue;
    }

    warningsByForm.set(submission.formId, {
      formId: submission.formId,
      formTitle: submission.form.title,
      formSlug: submission.form.slug,
      formStatus: submission.form.status,
      latestSubmissionId: submission.id,
      latestSubmittedAt: submission.submittedAt,
      warningCount: 1,
    });
  }

  return Array.from(warningsByForm.values()).slice(0, limit);
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

  await prisma.form.update({
    where: { id: form.id },
    data: { viewsCount: { increment: 1 } },
  });

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

function applyDefaultTodayAnswers(
  fields: FormField[],
  inputAnswers: Record<string, unknown>
): Record<string, unknown> {
  const answers = { ...inputAnswers };
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const field of fields) {
    if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') continue;
    const validation = parseObject(field.validation);
    if (validation?.defaultToday !== true) continue;

    const currentValue = answers[field.key];
    if (Array.isArray(currentValue)) {
      answers[field.key] = currentValue.map((rowValue) => (isEmptyValue(rowValue) ? todayIso : rowValue));
      continue;
    }

    if (isEmptyValue(currentValue)) {
      answers[field.key] = todayIso;
    }
  }

  return answers;
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

async function deleteFormDraftsByIds(draftIds: string[]): Promise<number> {
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

async function loadDraftByAccess(input: {
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

  const answers = applyDefaultTodayAnswers(form.fields, toAnswerRecord(input.answers));
  const uploadIds = normalizeUploadIds(input.uploadIds);
  const uploadIdSet = new Set(uploadIds);
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

  await sendCompletionNotificationEmail({
    form,
    submission: submissionResult.submission,
    uploads: emailUploads,
    tenantTimeZone,
  });

  return submissionResult.submission;
}

async function getPublishedFormSubmissionContext(slug: string, submissionId: string) {
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
    formDescription: form.description,
    submittedAt: submission.submittedAt,
    respondentName: submission.respondentName,
    respondentEmail: submission.respondentEmail,
    status: submission.status,
    fields: form.fields,
    answers,
    uploads,
    tenantLogoUrl: form.tenant?.logoUrl ?? null,
    tenantName: form.tenant?.name ?? null,
    formSettings: form.settings,
    timeZone: tenantTimeZone,
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
    draftCode,
    resumeUrl,
  });

  const result = await sendEmail({ to: email, subject, html });
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
