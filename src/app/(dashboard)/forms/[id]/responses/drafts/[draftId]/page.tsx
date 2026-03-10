'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, ExternalLink, Paperclip } from 'lucide-react';
import type { FormField } from '@/generated/prisma';
import { Button } from '@/components/ui/button';
import { useForm, useFormDraft } from '@/hooks/use-forms';
import { formatChoiceAnswer, isEmptyValue } from '@/lib/form-utils';

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

function toAnswerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function formatFieldValue(field: FormField, value: unknown): string {
  if (value === null || value === undefined || isEmptyValue(value)) return '-';

  if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') {
    return formatChoiceAnswer(value) || '-';
  }

  if (field.type === 'SIGNATURE') {
    return typeof value === 'string' && value.trim().length > 0 ? 'Signed' : '-';
  }

  if (field.type === 'FILE_UPLOAD') {
    if (Array.isArray(value)) {
      return `${value.length} file${value.length === 1 ? '' : 's'}`;
    }

    return typeof value === 'string' && value.trim().length > 0 ? value : '-';
  }

  if (Array.isArray(value)) {
    const text = value.map((item) => String(item)).join(', ').trim();
    return text || '-';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '-';
    }
  }

  const text = String(value).trim();
  return text || '-';
}

export default function FormDraftDetailPage() {
  const params = useParams<{ id: string; draftId: string }>();
  const formId = params.id;
  const draftId = params.draftId;

  const {
    data: form,
    isLoading: isFormLoading,
    error: formError,
  } = useForm(formId);
  const {
    data: draftDetail,
    isLoading: isDraftLoading,
    error: draftError,
  } = useFormDraft(formId, draftId);

  if (isFormLoading || isDraftLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-10 w-72 animate-pulse rounded bg-background-tertiary mb-4" />
        <div className="h-64 animate-pulse rounded-lg border border-border-primary bg-background-elevated" />
      </div>
    );
  }

  if (formError || draftError || !form || !draftDetail) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {formError instanceof Error
            ? formError.message
            : draftError instanceof Error
              ? draftError.message
              : 'Draft not found'}
        </div>
      </div>
    );
  }

  const draft = draftDetail.draft;
  const answers = toAnswerRecord(draft.answers);
  const populatedFields = form.fields.filter((field) => !isEmptyValue(answers[field.key]));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link href={`/forms/${form.id}/responses`} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
            <ChevronLeft className="w-4 h-4" />
            Back to Responses
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-text-primary sm:text-2xl">
            Draft entry {draft.code}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Review saved answers and attachments for this draft entry.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<ExternalLink className="w-4 h-4" />}
          onClick={() => window.open(`/forms/${form.id}/responses`, '_blank', 'noopener,noreferrer')}
        >
          Open Responses
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Last saved</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{formatDate(draft.lastSavedAt)}</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Expires</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{formatDate(draft.expiresAt)}</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Attachments</div>
          <div className="mt-1 text-sm font-medium text-text-primary">{draft.uploadCount}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3">
          <div className="text-sm font-medium text-text-primary">Saved answers</div>
        </div>

        {populatedFields.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            No saved answers in this draft yet.
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {populatedFields.map((field) => (
              <div key={field.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
                <div className="text-sm font-medium text-text-primary">{field.label || field.key}</div>
                <div className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                  {formatFieldValue(field, answers[field.key])}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-border-primary bg-background-elevated overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3">
          <div className="text-sm font-medium text-text-primary">Attachments</div>
        </div>

        {draft.attachments.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            No attachments saved with this draft.
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {draft.attachments.map((attachment) => {
              const href = form.tenantId
                ? `/api/forms/${encodeURIComponent(form.id)}/drafts/${encodeURIComponent(draft.id)}/uploads/${encodeURIComponent(attachment.id)}?tenantId=${encodeURIComponent(form.tenantId)}&disposition=inline`
                : `/api/forms/${encodeURIComponent(form.id)}/drafts/${encodeURIComponent(draft.id)}/uploads/${encodeURIComponent(attachment.id)}?disposition=inline`;

              return (
                <a
                  key={attachment.id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-background-primary px-3 py-2 hover:bg-background-elevated"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-text-muted" />
                      <p className="truncate text-sm font-medium text-text-primary">{attachment.fileName}</p>
                    </div>
                    <p className="text-xs text-text-secondary">{attachment.mimeType}</p>
                  </div>
                  <div className="shrink-0 text-xs text-text-muted">{formatDate(attachment.createdAt)}</div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
