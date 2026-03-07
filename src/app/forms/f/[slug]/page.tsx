'use client';

import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Download, Info, Mail, Plus, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { SignaturePad } from '@/components/forms/signature-pad';
import { Tooltip } from '@/components/ui/tooltip';
import {
  WIDTH_CLASS,
  parseObject,
  parseChoiceOptions,
  parseFormI18nSettings,
  isEmptyValue,
  evaluateCondition,
  type PublicFormField as PublicField,
  type PublicFormDefinition,
} from '@/lib/form-utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_HINT_PATTERN = /(full[\s_-]?name|first[\s_-]?name|last[\s_-]?name|name)/i;
const EMAIL_HINT_PATTERN = /email/i;
const DATA_URI_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CHOICE_RADIO_INPUT_CLASS = 'h-4 w-4 border-[#D8E3DF] bg-[#F4F7F6] accent-[#294D44]';
const CHOICE_CHECKBOX_INPUT_CLASS = 'h-4 w-4 rounded border-[#D8E3DF] bg-[#F4F7F6] accent-[#294D44]';
const DEFAULT_UI_LABELS = {
  language_label: 'Language',
  back: 'Back',
  continue: 'Continue',
  submit: 'Submit',
  preview_mode: 'Preview mode',
  upload_file: 'Upload a file',
  replace_file: 'Replace file',
  upload_drag_hint: 'or drag and drop here',
  upload_select_prompt: 'Select a file to upload',
  uploading: 'Uploading...',
  upload_success: 'File uploaded successfully',
  add_row: 'Add row',
  remove_row: 'Remove row',
  response_submitted_title: 'Response submitted',
  response_submitted_description: 'Your response has been recorded.',
  download_pdf: 'Download PDF',
  download_expired_hint: 'Download link expired. Submit the form again to generate a new link.',
  email_pdf_copy: 'Email a PDF copy',
  send: 'Send',
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

type UploadStatus = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
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
};

