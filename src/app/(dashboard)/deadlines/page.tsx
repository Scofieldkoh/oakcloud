'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  ListFilter,
  RefreshCw,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { Button } from '@/components/ui/button';
import {
  useDeadlines,
  useDeadlineStats,
  useDeleteDeadline,
  useBulkUpdateStatus,
  useBulkDeleteDeadlines,
} from '@/hooks/use-deadlines';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { DeadlineList } from '@/components/deadlines/deadline-list';
import { DeadlineFilters, type FilterValues } from '@/components/deadlines/deadline-filters';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { DeadlineCategory, DeadlineStatus } from '@/generated/prisma';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';

// ============================================================================
// COMPONENT
// ============================================================================

export default function DeadlinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess } = useToast();
  const { data: session } = useSession();

  // Get active tenant ID (from store for SUPER_ADMIN, from session for others)
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Parse URL params
  const getParamsFromUrl = useCallback(() => {
    const statusParam = searchParams.get('status');
    const statusValues = statusParam
      ? statusParam.split(',') as DeadlineStatus[]
      : undefined;

    return {
      query: searchParams.get('q') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: (searchParams.get('sortBy') || 'statutoryDueDate') as
        | 'title'
        | 'statutoryDueDate'
        | 'status'
        | 'category'
        | 'company'
        | 'createdAt'
        | 'updatedAt',
      sortOrder: (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc',
      category: (searchParams.get('category') || undefined) as DeadlineCategory | undefined,
      status: statusValues,
      assigneeId: searchParams.get('assigneeId') || undefined,
      isInScope: searchParams.get('isInScope') === 'true' ? true :
                 searchParams.get('isInScope') === 'false' ? false : undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deadlineToDelete, setDeadlineToDelete] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Queries - pass tenantId for SUPER_ADMIN support
  const { data, isLoading, error, refetch } = useDeadlines({
    ...params,
    tenantId: activeTenantId,
  });
  const { data: stats, error: statsError } = useDeadlineStats(activeTenantId);

  // Mutations
  const deleteDeadline = useDeleteDeadline();
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkDeleteDeadlines = useBulkDeleteDeadlines();

  // Selection
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    clear: clearSelection,
  } = useSelection(data?.deadlines || []);

  // URL sync
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'statutoryDueDate') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'asc') urlParams.set('sortOrder', params.sortOrder);
    if (params.category) urlParams.set('category', params.category);
    if (params.status && params.status.length > 0) urlParams.set('status', params.status.join(','));
    if (params.assigneeId) urlParams.set('assigneeId', params.assigneeId);
    if (params.isInScope !== undefined) urlParams.set('isInScope', params.isInScope.toString());

    const queryString = urlParams.toString();
    return queryString ? `/deadlines?${queryString}` : '/deadlines';
  }, [params]);

  // Reset page and selection when tenant changes
  useEffect(() => {
    setParams((prev) => ({ ...prev, page: 1 }));
    clearSelection();
  }, [activeTenantId, clearSelection]);

  // Sync URL when params change
  useEffect(() => {
    if (window.location.pathname + window.location.search !== targetUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  }, [targetUrl, router]);

  // Handlers
  const handleSearch = useCallback(
    (query: string) => {
      setParams((prev) => ({ ...prev, query, page: 1 }));
    },
    []
  );

  const handleFilterChange = useCallback(
    (filters: FilterValues) => {
      setParams((prev) => ({
        ...prev,
        category: filters.category,
        status: filters.status,
        isInScope: filters.isInScope,
        page: 1,
      }));
    },
    []
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setParams((prev) => ({ ...prev, page }));
    },
    []
  );

  const handleLimitChange = useCallback(
    (limit: number) => {
      setParams((prev) => ({ ...prev, limit, page: 1 }));
    },
    []
  );

  const handleSort = useCallback(
    (field: string) => {
      setParams((prev) => {
        const isSameField = prev.sortBy === field;
        return {
          ...prev,
          sortBy: field as typeof prev.sortBy,
          sortOrder: isSameField && prev.sortOrder === 'asc' ? 'desc' : 'asc',
        };
      });
    },
    []
  );

  const handleViewDeadline = useCallback(
    (deadline: DeadlineWithRelations) => {
      router.push(`/companies/${deadline.companyId}?tab=deadlines&deadline=${deadline.id}`);
    },
    [router]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deadlineToDelete) return;
    try {
      await deleteDeadline.mutateAsync(deadlineToDelete);
      setDeleteDialogOpen(false);
      setDeadlineToDelete(null);
    } catch {
      // Error handled by mutation
    }
  }, [deadlineToDelete, deleteDeadline]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await bulkDeleteDeadlines.mutateAsync(Array.from(selectedIds));
      setBulkDeleteDialogOpen(false);
      clearSelection();
    } catch {
      // Error handled by mutation
    }
  }, [selectedIds, bulkDeleteDeadlines, clearSelection]);

  const handleBulkAction = useCallback(
    async (actionId: string) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);

      switch (actionId) {
        case 'complete':
          try {
            await bulkUpdateStatus.mutateAsync({
              deadlineIds: ids,
              status: 'COMPLETED',
            });
            clearSelection();
            toastSuccess('Deadlines marked as complete');
          } catch {
            // Error handled by mutation
          }
          break;
        case 'delete':
          setBulkDeleteDialogOpen(true);
          break;
      }
    },
    [selectedIds, bulkUpdateStatus, clearSelection, toastSuccess]
  );

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Deadlines</h1>
          <p className="text-text-secondary text-sm mt-1">
            Manage compliance deadlines across all companies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            aria-label="Refresh"
            iconOnly
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          {/* View mode toggle */}
          <div className="flex rounded-md border border-border-default overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                viewMode === 'list'
                  ? 'bg-oak-primary text-white'
                  : 'bg-background-secondary text-text-muted hover:bg-background-tertiary'
              )}
            >
              <ListFilter className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                viewMode === 'calendar'
                  ? 'bg-oak-primary text-white'
                  : 'bg-background-secondary text-text-muted hover:bg-background-tertiary'
              )}
            >
              <Calendar className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && !statsError && (
        <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {(stats.byStatus.UPCOMING || 0) + (stats.byStatus.DUE_SOON || 0) + (stats.byStatus.IN_PROGRESS || 0)}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Upcoming</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-error/10">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-status-error" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.overdue || 0}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Overdue</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-warning/10">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.dueSoon || 0}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Due Soon</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-success/10">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.byStatus.COMPLETED || 0}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Completed</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters */}
      <div className="mb-6">
        <DeadlineFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialQuery={params.query}
          initialFilters={{
            category: params.category,
            status: params.status,
            isInScope: params.isInScope,
          }}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load deadlines'}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {viewMode === 'list' ? (
        <div>
          <DeadlineList
            deadlines={data?.deadlines || []}
            isLoading={isLoading}
            onView={handleViewDeadline}
            onDelete={(deadline) => {
              setDeadlineToDelete(deadline.id);
              setDeleteDialogOpen(true);
            }}
            showCompany={true}
            selectable={true}
            selectedIds={selectedIds}
            onSelectionChange={(ids) => {
              // Sync with selection hook
              const currentIds = Array.from(selectedIds);
              const newIds = Array.from(ids);

              // Find added/removed
              const added = newIds.filter((id) => !currentIds.includes(id));
              const removed = currentIds.filter((id) => !newIds.includes(id));

              added.forEach((id) => toggleOne(id));
              removed.forEach((id) => toggleOne(id));
            }}
            sortBy={params.sortBy}
            sortOrder={params.sortOrder}
            onSort={handleSort}
            page={params.page}
            totalPages={data?.totalPages || 1}
            total={data?.total || 0}
            limit={params.limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
            emptyMessage="No deadlines found. Try adjusting your filters."
          />
        </div>
      ) : (
        <div className="bg-background-secondary rounded-lg p-8 text-center">
          <Calendar className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary">Calendar View</h3>
          <p className="text-sm text-text-muted mt-1">
            Calendar view coming soon. Use list view for now.
          </p>
        </div>
      )}

      {/* Floating Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        itemLabel="deadline"
        actions={[
          {
            id: 'complete',
            label: 'Mark Complete',
            icon: CheckCircle,
            description: 'Mark selected deadlines as completed',
            isLoading: bulkUpdateStatus.isPending,
          },
          {
            id: 'delete',
            label: 'Delete',
            icon: Trash2,
            description: 'Delete selected deadlines',
            variant: 'danger',
            isLoading: bulkDeleteDeadlines.isPending,
          },
        ]}
        onAction={handleBulkAction}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeadlineToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Deadline"
        description="Are you sure you want to delete this deadline? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteDeadline.isPending}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={() => setBulkDeleteDialogOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Delete Selected Deadlines"
        description={`Are you sure you want to delete ${selectedCount} selected deadlines? This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        isLoading={bulkDeleteDeadlines.isPending}
      />
    </div>
  );
}
