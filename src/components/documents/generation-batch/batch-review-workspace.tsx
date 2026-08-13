'use client';

import { useState } from 'react';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { A4PageEditor } from '@/components/documents/a4-page-editor';
import type { A4DocumentLayout } from '@/components/documents/a4-pagination/layout';
import type { EditableBatchItem } from './batch-workspace-state';
import { BatchDocumentQueue, ITEM_STATUS_LABELS } from './batch-document-queue';

export interface BatchReviewWorkspaceProps {
  items: EditableBatchItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void;
  onPreview: (itemId: string, replaceEditedContent?: boolean) => void | Promise<void>;
  onReview: (itemId: string) => void | Promise<void>;
  onEditContent: (itemId: string, content: string | null, json: unknown) => void;
  onGenerateAll: () => void | Promise<void>;
  canGenerate: boolean;
  pending?: boolean;
  layout?: A4DocumentLayout;
}

function isStale(item: EditableBatchItem): boolean {
  return Boolean(item.previewContent && !item.previewFingerprint);
}

function hasManualEdits(item: EditableBatchItem): boolean {
  return Boolean(item.editedContent && item.editedContent !== item.previewContent);
}

export function BatchReviewWorkspace({
  items,
  activeItemId,
  onSelect,
  onPreview,
  onReview,
  onEditContent,
  onGenerateAll,
  canGenerate,
  pending = false,
  layout,
}: BatchReviewWorkspaceProps) {
  const [replaceDialogItemId, setReplaceDialogItemId] = useState<string | null>(null);
  const activeItem = items.find((item) => item.key === activeItemId) ?? items[0] ?? null;
  const unreviewedCount = items.filter((item) =>
    item.status !== 'GENERATED' && !item.reviewedFingerprint).length;

  const requestRefresh = (item: EditableBatchItem) => {
    if (hasManualEdits(item)) {
      setReplaceDialogItemId(item.key);
      return;
    }
    void onPreview(item.key);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <BatchDocumentQueue items={items} activeItemId={activeItem?.key ?? null} onSelect={onSelect} />
      <div className="space-y-4">
        {activeItem ? (
          <section aria-label={`Review ${activeItem.templateName}`} className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  {activeItem.configuration.title || activeItem.templateName}
                </h2>
                <p className="text-xs text-text-muted">
                  {activeItem.templateName} · {ITEM_STATUS_LABELS[activeItem.status]}
                  {isStale(activeItem) ? ' · Preview is stale' : ''}
                  {activeItem.reviewedFingerprint ? ' · Reviewed' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeItem.status !== 'GENERATED' && (
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
                {activeItem.status !== 'GENERATED' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void onReview(activeItem.key)}
                    disabled={pending || isStale(activeItem) || !activeItem.previewContent
                      || Boolean(activeItem.reviewedFingerprint)}
                    leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                  >
                    {activeItem.reviewedFingerprint ? 'Reviewed' : 'Approve for generation'}
                  </Button>
                )}
              </div>
            </header>

            {(activeItem.validationDiagnostics?.errors.length ?? 0) > 0
              || (activeItem.validationDiagnostics?.fieldErrors.length ?? 0) > 0 ? (
              <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3" role="alert">
                <p className="text-sm font-medium text-status-error">Needs attention</p>
                <ul className="mt-1 list-inside list-disc text-sm text-text-secondary">
                  {activeItem.validationDiagnostics?.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                  {activeItem.validationDiagnostics?.fieldErrors.map((error) => (
                    <li key={`${error.field}-${error.message}`}>
                      {error.field}: {error.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeItem.previewContent ? (
              <div className="h-[calc(100vh-18rem)] min-h-[28rem] overflow-hidden rounded-lg border border-border-primary shadow-sm">
                <A4PageEditor
                  value={activeItem.editedContent ?? activeItem.previewContent ?? ''}
                  onChange={(html) => onEditContent(activeItem.key, html, null)}
                  onLayoutChange={(nextLayout) => onEditContent(
                    activeItem.key,
                    activeItem.editedContent ?? activeItem.previewContent ?? '',
                    { version: 1, layout: nextLayout },
                  )}
                  readOnly={activeItem.status === 'GENERATED'}
                  layout={layout}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-primary p-8 text-center">
                <Sparkles className="h-6 w-6 text-text-muted" aria-hidden="true" />
                <p className="text-sm text-text-secondary">
                  No preview yet. Refresh the preview to render this document.
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
          </section>
        ) : (
          <div className="rounded-lg border border-dashed border-border-primary p-8 text-center text-sm text-text-muted">
            Select a document from the queue to review it.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-secondary pt-4">
          <p className="text-sm text-text-secondary" aria-live="polite">
            {unreviewedCount === 0
              ? 'Every remaining document is reviewed.'
              : `${unreviewedCount} document${unreviewedCount === 1 ? '' : 's'} still need${unreviewedCount === 1 ? 's' : ''} review`}
          </p>
          <Button
            variant="primary"
            onClick={() => void onGenerateAll()}
            disabled={!canGenerate || pending}
          >
            Generate All
          </Button>
        </div>
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