function withLocalizedFieldText(field: PublicField, fieldTranslation: Record<string, unknown> | null): PublicField {
  if (!fieldTranslation) return field;

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
    ? fieldTranslation.options.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    : [];

  let options = field.options;
  if (optionTranslations.length > 0) {
    const parsedOptions = parseChoiceOptions(field.options);
    if (parsedOptions.length > 0) {
      options = parsedOptions.map((option, index) => ({
        ...option,
        label: optionTranslations[index] || option.label,
      }));
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

function isTooltipEnabled(field: PublicField): boolean {
  const validation = parseObject(field.validation);
  return validation?.tooltipEnabled === true && typeof field.helpText === 'string' && field.helpText.trim().length > 0;
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
  return normalizeHexColor(validation?.infoBackgroundColor);
}

function isDateDefaultTodayEnabled(field: PublicField): boolean {
  if (field.type !== 'SHORT_TEXT' || field.inputType !== 'date') return false;
  const validation = parseObject(field.validation);
  return validation?.defaultToday === true;
}

function isChoiceInlineRightEnabled(field: PublicField): boolean {
  if (field.type !== 'SINGLE_CHOICE' && field.type !== 'MULTIPLE_CHOICE') return false;
  const validation = parseObject(field.validation);
  return validation?.choiceInlineRight === true;
}

function getLocalTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function isRepeatStartMarker(field: PublicField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start';
}

function isRepeatEndMarker(field: PublicField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end';
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
    return { value: trimmed, detailText: '' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const answerValue = typeof record.value === 'string' ? record.value.trim() : '';
  if (!answerValue) return null;
  const detailText = typeof record.detailText === 'string' ? record.detailText : '';
  return { value: answerValue, detailText };
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
  value: unknown
): string | null {
  const entries = parseChoiceAnswerEntries(value);
  if (entries.length === 0) return null;

  for (const entry of entries) {
    const option = options.find((candidate) => candidate.value === entry.value);
    if (!option?.allowTextInput) continue;
    if (entry.detailText.trim().length > 0) continue;
    return `${fieldLabel}: please specify for ${option.label}`;
  }

  return null;
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

const CARD_ELIGIBLE_TYPES = new Set([
  'SHORT_TEXT',
  'LONG_TEXT',
  'DROPDOWN',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'FILE_UPLOAD',
  'SIGNATURE',
]);

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

    // Heading blocks: flush current group, become next group's heading
    if (
      field.type === 'PARAGRAPH' &&
      (field.inputType === 'info_heading_1' ||
        field.inputType === 'info_heading_2' ||
        field.inputType === 'info_heading_3')
    ) {
      flushGroup();
      currentGroup = { kind: 'group', heading: field, fields: [] };
      continue;
    }

    // Other PARAGRAPH variants and HTML: standalone
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

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const requestedLocale = searchParams.get('lang');
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
  const [uploadedByFieldKey, setUploadedByFieldKey] = useState<Record<string, UploadStatus>>({});
  const [repeatSectionCounts, setRepeatSectionCounts] = useState<Record<string, number>>({});
  const [pdfRecipientEmail, setPdfRecipientEmail] = useState('');
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const i18nSettings = useMemo(
    () => parseFormI18nSettings(form?.settings),
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

  const localizedFieldsById = useMemo(() => {
    const fieldMap = new Map<string, PublicField>();
    const localizedFieldTranslations = activeLocaleTranslation.fields || {};

    for (const field of orderedFields) {
      const fieldTranslation = parseObject(localizedFieldTranslations[field.key]);
      fieldMap.set(field.id, withLocalizedFieldText(field, fieldTranslation));
    }

    return fieldMap;
  }, [orderedFields, activeLocaleTranslation.fields]);

  function getLocalizedField(field: PublicField): PublicField {
    return localizedFieldsById.get(field.id) || field;
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadForm() {
      try {
        setLoading(true);
        setError(null);
        const endpoint = isPreview && previewFormId
          ? `/api/forms/${previewFormId}${previewTenantId ? `?tenantId=${encodeURIComponent(previewTenantId)}` : ''}`
          : `/api/forms/public/${slug}`;

        const response = await fetch(endpoint);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load form');
        }

        if (!isCancelled) {
          if (isPreview && previewFormId) {
            setForm({
              id: data.id,
              slug: data.slug || slug,
              title: data.title,
              description: data.description || null,
              fields: Array.isArray(data.fields) ? data.fields : [],
              status: data.status,
              tenantLogoUrl: data.tenantLogoUrl ?? null,
              tenantName: data.tenantName ?? null,
            } as PublicFormDefinition);
          } else {
            setForm(data as PublicFormDefinition);
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
  }, [slug, isPreview, previewFormId, previewTenantId]);

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
            if (!isDateDefaultTodayEnabled(sectionField)) continue;

            const existingRows = Array.isArray(next[sectionField.key]) ? [...(next[sectionField.key] as unknown[])] : [];
            for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
              const rowValue = existingRows[rowIndex];
              if (typeof rowValue === 'string' && rowValue.trim().length > 0) continue;
              existingRows[rowIndex] = todayIso;
              changed = true;
            }
            next[sectionField.key] = existingRows;
          }

          index = cursor;
          continue;
        }

        if (field.type === 'PAGE_BREAK' || isRepeatEndMarker(field)) continue;
        if (!isDateDefaultTodayEnabled(field)) continue;

        const existingValue = next[field.key];
        if (typeof existingValue === 'string' && existingValue.trim().length > 0) continue;

        next[field.key] = todayIso;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [form, orderedFields, repeatSectionCounts]);

  const pages = useMemo(() => {
    if (!form) return [] as PublicField[][];

    const result: PublicField[][] = [[]];
    for (const field of orderedFields) {
      if (field.type === 'PAGE_BREAK' && !isRepeatStartMarker(field) && !isRepeatEndMarker(field)) {
        result.push([]);
      } else {
        result[result.length - 1].push(field);
      }
    }

    return result.filter((page) => page.length > 0);
  }, [form, orderedFields]);

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
        const sectionVisible = evaluateCondition(field.condition, answers);

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
      if (evaluateCondition(field.condition, answers)) {
        nextVisible.push(field);
      }
    }

    return nextVisible;
  }, [pages, currentPage, answers]);

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

  function withDateDefaultAnswers(baseAnswers: Record<string, unknown>): Record<string, unknown> {
    if (!form) return baseAnswers;

    const todayIso = getLocalTodayIsoDate();
    const next = { ...baseAnswers };
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
          if (!isDateDefaultTodayEnabled(sectionField)) continue;

          const existingRows = Array.isArray(next[sectionField.key]) ? [...(next[sectionField.key] as unknown[])] : [];
          let sectionChanged = false;

          for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
            const rowValue = existingRows[rowIndex];
            if (typeof rowValue === 'string' && rowValue.trim().length > 0) continue;
            existingRows[rowIndex] = todayIso;
            sectionChanged = true;
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
      if (!isDateDefaultTodayEnabled(field)) continue;

      const existingValue = next[field.key];
      if (typeof existingValue === 'string' && existingValue.trim().length > 0) continue;
      next[field.key] = todayIso;
      changed = true;
    }

    return changed ? next : baseAnswers;
  }

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
      if (typeof value !== 'string') return false;
      const trimmed = value.trim();
      return trimmed.length > 0 && DATA_URI_PATTERN.test(trimmed);
    }

    return !isEmptyValue(value);
  }

  function validateField(
    field: PublicField,
    value: unknown,
    localizedField: PublicField
  ): string | null {
    if (NON_VALIDATABLE_FIELD_TYPES.has(field.type)) return null;

    if (field.isRequired && !hasRequiredValue(field, value)) {
      return `${field.label || field.key} is required`;
    }

    if (
      field.type === 'SHORT_TEXT' &&
      field.inputType === 'email' &&
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ) {
      return `${field.label || field.key} must be a valid email`;
    }

    if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') {
      const detailError = getChoiceDetailValidationError(
        field.label || field.key,
        parseChoiceOptions(localizedField.options),
        value
      );
      if (detailError) return detailError;
    }

    return null;
  }

  function handleFieldBlur(field: PublicField, value: unknown, errorKey: string) {
    const error = validateField(field, value, getLocalizedField(field));
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
    const effectiveAnswers = withDateDefaultAnswers(answers);

    for (let index = 0; index < pageFields.length; index += 1) {
      const field = pageFields[index];

      if (isRepeatStartMarker(field)) {
        const sectionVisible = evaluateCondition(field.condition, effectiveAnswers);
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
            if (!evaluateCondition(sectionField.condition, rowAnswers)) continue;
            const sectionValue = effectiveAnswers[sectionField.key];
            const value = Array.isArray(sectionValue) ? sectionValue[rowIndex] : undefined;
            const errorKey = getFieldErrorKey(sectionField.key, rowIndex);

            const error = validateField(sectionField, value, getLocalizedField(sectionField));
            if (error) {
              nextErrors[errorKey] = error;
            }
          }
        }
        continue;
      }

      if (isRepeatEndMarker(field) || field.type === 'PAGE_BREAK') continue;
      if (!evaluateCondition(field.condition, effectiveAnswers)) continue;

      const value = effectiveAnswers[field.key];
      const errorKey = getFieldErrorKey(field.key);

      const error = validateField(field, value, getLocalizedField(field));
      if (error) {
        nextErrors[errorKey] = error;
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadFile(fieldKey: string, file: File) {
    if (isPreview) {
      setFieldErrors((prev) => ({
        ...prev,
        [fieldKey]: 'Preview mode is read-only. Publish the form to accept uploads.',
      }));
      return;
    }

    setUploadingField(fieldKey);
    try {
      const formData = new FormData();
      formData.append('fieldKey', fieldKey);
      formData.append('file', file);

      const response = await fetch(`/api/forms/public/${slug}/uploads`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setFieldValue(fieldKey, [data.id]);
      setUploadedByFieldKey((prev) => ({
        ...prev,
        [fieldKey]: {
          id: data.id,
          fileName: typeof data.fileName === 'string' ? data.fileName : 'Uploaded file',
          mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
          sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
        },
      }));
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        [fieldKey]: err instanceof Error ? err.message : 'Upload failed',
      }));
      setUploadedByFieldKey((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    } finally {
      setUploadingField(null);
      setDragOverUploadFieldKey((prev) => (prev === fieldKey ? null : prev));
    }
  }

  async function submitForm() {
    if (!form) return;

    if (isPreview) {
      setError('Preview mode is read-only. Publish the form to accept submissions.');
      return;
    }

    if (!validateCurrentPage()) return;

    setIsSubmitting(true);
    try {
      const answersWithDefaults = withDateDefaultAnswers(answers);
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

      const shortTextFields = orderedFields.filter((field) => field.type === 'SHORT_TEXT');
      const inferredNameField = shortTextFields.find((field) => {
        const hint = `${field.key} ${field.label || ''}`;
        return NAME_HINT_PATTERN.test(hint);
      });
      const fallbackNameAnswer = answersWithDefaults.full_name ?? answersWithDefaults.name;
      const respondentName = normalizeOptionalText(
        inferredNameField ? answersWithDefaults[inferredNameField.key] : fallbackNameAnswer,
        200
      );

      const inferredEmailField = shortTextFields.find((field) => {
        const hint = `${field.key} ${field.label || ''}`;
        return field.inputType === 'email' || EMAIL_HINT_PATTERN.test(hint);
      });
      const fallbackEmailAnswer = answersWithDefaults.email_address ?? answersWithDefaults.email;
      const normalizedEmailCandidate = normalizeOptionalText(
        inferredEmailField ? answersWithDefaults[inferredEmailField.key] : fallbackEmailAnswer,
        320
      );
      const respondentEmail = normalizedEmailCandidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmailCandidate)
        ? normalizedEmailCandidate.toLowerCase()
        : null;

      const response = await fetch(`/api/forms/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
              `${item.path?.join('.') || 'payload'}: ${item.message || 'Invalid value'}`
            )
            .join('; ')
          : '';

        throw new Error(
          detailText
            ? `${data.error || 'Submission failed'} (${detailText})`
            : (data.error || 'Submission failed')
        );
      }

      setSubmissionId(typeof data.id === 'string' ? data.id : null);
      setPdfDownloadToken(typeof data.pdfDownloadToken === 'string' ? data.pdfDownloadToken : null);
      setPdfEmailAccessToken(typeof data.pdfEmailAccessToken === 'string' ? data.pdfEmailAccessToken : null);
      setEmailFeedback(null);
      setPdfRecipientEmail(respondentEmail || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function sendSubmissionPdfEmail() {
    if (!submissionId) return;
    if (!pdfEmailAccessToken) {
      setEmailFeedback('This email action has expired. Please resubmit the form to request a PDF email.');
      return;
    }

    const normalizedEmail = pdfRecipientEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailFeedback('Enter a valid email address');
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
        throw new Error(data.error || 'Failed to send email');
      }

      setEmailFeedback(`PDF link sent to ${normalizedEmail}`);
    } catch (err) {
      setEmailFeedback(err instanceof Error ? err.message : 'Failed to send email');
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
    const Tag = headingType as 'h1' | 'h2' | 'h3';
    return (
      <div key={field.id}>
        <Tag className={headingClasses[headingType]}>{localizedField.label || localizedField.subtext}</Tag>
        {localizedField.subtext && localizedField.label && (
          <p className="text-sm text-text-secondary">{localizedField.subtext}</p>
        )}
      </div>
    );
  }

  function renderStandaloneField(field: PublicField): React.ReactNode {
    const localizedField = getLocalizedField(field);

    if (field.type === 'HIDDEN') return null;
    if (isRepeatEndMarker(field)) return null;
    if (field.type === 'PAGE_BREAK' && !isRepeatStartMarker(field)) return null;

    const widthClass = WIDTH_CLASS[localizedField.layoutWidth] || WIDTH_CLASS[100];
    const infoBackgroundColor = getInfoBackgroundColor(localizedField);
    const infoBackgroundStyle = infoBackgroundColor ? { backgroundColor: infoBackgroundColor } : undefined;

    // Heading blocks
    if (
      localizedField.type === 'PARAGRAPH' &&
      (localizedField.inputType === 'info_heading_1' ||
        localizedField.inputType === 'info_heading_2' ||
        localizedField.inputType === 'info_heading_3')
    ) {
      return renderHeadingField(localizedField);
    }

    // info_image
    if (localizedField.type === 'PARAGRAPH' && localizedField.inputType === 'info_image') {
      const imageUrl = isValidHttpUrl(localizedField.placeholder?.trim() || null) ? localizedField.placeholder!.trim() : null;
      return (
        <div key={field.id} className={widthClass}>
          <div className="overflow-hidden rounded-lg border border-border-primary bg-background-primary" style={infoBackgroundStyle}>
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={localizedField.subtext || localizedField.label || 'Information image'} className="max-h-96 w-full object-contain" />
                {localizedField.subtext && (
                  <p className="border-t border-border-primary px-3 py-2 text-xs text-text-secondary">{localizedField.subtext}</p>
                )}
              </>
            ) : (
              <div className="px-3 py-4 text-sm text-text-secondary">Add a valid image URL in field settings.</div>
            )}
          </div>
        </div>
      );
    }

    // info_url
    if (localizedField.type === 'PARAGRAPH' && localizedField.inputType === 'info_url') {
      const href = isValidHttpUrl(localizedField.placeholder?.trim() || null) ? localizedField.placeholder!.trim() : null;
      return (
        <div key={field.id} className={widthClass}>
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm" style={infoBackgroundStyle}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-text-primary underline hover:text-text-secondary">
                {localizedField.subtext || localizedField.label || href}
              </a>
            ) : (
              <span className="text-text-secondary">Add a valid URL in field settings.</span>
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
        <div key={field.id} className={widthClass}>
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary" style={infoBackgroundStyle}>
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
        <div key={field.id} className={widthClass}>
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
                      if (!evaluateCondition(sectionField.condition, rowAnswers)) return null;

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
                      const sectionChoiceInlineRight = isChoiceInlineRightEnabled(sectionField);
                      const sectionDefaultDateValue = sectionUseDateSelector && isDateDefaultTodayEnabled(sectionField)
                        ? getLocalTodayIsoDate()
                        : '';
                      const resolvedSectionDateValue = typeof sectionValue === 'string' && sectionValue.trim().length > 0
                        ? sectionValue
                        : sectionDefaultDateValue;

                      if (sectionField.type === 'HIDDEN') return null;

                      return (
                        <div key={`${sectionField.id}-${rowIndex}`} className={sectionWidthClass}>
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

                          {sectionField.type === 'SHORT_TEXT' && !sectionUseDateSelector && (
                            <input
                              id={sectionControlId}
                              type={sectionField.inputType === 'phone' ? 'tel' : sectionField.inputType || 'text'}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(e) => setRepeatFieldValue(sectionField.key, rowIndex, e.target.value)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex))}
                              placeholder={localizedSectionField.placeholder || ''}
                              readOnly={sectionField.isReadOnly}
                              aria-invalid={sectionErrorText ? 'true' : undefined}
                              aria-describedby={sectionDescribedBy}
                              className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
                            />
                          )}

                          {sectionUseDateSelector && (
                            <SingleDateInput
                              value={resolvedSectionDateValue}
                              onChange={(next) => setRepeatFieldValue(sectionField.key, rowIndex, next)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex))}
                              placeholder={localizedSectionField.placeholder || 'dd/mm/yyyy'}
                              disabled={sectionField.isReadOnly}
                              required={sectionField.isRequired}
                              error={sectionErrorText}
                              ariaLabel={sectionField.hideLabel ? sectionLabel : undefined}
                              className="w-full"
                            />
                          )}

                          {sectionField.type === 'LONG_TEXT' && (
                            <textarea
                              id={sectionControlId}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(e) => setRepeatFieldValue(sectionField.key, rowIndex, e.target.value)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex))}
                              placeholder={localizedSectionField.placeholder || ''}
                              readOnly={sectionField.isReadOnly}
                              aria-invalid={sectionErrorText ? 'true' : undefined}
                              aria-describedby={sectionDescribedBy}
                              className="w-full min-h-24 rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
                            />
                          )}

                          {sectionField.type === 'DROPDOWN' && (
                            <SearchableSelect
                              options={sectionDropdownOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(val) => setRepeatFieldValue(sectionField.key, rowIndex, val)}
                              onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex))}
                              placeholder={localizedSectionField.placeholder || 'Select an option'}
                              clearable={false}
                              showKeyboardHints={false}
                              containerClassName="h-10"
                            />
                          )}

                          {sectionField.type === 'SINGLE_CHOICE' && (
                            <fieldset className="space-y-1.5" onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex))}>
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
                                              <label key={`${option.value}-${optionIndex}`} htmlFor={optionId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
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
                                                {option.label}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      {sectionChoiceOptions.map((option, optionIndex) => {
                                        const isSelected = selectedEntry?.value === option.value;
                                        if (!option.allowTextInput || !isSelected) return null;
                                        return (
                                          <input
                                            key={`${option.value}-${optionIndex}-detail`}
                                            type="text"
                                            value={selectedEntry?.detailText || ''}
                                            onChange={(e) => setRepeatFieldValue(
                                              sectionField.key,
                                              rowIndex,
                                              { value: option.value, detailText: e.target.value }
                                            )}
                                            placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                                            className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
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
                                      <label htmlFor={optionId} className="flex items-center gap-2 text-sm text-text-primary">
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
                                        {option.label}
                                      </label>
                                      {option.allowTextInput && isSelected && (
                                        <input
                                          type="text"
                                          value={selectedEntry?.detailText || ''}
                                          onChange={(e) => setRepeatFieldValue(
                                            sectionField.key,
                                            rowIndex,
                                            { value: option.value, detailText: e.target.value }
                                          )}
                                          placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                                          className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
                                        />
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </fieldset>
                          )}

                          {sectionField.type === 'MULTIPLE_CHOICE' && (
                            <fieldset className="space-y-1.5" onBlur={() => handleFieldBlur(sectionField, getRepeatFieldValue(sectionField.key, rowIndex), getFieldErrorKey(sectionField.key, rowIndex))}>
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
                                              <label key={`${option.value}-${optionIndex}`} htmlFor={optionId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                                                <input
                                                  id={optionId}
                                                  type="checkbox"
                                                  checked={currentValues.includes(option.value)}
                                                  onChange={(e) => {
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
                                                {option.label}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      {sectionChoiceOptions.map((option, optionIndex) => {
                                        const entry = currentEntries.find((candidate) => candidate.value === option.value);
                                        if (!option.allowTextInput || !currentValues.includes(option.value)) return null;
                                        return (
                                          <input
                                            key={`${option.value}-${optionIndex}-detail`}
                                            type="text"
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
                                            placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                                            className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
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
                                      <label htmlFor={optionId} className="flex items-center gap-2 text-sm text-text-primary">
                                        <input
                                          id={optionId}
                                          type="checkbox"
                                          checked={currentValues.includes(option.value)}
                                          onChange={(e) => {
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
                                        {option.label}
                                      </label>
                                      {option.allowTextInput && currentValues.includes(option.value) && (
                                        <input
                                          type="text"
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
                                          placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                                          className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
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
                              This field type is not supported inside dynamic sections yet.
                            </div>
                          )}

                          {sectionErrorText && !sectionUseDateSelector && (
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

    if (isRepeatEndMarker(field) || field.type === 'PAGE_BREAK' || field.type === 'PARAGRAPH' || field.type === 'HTML' || field.type === 'HIDDEN') {
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
    const renderLabelAsText =
      ((field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') && !choiceInlineRight) ||
      field.type === 'SIGNATURE';
    const useDateSelector = field.type === 'SHORT_TEXT' && field.inputType === 'date';
    const showTooltip = isTooltipEnabled(localizedField);
    const tooltipText = showTooltip ? localizedField.helpText!.trim() : null;
    const uploadStatus = uploadedByFieldKey[field.key];
    const isUploadDragOver = dragOverUploadFieldKey === field.key;
    const dateDefaultValue = useDateSelector && isDateDefaultTodayEnabled(field)
      ? getLocalTodayIsoDate()
      : '';
    const resolvedDateValue = typeof value === 'string' && value.trim().length > 0
      ? value
      : dateDefaultValue;

    return (
      <React.Fragment key={field.id}>
        <div className={widthClass}>
          {/* Label */}
          {!field.hideLabel && !choiceInlineRight && (
            renderLabelAsText ? (
              <p id={labelId} className="mb-1.5 block text-sm font-medium text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span>
                    {accessibleLabel}
                    {field.isRequired && <span className="text-oak-primary"> *</span>}
                  </span>
                  {tooltipText && (
                    <Tooltip content={<span className="block max-w-xs whitespace-pre-wrap break-words">{tooltipText}</span>}>
                      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center text-text-muted hover:text-text-secondary">
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </Tooltip>
                  )}
                </span>
              </p>
            ) : (
              <label htmlFor={controlId} id={labelId} className="mb-1.5 block text-sm font-medium text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span>
                    {accessibleLabel}
                    {field.isRequired && <span className="text-oak-primary"> *</span>}
                  </span>
                  {tooltipText && (
                    <Tooltip content={<span className="block max-w-xs whitespace-pre-wrap break-words">{tooltipText}</span>}>
                      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center text-text-muted hover:text-text-secondary">
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </Tooltip>
                  )}
                </span>
              </label>
            )
          )}

          {localizedField.subtext && <p id={hintId} className="mb-2 text-sm text-text-secondary">{localizedField.subtext}</p>}

          {/* SHORT_TEXT */}
          {field.type === 'SHORT_TEXT' && !useDateSelector && (
            <input
              id={controlId}
              type={field.inputType === 'phone' ? 'tel' : field.inputType || 'text'}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setFieldValue(field.key, e.target.value)}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key))}
              placeholder={localizedField.placeholder || ''}
              readOnly={field.isReadOnly}
              required={field.isRequired}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={describedBy}
              className={cn(
                'w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50',
                'focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150',
                field.isReadOnly && 'bg-[#EDE9E5] cursor-not-allowed opacity-70'
              )}
            />
          )}

          {/* DATE */}
          {useDateSelector && (
            <SingleDateInput
              value={resolvedDateValue}
              onChange={(next) => setFieldValue(field.key, next)}
              placeholder={localizedField.placeholder || 'dd/mm/yyyy'}
              disabled={field.isReadOnly}
              required={field.isRequired}
              error={errorText}
              ariaLabel={field.hideLabel ? accessibleLabel : undefined}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key))}
              className="w-full"
            />
          )}

          {/* LONG_TEXT */}
          {field.type === 'LONG_TEXT' && (
            <textarea
              id={controlId}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setFieldValue(field.key, e.target.value)}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key))}
              placeholder={localizedField.placeholder || ''}
              readOnly={field.isReadOnly}
              required={field.isRequired}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={describedBy}
              className={cn(
                'w-full min-h-24 rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50',
                'focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150 resize-y',
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
              placeholder={localizedField.placeholder || 'Select an option'}
              clearable={false}
              showKeyboardHints={false}
              containerClassName="h-10"
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key))}
            />
          )}

          {/* SINGLE_CHOICE */}
          {field.type === 'SINGLE_CHOICE' && (
            <fieldset
              className="space-y-2"
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-labelledby={field.hideLabel ? undefined : labelId}
              aria-describedby={describedBy}
              aria-invalid={errorText ? 'true' : undefined}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key))}
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
                              {tooltipText && (
                                <Tooltip content={<span className="block max-w-xs whitespace-pre-wrap break-words">{tooltipText}</span>}>
                                  <span className="inline-flex h-4 w-4 cursor-help items-center justify-center text-text-muted hover:text-text-secondary">
                                    <Info className="h-3.5 w-3.5" />
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          </legend>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-self-end sm:whitespace-nowrap">
                          {parseChoiceOptions(localizedField.options).map((option, index) => {
                            const isSelected = selectedEntry?.value === option.value;
                            const optionId = `${fieldDomId}-option-${index}`;
                            return (
                              <label key={`${option.value}-${index}`} htmlFor={optionId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
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
                                {option.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      {parseChoiceOptions(localizedField.options).map((option, index) => {
                        const isSelected = selectedEntry?.value === option.value;
                        if (!option.allowTextInput || !isSelected) return null;
                        return (
                          <input
                            key={`${option.value}-${index}-detail`}
                            type="text"
                            value={selectedEntry?.detailText || ''}
                            onChange={(e) => setFieldValue(field.key, { value: option.value, detailText: e.target.value })}
                            placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                            className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
                          />
                        );
                      })}
                    </>
                  );
                })()
              ) : (
                parseChoiceOptions(localizedField.options).map((option, index) => {
                  const selectedEntry = parseChoiceAnswerEntry(value);
                  const isSelected = selectedEntry?.value === option.value;
                  const optionId = `${fieldDomId}-option-${index}`;
                  return (
                    <div key={`${option.value}-${index}`} className="space-y-1.5">
                      <label
                        htmlFor={optionId}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150',
                          isSelected
                            ? 'border-oak-primary/40 bg-oak-primary/5 text-text-primary'
                            : 'border-border-primary/25 bg-background-secondary/30 text-text-primary hover:border-border-primary/50 hover:bg-background-secondary/60'
                        )}
                      >
                        <input id={optionId} type="radio" name={field.key} value={option.value} checked={isSelected}
                          onChange={() => setFieldValue(field.key, option.allowTextInput ? { value: option.value, detailText: selectedEntry?.value === option.value ? selectedEntry.detailText : '' } : option.value)}
                          className="sr-only"
                        />
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-[#F4F7F6] transition-all duration-150', isSelected ? 'border-oak-primary' : 'border-border-primary')}>
                          {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-oak-primary" />}
                        </span>
                        {option.label}
                      </label>
                      {option.allowTextInput && isSelected && (
                        <input type="text" value={selectedEntry?.detailText || ''}
                          onChange={(e) => setFieldValue(field.key, { value: option.value, detailText: e.target.value })}
                          placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                          className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
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
              className="space-y-2"
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-labelledby={field.hideLabel ? undefined : labelId}
              aria-describedby={describedBy}
              aria-invalid={errorText ? 'true' : undefined}
              onBlur={() => handleFieldBlur(field, answers[field.key], getFieldErrorKey(field.key))}
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
                              {tooltipText && (
                                <Tooltip content={<span className="block max-w-xs whitespace-pre-wrap break-words">{tooltipText}</span>}>
                                  <span className="inline-flex h-4 w-4 cursor-help items-center justify-center text-text-muted hover:text-text-secondary">
                                    <Info className="h-3.5 w-3.5" />
                                  </span>
                                </Tooltip>
                              )}
                            </span>
                          </legend>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap sm:justify-self-end sm:whitespace-nowrap">
                          {parseChoiceOptions(localizedField.options).map((option, index) => {
                            const isChecked = values.includes(option.value);
                            const optionId = `${fieldDomId}-option-${index}-${toDomSafeId(option.value)}`;
                            return (
                              <label key={`${option.value}-${index}`} htmlFor={optionId} className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                                <input
                                  id={optionId}
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      const nextEntries = [...entries.filter((en) => en.value !== option.value), { value: option.value, detailText: '' }];
                                      setFieldValue(field.key, nextEntries.map((en) => (en.detailText || (option.allowTextInput && en.value === option.value) ? { value: en.value, detailText: en.detailText } : en.value)));
                                    } else {
                                      const nextEntries = entries.filter((en) => en.value !== option.value);
                                      setFieldValue(field.key, nextEntries.map((en) => (en.detailText ? { value: en.value, detailText: en.detailText } : en.value)));
                                    }
                                  }}
                                  className={CHOICE_CHECKBOX_INPUT_CLASS}
                                />
                                {option.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      {parseChoiceOptions(localizedField.options).map((option, index) => {
                        const isChecked = values.includes(option.value);
                        const optionEntry = entries.find((e) => e.value === option.value);
                        if (!option.allowTextInput || !isChecked) return null;
                        return (
                          <input
                            key={`${option.value}-${index}-detail`}
                            type="text"
                            value={optionEntry?.detailText || ''}
                            onChange={(e) => {
                              const nextEntries = entries.map((en) => (en.value === option.value ? { ...en, detailText: e.target.value } : en));
                              setFieldValue(field.key, nextEntries.map((en) => (en.detailText ? { value: en.value, detailText: en.detailText } : en.value)));
                            }}
                            placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                            className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
                          />
                        );
                      })}
                    </>
                  );
                })()
              ) : (
                parseChoiceOptions(localizedField.options).map((option, index) => {
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
                          isChecked
                            ? 'border-oak-primary/40 bg-oak-primary/5 text-text-primary'
                            : 'border-border-primary/25 bg-background-secondary/30 text-text-primary hover:border-border-primary/50 hover:bg-background-secondary/60'
                        )}
                      >
                        <input id={optionId} type="checkbox" checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const nextEntries = [...entries.filter((en) => en.value !== option.value), { value: option.value, detailText: '' }];
                              setFieldValue(field.key, nextEntries.map((en) => (en.detailText || (option.allowTextInput && en.value === option.value) ? { value: en.value, detailText: en.detailText } : en.value)));
                            } else {
                              const nextEntries = entries.filter((en) => en.value !== option.value);
                              setFieldValue(field.key, nextEntries.map((en) => (en.detailText ? { value: en.value, detailText: en.detailText } : en.value)));
                            }
                          }}
                          className="sr-only"
                        />
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-150', isChecked ? 'border-oak-primary bg-oak-primary' : 'border-border-primary bg-[#F4F7F6]')}>
                          {isChecked && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </span>
                        {option.label}
                      </label>
                      {option.allowTextInput && isChecked && (
                        <input type="text" value={optionEntry?.detailText || ''}
                          onChange={(e) => {
                            const nextEntries = entries.map((en) => (en.value === option.value ? { ...en, detailText: e.target.value } : en));
                            setFieldValue(field.key, nextEntries.map((en) => (en.detailText ? { value: en.value, detailText: en.detailText } : en.value)));
                          }}
                          placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                          className="w-full rounded-lg border border-[#D8E3DF] bg-[#F4F7F6] px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#294D44]/20 focus:border-[#294D44] transition-all duration-150"
                        />
                      )}
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
              isUploadDragOver
                ? 'border-oak-primary bg-oak-primary/5'
                : (uploadStatus ? 'border-status-success/40' : 'border-border-primary/60 hover:border-oak-primary/40')
            )}
              role="button"
              tabIndex={0}
              aria-label={`Upload file for ${accessibleLabel}`}
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
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  void uploadFile(field.key, file);
                }
              }}
            >
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-primary underline">
                {uploadStatus ? localizedUiLabels.replace_file : localizedUiLabels.upload_file}
              </p>
              <p className="mt-1 text-xs text-text-secondary">{localizedUiLabels.upload_drag_hint}</p>
              <input id={controlId} type="file" className="sr-only"
                aria-label={field.hideLabel ? accessibleLabel : undefined}
                aria-invalid={errorText ? 'true' : undefined}
                aria-describedby={describedBy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void uploadFile(field.key, file);
                  }
                  e.currentTarget.value = '';
                }}
              />
              <p className="mt-1 text-xs text-text-muted">
                {uploadingField === field.key
                  ? localizedUiLabels.uploading
                  : uploadStatus
                    ? localizedUiLabels.upload_success
                    : localizedUiLabels.upload_select_prompt}
              </p>
              {uploadStatus && (
                <div className="mt-3 rounded-md border border-status-success/30 bg-status-success/5 px-2.5 py-2 text-left">
                  <div className="flex items-start gap-2 text-sm text-text-primary">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-status-success" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{uploadStatus.fileName}</p>
                      <p className="text-xs text-text-secondary">{formatFileSize(uploadStatus.sizeBytes)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SIGNATURE */}
          {field.type === 'SIGNATURE' && (
            <div role="group" aria-label={field.hideLabel ? accessibleLabel : undefined} aria-labelledby={field.hideLabel ? undefined : labelId} aria-describedby={describedBy}>
              <SignaturePad
                value={typeof value === 'string' ? value : ''}
                onChange={(next) => setFieldValue(field.key, next)}
                ariaLabel={accessibleLabel}
              />
            </div>
          )}

          {/* Error */}
          {errorText && !useDateSelector && (
            <p id={errorId} className="mt-1 text-xs text-status-error">{errorText}</p>
          )}
        </div>
      </React.Fragment>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#FDFCFA] to-[#EDE8E3] p-4 sm:p-8 flex items-center justify-center">
        <div className="text-sm text-white/70">Loading form...</div>
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
                placeholder="name@example.com"
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
      <div className={cn('mx-auto max-w-4xl', isEmbed ? '' : 'py-2')}>
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
            <div className="flex items-center gap-3">
              {shouldShowLogo && (
                <img
                  src={form.tenantLogoUrl!}
                  alt="Organization logo"
                  className="h-32 w-auto max-w-[480px] object-contain rounded-sm flex-shrink-0"
                />
              )}
              <h1 className="text-2xl font-bold text-text-primary">{localizedFormTitle || form.title}</h1>
            </div>
            {localizedFormDescription && <p className="mt-2 text-base text-text-secondary leading-relaxed">{localizedFormDescription}</p>}
            {isPreview && (
              <p className="mt-2 text-xs text-text-muted">
                Preview mode. Publish the form to accept uploads and submissions.
              </p>
            )}
            {pages.length <= 1 && <div className="mt-4 h-[3px] w-12 rounded-full bg-oak-primary" />}
          </div>
        )}

        {pages.length > 1 && (
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">Page {currentPage + 1} of {pages.length}</span>
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

        <div className="mt-8 flex items-center justify-between">
          {currentPage > 0 ? (
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => prev - 1)}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              <ArrowLeft className="h-4 w-4" />
              {localizedUiLabels.back}
            </button>
          ) : <div />}

          <div className="flex items-center gap-3">
            {pages.length > 1 && (
              <span className="text-xs text-text-muted">
                {currentPage + 1} of {pages.length}
              </span>
            )}
            {currentPage < pages.length - 1 ? (
              <Button
                variant="primary"
                size="sm"
                className="rounded-xl px-6 py-2.5 transition-transform duration-150 hover:scale-[1.02]"
                onClick={() => {
                  if (!validateCurrentPage()) return;
                  setCurrentPage((prev) => prev + 1);
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
            )}
          </div>
        </div>
      {!isEmbed && shouldShowFooter && (
        <div className="mt-6 text-center text-sm text-text-tertiary">
          © {form.tenantName}
        </div>
      )}
      </div>
    </div>
  );
}
