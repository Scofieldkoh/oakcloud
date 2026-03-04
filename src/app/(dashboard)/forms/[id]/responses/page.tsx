'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { useForm, useFormResponses } from '@/hooks/use-forms';

const PAGE_SIZE = 20;

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

export default function FormResponsesPage() {
  const params = useParams<{ id: string }>();
  const formId = params.id;

  const [page, setPage] = useState(1);
  const [selectedSubmission, setSelectedSubmission] = useState<Record<string, unknown> | null>(null);

  const { data: form, isLoading: isFormLoading, error: formError } = useForm(formId);
  const { data, isLoading, error } = useFormResponses(formId, page, PAGE_SIZE);

  const conversionRate = useMemo(() => {
    if (!form || form.viewsCount === 0) return 0;
    return Number(((form.submissionsCount / form.viewsCount) * 100).toFixed(1));
  }, [form]);

  const chartPoints = useMemo(() => {
    const points = data?.chart || [];
    if (points.length === 0) return '';

    const max = Math.max(...points.map((point) => point.responses), 1);
    return points
      .map((point, index) => {
        const x = (index / (points.length - 1 || 1)) * 100;
        const y = 100 - (point.responses / max) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data?.chart]);

  function exportCsv() {
    if (!data || !form) return;

    const fieldKeys = form.fields.map((field) => field.key);
    const header = ['submission_id', 'submitted_at', 'respondent_name', 'respondent_email', ...fieldKeys];

    const rows = data.submissions.map((submission) => {
      const answers = (submission.answers || {}) as Record<string, unknown>;
      return [
        submission.id,
        new Date(submission.submittedAt).toISOString(),
        submission.respondentName || '',
        submission.respondentEmail || '',
        ...fieldKeys.map((key) => safeCell(answers[key])),
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'form'}-responses.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (isFormLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-10 w-72 animate-pulse rounded bg-background-tertiary mb-4" />
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

  const viewHref = form.status === 'PUBLISHED'
    ? `/forms/f/${form.slug}`
    : `/forms/f/${form.slug}?preview=1&formId=${form.id}&tenantId=${form.tenantId}`;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link href="/forms" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
            <ChevronLeft className="w-4 h-4" />
            Back to Forms
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">
            Responses to &quot;{form.title}&quot;
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <a href={viewHref} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">{form.status === 'PUBLISHED' ? 'View' : 'Preview'}</Button>
          </a>
          <Link href={`/forms/${form.id}/builder`}>
            <Button variant="secondary" size="sm">Edit Form</Button>
          </Link>
          <Button variant="primary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Total views</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{form.viewsCount}</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Responses</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{form.submissionsCount}</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Conversion rate</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{conversionRate}%</div>
        </div>
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated p-4 mb-4">
        <h2 className="text-base font-semibold text-text-primary mb-2">Visits and responses within the last 14 days</h2>
        <div className="h-52 rounded border border-border-primary bg-background-primary p-3">
          {chartPoints ? (
            <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-label="Responses trend chart">
              <polyline
                fill="none"
                stroke="var(--oak-500, #294d44)"
                strokeWidth="2"
                points={chartPoints}
              />
            </svg>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-text-muted">
              No response data yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3 text-sm font-medium text-text-primary">Submissions</div>

        {error && (
          <div className="px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error instanceof Error ? error.message : 'Failed to load responses'}
          </div>
        )}

        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded bg-background-tertiary" />
            ))}
          </div>
        )}

        {!isLoading && data && data.submissions.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">No submissions yet.</div>
        )}

        {!isLoading && data && data.submissions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-background-primary">
                <tr className="text-left text-xs text-text-secondary">
                  <th className="px-4 py-2 font-medium">Submitted</th>
                  <th className="px-4 py-2 font-medium">Respondent</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((submission) => (
                  <tr key={submission.id} className="border-t border-border-primary text-text-primary">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(submission.submittedAt)}</td>
                    <td className="px-4 py-3">{submission.respondentName || '-'}</td>
                    <td className="px-4 py-3">{submission.respondentEmail || '-'}</td>
                    <td className="px-4 py-3">{submission.status}</td>
                    <td className="px-4 py-3">
                      <Tooltip content="View submission">
                        <button
                          type="button"
                          className="rounded p-1.5 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                          onClick={() => setSelectedSubmission(submission as unknown as Record<string, unknown>)}
                          aria-label="View submission"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={setPage}
            showPageSize={false}
          />
        )}
      </div>

      <Modal
        isOpen={!!selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
        title="Submission details"
        size="lg"
      >
        <ModalBody>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border-primary bg-background-primary p-3 text-xs text-text-primary">
            {selectedSubmission ? JSON.stringify(selectedSubmission, null, 2) : ''}
          </pre>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setSelectedSubmission(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
