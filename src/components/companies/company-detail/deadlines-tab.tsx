'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Wand2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Trash2,
  Save,
} from 'lucide-react';
import { cn, formatDateShort, formatCurrency } from '@/lib/utils';
import {
  useCompanyDeadlines,
  useDeadlineStats,
  useGenerateDeadlines,
  useCompleteDeadline,
  useUpdateDeadline,
  useDeleteDeadline,
} from '@/hooks/use-deadlines';
import { usePermissions } from '@/hooks/use-permissions';
import { DeadlineCompactList } from '@/components/deadlines/deadline-list';
import {
  DeadlineStatusBadge,
  DeadlineCategoryBadge,
  UrgencyIndicator,
} from '@/components/deadlines/deadline-status-badge';
import { RichTextEditor, RichTextDisplay } from '@/components/ui/rich-text-editor';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSession } from '@/hooks/use-auth';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';
import type { DeadlineStatus, DeadlineBillingStatus } from '@/generated/prisma';

const BILLING_STATUS_OPTIONS: Array<{ value: DeadlineBillingStatus; label: string }> = [
  { value: 'NOT_APPLICABLE', label: 'Not Applicable' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'TO_BE_BILLED', label: 'To be billed' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'PAID', label: 'Paid' },
];

const EDITABLE_BILLING_STATUS_OPTIONS = BILLING_STATUS_OPTIONS.filter(
  (option) => option.value !== 'TO_BE_BILLED'
);

const getBillingStatusLabel = (
  status: DeadlineBillingStatus | null,
  deadlineStatus: DeadlineStatus
) => {
  if (!status) return '-';
  if (
    deadlineStatus === 'COMPLETED' &&
    (status === 'TO_BE_BILLED' || status === 'PENDING')
  ) {
    return 'To be billed';
  }
  return BILLING_STATUS_OPTIONS.find((option) => option.value === status)?.label || '-';
};

// ============================================================================
// TYPES
// ============================================================================

interface DeadlinesTabProps {
  companyId: string;
}

// ============================================================================
// DEADLINE DETAIL MODAL
// ============================================================================

interface DeadlineDetailModalProps {
  deadline: DeadlineWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (payload: { billingStatus?: DeadlineBillingStatus; invoiceReference?: string | null }) => void;
  onSaveNotes?: (notes: string) => Promise<void> | void;
  isSavingNotes?: boolean;
  onDelete?: () => void;
  canEdit?: boolean;
}

