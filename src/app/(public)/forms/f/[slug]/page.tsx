'use client';

import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronDown, Copy, Download, Info, Mail, PenLine, Plus, RotateCcw, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { SingleTimeInput } from '@/components/ui/single-time-input';
import { EsigningSignatureModal } from '@/components/esigning/signing/esigning-signature-modal';
import { Tooltip } from '@/components/ui/tooltip';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  WIDTH_CLASS,
  parseObject,
  parseChoiceOptions,
  parseFormDraftSettings,
  parseFormI18nSettings,
  isEmptyValue,
  evaluateCondition,
  isProgressStopInfoBlock,
  pruneHiddenConditionalAnswers,
  type PublicFormField as PublicField,
  type PublicFormDefinition,
} from '@/lib/form-utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DEFAULT_PHONE_COUNTRY_CODE, PHONE_COUNTRY_CODE_OPTIONS, getPhoneCountryCodeOptions } from '@/lib/constants/phone-country-codes';
import {
  COUNTRY_PRESET_OPTIONS,
  NATIONALITY_PRESET_OPTIONS,
  getLocalizedCountryPresetOptions,
  getLocalizedNationalityPresetOptions,
} from '@/lib/constants/form-option-presets';
import { TIMEZONE_OPTIONS } from '@/lib/constants/timezones';
import { cn } from '@/lib/utils';
import { extractSignatureDataUrl } from '@/lib/signature-utils';
import DOMPurify from 'dompurify';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_HINT_PATTERN = /(full[\s_-]?name|first[\s_-]?name|last[\s_-]?name|name)/i;
const EMAIL_HINT_PATTERN = /email/i;
const DATA_URI_PATTERN = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9.+_-]+=[a-z0-9.+_-]+)*;base64,/i;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CHOICE_RADIO_INPUT_CLASS = 'h-4 w-4 border-[#D8E3DF] bg-[#F4F7F6] accent-[#294D44]';
const CHOICE_CHECKBOX_INPUT_CLASS = 'h-4 w-4 rounded border-[#D8E3DF] bg-[#F4F7F6] accent-[#294D44]';
const ERROR_FIELD_CLASS = 'border-status-error/70 bg-status-error/5 focus:border-status-error focus:ring-status-error/20';
const ERROR_CHOICE_CLASS = 'border-status-error/70 bg-status-error/5 ring-1 ring-status-error/20';
const DEFAULT_TIMEZONE = 'Asia/Singapore';
const DEFAULT_UI_LABELS = {
  language_label: 'Language',
  back: 'Back',
  continue: 'Continue',
  submit: 'Submit',
  preview_mode: 'Preview mode',
  preview_notice: 'Preview mode. Publish the form to accept uploads and submissions.',
  page_progress: 'Page {current} of {total}',
  page_progress_short: '{current} of {total}',
  upload_file: 'Upload a file',
  upload_files: 'Upload files',
  replace_file: 'Replace file',
  add_more_files: 'Add more files',
  upload_drag_hint: 'or drag and drop here',
  upload_select_prompt: 'Select a file to upload',
  upload_select_multiple_prompt: 'Select one or more files to upload',
  uploading: 'Uploading...',
  upload_success: 'File uploaded successfully',
  upload_success_plural: 'Files uploaded successfully',
  upload_failed: 'Upload failed',
  uploaded_file_fallback: 'Uploaded file',
  upload_file_for_field: 'Upload file for {field}',
  upload_files_for_field: 'Upload files for {field}',
  remove_file: 'Remove file',
  add_row: 'Add row',
  remove_row: 'Remove row',
  phone_code_placeholder: 'Code',
  date_placeholder: 'dd mmm yyyy',
  select_option_placeholder: 'Select an option',
  choice_other_placeholder: 'Please specify',
  loading_form: 'Loading form...',
  information_image_alt: 'Information image',
  info_image_invalid_url: 'Add a valid image URL in field settings.',
  info_url_invalid_url: 'Add a valid URL in field settings.',
  organization_logo_alt: 'Organization logo',
  save_draft: 'Save draft',
  saving_draft: 'Saving draft...',
  draft_validity_notice_singular: 'Drafts stay available for {days} day.',
  draft_validity_notice_plural: 'Drafts stay available for {days} days.',
  copy_resume_link: 'Copy resume link',
  draft_saved_title: 'Draft saved',
  draft_expires_label: 'Expires',
  resume_link_label: 'Resume link',
  continue_editing: 'Continue editing',
  preview_upload_notice: 'Preview mode is read-only. Publish the form to accept uploads.',
  preview_save_draft_notice: 'Preview mode is read-only. Publish the form to save drafts.',
  draft_save_disabled_notice: 'Draft saving is not enabled for this form.',
  save_draft_failed: 'Failed to save draft',
  resume_draft_failed: 'Failed to resume draft',
  resume_link_unavailable: 'Resume link is unavailable on this browser.',
  resume_link_copied: 'Resume link copied.',
  resume_link_copy_failed: 'Failed to copy resume link.',
  draft_active: 'Draft active',
  update_draft: 'Update draft',
  updating_draft: 'Updating...',
  draft_updated: 'Updated',
  send_draft_to_email: 'Send to my email',
  draft_email_sent: 'Sent to {email}',
  draft_email_failed: 'Failed to send',
  draft_email_placeholder: 'name@example.com',
  response_submitted_title: 'Response submitted',
  response_submitted_description: 'Your response has been recorded.',
  preview_submit_notice: 'Preview mode is read-only. Publish the form to accept submissions.',
  submission_failed: 'Submission failed',
  download_pdf: 'Download PDF',
  download_expired_hint: 'Download link expired. Submit the form again to generate a new link.',
  email_pdf_copy: 'Email a PDF copy',
  email_pdf_placeholder: 'name@example.com',
  email_action_expired: 'This email action has expired. Please resubmit the form to request a PDF email.',
  email_invalid: 'Enter a valid email address',
  send: 'Send',
  email_send_failed: 'Failed to send email',
  email_sent_feedback: 'PDF link sent to {email}',
  signature_empty_title: 'Add your signature',
  signature_empty_hint: 'Draw, type, or upload your signature in a larger signing modal.',
  signature_open_action: 'Add signature',
  signature_added: 'Signature ready',
  signature_edit: 'Edit signature',
  signature_clear: 'Clear signature',
  signature_modal_title: 'Create your signature',
  signature_modal_confirm: 'Save signature',
  signature_modal_legal: 'By selecting "Save signature", I agree that this electronic signature represents my intent for this form.',
  signature_apply_all: 'Use this signature for all signature fields in this form',
  signature_name_label: 'Signer name',
  signature_name_fallback: 'Form respondent',
  validation_required: '{field} is required',
  validation_email: '{field} must be a valid email',
  validation_choice_detail: '{field}: please specify for {option}',
  invalid_value: 'Invalid value',
  payload_label: 'payload',
  dynamic_section_unsupported_field: 'This field type is not supported inside dynamic sections yet.',
} as const;

const LOCALE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁體）',
  ms: 'Melayu',
  id: 'Indonesia',
  th: 'ภาษาไทย',
  vi: 'Tiếng Việt',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  'pt-BR': 'Português (BR)',
  ar: 'العربية',
};

function getLocaleDisplayName(locale: string): string {
  return LOCALE_DISPLAY_NAMES[locale] ?? locale;
}

function interpolateUiLabel(
  template: string,
  values?: Record<string, string | number>
): string {
  if (!values) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    if (!(key in values)) return _match;
    return String(values[key]);
  });
}

type UploadStatus = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type DraftSession = {
  draftCode: string;
  accessToken: string;
  resumeUrl: string;
  expiresAt: string;
  savedAt: string;
};

type DraftRestorePayload = {
  draft: DraftSession;
  answers: Record<string, unknown>;
  metadata: Record<string, unknown>;
  uploadsByFieldKey: Record<string, UploadStatus[]>;
};

type RepeatSectionConfig = {
  id: string;
  minItems: number;
  maxItems: number | null;
  addLabel: string;
};

type ChoiceAnswerEntry = {
  value: string;
  detailText: string;
  children: ChoiceAnswerEntry[];
};

function matchesPresetOptions(
  options: ReturnType<typeof parseChoiceOptions>,
  preset: readonly string[]
): boolean {
  return options.length === preset.length && options.every((option, index) => option.label === preset[index]);
}

function localizePresetChoiceOptions(
  options: ReturnType<typeof parseChoiceOptions>,
  locale: string
): ReturnType<typeof parseChoiceOptions> {
  if (locale === 'en') return options;

  if (matchesPresetOptions(options, COUNTRY_PRESET_OPTIONS)) {
    const localizedOptions = getLocalizedCountryPresetOptions(locale);
    return options.map((option, index) => ({
      ...option,
      label: localizedOptions[index]?.label || option.label,
    }));
  }

  if (matchesPresetOptions(options, NATIONALITY_PRESET_OPTIONS)) {
    const localizedOptions = getLocalizedNationalityPresetOptions(locale);
    return options.map((option, index) => ({
      ...option,
      label: localizedOptions[index]?.label || option.label,
    }));
  }

  return options;
}

function withLocalizedFieldText(field: PublicField, fieldTranslation: Record<string, unknown> | null, locale: string): PublicField {
  if (!fieldTranslation) {
    const parsedOptions = parseChoiceOptions(field.options);
    if (parsedOptions.length === 0) return field;

    return {
      ...field,
      options: localizePresetChoiceOptions(parsedOptions, locale),
    };
  }

  const label = typeof fieldTranslation.label === 'string' && fieldTranslation.label.trim().length > 0
    ? fieldTranslation.label.trim()
    : field.label;
  const placeholder = typeof fieldTranslation.placeholder === 'string' && fieldTranslation.placeholder.trim().length > 0
    ? fieldTranslation.placeholder.trim()
    : field.placeholder;
  const subtext = typeof fieldTranslation.subtext === 'string' && fieldTranslation.subtext.trim().length > 0
    ? fieldTranslation.subtext.trim()
    : field.subtext;
  const helpText = typeof fieldTranslation.helpText === 'string' && fieldTranslation.helpText.trim().length > 0
    ? fieldTranslation.helpText.trim()
    : field.helpText;

  const optionTranslations = Array.isArray(fieldTranslation.options)
    ? fieldTranslation.options.map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      const optionTranslation = parseObject(entry);
      if (!optionTranslation) return '';
      return {
        label: typeof optionTranslation.label === 'string' ? optionTranslation.label.trim() : '',
        bodyHtml: typeof optionTranslation.bodyHtml === 'string' ? optionTranslation.bodyHtml.trim() : '',
      };
    })
    : [];

  let options = field.options;
  if (optionTranslations.length > 0) {
    const parsedOptions = parseChoiceOptions(field.options);
    if (parsedOptions.length > 0) {
      options = parsedOptions.map((option, index) => ({
        ...option,
        label: typeof optionTranslations[index] === 'string'
          ? optionTranslations[index]
          : optionTranslations[index]?.label || option.label,
        bodyHtml: typeof optionTranslations[index] === 'object'
          ? optionTranslations[index]?.bodyHtml || option.bodyHtml
          : option.bodyHtml,
      }));
    }
  } else {
    const parsedOptions = parseChoiceOptions(field.options);
    if (parsedOptions.length > 0) {
      options = localizePresetChoiceOptions(parsedOptions, locale);
    }
  }

  return {
    ...field,
    label,
    placeholder,
    subtext,
    helpText,
    options,
  };
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return null;
  if (DATA_URI_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function inferRespondentName(
  orderedFields: PublicField[],
  answersRecord: Record<string, unknown>
): string | null {
  const shortTextFields = orderedFields.filter((field) => field.type === 'SHORT_TEXT');
  const inferredNameField = shortTextFields.find((field) => {
    const hint = `${field.key} ${field.label || ''}`;
    return NAME_HINT_PATTERN.test(hint);
  });
  const fallbackNameAnswer = answersRecord.full_name ?? answersRecord.name;
  return normalizeOptionalText(
    inferredNameField ? answersRecord[inferredNameField.key] : fallbackNameAnswer,
    200
  );
}

function inferRespondentEmail(
  orderedFields: PublicField[],
  answersRecord: Record<string, unknown>
): string | null {
  const shortTextFields = orderedFields.filter((field) => field.type === 'SHORT_TEXT');
  const inferredEmailField = shortTextFields.find((field) => {
    const hint = `${field.key} ${field.label || ''}`;
    return field.inputType === 'email' || EMAIL_HINT_PATTERN.test(hint);
  });
  const fallbackEmailAnswer = answersRecord.email_address ?? answersRecord.email;
  const normalizedEmailCandidate = normalizeOptionalText(
    inferredEmailField ? answersRecord[inferredEmailField.key] : fallbackEmailAnswer,
    320
  );

  return normalizedEmailCandidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmailCandidate)
    ? normalizedEmailCandidate.toLowerCase()
    : null;
}

function toDomSafeId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'field';
}

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function collectUploadIds(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return UUID_PATTERN.test(trimmed) ? [trimmed] : [];
  }

  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  for (const item of value) {
    ids.push(...collectUploadIds(item));
  }
  return ids;
}

function formatDraftDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function isMultipleFileUploadEnabled(field: PublicField): boolean {
  if (field.type !== 'FILE_UPLOAD') return false;
  const validation = parseObject(field.validation);
  return validation?.allowMultipleFiles === true;
}

function normalizeDraftUploadsByFieldKey(value: unknown): Record<string, UploadStatus[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: Record<string, UploadStatus[]> = {};
  for (const [fieldKey, rawUploads] of Object.entries(value)) {
    const rawList = Array.isArray(rawUploads) ? rawUploads : [rawUploads];
    const uploads = rawList
      .filter((item): item is UploadStatus => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        fileName: typeof item.fileName === 'string' ? item.fileName : 'Uploaded file',
        mimeType: typeof item.mimeType === 'string' ? item.mimeType : 'application/octet-stream',
        sizeBytes: typeof item.sizeBytes === 'number' ? item.sizeBytes : 0,
      }))
      .filter((item) => item.id.length > 0);

    if (uploads.length > 0) {
      result[fieldKey] = uploads;
    }
  }

  return result;
}

function isTooltipEnabled(field: PublicField): boolean {
  const validation = parseObject(field.validation);
  return validation?.tooltipEnabled === true && typeof field.helpText === 'string' && field.helpText.trim().length > 0;
}

function getTooltipMode(field: PublicField): 'hover' | 'inline' {
  const validation = parseObject(field.validation);
  return validation?.tooltipMode === 'inline' ? 'inline' : 'hover';
}

function getTooltipInfoStyle(field: PublicField): React.CSSProperties {
  const validation = parseObject(field.validation);
  const top = parseInfoPaddingValue(validation?.tooltipInfoPaddingTopPx) ?? 8;
  const right = parseInfoPaddingValue(validation?.tooltipInfoPaddingRightPx) ?? 12;
  const bottom = parseInfoPaddingValue(validation?.tooltipInfoPaddingBottomPx) ?? 8;
  const left = parseInfoPaddingValue(validation?.tooltipInfoPaddingLeftPx) ?? 12;

  return {
    backgroundColor: normalizeHexColor(validation?.tooltipInfoBackgroundColor) || '#f8fafc',
    paddingTop: `${top}px`,
    paddingRight: `${right}px`,
    paddingBottom: `${bottom}px`,
    paddingLeft: `${left}px`,
  };
}

function isValidHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;

  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  return trimmed;
}

function getInfoBackgroundColor(field: PublicField): string | null {
  if (field.type !== 'PARAGRAPH') return null;
  const validation = parseObject(field.validation);
  if (validation?.infoBareStyle === true) return null;
  return normalizeHexColor(validation?.infoBackgroundColor);
}

function isBareInfoTextBlock(field: PublicField): boolean {
  const validation = parseObject(field.validation);
  const isTextBlock = field.inputType === 'info_text' || !field.inputType;
  return field.type === 'PARAGRAPH' && isTextBlock && validation?.infoBareStyle === true;
}

type InfoPadding = {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
};

function parseInfoPaddingValue(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : (typeof value === 'string' ? Number.parseInt(value, 10) : NaN);

  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.round(parsed);
  if (normalized < 0 || normalized > 80) return null;
  return normalized;
}

function getInfoPadding(field: PublicField): InfoPadding | null {
  if (field.type !== 'PARAGRAPH') return null;
  const validation = parseObject(field.validation);
  const fallbackPadding = parseInfoPaddingValue(validation?.infoPaddingPx);
  const top = parseInfoPaddingValue(validation?.infoPaddingTopPx) ?? fallbackPadding;
  const right = parseInfoPaddingValue(validation?.infoPaddingRightPx) ?? fallbackPadding;
  const bottom = parseInfoPaddingValue(validation?.infoPaddingBottomPx) ?? fallbackPadding;
  const left = parseInfoPaddingValue(validation?.infoPaddingLeftPx) ?? fallbackPadding;

  if (top === null && right === null && bottom === null && left === null) {
    return validation?.infoBareStyle === true ? { top: 0, right: 0, bottom: 0, left: 0 } : null;
  }

  return { top, right, bottom, left };
}

function isDateDefaultTodayEnabled(field: PublicField): boolean {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') return false;
  const validation = parseObject(field.validation);
  return validation?.defaultToday === true || validation?.alwaysDefaultToday === true;
}

function isDateAlwaysDefaultTodayEnabled(field: PublicField): boolean {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') return false;
  const validation = parseObject(field.validation);
  return validation?.alwaysDefaultToday === true;
}

function getConfiguredDefaultValue(field: PublicField, todayIso: string): unknown | null {
  if (field.type !== 'SHORT_TEXT' && field.type !== 'LONG_TEXT' && field.type !== 'DROPDOWN') return null;
  const validation = parseObject(field.validation);
  if (field.type === 'SHORT_TEXT' && field.inputType === 'date' && validation?.alwaysDefaultToday === true) {
    return todayIso;
  }

  const defaultValue = typeof validation?.defaultValue === 'string' ? validation.defaultValue : '';
  if (defaultValue.length > 0) {
    if (field.type === 'SHORT_TEXT' && field.inputType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(defaultValue)) {
      return null;
    }
    return defaultValue;
  }

  if (isDateDefaultTodayEnabled(field)) {
    return todayIso;
  }

  return null;
}

function applyAlwaysDefaultTodayAnswers(
  fields: PublicField[],
  inputAnswers: Record<string, unknown>,
  todayIso: string
): Record<string, unknown> {
  const next = { ...inputAnswers };
  let changed = false;

  for (const field of fields) {
    if (!isDateAlwaysDefaultTodayEnabled(field)) continue;

    const currentValue = next[field.key];
    if (Array.isArray(currentValue)) {
      const nextRows = currentValue.map(() => todayIso);
      if (JSON.stringify(nextRows) !== JSON.stringify(currentValue)) {
        next[field.key] = nextRows;
        changed = true;
      }
      continue;
    }

    if (currentValue !== todayIso) {
      next[field.key] = todayIso;
      changed = true;
    }
  }

  return changed ? next : inputAnswers;
}

function getDefaultMultipleChoiceValue(field: PublicField): unknown[] {
  if (field.type !== 'MULTIPLE_CHOICE') return [];
  return parseChoiceOptions(field.options)
    .filter((option) => option.defaultSelected || option.requiredSelected)
    .map((option) => buildChoiceAnswerValue(option));
}

function choiceEntryValue(entry: unknown): string {
  if (typeof entry === 'string') return entry.trim();
  const entryRecord = parseObject(entry);
  return typeof entryRecord?.value === 'string' ? entryRecord.value.trim() : '';
}

