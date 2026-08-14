'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { A4PageEditor } from '@/components/documents/a4-page-editor';
import type { A4DocumentLayout } from '@/components/documents/a4-pagination/layout';
import { cn } from '@/lib/utils';
import type { EditableBatchItem } from './batch-workspace-state';
import { BatchDocumentQueue, ITEM_STATUS_LABELS } from './batch-document-queue';
import {
  completenessFor,
  hasManualEdits,
  isPreviewStale,
  type CompletenessMap,
  type GenerationBlocker,
} from './batch-completeness';

export interface BatchReviewWorkspaceProps {
  items: EditableBatchItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void;
  onPreview: (itemId: string, replaceEditedContent?: boolean) => void | Promise<void>;
  onReview: (itemId: string) => void | Promise<void>;
  onEditContent: (itemId: string, content: string | null, json: unknown) => void;
  pending?: boolean;
  layout?: A4DocumentLayout;
  completeness?: CompletenessMap;
  /** Documents preventing generation, rendered as jump-to links. */
  blockers?: GenerationBlocker[];
  /** Auto-preview progress while the stage renders missing previews. */
  previewProgress?: { done: number; total: number } | null;
}

function A4Skeleton({ label }: { label: string }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-border-primary bg-background-secondary"
      role="status"
    >
      <div className="w-full max-w-[520px] space-y-3 rounded bg-background-primary p-8 shadow-sm">
        <div className="h-6 w-2/3 animate-pulse rounded bg-background-tertiary" />
        <div className="h-3 w-full animate-pulse rounded bg-background-tertiary" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-background-tertiary" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-background-tertiary" />
        <div className="h-3 w-full animate-pulse rounded bg-background-tertiary" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-background-tertiary" />
      </div>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}

