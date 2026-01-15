'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  Filter,
  Calendar,
  ListFilter,
  RefreshCw,
  Trash2,
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar';
import { ErrorState } from '@/components/ui/error-state';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { DeadlineCategory, DeadlineStatus } from '@/generated/prisma';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_OPTIONS: { value: DeadlineStatus; label: string }[] = [
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'DUE_SOON', label: 'Due Soon' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'WAIVED', label: 'Waived' },
];

const CATEGORY_OPTIONS: { value: DeadlineCategory; label: string }[] = [
  { value: 'CORPORATE_SECRETARY', label: 'Corporate Secretary' },
  { value: 'TAX', label: 'Tax' },
  { value: 'ACCOUNTING', label: 'Accounting' },
  { value: 'AUDIT', label: 'Audit' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'OTHER', label: 'Other' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function DeadlinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success: toastSuccess } = useToast();
  const { data: session } = useSession();

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

  // Queries
  const { data, isLoading, error, refetch } = useDeadlines(params);
  const { data: stats } = useDeadlineStats();

  // Mutations
  const deleteDeadline = useDeleteDeadline();
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkDeleteDeadlines = useBulkDeleteDeadlines();

  // Selection
  const {
    selectedIds,
    selectedCount,
    isAllSelected,
    isIndeterminate,
    toggleOne,
    toggleAll,
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

  // Update URL when params change
  const updateParams = useCallback(
    (newParams: Partial<typeof params>) => {
      setParams((prev) => ({ ...prev, ...newParams }));
    },
    []
  );

  // Handlers
  const handleSearch = useCallback(
    (query: string) => {
      updateParams({ query, page: 1 });
    },
    [updateParams]
  );

  const handlePageChange = useCallback(
    (page: number) => {
      updateParams({ page });
    },
    [updateParams]
  );

  const handleLimitChange = useCallback(
    (limit: number) => {
      updateParams({ limit, page: 1 });
    },
    [updateParams]
  );

  const handleSort = useCallback(
    (field: string) => {
      const isSameField = params.sortBy === field;
      updateParams({
        sortBy: field as typeof params.sortBy,
        sortOrder: isSameField && params.sortOrder === 'asc' ? 'desc' : 'asc',
      });
    },
    [params.sortBy, params.sortOrder, updateParams]
  );

  const handleCategoryChange = useCallback(
    (category: DeadlineCategory | undefined) => {
      updateParams({ category, page: 1 });
    },
    [updateParams]
  );

  const handleStatusChange = useCallback(
    (status: DeadlineStatus[] | undefined) => {
      updateParams({ status, page: 1 });
    },
    [updateParams]
  );

  const handleClearFilters = useCallback(() => {
    setParams({
      query: '',
      page: 1,
      limit: 20,
      sortBy: 'statutoryDueDate',
      sortOrder: 'asc',
      category: undefined,
      status: undefined,
      assigneeId: undefined,
      isInScope: undefined,
    });
  }, []);

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

  const hasActiveFilters = params.category || (params.status && params.status.length > 0) ||
                          params.assigneeId || params.isInScope !== undefined || params.query;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-primary border-b border-border-default px-4 md:px-6 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Deadlines</h1>
            <p className="text-sm text-text-muted mt-1">
              Manage compliance deadlines across all companies
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
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="p-3 bg-background-secondary rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-text-muted">Upcoming</span>
              </div>
              <p className="text-xl font-semibold text-text-primary mt-1">
                {stats.byStatus.UPCOMING + stats.byStatus.DUE_SOON + stats.byStatus.IN_PROGRESS}
              </p>
            </div>
            <div className="p-3 bg-background-secondary rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-text-muted">Overdue</span>
              </div>
              <p className="text-xl font-semibold text-red-600 dark:text-red-400 mt-1">
                {stats.overdue}
              </p>
            </div>
            <div className="p-3 bg-background-secondary rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-text-muted">Due Soon</span>
              </div>
              <p className="text-xl font-semibold text-amber-600 dark:text-amber-400 mt-1">
                {stats.dueSoon}
              </p>
            </div>
            <div className="p-3 bg-background-secondary rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-text-muted">Completed</span>
              </div>
              <p className="text-xl font-semibold text-text-primary mt-1">
                {stats.byStatus.COMPLETED}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <MobileCollapsibleSection
          title="Filters"
          defaultCollapsed={!hasActiveFilters}
          className="mt-4"
        >
          <div className="flex flex-wrap gap-2 pt-2">
            {/* Search */}
            <input
              type="text"
              placeholder="Search deadlines..."
              value={params.query}
              onChange={(e) => handleSearch(e.target.value)}
              className="px-3 py-1.5 text-sm border border-border-default rounded-md bg-background-primary focus:outline-none focus:ring-2 focus:ring-oak-primary"
            />

            {/* Category Filter */}
            <Dropdown>
              <DropdownTrigger>
                <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border-default rounded-md bg-background-primary hover:bg-background-secondary cursor-pointer">
                  <Filter className="w-3.5 h-3.5" />
                  Category: {params.category || 'All'}
                </span>
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem onClick={() => handleCategoryChange(undefined)}>
                  All Categories
                </DropdownItem>
                <DropdownSeparator />
                {CATEGORY_OPTIONS.map((opt) => (
                  <DropdownItem key={opt.value} onClick={() => handleCategoryChange(opt.value)}>
                    {opt.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>

            {/* Status Filter */}
            <Dropdown>
              <DropdownTrigger>
                <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-border-default rounded-md bg-background-primary hover:bg-background-secondary cursor-pointer">
                  <Filter className="w-3.5 h-3.5" />
                  Status: {params.status?.join(', ') || 'All'}
                </span>
              </DropdownTrigger>
              <DropdownMenu>
                <DropdownItem onClick={() => handleStatusChange(undefined)}>
                  All Status
                </DropdownItem>
                <DropdownItem onClick={() => handleStatusChange(['UPCOMING', 'DUE_SOON', 'IN_PROGRESS'])}>
                  Active (Not Completed)
                </DropdownItem>
                <DropdownSeparator />
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownItem key={opt.value} onClick={() => handleStatusChange([opt.value])}>
                    {opt.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        </MobileCollapsibleSection>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Bulk Actions Toolbar */}
        {selectedCount > 0 && (
          <BulkActionsToolbar
            selectedCount={selectedCount}
            onClearSelection={clearSelection}
            actions={[
              {
                id: 'complete',
                label: 'Mark Complete',
                icon: CheckCircle,
              },
              {
                id: 'delete',
                label: 'Delete',
                icon: Trash2,
                variant: 'danger',
              },
            ]}
            onAction={handleBulkAction}
          />
        )}

        {error ? (
          <ErrorState
            error={error}
            message="Failed to load deadlines"
            onRetry={() => refetch()}
            size="lg"
          />
        ) : viewMode === 'list' ? (
          <div className="px-4 md:px-6 py-4">
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
          <div className="px-4 md:px-6 py-4">
            <div className="bg-background-secondary rounded-lg p-8 text-center">
              <Calendar className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-text-primary">Calendar View</h3>
              <p className="text-sm text-text-muted mt-1">
                Calendar view coming soon. Use list view for now.
              </p>
            </div>
          </div>
        )}
      </div>

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