function buildChoiceAnswerValue(
  option: ReturnType<typeof parseChoiceOptions>[number],
  existingEntry?: unknown
): unknown {
  const existingRecord = parseObject(existingEntry);
  const existingChildren = parseChoiceAnswerEntries(existingRecord?.children);
  const defaultChildOptions = option.childOptions
    .filter((childOption) => childOption.defaultSelected || childOption.requiredSelected);
  const childOptionsToApply = option.childSelectionMode === 'single'
    ? defaultChildOptions.slice(0, 1)
    : defaultChildOptions;
  const childDefaults = childOptionsToApply.map((childOption) => buildChoiceAnswerValue(childOption));
  const childValues = new Set(existingChildren.map((entry) => entry.value));
  const missingChildDefaults = childDefaults.filter((childDefault) => !childValues.has(choiceEntryValue(childDefault)));
  const children = option.childSelectionMode === 'single'
    ? ([...existingChildren.map(serializeChoiceAnswerEntry), ...missingChildDefaults].slice(0, 1))
    : [...existingChildren.map(serializeChoiceAnswerEntry), ...missingChildDefaults];
  const detailText = typeof existingRecord?.detailText === 'string' ? existingRecord.detailText : '';

  if (!option.allowTextInput && children.length === 0 && !detailText) {
    return option.value;
  }

  return {
    value: option.value,
    detailText,
    ...(children.length > 0 ? { children } : {}),
  };
}

function serializeChoiceAnswerEntry(entry: ChoiceAnswerEntry): unknown {
  if (!entry.detailText && entry.children.length === 0) return entry.value;
  return {
    value: entry.value,
    detailText: entry.detailText,
    ...(entry.children.length > 0 ? { children: entry.children.map(serializeChoiceAnswerEntry) } : {}),
  };
}

function serializeChoiceAnswerEntries(entries: ChoiceAnswerEntry[]): unknown[] {
  return entries.map(serializeChoiceAnswerEntry);
}

function ensureRequiredMultipleChoiceValue(field: PublicField, value: unknown): unknown[] | null {
  if (field.type !== 'MULTIPLE_CHOICE' || !Array.isArray(value)) return null;
  const options = parseChoiceOptions(field.options);
  const requiredOptions = options.filter((option) => option.requiredSelected);
  const optionByValue = new Map(options.map((option) => [option.value, option]));
  if (requiredOptions.length === 0 && options.every((option) => option.childOptions.length === 0)) return null;

  const entries = parseChoiceAnswerEntries(value);
  const normalizedEntries = entries.map((entry) => {
    const option = optionByValue.get(entry.value);
    if (!option) return serializeChoiceAnswerEntry(entry);
    return buildChoiceAnswerValue(option, serializeChoiceAnswerEntry(entry));
  });
  const selectedValues = new Set(normalizedEntries.map(choiceEntryValue));
  const missingRequiredValues = requiredOptions
    .filter((option) => !selectedValues.has(option.value))
    .map((option) => buildChoiceAnswerValue(option));
  const nextValue = [...normalizedEntries, ...missingRequiredValues];

  return JSON.stringify(nextValue) === JSON.stringify(value) ? null : nextValue;
}

function getDefaultSingleChoiceValue(field: PublicField): unknown | null {
  if (field.type !== 'SINGLE_CHOICE') return null;
  const option = parseChoiceOptions(field.options).find((candidate) => candidate.defaultSelected);
  if (!option) return null;
  return option.allowTextInput ? { value: option.value, detailText: '' } : option.value;
}

function getChoiceOptionDisplayLabel(option: ReturnType<typeof parseChoiceOptions>[number]): string {
  return option.requiredSelected ? `${option.label} (Required)` : option.label;
}

function getLocalTodayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function resolveDateBoundary(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'today') return getLocalTodayIsoDate();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function addIsoDateDays(value: string, offsetDays: number): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function resolveRelativeDateBoundary(
  validation: Record<string, unknown> | null,
  fieldKeyName: 'minDateFieldKey' | 'maxDateFieldKey',
  offsetName: 'minDateOffsetDays' | 'maxDateOffsetDays',
  answersRecord: Record<string, unknown>
): string | undefined {
  const fieldKey = typeof validation?.[fieldKeyName] === 'string' ? validation[fieldKeyName].trim() : '';
  if (!fieldKey) return undefined;

  const referencedValue = answersRecord[fieldKey];
  if (typeof referencedValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(referencedValue.trim())) {
    return undefined;
  }

  const rawOffset = validation?.[offsetName];
  const offsetDays = typeof rawOffset === 'number' && Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0;
  return addIsoDateDays(referencedValue.trim(), offsetDays);
}

function getDateValidationRange(field: PublicField, answersRecord: Record<string, unknown>): { minDate?: string; maxDate?: string } {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') return {};
  const validation = parseObject(field.validation);
  const fixedMinDate = resolveDateBoundary(validation?.minDate);
  const fixedMaxDate = resolveDateBoundary(validation?.maxDate);
  const relativeMinDate = resolveRelativeDateBoundary(validation, 'minDateFieldKey', 'minDateOffsetDays', answersRecord);
  const relativeMaxDate = resolveRelativeDateBoundary(validation, 'maxDateFieldKey', 'maxDateOffsetDays', answersRecord);
  const minDate = [fixedMinDate, relativeMinDate].filter((value): value is string => !!value).sort().at(-1);
  const maxDate = [fixedMaxDate, relativeMaxDate].filter((value): value is string => !!value).sort()[0];

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

function buildAnswerContext(answersRecord: Record<string, unknown>, rowIndex?: number): Record<string, unknown> {
  if (rowIndex === undefined) return answersRecord;

  const context: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answersRecord)) {
    context[key] = Array.isArray(value) ? value[rowIndex] : value;
  }
  return context;
}