export function BatchReviewWorkspace({
  items,
  activeItemId,
  onSelect,
  onPreview,
  onReview,
  onEditContent,
  pending = false,
  layout,
  completeness,
  blockers = [],
  previewProgress = null,
}: BatchReviewWorkspaceProps) {
  const [replaceDialogItemId, setReplaceDialogItemId] = useState<string | null>(null);
  const activeItem = items.find((item) => item.key === activeItemId) ?? items[0] ?? null;
  const rendering = previewProgress !== null && previewProgress.done < previewProgress.total;

  const requestRefresh = (item: EditableBatchItem) => {
    if (hasManualEdits(item)) {
      setReplaceDialogItemId(item.key);
      return;
    }
    void onPreview(item.key);
  };

  const selectNextUnapproved = () => {
    const next = items.find(
      (item) => item.status !== 'GENERATED' && !item.reviewedFingerprint,
    );
    if (next) onSelect(next.key);
  };

  const activeCompleteness = completenessFor(completeness ?? {}, activeItem?.key);
  const stale = activeItem ? isPreviewStale(activeItem) : false;
  const approved = Boolean(activeItem?.reviewedFingerprint);
  const generated = activeItem?.status === 'GENERATED';
  const diagnostics = activeItem?.validationDiagnostics;
  const diagnosticCount = diagnostics
    ? diagnostics.errors.length + diagnostics.fieldErrors.length
    : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-3">
        <BatchDocumentQueue
          items={items}
          activeItemId={activeItem?.key ?? null}
          onSelect={onSelect}
          completeness={completeness}
          mode="review"
          onNextIncomplete={selectNextUnapproved}
        />

        {rendering && previewProgress && (
          <div
            className="rounded-lg border border-border-primary bg-background-secondary p-3"
            role="status"
          >
            <p className="text-xs font-medium text-text-primary">
              Rendering previews {previewProgress.done} of {previewProgress.total}
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-background-tertiary"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={previewProgress.total}
              aria-valuenow={previewProgress.done}
            >
              <div
                className="h-full rounded-full bg-oak-primary transition-all"
                style={{
                  width: `${Math.round((previewProgress.done / Math.max(1, previewProgress.total)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {blockers.length > 0 && (
          <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-status-warning">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {blockers.length} document{blockers.length === 1 ? '' : 's'} not ready
            </p>
            <ul className="mt-2 space-y-1">
              {blockers.map((blocker) => (
                <li key={blocker.itemKey}>
                  <button
                    type="button"
                    onClick={() => onSelect(blocker.itemKey)}
                    className="flex min-h-9 w-full flex-col rounded px-1 text-left transition-colors hover:bg-status-warning/10"
                  >
                    <span className="truncate text-xs font-medium text-text-primary">
                      {blocker.title}
                    </span>
                    <span className="text-xs text-text-muted">{blocker.reason}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="min-w-0">
        {activeItem ? (
          <section
            aria-label={`Review ${activeItem.templateName}`}
            className="flex min-w-0 flex-col gap-3"
          >
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-text-primary">
                  {activeItem.configuration.title || activeItem.templateName}
                </h2>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                  <span>{activeItem.templateName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{ITEM_STATUS_LABELS[activeItem.status]}</span>
                  {approved && !generated && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-medium text-status-success">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Approved
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!generated && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => requestRefresh(activeItem)}
                    disabled={pending}
                    leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  >
                    Refresh preview
                  </Button>
                )}
                {!generated && !approved && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void onReview(activeItem.key)}
                    disabled={
                      pending
                      || stale
                      || !activeItem.previewContent
                      || !activeCompleteness.isComplete
                    }
                    title={
                      !activeCompleteness.isComplete
                        ? `${activeCompleteness.missing.length} required value(s) missing`
                        : stale
                          ? 'Refresh the preview before approving'
                          : !activeItem.previewContent
                            ? 'Render a preview before approving'
                            : undefined
                    }
                    leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                  >
                    Approve for generation
                  </Button>
                )}
              </div>
            </header>

            {!activeCompleteness.isComplete && (
              <div
                className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-3"
                role="alert"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium text-status-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Missing required values
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {activeCompleteness.missing.map((entry) => entry.label).join(', ')}.
                  Go back to Configure to fill them in.
                </p>
              </div>
            )}

            {stale && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-warning/40 bg-status-warning/5 p-3"
                role="alert"
              >
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-status-warning">Preview is out of date.</span>
                  {' '}It no longer matches the saved configuration.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => requestRefresh(activeItem)}
                  disabled={pending}
                  leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                >
                  Refresh preview
                </Button>
              </div>
            )}

            {diagnosticCount > 0 && (
              <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3" role="alert">
                <p className="flex items-center gap-1.5 text-sm font-medium text-status-error">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Needs attention
                </p>
                <ul className="mt-1 list-inside list-disc text-sm text-text-secondary">
                  {diagnostics?.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                  {diagnostics?.fieldErrors.map((error) => (
                    <li key={`${error.field}-${error.message}`}>
                      {error.field}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {approved && !generated && (
              <p className="flex items-center gap-1.5 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2 text-xs text-text-secondary">
                <Lock className="h-3.5 w-3.5 shrink-0 text-status-success" aria-hidden="true" />
                Approved for generation. Editing the content below clears the
                approval so you can review the change.
              </p>
            )}

            <div
              className={cn(
                'overflow-hidden rounded-lg border border-border-primary shadow-sm',
                'h-[min(70vh,900px)] min-h-[26rem]',
              )}
            >
              {activeItem.previewContent ? (
                <A4PageEditor
                  value={activeItem.editedContent ?? activeItem.previewContent ?? ''}
                  onChange={(html) => onEditContent(activeItem.key, html, null)}
                  onLayoutChange={(nextLayout) => onEditContent(
                    activeItem.key,
                    activeItem.editedContent ?? activeItem.previewContent ?? '',
                    { version: 1, layout: nextLayout },
                  )}
                  readOnly={generated}
                  layout={layout}
                />
              ) : pending || rendering ? (
                <A4Skeleton label="Rendering this document…" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                  <FileText className="h-6 w-6 text-text-muted" aria-hidden="true" />
                  <p className="text-sm text-text-secondary">
                    No preview yet. Render it to see the merged document.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void onPreview(activeItem.key)}
                    disabled={pending}
                  >
                    Render preview
                  </Button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="rounded-lg border border-dashed border-border-primary p-8 text-center text-sm text-text-muted">
            Select a document from the queue to review it.
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={replaceDialogItemId !== null}
        onClose={() => setReplaceDialogItemId(null)}
        onConfirm={() => {
          if (replaceDialogItemId) {
            void onPreview(replaceDialogItemId, true);
          }
          setReplaceDialogItemId(null);
        }}
        title="Replace manual edits?"
        description="Refreshing this preview will replace the manual edits you made to this document. Continue?"
        confirmLabel="Replace edits"
        variant="warning"
      />
    </div>
  );
}
