'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase,
  AlertCircle,
  Building2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import {
  useAllServices,
  useBulkUpdateServiceEndDate,
  useBulkHardDeleteServices,
  type ContractServiceWithRelations,
} from '@/hooks/use-contract-services';
import { useCompanies } from '@/hooks/use-companies';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { useUserPreference, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import { Pagination } from '@/components/companies/pagination';
import ServiceTable, { type ServiceInlineFilters } from '@/components/services/service-table';
import ServicesBulkActionsToolbar from '@/components/services/services-bulk-actions-toolbar';
import { ScopeModal } from '@/components/companies/contracts';
import { FilterChip } from '@/components/ui/filter-chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { formatDateShort } from '@/lib/utils';
import {
  getServiceTypeLabel,
  getServiceStatusLabel,
} from '@/lib/constants/contracts';
import type { ServiceStatus, ServiceType } from '@/generated/prisma';

const COLUMN_PREF_KEY = 'services:overview:columns:v1';

// Filter component for Services
interface FilterValues {
  status?: ServiceStatus;
  serviceType?: ServiceType;
}

function ServiceFilters({
  onSearch,
  onFilterChange,
  initialFilters,
  initialQuery,
}: {
  onSearch: (query: string) => void;
  onFilterChange: (filters: FilterValues) => void;
  initialFilters: FilterValues;
  initialQuery: string;
}) {
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterValues>(initialFilters);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(searchValue);
    }
  };

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search services..."
            value={searchValue}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div className="w-full sm:w-40">
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Service Type Filter */}
        <div className="w-full sm:w-40">
          <select
            value={filters.serviceType || ''}
            onChange={(e) => handleFilterChange('serviceType', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
          >
            <option value="">All Types</option>
            <option value="RECURRING">Recurring</option>
            <option value="ONE_TIME">One-time</option>
          </select>
        </div>

        {/* Search Button */}
        <button
          onClick={() => onSearch(searchValue)}
          className="btn-primary btn-sm px-4"
        >
          Search
        </button>
      </div>
    </div>
  );
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ServicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { data: columnPref } = useUserPreference<Record<string, number>>(COLUMN_PREF_KEY);
  const saveColumnPref = useUpsertUserPreference<Record<string, number>>();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Get active tenant ID
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Parse URL params
  const getParamsFromUrl = useCallback(() => {
    const parseNumber = (value: string | null) => {
      if (!value) return undefined;
      const num = parseFloat(value);
      return Number.isNaN(num) ? undefined : num;
    };

    return {
      query: searchParams.get('q') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: (searchParams.get('sortBy') || 'updatedAt') as 'name' | 'startDate' | 'endDate' | 'status' | 'rate' | 'serviceType' | 'company' | 'updatedAt' | 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      status: (searchParams.get('status') || undefined) as ServiceStatus | undefined,
      serviceType: (searchParams.get('serviceType') || undefined) as ServiceType | undefined,
      companyId: searchParams.get('companyId') || undefined,
      startDateFrom: searchParams.get('startDateFrom') || undefined,
      startDateTo: searchParams.get('startDateTo') || undefined,
      endDateFrom: searchParams.get('endDateFrom') || undefined,
      endDateTo: searchParams.get('endDateTo') || undefined,
      rateFrom: parseNumber(searchParams.get('rateFrom')),
      rateTo: parseNumber(searchParams.get('rateTo')),
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);

  // Scope modal state
  const [scopeModal, setScopeModal] = useState<{
    serviceName: string;
    scope: string;
  } | null>(null);
  const [bulkEndDateOpen, setBulkEndDateOpen] = useState(false);
  const [bulkEndDate, setBulkEndDate] = useState<Date | undefined>(undefined);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const { data: companiesData } = useCompanies({
    tenantId: activeTenantId || undefined,
    limit: 200,
  });

  // Fetch services
  const { data, isLoading, isFetching, error } = useAllServices({
    ...params,
  });

  const bulkUpdateEndDate = useBulkUpdateServiceEndDate();
  const bulkHardDelete = useBulkHardDeleteServices();

  // Selection state for bulk operations
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAll,
    isAllSelected,
    isIndeterminate,
    clear: clearSelection,
  } = useSelection(data?.services || []);

  const selectedServices = useMemo(
    () => (data?.services || []).filter((service) => selectedIds.has(service.id)),
    [data?.services, selectedIds]
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

  // Calculate stats from current data
  const stats = useMemo(() => {
    if (!data) return null;
    const services = data.services || [];
    const active = services.filter((s) => s.status === 'ACTIVE').length;
    const recurring = services.filter((s) => s.serviceType === 'RECURRING').length;
    const oneTime = services.filter((s) => s.serviceType === 'ONE_TIME').length;
    return {
      total: data.total,
      active,
      recurring,
      oneTime,
    };
  }, [data]);

  const companyFilterOptions = useMemo(() => {
    if (!companiesData?.companies) return [];
    return companiesData.companies.map((company) => ({ id: company.id, name: company.name }));
  }, [companiesData?.companies]);

  const inlineFilters = useMemo(() => ({
    query: params.query,
    companyId: params.companyId,
    status: params.status,
    serviceType: params.serviceType,
    startDateFrom: params.startDateFrom,
    startDateTo: params.startDateTo,
    endDateFrom: params.endDateFrom,
    endDateTo: params.endDateTo,
    rateFrom: params.rateFrom,
    rateTo: params.rateTo,
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
    if (params.status) {
      chips.push({
        key: 'status',
        label: 'Status',
        value: getServiceStatusLabel(params.status),
        onRemove: () => setParams((p) => ({ ...p, status: undefined, page: 1 })),
      });
    }
    if (params.serviceType) {
      chips.push({
        key: 'serviceType',
        label: 'Type',
        value: getServiceTypeLabel(params.serviceType),
        onRemove: () => setParams((p) => ({ ...p, serviceType: undefined, page: 1 })),
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
    if (params.startDateFrom || params.startDateTo) {
      const fromLabel = params.startDateFrom ? formatDateShort(params.startDateFrom) : '';
      const toLabel = params.startDateTo ? formatDateShort(params.startDateTo) : '';
      const value = params.startDateFrom && params.startDateTo
        ? `${fromLabel} - ${toLabel}`
        : params.startDateFrom
          ? `>= ${fromLabel}`
          : `<= ${toLabel}`;
      chips.push({
        key: 'startDate',
        label: 'Start Date',
        value,
        onRemove: () => setParams((p) => ({ ...p, startDateFrom: undefined, startDateTo: undefined, page: 1 })),
      });
    }
    if (params.endDateFrom || params.endDateTo) {
      const fromLabel = params.endDateFrom ? formatDateShort(params.endDateFrom) : '';
      const toLabel = params.endDateTo ? formatDateShort(params.endDateTo) : '';
      const value = params.endDateFrom && params.endDateTo
        ? `${fromLabel} - ${toLabel}`
        : params.endDateFrom
          ? `>= ${fromLabel}`
          : `<= ${toLabel}`;
      chips.push({
        key: 'endDate',
        label: 'End Date',
        value,
        onRemove: () => setParams((p) => ({ ...p, endDateFrom: undefined, endDateTo: undefined, page: 1 })),
      });
    }
    if (params.rateFrom !== undefined || params.rateTo !== undefined) {
      const fromLabel = params.rateFrom !== undefined ? numberFormatter.format(params.rateFrom) : '';
      const toLabel = params.rateTo !== undefined ? numberFormatter.format(params.rateTo) : '';
      const value = params.rateFrom !== undefined && params.rateTo !== undefined
        ? `${fromLabel} - ${toLabel}`
        : params.rateFrom !== undefined
          ? `>= ${fromLabel}`
          : `<= ${toLabel}`;
      chips.push({
        key: 'rate',
        label: 'Rate',
        value,
        onRemove: () => setParams((p) => ({ ...p, rateFrom: undefined, rateTo: undefined, page: 1 })),
      });
    }

    return chips;
  }, [params, companiesData?.companies]);

  const clearAllFilters = () => {
    setParams((p) => ({
      ...p,
      query: '',
      status: undefined,
      serviceType: undefined,
      companyId: undefined,
      startDateFrom: undefined,
      startDateTo: undefined,
      endDateFrom: undefined,
      endDateTo: undefined,
      rateFrom: undefined,
      rateTo: undefined,
      page: 1,
    }));
  };

  // Memoize URL construction
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'updatedAt') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'desc') urlParams.set('sortOrder', params.sortOrder);
    if (params.status) urlParams.set('status', params.status);
    if (params.serviceType) urlParams.set('serviceType', params.serviceType);
    if (params.companyId) urlParams.set('companyId', params.companyId);
    if (params.startDateFrom) urlParams.set('startDateFrom', params.startDateFrom);
    if (params.startDateTo) urlParams.set('startDateTo', params.startDateTo);
    if (params.endDateFrom) urlParams.set('endDateFrom', params.endDateFrom);
    if (params.endDateTo) urlParams.set('endDateTo', params.endDateTo);
    if (params.rateFrom !== undefined) urlParams.set('rateFrom', params.rateFrom.toString());
    if (params.rateTo !== undefined) urlParams.set('rateTo', params.rateTo.toString());

    const queryString = urlParams.toString();
    return queryString ? `/services?${queryString}` : '/services';
  }, [params]);

  // Reset page when tenant changes
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

  const handleSearch = (query: string) => {
    setParams((prev) => ({ ...prev, query, page: 1 }));
  };

  const handleFilterChange = (newFilters: FilterValues) => {
    setParams((prev) => ({
      ...prev,
      ...newFilters,
      page: 1,
    }));
  };

  const handleInlineFilterChange = useCallback((filters: Partial<ServiceInlineFilters>) => {
    setParams((prev) => ({
      ...prev,
      ...filters,
      page: 1,
    }));
  }, []);

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const handleLimitChange = (limit: number) => {
    setParams((prev) => ({ ...prev, limit, page: 1 }));
  };

  const handleSort = (field: string) => {
    setParams((prev) => {
      if (prev.sortBy === field) {
        return { ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      return { ...prev, sortBy: field as typeof prev.sortBy, sortOrder: 'asc' };
    });
  };

  const handleViewScope = (service: ContractServiceWithRelations) => {
    if (service.scope) {
      setScopeModal({
        serviceName: service.name,
        scope: service.scope,
      });
    }
  };

  const handleBulkEndDateConfirm = useCallback(async () => {
    if (!bulkEndDate || selectedIds.size === 0) return;
    try {
      await bulkUpdateEndDate.mutateAsync({
        serviceIds: Array.from(selectedIds),
        endDate: toLocalDateString(bulkEndDate),
      });
      setBulkEndDateOpen(false);
      setBulkEndDate(undefined);
      clearSelection();
    } catch {
      // Error handled by mutation
    }
  }, [bulkEndDate, selectedIds, bulkUpdateEndDate, clearSelection]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await bulkHardDelete.mutateAsync(Array.from(selectedIds));
      setBulkDeleteDialogOpen(false);
      clearSelection();
    } catch {
      // Error handled by mutation
    }
  }, [selectedIds, bulkHardDelete, clearSelection]);

  // Calculate pagination
  const totalPages = data ? Math.ceil(data.total / params.limit) : 0;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Services Overview</h1>
          <p className="text-text-secondary text-sm mt-1">
            View and manage all services across your companies
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-oak-primary/10">
                  <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-oak-light" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.total}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Total Services</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-success/10">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.active}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Active</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.recurring}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Recurring</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-warning/10">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.oneTime}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">One-time</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters */}
      <div className="mb-6 md:hidden">
        <ServiceFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialFilters={{
            status: params.status,
            serviceType: params.serviceType,
          }}
          initialQuery={params.query}
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
            <p>{error instanceof Error ? error.message : 'Failed to load services'}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div>
        <ServiceTable
          services={data?.services || []}
          isLoading={isLoading}
          isFetching={isFetching}
          sortBy={params.sortBy}
          sortOrder={params.sortOrder}
          onSort={handleSort}
          onViewScope={handleViewScope}
          selectable
          selectedIds={selectedIds}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
          isAllSelected={isAllSelected}
          isIndeterminate={isIndeterminate}
          inlineFilters={inlineFilters}
          onInlineFilterChange={handleInlineFilterChange}
          companyFilterOptions={companyFilterOptions}
          columnWidths={columnWidths}
          onColumnWidthChange={handleColumnWidthChange}
        />
      </div>

      {/* Pagination */}
      {data && totalPages > 0 && (
        <div className="mt-4">
          <Pagination
            page={params.page}
            totalPages={totalPages}
            total={data.total}
            limit={params.limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}

      {/* Floating Bulk Actions Toolbar */}
      <ServicesBulkActionsToolbar
        selectedIds={Array.from(selectedIds)}
        selectedServices={selectedServices}
        onClearSelection={clearSelection}
        onAddEndDate={() => setBulkEndDateOpen(true)}
        onHardDelete={() => setBulkDeleteDialogOpen(true)}
        isUpdating={bulkUpdateEndDate.isPending}
        isDeleting={bulkHardDelete.isPending}
      />

      {/* Bulk End Date Modal */}
      <Modal
        isOpen={bulkEndDateOpen}
        onClose={() => {
          setBulkEndDateOpen(false);
          setBulkEndDate(undefined);
        }}
        title="Add End Date"
        size="md"
      >
        <ModalBody className="space-y-4">
          <p className="text-sm text-text-secondary">
            Apply an end date to {selectedCount} selected service{selectedCount !== 1 ? 's' : ''}.
          </p>
          <DatePicker
            value={bulkEndDate ? { mode: 'single', date: bulkEndDate } : undefined}
            onChange={(value: DatePickerValue | undefined) => {
              if (!value || value.mode !== 'single') {
                setBulkEndDate(undefined);
              } else {
                setBulkEndDate(value.date);
              }
            }}
            placeholder="Select end date"
            defaultTab="single"
            className="text-sm"
          />
        </ModalBody>
        <ModalFooter className="justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              setBulkEndDateOpen(false);
              setBulkEndDate(undefined);
            }}
            disabled={bulkUpdateEndDate.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleBulkEndDateConfirm}
            disabled={!bulkEndDate || bulkUpdateEndDate.isPending}
          >
            Apply End Date
          </Button>
        </ModalFooter>
      </Modal>

      {/* Bulk Delete Confirmation */}
      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={() => setBulkDeleteDialogOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title="Delete Selected Services"
        description={`This will permanently delete ${selectedCount} selected service${selectedCount !== 1 ? 's' : ''}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={bulkHardDelete.isPending}
      />

      {/* Scope Modal */}
      {scopeModal && (
        <ScopeModal
          isOpen={true}
          onClose={() => setScopeModal(null)}
          serviceName={scopeModal.serviceName}
          scope={scopeModal.scope}
        />
      )}
    </div>
  );
}
