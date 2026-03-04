'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/forms/signature-pad';
import { WIDTH_CLASS, parseOptions, isEmptyValue, evaluateCondition, type PublicFormField as PublicField, type PublicFormDefinition } from '@/lib/form-utils';
import { cn } from '@/lib/utils';
import DOMPurify from 'dompurify';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME_HINT_PATTERN = /(full[\s_-]?name|first[\s_-]?name|last[\s_-]?name|name)/i;
const EMAIL_HINT_PATTERN = /email/i;
const DATA_URI_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;

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
  const [submitted, setSubmitted] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

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

  const pages = useMemo(() => {
    if (!form) return [] as PublicField[][];

    const result: PublicField[][] = [[]];
    for (const field of form.fields) {
      if (field.type === 'PAGE_BREAK') {
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

  function setFieldValue(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateCurrentPage(): boolean {
    const nextErrors: Record<string, string> = {};

    for (const field of visibleFields) {
      const value = answers[field.key];

      if (field.isRequired && field.type !== 'PARAGRAPH' && field.type !== 'HTML' && field.type !== 'HIDDEN' && isEmptyValue(value)) {
        nextErrors[field.key] = `${field.label || field.key} is required`;
        continue;
      }

      if (
        field.type === 'SHORT_TEXT' &&
        field.inputType === 'email' &&
        typeof value === 'string' &&
        value.trim().length > 0 &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ) {
        nextErrors[field.key] = `${field.label || field.key} must be a valid email`;
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
    } catch (err) {
      setFieldErrors((prev) => ({
        ...prev,
        [fieldKey]: err instanceof Error ? err.message : 'Upload failed',
      }));
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
          return Array.isArray(value) ? value : [];
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

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background-primary p-4 sm:p-8 flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading form...</div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-background-primary p-4 sm:p-8 flex items-center justify-center">
        <div className="max-w-md rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error || 'Form not found'}
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background-primary p-4 sm:p-8 flex items-center justify-center">
        <div className="max-w-md rounded-lg border border-border-primary bg-background-elevated p-8 text-center">
          <h1 className="text-xl font-semibold text-text-primary">Submission received</h1>
          <p className="mt-2 text-sm text-text-secondary">Thank you. Your response has been submitted successfully.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen', isEmbed ? 'bg-transparent p-0' : 'bg-background-primary p-4 sm:p-8')}>
      <div className={cn('mx-auto max-w-4xl rounded-xl border border-border-primary bg-background-elevated', isEmbed ? 'rounded-none border-none' : 'p-4 sm:p-8')}>
        {!isEmbed && (
          <>
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{form.title}</h1>
            {form.description && <p className="mt-1 text-sm text-text-secondary">{form.description}</p>}
            {isPreview && (
              <p className="mt-2 text-xs text-text-muted">
                Preview mode. Publish the form to accept uploads and submissions.
              </p>
            )}
          </>
        )}

        <div className={cn('grid grid-cols-12 gap-4', !isEmbed && 'mt-4')}>
          {visibleFields.map((field) => {
            const options = parseOptions(field.options);
            const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];
            const value = answers[field.key];
            const errorText = fieldErrors[field.key];
            const fieldDomId = `form-field-${toDomSafeId(field.id || field.key)}`;
            const controlId = `${fieldDomId}-control`;
            const labelId = `${fieldDomId}-label`;
            const hintId = field.subtext ? `${fieldDomId}-hint` : undefined;
            const errorId = errorText ? `${fieldDomId}-error` : undefined;
            const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
            const accessibleLabel = field.label || field.key;
            const renderLabelAsText = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SIGNATURE'].includes(field.type);

            if (field.type === 'PARAGRAPH') {
              return (
                <div key={field.id} className={widthClass}>
                  <div className="text-sm text-text-primary whitespace-pre-wrap">{field.subtext || field.label}</div>
                </div>
              );
            }

            if (field.type === 'HTML') {
              return (
                <div key={field.id} className={widthClass}>
                  <div className="text-sm text-text-primary" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(field.subtext || '') }} />
                </div>
              );
            }

            if (field.type === 'HIDDEN') return null;

            return (
              <div key={field.id} className={widthClass}>
                {!field.hideLabel && (
                  renderLabelAsText ? (
                    <p id={labelId} className="mb-1.5 block text-base font-semibold text-text-primary">
                      {accessibleLabel}
                      {field.isRequired && <span className="text-status-error"> *</span>}
                    </p>
                  ) : (
                    <label htmlFor={controlId} id={labelId} className="mb-1.5 block text-base font-semibold text-text-primary">
                      {accessibleLabel}
                      {field.isRequired && <span className="text-status-error"> *</span>}
                    </label>
                  )
                )}
                {field.subtext && <p id={hintId} className="mb-2 text-sm text-text-secondary">{field.subtext}</p>}

                {field.type === 'SHORT_TEXT' && (
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
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                  />
                )}

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
                    className="w-full min-h-24 rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                  />
                )}

                {field.type === 'DROPDOWN' && (
                  <select
                    id={controlId}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => setFieldValue(field.key, e.target.value)}
                    required={field.isRequired}
                    aria-label={field.hideLabel ? accessibleLabel : undefined}
                    aria-invalid={errorText ? 'true' : undefined}
                    aria-describedby={describedBy}
                    className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="">Select an option</option>
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                )}

                {field.type === 'SINGLE_CHOICE' && (
                  <fieldset
                    className="space-y-2"
                    aria-label={field.hideLabel ? accessibleLabel : undefined}
                    aria-labelledby={field.hideLabel ? undefined : labelId}
                    aria-describedby={describedBy}
                    aria-invalid={errorText ? 'true' : undefined}
                  >
                    {options.map((option, index) => {
                      const optionId = `${fieldDomId}-option-${index}`;
                      return (
                        <label key={option} htmlFor={optionId} className="flex items-center gap-2 text-sm text-text-primary">
                          <input
                            id={optionId}
                            type="radio"
                            name={field.key}
                            value={option}
                            checked={value === option}
                            onChange={() => setFieldValue(field.key, option)}
                          />
                          {option}
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {field.type === 'MULTIPLE_CHOICE' && (
                  <fieldset
                    className="space-y-2"
                    aria-label={field.hideLabel ? accessibleLabel : undefined}
                    aria-labelledby={field.hideLabel ? undefined : labelId}
                    aria-describedby={describedBy}
                    aria-invalid={errorText ? 'true' : undefined}
                  >
                    {options.map((option, index) => {
                      const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
                      const checked = current.includes(option);
                      const optionId = `${fieldDomId}-option-${index}-${toDomSafeId(option)}`;
                      return (
                        <label key={option} htmlFor={optionId} className="flex items-center gap-2 text-sm text-text-primary">
                          <input
                            id={optionId}
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFieldValue(field.key, [...current, option]);
                              } else {
                                setFieldValue(field.key, current.filter((item) => item !== option));
                              }
                            }}
                          />
                          {option}
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {field.type === 'FILE_UPLOAD' && (
                  <div className="rounded-lg border border-dashed border-border-primary bg-background-primary p-4 text-center">
                    <UploadCloud className="mx-auto mb-2 h-8 w-8 text-text-muted" />
                    <label htmlFor={controlId} className="text-sm text-text-primary underline cursor-pointer">
                      Upload a file
                    </label>
                    <input
                      id={controlId}
                      type="file"
                      className="sr-only"
                      aria-label={field.hideLabel ? accessibleLabel : undefined}
                      aria-invalid={errorText ? 'true' : undefined}
                      aria-describedby={describedBy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadFile(field.key, file);
                        }
                      }}
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      {uploadingField === field.key ? 'Uploading...' : 'Select a file to upload'}
                    </p>
                  </div>
                )}

                {field.type === 'SIGNATURE' && (
                  <div
                    role="group"
                    aria-label={field.hideLabel ? accessibleLabel : undefined}
                    aria-labelledby={field.hideLabel ? undefined : labelId}
                    aria-describedby={describedBy}
                  >
                    <SignaturePad
                      value={typeof value === 'string' ? value : ''}
                      onChange={(next) => setFieldValue(field.key, next)}
                      ariaLabel={accessibleLabel}
                    />
                  </div>
                )}

                {errorText && (
                  <p id={errorId} className="mt-1 text-xs text-status-error">{errorText}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {currentPage > 0 ? (
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => setCurrentPage((prev) => prev - 1)}>
              Back
            </Button>
          ) : <div />}

          {currentPage < pages.length - 1 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (!validateCurrentPage()) return;
                setCurrentPage((prev) => prev + 1);
              }}
            >
              Continue
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={submitForm} isLoading={isSubmitting} disabled={isPreview}>
              {isPreview ? 'Preview mode' : 'Submit'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
