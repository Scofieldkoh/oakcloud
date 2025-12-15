'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Play,
  Archive,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useBulkOperation } from '@/hooks/use-processing-documents';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

type BulkOperation = 'APPROVE' | 'TRIGGER_EXTRACTION' | 'ARCHIVE';

interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  className?: string;
}

const operations: {
  id: BulkOperation;
  label: string;
  icon: typeof CheckCircle;
  description: string;
  variant: 'default' | 'warning' | 'danger';
}[] = [
  {
    id: 'APPROVE',
    label: 'Approve',
    icon: CheckCircle,
    description: 'Approve selected documents with DRAFT revisions',
    variant: 'default',
  },
  {
    id: 'TRIGGER_EXTRACTION',
    label: 'Re-extract',
    icon: Play,
    description: 'Trigger extraction for selected documents',
    variant: 'default',
  },
  {
    id: 'ARCHIVE',
    label: 'Archive',
    icon: Archive,
    description: 'Archive selected documents',
    variant: 'danger',
  },
];

export function BulkActionsToolbar({
  selectedIds,
  onClearSelection,
  className,
}: BulkActionsToolbarProps) {
  const bulkOperation = useBulkOperation();
  const { success, error: toastError } = useToast();

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    operation: BulkOperation | null;
  }>({ isOpen: false, operation: null });

  const handleOperation = (operation: BulkOperation) => {
    setConfirmDialog({ isOpen: true, operation });
  };

  const executeOperation = async () => {
    if (!confirmDialog.operation) return;

    try {
      const result = await bulkOperation.mutateAsync({
        operation: confirmDialog.operation,
        documentIds: selectedIds,
      });

      if (result.summary.succeeded > 0) {
        success(
          `Successfully processed ${result.summary.succeeded} of ${result.summary.total} documents`
        );
      }

      if (result.summary.failed > 0) {
        const failedResults = result.results.filter((r) => !r.success);
        const errorMessages = [...new Set(failedResults.map((r) => r.error))].join(', ');
        toastError(`${result.summary.failed} documents failed: ${errorMessages}`);
      }

      setConfirmDialog({ isOpen: false, operation: null });
      onClearSelection();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to execute bulk operation');
    }
  };

  const currentOp = operations.find((op) => op.id === confirmDialog.operation);

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-40',
          'bg-background-primary border border-border-primary rounded-lg shadow-xl',
          'flex items-center gap-2 px-4 py-3',
          'animate-in slide-in-from-bottom-4',
          className
        )}
      >
        {/* Selection count */}
        <div className="flex items-center gap-2 pr-3 border-r border-border-primary">
          <span className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{selectedIds.length}</span> selected
          </span>
          <button
            onClick={onClearSelection}
            className="btn-ghost btn-xs p-1"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {operations.map((op) => {
            const Icon = op.icon;
            return (
              <button
                key={op.id}
                onClick={() => handleOperation(op.id)}
                disabled={bulkOperation.isPending}
                className={cn(
                  'btn-sm flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors',
                  op.variant === 'danger'
                    ? 'hover:bg-status-error/10 hover:text-status-error text-text-secondary'
                    : op.variant === 'warning'
                    ? 'hover:bg-status-warning/10 hover:text-status-warning text-text-secondary'
                    : 'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary'
                )}
                title={op.description}
              >
                {bulkOperation.isPending && confirmDialog.operation === op.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="text-sm">{op.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, operation: null })}
        onConfirm={executeOperation}
        title={`${currentOp?.label} ${selectedIds.length} Documents`}
        description={
          <div className="space-y-2">
            <p>{currentOp?.description}</p>
            {confirmDialog.operation === 'ARCHIVE' && (
              <div className="flex items-start gap-2 p-2 bg-status-warning/10 rounded text-sm text-status-warning">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Archived documents will be hidden from the list.</span>
              </div>
            )}
          </div>
        }
        confirmLabel={
          bulkOperation.isPending
            ? 'Processing...'
            : `${currentOp?.label} ${selectedIds.length} Documents`
        }
        variant={confirmDialog.operation === 'ARCHIVE' ? 'danger' : 'info'}
        isLoading={bulkOperation.isPending}
      />
    </>
  );
}