function DeadlineDetailModal({
  deadline,
  isOpen,
  onClose,
  onComplete,
  onSaveNotes,
  isSavingNotes,
  onDelete,
  canEdit,
}: DeadlineDetailModalProps) {
  if (!deadline) return null;

  const isCompleted = deadline.status === 'COMPLETED';
  const effectiveBillable = deadline.overrideBillable ?? deadline.isBillable;
  const amountToDisplay = deadline.overrideAmount ?? deadline.amount;
  const [billingStatus, setBillingStatus] = useState<DeadlineBillingStatus>('PENDING');
  const [invoiceReference, setInvoiceReference] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    const rawStatus = deadline.billingStatus ?? 'PENDING';
    const normalizedStatus =
      !isCompleted && rawStatus === 'TO_BE_BILLED' ? 'PENDING' : rawStatus;
    const nextStatus = effectiveBillable
      ? normalizedStatus
      : 'NOT_APPLICABLE';
    setBillingStatus(nextStatus);
    setInvoiceReference(deadline.invoiceReference ?? '');
    setNotesValue(deadline.internalNotes ?? '');
    setNotesDirty(false);
  }, [
    deadline.billingStatus,
    deadline.invoiceReference,
    deadline.internalNotes,
    deadline.status,
    effectiveBillable,
    isOpen,
  ]);

  const handleSaveNotes = async () => {
    if (!onSaveNotes) return;
    await onSaveNotes(notesValue);
    setNotesDirty(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={deadline.title} size="lg">
      <ModalBody className="space-y-5">
        {/* Status & Category */}
        <div className="flex flex-wrap items-center gap-2">
          <DeadlineStatusBadge status={deadline.status} />
          <DeadlineCategoryBadge category={deadline.category} />
          <UrgencyIndicator
            dueDate={deadline.statutoryDueDate}
            status={deadline.status}
            extendedDueDate={deadline.extendedDueDate}
          />
        </div>

        {/* Period & Reference */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Period</label>
            <p className="text-sm font-medium text-text-primary">{deadline.periodLabel}</p>
          </div>
          {deadline.referenceCode && (
            <div>
              <label className="label">Reference</label>
              <p className="text-sm text-text-primary">{deadline.referenceCode}</p>
            </div>
          )}
        </div>

        {/* Due Dates */}
        <div className="bg-background-tertiary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-muted" />
              <span className="text-sm text-text-muted">Statutory Due Date</span>
            </div>
            <span
              className={cn(
                'text-sm font-medium',
                deadline.extendedDueDate
                  ? 'line-through text-text-muted'
                  : 'text-text-primary'
              )}
            >
              {formatDateShort(deadline.statutoryDueDate)}
            </span>
          </div>

          {deadline.extendedDueDate && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">Extended Due Date</span>
              </div>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {formatDateShort(deadline.extendedDueDate)}
              </span>
            </div>
          )}

          {deadline.eotReference && (
            <div className="text-xs text-text-muted border-t border-border-default pt-2 mt-2">
              EOT Reference: {deadline.eotReference}
              {deadline.eotNote && <span className="block mt-1">{deadline.eotNote}</span>}
            </div>
          )}
        </div>

        {/* Description */}
        {deadline.description && (
          <div>
            <label className="label">Description</label>
            <p className="text-sm text-text-primary whitespace-pre-wrap">
              {deadline.description}
            </p>
          </div>
        )}

        {/* Billing */}
        <div>
          <label className="label">Billing</label>
          {effectiveBillable ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Amount</label>
                  <p className="text-sm font-medium text-text-primary">
                    {formatCurrency(amountToDisplay, deadline.currency)}
                  </p>
                </div>
                <div>
                  <label className="label">Status</label>
                  {canEdit && !isCompleted ? (
                    <select
                      value={billingStatus}
                      onChange={(event) =>
                        setBillingStatus(event.target.value as DeadlineBillingStatus)
                      }
                      className="input input-sm"
                    >
                      {EDITABLE_BILLING_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-text-primary">
                      {getBillingStatusLabel(billingStatus, deadline.status)}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="label">Invoice Reference</label>
                {canEdit && !isCompleted ? (
                  <input
                    type="text"
                    value={invoiceReference}
                    onChange={(event) => setInvoiceReference(event.target.value)}
                    placeholder="Optional invoice reference"
                    className="input input-sm"
                  />
                ) : (
                  <p className="text-sm text-text-primary">
                    {invoiceReference || '-'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Not billable</p>
          )}
        </div>

        {/* Completion Details */}
        {isCompleted && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Completed
              </span>
            </div>
            {deadline.completedAt && (
              <p className="text-sm text-text-muted">
                Completed on {formatDateShort(deadline.completedAt)}
                {deadline.completedBy &&
                  ` by ${deadline.completedBy.firstName} ${deadline.completedBy.lastName}`}
              </p>
            )}
            {deadline.completionNote && (
              <p className="text-sm text-text-primary mt-2">{deadline.completionNote}</p>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label">Notes</label>
            {canEdit && onSaveNotes && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveNotes}
                disabled={!notesDirty || isSavingNotes}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Notes
              </Button>
            )}
          </div>
          {canEdit ? (
            <RichTextEditor
              value={notesValue}
              onChange={(value) => {
                setNotesValue(value);
                setNotesDirty(true);
              }}
              minHeight={140}
              className="bg-background-secondary"
            />
          ) : (
            <div className="rounded-lg border border-border-primary bg-background-secondary/40 p-3">
              {notesValue ? (
                <RichTextDisplay content={notesValue} />
              ) : (
                <p className="text-sm text-text-muted">No notes yet.</p>
              )}
            </div>
          )}
        </div>

        {/* Assignee */}
        {deadline.assignee && (
          <div>
            <label className="label">Assigned To</label>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-oak-primary/10 text-oak-primary flex items-center justify-center text-xs font-medium">
                {deadline.assignee.firstName[0]}
                {deadline.assignee.lastName[0]}
              </div>
              <span className="text-sm text-text-primary">
                {deadline.assignee.firstName} {deadline.assignee.lastName}
              </span>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {canEdit && onDelete && (
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Deadline
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {canEdit && !isCompleted && (
          <Button
            variant="primary"
            onClick={() =>
              onComplete?.({
                billingStatus: effectiveBillable ? billingStatus : undefined,
                invoiceReference: effectiveBillable
                  ? (invoiceReference.trim() ? invoiceReference.trim() : null)
                  : undefined,
              })
            }
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Mark Complete
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DeadlinesTab({ companyId }: DeadlinesTabProps) {
  const { can } = usePermissions(companyId);
  const canUpdate = can.updateCompany;
  const { data: session } = useSession();

  // Get the active tenant ID (from sidebar selector for Super Admin, or session for others)
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [selectedDeadline, setSelectedDeadline] = useState<DeadlineWithRelations | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Queries
  const statusFilter: DeadlineStatus[] | undefined =
    activeFilter === 'active'
      ? ['PENDING', 'PENDING_CLIENT', 'IN_PROGRESS', 'PENDING_REVIEW']
      : activeFilter === 'completed'
        ? ['COMPLETED']
        : undefined;

  const { data: deadlines, isLoading, error, refetch } = useCompanyDeadlines(companyId, {
    status: statusFilter,
    tenantId: activeTenantId,
  });

  // Use separate stats query for accurate counts
  const { data: stats } = useDeadlineStats(activeTenantId, companyId);

  // Mutations
  const generateDeadlines = useGenerateDeadlines();
  const completeDeadline = useCompleteDeadline(selectedDeadline?.id || '');
  const updateDeadline = useUpdateDeadline(selectedDeadline?.id || '');
  const deleteDeadline = useDeleteDeadline();

  const handleGenerateDeadlines = async () => {
    try {
      await generateDeadlines.mutateAsync({ companyId });
      setShowGenerateConfirm(false);
      refetch();
    } catch {
      // Error handled by mutation
    }
  };

  const handleCompleteDeadline = async (payload?: {
    billingStatus?: DeadlineBillingStatus;
    invoiceReference?: string | null;
  }) => {
    if (!selectedDeadline) return;
    try {
      await completeDeadline.mutateAsync(payload ?? {});
      setSelectedDeadline(null);
      refetch();
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDeadline = async () => {
    if (!selectedDeadline) return;
    try {
      await deleteDeadline.mutateAsync(selectedDeadline.id);
      setShowDeleteConfirm(false);
      setSelectedDeadline(null);
      refetch();
    } catch {
      // Error handled by mutation
    }
  };

  const handleSaveNotes = async (notes: string) => {
    if (!selectedDeadline) return;
    try {
      const updated = await updateDeadline.mutateAsync({ internalNotes: notes });
      setSelectedDeadline(updated);
      refetch();
    } catch {
      // Error handled by mutation
    }
  };

  // Statistics from dedicated stats query (more accurate)
  const activeCount = stats
    ? (stats.byStatus.PENDING || 0)
      + (stats.byStatus.PENDING_CLIENT || 0)
      + (stats.byStatus.IN_PROGRESS || 0)
      + (stats.byStatus.PENDING_REVIEW || 0)
    : 0;
  const completedCount = stats?.byStatus.COMPLETED || 0;
  const overdueCount = stats?.overdue || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-text-primary">Deadlines</h3>
          <p className="text-sm text-text-muted mt-1">
            Compliance deadlines and filing dates
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            aria-label="Refresh"
            iconOnly
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          {canUpdate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowGenerateConfirm(true)}
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Auto-Generate
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-background-secondary rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-text-muted">Active</span>
          </div>
          <p className="text-xl font-semibold text-text-primary mt-1">{activeCount}</p>
        </div>
        <div className="p-3 bg-background-secondary rounded-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-text-muted">Overdue</span>
          </div>
          <p
            className={cn(
              'text-xl font-semibold mt-1',
              overdueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-text-primary'
            )}
          >
            {overdueCount}
          </p>
        </div>
        <div className="p-3 bg-background-secondary rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-text-muted">Completed</span>
          </div>
          <p className="text-xl font-semibold text-text-primary mt-1">{completedCount}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-border-default">
        {(['active', 'completed', 'all'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              activeFilter === filter
                ? 'text-text-primary border-b-2 border-oak-primary -mb-px'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            {filter === 'active' ? 'Active' : filter === 'completed' ? 'Completed' : 'All'}
          </button>
        ))}
      </div>

      {/* Deadline List */}
      {error ? (
        <ErrorState
          error={error}
          message="Failed to load deadlines"
          onRetry={() => refetch()}
          size="md"
        />
      ) : isLoading ? (
        <LoadingState message="Loading deadlines..." size="md" />
      ) : deadlines && deadlines.length > 0 ? (
        <DeadlineCompactList
          deadlines={deadlines}
          onView={setSelectedDeadline}
          showCompany={false}
        />
      ) : (
        <div className="py-12 text-center bg-background-secondary rounded-lg">
          <Clock className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h4 className="text-lg font-medium text-text-primary">No deadlines</h4>
          <p className="text-sm text-text-muted mt-1">
            {activeFilter === 'active'
              ? 'No active deadlines for this company'
              : activeFilter === 'completed'
                ? 'No completed deadlines yet'
                : 'No deadlines found'}
          </p>
          {canUpdate && (
            <div className="flex justify-center mt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowGenerateConfirm(true)}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Deadlines
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Deadline Detail Modal */}
      <DeadlineDetailModal
        deadline={selectedDeadline}
        isOpen={!!selectedDeadline}
        onClose={() => setSelectedDeadline(null)}
        onComplete={handleCompleteDeadline}
        onSaveNotes={handleSaveNotes}
        isSavingNotes={updateDeadline.isPending}
        onDelete={() => setShowDeleteConfirm(true)}
        canEdit={canUpdate}
      />

      {/* Generate Deadlines Confirm Dialog */}
      <ConfirmDialog
        isOpen={showGenerateConfirm}
        onClose={() => setShowGenerateConfirm(false)}
        onConfirm={handleGenerateDeadlines}
        title="Generate Deadlines"
        description="This will automatically generate deadlines based on the company's profile (entity type, financial year end, GST registration, etc.) and applicable compliance templates. Existing deadlines will not be duplicated."
        confirmLabel="Generate"
        isLoading={generateDeadlines.isPending}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteDeadline}
        title="Delete Deadline"
        description="Are you sure you want to delete this deadline? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteDeadline.isPending}
      />
    </div>
  );
}

export default DeadlinesTab;
