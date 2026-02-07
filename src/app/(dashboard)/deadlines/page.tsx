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
  AlertCircle,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { Button } from '@/components/ui/button';
import {
  useDeadlines,
  useDeadlineStats,
  useBulkUpdateStatus,
  useBulkUpdateBillingStatus,
  useBulkAssignDeadlines,
  useBulkDeleteDeadlines,
} from '@/hooks/use-deadlines';
import { useTenantUsers } from '@/hooks/use-admin';
import { useCompanies } from '@/hooks/use-companies';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { useUserPreference, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import DeadlineTable, { type DeadlineInlineFilters } from '@/components/deadlines/deadline-table';
import { DeadlineFilters, type FilterValues } from '@/components/deadlines/deadline-filters';
import DeadlinesBulkActionsToolbar from '@/components/deadlines/deadlines-bulk-actions-toolbar';
import { Pagination } from '@/components/companies/pagination';
import { FilterChip } from '@/components/ui/filter-chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn, formatDateShort } from '@/lib/utils';
import type { DeadlineBillingStatus, DeadlineCategory, DeadlineStatus } from '@/generated/prisma';
import type { DeadlineTimingStatus } from '@/components/deadlines/deadline-status-badge';

const COLUMN_PREF_KEY = 'deadlines:overview:columns:v1';

const STATUS_LABELS: Record<DeadlineStatus, string> = {
  PENDING: 'Pending',
  PENDING_CLIENT: 'Pending Client',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  WAIVED: 'Waived',
};

const TIMING_LABELS: Record<DeadlineTimingStatus, string> = {
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due Soon',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  WAIVED: 'Waived',
};

const CATEGORY_LABELS: Record<DeadlineCategory, string> = {
  CORPORATE_SECRETARY: 'Corporate Secretary',
  TAX: 'Tax',
  ACCOUNTING: 'Accounting',
  AUDIT: 'Audit',
  COMPLIANCE: 'Compliance',
  OTHER: 'Other',
};

const BILLING_STATUS_LABELS: Record<DeadlineBillingStatus, string> = {
  NOT_APPLICABLE: 'Not Applicable',
  PENDING: 'Pending',
  TO_BE_BILLED: 'To be billed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function DeadlinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { data: columnPref } = useUserPreference<Record<string, number>>(COLUMN_PREF_KEY);
  const saveColumnPref = useUpsertUserPreference<Record<string, number>>();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

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

    const parseNumber = (value: string | null) => {
      if (!value) return undefined;
      const num = parseFloat(value);
      return Number.isNaN(num) ? undefined : num;
    };

    return {
      query: searchParams.get('q') || '',
      period: searchParams.get('period') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: (searchParams.get('sortBy') || 'statutoryDueDate') as
        | 'title'
        | 'periodLabel'
        | 'service'
        | 'billingStatus'
        | 'amount'
        | 'assignee'
        | 'statutoryDueDate'
        | 'status'
        | 'category'
        | 'company'
        | 'createdAt'
        | 'updatedAt',
      sortOrder: (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc',
      category: (searchParams.get('category') || undefined) as DeadlineCategory | undefined,
      status: statusValues,
      timing: (searchParams.get('timing') || undefined) as DeadlineTimingStatus | undefined,
      assigneeId: searchParams.get('assigneeId') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      contractServiceId: searchParams.get('contractServiceId') || undefined,
      billingStatus: (searchParams.get('billingStatus') || undefined) as DeadlineBillingStatus | undefined,
      dueDateFrom: searchParams.get('dueDateFrom') || undefined,
      dueDateTo: searchParams.get('dueDateTo') || undefined,
      amountFrom: parseNumber(searchParams.get('amountFrom')),
      amountTo: parseNumber(searchParams.get('amountTo')),
      isInScope: searchParams.get('isInScope') === 'true' ? true :
                 searchParams.get('isInScope') === 'false' ? false : undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const { data: companiesData } = useCompanies({
    tenantId: activeTenantId || undefined,
    limit: 200,
  });
  const { data: tenantUsers } = useTenantUsers(activeTenantId || undefined, { limit: 200 });

  // Queries - pass tenantId for SUPER_ADMIN support
  const { data, isLoading, isFetching, error, refetch } = useDeadlines({
    ...params,
    tenantId: activeTenantId,
  });
  const { data: stats, error: statsError } = useDeadlineStats(activeTenantId);

  // Mutations
  const bulkUpdateStatus = useBulkUpdateStatus();
  const bulkUpdateBillingStatus = useBulkUpdateBillingStatus();
  const bulkAssignDeadlines = useBulkAssignDeadlines();
  const bulkDeleteDeadlines = useBulkDeleteDeadlines();
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Selection
  const {
    selectedIds,
    toggleOne,
    toggleAll,
    isAllSelected,
    isIndeterminate,
    clear: clearSelection,
  } = useSelection(data?.deadlines || []);

  const companyFilterOptions = useMemo(() => {
    if (!companiesData?.companies) return [];
    return companiesData.companies.map((company) => ({ id: company.id, name: company.name }));
  }, [companiesData?.companies]);

  const serviceFilterOptions = useMemo(() => {
    if (!data?.deadlines) return [];
    const map = new Map<string, string>();
    data.deadlines.forEach((deadline) => {
      if (deadline.contractService) {
        const contractTitle = deadline.contractService.contract?.title;
        const label = contractTitle
          ? `${deadline.contractService.name} - ${contractTitle}`
          : deadline.contractService.name;
        map.set(deadline.contractService.id, label);
      }
    });
    return Array.from(map).map(([id, label]) => ({ id, label }));
  }, [data?.deadlines]);

  const assigneeFilterOptions = useMemo(() => {
    if (!data?.deadlines) return [];
    const map = new Map<string, string>();
    data.deadlines.forEach((deadline) => {
      if (deadline.assignee) {
        map.set(deadline.assignee.id, `${deadline.assignee.firstName} ${deadline.assignee.lastName}`);
      }
    });
    return Array.from(map).map(([id, label]) => ({ id, label }));
  }, [data?.deadlines]);

  const assigneeOptions = useMemo(() => {
    if (!tenantUsers?.users) return [];
    return tenantUsers.users
      .filter((user) => user.isActive)
      .map((user) => ({ id: user.id, label: `${user.firstName} ${user.lastName}` }));
  }, [tenantUsers?.users]);

  const selectedDeadlines = useMemo(
    () => (data?.deadlines || []).filter((deadline) => selectedIds.has(deadline.id)),
    [data?.deadlines, selectedIds]
  );

  useEffect(() => {
    const value = columnPref?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    setColumnWidths(value as Record<string, number>);
  }, [columnPref?.value]);

  const handleColumnWidthChange = useCallback((columnId: string, width: number) => {
    setColumnWidths((prev) => {
      const next = { ...prev, [columnId]: width };
      saveColumnPref.mutate({ key: COLUMN_PREF_KEY, value: next });
      return next;
    });
  }, [saveColumnPref]);

  const inlineFilters = useMemo<DeadlineInlineFilters>(() => ({
    query: params.query,
    period: params.period,
    companyId: params.companyId,
    contractServiceId: params.contractServiceId,
    category: params.category,
    status: params.status,
    timing: params.timing,
    assigneeId: params.assigneeId,
    isInScope: params.isInScope,
    billingStatus: params.billingStatus,
    dueDateFrom: params.dueDateFrom,
    dueDateTo: params.dueDateTo,
    amountFrom: params.amountFrom,
    amountTo: params.amountTo,
  }), [params]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; value: string; onRemove: () => void }> = [];
    const numberFormatter = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 });

    if (params.query) {
      chips.push({
        key: 'query',
        label: 'Search',
        value: params.query,
        onRemove: () => setParams((p) => ({ ...p, query: '', page: 1 })),
      });
    }
    if (params.period) {
      chips.push({
        key: 'period',
        label: 'Period',
        value: params.period,
        onRemove: () => setParams((p) => ({ ...p, period: '', page: 1 })),
      });
    }
    if (params.companyId) {
      const name = companiesData?.companies?.find((c) => c.id === params.companyId)?.name || 'Selected';
      chips.push({
        key: 'company',
        label: 'Company',
        value: name,
        onRemove: () => setParams((p) => ({ ...p, companyId: undefined, page: 1 })),
      });
    }
    if (params.contractServiceId) {
      const serviceLabel = serviceFilterOptions.find((s) => s.id === params.contractServiceId)?.label || 'Selected';
      chips.push({
        key: 'service',
        label: 'Service',
        value: serviceLabel,
        onRemove: () => setParams((p) => ({ ...p, contractServiceId: undefined, page: 1 })),
      });
    }
    if (params.category) {
      chips.push({
        key: 'category',
        label: 'Category',
        value: CATEGORY_LABELS[params.category],
        onRemove: () => setParams((p) => ({ ...p, category: undefined, page: 1 })),
      });
    }
    if (params.timing) {
      chips.push({
        key: 'timing',
        label: 'Status',
        value: TIMING_LABELS[params.timing],
        onRemove: () => setParams((p) => ({ ...p, timing: undefined, page: 1 })),
      });
    }
    if (params.status && params.status.length > 0) {
      const activeStatuses = ['PENDING', 'PENDING_CLIENT', 'IN_PROGRESS', 'PENDING_REVIEW'];
      const isActive =
        params.status.length === activeStatuses.length &&
        params.status.every((s) => activeStatuses.includes(s));
      const value = isActive
        ? 'Active'
        : params.status.map((s) => STATUS_LABELS[s]).join(', ');
      chips.push({
        key: 'status',
        label: 'Internal Status',
        value,
        onRemove: () => setParams((p) => ({ ...p, status: undefined, page: 1 })),
      });
    }
    if (params.assigneeId) {
      const assigneeLabel = assigneeFilterOptions.find((a) => a.id === params.assigneeId)?.label || 'Selected';
      chips.push({
        key: 'assignee',
        label: 'Assignee',
        value: assigneeLabel,
        onRemove: () => setParams((p) => ({ ...p, assigneeId: undefined, page: 1 })),
      });
    }
    if (params.isInScope !== undefined) {
      chips.push({
        key: 'scope',
        label: 'Scope',
        value: params.isInScope ? 'In scope' : 'Out of scope',
        onRemove: () => setParams((p) => ({ ...p, isInScope: undefined, page: 1 })),
      });
    }
    if (params.billingStatus) {
      chips.push({
        key: 'billing',
        label: 'Billing',
        value: BILLING_STATUS_LABELS[params.billingStatus],
        onRemove: () => setParams((p) => ({ ...p, billingStatus: undefined, page: 1 })),
      });
    }
    if (params.dueDateFrom || params.dueDateTo) {
      const fromLabel = params.dueDateFrom ? formatDateShort(params.dueDateFrom) : '';
      const toLabel = params.dueDateTo ? formatDateShort(params.dueDateTo) : '';
      const value = params.dueDateFrom && params.dueDateTo
        ? `${fromLabel} - ${toLabel}`
        : params.dueDateFrom
          ? `>= ${fromLabel}`
          : `<= ${toLabel}`;
      chips.push({
        key: 'dueDate',
        label: 'Due Date',
        value,
        onRemove: () => setParams((p) => ({ ...p, dueDateFrom: undefined, dueDateTo: undefined, page: 1 })),
      });
    }
    if (params.amountFrom !== undefined || params.amountTo !== undefined) {
      const fromLabel = params.amountFrom !== undefined ? numberFormatter.format(params.amountFrom) : '';
      const toLabel = params.amountTo !== undefined ? numberFormatter.format(params.amountTo) : '';
      const value = params.amountFrom !== undefined && params.amountTo !== undefined
        ? `${fromLabel} - ${toLabel}`
        : params.amountFrom !== undefined
          ? `>= ${fromLabel}`
          : `<= ${toLabel}`;
      chips.push({
        key: 'amount',
        label: 'Amount',
        value,
        onRemove: () => setParams((p) => ({ ...p, amountFrom: undefined, amountTo: undefined, page: 1 })),
      });
    }

    return chips;
  }, [params, companiesData?.companies, serviceFilterOptions, assigneeFilterOptions]);

  const clearAllFilters = () => {
    setParams((p) => ({
      ...p,
      query: '',
      period: '',
      category: undefined,
      timing: undefined,
      status: undefined,
      assigneeId: undefined,
      companyId: undefined,
      contractServiceId: undefined,
      billingStatus: undefined,
      dueDateFrom: undefined,
      dueDateTo: undefined,
      amountFrom: undefined,
      amountTo: undefined,
      isInScope: undefined,
      page: 1,
    }));
  };

  // URL sync
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.period) urlParams.set('period', params.period);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'statutoryDueDate') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'asc') urlParams.set('sortOrder', params.sortOrder);
    if (params.category) urlParams.set('category', params.category);
    if (params.status && params.status.length > 0) urlParams.set('status', params.status.join(','));
    if (params.timing) urlParams.set('timing', params.timing);
    if (params.assigneeId) urlParams.set('assigneeId', params.assigneeId);
    if (params.isInScope !== undefined) urlParams.set('isInScope', params.isInScope.toString());
    if (params.companyId) urlParams.set('companyId', params.companyId);
    if (params.contractServiceId) urlParams.set('contractServiceId', params.contractServiceId);
    if (params.billingStatus) urlParams.set('billingStatus', params.billingStatus);
    if (params.dueDateFrom) urlParams.set('dueDateFrom', params.dueDateFrom);
    if (params.dueDateTo) urlParams.set('dueDateTo', params.dueDateTo);
    if (params.amountFrom !== undefined) urlParams.set('amountFrom', params.amountFrom.toString());
    if (params.amountTo !== undefined) urlParams.set('amountTo', params.amountTo.toString());

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
        timing: filters.timing,
        status: filters.status,
        assigneeId: filters.assigneeId,
        isInScope: filters.isInScope,
        page: 1,
      }));
    },
    []
  );

  const handleInlineFilterChange = useCallback((filters: Partial<DeadlineInlineFilters>) => {
    setParams((prev) => ({
      ...prev,
      ...filters,
      page: 1,
    }));
  }, []);

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

  const handleBulkStatusUpdate = useCallback(
    async (status: DeadlineStatus) => {
      if (selectedIds.size === 0) return;
      try {
        await bulkUpdateStatus.mutateAsync({
          deadlineIds: Array.from(selectedIds),
          status,
        });
        clearSelection();
      } catch {
        // Error handled by mutation
      }
    },
    [selectedIds, bulkUpdateStatus, clearSelection]
  );

  const handleBulkBillingUpdate = useCallback(
    async (billingStatus: DeadlineBillingStatus) => {
      if (selectedIds.size === 0) return;
      try {
        await bulkUpdateBillingStatus.mutateAsync({
          deadlineIds: Array.from(selectedIds),
          billingStatus,
        });
        clearSelection();
      } catch {
        // Error handled by mutation
      }
    },
    [selectedIds, bulkUpdateBillingStatus, clearSelection]
  );

  const handleBulkAssign = useCallback(
    async (assigneeId: string | null) => {
      if (selectedIds.size === 0) return;
      try {
        await bulkAssignDeadlines.mutateAsync({
          deadlineIds: Array.from(selectedIds),
          assigneeId,
        });
        clearSelection();
      } catch {
        // Error handled by mutation
      }
    },
    [selectedIds, bulkAssignDeadlines, clearSelection]
  );

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

  const activeWorkflowCount = stats
    ? (stats.byStatus.PENDING || 0)
      + (stats.byStatus.PENDING_CLIENT || 0)
      + (stats.byStatus.IN_PROGRESS || 0)
      + (stats.byStatus.PENDING_REVIEW || 0)
    : 0;
  const upcomingCount = Math.max(
    0,
    activeWorkflowCount - (stats?.overdue || 0) - (stats?.dueSoon || 0)
  );

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Deadline/ Billing Overview</h1>
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
                    {upcomingCount}
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
      <div className="mb-6 md:hidden">
        <DeadlineFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialQuery={params.query}
          initialFilters={{
            category: params.category,
            timing: params.timing,
            status: params.status,
            isInScope: params.isInScope,
            assigneeId: params.assigneeId,
          }}
        />
      </div>

      {/* Active Filter Chips - Desktop Only */}
      {activeFilterChips.length > 0 && (
        <div className="hidden md:flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-text-secondary font-medium">Active filters:</span>
          {activeFilterChips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              value={chip.value}
              onRemove={chip.onRemove}
            />
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-sm text-oak-primary hover:text-oak-primary/80 font-medium transition-colors ml-2"
          >
            Clear all
          </button>
        </div>
      )}

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
          <DeadlineTable
            deadlines={data?.deadlines || []}
            isLoading={isLoading}
            isFetching={isFetching}
            selectable={true}
            selectedIds={selectedIds}
            onToggleOne={toggleOne}
            onToggleAll={toggleAll}
            isAllSelected={isAllSelected}
            isIndeterminate={isIndeterminate}
            sortBy={params.sortBy}
            sortOrder={params.sortOrder}
            onSort={handleSort}
            inlineFilters={inlineFilters}
            onInlineFilterChange={handleInlineFilterChange}
            companyFilterOptions={companyFilterOptions}
            serviceFilterOptions={serviceFilterOptions}
            assigneeFilterOptions={assigneeFilterOptions}
            columnWidths={columnWidths}
            onColumnWidthChange={handleColumnWidthChange}
          />
          {data && data.totalPages > 0 && (
            <div className="mt-4">
              <Pagination
                page={params.page}
                totalPages={data.totalPages}
                total={data.total}
                limit={params.limit}
                onPageChange={handlePageChange}
                onLimitChange={handleLimitChange}
              />
            </div>
          )}
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
      <DeadlinesBulkActionsToolbar
        selectedIds={Array.from(selectedIds)}
        selectedDeadlines={selectedDeadlines}
        onClearSelection={clearSelection}
        onUpdateStatus={handleBulkStatusUpdate}
        onUpdateBillingStatus={handleBulkBillingUpdate}
        onAssign={handleBulkAssign}
        onDelete={() => setBulkDeleteDialogOpen(true)}
        assigneeOptions={assigneeOptions}
        isUpdatingStatus={bulkUpdateStatus.isPending}
        isUpdatingBilling={bulkUpdateBillingStatus.isPending}
        isAssigning={bulkAssignDeadlines.isPending}
        isDeleting={bulkDeleteDeadlines.isPending}
      />

      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={() => setBulkDeleteDialogOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Delete Selected Deadlines"
        description={`This will delete ${selectedIds.size} selected deadline${selectedIds.size !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={bulkDeleteDeadlines.isPending}
      />
    </div>
  );
}
