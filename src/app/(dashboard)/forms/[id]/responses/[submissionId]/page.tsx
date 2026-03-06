'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, ChevronLeft, Copy, Download } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { FormField, FormUpload } from '@/generated/prisma';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useForm, useFormResponse } from '@/hooks/use-forms';
import { WIDTH_CLASS, evaluateCondition, formatChoiceAnswer, isEmptyValue, parseObject } from '@/lib/form-utils';

type RepeatSectionConfig = {
  id: string;
  minItems: number;
};

type ResponsePageItem =
  | { kind: 'field'; field: FormField }
  | {
    kind: 'repeat';
    sectionId: string;
    title: string;
    hint: string | null;
    fields: FormField[];
    rowCount: number;
  };

type ResponsePage = {
  items: ResponsePageItem[];
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const choiceText = formatChoiceAnswer(value);
  if (choiceText) return choiceText;
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toAnswerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toCopyValue(fieldType: string, value: unknown): string | null {
  if (value === null || value === undefined || fieldType === 'SIGNATURE') return null;
  if (fieldType === 'SINGLE_CHOICE' || fieldType === 'MULTIPLE_CHOICE') {
    return formatChoiceAnswer(value);
  }
  if (typeof value === 'string') return value.trim().length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const text = value
      .map((item) => (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') ? String(item) : '')
      .filter(Boolean)
      .join('\n');
    return text || null;
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return null;
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

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
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

function getInfoBackgroundColor(field: FormField): string | null {
  if (field.type !== 'PARAGRAPH') return null;
  const validation = parseObject(field.validation);
  return normalizeHexColor(validation?.infoBackgroundColor);
}

function hasHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function isRepeatStartMarker(field: FormField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start';
}

function isRepeatEndMarker(field: FormField): boolean {
  return field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end';
}

function getRepeatSectionConfig(startField: FormField): RepeatSectionConfig {
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

function buildRowAnswers(answers: Record<string, unknown>, rowIndex: number): Record<string, unknown> {
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

export default function FormResponseDetailPage() {
  const params = useParams<{ id: string; submissionId: string }>();
  const formId = params.id;
  const submissionId = params.submissionId;
  const { success, error: showError } = useToast();

  const [recentlyCopiedKey, setRecentlyCopiedKey] = useState<string | null>(null);

  const { data: form, isLoading: isFormLoading, error: formError } = useForm(formId);
  const {
    data: responseDetail,
    isLoading: isResponseLoading,
    error: responseError,
  } = useFormResponse(formId, submissionId);

  const submission = responseDetail?.submission ?? null;

  const submissionAnswers = useMemo(
    () => toAnswerRecord(submission?.answers),
    [submission?.answers]
  );

  const uploadsById = useMemo(() => {
    const map = new Map<string, FormUpload>();
    const uploads = responseDetail?.uploads || [];
    for (const upload of uploads) {
      map.set(upload.id, upload);
    }
    return map;
  }, [responseDetail?.uploads]);

  const responsePages = useMemo(() => {
    if (!form || !submission) return [] as ResponsePage[];

    const pages: ResponsePage[] = [{ items: [] }];

    for (let index = 0; index < form.fields.length; index += 1) {
      const field = form.fields[index];

      if (field.type === 'PAGE_BREAK') {
        if (isRepeatStartMarker(field)) {
          const sectionFields: FormField[] = [];
          let cursor = index + 1;

          while (cursor < form.fields.length) {
            const candidate = form.fields[cursor];
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

          const sectionConfig = getRepeatSectionConfig(field);
          const rowCount = getRepeatSectionRowCount(sectionFields, submissionAnswers, sectionConfig.minItems);
          const hasData = sectionFields.some((sectionField) => hasAnyAnswerValue(submissionAnswers[sectionField.key]));
          const shouldDisplaySection = evaluateCondition(field.condition, submissionAnswers) || hasData;

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
      if (!evaluateCondition(field.condition, submissionAnswers)) continue;

      pages[pages.length - 1].items.push({ kind: 'field', field });
    }

    return pages.filter((page) => page.items.length > 0);
  }, [form, submission, submissionAnswers]);

  async function handleCopyValue(copyKey: string, value: string | null) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setRecentlyCopiedKey(copyKey);
      success('Field value copied');
      window.setTimeout(() => setRecentlyCopiedKey((prev) => (prev === copyKey ? null : prev)), 1200);
    } catch {
      showError('Failed to copy value');
    }
  }

  if (isFormLoading || isResponseLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-10 w-56 animate-pulse rounded bg-background-tertiary mb-4" />
        <div className="h-64 animate-pulse rounded-lg border border-border-primary bg-background-elevated" />
      </div>
    );
  }

  if (formError || !form) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {formError instanceof Error ? formError.message : 'Form not found'}
        </div>
      </div>
    );
  }

  if (responseError || !submission) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {responseError instanceof Error ? responseError.message : 'Submission not found'}
        </div>
      </div>
    );
  }

  const tenantQuery = form!.tenantId ? `?tenantId=${encodeURIComponent(form!.tenantId)}` : '';

  function getUploadHref(uploadId: string): string {
    return `/api/forms/${encodeURIComponent(form!.id)}/responses/${encodeURIComponent(submission!.id)}/uploads/${encodeURIComponent(uploadId)}${tenantQuery}`;
  }

  function getExportPdfHref(): string {
    return `/api/forms/${encodeURIComponent(form!.id)}/responses/${encodeURIComponent(submission!.id)}/export/pdf${tenantQuery}`;
  }

  function renderFieldCard(field: FormField, value: unknown, copyKey: string, fieldKey: string) {
    const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];
    const copyValue = field.type === 'FILE_UPLOAD'
      ? (() => {
        const ids = toUploadIds(value);
        if (ids.length === 0) return null;
        return ids.map((id) => uploadsById.get(id)?.fileName || id).join('\n');
      })()
      : toCopyValue(field.type, value);
    const infoType = field.type === 'PARAGRAPH'
      ? (field.inputType === 'info_image' || field.inputType === 'info_url' ? field.inputType : 'info_text')
      : null;
    const infoBackgroundColor = getInfoBackgroundColor(field);
    const infoBackgroundStyle = infoBackgroundColor ? { backgroundColor: infoBackgroundColor } : undefined;

    if (field.type === 'PARAGRAPH') {
      if (infoType === 'info_image') {
        const imageUrl = isValidHttpUrl(field.placeholder?.trim() || null) ? field.placeholder!.trim() : null;
        return (
          <div key={fieldKey} className={widthClass}>
            <div className="overflow-hidden rounded-lg border border-border-primary bg-background-primary" style={infoBackgroundStyle}>
              {imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-configurable informational image URL */}
                  <img src={imageUrl} alt={field.subtext || field.label || 'Information image'} className="max-h-72 w-full object-contain" />
                  {field.subtext && (
                    <p className="border-t border-border-primary px-3 py-2 text-xs text-text-secondary">{field.subtext}</p>
                  )}
                </>
              ) : (
                <div className="px-3 py-3 text-sm text-text-muted">No valid image URL configured.</div>
              )}
            </div>
          </div>
        );
      }

      if (infoType === 'info_url') {
        const href = isValidHttpUrl(field.placeholder?.trim() || null) ? field.placeholder!.trim() : null;
        return (
          <div key={fieldKey} className={widthClass}>
            <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm" style={infoBackgroundStyle}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-text-primary underline hover:text-text-secondary"
                >
                  {field.subtext || field.label || href}
                </a>
              ) : (
                <span className="text-text-muted">No valid URL configured.</span>
              )}
            </div>
          </div>
        );
      }

      return (
        <div key={fieldKey} className={widthClass}>
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary" style={infoBackgroundStyle}>
            {hasHtmlMarkup(field.subtext || '') ? (
              <div
                className="form-rich-render text-sm text-text-primary"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.subtext || '') }}
              />
            ) : (
              <div className="whitespace-pre-wrap">{field.subtext || field.label || ''}</div>
            )}
          </div>
        </div>
      );
    }

    if (field.type === 'HTML') {
      return (
        <div key={fieldKey} className={widthClass}>
          <div
            className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.subtext || '') }}
          />
        </div>
      );
    }

    return (
      <div key={fieldKey} className={widthClass}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="block text-xs font-medium text-text-secondary">
            {field.label || field.key}
          </label>
          {copyValue && (
            <button
              type="button"
              onClick={() => void handleCopyValue(copyKey, copyValue)}
              className="inline-flex items-center gap-1 rounded border border-border-primary px-2 py-1 text-2xs text-text-secondary hover:bg-background-primary hover:text-text-primary"
              aria-label={`Copy value for ${field.label || field.key}`}
            >
              {recentlyCopiedKey === copyKey ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          )}
        </div>

        {field.subtext && (
          <p className="mb-1.5 text-xs text-text-muted">{field.subtext}</p>
        )}

        {(field.type === 'SHORT_TEXT' || field.type === 'DROPDOWN' || field.type === 'SINGLE_CHOICE') && (
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary">
            {isEmptyValue(value) ? (
              <span className="text-text-muted">-</span>
            ) : (
              field.type === 'SINGLE_CHOICE'
                ? (formatChoiceAnswer(value) || <span className="text-text-muted">-</span>)
                : String(value)
            )}
          </div>
        )}

        {field.type === 'LONG_TEXT' && (
          <div className="min-h-24 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary whitespace-pre-wrap">
            {isEmptyValue(value) ? <span className="text-text-muted">-</span> : String(value)}
          </div>
        )}

        {field.type === 'MULTIPLE_CHOICE' && (
          <div className="min-h-10 rounded-lg border border-border-primary bg-background-primary px-3 py-2">
            {formatChoiceAnswer(value) ? (
              <span className="text-sm text-text-primary">{formatChoiceAnswer(value)}</span>
            ) : (
              <span className="text-sm text-text-muted">-</span>
            )}
          </div>
        )}

        {field.type === 'FILE_UPLOAD' && (
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2">
            {(() => {
              const uploadIds = toUploadIds(value);
              if (uploadIds.length === 0) {
                return <span className="text-sm text-text-muted">-</span>;
              }

              return (
                <div className="space-y-1.5">
                  {uploadIds.map((uploadId, index) => {
                    const upload = uploadsById.get(uploadId);
                    if (!upload) {
                      return (
                        <div key={`${fieldKey}-upload-${index}`} className="text-sm text-text-primary break-all">
                          {uploadId}
                        </div>
                      );
                    }

                    return (
                      <div key={`${fieldKey}-${upload.id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <a
                          href={getUploadHref(upload.id)}
                          className="max-w-full break-all text-text-primary underline hover:text-text-secondary"
                        >
                          {upload.fileName}
                        </a>
                        <span className="text-xs text-text-muted">{formatFileSize(upload.sizeBytes)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {field.type === 'SIGNATURE' && (
          <div className="rounded-lg border border-border-primary bg-background-primary p-2">
            {typeof value === 'string' && value.trim().length > 0 ? (
              // Signature payload is expected to be a data URL produced by the form signer.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt={`${field.label || field.key} signature`} className="max-h-44 w-full rounded object-contain" />
            ) : (
              <div className="py-3 text-center text-sm text-text-muted">No signature provided</div>
            )}
          </div>
        )}

        {!['SHORT_TEXT', 'DROPDOWN', 'SINGLE_CHOICE', 'LONG_TEXT', 'MULTIPLE_CHOICE', 'FILE_UPLOAD', 'SIGNATURE'].includes(field.type) && (
          <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary">
            {isEmptyValue(value) ? <span className="text-text-muted">-</span> : safeCell(value)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/forms/${form.id}/responses`}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Responses
          </Link>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={() => window.open(getExportPdfHref(), '_blank', 'noopener,noreferrer')}
          >
            Export PDF
          </Button>
        </div>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">Submission response</h1>
        <p className="mt-1 text-sm text-text-secondary">{form.title}</p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border-primary bg-background-elevated p-3 text-sm text-text-primary sm:grid-cols-2">
        <div>
          <div className="text-2xs uppercase tracking-wide text-text-muted">Submitted</div>
          <div>{formatDate(submission.submittedAt)}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wide text-text-muted">Status</div>
          <div>{submission.status}</div>
        </div>
      </div>

      <div className="space-y-4">
        {responsePages.length === 0 && (
          <div className="rounded-lg border border-border-primary bg-background-elevated p-4 text-sm text-text-secondary">
            No visible fields to display for this submission.
          </div>
        )}

        {responsePages.map((page, pageIndex) => (
          <section key={`page-${pageIndex}`} className="rounded-lg border border-border-primary bg-background-elevated p-3 sm:p-4">
            {responsePages.length > 1 && (
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Page {pageIndex + 1}</h2>
            )}

            <div className="grid grid-cols-12 gap-3">
              {page.items.map((item) => {
                if (item.kind === 'field') {
                  const value = submissionAnswers[item.field.key];
                  const copyKey = `${submission.id}:${item.field.key}`;
                  return renderFieldCard(item.field, value, copyKey, item.field.id);
                }

                return (
                  <div key={item.sectionId} className="col-span-12">
                    <div className="rounded-xl border border-border-primary bg-background-primary p-3 sm:p-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
                        {item.hint && <p className="mt-1 text-xs text-text-secondary">{item.hint}</p>}
                      </div>

                      <div className="space-y-3">
                        {Array.from({ length: item.rowCount }).map((_, rowIndex) => {
                          const rowAnswers = buildRowAnswers(submissionAnswers, rowIndex);
                          const rowFields = item.fields.filter((sectionField) => (
                            sectionField.type !== 'HIDDEN' &&
                            evaluateCondition(sectionField.condition, rowAnswers)
                          ));

                          if (rowFields.length === 0) {
                            return null;
                          }

                          return (
                            <div key={`${item.sectionId}-row-${rowIndex}`} className="rounded-lg border border-border-primary/60 bg-background-elevated p-3">
                              <div className="mb-2 text-xs font-medium text-text-secondary">Card {rowIndex + 1}</div>
                              <div className="grid grid-cols-12 gap-3">
                                {rowFields.map((sectionField) => {
                                  const value = getRepeatRowValue(submissionAnswers[sectionField.key], rowIndex);
                                  const copyKey = `${submission.id}:${item.sectionId}:${rowIndex}:${sectionField.key}`;
                                  return renderFieldCard(
                                    sectionField,
                                    value,
                                    copyKey,
                                    `${sectionField.id}-${rowIndex}`
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
