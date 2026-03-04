'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Download, Info, Mail, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { SignaturePad } from '@/components/forms/signature-pad';
import { Tooltip } from '@/components/ui/tooltip';
import { WIDTH_CLASS, parseObject, parseOptions, isEmptyValue, evaluateCondition, type PublicFormField as PublicField, type PublicFormDefinition } from '@/lib/form-utils';
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

  return (
    <div className={cn('min-h-screen', isEmbed ? 'bg-transparent p-0' : 'bg-gradient-to-br from-slate-50 to-stone-100 p-4 sm:p-8')}>
      <div className={cn('mx-auto max-w-4xl', isEmbed ? '' : 'py-2')}>
        {!isEmbed && (
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary">{form.title}</h1>
            {form.description && <p className="mt-2 text-base text-text-secondary leading-relaxed">{form.description}</p>}
            {isPreview && (
              <p className="mt-2 text-xs text-text-muted">
                Preview mode. Publish the form to accept uploads and submissions.
              </p>
            )}
            <div className="mt-4 h-[3px] w-12 rounded-full bg-oak-primary" />
          </div>
        )}

        {pages.length > 1 && (
          <div className="mb-6 h-[3px] w-full overflow-hidden rounded-full bg-border-primary/40">
            <div
              className="h-full rounded-full bg-oak-primary transition-all duration-300 ease-out"
              style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
            />
          </div>
        )}

        <div className={cn('grid grid-cols-12 gap-4', !isEmbed && 'mt-4')}>
          {visibleFields.map((field) => {
            const options = parseOptions(field.options);
            const widthClass = WIDTH_CLASS[field.layoutWidth] || WIDTH_CLASS[100];
            const value = answers[field.key];
            const errorText = fieldErrors[field.key];
            const uploadStatus = uploadedByFieldKey[field.key];
            const infoType = field.type === 'PARAGRAPH'
              ? (field.inputType === 'info_image' || field.inputType === 'info_url' ? field.inputType : 'info_text')
              : null;
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

            if (field.type === 'PARAGRAPH') {
              const headingType = field.inputType === 'info_heading_1' ? 'h1'
                : field.inputType === 'info_heading_2' ? 'h2'
                : field.inputType === 'info_heading_3' ? 'h3'
                : null;

              if (headingType) {
                const headingClasses = {
                  h1: 'text-xl font-bold text-text-primary mt-6 mb-2',
                  h2: 'text-lg font-semibold text-text-primary mt-4 mb-1.5',
                  h3: 'text-base font-semibold text-text-primary mt-3 mb-1',
                };
                const Tag = headingType as 'h1' | 'h2' | 'h3';
                return (
                  <div key={field.id} className={widthClass}>
                    <Tag className={headingClasses[headingType]}>
                      {field.label || field.subtext}
                    </Tag>
                    {field.subtext && field.label && (
                      <p className="text-sm text-text-secondary">{field.subtext}</p>
                    )}
                  </div>
                );
              }

              if (infoType === 'info_image') {
                const imageUrl = isValidHttpUrl(field.placeholder?.trim() || null) ? field.placeholder!.trim() : null;
                return (
                  <div key={field.id} className={widthClass}>
                    <div className="overflow-hidden rounded-lg border border-border-primary bg-background-primary">
                      {imageUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- image source is user-provided URL for informational block */}
                          <img src={imageUrl} alt={field.subtext || field.label || 'Information image'} className="max-h-96 w-full object-contain" />
                          {field.subtext && (
                            <p className="border-t border-border-primary px-3 py-2 text-xs text-text-secondary">{field.subtext}</p>
                          )}
                        </>
                      ) : (
                        <div className="px-3 py-4 text-sm text-text-secondary">
                          Add a valid image URL in field settings.
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (infoType === 'info_url') {
                const href = isValidHttpUrl(field.placeholder?.trim() || null) ? field.placeholder!.trim() : null;
                return (
                  <div key={field.id} className={widthClass}>
                    <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm">
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
                        <span className="text-text-secondary">Add a valid URL in field settings.</span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={field.id} className={widthClass}>
                  <div className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary whitespace-pre-wrap">
                    {field.subtext || field.label}
                  </div>
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
                <div className={cn(
                  "rounded-xl border bg-white p-5 shadow-sm transition-shadow duration-150 hover:shadow-md",
                  errorText ? "border-status-error/40 ring-1 ring-status-error/20" : "border-border-primary/50"
                )}>
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
                      "w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60",
                      "focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150",
                      field.isReadOnly && "bg-background-secondary cursor-not-allowed opacity-70"
                    )}
                  />
                )}

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
                      "w-full min-h-24 rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60",
                      "focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150 resize-y",
                      field.isReadOnly && "bg-background-secondary cursor-not-allowed opacity-70"
                    )}
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
                    className="w-full rounded-lg border border-border-primary/60 bg-background-primary px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/20 focus:border-oak-primary transition-all duration-150"
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
                      const isSelected = value === option;
                      return (
                        <label
                          key={option}
                          htmlFor={optionId}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150",
                            isSelected
                              ? "border-oak-primary/40 bg-oak-primary/5 text-text-primary"
                              : "border-transparent text-text-primary hover:bg-background-secondary/50"
                          )}
                        >
                          <input
                            id={optionId}
                            type="radio"
                            name={field.key}
                            value={option}
                            checked={isSelected}
                            onChange={() => setFieldValue(field.key, option)}
                            className="sr-only"
                          />
                          <span className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150",
                            isSelected ? "border-oak-primary" : "border-border-primary"
                          )}>
                            {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-oak-primary" />}
                          </span>
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
                      const isChecked = current.includes(option);
                      const optionId = `${fieldDomId}-option-${index}-${toDomSafeId(option)}`;
                      return (
                        <label
                          key={option}
                          htmlFor={optionId}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all duration-150",
                            isChecked
                              ? "border-oak-primary/40 bg-oak-primary/5 text-text-primary"
                              : "border-transparent text-text-primary hover:bg-background-secondary/50"
                          )}
                        >
                          <input
                            id={optionId}
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFieldValue(field.key, [...current, option]);
                              } else {
                                setFieldValue(field.key, current.filter((item) => item !== option));
                              }
                            }}
                            className="sr-only"
                          />
                          <span className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-150",
                            isChecked ? "border-oak-primary bg-oak-primary" : "border-border-primary"
                          )}>
                            {isChecked && (
                              <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 6l3 3 5-5" />
                              </svg>
                            )}
                          </span>
                          {option}
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {field.type === 'FILE_UPLOAD' && (
                  <div className={cn(
                    'rounded-xl border border-dashed bg-background-primary/50 p-6 text-center transition-colors duration-150',
                    uploadStatus ? 'border-status-success/40' : 'border-border-primary/60 hover:border-oak-primary/40'
                  )}>
                    <UploadCloud className="mx-auto mb-2 h-8 w-8 text-text-muted" />
                    <label htmlFor={controlId} className="text-sm text-text-primary underline cursor-pointer">
                      {uploadStatus ? 'Replace file' : 'Upload a file'}
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
                      {uploadingField === field.key
                        ? 'Uploading...'
                        : uploadStatus
                          ? 'File uploaded successfully'
                          : 'Select a file to upload'}
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

                {errorText && !useDateSelector && (
                  <p id={errorId} className="mt-1 text-xs text-status-error">{errorText}</p>
                )}
                </div>
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
