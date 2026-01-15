'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  RefreshCw,
  Wand2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCompanyDeadlines,
  useGenerateDeadlines,
  useCompleteDeadline,
  useDeleteDeadline,
} from '@/hooks/use-deadlines';
import { usePermissions } from '@/hooks/use-permissions';
import { DeadlineCompactList } from '@/components/deadlines/deadline-list';
import {
  DeadlineStatusBadge,
  DeadlineCategoryBadge,
  UrgencyIndicator,
} from '@/components/deadlines/deadline-status-badge';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';
import type { DeadlineStatus } from '@/generated/prisma';

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
  onComplete?: () => void;
  canEdit?: boolean;
}

function DeadlineDetailModal({
  deadline,
  isOpen,
  onClose,
  onComplete,
  canEdit,
}: DeadlineDetailModalProps) {
  if (!deadline) return null;

  const effectiveDueDate = deadline.extendedDueDate || deadline.statutoryDueDate;
  const isCompleted = deadline.status === 'COMPLETED';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={deadline.title} size="lg">
      <div className="space-y-6">
        {/* Status & Category */}
        <div className="flex items-center gap-3">
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
            <label className="text-xs text-text-muted uppercase tracking-wider">Period</label>
            <p className="mt-1 text-sm font-medium text-text-primary">{deadline.periodLabel}</p>
          </div>
          {deadline.referenceCode && (
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider">Reference</label>
              <p className="mt-1 text-sm text-text-primary">{deadline.referenceCode}</p>
            </div>
          )}
        </div>

        {/* Due Dates */}
        <div className="bg-background-secondary rounded-lg p-4 space-y-3">
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
              {format(new Date(deadline.statutoryDueDate), 'dd MMM yyyy')}
            </span>
          </div>

          {deadline.extendedDueDate && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">Extended Due Date</span>
              </div>
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {format(new Date(deadline.extendedDueDate), 'dd MMM yyyy')}
              </span>
            </div>
          )}

          {deadline.eotReference && (
            <div className="text-xs text-text-muted border-t border-border-default pt-2 mt-2">
              EOT Reference: {deadline.eotReference}
              {deadline.eotNote && <span className="block">{deadline.eotNote}</span>}
            </div>
          )}
        </div>

        {/* Description */}
        {deadline.description && (
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider">Description</label>
            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
              {deadline.description}
            </p>
          </div>
        )}

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
                Completed on {format(new Date(deadline.completedAt), 'dd MMM yyyy')}
                {deadline.completedBy &&
                  ` by ${deadline.completedBy.firstName} ${deadline.completedBy.lastName}`}
              </p>
            )}
            {deadline.filingDate && (
              <p className="text-sm text-text-muted">
                Filed on {format(new Date(deadline.filingDate), 'dd MMM yyyy')}
                {deadline.filingReference && ` (Ref: ${deadline.filingReference})`}
              </p>
            )}
            {deadline.completionNote && (
              <p className="text-sm text-text-primary mt-2">{deadline.completionNote}</p>
            )}
          </div>
        )}

        {/* Assignee */}
        {deadline.assignee && (
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider">Assigned To</label>
            <div className="mt-1 flex items-center gap-2">
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

        {/* Actions */}
        {canEdit && !isCompleted && (
          <div className="flex justify-end gap-2 pt-4 border-t border-border-default">
            <button onClick={onClose} className="btn-secondary btn-sm">
              Close
            </button>
            <button onClick={onComplete} className="btn-primary btn-sm">
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Complete
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DeadlinesTab({ companyId }: DeadlinesTabProps) {
  const { can } = usePermissions(companyId);
  const { success: toastSuccess, error: toastError } = useToast();
  const canUpdate = can.updateCompany;

  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [selectedDeadline, setSelectedDeadline] = useState<DeadlineWithRelations | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  // Queries
  const statusFilter: DeadlineStatus[] | undefined =
    activeFilter === 'active'
      ? ['UPCOMING', 'DUE_SOON', 'IN_PROGRESS']
      : activeFilter === 'completed'
        ? ['COMPLETED']
        : undefined;

  const { data: deadlines, isLoading, error, refetch } = useCompanyDeadlines(companyId, {
    status: statusFilter,
  });

  // Mutations
  const generateDeadlines = useGenerateDeadlines();
  const completeDeadline = useCompleteDeadline(selectedDeadline?.id || '');
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

  const handleCompleteDeadline = async () => {
    if (!selectedDeadline) return;
    try {
      await completeDeadline.mutateAsync({});
      setSelectedDeadline(null);
      refetch();
    } catch {
      // Error handled by mutation
    }
  };

  // Statistics
  const activeCount = deadlines?.filter(
    (d) => ['UPCOMING', 'DUE_SOON', 'IN_PROGRESS'].includes(d.status)
  ).length || 0;
  const completedCount = deadlines?.filter((d) => d.status === 'COMPLETED').length || 0;
  const overdueCount = deadlines?.filter((d) => {
    if (['COMPLETED', 'CANCELLED', 'WAIVED'].includes(d.status)) return false;
    const dueDate = d.extendedDueDate || d.statutoryDueDate;
    return new Date(dueDate) < new Date();
  }).length || 0;

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
          <button
            onClick={() => refetch()}
            className="p-2 rounded-md hover:bg-background-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-text-muted" />
          </button>
          {canUpdate && (
            <button
              onClick={() => setShowGenerateConfirm(true)}
              className="btn-secondary btn-sm"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Auto-Generate
            </button>
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
        <div className="py-8 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-text-muted">Failed to load deadlines</p>
        </div>
      ) : isLoading ? (
        <div className="py-8">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 skeleton rounded-lg" />
            ))}
          </div>
        </div>
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
            <button
              onClick={() => setShowGenerateConfirm(true)}
              className="btn-primary btn-sm mt-4"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Deadlines
            </button>
          )}
        </div>
      )}

      {/* Deadline Detail Modal */}
      <DeadlineDetailModal
        deadline={selectedDeadline}
        isOpen={!!selectedDeadline}
        onClose={() => setSelectedDeadline(null)}
        onComplete={handleCompleteDeadline}
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
    </div>
  );
}

export default DeadlinesTab;
