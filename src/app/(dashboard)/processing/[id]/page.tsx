'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileText,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Unlock,
  Play,
  FileStack,
  History,
  Copy,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  useProcessingDocument,
  useRevisionHistory,
  useTriggerExtraction,
  useAcquireLock,
  useReleaseLock,
  useApproveRevision,
  useRecordDuplicateDecision,
} from '@/hooks/use-processing-documents';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { PipelineStatus, DuplicateStatus, RevisionStatus, DocumentCategory } from '@prisma/client';
import { cn } from '@/lib/utils';

// Status display configs
const pipelineStatusConfig: Record<
  PipelineStatus,
  { label: string; color: string; bgColor: string }
> = {
  UPLOADED: { label: 'Uploaded', color: 'text-text-secondary', bgColor: 'bg-background-tertiary' },
  QUEUED: { label: 'Queued', color: 'text-status-info', bgColor: 'bg-status-info/10' },
  PROCESSING: { label: 'Processing', color: 'text-status-info', bgColor: 'bg-status-info/10' },
  SPLIT_PENDING: { label: 'Split Pending', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  SPLIT_DONE: { label: 'Split Done', color: 'text-status-success', bgColor: 'bg-status-success/10' },
  EXTRACTION_DONE: { label: 'Extracted', color: 'text-status-success', bgColor: 'bg-status-success/10' },
  FAILED_RETRYABLE: { label: 'Failed (Retry)', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  FAILED_PERMANENT: { label: 'Failed', color: 'text-status-error', bgColor: 'bg-status-error/10' },
  DEAD_LETTER: { label: 'Dead Letter', color: 'text-status-error', bgColor: 'bg-status-error/10' },
};

const duplicateStatusConfig: Record<
  DuplicateStatus,
  { label: string; color: string; bgColor: string }
> = {
  NONE: { label: 'Not Checked', color: 'text-text-muted', bgColor: 'bg-background-tertiary' },
  SUSPECTED: { label: 'Suspected Duplicate', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  CONFIRMED: { label: 'Confirmed Duplicate', color: 'text-status-error', bgColor: 'bg-status-error/10' },
  REJECTED: { label: 'Not Duplicate', color: 'text-status-success', bgColor: 'bg-status-success/10' },
};

const revisionStatusConfig: Record<
  RevisionStatus,
  { label: string; color: string; bgColor: string }
> = {
  DRAFT: { label: 'Draft', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  APPROVED: { label: 'Approved', color: 'text-status-success', bgColor: 'bg-status-success/10' },
  SUPERSEDED: { label: 'Superseded', color: 'text-text-muted', bgColor: 'bg-background-tertiary' },
};

const categoryLabels: Record<DocumentCategory, string> = {
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
  PURCHASE_ORDER: 'Purchase Order',
  STATEMENT: 'Statement',
  OTHER: 'Other',
};

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: string | null, currency: string): string {
  if (!amount) return '-';
  const num = parseFloat(amount);
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: currency || 'SGD',
    minimumFractionDigits: 2,
  }).format(num);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProcessingDocumentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const { can } = usePermissions();

  const { data, isLoading, error, refetch } = useProcessingDocument(id);
  const { data: revisions, isLoading: revisionsLoading } = useRevisionHistory(id);

  const triggerExtraction = useTriggerExtraction();
  const acquireLock = useAcquireLock();
  const releaseLock = useReleaseLock();
  const approveRevision = useApproveRevision();
  const recordDuplicateDecision = useRecordDuplicateDecision();

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateDecision, setDuplicateDecision] = useState<'NOT_DUPLICATE' | 'IS_DUPLICATE' | 'IS_VERSION'>('NOT_DUPLICATE');

  const handleTriggerExtraction = async () => {
    try {
      await triggerExtraction.mutateAsync(id);
      success('Extraction triggered successfully');
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to trigger extraction');
    }
  };

  const handleAcquireLock = async () => {
    if (!data?.document) return;
    try {
      await acquireLock.mutateAsync({ documentId: id, lockVersion: data.document.lockVersion });
      success('Lock acquired');
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to acquire lock');
    }
  };

  const handleReleaseLock = async () => {
    if (!data?.document) return;
    try {
      await releaseLock.mutateAsync({ documentId: id, lockVersion: data.document.lockVersion });
      success('Lock released');
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to release lock');
    }
  };

  const handleApproveRevision = async () => {
    if (!data?.document || !data?.currentRevision) return;
    try {
      await approveRevision.mutateAsync({
        documentId: id,
        revisionId: data.currentRevision.id,
        lockVersion: data.document.lockVersion,
      });
      success('Revision approved');
      setShowApproveDialog(false);
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to approve revision');
    }
  };

  const handleDuplicateDecision = async () => {
    try {
      await recordDuplicateDecision.mutateAsync({
        documentId: id,
        decision: duplicateDecision,
      });
      success('Duplicate decision recorded');
      setShowDuplicateDialog(false);
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to record decision');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-oak-light" />
        <span className="ml-3 text-text-secondary">Loading document...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="card p-6 border-status-error bg-status-error/5">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load document'}</p>
          </div>
          <Link href="/processing" className="btn-secondary btn-sm mt-4 inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  const { document: doc, currentRevision } = data;
  const pipelineConfig = pipelineStatusConfig[doc.pipelineStatus];
  const duplicateConfig = duplicateStatusConfig[doc.duplicateStatus];

  const canTriggerExtraction =
    doc.pipelineStatus === 'UPLOADED' ||
    doc.pipelineStatus === 'FAILED_RETRYABLE';

  const canApprove =
    currentRevision?.status === 'DRAFT' &&
    (doc.duplicateStatus === 'NONE' || doc.duplicateStatus === 'REJECTED');

  const needsDuplicateDecision =
    doc.duplicateStatus === 'SUSPECTED' && currentRevision?.status === 'DRAFT';

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/processing" className="btn-ghost btn-sm p-2">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
              {doc.isContainer ? 'Container Document' : 'Processing Document'}
            </h1>
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium', pipelineConfig.bgColor, pipelineConfig.color)}>
              {pipelineConfig.label}
            </span>
          </div>
          <p className="text-text-secondary text-sm mt-1">
            ID: <span className="font-mono text-xs">{doc.id}</span>
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost btn-sm p-2">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Actions Bar */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {canTriggerExtraction && can.updateDocument && (
            <button
              onClick={handleTriggerExtraction}
              disabled={triggerExtraction.isPending}
              className="btn-primary btn-sm flex items-center gap-2"
            >
              {triggerExtraction.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Trigger Extraction
            </button>
          )}

          {can.updateDocument && (
            <>
              <button
                onClick={handleAcquireLock}
                disabled={acquireLock.isPending}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Acquire Lock
              </button>
              <button
                onClick={handleReleaseLock}
                disabled={releaseLock.isPending}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                Release Lock
              </button>
            </>
          )}

          {needsDuplicateDecision && can.updateDocument && (
            <button
              onClick={() => setShowDuplicateDialog(true)}
              className="btn-secondary btn-sm flex items-center gap-2 border-status-warning text-status-warning"
            >
              <Copy className="w-4 h-4" />
              Resolve Duplicate
            </button>
          )}

          {canApprove && can.updateDocument && (
            <button
              onClick={() => setShowApproveDialog(true)}
              className="btn-primary btn-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Approve Revision
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Document Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Document Details */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Document Details
            </h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-text-muted mb-1">Type</dt>
                <dd className="text-sm text-text-primary">
                  {doc.isContainer ? 'Container' : 'Child Document'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted mb-1">Pages</dt>
                <dd className="text-sm text-text-primary">
                  {doc.isContainer
                    ? `${doc.pages} pages`
                    : doc.pageFrom && doc.pageTo
                    ? `${doc.pageFrom} - ${doc.pageTo}`
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted mb-1">Pipeline Status</dt>
                <dd>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', pipelineConfig.bgColor, pipelineConfig.color)}>
                    {pipelineConfig.label}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted mb-1">Duplicate Status</dt>
                <dd>
                  <span className={cn('px-2 py-0.5 rounded text-xs font-medium', duplicateConfig.bgColor, duplicateConfig.color)}>
                    {duplicateConfig.label}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted mb-1">Lock Version</dt>
                <dd className="text-sm font-mono text-text-primary">{doc.lockVersion}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted mb-1">Created</dt>
                <dd className="text-sm text-text-primary">{formatDateTime(doc.createdAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Current Revision */}
          {currentRevision && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <FileStack className="w-5 h-5" />
                Current Revision #{currentRevision.revisionNumber}
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium ml-auto',
                    revisionStatusConfig[currentRevision.status].bgColor,
                    revisionStatusConfig[currentRevision.status].color
                  )}
                >
                  {revisionStatusConfig[currentRevision.status].label}
                </span>
              </h2>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs text-text-muted mb-1">Category</dt>
                  <dd className="text-sm text-text-primary">
                    {currentRevision.documentCategory
                      ? categoryLabels[currentRevision.documentCategory]
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Vendor</dt>
                  <dd className="text-sm text-text-primary">
                    {currentRevision.vendorName || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Document Number</dt>
                  <dd className="text-sm font-mono text-text-primary">
                    {currentRevision.documentNumber || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Document Date</dt>
                  <dd className="text-sm text-text-primary">
                    {formatDate(currentRevision.documentDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Total Amount</dt>
                  <dd className="text-sm font-mono text-text-primary">
                    {formatCurrency(currentRevision.totalAmount, currentRevision.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Home Equivalent</dt>
                  <dd className="text-sm font-mono text-text-primary">
                    {currentRevision.homeEquivalent
                      ? formatCurrency(currentRevision.homeEquivalent, 'SGD')
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Validation</dt>
                  <dd className="text-sm text-text-primary">
                    {currentRevision.validationStatus}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted mb-1">Line Items</dt>
                  <dd className="text-sm text-text-primary">
                    {currentRevision.lineItemCount} items
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Right Column - Revision History */}
        <div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <History className="w-5 h-5" />
              Revision History
            </h2>
            {revisionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-4 h-4 animate-spin text-text-muted" />
              </div>
            ) : revisions && revisions.length > 0 ? (
              <div className="space-y-3">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className={cn(
                      'p-3 rounded border',
                      rev.status === 'APPROVED'
                        ? 'border-status-success/30 bg-status-success/5'
                        : rev.status === 'DRAFT'
                        ? 'border-status-warning/30 bg-status-warning/5'
                        : 'border-border-primary bg-background-tertiary'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-text-primary">
                        Revision #{rev.revisionNumber}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          revisionStatusConfig[rev.status].bgColor,
                          revisionStatusConfig[rev.status].color
                        )}
                      >
                        {revisionStatusConfig[rev.status].label}
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary space-y-1">
                      <p>Type: {rev.revisionType}</p>
                      <p>Vendor: {rev.vendorName || '-'}</p>
                      <p>Amount: {formatCurrency(rev.totalAmount, rev.currency)}</p>
                      <p>Created: {formatDateTime(rev.createdAt)}</p>
                      {rev.approvedAt && (
                        <p className="text-status-success">
                          Approved: {formatDateTime(rev.approvedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">No revisions yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Approve Dialog */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        onClose={() => setShowApproveDialog(false)}
        onConfirm={handleApproveRevision}
        title="Approve Revision"
        description={`Are you sure you want to approve Revision #${currentRevision?.revisionNumber}? This will mark it as the official record.`}
        confirmLabel="Approve"
        variant="info"
        isLoading={approveRevision.isPending}
      />

      {/* Duplicate Decision Dialog */}
      {showDuplicateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Resolve Duplicate Status</h3>
            <p className="text-text-secondary text-sm mb-4">
              This document has been flagged as a potential duplicate. Please review and confirm.
            </p>
            <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 p-3 rounded border border-border-primary hover:bg-background-tertiary cursor-pointer">
                <input
                  type="radio"
                  name="duplicateDecision"
                  value="NOT_DUPLICATE"
                  checked={duplicateDecision === 'NOT_DUPLICATE'}
                  onChange={() => setDuplicateDecision('NOT_DUPLICATE')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-text-primary">Not a duplicate - unique document</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded border border-border-primary hover:bg-background-tertiary cursor-pointer">
                <input
                  type="radio"
                  name="duplicateDecision"
                  value="IS_DUPLICATE"
                  checked={duplicateDecision === 'IS_DUPLICATE'}
                  onChange={() => setDuplicateDecision('IS_DUPLICATE')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-text-primary">Confirmed duplicate - do not process</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded border border-border-primary hover:bg-background-tertiary cursor-pointer">
                <input
                  type="radio"
                  name="duplicateDecision"
                  value="IS_VERSION"
                  checked={duplicateDecision === 'IS_VERSION'}
                  onChange={() => setDuplicateDecision('IS_VERSION')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-text-primary">Version update - replaces previous</span>
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDuplicateDialog(false)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateDecision}
                disabled={recordDuplicateDecision.isPending}
                className="btn-primary btn-sm"
              >
                {recordDuplicateDecision.isPending ? 'Saving...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
