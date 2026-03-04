'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, ChevronLeft, Copy } from 'lucide-react';
import DOMPurify from 'dompurify';
import type { FormUpload } from '@/generated/prisma';
import { useToast } from '@/components/ui/toast';
import { useForm, useFormResponse } from '@/hooks/use-forms';
import { WIDTH_CLASS, evaluateCondition, isEmptyValue } from '@/lib/form-utils';

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
    if (!form || !submission) return [] as typeof form.fields[][];

    const pages: typeof form.fields[][] = [[]];
    for (const field of form.fields) {
      if (field.type === 'PAGE_BREAK') {
        pages.push([]);
        continue;
      }

      if (field.type === 'HIDDEN') continue;
      if (!evaluateCondition(field.condition, submissionAnswers)) continue;

      pages[pages.length - 1].push(field);
    }

    return pages.filter((pageFields) => pageFields.length > 0);
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

  const tenantQuery = form.tenantId ? `?tenantId=${encodeURIComponent(form.tenantId)}` : '';

  function getUploadHref(uploadId: string): string {
    return `/api/forms/${encodeURIComponent(form.id)}/responses/${encodeURIComponent(submission.id)}/uploads/${encodeURIComponent(uploadId)}${tenantQuery}`;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <Link
          href={`/forms/${form.id}/responses`}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Responses
        </Link>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">Submission response</h1>
        <p className="mt-1 text-sm text-text-secondary">{form.title}</p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-border-primary bg-background-elevated p-3 text-sm text-text-primary sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-2xs uppercase tracking-wide text-text-muted">Submitted</div>
          <div>{formatDate(submission.submittedAt)}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wide text-text-muted">Respondent</div>
          <div>{submission.respondentName || '-'}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wide text-text-muted">Email</div>
          <div>{submission.respondentEmail || '-'}</div>
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

        {responsePages.map((pageFields, pageIndex) => (
          <section key={`page-${pageIndex}`} className="rounded-lg border border-border-primary bg-background-elevated p-3 sm:p-4">
            {responsePages.length > 1 && (
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Page {pageIndex + 1}</h2>
            )}

            <div className="grid grid-cols-12 gap-3">
              {pageFields.map((field) => {
                const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];
                const value = submissionAnswers[field.key];
                const copyKey = `${submission.id}:${field.key}`;
                const copyValue = field.type === 'FILE_UPLOAD'
                  ? (() => {
                    const ids = toUploadIds(value);
                    if (ids.length === 0) return null;
                    return ids.map((id) => uploadsById.get(id)?.fileName || id).join('\n');
                  })()
                  : toCopyValue(field.type, value);

                if (field.type === 'PARAGRAPH') {
                  return (
                    <div key={field.id} className={widthClass}>
                      <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary whitespace-pre-wrap">
                        {field.subtext || field.label || ''}
                      </div>
                    </div>
                  );
                }

                if (field.type === 'HTML') {
                  return (
                    <div key={field.id} className={widthClass}>
                      <div
                        className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.subtext || '') }}
                      />
                    </div>
                  );
                }

                return (
                  <div key={field.id} className={widthClass}>
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
                        {isEmptyValue(value) ? <span className="text-text-muted">-</span> : String(value)}
                      </div>
                    )}

                    {field.type === 'LONG_TEXT' && (
                      <div className="min-h-24 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary whitespace-pre-wrap">
                        {isEmptyValue(value) ? <span className="text-text-muted">-</span> : String(value)}
                      </div>
                    )}

                    {field.type === 'MULTIPLE_CHOICE' && (
                      <div className="min-h-10 rounded-lg border border-border-primary bg-background-primary px-3 py-2">
                        {Array.isArray(value) && value.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {value.map((item, index) => (
                              <span key={`${field.id}-choice-${index}`} className="rounded bg-background-tertiary px-2 py-0.5 text-xs text-text-primary">
                                {String(item)}
                              </span>
                            ))}
                          </div>
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
                                    <div key={`${field.id}-upload-${index}`} className="text-sm text-text-primary break-all">
                                      {uploadId}
                                    </div>
                                  );
                                }

                                return (
                                  <div key={upload.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
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
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
