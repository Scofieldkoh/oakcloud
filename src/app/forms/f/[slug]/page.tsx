'use client';

import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Download, Info, Mail, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { SignaturePad } from '@/components/forms/signature-pad';
import { Tooltip } from '@/components/ui/tooltip';
import {
  WIDTH_CLASS,
  parseObject,
  parseOptions,
  parseChoiceOptions,
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
    // Always-null renders — pass through as standalone
    if (field.type === 'HIDDEN' || field.type === 'PAGE_BREAK') {
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
  const searchParams = useSearchParams();
  const slug = params.slug;
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
  const [uploadedByFieldKey, setUploadedByFieldKey] = useState<Record<string, UploadStatus>>({});
  const [repeatSectionCounts, setRepeatSectionCounts] = useState<Record<string, number>>({});
  const [pdfRecipientEmail, setPdfRecipientEmail] = useState('');
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

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
    for (const field of form.fields) {
      if (!isRepeatStartMarker(field)) continue;
      const config = getRepeatSectionConfig(field);
      nextCounts[config.id] = config.minItems;
    }

    setRepeatSectionCounts(nextCounts);
  }, [form]);

  const pages = useMemo(() => {
    if (!form) return [] as PublicField[][];

    const result: PublicField[][] = [[]];
    for (const field of form.fields) {
      if (field.type === 'PAGE_BREAK' && !isRepeatStartMarker(field) && !isRepeatEndMarker(field)) {
        result.push([]);
      } else {
        result[result.length - 1].push(field);
      }
    }

    return result.filter((page) => page.length > 0);
  }, [form]);

  const visibleFields = useMemo(() => {
    const pageFields = pages[currentPage] || [];
    return pageFields.filter((field) => evaluateCondition(field.condition, answers));
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

  function validateCurrentPage(): boolean {
    const nextErrors: Record<string, string> = {};
    const pageFields = pages[currentPage] || [];

    for (let index = 0; index < pageFields.length; index += 1) {
      const field = pageFields[index];

      if (isRepeatStartMarker(field)) {
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

        const repeatCount = repeatSectionCounts[sectionConfig.id] || sectionConfig.minItems;
        for (let rowIndex = 0; rowIndex < repeatCount; rowIndex += 1) {
          const rowAnswers: Record<string, unknown> = {};
          for (const [answerKey, answerValue] of Object.entries(answers)) {
            if (Array.isArray(answerValue)) {
              rowAnswers[answerKey] = answerValue[rowIndex];
            } else {
              rowAnswers[answerKey] = answerValue;
            }
          }

          for (const sectionField of sectionFields) {
            if (!evaluateCondition(sectionField.condition, rowAnswers)) continue;
            const value = getRepeatFieldValue(sectionField.key, rowIndex);
            const errorKey = getFieldErrorKey(sectionField.key, rowIndex);

            if (
              sectionField.isRequired &&
              sectionField.type !== 'PARAGRAPH' &&
              sectionField.type !== 'HTML' &&
              sectionField.type !== 'HIDDEN' &&
              isEmptyValue(value)
            ) {
              nextErrors[errorKey] = `${sectionField.label || sectionField.key} is required`;
              continue;
            }

            if (
              sectionField.type === 'SHORT_TEXT' &&
              sectionField.inputType === 'email' &&
              typeof value === 'string' &&
              value.trim().length > 0 &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
            ) {
              nextErrors[errorKey] = `${sectionField.label || sectionField.key} must be a valid email`;
              continue;
            }

            if (sectionField.type === 'SINGLE_CHOICE' || sectionField.type === 'MULTIPLE_CHOICE') {
              const detailError = getChoiceDetailValidationError(
                sectionField.label || sectionField.key,
                parseChoiceOptions(sectionField.options),
                value
              );
              if (detailError) {
                nextErrors[errorKey] = detailError;
              }
            }
          }
        }
        continue;
      }

      if (isRepeatEndMarker(field) || field.type === 'PAGE_BREAK') continue;

      const value = answers[field.key];
      const errorKey = getFieldErrorKey(field.key);

      if (field.isRequired && field.type !== 'PARAGRAPH' && field.type !== 'HTML' && field.type !== 'HIDDEN' && isEmptyValue(value)) {
        nextErrors[errorKey] = `${field.label || field.key} is required`;
        continue;
      }

      if (
        field.type === 'SHORT_TEXT' &&
        field.inputType === 'email' &&
        typeof value === 'string' &&
        value.trim().length > 0 &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ) {
        nextErrors[errorKey] = `${field.label || field.key} must be a valid email`;
        continue;
      }

      if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') {
        const detailError = getChoiceDetailValidationError(
          field.label || field.key,
          parseChoiceOptions(field.options),
          value
        );
        if (detailError) {
          nextErrors[errorKey] = detailError;
        }
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
      const fileUploadKeys = form.fields
        .filter((field) => field.type === 'FILE_UPLOAD')
        .map((field) => field.key);

      const uploadIds = fileUploadKeys
        .flatMap((key) => {
          const value = answers[key];
          if (!Array.isArray(value)) return [];
          return value.flatMap((item) => (Array.isArray(item) ? item : [item]));
        })
        .filter((value): value is string => typeof value === 'string' && UUID_PATTERN.test(value));

      const normalizedAnswers = Object.fromEntries(
        Object.entries(answers).filter(([, value]) => value !== undefined)
      );

      const shortTextFields = form.fields.filter((field) => field.type === 'SHORT_TEXT');
      const inferredNameField = shortTextFields.find((field) => {
        const hint = `${field.key} ${field.label || ''}`;
        return NAME_HINT_PATTERN.test(hint);
      });
      const fallbackNameAnswer = answers.full_name ?? answers.name;
      const respondentName = normalizeOptionalText(
        inferredNameField ? answers[inferredNameField.key] : fallbackNameAnswer,
        200
      );

      const inferredEmailField = shortTextFields.find((field) => {
        const hint = `${field.key} ${field.label || ''}`;
        return field.inputType === 'email' || EMAIL_HINT_PATTERN.test(hint);
      });
      const fallbackEmailAnswer = answers.email_address ?? answers.email;
      const normalizedEmailCandidate = normalizeOptionalText(
        inferredEmailField ? answers[inferredEmailField.key] : fallbackEmailAnswer,
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
        <Tag className={headingClasses[headingType]}>{field.label || field.subtext}</Tag>
        {field.subtext && field.label && (
          <p className="text-sm text-text-secondary">{field.subtext}</p>
        )}
      </div>
    );
  }

  function renderStandaloneField(field: PublicField): React.ReactNode {
    if (field.type === 'HIDDEN') return null;
    if (field.type === 'PAGE_BREAK') return null;

    const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];

    // Heading blocks
    if (
      field.type === 'PARAGRAPH' &&
      (field.inputType === 'info_heading_1' ||
        field.inputType === 'info_heading_2' ||
        field.inputType === 'info_heading_3')
    ) {
      return renderHeadingField(field);
    }

    // info_image
    if (field.type === 'PARAGRAPH' && field.inputType === 'info_image') {
      const imageUrl = isValidHttpUrl(field.placeholder?.trim() || null) ? field.placeholder!.trim() : null;
      return (
        <div key={field.id} className={widthClass}>
          <div className="overflow-hidden rounded-lg border border-border-primary bg-background-primary">
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={field.subtext || field.label || 'Information image'} className="max-h-96 w-full object-contain" />
                {field.subtext && (
                  <p className="border-t border-border-primary px-3 py-2 text-xs text-text-secondary">{field.subtext}</p>
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
    if (field.type === 'PARAGRAPH' && field.inputType === 'info_url') {
      const href = isValidHttpUrl(field.placeholder?.trim() || null) ? field.placeholder!.trim() : null;
      return (
        <div key={field.id} className={widthClass}>
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm">
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-text-primary underline hover:text-text-secondary">
                {field.subtext || field.label || href}
              </a>
            ) : (
              <span className="text-text-secondary">Add a valid URL in field settings.</span>
            )}
          </div>
        </div>
      );
    }

    // info_text (and any other PARAGRAPH fallback)
    if (field.type === 'PARAGRAPH') {
      return (
        <div key={field.id} className={widthClass}>
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary whitespace-pre-wrap">
            {field.subtext || field.label}
          </div>
        </div>
      );
    }

    // HTML
    if (field.type === 'HTML') {
      return (
        <div key={field.id} className={widthClass}>
          <div className="text-sm text-text-primary" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.subtext || '') }} />
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
      const sectionTitle = field.label?.trim() || 'Dynamic section';

      return (
        <div key={field.id} className="col-span-12">
          <div className="rounded-xl border border-border-primary/60 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{sectionTitle}</h3>
                {field.subtext && <p className="text-xs text-text-secondary">{field.subtext}</p>}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => addRepeatSectionRow(sectionId, sectionConfig.maxItems)}
                disabled={!canAddRow}
              >
                {sectionConfig.addLabel}
              </Button>
            </div>

            <div className="space-y-3">
              {Array.from({ length: rowCount }).map((_, rowIndex) => (
                <div key={`${sectionId}-row-${rowIndex}`} className="rounded-lg border border-border-primary/50 bg-background-primary/40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-text-secondary">Card {rowIndex + 1}</span>
                    {rowCount > sectionConfig.minItems && (
                      <button
                        type="button"
                        onClick={() => removeRepeatSectionRow(sectionId, rowIndex, sectionFields)}
                        className="text-xs text-text-secondary underline hover:text-text-primary"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-12 gap-3">
                    {sectionFields.map((sectionField) => {
                      const sectionWidthClass = WIDTH_CLASS[sectionField.layoutWidth] || WIDTH_CLASS[100];
                      const sectionValue = getRepeatFieldValue(sectionField.key, rowIndex);
                      const sectionErrorText = fieldErrors[getFieldErrorKey(sectionField.key, rowIndex)];
                      const sectionDropdownOptions = parseOptions(sectionField.options);
                      const sectionChoiceOptions = parseChoiceOptions(sectionField.options);
                      const sectionFieldDomId = `repeat-${toDomSafeId(sectionId)}-${rowIndex}-${toDomSafeId(sectionField.id || sectionField.key)}`;
                      const sectionControlId = `${sectionFieldDomId}-control`;
                      const sectionLabelId = `${sectionFieldDomId}-label`;
                      const sectionHintId = sectionField.subtext ? `${sectionFieldDomId}-hint` : undefined;
                      const sectionErrorId = sectionErrorText ? `${sectionFieldDomId}-error` : undefined;
                      const sectionDescribedBy = [sectionHintId, sectionErrorId].filter(Boolean).join(' ') || undefined;
                      const sectionLabel = sectionField.label || sectionField.key;
                      const sectionUseDateSelector = sectionField.type === 'SHORT_TEXT' && sectionField.inputType === 'date';

                      if (sectionField.type === 'HIDDEN') return null;

                      return (
                        <div key={`${sectionField.id}-${rowIndex}`} className={sectionWidthClass}>
                          {!sectionField.hideLabel && (
                            <label
                              htmlFor={sectionControlId}
                              id={sectionLabelId}
                              className="mb-1.5 block text-xs font-medium text-text-secondary"
                            >
                              {sectionLabel}
                              {sectionField.isRequired && <span className="text-oak-primary"> *</span>}
                            </label>
                          )}
                          {sectionField.subtext && (
                            <p id={sectionHintId} className="mb-2 text-xs text-text-muted">{sectionField.subtext}</p>
                          )}

                          {sectionField.type === 'SHORT_TEXT' && !sectionUseDateSelector && (
                            <input
                              id={sectionControlId}
                              type={sectionField.inputType === 'phone' ? 'tel' : sectionField.inputType || 'text'}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(e) => setRepeatFieldValue(sectionField.key, rowIndex, e.target.value)}
                              placeholder={sectionField.placeholder || ''}
                              readOnly={sectionField.isReadOnly}
                              aria-invalid={sectionErrorText ? 'true' : undefined}
                              aria-describedby={sectionDescribedBy}
                              className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3 py-2 text-sm text-text-primary"
                            />
                          )}

                          {sectionUseDateSelector && (
                            <SingleDateInput
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(next) => setRepeatFieldValue(sectionField.key, rowIndex, next)}
                              placeholder={sectionField.placeholder || 'dd/mm/yyyy'}
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
                              placeholder={sectionField.placeholder || ''}
                              readOnly={sectionField.isReadOnly}
                              aria-invalid={sectionErrorText ? 'true' : undefined}
                              aria-describedby={sectionDescribedBy}
                              className="w-full min-h-24 rounded-lg border border-border-primary/60 bg-background-primary px-3 py-2 text-sm text-text-primary"
                            />
                          )}

                          {sectionField.type === 'DROPDOWN' && (
                            <SearchableSelect
                              options={sectionDropdownOptions.map((opt) => ({ value: opt, label: opt }))}
                              value={typeof sectionValue === 'string' ? sectionValue : ''}
                              onChange={(val) => setRepeatFieldValue(sectionField.key, rowIndex, val)}
                              placeholder="Select an option"
                              clearable={false}
                              showKeyboardHints={false}
                              containerClassName="h-10"
                            />
                          )}

                          {sectionField.type === 'SINGLE_CHOICE' && (
                            <fieldset className="space-y-1.5">
                              {sectionChoiceOptions.map((option, optionIndex) => {
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
                                        className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3 py-2 text-sm text-text-primary"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </fieldset>
                          )}

                          {sectionField.type === 'MULTIPLE_CHOICE' && (
                            <fieldset className="space-y-1.5">
                              {sectionChoiceOptions.map((option, optionIndex) => {
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
                                        className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3 py-2 text-sm text-text-primary"
                                      />
                                    )}
                                  </div>
                                );
                              })}
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
                </div>
              ))}
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
    const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];
    const value = answers[field.key];
    const errorText = fieldErrors[getFieldErrorKey(field.key)];
    const fieldDomId = `form-field-${toDomSafeId(field.id || field.key)}`;
    const controlId = `${fieldDomId}-control`;
    const labelId = `${fieldDomId}-label`;
    const hintId = field.subtext ? `${fieldDomId}-hint` : undefined;
    const errorId = errorText ? `${fieldDomId}-error` : undefined;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
    const accessibleLabel = field.label || field.key;
    const renderLabelAsText = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SIGNATURE'].includes(field.type);
    const useDateSelector = field.type === 'SHORT_TEXT' && field.inputType === 'date';
    const showTooltip = isTooltipEnabled(field);
    const tooltipText = showTooltip ? field.helpText!.trim() : null;
    const uploadStatus = uploadedByFieldKey[field.key];

    return (
      <React.Fragment key={field.id}>
        <div className={widthClass}>
          {/* Label */}
          {!field.hideLabel && (
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

          {field.subtext && <p id={hintId} className="mb-2 text-sm text-text-secondary">{field.subtext}</p>}

          {/* SHORT_TEXT */}
          {field.type === 'SHORT_TEXT' && !useDateSelector && (
            <input
              id={controlId}
              type={field.inputType === 'phone' ? 'tel' : field.inputType || 'text'}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setFieldValue(field.key, e.target.value)}
              placeholder={field.placeholder || ''}
              readOnly={field.isReadOnly}
              required={field.isRequired}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={describedBy}
              className={cn(
                'w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60',
                'focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150',
                field.isReadOnly && 'bg-background-secondary cursor-not-allowed opacity-70'
              )}
            />
          )}

          {/* DATE */}
          {useDateSelector && (
            <SingleDateInput
              value={typeof value === 'string' ? value : ''}
              onChange={(next) => setFieldValue(field.key, next)}
              placeholder={field.placeholder || 'dd/mm/yyyy'}
              disabled={field.isReadOnly}
              required={field.isRequired}
              error={errorText}
              ariaLabel={field.hideLabel ? accessibleLabel : undefined}
              className="w-full"
            />
          )}

          {/* LONG_TEXT */}
          {field.type === 'LONG_TEXT' && (
            <textarea
              id={controlId}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setFieldValue(field.key, e.target.value)}
              placeholder={field.placeholder || ''}
              readOnly={field.isReadOnly}
              required={field.isRequired}
              aria-label={field.hideLabel ? accessibleLabel : undefined}
              aria-invalid={errorText ? 'true' : undefined}
              aria-describedby={describedBy}
              className={cn(
                'w-full min-h-24 rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60',
                'focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150 resize-y',
                field.isReadOnly && 'bg-background-secondary cursor-not-allowed opacity-70'
              )}
            />
          )}

          {/* DROPDOWN */}
          {field.type === 'DROPDOWN' && (
            <SearchableSelect
              options={parseOptions(field.options).map((opt) => ({ value: opt, label: opt }))}
              value={typeof value === 'string' ? value : ''}
              onChange={(val) => setFieldValue(field.key, val)}
              placeholder="Select an option"
              clearable={false}
              showKeyboardHints={false}
              containerClassName="h-10"
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
            >
              {parseChoiceOptions(field.options).map((option, index) => {
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
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150', isSelected ? 'border-oak-primary' : 'border-border-primary')}>
                        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-oak-primary" />}
                      </span>
                      {option.label}
                    </label>
                    {option.allowTextInput && isSelected && (
                      <input type="text" value={selectedEntry?.detailText || ''}
                        onChange={(e) => setFieldValue(field.key, { value: option.value, detailText: e.target.value })}
                        placeholder={option.textInputPlaceholder || option.textInputLabel || 'Please specify'}
                        className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary"
                      />
                    )}
                  </div>
                );
              })}
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
            >
              {parseChoiceOptions(field.options).map((option, index) => {
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
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-150', isChecked ? 'border-oak-primary bg-oak-primary' : 'border-border-primary')}>
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
                        className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary"
                      />
                    )}
                  </div>
                );
              })}
            </fieldset>
          )}

          {/* FILE_UPLOAD */}
          {field.type === 'FILE_UPLOAD' && (
            <div className={cn(
              'rounded-xl border border-dashed bg-background-primary/50 p-6 text-center transition-colors duration-150',
              uploadStatus ? 'border-status-success/40' : 'border-border-primary/60 hover:border-oak-primary/40'
            )}>
              <UploadCloud className="mx-auto mb-2 h-8 w-8 text-text-muted" />
              <label htmlFor={controlId} className="cursor-pointer text-sm text-text-primary underline">
                {uploadStatus ? 'Replace file' : 'Upload a file'}
              </label>
              <input id={controlId} type="file" className="sr-only"
                aria-label={field.hideLabel ? accessibleLabel : undefined}
                aria-invalid={errorText ? 'true' : undefined}
                aria-describedby={describedBy}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadFile(field.key, file); }}
              />
              <p className="mt-1 text-xs text-text-muted">
                {uploadingField === field.key ? 'Uploading...' : uploadStatus ? 'File uploaded successfully' : 'Select a file to upload'}
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 p-4 sm:p-8 flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading form...</div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 p-4 sm:p-8 flex items-center justify-center">
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-xl bg-white p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-status-success shrink-0" />
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Response submitted</h1>
              <p className="text-sm text-text-secondary">Your response has been recorded.</p>
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
              Download PDF
            </Button>
          </div>
          {!downloadHref && (
            <p className="mt-2 text-xs text-text-muted">Download link expired. Submit the form again to generate a new link.</p>
          )}

          <div className="mt-6 rounded-lg border border-border-primary/50 bg-background-primary p-3">
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Email a PDF copy</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={pdfRecipientEmail}
                onChange={(e) => {
                  setPdfRecipientEmail(e.target.value);
                  if (emailFeedback) setEmailFeedback(null);
                }}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Mail className="h-4 w-4" />}
                onClick={sendSubmissionPdfEmail}
                isLoading={isSendingEmail}
              >
                Send
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
    <div className={cn('min-h-screen', isEmbed ? 'bg-transparent p-0' : 'bg-gradient-to-br from-slate-50 to-stone-100 p-4 sm:p-8')}>
      <div className={cn('mx-auto max-w-4xl', isEmbed ? '' : 'py-2')}>
        {!isEmbed && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary">{form.title}</h1>
            {form.description && <p className="mt-2 text-base text-text-secondary leading-relaxed">{form.description}</p>}
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
              Back
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
                Continue
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
                {isPreview ? 'Preview mode' : 'Submit'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
