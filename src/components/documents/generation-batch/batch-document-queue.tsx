'use client';

import { cn } from '@/lib/utils';
import type { BatchItemStatus } from '@/types/document-generation-batch';
import type { EditableBatchItem } from './batch-workspace-state';

export const ITEM_STATUS_LABELS: Record<BatchItemStatus, string> = {
  NOT_STARTED: 'Not started',
  NEEDS_INPUT: 'Needs input',
  PREVIEWED: 'Awaiting review',
  READY: 'Ready',
  GENERATING: 'Generating',
  GENERATED: 'Generated',
  FAILED: 'Failed',
  BLOCKED: 'Blocked',
};

export interface BatchDocumentQueueProps {
  items: EditableBatchItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void;
  disabled?: boolean;
}

export function BatchDocumentQueue({
  items,
  activeItemId,
  onSelect,
  disabled = false,
}: BatchDocumentQueueProps) {
  return (
    <nav aria-label="Document queue" className="space-y-1">
      <h2 className="px-1 text-xs font-medium text-text-secondary">Document queue</h2>
      <ul className="space-y-1">
        {items.map((item) => {
          const active = item.key === activeItemId;
          const reviewed = Boolean(item.reviewedFingerprint);
          const errorCount = item.validationDiagnostics
            ? item.validationDiagnostics.errors.length
              + item.validationDiagnostics.fieldErrors.length
            : 0;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                disabled={disabled}
                aria-pressed={active}
                aria-label={`Configure ${item.templateName}`}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-oak-primary bg-oak-primary/5'
                    : reviewed
                      ? 'border-status-success/40 bg-status-success/10'
                      : 'border-border-primary bg-background-primary hover:bg-background-tertiary',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {item.configuration.title || item.templateName}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {item.templateName}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    item.status === 'GENERATED' && 'bg-status-success/10 text-status-success',
                    item.status === 'FAILED' && 'bg-status-error/10 text-status-error',
                    item.status === 'BLOCKED' && 'bg-status-warning/10 text-status-warning',
                    item.status === 'GENERATING' && 'bg-oak-primary/10 text-oak-primary',
                    item.status === 'READY' && 'bg-status-success/10 text-status-success',
                    (item.status === 'PREVIEWED'
                      || item.status === 'NEEDS_INPUT'
                      || item.status === 'NOT_STARTED') && 'bg-background-tertiary text-text-secondary',
                  )}
                >
                  {ITEM_STATUS_LABELS[item.status]}
                </span>
                {errorCount > 0 && (
                  <span className="shrink-0 text-xs font-medium text-status-error" aria-label={`${errorCount} errors`}>
                    {errorCount} error{errorCount === 1 ? '' : 's'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
