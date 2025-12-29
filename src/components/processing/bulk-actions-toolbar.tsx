'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Play,
  Trash2,
  Download,
  FileSpreadsheet,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useBulkOperation, useBulkDownloadZip, useBulkExport } from '@/hooks/use-processing-documents';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';

type BulkOperation = 'APPROVE' | 'TRIGGER_EXTRACTION' | 'DELETE' | 'DOWNLOAD_ZIP' | 'EXPORT';

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
    id: 'DOWNLOAD_ZIP',
    label: 'Download ZIP',
    icon: Download,
    description: 'Download selected documents as ZIP',
    variant: 'default',
    requiresConfirmation: false,
  },
  {
    id: 'EXPORT',
    label: 'Export Excel',
    icon: FileSpreadsheet,
    description: 'Export selected documents to Excel',
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
  const bulkDownloadZip = useBulkDownloadZip();
  const bulkExport = useBulkExport();
  const { success, error: toastError } = useToast();

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    operation: BulkOperation | null;
  }>({ isOpen: false, operation: null });

  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);

  const handleDownloadZip = async () => {
    setActiveOperationId('DOWNLOAD_ZIP');
    try {
      const blob = await bulkDownloadZip.mutateAsync(selectedIds);

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `documents-${dateStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      success(`Downloaded ${selectedIds.length} document${selectedIds.length > 1 ? 's' : ''} as ZIP`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to download ZIP');
    } finally {
      setActiveOperationId(null);
    }
  };

  const handleExport = async () => {
    setActiveOperationId('EXPORT');
    try {
      const blob = await bulkExport.mutateAsync(selectedIds);

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `export-${dateStr}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      success(`Exported ${selectedIds.length} document${selectedIds.length > 1 ? 's' : ''} to Excel`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setActiveOperationId(null);
    }
  };

  const handleOperation = (operation: BulkOperation) => {
    const op = operations.find((o) => o.id === operation);
    if (op && !op.requiresConfirmation) {
      // Execute immediately without confirmation
      if (operation === 'DOWNLOAD_ZIP') {
        handleDownloadZip();
      } else if (operation === 'EXPORT') {
        handleExport();
      }
      return;
    }
    setConfirmDialog({ isOpen: true, operation });
  };

  const executeOperation = async () => {
    if (!confirmDialog.operation || confirmDialog.operation === 'DOWNLOAD_ZIP' || confirmDialog.operation === 'EXPORT') return;

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
          'fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40',
          'bg-background-primary border border-border-primary rounded-lg shadow-xl',
          'flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3',
          'max-w-[calc(100%-2rem)] sm:max-w-none',
          'animate-in slide-in-from-bottom-4',
          className
        )}
      >
        {/* Selection count */}
        <div className="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-3 border-r border-border-primary">
          <span className="text-xs sm:text-sm text-text-secondary whitespace-nowrap">
            <span className="font-medium text-text-primary">{selectedIds.length}</span>
            <span className="hidden xs:inline"> selected</span>
          </span>
          <button
            onClick={onClearSelection}
            className="btn-ghost btn-xs p-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {operations.map((op) => {
            const Icon = op.icon;
            const isLoading =
              (bulkOperation.isPending && confirmDialog.operation === op.id) ||
              (activeOperationId === op.id);
            const isDisabled = bulkOperation.isPending || activeOperationId !== null;

            return (
              <button
                key={op.id}
                onClick={() => handleOperation(op.id)}
                disabled={isDisabled}
                className={cn(
                  'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors',
                  'min-h-[40px] sm:min-h-0',
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
                <span className="text-xs sm:text-sm hidden sm:inline">{op.label}</span>
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
