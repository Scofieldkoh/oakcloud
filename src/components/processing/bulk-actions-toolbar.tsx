'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Play,
  Trash2,
  Download,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useBulkOperation, useBulkDownload } from '@/hooks/use-processing-documents';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

type BulkOperation = 'APPROVE' | 'TRIGGER_EXTRACTION' | 'DELETE' | 'DOWNLOAD';

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
  requiresConfirmation: boolean;
}[] = [
  {
    id: 'DOWNLOAD',
    label: 'Download',
    icon: Download,
    description: 'Download selected documents',
    variant: 'default',
    requiresConfirmation: false,
  },
  {
    id: 'APPROVE',
    label: 'Approve',
    icon: CheckCircle,
    description: 'Approve selected documents with DRAFT revisions',
    variant: 'default',
    requiresConfirmation: true,
  },
  {
    id: 'TRIGGER_EXTRACTION',
    label: 'Re-extract',
    icon: Play,
    description: 'Trigger extraction for selected documents',
    variant: 'default',
    requiresConfirmation: true,
  },
  {
    id: 'DELETE',
    label: 'Delete',
    icon: Trash2,
    description: 'Delete selected documents',
    variant: 'danger',
    requiresConfirmation: true,
  },
];

export function BulkActionsToolbar({
  selectedIds,
  onClearSelection,
  className,
}: BulkActionsToolbarProps) {
  const bulkOperation = useBulkOperation();
  const bulkDownload = useBulkDownload();
  const { success, error: toastError } = useToast();

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    operation: BulkOperation | null;
  }>({ isOpen: false, operation: null });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloadingId('DOWNLOAD');
    try {
      const result = await bulkDownload.mutateAsync(selectedIds);

      if (result.downloads.length === 0) {
        toastError('No documents available for download');
        return;
      }

      // Download files sequentially with small delays to avoid browser blocking
      for (let i = 0; i < result.downloads.length; i++) {
        const download = result.downloads[i];

        // Create a temporary link and trigger download
        const link = document.createElement('a');
        link.href = download.downloadUrl;
        link.download = download.fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Small delay between downloads to prevent browser blocking
        if (i < result.downloads.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      success(`Downloaded ${result.downloads.length} document${result.downloads.length > 1 ? 's' : ''}`);

      if (result.errors.length > 0) {
        toastError(`${result.errors.length} document(s) could not be downloaded`);
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to download documents');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOperation = (operation: BulkOperation) => {
    const op = operations.find((o) => o.id === operation);
    if (op && !op.requiresConfirmation) {
      // Execute immediately without confirmation
      if (operation === 'DOWNLOAD') {
        handleDownload();
      }
      return;
    }
    setConfirmDialog({ isOpen: true, operation });
  };

  const executeOperation = async () => {
    if (!confirmDialog.operation || confirmDialog.operation === 'DOWNLOAD') return;

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
            const isLoading =
              (bulkOperation.isPending && confirmDialog.operation === op.id) ||
              (downloadingId === op.id);
            const isDisabled = bulkOperation.isPending || downloadingId !== null;

            return (
              <button
                key={op.id}
                onClick={() => handleOperation(op.id)}
                disabled={isDisabled}
                className={cn(
                  'btn-sm flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors',
                  op.variant === 'danger'
                    ? 'hover:bg-status-error/10 hover:text-status-error text-text-secondary'
                    : op.variant === 'warning'
                    ? 'hover:bg-status-warning/10 hover:text-status-warning text-text-secondary'
                    : 'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )}
                title={op.description}
              >
                {isLoading ? (
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
            {confirmDialog.operation === 'DELETE' && (
              <div className="flex items-start gap-2 p-2 bg-status-warning/10 rounded text-sm text-status-warning">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Deleted documents can be restored from Data Purge.</span>
              </div>
            )}
          </div>
        }
        confirmLabel={
          bulkOperation.isPending
            ? 'Processing...'
            : `${currentOp?.label} ${selectedIds.length} Documents`
        }
        variant={confirmDialog.operation === 'DELETE' ? 'danger' : 'info'}
        isLoading={bulkOperation.isPending}
      />
    </>
  );
}
