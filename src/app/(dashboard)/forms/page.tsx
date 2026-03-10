'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCopy,
  Copy,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import {
  useCreateForm,
  useDeleteForm,
  useDuplicateForm,
  useForms,
  useFormsWithWarnings,
  useRecentFormSubmissions,
} from '@/hooks/use-forms';
import type { FormStatus } from '@/generated/prisma';

const PAGE_SIZE = 20;

function formatRelativeTime(value: string): string {
  const now = Date.now();
  const then = new Date(value).getTime();
  const diff = Math.max(0, now - then);

  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default function FormsPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<FormStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');

  const { data, isLoading, error } = useForms({
    query: query || undefined,
    status,
    page,
    limit: PAGE_SIZE,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const {
    data: recentSubmissions,
    isLoading: isRecentLoading,
    error: recentError,
  } = useRecentFormSubmissions(8);
  const {
    data: warningForms,
    isLoading: isWarningLoading,
    error: warningError,
  } = useFormsWithWarnings(8);

  const createForm = useCreateForm();
  const duplicateForm = useDuplicateForm();
  const deleteForm = useDeleteForm();

  const statusValue = status ?? '';

  const tags = useMemo(
    () => tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tagsText]
  );

  async function handleCreate() {
    try {
      if (!title.trim()) {
        showError('Title is required');
        return;
      }

      const created = await createForm.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        tags,
        status: 'DRAFT',
      });

      success('Form created');
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setTagsText('');
      router.push(`/forms/${created.id}/builder`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create form');
    }
  }

  async function handleCopyPublicLink(slug: string) {
    try {
      const origin = window.location.origin;
      const link = `${origin}/forms/f/${slug}`;
      await navigator.clipboard.writeText(link);
      success('Public link copied');
    } catch {
      showError('Failed to copy link');
    }
  }

  async function handleCopyEmbedCode(slug: string) {
    try {
      const origin = window.location.origin;
      const code = `<iframe src="${origin}/forms/f/${slug}?embed=1" width="100%" height="900" frameborder="0"></iframe>`;
      await navigator.clipboard.writeText(code);
      success('Embed code copied');
    } catch {
      showError('Failed to copy embed code');
    }
  }

  async function handleDuplicate(formId: string) {
    try {
      const duplicated = await duplicateForm.mutateAsync({ id: formId });
      success('Form duplicated');
      router.push(`/forms/${duplicated.id}/builder`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to duplicate form');
    }
  }

  async function handleDelete(formId: string) {
    if (!window.confirm('Are you sure you want to archive this form? It will no longer be accessible.')) return;
    try {
      await deleteForm.mutateAsync({ id: formId, reason: 'Removed from forms list' });
      success('Form archived');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to archive form');
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Forms</h1>
          <p className="text-sm text-text-secondary mt-1">
            Build multi-step forms, collect responses, and publish public links.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateOpen(true)}
          disabled={session?.isSuperAdmin && !activeTenantId}
        >
          New Form
        </Button>
      </div>

      {session?.isSuperAdmin && !activeTenantId && (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Select a tenant from the sidebar to access forms.
          </p>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-border-primary bg-background-elevated p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <label htmlFor="forms-search" className="sr-only">Search forms</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              id="forms-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search form title..."
              className="w-full rounded-lg border border-border-primary bg-background-primary px-9 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-oak-primary"
            />
          </div>

          <div>
            <label htmlFor="forms-status" className="sr-only">Filter by status</label>
            <select
              id="forms-status"
              value={statusValue}
              onChange={(e) => {
                const value = e.target.value as FormStatus | '';
                setStatus(value || undefined);
                setPage(1);
              }}
              className="rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-oak-primary"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error instanceof Error ? error.message : 'Failed to load forms'}
        </div>
      )}

      <div className="space-y-3">
        {isLoading && Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="h-24 rounded-lg border border-border-primary bg-background-elevated animate-pulse"
          />
        ))}

        {!isLoading && data?.forms.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-primary bg-background-elevated p-8 text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-background-tertiary flex items-center justify-center">
              <FileText className="w-6 h-6 text-text-muted" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">No forms yet</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Create your first form to start collecting submissions.
            </p>
          </div>
        )}

        {!isLoading && data?.forms.map((form) => (
          <div
            key={form.id}
            className="rounded-lg border border-border-primary bg-background-elevated p-4 transition-colors hover:border-border-secondary"
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/forms/${form.id}`}
                  className="block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-base font-semibold text-text-primary hover:text-oak-light">
                      {form.title}
                    </span>
                    <span className="rounded px-2 py-0.5 text-2xs font-medium bg-background-tertiary text-text-secondary uppercase">
                      {form.status.toLowerCase()}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-text-muted">
                    {form.fieldCount} fields | {form.responseCount} responses | {form.conversionRate}% conversion
                  </p>
                </Link>
              </div>

              <div className="flex items-center gap-1.5">
                {(() => {
                  const isPublished = form.status === 'PUBLISHED';
                  return (
                    <>
                <Tooltip content="Show responses">
                  <Link
                    href={`/forms/${form.id}/responses`}
                    className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                    aria-label="Show responses"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                </Tooltip>

                <Tooltip content="Duplicate form">
                  <button
                    type="button"
                    className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                    aria-label="Duplicate form"
                    onClick={() => handleDuplicate(form.id)}
                    disabled={duplicateForm.isPending}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </Tooltip>

                <Tooltip content="Copy public link">
                  <button
                    type="button"
                    className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Copy public link"
                    onClick={() => handleCopyPublicLink(form.slug)}
                    disabled={!isPublished}
                  >
                    <ClipboardCopy className="w-4 h-4" />
                  </button>
                </Tooltip>

                <Tooltip content="Copy embed code">
                  <button
                    type="button"
                    className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Copy embed code"
                    onClick={() => handleCopyEmbedCode(form.slug)}
                    disabled={!isPublished}
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                </Tooltip>

                <Tooltip content="Edit form">
                  <Link
                    href={`/forms/${form.id}/builder`}
                    className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                    aria-label="Edit form"
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                </Tooltip>

                <Tooltip content="Archive form">
                  <button
                    type="button"
                    className="rounded p-2 text-text-secondary hover:bg-background-tertiary hover:text-status-error"
                    aria-label="Archive form"
                    onClick={() => handleDelete(form.id)}
                    disabled={deleteForm.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Tooltip>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={setPage}
            showPageSize={false}
          />
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary">Forms with warnings</h2>
        <div className="mt-3 rounded-lg border border-border-primary bg-background-elevated">
          {isWarningLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-12 animate-pulse rounded bg-background-tertiary" />
              ))}
            </div>
          )}

          {!isWarningLoading && warningError && (
            <div className="px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {warningError instanceof Error ? warningError.message : 'Failed to load forms with warnings'}
            </div>
          )}

          {!isWarningLoading && !warningError && (warningForms?.length || 0) === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">
              No forms with active warnings.
            </div>
          )}

          {!isWarningLoading && !warningError && (warningForms?.length || 0) > 0 && (
            <div className="divide-y divide-border-primary">
              {warningForms?.map((form) => (
                <button
                  key={form.formId}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-background-primary"
                  onClick={() => router.push(`/forms/${form.formId}/responses/${form.latestSubmissionId}`)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" aria-hidden="true" />
                      <div className="truncate text-sm font-medium text-text-primary">{form.formTitle}</div>
                      <span className="rounded bg-status-warning/10 px-2 py-0.5 text-2xs font-medium text-status-warning">
                        {form.warningCount} warning{form.warningCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-text-secondary">
                      Latest flagged submission {formatRelativeTime(form.latestSubmittedAt)}
                    </div>
                  </div>
                  <div className="ml-4 whitespace-nowrap text-xs text-text-muted">
                    Review
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary">Most recently completed</h2>
        <div className="mt-3 rounded-lg border border-border-primary bg-background-elevated">
          {isRecentLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-12 animate-pulse rounded bg-background-tertiary" />
              ))}
            </div>
          )}

          {!isRecentLoading && recentError && (
            <div className="px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {recentError instanceof Error ? recentError.message : 'Failed to load recent submissions'}
            </div>
          )}

          {!isRecentLoading && !recentError && (recentSubmissions?.length || 0) === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-secondary">
              No recent submissions yet.
            </div>
          )}

          {!isRecentLoading && !recentError && (recentSubmissions?.length || 0) > 0 && (
            <div className="divide-y divide-border-primary">
              {recentSubmissions?.map((submission) => (
                <button
                  key={submission.id}
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-background-primary"
                  onClick={() => router.push(`/forms/${submission.formId}/responses/${submission.id}`)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">{submission.formTitle}</div>
                    <div className="mt-0.5 truncate text-xs text-text-secondary">
                      {submission.respondentName || submission.respondentEmail || 'Anonymous respondent'}
                    </div>
                  </div>
                  <div className="ml-4 inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-text-muted">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatRelativeTime(submission.submittedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create form"
        description="Start with a blank draft and build fields in the editor."
        size="md"
      >
        <ModalBody className="space-y-4">
          <FormInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Client Intake Form"
            required
          />

          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional form description"
              className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-oak-primary min-h-24"
            />
          </div>

          <FormInput
            label="Tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="intake, registration"
            hint="Comma-separated"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            isLoading={createForm.isPending}
          >
            Create
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