function evaluateNumberFormula(formula: string, answersRecord: Record<string, unknown>): number | null {
  const normalizedFormula = formula.trim().replace(/^(>=|<=|>|<|=)\s*/, '');
  const referenced = normalizedFormula.replace(/\[([a-zA-Z][a-zA-Z0-9_]*)\]/g, (_match, fieldKey: string) => {
    const resolved = normalizeNumberValue(answersRecord[fieldKey]);
    return resolved === null ? 'NaN' : String(resolved);
  });

  if (/[^0-9+\-*/().\s]/.test(referenced)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${referenced});`)();
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function getTextValidationError(field: PublicField, value: string, fieldLabel: string): string | null {
  const validation = parseObject(field.validation);

  if (typeof validation?.minLength === 'number' && value.length < validation.minLength) {
    return `${fieldLabel} must be at least ${validation.minLength} character${validation.minLength === 1 ? '' : 's'}.`;
  }
  if (typeof validation?.maxLength === 'number' && value.length > validation.maxLength) {
    return `${fieldLabel} must be at most ${validation.maxLength} character${validation.maxLength === 1 ? '' : 's'}.`;
  }
  if (typeof validation?.startsWith === 'string' && validation.startsWith.length > 0 && !value.startsWith(validation.startsWith)) {
    return `${fieldLabel} must begin with ${quoteValidationText(validation.startsWith)}.`;
  }
  if (typeof validation?.containsText === 'string' && validation.containsText.length > 0 && !value.includes(validation.containsText)) {
    return `${fieldLabel} must contain ${quoteValidationText(validation.containsText)}.`;
  }
  if (typeof validation?.notContainsText === 'string' && validation.notContainsText.length > 0 && value.includes(validation.notContainsText)) {
    return `${fieldLabel} must not contain ${quoteValidationText(validation.notContainsText)}.`;
  }
  if (typeof validation?.endsWith === 'string' && validation.endsWith.length > 0 && !value.endsWith(validation.endsWith)) {
    return `${fieldLabel} must end with ${quoteValidationText(validation.endsWith)}.`;
  }

  return null;
}

function getNumberValidationError(
  field: PublicField,
  value: unknown,
  fieldLabel: string,
  answersRecord: Record<string, unknown>
): string | null {
  if (value === null || value === undefined || value === '') return null;

  const numericValue = normalizeNumberValue(value);
  if (numericValue === null) {
    return `Enter a valid number for ${fieldLabel}.`;
  }

  const validation = parseObject(field.validation);
  if (typeof validation?.min === 'number' && numericValue < validation.min) {
    return `${fieldLabel} must be at least ${formatValidationNumber(validation.min)}.`;
  }
  if (typeof validation?.max === 'number' && numericValue > validation.max) {
    return `${fieldLabel} must be at most ${formatValidationNumber(validation.max)}.`;
  }
  if (typeof validation?.equal === 'number' && numericValue !== validation.equal) {
    return `${fieldLabel} must equal ${formatValidationNumber(validation.equal)}.`;
  }
  if (typeof validation?.minFormula === 'string' && validation.minFormula.trim().length > 0) {
    const resolved = evaluateNumberFormula(validation.minFormula, answersRecord);
    if (resolved !== null && numericValue < resolved) {
      return `${fieldLabel} must be at least ${formatValidationNumber(resolved)}.`;
    }
  }
  if (typeof validation?.maxFormula === 'string' && validation.maxFormula.trim().length > 0) {
    const resolved = evaluateNumberFormula(validation.maxFormula, answersRecord);
    if (resolved !== null && numericValue > resolved) {
      return `${fieldLabel} must be at most ${formatValidationNumber(resolved)}.`;
    }
  }
  if (typeof validation?.equalFormula === 'string' && validation.equalFormula.trim().length > 0) {
    const resolved = evaluateNumberFormula(validation.equalFormula, answersRecord);
    if (resolved !== null && numericValue !== resolved) {
      return `${fieldLabel} must equal ${formatValidationNumber(resolved)}.`;
    }
  }

  return null;
}

function isSplitPhoneCountryCodeEnabled(field: PublicField): boolean {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'phone') return false;
  const validation = parseObject(field.validation);
  return validation?.splitPhoneCountryCode === true;
}

function getPhoneDefaultCountryCode(field: PublicField): string {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'phone') return DEFAULT_PHONE_COUNTRY_CODE;
  const validation = parseObject(field.validation);
  const rawValue = typeof validation?.phoneDefaultCountryCode === 'string' ? validation.phoneDefaultCountryCode.trim() : '';
  const matched = PHONE_COUNTRY_CODE_OPTIONS.find((option) => option.value === rawValue);
  return matched?.value || DEFAULT_PHONE_COUNTRY_CODE;
}

function parsePhoneParts(value: unknown, defaultCountryCode: string): { countryCode: string; number: string } {
  if (typeof value !== 'string') {
    return { countryCode: defaultCountryCode, number: '' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { countryCode: defaultCountryCode, number: '' };
  }

  const match = trimmed.match(/^(\+\d{1,4})\s*(.*)$/);
  if (!match) {
    return { countryCode: defaultCountryCode, number: trimmed };
  }

  const matchedCode = PHONE_COUNTRY_CODE_OPTIONS.find((option) => option.value === match[1])?.value || defaultCountryCode;
  return {
    countryCode: matchedCode,
    number: match[2].trim(),
  };
}

function buildPhoneValue(countryCode: string, number: string): string {
  const trimmedNumber = number.trim();
  if (!trimmedNumber) return countryCode;
  return `${countryCode} ${trimmedNumber}`;
}

function getTimezoneDefault(field: PublicField): string {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'time_timezone') return DEFAULT_TIMEZONE;
  const validation = parseObject(field.validation);
  const rawValue = typeof validation?.timezoneDefault === 'string' ? validation.timezoneDefault.trim() : '';
  return TIMEZONE_OPTIONS.some((option) => option.value === rawValue) ? rawValue : DEFAULT_TIMEZONE;
}

function parseTimeTimezoneValue(value: unknown, defaultTimezone: string): { time: string; timezone: string } {
  const record = parseObject(value);
  const rawTime = typeof record?.time === 'string' ? record.time.trim() : '';
  const rawTimezone = typeof record?.timezone === 'string' ? record.timezone.trim() : '';
  const matchedTimezone = TIMEZONE_OPTIONS.some((option) => option.value === rawTimezone) ? rawTimezone : defaultTimezone;
  return {
    time: /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '',
    timezone: matchedTimezone,
  };
}

function buildTimeTimezoneValue(time: string, timezone: string): { time: string; timezone: string } {
  return {
    time,
    timezone: TIMEZONE_OPTIONS.some((option) => option.value === timezone) ? timezone : DEFAULT_TIMEZONE,
  };
}

function isChoiceInlineRightEnabled(field: PublicField): boolean {
  if (field.type !== 'SINGLE_CHOICE' && field.type !== 'MULTIPLE_CHOICE') return false;
  const validation = parseObject(field.validation);
  return validation?.choiceInlineRight === true;
}

function isLayoutBreakBeforeEnabled(field: PublicField): boolean {
  const validation = parseObject(field.validation);
  return validation?.layoutBreakBefore === true;
}

function hasHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function decodeHtmlEntities(value: string): string {
  if (typeof document === 'undefined') {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function richTextToPlainText(value: string): string {
  const decoded = decodeHtmlEntities(value || '');
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightRichTextHtml(value: string, searchTerm: string): string {
  const sanitized = DOMPurify.sanitize(value || '');
  const trimmedTerm = searchTerm.trim();
  if (!trimmedTerm) return sanitized;

  if (typeof document === 'undefined') return sanitized;

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  const matcher = new RegExp(escapeRegExp(trimmedTerm), 'gi');
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    if (walker.currentNode.textContent?.match(matcher)) {
      textNodes.push(walker.currentNode as Text);
    }
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    text.replace(matcher, (match, offset: number) => {
      if (offset > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
      }
      const mark = document.createElement('mark');
      mark.className = 'rounded bg-status-warning/25 px-0.5 text-inherit';
      mark.textContent = match;
      fragment.appendChild(mark);
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  const container = document.createElement('div');
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML;
}

function isRepeatStartMarker(field: PublicField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start';
}

function isRepeatEndMarker(field: PublicField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end';
}

function isBlockDivider(field: PublicField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'block_divider';
}

function getRepeatSectionConfig(startField: PublicField): RepeatSectionConfig {
  const validation = parseObject(startField.validation);
  const minItemsRaw = typeof validation?.repeatMinItems === 'number' ? Math.trunc(validation.repeatMinItems) : 1;
  const maxItemsRaw = typeof validation?.repeatMaxItems === 'number' ? Math.trunc(validation.repeatMaxItems) : null;
  const minItems = Math.max(1, Math.min(50, minItemsRaw));
  const maxItems = maxItemsRaw === null ? null : Math.max(minItems, Math.min(50, maxItemsRaw));
  const addLabelRaw = typeof validation?.repeatAddLabel === 'string' ? validation.repeatAddLabel.trim() : '';

  return {
    id: startField.id || startField.key,
    minItems,
    maxItems,
    addLabel: addLabelRaw || 'Add row',
  };
}

function getFieldErrorKey(fieldKey: string, rowIndex?: number): string {
  return rowIndex === undefined ? fieldKey : `${fieldKey}__${rowIndex}`;
}

function parseChoiceAnswerEntry(value: unknown): ChoiceAnswerEntry | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { value: trimmed, detailText: '', children: [] };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const answerValue = typeof record.value === 'string' ? record.value.trim() : '';
  if (!answerValue) return null;
  const detailText = typeof record.detailText === 'string' ? record.detailText : '';
  const children = parseChoiceAnswerEntries(record.children);
  return { value: answerValue, detailText, children };
}

function parseChoiceAnswerEntries(value: unknown): ChoiceAnswerEntry[] {
  if (!Array.isArray(value)) {
    const entry = parseChoiceAnswerEntry(value);
    return entry ? [entry] : [];
  }

  const entries: ChoiceAnswerEntry[] = [];
  for (const item of value) {
    const entry = parseChoiceAnswerEntry(item);
    if (!entry) continue;
    entries.push(entry);
  }
  return entries;
}

function getChoiceDetailValidationError(
  fieldLabel: string,
  options: ReturnType<typeof parseChoiceOptions>,
  value: unknown,
  template: string
): string | null {
  const entries = parseChoiceAnswerEntries(value);
  if (entries.length === 0) return null;

  const validateEntries = (
    availableOptions: ReturnType<typeof parseChoiceOptions>,
    selectedEntries: ChoiceAnswerEntry[]
  ): string | null => {
    for (const entry of selectedEntries) {
      const option = availableOptions.find((candidate) => candidate.value === entry.value);
      if (!option) continue;
      if (option.allowTextInput && entry.detailText.trim().length === 0) {
        return interpolateUiLabel(template, {
          field: fieldLabel,
          option: option.label,
        });
      }
      const childError = validateEntries(option.childOptions, entry.children);
      if (childError) return childError;
    }
    return null;
  };

  return validateEntries(options, entries);
}

function getChoiceDetailErrorValues(
  options: ReturnType<typeof parseChoiceOptions>,
  value: unknown
): Set<string> {
  const errorValues = new Set<string>();
  const entries = parseChoiceAnswerEntries(value);

  const collectErrors = (
    availableOptions: ReturnType<typeof parseChoiceOptions>,
    selectedEntries: ChoiceAnswerEntry[]
  ) => {
    for (const entry of selectedEntries) {
      const option = availableOptions.find((candidate) => candidate.value === entry.value);
      if (!option) continue;
      if (option.allowTextInput && entry.detailText.trim().length === 0) errorValues.add(entry.value);
      collectErrors(option.childOptions, entry.children);
    }
  };

  collectErrors(options, entries);

  return errorValues;
}

type RenderGroup = {
  kind: 'group';
  heading: PublicField | null;
  fields: PublicField[];
};

type RenderStandalone = {
  kind: 'standalone';
  field: PublicField;
};

type RenderItem = RenderGroup | RenderStandalone;

const NON_VALIDATABLE_FIELD_TYPES = new Set(['PARAGRAPH', 'HTML', 'HIDDEN']);

function isFaqField(field: Pick<PublicField, 'type' | 'inputType'>): boolean {
  return field.type === 'PARAGRAPH' && field.inputType === 'info_faq';
}

const CARD_ELIGIBLE_TYPES = new Set([
  'SHORT_TEXT',
  'LONG_TEXT',
  'DROPDOWN',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'FILE_UPLOAD',
  'SIGNATURE',
]);

function isHeadingInfoBlock(field: PublicField): boolean {
  return field.type === 'PARAGRAPH' && (
    field.inputType === 'info_heading_1' ||
    field.inputType === 'info_heading_2' ||
    field.inputType === 'info_heading_3'
  );
}

function isInlineInfoBlock(field: PublicField): boolean {
  const validation = parseObject(field.validation);
  return field.type === 'PARAGRAPH' && validation?.infoInlineCard === true;
}

function buildRenderGroups(fields: PublicField[]): RenderItem[] {
  const items: RenderItem[] = [];
  let currentGroup: RenderGroup | null = null;

  function flushGroup() {
    // Push group if it has fields OR a heading (heading-only groups still render the heading above an empty card slot)
    if (currentGroup && (currentGroup.fields.length > 0 || currentGroup.heading !== null)) {
      items.push(currentGroup);
    }
    currentGroup = null;
  }

  for (const field of fields) {
    // Hidden fields are pass-through standalone items.
    if (field.type === 'HIDDEN') {
      items.push({ kind: 'standalone', field });
      continue;
    }

    if (isBlockDivider(field)) {
      flushGroup();
      continue;
    }

    // Dynamic section start marker should stay inside the current card flow as a full-width row.
    if (isRepeatStartMarker(field)) {
      if (!currentGroup) {
        currentGroup = { kind: 'group', heading: null, fields: [] };
      }
      currentGroup.fields.push(field);
      continue;
    }

    // Dynamic section end marker is structural only; skip card grouping.
    if (isRepeatEndMarker(field)) {
      continue;
    }

    // Normal page breaks separate groups/pages.
    if (field.type === 'PAGE_BREAK') {
      flushGroup();
      items.push({ kind: 'standalone', field });
      continue;
    }

    // Note: repeat section markers (inputType === 'repeat_start'/'repeat_end') are PAGE_BREAK fields,
    // already captured as standalone above. They are handled in renderStandaloneField.

    if (isInlineInfoBlock(field)) {
      if (!currentGroup) {
        currentGroup = { kind: 'group', heading: null, fields: [] };
      }
      currentGroup.fields.push(field);
      continue;
    }

    // Heading blocks: flush current group, become next group's heading
    if (isHeadingInfoBlock(field)) {
      flushGroup();
      currentGroup = { kind: 'group', heading: field, fields: [] };
      continue;
    }

    // Other display-only content: standalone
    if (field.type === 'PARAGRAPH' || field.type === 'HTML') {
      flushGroup();
      items.push({ kind: 'standalone', field });
      continue;
    }

    // Card-eligible: add to current group (start one if needed)
    if (CARD_ELIGIBLE_TYPES.has(field.type)) {
      if (!currentGroup) {
        currentGroup = { kind: 'group', heading: null, fields: [] };
      }
      currentGroup.fields.push(field);
      continue;
    }

    // Anything else: standalone
    flushGroup();
    items.push({ kind: 'standalone', field });
  }

  flushGroup();
  return items;
}

function getDefaultFaqExpandedIds(items: Array<{ id: string }>, defaultState: string): Set<string> {
  if (defaultState === 'expanded') {
    return new Set(items.map((item) => item.id));
  }
  if (defaultState === 'first_expanded' && items[0]) {
    return new Set([items[0].id]);
  }
  return new Set();
}

function FaqField({ field }: { field: PublicField }) {
  const validation = parseObject(field.validation);
  const defaultState = typeof validation?.faqDefaultState === 'string' ? validation.faqDefaultState : 'collapsed';
  const searchEnabled = validation?.faqSearchEnabled !== false;
  const mainToggleEnabled = validation?.faqMainToggleEnabled === true;
  const mainDefaultExpanded = !mainToggleEnabled || validation?.faqMainDefaultExpanded === true;
  const items = useMemo(() => (
    parseChoiceOptions(field.options).map((option, index) => ({
      id: option.value || `${field.id}-${index}`,
      headerHtml: option.label || `Question ${index + 1}`,
      bodyHtml: option.bodyHtml || '',
      searchableText: `${richTextToPlainText(option.label || '')} ${richTextToPlainText(option.bodyHtml || '')}`.toLowerCase(),
    }))
  ), [field.id, field.options]);

  const [mainExpanded, setMainExpanded] = useState(mainDefaultExpanded);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(() => getDefaultFaqExpandedIds(items, defaultState));
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    setMainExpanded(mainDefaultExpanded);
  }, [field.id, mainDefaultExpanded]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (debouncedSearchTerm) return;
    setExpandedItemIds(getDefaultFaqExpandedIds(items, defaultState));
  }, [items, defaultState, debouncedSearchTerm]);

  const normalizedSearchTerm = debouncedSearchTerm.toLowerCase();
  const visibleItems = useMemo(() => (
    normalizedSearchTerm
      ? items.filter((item) => item.searchableText.includes(normalizedSearchTerm))
      : items
  ), [items, normalizedSearchTerm]);

  useEffect(() => {
    if (!normalizedSearchTerm) return;
    setExpandedItemIds(new Set(visibleItems.map((item) => item.id)));
  }, [normalizedSearchTerm, visibleItems]);

  function toggleItem(itemId: string) {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedItemIds(new Set(visibleItems.map((item) => item.id)));
  }

  function collapseAll() {
    setExpandedItemIds(new Set());
  }

  const headerContent = field.label || 'Commonly Asked Questions';
  const bodyVisible = !mainToggleEnabled || mainExpanded;

  return (
    <div key={field.id} className="rounded-lg border border-[#D8E3DF] bg-[#F8FAF9] shadow-sm">
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
          !mainToggleEnabled && 'cursor-default'
        )}
        onClick={() => {
          if (mainToggleEnabled) setMainExpanded((current) => !current);
        }}
        aria-expanded={bodyVisible}
      >
        <div
          className="form-rich-render faq-rich-header text-sm text-text-primary"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(headerContent) }}
        />
        {mainToggleEnabled && (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200', bodyVisible && 'rotate-180')} />
        )}
      </button>

      {bodyVisible && (
        <div className="space-y-3 border-t border-border-primary/70 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {searchEnabled ? (
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search FAQ"
                className="min-h-10 flex-1 rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary outline-none transition-all duration-150 focus:border-[#294D44] focus:ring-2 focus:ring-[#294D44]/20"
              />
            ) : <div />}
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                onClick={expandAll}
              >
                Expand all
              </button>
              <button
                type="button"
                className="rounded border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                onClick={collapseAll}
              >
                Collapse all
              </button>
            </div>
          </div>

          {visibleItems.length === 0 ? (
            <p className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-secondary">
              No matching questions.
            </p>
          ) : (
            <div className="divide-y divide-border-primary overflow-hidden rounded-lg border border-border-primary bg-background-primary">
              {visibleItems.map((item) => {
                const isExpanded = expandedItemIds.has(item.id);
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-background-secondary/70"
                      onClick={() => toggleItem(item.id)}
                      aria-expanded={isExpanded}
                    >
                      <div
                        className="form-rich-render faq-rich-header text-sm font-medium text-text-primary"
                        dangerouslySetInnerHTML={{ __html: highlightRichTextHtml(item.headerHtml, debouncedSearchTerm) }}
                      />
                      <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </button>
                    {isExpanded && (
                      <div
                        className="form-rich-render px-3 pb-3 text-sm text-text-secondary"
                        dangerouslySetInnerHTML={{ __html: highlightRichTextHtml(item.bodyHtml, debouncedSearchTerm) }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hasActiveProgressStopInfoBlock(
  pageFields: PublicField[],
  answersRecord: Record<string, unknown>,
  repeatCounts: Record<string, number>,
  allFields: PublicField[]
): boolean {
  for (let index = 0; index < pageFields.length; index += 1) {
    const field = pageFields[index];

    if (isRepeatStartMarker(field)) {
      const sectionVisible = evaluateCondition(field.condition, answersRecord, { fields: allFields });
      const sectionConfig = getRepeatSectionConfig(field);
      const sectionFields: PublicField[] = [];
      let cursor = index + 1;

      while (cursor < pageFields.length && !isRepeatEndMarker(pageFields[cursor])) {
        if (pageFields[cursor].type !== 'PAGE_BREAK') {
          sectionFields.push(pageFields[cursor]);
        }
        cursor += 1;
      }

      if (sectionVisible) {
        const rowCount = repeatCounts[sectionConfig.id] || sectionConfig.minItems;
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
          const rowAnswers = buildAnswerContext(answersRecord, rowIndex);
          for (const sectionField of sectionFields) {
            if (
              isProgressStopInfoBlock(sectionField) &&
              evaluateCondition(sectionField.condition, rowAnswers, { fields: sectionFields })
            ) {
              return true;
            }
          }
        }
      }

      index = cursor;
      continue;
    }

    if (isRepeatEndMarker(field) || isBlockDivider(field) || field.type === 'PAGE_BREAK') continue;
    if (isProgressStopInfoBlock(field) && evaluateCondition(field.condition, answersRecord, { fields: allFields })) {
      return true;
    }
  }

  return false;
}

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const requestedLocale = searchParams.get('lang');
  const requestedDraftCode = searchParams.get('draft');
  const requestedDraftToken = searchParams.get('resume');
  const isEmbed = searchParams.get('embed') === '1';
  const isPreview = searchParams.get('preview') === '1';
  const previewFormId = searchParams.get('formId');
  const previewTenantId = searchParams.get('tenantId');
  const [form, setForm] = useState<PublicFormDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [pdfDownloadToken, setPdfDownloadToken] = useState<string | null>(null);
  const [pdfEmailAccessToken, setPdfEmailAccessToken] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [dragOverUploadFieldKey, setDragOverUploadFieldKey] = useState<string | null>(null);
  const [uploadedByFieldKey, setUploadedByFieldKey] = useState<Record<string, UploadStatus[]>>({});
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const [pendingDraftRestore, setPendingDraftRestore] = useState<DraftRestorePayload | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  const [draftBannerFeedback, setDraftBannerFeedback] = useState<string | null>(null);
  const [isFirstDraftSave, setIsFirstDraftSave] = useState(true);
  const [isDraftDetailsModalOpen, setIsDraftDetailsModalOpen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDraftEmailExpanded, setIsDraftEmailExpanded] = useState(false);
  const [draftEmailInput, setDraftEmailInput] = useState('');
  const [isDraftEmailSending, setIsDraftEmailSending] = useState(false);
  const [draftEmailFeedback, setDraftEmailFeedback] = useState<string | null>(null);
  const [draftEmailError, setDraftEmailError] = useState<string | null>(null);
  const [draftEmailSent, setDraftEmailSent] = useState(false);
  const [repeatSectionCounts, setRepeatSectionCounts] = useState<Record<string, number>>({});
  const [pdfRecipientEmail, setPdfRecipientEmail] = useState('');
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [activeSignatureFieldKey, setActiveSignatureFieldKey] = useState<string | null>(null);
  const [openInlineTooltips, setOpenInlineTooltips] = useState<Record<string, boolean>>({});
  const formTopRef = useRef<HTMLDivElement | null>(null);

  const i18nSettings = useMemo(
    () => parseFormI18nSettings(form?.settings),
    [form?.settings]
  );

  const draftSettings = useMemo(
    () => parseFormDraftSettings(form?.settings),
    [form?.settings]
  );

  const activeLocale = useMemo(() => {
    if (requestedLocale && i18nSettings.enabledLocales.includes(requestedLocale)) {
      return requestedLocale;
    }
    return i18nSettings.defaultLocale;
  }, [i18nSettings.defaultLocale, i18nSettings.enabledLocales, requestedLocale]);

  const activeLocaleTranslation = useMemo(
    () => i18nSettings.translations[activeLocale] || { form: {}, fields: {}, ui: {} },
    [i18nSettings.translations, activeLocale]
  );

  const localizedFormTitle = useMemo(
    () => (activeLocaleTranslation.form.title && activeLocaleTranslation.form.title.trim().length > 0
      ? activeLocaleTranslation.form.title.trim()
      : (form?.title || '')),
    [activeLocaleTranslation.form.title, form?.title]
  );

  const localizedFormDescription = useMemo(
    () => (activeLocaleTranslation.form.description && activeLocaleTranslation.form.description.trim().length > 0
      ? activeLocaleTranslation.form.description.trim()
      : (form?.description || null)),
    [activeLocaleTranslation.form.description, form?.description]
  );

  const localizedUiLabels = useMemo(
    () => ({ ...DEFAULT_UI_LABELS, ...(activeLocaleTranslation.ui || {}) }),
    [activeLocaleTranslation.ui]
  );

  const uiLabel = useCallback((
    key: keyof typeof DEFAULT_UI_LABELS,
    values?: Record<string, string | number>
  ): string => {
    return interpolateUiLabel(localizedUiLabels[key], values);
  }, [localizedUiLabels]);

  const draftValidityNotice = draftSettings.autoDeleteDays === 1
    ? uiLabel('draft_validity_notice_singular', { days: draftSettings.autoDeleteDays })
    : uiLabel('draft_validity_notice_plural', { days: draftSettings.autoDeleteDays });

  const localizedPhoneCountryCodeOptions = useMemo(
    () => getPhoneCountryCodeOptions(activeLocale),
    [activeLocale]
  );

  const shouldShowLogo = useMemo(() => {
    if (!form?.tenantLogoUrl) return false;
    const settingsObj = (form.settings && typeof form.settings === 'object' && !Array.isArray(form.settings))
      ? form.settings as Record<string, unknown>
      : {};
    return settingsObj.hideLogo !== true;
  }, [form?.tenantLogoUrl, form?.settings]);

  const shouldShowFooter = useMemo(() => {
    if (!form?.tenantName) return false;
    const settingsObj = (form.settings && typeof form.settings === 'object' && !Array.isArray(form.settings))
      ? form.settings as Record<string, unknown>
      : {};
    return settingsObj.hideFooter !== true;
  }, [form?.tenantName, form?.settings]);

  const canSwitchLanguage = i18nSettings.allowLocaleSwitch && i18nSettings.enabledLocales.length > 1;

  const orderedFields = useMemo(() => {
    if (!form) return [] as PublicField[];

    return form.fields
      .map((field, index) => ({ field, index }))
      .sort((a, b) => {
        const positionA = Number.isFinite(a.field.position) ? a.field.position : a.index;
        const positionB = Number.isFinite(b.field.position) ? b.field.position : b.index;
        if (positionA !== positionB) return positionA - positionB;
        return a.index - b.index;
      })
      .map((entry) => entry.field);
  }, [form]);

  const conditionEvaluationOptions = useMemo(() => ({ fields: orderedFields }), [orderedFields]);

  const detectedEmailFromForm = useMemo(() => {
    return inferRespondentEmail(orderedFields, answers) ?? '';
  }, [orderedFields, answers]);

  const inferredRespondentName = useMemo(
    () => inferRespondentName(orderedFields, answers),
    [orderedFields, answers]
  );

  const signatureFieldKeys = useMemo(
    () =>
      orderedFields
        .filter((field) => field.type === 'SIGNATURE' && !field.isReadOnly)
        .map((field) => field.key),
    [orderedFields]
  );

  const activeSignatureValue = useMemo(() => {
    if (!activeSignatureFieldKey) {
      return null;
    }

    return extractSignatureDataUrl(answers[activeSignatureFieldKey]);
  }, [activeSignatureFieldKey, answers]);

  const localizedFieldsById = useMemo(() => {
    const fieldMap = new Map<string, PublicField>();
    const localizedFieldTranslations = activeLocaleTranslation.fields || {};

    for (const field of orderedFields) {
      const fieldTranslation = parseObject(localizedFieldTranslations[field.key]);
      fieldMap.set(field.id, withLocalizedFieldText(field, fieldTranslation, activeLocale));
    }

    return fieldMap;
  }, [orderedFields, activeLocaleTranslation.fields, activeLocale]);

  function getLocalizedField(field: PublicField): PublicField {
    return localizedFieldsById.get(field.id) || field;
  }

  function scrollToFormTop() {
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const replaceDraftQuery = useCallback((nextDraft: DraftSession | null) => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (nextDraft) {
      params.set('draft', nextDraft.draftCode);
      params.set('resume', nextDraft.accessToken);
    } else {
      params.delete('draft');
      params.delete('resume');
    }

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  }, []);

  const applyResolvedDraftPayload = useCallback((
    draftData: Record<string, unknown>,
    fallbackDraftCode: string,
    fallbackAccessToken?: string,
    options?: { syncUrl?: boolean; feedback?: string | null }
  ) => {
    const nextDraft: DraftSession = {
      draftCode: typeof draftData.draftCode === 'string' ? draftData.draftCode : fallbackDraftCode,
      accessToken: typeof draftData.accessToken === 'string'
        ? draftData.accessToken
        : (fallbackAccessToken || ''),
      resumeUrl: typeof draftData.resumeUrl === 'string' ? draftData.resumeUrl : '',
      expiresAt: typeof draftData.expiresAt === 'string' ? draftData.expiresAt : '',
      savedAt: typeof draftData.savedAt === 'string' ? draftData.savedAt : '',
    };

    if (draftData.answers && typeof draftData.answers === 'object' && !Array.isArray(draftData.answers)) {
      setPendingDraftRestore({
        draft: nextDraft,
        answers: draftData.answers as Record<string, unknown>,
        metadata: draftData.metadata && typeof draftData.metadata === 'object' && !Array.isArray(draftData.metadata)
          ? draftData.metadata as Record<string, unknown>
          : {},
        uploadsByFieldKey: normalizeDraftUploadsByFieldKey(draftData.uploadsByFieldKey),
      });
    }
    setDraftSession(nextDraft);
    setIsFirstDraftSave(false);
    if (options && 'feedback' in options) {
      setDraftError(null);
      setDraftFeedback(options.feedback ?? null);
    }
    if (options?.syncUrl !== false) {
      replaceDraftQuery(nextDraft);
    }
  }, [replaceDraftQuery]);

  useEffect(() => {
    let isCancelled = false;

    async function loadForm() {
      try {
        setLoading(true);
        setError(null);
        setDraftFeedback(null);
        const endpoint = isPreview && previewFormId
          ? `/api/forms/${previewFormId}${previewTenantId ? `?tenantId=${encodeURIComponent(previewTenantId)}` : ''}`
          : `/api/public-bootstrap/forms/${slug}`;

        const response = await fetch(endpoint);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load form');
        }

        const resolvedForm = isPreview && previewFormId
          ? {
            id: data.id,
            slug: data.slug || slug,
            title: data.title,
            description: data.description || null,
            fields: Array.isArray(data.fields) ? data.fields : [],
            status: data.status,
            settings: data.settings ?? null,
            tenantLogoUrl: data.tenantLogoUrl ?? null,
            tenantName: data.tenantName ?? null,
          } as PublicFormDefinition
          : data.form as PublicFormDefinition;

        if (!isCancelled) {
          setForm(resolvedForm);
          setAnswers({});
          setFieldErrors({});
          setCurrentPage(0);
          setUploadedByFieldKey({});
          setOpenInlineTooltips({});
          setDraftSession(null);
          setPendingDraftRestore(null);
        }

        if (
          !isCancelled &&
          !isPreview &&
          requestedDraftCode &&
          parseFormDraftSettings(resolvedForm.settings).enabled
        ) {
          try {
            const draftResumeQuery = requestedDraftToken
              ? `?token=${encodeURIComponent(requestedDraftToken)}`
              : '';
            const draftResponse = await fetch(
              `/api/forms/public/${slug}/drafts/${encodeURIComponent(requestedDraftCode)}${draftResumeQuery}`
            );
            const draftData = await draftResponse.json();

            if (!draftResponse.ok) {
              throw new Error(draftData.error || DEFAULT_UI_LABELS.resume_draft_failed);
            }

            if (!isCancelled) {
              applyResolvedDraftPayload(
                draftData as Record<string, unknown>,
                requestedDraftCode,
                requestedDraftToken || undefined,
                {
                  syncUrl: true,
                  feedback: null,
                }
              );
            }
          } catch (err) {
            if (!isCancelled) {
              setDraftFeedback(err instanceof Error ? err.message : DEFAULT_UI_LABELS.resume_draft_failed);
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load form');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    if (slug) {
      loadForm();
    }

    return () => {
      isCancelled = true;
    };
  }, [slug, isPreview, previewFormId, previewTenantId, requestedDraftCode, requestedDraftToken, applyResolvedDraftPayload]);

  useEffect(() => {
    if (!form) {
      setRepeatSectionCounts({});
      return;
    }

    const nextCounts: Record<string, number> = {};
    for (const field of orderedFields) {
      if (!isRepeatStartMarker(field)) continue;
      const config = getRepeatSectionConfig(field);
      nextCounts[config.id] = config.minItems;
    }

    setRepeatSectionCounts(nextCounts);
  }, [form, orderedFields]);

  useEffect(() => {
    if (!form || !pendingDraftRestore) return;

    setAnswers(applyAlwaysDefaultTodayAnswers(
      orderedFields,
      pendingDraftRestore.answers,
      getLocalTodayIsoDate()
    ));
    setUploadedByFieldKey(pendingDraftRestore.uploadsByFieldKey);

    const metadataRepeatCounts = pendingDraftRestore.metadata.repeatSectionCounts;
    if (metadataRepeatCounts && typeof metadataRepeatCounts === 'object' && !Array.isArray(metadataRepeatCounts)) {
      setRepeatSectionCounts((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(metadataRepeatCounts)) {
          if (typeof value !== 'number' || !Number.isFinite(value)) continue;
          next[key] = Math.max(1, Math.min(50, Math.trunc(value)));
        }
        return next;
      });
    }

    setPendingDraftRestore(null);
  }, [form, pendingDraftRestore, orderedFields]);

  useEffect(() => {
    if (!form) return;

    const todayIso = getLocalTodayIsoDate();

    setAnswers((prev) => {
      const next = { ...prev };
      let changed = false;

      for (let index = 0; index < orderedFields.length; index += 1) {
        const field = orderedFields[index];

        if (isRepeatStartMarker(field)) {
          const sectionConfig = getRepeatSectionConfig(field);
          const rowCount = repeatSectionCounts[sectionConfig.id] || sectionConfig.minItems;
          const sectionFields: PublicField[] = [];

          let cursor = index + 1;
          while (cursor < orderedFields.length && !isRepeatEndMarker(orderedFields[cursor])) {
            if (orderedFields[cursor].type !== 'PAGE_BREAK') {
              sectionFields.push(orderedFields[cursor]);
            }
            cursor += 1;
          }

          for (const sectionField of sectionFields) {
            const existingRows = Array.isArray(next[sectionField.key]) ? [...(next[sectionField.key] as unknown[])] : [];
            for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
              const rowValue = existingRows[rowIndex];
              if (isDateAlwaysDefaultTodayEnabled(sectionField)) {
                if (rowValue !== todayIso) {
                  existingRows[rowIndex] = todayIso;
                  changed = true;
                }
                continue;
              }

              if (!(rowIndex in existingRows)) {
                const defaultValue = getConfiguredDefaultValue(sectionField, todayIso);
                if (defaultValue !== null) {
                  existingRows[rowIndex] = defaultValue;
                  changed = true;
                  continue;
                }
              }

              if (sectionField.type === 'SINGLE_CHOICE' && isEmptyValue(rowValue)) {
                const defaultValue = getDefaultSingleChoiceValue(sectionField);
                if (defaultValue === null) continue;
                existingRows[rowIndex] = defaultValue;
                changed = true;
                continue;
              }

              if (sectionField.type === 'MULTIPLE_CHOICE' && isEmptyValue(rowValue)) {
                const defaultValue = getDefaultMultipleChoiceValue(sectionField);
                if (defaultValue.length === 0) continue;
                existingRows[rowIndex] = defaultValue;
                changed = true;
                continue;
              }

              const nextRequiredValue = ensureRequiredMultipleChoiceValue(sectionField, rowValue);
              if (nextRequiredValue) {
                existingRows[rowIndex] = nextRequiredValue;
                changed = true;
              }
            }
            if (existingRows.length > 0) {
              next[sectionField.key] = existingRows;
            }
          }

          index = cursor;
          continue;
        }

        if (field.type === 'PAGE_BREAK' || isRepeatEndMarker(field)) continue;

        const existingValue = next[field.key];
        if (isDateAlwaysDefaultTodayEnabled(field)) {
          if (existingValue !== todayIso) {
            next[field.key] = todayIso;
            changed = true;
          }
          continue;
        }

        if (!(field.key in next)) {
          const defaultValue = getConfiguredDefaultValue(field, todayIso);
          if (defaultValue !== null) {
            next[field.key] = defaultValue;
            changed = true;
            continue;
          }
        }

        if (field.type === 'SINGLE_CHOICE' && isEmptyValue(existingValue)) {
          const defaultValue = getDefaultSingleChoiceValue(field);
          if (defaultValue === null) continue;
          next[field.key] = defaultValue;
          changed = true;
          continue;
        }

        if (field.type === 'MULTIPLE_CHOICE' && isEmptyValue(existingValue)) {
          const defaultValue = getDefaultMultipleChoiceValue(field);
          if (defaultValue.length === 0) continue;
          next[field.key] = defaultValue;
          changed = true;
          continue;
        }

        const nextRequiredValue = ensureRequiredMultipleChoiceValue(field, existingValue);
        if (nextRequiredValue) {
          next[field.key] = nextRequiredValue;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [form, orderedFields, repeatSectionCounts]);

  const pages = useMemo(() => {
    if (!form) return [] as PublicField[][];

    const result: PublicField[][] = [[]];
    for (const field of orderedFields) {
      if (
        field.type === 'PAGE_BREAK' &&
        !isBlockDivider(field) &&
        !isRepeatStartMarker(field) &&
        !isRepeatEndMarker(field) &&
        evaluateCondition(field.condition, answers, conditionEvaluationOptions)
      ) {
        result.push([]);
      } else {
        result[result.length - 1].push(field);
      }
    }

    return result.filter((page) => page.length > 0);
  }, [form, orderedFields, answers, conditionEvaluationOptions]);

  useEffect(() => {
    if (currentPage < pages.length) return;
    setCurrentPage(Math.max(0, pages.length - 1));
  }, [currentPage, pages.length]);

  const visibleFields = useMemo(() => {
    const pageFields = pages[currentPage] || [];
    const nextVisible: PublicField[] = [];

    for (let index = 0; index < pageFields.length; index += 1) {
      const field = pageFields[index];

      if (isRepeatStartMarker(field)) {
        const sectionFields: PublicField[] = [];
        let cursor = index + 1;

        while (cursor < pageFields.length && !isRepeatEndMarker(pageFields[cursor])) {
          sectionFields.push(pageFields[cursor]);
          cursor += 1;
        }

        const endMarker = cursor < pageFields.length ? pageFields[cursor] : null;
        const sectionVisible = evaluateCondition(field.condition, answers, conditionEvaluationOptions);

        if (sectionVisible) {
          nextVisible.push(field);
          for (const sectionField of sectionFields) {
            if (sectionField.type !== 'PAGE_BREAK') {
              nextVisible.push(sectionField);
            }
          }
          if (endMarker) {
            nextVisible.push(endMarker);
          }
        }

        index = cursor;
        continue;
      }

      if (isRepeatEndMarker(field)) continue;
      if (evaluateCondition(field.condition, answers, conditionEvaluationOptions)) {
        nextVisible.push(field);
      }
    }

    return nextVisible;
  }, [pages, currentPage, answers, conditionEvaluationOptions]);

  const firstProgressStopPage = useMemo(() => (
    pages.findIndex((pageFields) => hasActiveProgressStopInfoBlock(pageFields, answers, repeatSectionCounts, orderedFields))
  ), [pages, answers, repeatSectionCounts, orderedFields]);

  const isCurrentPageProgressStopped = firstProgressStopPage === currentPage;

  useEffect(() => {
    if (firstProgressStopPage < 0 || currentPage <= firstProgressStopPage) return;
    setCurrentPage(firstProgressStopPage);
    scrollToFormTop();
  }, [currentPage, firstProgressStopPage]);

  // Pre-compute which field IDs belong inside repeat sections (should not render as standalone)
  const hiddenFieldIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < visibleFields.length; i++) {
      const field = visibleFields[i];
      if (!isRepeatStartMarker(field)) continue;
      let cursor = i + 1;
      while (cursor < visibleFields.length) {
        const candidate = visibleFields[cursor];
        if (isRepeatEndMarker(candidate)) {
          ids.add(candidate.id);
          break;
        }
        if (isRepeatStartMarker(candidate)) break;
        ids.add(candidate.id);
        cursor += 1;
      }
    }
    return ids;
  }, [visibleFields]);

  function handleLocaleChange(nextLocale: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextLocale === i18nSettings.defaultLocale) {
      params.delete('lang');
    } else {
      params.set('lang', nextLocale);
    }

    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl);
  }

  const withDefaultAnswers = useCallback((baseAnswers: Record<string, unknown>, allowedFieldIds?: Set<string>): Record<string, unknown> => {
    if (!form) return baseAnswers;

    const todayIso = getLocalTodayIsoDate();
    const next = { ...baseAnswers };
    let changed = false;

    for (let index = 0; index < orderedFields.length; index += 1) {
      const field = orderedFields[index];
      if (allowedFieldIds && !allowedFieldIds.has(field.id)) continue;

      if (isRepeatStartMarker(field)) {
        const sectionConfig = getRepeatSectionConfig(field);
        const rowCount = repeatSectionCounts[sectionConfig.id] || sectionConfig.minItems;
        const sectionFields: PublicField[] = [];

        let cursor = index + 1;
        while (cursor < orderedFields.length && !isRepeatEndMarker(orderedFields[cursor])) {
          if (orderedFields[cursor].type !== 'PAGE_BREAK' && (!allowedFieldIds || allowedFieldIds.has(orderedFields[cursor].id))) {
            sectionFields.push(orderedFields[cursor]);
          }
          cursor += 1;
        }

        for (const sectionField of sectionFields) {
          const existingRows = Array.isArray(next[sectionField.key]) ? [...(next[sectionField.key] as unknown[])] : [];
          let sectionChanged = false;

          for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
            const rowValue = existingRows[rowIndex];
            if (!(rowIndex in existingRows)) {
              const defaultValue = getConfiguredDefaultValue(sectionField, todayIso);
              if (defaultValue !== null) {
                existingRows[rowIndex] = defaultValue;
                sectionChanged = true;
                continue;
              }
            }

            if (sectionField.type === 'SINGLE_CHOICE' && isEmptyValue(rowValue)) {
              const defaultValue = getDefaultSingleChoiceValue(sectionField);
              if (defaultValue === null) continue;
              existingRows[rowIndex] = defaultValue;
              sectionChanged = true;
              continue;
            }

            if (sectionField.type === 'MULTIPLE_CHOICE' && isEmptyValue(rowValue)) {
              const defaultValue = getDefaultMultipleChoiceValue(sectionField);
              if (defaultValue.length === 0) continue;
              existingRows[rowIndex] = defaultValue;
              sectionChanged = true;
              continue;
            }

            const nextRequiredValue = ensureRequiredMultipleChoiceValue(sectionField, rowValue);
            if (nextRequiredValue) {
              existingRows[rowIndex] = nextRequiredValue;
              sectionChanged = true;
            }
          }

          if (sectionChanged) {
            next[sectionField.key] = existingRows;
            changed = true;
          }
        }

        index = cursor;
        continue;
      }

      if (field.type === 'PAGE_BREAK' || isRepeatEndMarker(field)) continue;

      const existingValue = next[field.key];
      if (!(field.key in next)) {
        const defaultValue = getConfiguredDefaultValue(field, todayIso);
        if (defaultValue !== null) {
          next[field.key] = defaultValue;
          changed = true;
          continue;
        }
      }

      if (field.type === 'SINGLE_CHOICE' && isEmptyValue(existingValue)) {
        const defaultValue = getDefaultSingleChoiceValue(field);
        if (defaultValue === null) continue;
        next[field.key] = defaultValue;
        changed = true;
        continue;
      }

      if (field.type === 'MULTIPLE_CHOICE' && isEmptyValue(existingValue)) {
        const defaultValue = getDefaultMultipleChoiceValue(field);
        if (defaultValue.length === 0) continue;
        next[field.key] = defaultValue;
        changed = true;
        continue;
      }

      const nextRequiredValue = ensureRequiredMultipleChoiceValue(field, existingValue);
      if (nextRequiredValue) {
        next[field.key] = nextRequiredValue;
        changed = true;
      }
    }

    return changed ? next : baseAnswers;
  }, [form, orderedFields, repeatSectionCounts]);

  useEffect(() => {
    if (!form) return;
    const visibleFieldIds = new Set(visibleFields.map((field) => field.id));
    setAnswers((prev) => withDefaultAnswers(
      pruneHiddenConditionalAnswers(orderedFields, prev),
      visibleFieldIds
    ));
  }, [form, orderedFields, visibleFields, withDefaultAnswers]);

  function setFieldValue(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function getRepeatFieldValue(fieldKey: string, rowIndex: number): unknown {
    const value = answers[fieldKey];
    if (!Array.isArray(value)) return undefined;
    return value[rowIndex];
  }

  function setRepeatFieldValue(fieldKey: string, rowIndex: number, value: unknown) {
    setAnswers((prev) => {
      const existing = Array.isArray(prev[fieldKey]) ? [...(prev[fieldKey] as unknown[])] : [];
      existing[rowIndex] = value;
      return { ...prev, [fieldKey]: existing };
    });

    const errorKey = getFieldErrorKey(fieldKey, rowIndex);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
  }

  function addRepeatSectionRow(sectionId: string, maxItems: number | null) {
    setRepeatSectionCounts((prev) => {
      const current = prev[sectionId] || 1;
      if (maxItems !== null && current >= maxItems) return prev;
      return { ...prev, [sectionId]: current + 1 };
    });
  }

  function removeRepeatSectionRow(sectionId: string, rowIndex: number, sectionFields: PublicField[]) {
    const fieldKeys = sectionFields.map((field) => field.key);

    setAnswers((prev) => {
      const next = { ...prev };
      for (const fieldKey of fieldKeys) {
        const value = next[fieldKey];
        if (!Array.isArray(value)) continue;
        const rows = [...value];
        rows.splice(rowIndex, 1);
        next[fieldKey] = rows;
      }
      return next;
    });

    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (fieldKeys.some((fieldKey) => key === fieldKey || key.startsWith(`${fieldKey}__`))) {
          delete next[key];
        }
      }
      return next;
    });

    setRepeatSectionCounts((prev) => {
      const current = prev[sectionId] || 1;
      return { ...prev, [sectionId]: Math.max(1, current - 1) };
    });
  }

  function collectStringValues(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (!Array.isArray(value)) return [];

    const items: string[] = [];
    for (const entry of value) {
      items.push(...collectStringValues(entry));
    }
    return items;
  }

  function hasRequiredValue(field: PublicField, value: unknown): boolean {
    if (field.type === 'FILE_UPLOAD') {
      const uploadIds = collectStringValues(value)
        .map((item) => item.trim())
        .filter((item) => UUID_PATTERN.test(item));
      return uploadIds.length > 0;
    }

    if (field.type === 'SIGNATURE') {
      return extractSignatureDataUrl(value) !== null;
    }

    if (field.type === 'SHORT_TEXT' && field.inputType === 'phone' && isSplitPhoneCountryCodeEnabled(field)) {
      return parsePhoneParts(value, getPhoneDefaultCountryCode(field)).number.length > 0;
    }

    return !isEmptyValue(value);
  }

  function validateField(
    field: PublicField,
    value: unknown,
    localizedField: PublicField,
    answersRecord: Record<string, unknown>
  ): string | null {
    if (NON_VALIDATABLE_FIELD_TYPES.has(field.type)) return null;

    const fieldLabel = localizedField.label || field.label || field.key;

    if (field.isRequired && !hasRequiredValue(field, value)) {
      return uiLabel('validation_required', { field: fieldLabel });
    }

    if (
      field.type === 'SHORT_TEXT' &&
      field.inputType === 'email' &&
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ) {
      return uiLabel('validation_email', { field: fieldLabel });
    }

    if (
      ((field.type === 'SHORT_TEXT' && field.inputType !== 'date' && field.inputType !== 'number' && field.inputType !== 'time_timezone') || field.type === 'LONG_TEXT') &&
      typeof value === 'string' &&
      value.length > 0
    ) {
      const textError = getTextValidationError(field, value, fieldLabel);
      if (textError) return textError;
    }

    if (field.type === 'SHORT_TEXT' && field.inputType === 'number') {
      const numberError = getNumberValidationError(field, value, fieldLabel, answersRecord);
      if (numberError) return numberError;
    }

    if (field.type === 'SHORT_TEXT' && field.inputType === 'date' && typeof value === 'string' && value.trim().length > 0) {
      const { minDate, maxDate } = getDateValidationRange(field, answersRecord);
      const normalizedValue = value.trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
        return uiLabel('invalid_value');
      }

      if (minDate && normalizedValue < minDate) {
        return `${fieldLabel} must be on or after ${formatValidationDate(minDate)}.`;
      }

      if (maxDate && normalizedValue > maxDate) {
        return `${fieldLabel} must be on or before ${formatValidationDate(maxDate)}.`;
      }
    }

    if (field.type === 'SHORT_TEXT' && field.inputType === 'time_timezone' && !isEmptyValue(value)) {
      const timeValue = parseTimeTimezoneValue(value, getTimezoneDefault(field));
      if (!/^\d{2}:\d{2}$/.test(timeValue.time)) {
        return uiLabel('invalid_value');
      }
    }

    if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') {
      const detailError = getChoiceDetailValidationError(
        fieldLabel,
        parseChoiceOptions(localizedField.options),
        value,
        localizedUiLabels.validation_choice_detail
      );
      if (detailError) return detailError;
    }

    return null;
  }

  function handleFieldBlur(field: PublicField, value: unknown, errorKey: string, answersRecord: Record<string, unknown>) {
    const error = validateField(field, value, getLocalizedField(field), answersRecord);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[errorKey] = error;
      } else {
        delete next[errorKey];
      }
      return next;
    });
  }

  function validateCurrentPage(): boolean {
    const nextErrors: Record<string, string> = {};
    const pageFields = pages[currentPage] || [];
    const effectiveAnswers = withDefaultAnswers(answers);

    for (let index = 0; index < pageFields.length; index += 1) {
      const field = pageFields[index];

      if (isRepeatStartMarker(field)) {
        const sectionVisible = evaluateCondition(field.condition, effectiveAnswers, conditionEvaluationOptions);
        const sectionConfig = getRepeatSectionConfig(field);
        const sectionFields: PublicField[] = [];
        let cursor = index + 1;
        while (cursor < pageFields.length && !isRepeatEndMarker(pageFields[cursor])) {
          if (pageFields[cursor].type !== 'PAGE_BREAK') {
            sectionFields.push(pageFields[cursor]);
          }
          cursor += 1;
        }
        index = cursor;
        if (!sectionVisible) {
          continue;
        }

        const repeatCount = repeatSectionCounts[sectionConfig.id] || sectionConfig.minItems;
        for (let rowIndex = 0; rowIndex < repeatCount; rowIndex += 1) {
          const rowAnswers: Record<string, unknown> = {};
          for (const [answerKey, answerValue] of Object.entries(effectiveAnswers)) {
            if (Array.isArray(answerValue)) {
              rowAnswers[answerKey] = answerValue[rowIndex];
            } else {
              rowAnswers[answerKey] = answerValue;
            }
          }

          for (const sectionField of sectionFields) {
            if (!evaluateCondition(sectionField.condition, rowAnswers, { fields: sectionFields })) continue;
            const sectionValue = effectiveAnswers[sectionField.key];
            const value = Array.isArray(sectionValue) ? sectionValue[rowIndex] : undefined;
            const errorKey = getFieldErrorKey(sectionField.key, rowIndex);

            const error = validateField(sectionField, value, getLocalizedField(sectionField), rowAnswers);
            if (error) {
              nextErrors[errorKey] = error;
            }
          }
        }
        continue;
      }

      if (isRepeatEndMarker(field) || isBlockDivider(field) || field.type === 'PAGE_BREAK') continue;
      if (!evaluateCondition(field.condition, effectiveAnswers, conditionEvaluationOptions)) continue;

      const value = effectiveAnswers[field.key];
      const errorKey = getFieldErrorKey(field.key);

      const error = validateField(field, value, getLocalizedField(field), effectiveAnswers);
      if (error) {
        nextErrors[errorKey] = error;
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadFiles(field: PublicField, files: File[]) {
    const fieldKey = field.key;
    const allowMultipleFiles = isMultipleFileUploadEnabled(field);
    if (files.length === 0) return;

    if (isPreview) {
      setFieldErrors((prev) => ({
        ...prev,
        [fieldKey]: uiLabel('preview_upload_notice'),
      }));
      return;
    }

    setUploadingField(fieldKey);
    try {
      const uploadedStatuses: UploadStatus[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('fieldKey', fieldKey);
        formData.append('file', file);

        const response = await fetch(`/api/forms/public/${slug}/uploads`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || uiLabel('upload_failed'));
        }

        uploadedStatuses.push({
          id: data.id,
          fileName: typeof data.fileName === 'string' ? data.fileName : uiLabel('uploaded_file_fallback'),
          mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
          sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
        });
      }

      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
      const existingIds = allowMultipleFiles ? collectUploadIds(answers[fieldKey]) : [];
      setFieldValue(
        fieldKey,
        allowMultipleFiles
          ? [...existingIds, ...uploadedStatuses.map((status) => status.id)]
          : uploadedStatuses.slice(-1).map((status) => status.id)
      );
      setUploadedByFieldKey((prev) => {
        const existing = allowMultipleFiles ? (prev[fieldKey] || []) : [];
        return {
          ...prev,
          [fieldKey]: allowMultipleFiles
            ? [...existing, ...uploadedStatuses]
            : uploadedStatuses.slice(-1),
        };
      });
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        [fieldKey]: err instanceof Error ? err.message : uiLabel('upload_failed'),
      }));
    } finally {
      setUploadingField(null);
      setDragOverUploadFieldKey((prev) => (prev === fieldKey ? null : prev));
    }
  }

  function removeUploadedFile(fieldKey: string, uploadId: string) {
    setFieldValue(fieldKey, collectUploadIds(answers[fieldKey]).filter((candidate) => candidate !== uploadId));
    setUploadedByFieldKey((prev) => {
      const next = { ...prev };
      const remaining = (next[fieldKey] || []).filter((upload) => upload.id !== uploadId);
      if (remaining.length > 0) {
        next[fieldKey] = remaining;
      } else {
        delete next[fieldKey];
      }
      return next;
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }

  async function saveDraft() {
    if (!form) return;

    if (isPreview) {
      setDraftFeedback(uiLabel('preview_save_draft_notice'));
      return;
    }

    if (!draftSettings.enabled) {
      setDraftFeedback(uiLabel('draft_save_disabled_notice'));
      return;
    }

    setIsSavingDraft(true);
    setDraftFeedback(null);
    setDraftError(null);
    try {
      const answersWithDefaults = pruneHiddenConditionalAnswers(orderedFields, withDefaultAnswers(answers));
      const uploadIds = orderedFields
        .filter((field) => field.type === 'FILE_UPLOAD')
        .flatMap((field) => collectUploadIds(answersWithDefaults[field.key]));

      const normalizedAnswers = Object.fromEntries(
        Object.entries(answersWithDefaults).filter(([, value]) => value !== undefined)
      );

      const response = await fetch(`/api/forms/public/${slug}/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(draftSession ? {
            draftCode: draftSession.draftCode,
            accessToken: draftSession.accessToken,
          } : {}),
          answers: normalizedAnswers,
          uploadIds,
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            locale: activeLocale,
            repeatSectionCounts,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || uiLabel('save_draft_failed'));
      }

      applyResolvedDraftPayload(
        data as Record<string, unknown>,
        draftSession?.draftCode || '',
        draftSession?.accessToken,
        {
          syncUrl: false,
        }
      );
      setDraftError(null);
      if (isFirstDraftSave) {
        setDraftEmailInput(detectedEmailFromForm);
        setDraftEmailSent(false);
        setDraftEmailFeedback(null);
        setDraftEmailError(null);
        setIsDraftEmailExpanded(false);
        setIsDraftDetailsModalOpen(true);
        setIsFirstDraftSave(false);
      } else {
        setDraftBannerFeedback(uiLabel('draft_updated'));
        setTimeout(() => setDraftBannerFeedback(null), 3000);
      }
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : uiLabel('save_draft_failed'));
    } finally {
      setIsSavingDraft(false);
    }
  }


  async function sendDraftEmail() {
    if (!draftSession) return;

    const normalizedEmail = draftEmailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setDraftEmailError(uiLabel('email_invalid'));
      return;
    }

    setIsDraftEmailSending(true);
    setDraftEmailFeedback(null);
    setDraftEmailError(null);
    try {
      const response = await fetch(
        `/api/forms/public/${slug}/drafts/${encodeURIComponent(draftSession.draftCode)}/email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            accessToken: draftSession.accessToken,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || uiLabel('draft_email_failed'));
      }
      setDraftEmailFeedback(uiLabel('draft_email_sent', { email: normalizedEmail }));
      setDraftEmailSent(true);
      setTimeout(() => setIsDraftEmailExpanded(false), 1500);
    } catch (err) {
      setDraftEmailError(err instanceof Error ? err.message : uiLabel('draft_email_failed'));
    } finally {
      setIsDraftEmailSending(false);
    }
  }

  async function copyResumeLink() {
    if (!draftSession?.resumeUrl) {
      setDraftError(uiLabel('resume_link_unavailable'));
      return;
    }

    if (await copyTextToClipboard(draftSession.resumeUrl)) {
      setDraftFeedback(uiLabel('resume_link_copied'));
      return;
    }

    setDraftError(uiLabel('resume_link_copy_failed'));
  }

  async function submitForm() {
    if (!form) return;

    if (isPreview) {
      setError(uiLabel('preview_submit_notice'));
      return;
    }

    if (firstProgressStopPage >= 0) {
      if (currentPage !== firstProgressStopPage) {
        setCurrentPage(firstProgressStopPage);
        scrollToFormTop();
      }
      return;
    }

    if (!validateCurrentPage()) return;

    setIsSubmitting(true);
    try {
      const answersWithDefaults = pruneHiddenConditionalAnswers(orderedFields, withDefaultAnswers(answers));
      const fileUploadKeys = orderedFields
        .filter((field) => field.type === 'FILE_UPLOAD')
        .map((field) => field.key);

      const uploadIds = fileUploadKeys
        .flatMap((key) => {
          const value = answersWithDefaults[key];
          if (!Array.isArray(value)) return [];
          return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
        })
        .filter((value): value is string => typeof value === 'string' && UUID_PATTERN.test(value));

      const normalizedAnswers = Object.fromEntries(
        Object.entries(answersWithDefaults).filter(([, value]) => value !== undefined)
      );

      const respondentName = inferRespondentName(orderedFields, answersWithDefaults);
      const respondentEmail = inferRespondentEmail(orderedFields, answersWithDefaults);

      const response = await fetch(`/api/forms/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(draftSession ? {
            draftCode: draftSession.draftCode,
            accessToken: draftSession.accessToken,
          } : {}),
          ...(respondentName ? { respondentName } : {}),
          ...(respondentEmail ? { respondentEmail } : {}),
          answers: normalizedAnswers,
          ...(uploadIds.length > 0 ? { uploadIds } : {}),
          metadata: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            locale: activeLocale,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const detailText = Array.isArray(data.details)
          ? data.details
            .map((item: { path?: Array<string | number>; message?: string }) =>
              `${item.path?.join('.') || uiLabel('payload_label')}: ${item.message || uiLabel('invalid_value')}`
            )
            .join('; ')
          : '';

        throw new Error(
          detailText
            ? `${data.error || uiLabel('submission_failed')} (${detailText})`
            : (data.error || uiLabel('submission_failed'))
        );
      }

      setSubmissionId(typeof data.id === 'string' ? data.id : null);
      setDraftSession(null);
      replaceDraftQuery(null);
      setDraftFeedback(null);
      setPdfDownloadToken(typeof data.pdfDownloadToken === 'string' ? data.pdfDownloadToken : null);
      setPdfEmailAccessToken(typeof data.pdfEmailAccessToken === 'string' ? data.pdfEmailAccessToken : null);
      setEmailFeedback(null);
      setPdfRecipientEmail(respondentEmail || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : uiLabel('submission_failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSignatureAdopt(result: {
    dataUrl: string;
    vectorDataUrl?: string | null;
    applyToAll: boolean;
  }) {
    if (!activeSignatureFieldKey) {
      return;
    }

    const targetKeys = result.applyToAll && signatureFieldKeys.length > 1
      ? signatureFieldKeys
      : [activeSignatureFieldKey];
    const adoptedValue = result.dataUrl;

    setAnswers((prev) => {
      const next = { ...prev };
      for (const key of targetKeys) {
        next[key] = adoptedValue;
      }
      return next;
    });

    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of targetKeys) {
        delete next[key];
      }
      return next;
    });

    setActiveSignatureFieldKey(null);
  }

  async function sendSubmissionPdfEmail() {
    if (!submissionId) return;
    if (!pdfEmailAccessToken) {
      setEmailFeedback(uiLabel('email_action_expired'));
      return;
    }

    const normalizedEmail = pdfRecipientEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailFeedback(uiLabel('email_invalid'));
      return;
    }

    setIsSendingEmail(true);
    setEmailFeedback(null);
    try {
      const response = await fetch(`/api/forms/public/${slug}/submissions/${submissionId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          accessToken: pdfEmailAccessToken,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || uiLabel('email_send_failed'));
      }

      setEmailFeedback(uiLabel('email_sent_feedback', { email: normalizedEmail }));
    } catch (err) {
      setEmailFeedback(err instanceof Error ? err.message : uiLabel('email_send_failed'));
    } finally {
      setIsSendingEmail(false);
    }
  }

  function renderHeadingField(field: PublicField): React.ReactNode {
    const localizedField = getLocalizedField(field);
    const headingType = field.inputType === 'info_heading_1' ? 'h1'
      : field.inputType === 'info_heading_2' ? 'h2'
      : 'h3';
    const headingClasses: Record<string, string> = {
      h1: 'text-xl font-bold text-text-primary mt-6 mb-2',
      h2: 'text-lg font-semibold text-text-primary mt-4 mb-1.5',
      h3: 'text-base font-semibold text-text-primary mt-3 mb-1',
    };
    const headingText = richTextToPlainText(localizedField.label || localizedField.subtext || '');
    const descriptionText = localizedField.label ? richTextToPlainText(localizedField.subtext || '') : '';
    const Tag = headingType as 'h1' | 'h2' | 'h3';
    return (
      <div key={field.id}>
        <Tag className={headingClasses[headingType]}>{headingText}</Tag>
        {descriptionText && (
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{descriptionText}</p>
        )}
      </div>
    );
  }

  function renderStandaloneField(field: PublicField): React.ReactNode {
    const localizedField = getLocalizedField(field);

    if (field.type === 'HIDDEN') return null;
    if (isBlockDivider(field)) return null;
    if (isRepeatEndMarker(field)) return null;
    if (field.type === 'PAGE_BREAK' && !isRepeatStartMarker(field)) return null;

    const widthClass = WIDTH_CLASS[localizedField.layoutWidth] || WIDTH_CLASS[100];
    const infoBackgroundColor = getInfoBackgroundColor(localizedField);
    const infoPadding = getInfoPadding(localizedField);
    const infoPaddingTop = infoPadding?.top ?? null;
    const infoPaddingRight = infoPadding?.right ?? null;
    const infoPaddingBottom = infoPadding?.bottom ?? null;
    const infoPaddingLeft = infoPadding?.left ?? null;
    const infoStyle: React.CSSProperties | undefined = (
      infoBackgroundColor || infoPadding !== null
    )
      ? {
          ...(infoBackgroundColor ? { backgroundColor: infoBackgroundColor } : {}),
          ...(infoPaddingTop !== null ? { paddingTop: `${infoPaddingTop}px` } : {}),
          ...(infoPaddingRight !== null ? { paddingRight: `${infoPaddingRight}px` } : {}),
          ...(infoPaddingBottom !== null ? { paddingBottom: `${infoPaddingBottom}px` } : {}),
          ...(infoPaddingLeft !== null ? { paddingLeft: `${infoPaddingLeft}px` } : {}),
        }
      : undefined;
    const infoStopsProgress = isProgressStopInfoBlock(localizedField);
    const bareInfoTextBlock = isBareInfoTextBlock(localizedField);

    // Heading blocks
    if (isHeadingInfoBlock(localizedField)) {
      return renderHeadingField(localizedField);
    }

    if (isFaqField(localizedField)) {
      return (
        <div key={field.id} className={cn(widthClass, isLayoutBreakBeforeEnabled(field) && 'md:col-start-1')}>
          <FaqField field={localizedField} />
        </div>
      );
    }

    // info_image
    if (localizedField.type === 'PARAGRAPH' && localizedField.inputType === 'info_image') {
      const imageUrl = isValidHttpUrl(localizedField.placeholder?.trim() || null) ? localizedField.placeholder!.trim() : null;
      return (
        <div key={field.id} className={cn(widthClass, isLayoutBreakBeforeEnabled(field) && 'md:col-start-1')}>
          <div
            className={cn(
              'overflow-hidden rounded-lg border bg-background-primary',
              infoStopsProgress ? 'border-status-warning/60 ring-1 ring-status-warning/20' : 'border-border-primary'
            )}
            style={infoStyle}
          >
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={localizedField.subtext || localizedField.label || uiLabel('information_image_alt')} className="max-h-96 w-full object-contain" />
                {localizedField.subtext && (
                  <p className="border-t border-border-primary px-3 py-2 text-xs text-text-secondary">{localizedField.subtext}</p>
                )}
              </>
            ) : (
              <div className="px-3 py-4 text-sm text-text-secondary">{uiLabel('info_image_invalid_url')}</div>
            )}
          </div>
        </div>
      );
    }

    // info_url
    if (localizedField.type === 'PARAGRAPH' && localizedField.inputType === 'info_url') {
      const href = isValidHttpUrl(localizedField.placeholder?.trim() || null) ? localizedField.placeholder!.trim() : null;
      return (
        <div key={field.id} className={cn(widthClass, isLayoutBreakBeforeEnabled(field) && 'md:col-start-1')}>
          <div
            className={cn(
              'rounded-lg border bg-background-primary px-3 py-2 text-sm',
              infoStopsProgress ? 'border-status-warning/60 ring-1 ring-status-warning/20' : 'border-border-primary'
            )}
            style={infoStyle}
          >
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-text-primary underline hover:text-text-secondary">
                {localizedField.subtext || localizedField.label || href}
              </a>
            ) : (
              <span className="text-text-secondary">{uiLabel('info_url_invalid_url')}</span>
            )}
          </div>
        </div>
      );
    }

    // info_text (and any other PARAGRAPH fallback)
    if (localizedField.type === 'PARAGRAPH') {
      const infoText = localizedField.subtext || localizedField.label || '';
      const richContent = hasHtmlMarkup(infoText);

      return (
        <div key={field.id} className={cn(widthClass, isLayoutBreakBeforeEnabled(field) && 'md:col-start-1')}>
          <div
            className={cn(
              'text-sm text-text-primary',
              bareInfoTextBlock
                ? 'bg-transparent'
                : 'rounded-lg border bg-background-primary px-3 py-2',
              !bareInfoTextBlock && (infoStopsProgress ? 'border-status-warning/60 ring-1 ring-status-warning/20' : 'border-border-primary')
            )}
            style={infoStyle}
          >
            {richContent ? (
              <div
                className="form-rich-render text-sm text-text-primary"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(infoText) }}
              />
            ) : (
              <div className="whitespace-pre-wrap">{infoText}</div>
            )}
          </div>
        </div>
      );
    }

    // HTML
    if (localizedField.type === 'HTML') {
      return (
        <div key={field.id} className={cn(widthClass, isLayoutBreakBeforeEnabled(field) && 'md:col-start-1')}>
          <div className="text-sm text-text-primary" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(localizedField.subtext || '') }} />
        </div>
      );
    }

    // Repeat section start marker
    if (isRepeatStartMarker(field)) {
      const sectionFields: PublicField[] = [];
      const fieldIndex = visibleFields.findIndex((f) => f.id === field.id);
      let cursor = fieldIndex + 1;

      // Collect section fields (hiddenFieldIds already pre-computed via useMemo)
      while (cursor < visibleFields.length) {
        const candidate = visibleFields[cursor];
        if (isRepeatEndMarker(candidate)) break;
        if (isRepeatStartMarker(candidate)) break;
        if (candidate.type !== 'PAGE_BREAK') sectionFields.push(candidate);
        cursor += 1;
      }

      const sectionConfig = getRepeatSectionConfig(field);
      const sectionId = sectionConfig.id;
      const rowCount = repeatSectionCounts[sectionId] || sectionConfig.minItems;
      const canAddRow = sectionConfig.maxItems === null || rowCount < sectionConfig.maxItems;
      const sectionHasVisibleLabels = sectionFields.some((sectionField) => sectionField.type !== 'HIDDEN' && !sectionField.hideLabel);
      const addRowLabel = localizedUiLabels.add_row || sectionConfig.addLabel;
      const removeRowLabel = localizedUiLabels.remove_row || 'Remove row';

      return (
        <div key={field.id} className="col-span-12">
          <div className="rounded-xl border border-border-primary/60 bg-white p-3 shadow-sm sm:p-4">
            <div className="space-y-4">
              {Array.from({ length: rowCount }).map((_, rowIndex) => {
                const rowAnswers: Record<string, unknown> = {};
                for (const [answerKey, answerValue] of Object.entries(answers)) {
                  rowAnswers[answerKey] = Array.isArray(answerValue) ? answerValue[rowIndex] : answerValue;
                }
                const canRemoveRow = rowCount > sectionConfig.minItems;

                return (
                  <div key={`${sectionId}-row-${rowIndex}`} className={cn(rowIndex > 0 && 'border-t border-border-primary/40 pt-4')}>
                    <div className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-2 sm:gap-3">
                      <div className="grid grid-cols-12 gap-3">
                        {sectionFields.map((sectionField) => {
                      if (!evaluateCondition(sectionField.condition, rowAnswers, { fields: sectionFields })) return null;

                      const localizedSectionField = getLocalizedField(sectionField);
                      const sectionWidthClass = WIDTH_CLASS[sectionField.layoutWidth] || WIDTH_CLASS[100];
                      const sectionValue = getRepeatFieldValue(sectionField.key, rowIndex);
                      const sectionErrorText = fieldErrors[getFieldErrorKey(sectionField.key, rowIndex)];
                      const sectionDropdownOptions = parseChoiceOptions(localizedSectionField.options);
                      const sectionChoiceOptions = parseChoiceOptions(localizedSectionField.options);
                      const sectionFieldDomId = `repeat-${toDomSafeId(sectionId)}-${rowIndex}-${toDomSafeId(sectionField.id || sectionField.key)}`;
                      const sectionControlId = `${sectionFieldDomId}-control`;
                      const sectionLabelId = `${sectionFieldDomId}-label`;
                      const sectionHintId = localizedSectionField.subtext ? `${sectionFieldDomId}-hint` : undefined;
                      const sectionErrorId = sectionErrorText ? `${sectionFieldDomId}-error` : undefined;
                      const sectionDescribedBy = [sectionHintId, sectionErrorId].filter(Boolean).join(' ') || undefined;
                      const sectionLabel = localizedSectionField.label || sectionField.key;
                      const sectionUseDateSelector = sectionField.type === 'SHORT_TEXT' && sectionField.inputType === 'date';
                      const sectionDateValidationRange = sectionUseDateSelector ? getDateValidationRange(sectionField, rowAnswers) : {};
                      const sectionUseSplitPhoneInput = sectionField.type === 'SHORT_TEXT' && sectionField.inputType === 'phone' && isSplitPhoneCountryCodeEnabled(sectionField);
                      const sectionUseTimeTimezoneInput = sectionField.type === 'SHORT_TEXT' && sectionField.inputType === 'time_timezone';
                      const sectionChoiceInlineRight = isChoiceInlineRightEnabled(sectionField);
                      const sectionChoiceDetailErrorValues = (sectionField.type === 'SINGLE_CHOICE' || sectionField.type === 'MULTIPLE_CHOICE')
                        ? getChoiceDetailErrorValues(sectionChoiceOptions, sectionValue)
                        : new Set<string>();
                      const sectionHighlightChoiceGroup = !!sectionErrorText && sectionChoiceDetailErrorValues.size === 0;
                      const sectionPhoneDefaultCountryCode = sectionUseSplitPhoneInput
                        ? getPhoneDefaultCountryCode(sectionField)
                        : DEFAULT_PHONE_COUNTRY_CODE;
                      const sectionPhoneParts = sectionUseSplitPhoneInput
                        ? parsePhoneParts(sectionValue, sectionPhoneDefaultCountryCode)
                        : null;
                      const sectionTimeTimezoneParts = sectionUseTimeTimezoneInput
                        ? parseTimeTimezoneValue(sectionValue, getTimezoneDefault(sectionField))
                        : null;
                      const resolvedSectionDateValue = typeof sectionValue === 'string' && sectionValue.trim().length > 0
                        ? sectionValue
                        : '';

                      if (sectionField.type === 'HIDDEN') return null;

                      return (
                        <div
                          key={`${sectionField.id}-${rowIndex}`}
                          className={cn(sectionWidthClass, isLayoutBreakBeforeEnabled(sectionField) && 'md:col-start-1')}
                        >
                          {!sectionField.hideLabel && !sectionChoiceInlineRight && (
                            <label
                              htmlFor={sectionControlId}
                              id={sectionLabelId}
                              className="mb-1.5 block text-xs font-medium text-text-secondary"
                            >
                              {sectionLabel}
                              {sectionField.isRequired && <span className="text-oak-primary"> *</span>}
                            </label>
                          )}
                          {localizedSectionField.subtext && (
                            <p id={sectionHintId} className="mb-2 text-xs text-text-muted">{localizedSectionField.subtext}</p>
                          )}

                          {sectionField.type === 'SHORT_TEXT' && !sectionUseDateSelector && !sectionUseSplitPhoneInput && !sectionUseTimeTimezoneInput && (
                            <input
                              id={sectionControlId}
                              type={sectionField.inputType === 'phone' ? 'tel' : sectionField.inputType || 'text'}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(e) => setRepeatFieldValue(sectionField.key, rowIndex, e.target.value)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                              placeholder={localizedSectionField.placeholder || ''}
                              readOnly={sectionField.isReadOnly}
                              aria-invalid={sectionErrorText ? 'true' : undefined}
                              aria-describedby={sectionDescribedBy}
                              className={cn(
                                'w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                sectionErrorText && ERROR_FIELD_CLASS
                              )}
                            />
                          )}

                          {sectionUseTimeTimezoneInput && sectionTimeTimezoneParts && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                              <SingleTimeInput
                                id={sectionControlId}
                                value={sectionTimeTimezoneParts.time}
                                onChange={(nextTime) => setRepeatFieldValue(
                                  sectionField.key,
                                  rowIndex,
                                  buildTimeTimezoneValue(nextTime, sectionTimeTimezoneParts.timezone)
                                )}
                                onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                                disabled={sectionField.isReadOnly}
                                error={sectionErrorText}
                                ariaLabel={sectionField.hideLabel ? sectionLabel : undefined}
                                className="w-full"
                              />
                              <SearchableSelect
                                options={TIMEZONE_OPTIONS}
                                value={sectionTimeTimezoneParts.timezone}
                                onChange={(nextTimezone) => setRepeatFieldValue(
                                  sectionField.key,
                                  rowIndex,
                                  buildTimeTimezoneValue(sectionTimeTimezoneParts.time, nextTimezone || getTimezoneDefault(sectionField))
                                )}
                                placeholder="Timezone"
                                clearable={false}
                                showKeyboardHints={false}
                                containerClassName={cn('h-10', sectionErrorText && ERROR_FIELD_CLASS)}
                                onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                              />
                            </div>
                          )}

                          {sectionUseSplitPhoneInput && sectionPhoneParts && (
                            <div className="grid grid-cols-[minmax(132px,180px)_minmax(0,1fr)] gap-2">
                              <SearchableSelect
                                options={localizedPhoneCountryCodeOptions}
                                value={sectionPhoneParts.countryCode}
                                onChange={(nextCountryCode) => setRepeatFieldValue(
                                  sectionField.key,
                                  rowIndex,
                                  buildPhoneValue(nextCountryCode || sectionPhoneDefaultCountryCode, sectionPhoneParts.number)
                                )}
                                placeholder={uiLabel('phone_code_placeholder')}
                                clearable={false}
                                showKeyboardHints={false}
                                popoverMinWidth={300}
                                containerClassName={cn('h-10', sectionErrorText && ERROR_FIELD_CLASS)}
                                onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                              />
                              <input
                                id={sectionControlId}
                                type="tel"
                                value={sectionPhoneParts.number}
                                onChange={(e) => setRepeatFieldValue(
                                  sectionField.key,
                                  rowIndex,
                                  buildPhoneValue(sectionPhoneParts.countryCode, e.target.value)
                                )}
                                onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                                placeholder={localizedSectionField.placeholder || ''}
                                readOnly={sectionField.isReadOnly}
                                aria-invalid={sectionErrorText ? 'true' : undefined}
                                aria-describedby={sectionDescribedBy}
                                className={cn(
                                  'w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                  sectionErrorText && ERROR_FIELD_CLASS
                                )}
                              />
                            </div>
                          )}

                          {sectionUseDateSelector && (
                            <SingleDateInput
                              value={resolvedSectionDateValue}
                              onChange={(next) => setRepeatFieldValue(sectionField.key, rowIndex, next)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                              placeholder={localizedSectionField.placeholder || uiLabel('date_placeholder')}
                              disabled={sectionField.isReadOnly}
                              required={sectionField.isRequired}
                              error={sectionErrorText}
                              ariaLabel={sectionField.hideLabel ? sectionLabel : undefined}
                              minDate={sectionDateValidationRange.minDate}
                              maxDate={sectionDateValidationRange.maxDate}
                              className="w-full"
                            />
                          )}

                          {sectionField.type === 'LONG_TEXT' && (
                            <textarea
                              id={sectionControlId}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(e) => setRepeatFieldValue(sectionField.key, rowIndex, e.target.value)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                              placeholder={localizedSectionField.placeholder || ''}
                              readOnly={sectionField.isReadOnly}
                              aria-invalid={sectionErrorText ? 'true' : undefined}
                              aria-describedby={sectionDescribedBy}
                              className={cn(
                                'w-full min-h-24 rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                sectionErrorText && ERROR_FIELD_CLASS
                              )}
                            />
                          )}

                          {sectionField.type === 'DROPDOWN' && (
                            <SearchableSelect
                              options={sectionDropdownOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(val) => setRepeatFieldValue(sectionField.key, rowIndex, val)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex))}
                              placeholder={localizedSectionField.placeholder || uiLabel('select_option_placeholder')}
                              clearable={false}
                              showKeyboardHints={false}
                              containerClassName={cn('h-10', sectionErrorText && ERROR_FIELD_CLASS)}
                            />
                          )}

                          {sectionField.type === 'SINGLE_CHOICE' && (
                            <fieldset className={cn('space-y-1.5 rounded-lg', sectionHighlightChoiceGroup && 'ring-1 ring-status-error/20')} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex)); }}>
                              {sectionChoiceInlineRight ? (
                                (() => {
                                  const selectedEntry = parseChoiceAnswerEntry(sectionValue);
                                  return (
                                    <>
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,max-content)] sm:items-start sm:gap-3">
                                        {!sectionField.hideLabel && (
                                          <legend id={sectionLabelId} className="min-w-0 text-sm text-text-primary sm:pt-1">
                                            {sectionLabel}
                                            {sectionField.isRequired && <span className="text-oak-primary"> *</span>}
                                          </legend>
                                        )}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-self-end sm:whitespace-nowrap">
                                          {sectionChoiceOptions.map((option, optionIndex) => {
                                            const isSelected = selectedEntry?.value === option.value;
                                            const optionId = `${sectionFieldDomId}-option-${optionIndex}`;
                                            return (
                                              <label key={`${option.value}-${optionIndex}`} htmlFor={optionId} className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary', sectionHighlightChoiceGroup && 'text-status-error')}>
                                                <input
                                                  id={optionId}
                                                  type="radio"
                                                  name={`${sectionField.key}-${rowIndex}`}
                                                  checked={isSelected}
                                                  onChange={() => setRepeatFieldValue(
                                                    sectionField.key,
                                                    rowIndex,
                                                    option.allowTextInput
                                                      ? { value: option.value, detailText: selectedEntry?.value === option.value ? selectedEntry.detailText : '' }
                                                      : option.value
                                                  )}
                                                  className={CHOICE_RADIO_INPUT_CLASS}
                                                />
                                                {getChoiceOptionDisplayLabel(option)}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      {sectionChoiceOptions.map((option, optionIndex) => {
                                        const isSelected = selectedEntry?.value === option.value;
                                        if (!option.allowTextInput || !isSelected) return null;
                                        return (
                                          <textarea
                                            key={`${option.value}-${optionIndex}-detail`}
                                            rows={3}
                                            value={selectedEntry?.detailText || ''}
                                            onChange={(e) => setRepeatFieldValue(
                                              sectionField.key,
                                              rowIndex,
                                              { value: option.value, detailText: e.target.value }
                                            )}
                                            placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                                            className={cn(
                                              'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                              sectionChoiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS
                                            )}
                                          />
                                        );
                                      })}
                                    </>
                                  );
                                })()
                              ) : (
                                sectionChoiceOptions.map((option, optionIndex) => {
                                  const selectedEntry = parseChoiceAnswerEntry(sectionValue);
                                  const isSelected = selectedEntry?.value === option.value;
                                  const optionId = `${sectionFieldDomId}-option-${optionIndex}`;
                                  return (
                                    <div key={`${option.value}-${optionIndex}`} className="space-y-1.5">
                                      <label htmlFor={optionId} className={cn('flex items-center gap-2 text-sm text-text-primary', sectionHighlightChoiceGroup && 'text-status-error')}>
                                        <input
                                          id={optionId}
                                          type="radio"
                                          name={`${sectionField.key}-${rowIndex}`}
                                          checked={isSelected}
                                          onChange={() => setRepeatFieldValue(
                                            sectionField.key,
                                            rowIndex,
                                            option.allowTextInput
                                              ? { value: option.value, detailText: selectedEntry?.value === option.value ? selectedEntry.detailText : '' }
                                              : option.value
                                          )}
                                          className={CHOICE_RADIO_INPUT_CLASS}
                                        />
                                        {getChoiceOptionDisplayLabel(option)}
                                      </label>
                                      {option.allowTextInput && isSelected && (
                                        <textarea
                                          rows={3}
                                          value={selectedEntry?.detailText || ''}
                                          onChange={(e) => setRepeatFieldValue(
                                            sectionField.key,
                                            rowIndex,
                                            { value: option.value, detailText: e.target.value }
                                          )}
                                          placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                                          className={cn(
                                            'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                            sectionChoiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS
                                          )}
                                        />
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </fieldset>
                          )}

                          {sectionField.type === 'MULTIPLE_CHOICE' && (
                            <fieldset className={cn('space-y-1.5 rounded-lg', sectionHighlightChoiceGroup && 'ring-1 ring-status-error/20')} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex), buildAnswerContext(answers, rowIndex)); }}>
                              {sectionChoiceInlineRight ? (
                                (() => {
                                  const currentEntries = parseChoiceAnswerEntries(sectionValue);
                                  const currentValues = currentEntries.map((entry) => entry.value);
                                  return (
                                    <>
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,max-content)] sm:items-start sm:gap-3">
                                        {!sectionField.hideLabel && (
                                          <legend id={sectionLabelId} className="min-w-0 text-sm text-text-primary sm:pt-1">
                                            {sectionLabel}
                                            {sectionField.isRequired && <span className="text-oak-primary"> *</span>}
                                          </legend>
                                        )}
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-self-end sm:whitespace-nowrap">
                                          {sectionChoiceOptions.map((option, optionIndex) => {
                                            const optionId = `${sectionFieldDomId}-option-${optionIndex}-${toDomSafeId(option.value)}`;
                                            return (
                                              <label key={`${option.value}-${optionIndex}`} htmlFor={optionId} className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary', sectionHighlightChoiceGroup && 'text-status-error')}>
                                                <input
                                                  id={optionId}
                                                  type="checkbox"
                                                  checked={currentValues.includes(option.value)}
                                                  onChange={(e) => {
                                                    if (!e.target.checked && option.requiredSelected) return;
                                                    if (e.target.checked) {
                                                      const next = [
                                                        ...currentEntries.filter((candidate) => candidate.value !== option.value),
                                                        { value: option.value, detailText: option.allowTextInput ? '' : '' },
                                                      ];
                                                      const nextValue = next.map((candidate) => (
                                                        option.allowTextInput && candidate.value === option.value
                                                          ? { value: candidate.value, detailText: candidate.detailText }
                                                          : (candidate.detailText ? { value: candidate.value, detailText: candidate.detailText } : candidate.value)
                                                      ));
                                                      setRepeatFieldValue(sectionField.key, rowIndex, nextValue);
                                                    } else {
                                                      const next = currentEntries
                                                        .filter((candidate) => candidate.value !== option.value)
                                                        .map((candidate) => (
                                                          candidate.detailText
                                                            ? { value: candidate.value, detailText: candidate.detailText }
                                                            : candidate.value
                                                        ));
                                                      setRepeatFieldValue(sectionField.key, rowIndex, next);
                                                    }
                                                  }}
                                                  className={CHOICE_CHECKBOX_INPUT_CLASS}
                                                />
                                                {getChoiceOptionDisplayLabel(option)}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      {sectionChoiceOptions.map((option, optionIndex) => {
                                        const entry = currentEntries.find((candidate) => candidate.value === option.value);
                                        if (!option.allowTextInput || !currentValues.includes(option.value)) return null;
                                        return (
                                          <textarea
                                            key={`${option.value}-${optionIndex}-detail`}
                                            rows={3}
                                            value={entry?.detailText || ''}
                                            onChange={(e) => {
                                              const next = currentEntries.map((candidate) => (
                                                candidate.value === option.value
                                                  ? { ...candidate, detailText: e.target.value }
                                                  : candidate
                                              ));
                                              setRepeatFieldValue(
                                                sectionField.key,
                                                rowIndex,
                                                next.map((candidate) => (
                                                  candidate.detailText
                                                    ? { value: candidate.value, detailText: candidate.detailText }
                                                    : candidate.value
                                                ))
                                              );
                                            }}
                                            placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                                            className={cn(
                                              'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                              sectionChoiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS
                                            )}
                                          />
                                        );
                                      })}
                                    </>
                                  );
                                })()
                              ) : (
                                sectionChoiceOptions.map((option, optionIndex) => {
                                  const currentEntries = parseChoiceAnswerEntries(sectionValue);
                                  const currentValues = currentEntries.map((entry) => entry.value);
                                  const entry = currentEntries.find((candidate) => candidate.value === option.value);
                                  const optionId = `${sectionFieldDomId}-option-${optionIndex}-${toDomSafeId(option.value)}`;
                                  return (
                                    <div key={`${option.value}-${optionIndex}`} className="space-y-1.5">
                                      <label htmlFor={optionId} className={cn('flex items-center gap-2 text-sm text-text-primary', sectionHighlightChoiceGroup && 'text-status-error')}>
                                        <input
                                          id={optionId}
                                          type="checkbox"
                                          checked={currentValues.includes(option.value)}
                                          onChange={(e) => {
                                            if (!e.target.checked && option.requiredSelected) return;
                                            if (e.target.checked) {
                                              const next = [
                                                ...currentEntries.filter((candidate) => candidate.value !== option.value),
                                                { value: option.value, detailText: option.allowTextInput ? '' : '' },
                                              ];
                                              const nextValue = next.map((candidate) => (
                                                option.allowTextInput && candidate.value === option.value
                                                  ? { value: candidate.value, detailText: candidate.detailText }
                                                  : (candidate.detailText ? { value: candidate.value, detailText: candidate.detailText } : candidate.value)
                                              ));
                                              setRepeatFieldValue(sectionField.key, rowIndex, nextValue);
                                            } else {
                                              const next = currentEntries
                                                .filter((candidate) => candidate.value !== option.value)
                                                .map((candidate) => (
                                                  candidate.detailText
                                                    ? { value: candidate.value, detailText: candidate.detailText }
                                                    : candidate.value
                                                ));
                                              setRepeatFieldValue(sectionField.key, rowIndex, next);
                                            }
                                          }}
                                          className={CHOICE_CHECKBOX_INPUT_CLASS}
                                        />
                                        {getChoiceOptionDisplayLabel(option)}
                                      </label>
                                      {option.allowTextInput && currentValues.includes(option.value) && (
                                        <textarea
                                          rows={3}
                                          value={entry?.detailText || ''}
                                          onChange={(e) => {
                                            const next = currentEntries.map((candidate) => (
                                              candidate.value === option.value
                                                ? { ...candidate, detailText: e.target.value }
                                                : candidate
                                            ));
                                            setRepeatFieldValue(
                                              sectionField.key,
                                              rowIndex,
                                              next.map((candidate) => (
                                                candidate.detailText
                                                  ? { value: candidate.value, detailText: candidate.detailText }
                                                  : candidate.value
                                              ))
                                            );
                                          }}
                                          placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                                          className={cn(
                                            'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                            sectionChoiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS
                                          )}
                                        />
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </fieldset>
                          )}

                          {(sectionField.type === 'FILE_UPLOAD' || sectionField.type === 'SIGNATURE') && (
                            <div className="rounded-lg border border-border-primary/60 bg-background-secondary/40 px-3 py-2 text-xs text-text-muted">
                              {uiLabel('dynamic_section_unsupported_field')}
                            </div>
                          )}

                          {sectionErrorText && !sectionUseDateSelector && !sectionUseTimeTimezoneInput && (
                            <p id={sectionErrorId} className="mt-1 text-xs text-status-error">{sectionErrorText}</p>
                          )}
                        </div>
                      );
                        })}
                      </div>
                      <div className={cn('flex h-full items-start justify-center', sectionHasVisibleLabels ? 'pt-6' : 'pt-0')}>
                        <button
                          type="button"
                          onClick={() => removeRepeatSectionRow(sectionId, rowIndex, sectionFields)}
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-md border border-pink-300 bg-pink-50 text-pink-500 transition-colors',
                            'hover:bg-pink-100 hover:text-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-200',
                            !canRemoveRow && 'pointer-events-none invisible'
                          )}
                          aria-label={`${removeRowLabel} ${rowIndex + 1}`}
                          title={removeRowLabel}
                          disabled={!canRemoveRow}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => addRepeatSectionRow(sectionId, sectionConfig.maxItems)}
                disabled={!canAddRow}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-primary bg-[#F4F7F6] text-text-secondary transition-colors hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={addRowLabel}
                title={addRowLabel}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderCardField(
    field: PublicField
  ): React.ReactNode {
    const localizedField = getLocalizedField(field);

    if (isRepeatStartMarker(field)) {
      return renderStandaloneField(field);
    }

    if (field.type === 'PARAGRAPH' && isInlineInfoBlock(field)) {
      return renderStandaloneField(field);
    }

    if (isRepeatEndMarker(field) || isBlockDivider(field) || field.type === 'PAGE_BREAK' || field.type === 'PARAGRAPH' || field.type === 'HTML' || field.type === 'HIDDEN') {
      return null;
    }

    const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];
    const value = answers[field.key];
    const errorText = fieldErrors[getFieldErrorKey(field.key)];
    const fieldDomId = `form-field-${toDomSafeId(field.id || field.key)}`;
    const controlId = `${fieldDomId}-control`;
    const labelId = `${fieldDomId}-label`;
    const hintId = localizedField.subtext ? `${fieldDomId}-hint` : undefined;
    const errorId = errorText ? `${fieldDomId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
    const accessibleLabel = localizedField.label || field.key;
    const choiceInlineRight = isChoiceInlineRightEnabled(field);
    const choiceOptions = parseChoiceOptions(localizedField.options);
    const choiceDetailErrorValues = (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE')
      ? getChoiceDetailErrorValues(choiceOptions, value)
      : new Set<string>();
    const highlightChoiceGroup = !!errorText && choiceDetailErrorValues.size === 0;
    const renderLabelAsText =
      ((field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') && !choiceInlineRight) ||
      field.type === 'SIGNATURE';
    const useDateSelector = field.type === 'SHORT_TEXT' && field.inputType === 'date';
    const dateValidationRange = useDateSelector ? getDateValidationRange(field, answers) : {};
    const useSplitPhoneInput = field.type === 'SHORT_TEXT' && field.inputType === 'phone' && isSplitPhoneCountryCodeEnabled(field);
    const useTimeTimezoneInput = field.type === 'SHORT_TEXT' && field.inputType === 'time_timezone';
    const showTooltip = isTooltipEnabled(localizedField);
    const tooltipText = showTooltip ? localizedField.helpText!.trim() : null;
    const tooltipMode = tooltipText ? getTooltipMode(localizedField) : 'hover';
    const inlineTooltipKey = field.id || field.key;
    const isInlineTooltipOpen = tooltipMode === 'inline' && openInlineTooltips[inlineTooltipKey] === true;
    const allowMultipleFiles = field.type === 'FILE_UPLOAD' && isMultipleFileUploadEnabled(field);
    const uploadStatuses = uploadedByFieldKey[field.key] || [];
    const isUploadDragOver = dragOverUploadFieldKey === field.key;
    const phoneDefaultCountryCode = useSplitPhoneInput ? getPhoneDefaultCountryCode(field) : DEFAULT_PHONE_COUNTRY_CODE;
    const phoneParts = useSplitPhoneInput ? parsePhoneParts(value, phoneDefaultCountryCode) : null;
    const timeTimezoneParts = useTimeTimezoneInput ? parseTimeTimezoneValue(value, getTimezoneDefault(field)) : null;
    const resolvedDateValue = typeof value === 'string' && value.trim().length > 0
      ? value
      : '';
    const renderTooltipTrigger = () => {
      if (!tooltipText) return null;

      if (tooltipMode === 'inline') {
        const toggleInlineTooltip = (event: React.MouseEvent | React.KeyboardEvent) => {
          event.preventDefault();
          event.stopPropagation();
          setOpenInlineTooltips((prev) => ({
            ...prev,
            [inlineTooltipKey]: !prev[inlineTooltipKey],
          }));
        };

        return (
          <Tooltip content="Click to see">
            <span
              role="button"
              tabIndex={0}
              aria-label={isInlineTooltipOpen ? 'Hide field information' : 'Show field information'}
              aria-expanded={isInlineTooltipOpen}
              className={cn(
                'inline-flex h-4 w-4 cursor-pointer items-center justify-center text-text-muted hover:text-text-secondary',
                isInlineTooltipOpen && 'text-oak-primary'
              )}
              onClick={toggleInlineTooltip}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                toggleInlineTooltip(event);
              }}
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        );
      }

      return (
        <Tooltip content={<span className="block max-w-xs whitespace-pre-wrap break-words">{tooltipText}</span>}>
          <span className="inline-flex h-4 w-4 cursor-help items-center justify-center text-text-muted hover:text-text-secondary">
            <Info className="h-3.5 w-3.5" />
          </span>
        </Tooltip>
      );
    };
    const inlineTooltipBlock = tooltipText && isInlineTooltipOpen ? (
      <div
        className="mb-3 rounded-lg border border-border-primary text-sm text-text-primary"
        style={getTooltipInfoStyle(localizedField)}
      >
        {hasHtmlMarkup(tooltipText) ? (
          <div
            className="form-rich-render text-sm text-text-primary"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(tooltipText) }}
          />
        ) : (
          <div className="whitespace-pre-wrap">{tooltipText}</div>
        )}
      </div>
    ) : null;
    const renderChoiceOptionLabel = (option: (typeof choiceOptions)[number]) => (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="min-w-0">{getChoiceOptionDisplayLabel(option)}</span>
        {option.tooltipText && (
          <Tooltip content={<span className="block max-w-xs whitespace-pre-wrap break-words">{option.tooltipText}</span>}>
            <span
              role="img"
              tabIndex={0}
              aria-label={`More information about ${option.label}`}
              className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center text-text-muted hover:text-text-secondary"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </Tooltip>
        )}
      </span>
    );
    const setMultipleChoiceEntries = (nextEntries: ChoiceAnswerEntry[]) => {
      setFieldValue(field.key, serializeChoiceAnswerEntries(nextEntries));
    };
    const addChoiceEntry = (
      entries: ChoiceAnswerEntry[],
      option: (typeof choiceOptions)[number]
    ): ChoiceAnswerEntry[] => {
      const nextEntry = parseChoiceAnswerEntry(buildChoiceAnswerValue(option));
      if (!nextEntry) return entries;
      return [...entries.filter((entry) => entry.value !== option.value), nextEntry];
    };
    const updateChoiceDetail = (
      entries: ChoiceAnswerEntry[],
      option: (typeof choiceOptions)[number],
      detailText: string
    ): ChoiceAnswerEntry[] => entries.map((entry) => (
      entry.value === option.value ? { ...entry, detailText } : entry
    ));
    const toggleNestedChoice = (
      entries: ChoiceAnswerEntry[],
      parentOption: (typeof choiceOptions)[number],
      childOption: (typeof parentOption.childOptions)[number],
      checked: boolean
    ): ChoiceAnswerEntry[] => entries.map((entry) => {
      if (entry.value !== parentOption.value) return entry;
      if (!checked && childOption.requiredSelected) return entry;
      if (!checked) {
        return { ...entry, children: entry.children.filter((child) => child.value !== childOption.value) };
      }
      const childEntry = parseChoiceAnswerEntry(buildChoiceAnswerValue(childOption));
      if (!childEntry) return entry;
      if (parentOption.childSelectionMode === 'single') {
        return {
          ...entry,
          children: [childEntry],
        };
      }
      return {
        ...entry,
        children: [...entry.children.filter((child) => child.value !== childOption.value), childEntry],
      };
    });
    const updateNestedChoiceDetail = (
      entries: ChoiceAnswerEntry[],
      parentOption: (typeof choiceOptions)[number],
      childOption: (typeof parentOption.childOptions)[number],
      detailText: string
    ): ChoiceAnswerEntry[] => entries.map((entry) => {
      if (entry.value !== parentOption.value) return entry;
      return {
        ...entry,
        children: entry.children.map((child) => (
          child.value === childOption.value ? { ...child, detailText } : child
        )),
      };
    });
    const renderNestedChoiceOptions = (
      parentOption: (typeof choiceOptions)[number],
      parentEntry: ChoiceAnswerEntry | undefined,
      entries: ChoiceAnswerEntry[]
    ) => {
      if (!parentEntry || parentOption.childOptions.length === 0) return null;
      const isSingleNestedChoice = parentOption.childSelectionMode === 'single';
      const requiredChild = parentOption.childOptions.find((childOption) => childOption.requiredSelected);
      return (
        <div className="ml-7 mt-2 space-y-2 rounded-lg border border-border-primary/40 bg-background-secondary/35 p-3">
          {parentOption.childOptions.map((childOption, childIndex) => {
            const childEntry = parentEntry.children.find((entry) => entry.value === childOption.value);
            const isChildChecked = !!childEntry;
            const childOptionId = `${fieldDomId}-option-${toDomSafeId(parentOption.value)}-child-${childIndex}-${toDomSafeId(childOption.value)}`;
            const isDisabledByRequiredChild = !!requiredChild && requiredChild.value !== childOption.value;
            return (
              <div key={`${parentOption.value}-${childOption.value}-${childIndex}`} className="space-y-1.5">
                <label
                  htmlFor={childOptionId}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary',
                    isDisabledByRequiredChild && 'cursor-not-allowed opacity-60',
                    highlightChoiceGroup && 'text-status-error'
                  )}
                >
                  <input
                    id={childOptionId}
                    type={isSingleNestedChoice ? 'radio' : 'checkbox'}
                    name={isSingleNestedChoice ? `${field.key}-${parentOption.value}-children` : undefined}
                    checked={isChildChecked}
                    disabled={isDisabledByRequiredChild}
                    onChange={(e) => setMultipleChoiceEntries(toggleNestedChoice(entries, parentOption, childOption, e.target.checked))}
                    className={isSingleNestedChoice ? CHOICE_RADIO_INPUT_CLASS : CHOICE_CHECKBOX_INPUT_CLASS}
                  />
                  {renderChoiceOptionLabel(childOption)}
                </label>
                {childOption.allowTextInput && isChildChecked && (
                  <textarea
                    rows={3}
                    value={childEntry?.detailText || ''}
                    onChange={(e) => setMultipleChoiceEntries(updateNestedChoiceDetail(entries, parentOption, childOption, e.target.value))}
                    placeholder={childOption.textInputPlaceholder || childOption.textInputLabel || uiLabel('choice_other_placeholder')}
                    className={cn(
                      'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                      choiceDetailErrorValues.has(childOption.value) && ERROR_FIELD_CLASS
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <React.Fragment key={field.id}>
        <div className={cn(widthClass, isLayoutBreakBeforeEnabled(field) && 'md:col-start-1')}>
          {/* Label */}
          {!field.hideLabel && !choiceInlineRight && (
            renderLabelAsText ? (
              <p id={labelId} className="mb-1.5 block text-sm font-medium text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span>
                    {accessibleLabel}
                    {field.isRequired && <span className="text-oak-primary"> *</span>}
                  </span>
                  {renderTooltipTrigger()}
                </span>
              </p>
            ) : (
              <label htmlFor={controlId} id={labelId} className="mb-1.5 block text-sm font-medium text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span>
                    {accessibleLabel}
                    {field.isRequired && <span className="text-oak-primary"> *</span>}
                  </span>
                  {renderTooltipTrigger()}
                </span>
              </label>
            )
          )}

          {localizedField.subtext && <p id={hintId} className="mb-2 text-sm text-text-secondary">{localizedField.subtext}</p>}
          {inlineTooltipBlock}

          {/* SHORT_TEXT */}
          {field.type === 'SHORT_TEXT' && !useDateSelector && !useSplitPhoneInput && !useTimeTimezoneInput && (
            <input
              id={controlId}
              type={field.inputType === 'phone' ? 'tel' : field.inputType || 'text'}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setFieldValue(field.key, e.target.value)}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
              placeholder={localizedField.placeholder || ''}
              readOnly={field.isReadOnly}
              required={field.isRequired}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={describedBy}
              className={cn(
                'w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50',
                'focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                errorText && ERROR_FIELD_CLASS,
                field.isReadOnly && 'bg-[#EDE9E5] cursor-not-allowed opacity-70'
              )}
            />
          )}

          {useTimeTimezoneInput && timeTimezoneParts && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
              <SingleTimeInput
                id={controlId}
                value={timeTimezoneParts.time}
                onChange={(nextTime) => setFieldValue(field.key, buildTimeTimezoneValue(nextTime, timeTimezoneParts.timezone))}
                onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
                disabled={field.isReadOnly}
                required={field.isRequired}
                ariaLabel={field.hideLabel ? accessibleLabel : undefined}
                error={errorText}
                className="w-full"
              />
              <SearchableSelect
                options={TIMEZONE_OPTIONS}
                value={timeTimezoneParts.timezone}
                onChange={(nextTimezone) => setFieldValue(
                  field.key,
                  buildTimeTimezoneValue(timeTimezoneParts.time, nextTimezone || getTimezoneDefault(field))
                )}
                placeholder="Timezone"
                clearable={false}
                showKeyboardHints={false}
                containerClassName={cn('h-10', errorText && ERROR_FIELD_CLASS)}
                onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
              />
            </div>
          )}

          {useSplitPhoneInput && phoneParts && (
            <div className="grid grid-cols-[minmax(132px,180px)_minmax(0,1fr)] gap-2">
              <SearchableSelect
                options={localizedPhoneCountryCodeOptions}
                value={phoneParts.countryCode}
                onChange={(nextCountryCode) => setFieldValue(
                  field.key,
                  buildPhoneValue(nextCountryCode || phoneDefaultCountryCode, phoneParts.number)
                )}
                placeholder={uiLabel('phone_code_placeholder')}
                clearable={false}
                showKeyboardHints={false}
                popoverMinWidth={300}
                containerClassName={cn('h-10', errorText && ERROR_FIELD_CLASS)}
                onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
              />
              <input
                id={controlId}
                type="tel"
                value={phoneParts.number}
                onChange={(e) => setFieldValue(field.key, buildPhoneValue(phoneParts.countryCode, e.target.value))}
                onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
                placeholder={localizedField.placeholder || ''}
                readOnly={field.isReadOnly}
                required={field.isRequired}
                aria-label={field.hideLabel ? accessibleLabel : undefined}
                aria-invalid={errorText ? 'true' : undefined}
                aria-describedby={describedBy}
                className={cn(
                  'w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50',
                  'focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                  errorText && ERROR_FIELD_CLASS,
                  field.isReadOnly && 'bg-[#EDE9E5] cursor-not-allowed opacity-70'
                )}
              />
            </div>
          )}

          {/* DATE */}
          {useDateSelector && (
            <SingleDateInput
              value={resolvedDateValue}
              onChange={(next) => setFieldValue(field.key, next)}
              placeholder={localizedField.placeholder || uiLabel('date_placeholder')}
              disabled={field.isReadOnly}
              required={field.isRequired}
              error={errorText}
              ariaLabel={field.hideLabel ? accessibleLabel : undefined}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
              minDate={dateValidationRange.minDate}
              maxDate={dateValidationRange.maxDate}
              className="w-full"
            />
          )}

          {/* LONG_TEXT */}
          {field.type === 'LONG_TEXT' && (
            <textarea
              id={controlId}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setFieldValue(field.key, e.target.value)}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
              placeholder={localizedField.placeholder || ''}
              readOnly={field.isReadOnly}
              required={field.isRequired}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={describedBy}
              className={cn(
                'w-full min-h-24 rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50',
                'focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150 resize-y',
                errorText && ERROR_FIELD_CLASS,
                field.isReadOnly && 'bg-[#EDE9E5] cursor-not-allowed opacity-70'
              )}
            />
          )}

          {/* DROPDOWN */}
          {field.type === 'DROPDOWN' && (
            <SearchableSelect
              options={parseChoiceOptions(localizedField.options).map((opt) => ({ value: opt.value, label: opt.label }))}
              value={typeof value === 'string' ? value : ''}
              onChange={(val) => setFieldValue(field.key, val)}
              placeholder={localizedField.placeholder || uiLabel('select_option_placeholder')}
              clearable={false}
              showKeyboardHints={false}
              containerClassName={cn('h-10', errorText && ERROR_FIELD_CLASS)}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers)}
            />
          )}

          {/* SINGLE_CHOICE */}
          {field.type === 'SINGLE_CHOICE' && (
            <fieldset
              className={cn('space-y-2 rounded-lg', highlightChoiceGroup && 'ring-1 ring-status-error/20')}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-labelledby={field.hideLabel ? undefined : labelId}
              aria-describedby={describedBy}
              aria-invalid={errorText ? 'true' : undefined}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers); }}
            >
              {choiceInlineRight ? (
                (() => {
                  const selectedEntry = parseChoiceAnswerEntry(value);
                  return (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,max-content)] sm:items-start sm:gap-3">
                        {!field.hideLabel && (
                          <legend id={labelId} className="min-w-0 text-sm font-medium text-text-secondary sm:pt-1">
                            <span className="inline-flex items-center gap-1.5">
                              <span>
                                {accessibleLabel}
                                {field.isRequired && <span className="text-oak-primary"> *</span>}
                              </span>
                              {renderTooltipTrigger()}
                            </span>
                          </legend>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-self-end sm:whitespace-nowrap">
                          {choiceOptions.map((option, index) => {
                            const isSelected = selectedEntry?.value === option.value;
                            const optionId = `${fieldDomId}-option-${index}`;
                            return (
                              <label key={`${option.value}-${index}`} htmlFor={optionId} className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary', highlightChoiceGroup && 'text-status-error')}>
                                <input
                                  id={optionId}
                                  type="radio"
                                  name={field.key}
                                  value={option.value}
                                  checked={isSelected}
                                  onChange={() => setFieldValue(
                                    field.key,
                                    option.allowTextInput
                                      ? { value: option.value, detailText: selectedEntry?.value === option.value ? selectedEntry.detailText : '' }
                                      : option.value
                                  )}
                                  className={CHOICE_RADIO_INPUT_CLASS}
                                />
                                {renderChoiceOptionLabel(option)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      {choiceOptions.map((option, index) => {
                        const isSelected = selectedEntry?.value === option.value;
                        if (!option.allowTextInput || !isSelected) return null;
                        return (
                          <textarea
                            key={`${option.value}-${index}-detail`}
                            rows={3}
                            value={selectedEntry?.detailText || ''}
                            onChange={(e) => setFieldValue(field.key, { value: option.value, detailText: e.target.value })}
                            placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                            className={cn('w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150', choiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS)}
                          />
                        );
                      })}
                    </>
                  );
                })()
              ) : (
                choiceOptions.map((option, index) => {
                  const selectedEntry = parseChoiceAnswerEntry(value);
                  const isSelected = selectedEntry?.value === option.value;
                  const optionId = `${fieldDomId}-option-${index}`;
                  return (
                    <div key={`${option.value}-${index}`} className="space-y-1.5">
                      <label
                        htmlFor={optionId}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150',
                          'focus-within:ring-2 focus-within:ring-oak-primary/20 focus-within:border-oak-primary',
                          isSelected
                            ? 'border-oak-primary/40 bg-oak-primary/5 text-text-primary'
                            : 'border-border-primary/25 bg-background-secondary/30 text-text-primary hover:border-border-primary/50 hover:bg-background-secondary/60',
                          highlightChoiceGroup && ERROR_CHOICE_CLASS
                        )}
                      >
                        <input id={optionId} type="radio" name={field.key} value={option.value} checked={isSelected}
                          onChange={() => setFieldValue(field.key, option.allowTextInput ? { value: option.value, detailText: selectedEntry?.value === option.value ? selectedEntry.detailText : '' } : option.value)}
                          className="peer sr-only"
                        />
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-[#F4F7F6] transition-all duration-150 peer-focus-visible:border-oak-primary peer-focus-visible:ring-2 peer-focus-visible:ring-oak-primary/20', isSelected ? 'border-oak-primary' : 'border-border-primary')}>
                          {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-oak-primary" />}
                        </span>
                        {renderChoiceOptionLabel(option)}
                      </label>
                      {option.allowTextInput && isSelected && (
                        <textarea rows={3} value={selectedEntry?.detailText || ''}
                          onChange={(e) => setFieldValue(field.key, { value: option.value, detailText: e.target.value })}
                          placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                          className={cn('w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150', choiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS)}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </fieldset>
          )}

          {/* MULTIPLE_CHOICE */}
          {field.type === 'MULTIPLE_CHOICE' && (
            <fieldset
              className={cn('space-y-2 rounded-lg', highlightChoiceGroup && 'ring-1 ring-status-error/20')}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-labelledby={field.hideLabel ? undefined : labelId}
              aria-describedby={describedBy}
              aria-invalid={errorText ? 'true' : undefined}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key), answers); }}
            >
              {choiceInlineRight ? (
                (() => {
                  const entries = parseChoiceAnswerEntries(value);
                  const values = entries.map((e) => e.value);
                  return (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,max-content)] sm:items-start sm:gap-3">
                        {!field.hideLabel && (
                          <legend id={labelId} className="min-w-0 text-sm font-medium text-text-secondary sm:pt-1">
                            <span className="inline-flex items-center gap-1.5">
                              <span>
                                {accessibleLabel}
                                {field.isRequired && <span className="text-oak-primary"> *</span>}
                              </span>
                              {renderTooltipTrigger()}
                            </span>
                          </legend>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-self-end sm:whitespace-nowrap">
                          {choiceOptions.map((option, index) => {
                            const isChecked = values.includes(option.value);
                            const optionId = `${fieldDomId}-option-${index}-${toDomSafeId(option.value)}`;
                            return (
                              <label key={`${option.value}-${index}`} htmlFor={optionId} className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary', highlightChoiceGroup && 'text-status-error')}>
                                <input
                                  id={optionId}
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (!e.target.checked && option.requiredSelected) return;
                                    if (e.target.checked) {
                                      setMultipleChoiceEntries(addChoiceEntry(entries, option));
                                    } else {
                                      setMultipleChoiceEntries(entries.filter((en) => en.value !== option.value));
                                    }
                                  }}
                                  className={CHOICE_CHECKBOX_INPUT_CLASS}
                                />
                                {renderChoiceOptionLabel(option)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      {choiceOptions.map((option, index) => {
                        const isChecked = values.includes(option.value);
                        const optionEntry = entries.find((e) => e.value === option.value);
                        if (!isChecked) return null;
                        return (
                          <React.Fragment key={`${option.value}-${index}-nested`}>
                            {option.allowTextInput && (
                              <textarea
                                rows={3}
                                value={optionEntry?.detailText || ''}
                                onChange={(e) => setMultipleChoiceEntries(updateChoiceDetail(entries, option, e.target.value))}
                                placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                                className={cn(
                                  'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                                  choiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS
                                )}
                              />
                            )}
                            {renderNestedChoiceOptions(option, optionEntry, entries)}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })()
              ) : (
                choiceOptions.map((option, index) => {
                  const entries = parseChoiceAnswerEntries(value);
                  const values = entries.map((e) => e.value);
                  const isChecked = values.includes(option.value);
                  const optionId = `${fieldDomId}-option-${index}-${toDomSafeId(option.value)}`;
                  const optionEntry = entries.find((e) => e.value === option.value);
                  return (
                    <div key={`${option.value}-${index}`} className="space-y-1.5">
                      <label
                        htmlFor={optionId}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150',
                          'focus-within:ring-2 focus-within:ring-oak-primary/20 focus-within:border-oak-primary',
                          isChecked
                            ? 'border-oak-primary/40 bg-oak-primary/5 text-text-primary'
                            : 'border-border-primary/25 bg-background-secondary/30 text-text-primary hover:border-border-primary/50 hover:bg-background-secondary/60',
                          highlightChoiceGroup && ERROR_CHOICE_CLASS
                        )}
                      >
                        <input id={optionId} type="checkbox" checked={isChecked}
                          onChange={(e) => {
                            if (!e.target.checked && option.requiredSelected) return;
                            if (e.target.checked) {
                              setMultipleChoiceEntries(addChoiceEntry(entries, option));
                            } else {
                              setMultipleChoiceEntries(entries.filter((en) => en.value !== option.value));
                            }
                          }}
                          className="peer sr-only"
                        />
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-150 peer-focus-visible:border-oak-primary peer-focus-visible:ring-2 peer-focus-visible:ring-oak-primary/20', isChecked ? 'border-oak-primary bg-oak-primary' : 'border-border-primary bg-[#F4F7F6]')}>
                          {isChecked && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </span>
                        {renderChoiceOptionLabel(option)}
                      </label>
                      {option.allowTextInput && isChecked && (
                        <textarea rows={3} value={optionEntry?.detailText || ''}
                          onChange={(e) => setMultipleChoiceEntries(updateChoiceDetail(entries, option, e.target.value))}
                          placeholder={option.textInputPlaceholder || option.textInputLabel || uiLabel('choice_other_placeholder')}
                          className={cn(
                            'w-full min-h-20 resize-y rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                            choiceDetailErrorValues.has(option.value) && ERROR_FIELD_CLASS
                          )}
                        />
                      )}
                      {renderNestedChoiceOptions(option, optionEntry, entries)}
                    </div>
                  );
                })
              )}
            </fieldset>
          )}

          {/* FILE_UPLOAD */}
          {field.type === 'FILE_UPLOAD' && (
            <div className={cn(
              'rounded-xl border border-dashed bg-background-primary/50 p-6 text-center transition-colors duration-150',
              'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#294D44]/20',
              errorText
                ? ERROR_CHOICE_CLASS
                : isUploadDragOver
                ? 'border-oak-primary bg-oak-primary/5'
                : (uploadStatuses.length > 0 ? 'border-status-success/40' : 'border-border-primary/60 hover:border-oak-primary/40')
            )}
              role="button"
              tabIndex={0}
              aria-label={uiLabel(allowMultipleFiles ? 'upload_files_for_field' : 'upload_file_for_field', { field: accessibleLabel })}
              onClick={() => {
                const input = document.getElementById(controlId);
                if (input instanceof HTMLInputElement) {
                  input.click();
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                const input = document.getElementById(controlId);
                if (input instanceof HTMLInputElement) {
                  input.click();
                }
              }}
              onDragOver={(e) => {
                const dragTypes = Array.from(e.dataTransfer.types || []);
                if (!dragTypes.includes('Files')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDragOverUploadFieldKey(field.key);
              }}
              onDragLeave={(e) => {
                const nextTarget = e.relatedTarget as Node | null;
                if (nextTarget && e.currentTarget.contains(nextTarget)) return;
                setDragOverUploadFieldKey((prev) => (prev === field.key ? null : prev));
              }}
              onDrop={(e) => {
                const dragTypes = Array.from(e.dataTransfer.types || []);
                if (!dragTypes.includes('Files')) return;
                e.preventDefault();
                setDragOverUploadFieldKey((prev) => (prev === field.key ? null : prev));
                const files = Array.from(e.dataTransfer.files || []);
                if (files.length > 0) {
                  void uploadFiles(field, allowMultipleFiles ? files : files.slice(0, 1));
                }
              }}
            >
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-primary underline">
                {uploadStatuses.length > 0
                  ? (allowMultipleFiles ? localizedUiLabels.add_more_files : localizedUiLabels.replace_file)
                  : (allowMultipleFiles ? localizedUiLabels.upload_files : localizedUiLabels.upload_file)}
              </p>
              <p className="mt-1 text-xs text-text-secondary">{localizedUiLabels.upload_drag_hint}</p>
              <input id={controlId} type="file" className="sr-only"
                multiple={allowMultipleFiles}
                aria-label={field.hideLabel ? accessibleLabel : undefined}
                aria-invalid={errorText ? 'true' : undefined}
                aria-describedby={describedBy}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    void uploadFiles(field, allowMultipleFiles ? files : files.slice(0, 1));
                  }
                  e.currentTarget.value = '';
                }}
              />
              <p className="mt-1 text-xs text-text-muted">
                {uploadingField === field.key
                  ? localizedUiLabels.uploading
                  : uploadStatuses.length > 0
                    ? (uploadStatuses.length > 1 ? localizedUiLabels.upload_success_plural : localizedUiLabels.upload_success)
                    : (allowMultipleFiles ? localizedUiLabels.upload_select_multiple_prompt : localizedUiLabels.upload_select_prompt)}
              </p>
              {uploadStatuses.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadStatuses.map((upload) => (
                    <div key={upload.id} className="rounded-md border border-status-success/30 bg-status-success/5 px-2.5 py-2 text-left">
                      <div className="flex items-start gap-2 text-sm text-text-primary">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-status-success" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{upload.fileName}</p>
                          <p className="text-xs text-text-secondary">{formatFileSize(upload.sizeBytes)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeUploadedFile(field.key, upload.id);
                          }}
                          className="rounded border border-border-primary bg-background-primary px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                          aria-label={`${localizedUiLabels.remove_file}: ${upload.fileName}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SIGNATURE */}
          {field.type === 'SIGNATURE' && (
            <div
              role="group"
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-labelledby={field.hideLabel ? undefined : labelId}
              aria-describedby={describedBy}
              className="space-y-3"
            >
              {(() => {
                const signatureValue = extractSignatureDataUrl(value) ?? '';
                const hasSignature = signatureValue.length > 0;

                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveSignatureFieldKey(field.key)}
                      disabled={field.isReadOnly}
                      aria-label={field.hideLabel ? accessibleLabel : undefined}
                      className={cn(
                        'group w-full overflow-hidden rounded-2xl border text-left transition-all duration-200',
                        hasSignature
                          ? 'border-[#D8E3DF] bg-white hover:border-[#B7CAC2] hover:shadow-sm'
                          : 'border-dashed border-[#C8D7D1] bg-[linear-gradient(180deg,#FCFEFD_0%,#F4F7F6_100%)] hover:border-[#294D44]/40 hover:shadow-sm',
                        errorText && ERROR_CHOICE_CLASS,
                        field.isReadOnly && 'cursor-not-allowed opacity-70'
                      )}
                    >
                      <div className="relative px-4 py-4">
                        <div className="pointer-events-none absolute bottom-8 left-8 right-8 border-b border-dashed border-[#B7CAC2]" />
                        {hasSignature ? (
                          <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-[#E3ECE8] bg-white px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={signatureValue}
                              alt={`${accessibleLabel} preview`}
                              className="max-h-28 w-auto max-w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-[#D7E2DD] bg-white/85 px-5 py-5 text-center">
                            <PenLine className="mb-3 h-6 w-6 text-[#294D44]" />
                            <p className="text-sm font-medium text-text-primary">{uiLabel('signature_empty_title')}</p>
                            <p className="mt-1 max-w-xs text-xs leading-relaxed text-text-secondary">
                              {uiLabel('signature_empty_hint')}
                            </p>
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveSignatureFieldKey(field.key)}
                        disabled={field.isReadOnly}
                        leftIcon={<PenLine className="h-4 w-4" />}
                      >
                        {hasSignature ? uiLabel('signature_edit') : uiLabel('signature_open_action')}
                      </Button>
                      {hasSignature ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setFieldValue(field.key, '')}
                          disabled={field.isReadOnly}
                          leftIcon={<RotateCcw className="h-4 w-4" />}
                        >
                          {uiLabel('signature_clear')}
                        </Button>
                      ) : null}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Error */}
          {errorText && !useDateSelector && !useTimeTimezoneInput && (
            <p id={errorId} className="mt-1 text-xs text-status-error">{errorText}</p>
          )}
        </div>
      </React.Fragment>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FDFCFA] to-[#EDE8E3] p-4 sm:p-8 flex items-center justify-center">
        <div className="rounded-xl border border-border-primary/50 bg-white/90 px-4 py-3 text-sm font-medium text-text-primary shadow-sm">
          {uiLabel('loading_form')}
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FDFCFA] to-[#EDE8E3] p-4 sm:p-8 flex items-center justify-center">
        <div className="max-w-md rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error || 'Form not found'}
        </div>
      </div>
    );
  }

  if (submissionId) {
    const downloadHref = pdfDownloadToken
      ? `/api/forms/public/${encodeURIComponent(slug)}/submissions/${encodeURIComponent(submissionId)}/pdf?token=${encodeURIComponent(pdfDownloadToken)}`
      : null;

    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FDFCFA] to-[#EDE8E3] p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-xl bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-status-success shrink-0" />
            <div>
              <h1 className="text-lg font-semibold text-text-primary">{localizedUiLabels.response_submitted_title}</h1>
              <p className="text-sm text-text-secondary">{localizedUiLabels.response_submitted_description}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() => {
                if (!downloadHref) return;
                window.open(downloadHref, '_blank', 'noopener,noreferrer');
              }}
              disabled={!downloadHref}
            >
              {localizedUiLabels.download_pdf}
            </Button>
          </div>
          {!downloadHref && (
            <p className="mt-2 text-xs text-text-muted">{localizedUiLabels.download_expired_hint}</p>
          )}

          <div className="mt-6 rounded-lg border border-border-primary/50 bg-background-primary p-3">
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">{localizedUiLabels.email_pdf_copy}</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={pdfRecipientEmail}
                onChange={(e) => {
                  setPdfRecipientEmail(e.target.value);
                  if (emailFeedback) setEmailFeedback(null);
                }}
                placeholder={uiLabel('email_pdf_placeholder')}
                className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Mail className="h-4 w-4" />}
                onClick={sendSubmissionPdfEmail}
                isLoading={isSendingEmail}
              >
                {localizedUiLabels.send}
              </Button>
            </div>
            {emailFeedback && (
              <p className="mt-2 text-xs text-text-secondary">{emailFeedback}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderItems = buildRenderGroups(visibleFields);

  return (
    <div className={cn('min-h-screen', isEmbed ? 'bg-transparent p-0' : 'bg-gradient-to-b from-[#FDFCFA] to-[#EDE8E3] p-4 sm:p-8')}>
      <div ref={formTopRef} className={cn('mx-auto max-w-4xl', isEmbed ? '' : 'py-2')}>
        {canSwitchLanguage && (
          <div className="mb-4 flex justify-end">
            {i18nSettings.enabledLocales.length <= 4 ? (
              <div className="inline-flex items-center rounded-full border border-[#D8E3DF] bg-white/70 p-0.5 shadow-sm backdrop-blur-sm">
                {i18nSettings.enabledLocales.map((locale) => (
                  <button
                    key={locale}
                    type="button"
                    onClick={() => handleLocaleChange(locale)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      activeLocale === locale
                        ? 'bg-[#294D44] text-white shadow-sm'
                        : 'text-[#4A6B5F] hover:text-[#294D44]'
                    }`}
                  >
                    {getLocaleDisplayName(locale)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D8E3DF] bg-white/70 px-3 py-1.5 shadow-sm backdrop-blur-sm">
                <span className="text-xs text-[#4A6B5F]">{localizedUiLabels.language_label}</span>
                <select
                  value={activeLocale}
                  onChange={(e) => handleLocaleChange(e.target.value)}
                  className="bg-transparent text-xs font-medium text-[#294D44] outline-none cursor-pointer"
                >
                  {i18nSettings.enabledLocales.map((locale) => (
                    <option key={locale} value={locale}>{getLocaleDisplayName(locale)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {!isEmbed && (
          <div className="mb-6">
            <div className="flex items-start gap-3">
              {shouldShowLogo && (
                // User-managed logos can come from arbitrary storage providers, so keep a native image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.tenantLogoUrl!}
                  alt={uiLabel('organization_logo_alt')}
                  className="h-32 w-auto max-w-[480px] object-contain rounded-sm flex-shrink-0"
                />
              )}
              <div className="min-w-0 pt-2 md:pt-5">
                <h1 className="text-2xl font-bold text-text-primary md:text-4xl">{localizedFormTitle || form.title}</h1>
                {localizedFormDescription && <p className="mt-2 text-base text-text-secondary leading-relaxed md:text-lg">{localizedFormDescription}</p>}
              </div>
            </div>
            {isPreview && (
              <p className="mt-2 text-xs text-text-muted">
                {uiLabel('preview_notice')}
              </p>
            )}
          </div>
        )}

        {pages.length > 1 && (
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">{uiLabel('page_progress', { current: currentPage + 1, total: pages.length })}</span>
              <span className="text-xs text-text-muted">{Math.round(((currentPage + 1) / pages.length) * 100)}%</span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-border-primary/40">
              <div
                className="h-full rounded-full bg-oak-primary transition-all duration-300 ease-out"
                style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className={cn('flex flex-col gap-4', !isEmbed && 'mt-4')}>
          {renderItems.map((item, itemIndex) => {
            if (item.kind === 'standalone') {
              if (hiddenFieldIds.has(item.field.id)) return null;
              return renderStandaloneField(item.field);
            }

            // Group card
            const groupFields = item.fields.filter((f) => !hiddenFieldIds.has(f.id));
            if (groupFields.length === 0 && !item.heading) return null;

            const groupHasError = groupFields.some((f) => !!fieldErrors[getFieldErrorKey(f.key)]);

            return (
              <div key={item.heading?.id ?? `group-${itemIndex}`}>
                {item.heading && renderHeadingField(item.heading)}
                {groupFields.length > 0 && (
                  <div className={cn(
                    'rounded-xl border bg-white shadow-sm',
                    groupHasError
                      ? 'border-status-error/40 ring-1 ring-status-error/20'
                      : 'border-border-primary/50'
                  )}>
                    <div className="p-5">
                      <div className="grid grid-cols-12 gap-x-4 gap-y-5">
                        {groupFields.map((field) =>
                          renderCardField(field)
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-2">
          <div className="flex items-center justify-between">
          {currentPage > 0 ? (
            <button
              type="button"
              onClick={() => {
                setCurrentPage((prev) => prev - 1);
                scrollToFormTop();
              }}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              <ArrowLeft className="h-4 w-4" />
              {localizedUiLabels.back}
            </button>
          ) : <div />}

          <div className="flex items-center gap-3">
            {pages.length > 1 && (
              <span className="text-xs text-text-muted">
                {uiLabel('page_progress_short', { current: currentPage + 1, total: pages.length })}
              </span>
            )}
            {draftSettings.enabled && !isPreview && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={saveDraft}
                isLoading={isSavingDraft}
              >
                {isSavingDraft
                  ? (draftSession ? localizedUiLabels.updating_draft : localizedUiLabels.saving_draft)
                  : (draftBannerFeedback && draftSession ? localizedUiLabels.draft_updated : draftSession ? localizedUiLabels.update_draft : localizedUiLabels.save_draft)}
              </Button>
            )}
            {!isCurrentPageProgressStopped && (
              currentPage < pages.length - 1 ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-xl px-6 py-2.5 transition-transform duration-150 hover:scale-[1.02]"
                  onClick={() => {
                    if (!validateCurrentPage()) return;
                    setCurrentPage((prev) => prev + 1);
                    scrollToFormTop();
                  }}
                >
                  {localizedUiLabels.continue}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="rounded-xl px-6 py-2.5 transition-transform duration-150 hover:scale-[1.02]"
                  onClick={submitForm}
                  isLoading={isSubmitting}
                  disabled={isPreview}
                >
                  {isPreview ? localizedUiLabels.preview_mode : localizedUiLabels.submit}
                </Button>
              )
            )}
          </div>
          {draftSettings.enabled && !isPreview && !isDraftDetailsModalOpen && (draftError || draftFeedback) && (
            <p className={cn('text-xs', draftError ? 'text-status-error' : 'text-text-secondary')}>
              {draftError || draftFeedback}
            </p>
          )}
        </div>
        </div>
      {!isEmbed && shouldShowFooter && (
        <div className="mt-6 text-center text-sm text-text-tertiary">
          © {form.tenantName}
        </div>
      )}
      </div>

      <Modal
        isOpen={isDraftDetailsModalOpen && !!draftSession}
        onClose={() => {
          setIsDraftDetailsModalOpen(false);
          setDraftError(null);
          setDraftFeedback(null);
        }}
        title={uiLabel('draft_saved_title')}
        description={draftValidityNotice}
        size="lg"
      >
        <ModalBody className="space-y-4">
          {/* Resume URL with inline copy */}
          <div className="rounded-lg border border-border-primary/50 bg-background-primary px-4 py-3">
            <p className="text-xs font-medium text-text-secondary mb-1.5">{uiLabel('resume_link_label')}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={draftSession?.resumeUrl || ''}
                className="min-w-0 flex-1 rounded-md border border-border-primary/40 bg-background-secondary px-3 py-2 text-sm text-text-primary focus:outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={copyResumeLink}
                title={localizedUiLabels.copy_resume_link}
                className="flex items-center justify-center h-9 w-9 shrink-0 rounded-md border border-border-primary/50 bg-white text-text-secondary hover:text-text-primary hover:border-border-primary transition-colors duration-150"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {draftSession?.expiresAt && (
              <p className="mt-1.5 text-xs text-text-muted">
                {localizedUiLabels.draft_expires_label}: {formatDraftDateTime(draftSession.expiresAt)}
              </p>
            )}
            {draftError && (
              <p className="mt-1.5 text-xs text-status-error">{draftError}</p>
            )}
            {draftFeedback && (
              <p className="mt-1.5 text-xs text-text-secondary">{draftFeedback}</p>
            )}
          </div>

          {/* Send to email — collapsible */}
          {!draftEmailSent ? (
            <div className="rounded-lg border border-border-primary/50 bg-background-primary overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setIsDraftEmailExpanded((prev) => !prev);
                  setDraftEmailFeedback(null);
                  setDraftEmailError(null);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-150"
              >
                {localizedUiLabels.send_draft_to_email}
                <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isDraftEmailExpanded && 'rotate-180')} />
              </button>
              {isDraftEmailExpanded && (
                <div className="border-t border-border-primary/40 px-4 pb-4 pt-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={draftEmailInput}
                      onChange={(e) => {
                        setDraftEmailInput(e.target.value);
                        if (draftEmailError) setDraftEmailError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendDraftEmail();
                      }}
                      placeholder={localizedUiLabels.draft_email_placeholder}
                      className="h-9 w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={sendDraftEmail}
                      isLoading={isDraftEmailSending}
                    >
                      {localizedUiLabels.send}
                    </Button>
                  </div>
                  {draftEmailError && (
                    <p className="mt-2 text-xs text-status-error">{draftEmailError}</p>
                  )}
                  {draftEmailFeedback && (
                    <p className="mt-2 text-xs text-text-secondary">{draftEmailFeedback}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-secondary px-1">{draftEmailFeedback}</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setIsDraftDetailsModalOpen(false);
              setDraftError(null);
            }}
          >
            {uiLabel('continue_editing')}
          </Button>
        </ModalFooter>
      </Modal>

      <EsigningSignatureModal
        isOpen={Boolean(activeSignatureFieldKey)}
        onClose={() => setActiveSignatureFieldKey(null)}
        onAdopt={handleSignatureAdopt}
        mode="SIGNATURE"
        recipientName={inferredRespondentName ?? localizedUiLabels.signature_name_fallback}
        existingSignature={activeSignatureValue}
        isSubmitting={false}
        titleOverride={localizedUiLabels.signature_modal_title}
        fullNameLabel={localizedUiLabels.signature_name_label}
        confirmLabel={localizedUiLabels.signature_modal_confirm}
        legalText={localizedUiLabels.signature_modal_legal}
        showApplyToAll={signatureFieldKeys.length > 1}
        applyToAllLabel={localizedUiLabels.signature_apply_all}
        applyToAllDefault={false}
        showDownloadSvg={false}
      />
    </div>
  );
}
