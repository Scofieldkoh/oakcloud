'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Building2, AlertCircle, FileUp, Trash2, Download } from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { useCompanies, useCompanyStats, useDeleteCompany, useBulkDeleteCompanies } from '@/hooks/use-companies';
import { useExportContactDetails } from '@/hooks/use-contact-details';
import { usePermissions, useCompanyPermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { CompanyTable, type CompanyInlineFilters, type CompanyFilterOption } from '@/components/companies/company-table';
import { CompanyFilters, type FilterValues } from '@/components/companies/company-filters';
import { Pagination } from '@/components/companies/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar';
import { FilterChip } from '@/components/ui/filter-chip';
import { useToast } from '@/components/ui/toast';
import { useUserPreference, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import { getEntityTypeLabel, getCompanyStatusLabel } from '@/lib/constants';
import type { EntityType, CompanyStatus } from '@/generated/prisma';

const COLUMN_PREF_KEY = 'companies:list:columns:v1';

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const { can } = usePermissions();
  const { data: session } = useSession();

  // Get active tenant ID (from store for SUPER_ADMIN, from session for others)
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Parse URL params
  const getParamsFromUrl = useCallback(() => {
    return {
      query: searchParams.get('q') || '',
      uen: searchParams.get('uen') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: searchParams.get('sortBy') || 'name',
      sortOrder: (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc',
      entityType: (searchParams.get('entityType') || undefined) as EntityType | undefined,
      status: (searchParams.get('status') || undefined) as CompanyStatus | undefined,
      hasCharges: searchParams.get('hasCharges') === 'true' ? true :
                  searchParams.get('hasCharges') === 'false' ? false : undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Pass tenantId to filter companies by selected tenant (for SUPER_ADMIN)
  const { data, isLoading, isFetching, error } = useCompanies({
    ...params,
    tenantId: activeTenantId,
  });
  const { data: stats, error: statsError } = useCompanyStats(activeTenantId);
  const deleteCompany = useDeleteCompany();
  const bulkDeleteCompanies = useBulkDeleteCompanies();
  const exportContactDetails = useExportContactDetails();

  // Selection state for bulk operations
  const {
    selectedIds,
    selectedCount,
    isAllSelected,
    isIndeterminate,
    toggleOne,
    toggleAll,
    clear: clearSelection,
  } = useSelection(data?.companies || []);

  // Get company IDs for per-company permission checks
  const companyIds = useMemo(
    () => data?.companies?.map((c) => c.id) || [],
    [data?.companies]
  );
  const { canEditCompany, canDeleteCompany } = useCompanyPermissions(companyIds);

  // Column width persistence
  const { data: columnPref } = useUserPreference<Record<string, number>>(COLUMN_PREF_KEY);
  const saveColumnPref = useUpsertUserPreference<Record<string, number>>();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const value = columnPref?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    setColumnWidths(value as Record<string, number>);
  }, [columnPref?.value]);

  const handleColumnWidthChange = useCallback((columnId: string, width: number) => {
    const nextWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(nextWidths);
    saveColumnPref.mutate({ key: COLUMN_PREF_KEY, value: nextWidths });
  }, [columnWidths, saveColumnPref]);

  // Memoize URL construction to avoid rebuilding on every render
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.uen) urlParams.set('uen', params.uen);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'name') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'asc') urlParams.set('sortOrder', params.sortOrder);
    if (params.entityType) urlParams.set('entityType', params.entityType);
    if (params.status) urlParams.set('status', params.status);
    if (params.hasCharges !== undefined) urlParams.set('hasCharges', params.hasCharges.toString());

    const queryString = urlParams.toString();
    return queryString ? `/companies?${queryString}` : '/companies';
  }, [params]);

  // Reset page and selection when tenant changes
  useEffect(() => {
    setParams((prev) => ({ ...prev, page: 1 }));
    clearSelection();
  }, [activeTenantId, clearSelection]);

  // Sync URL when params change
  useEffect(() => {
    // Only update if different
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
      page: 1
    }));
  };

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const handleLimitChange = (limit: number) => {
    setParams((prev) => ({ ...prev, limit, page: 1 }));
  };

  // Inline filter handler - maps inline filter fields to API params
  const handleInlineFilterChange = useCallback((filters: Partial<CompanyInlineFilters>) => {
    setParams((prev) => {
      const newParams: typeof prev & {
        incorporationDateFrom?: string;
        incorporationDateTo?: string;
        officersMin?: number;
        officersMax?: number;
        shareholdersMin?: number;
        shareholdersMax?: number;
        homeCurrency?: string;
        financialYearEndMonth?: number;
        paidUpCapitalMin?: number;
        paidUpCapitalMax?: number;
        issuedCapitalMin?: number;
        issuedCapitalMax?: number;
        address?: string;
        hasWarnings?: boolean;
      } = { ...prev, page: 1 };

      // companyName maps to query (the existing search field)
      if ('companyName' in filters) {
        newParams.query = filters.companyName || '';
      }

      // UEN filter - now properly supported by API
      if ('uen' in filters) {
        newParams.uen = filters.uen;
      }

      // Address filter
      if ('address' in filters) {
        newParams.address = filters.address;
      }

      // Warnings filter
      if ('hasWarnings' in filters) {
        newParams.hasWarnings = filters.hasWarnings;
      }

      // entityType and status map directly
      if ('entityType' in filters) {
        newParams.entityType = filters.entityType;
      }
      if ('status' in filters) {
        newParams.status = filters.status;
      }

      // Incorporation date range
      if ('incorporationDateFrom' in filters) {
        newParams.incorporationDateFrom = filters.incorporationDateFrom;
      }
      if ('incorporationDateTo' in filters) {
        newParams.incorporationDateTo = filters.incorporationDateTo;
      }

      // Officers count range
      if ('officersMin' in filters) {
        newParams.officersMin = filters.officersMin;
      }
      if ('officersMax' in filters) {
        newParams.officersMax = filters.officersMax;
      }

      // Shareholders count range
      if ('shareholdersMin' in filters) {
        newParams.shareholdersMin = filters.shareholdersMin;
      }
      if ('shareholdersMax' in filters) {
        newParams.shareholdersMax = filters.shareholdersMax;
      }

      // Home currency
      if ('homeCurrency' in filters) {
        newParams.homeCurrency = filters.homeCurrency;
      }

      // Financial year end month
      if ('financialYearEndMonth' in filters) {
        newParams.financialYearEndMonth = filters.financialYearEndMonth;
      }

      // Paid-up capital range
      if ('paidUpCapitalMin' in filters) {
        newParams.paidUpCapitalMin = filters.paidUpCapitalMin;
      }
      if ('paidUpCapitalMax' in filters) {
        newParams.paidUpCapitalMax = filters.paidUpCapitalMax;
      }

      // Issued capital range
      if ('issuedCapitalMin' in filters) {
        newParams.issuedCapitalMin = filters.issuedCapitalMin;
      }
      if ('issuedCapitalMax' in filters) {
        newParams.issuedCapitalMax = filters.issuedCapitalMax;
      }

      return newParams;
    });
  }, []);

  // Derive inline filter values from params for the table
  const inlineFilters: CompanyInlineFilters = useMemo(() => ({
    companyName: params.query || undefined,
    uen: params.uen,
    address: (params as Record<string, unknown>).address as string | undefined,
    entityType: params.entityType,
    status: params.status,
    incorporationDateFrom: (params as Record<string, unknown>).incorporationDateFrom as string | undefined,
    incorporationDateTo: (params as Record<string, unknown>).incorporationDateTo as string | undefined,
    officersMin: (params as Record<string, unknown>).officersMin as number | undefined,
    officersMax: (params as Record<string, unknown>).officersMax as number | undefined,
    shareholdersMin: (params as Record<string, unknown>).shareholdersMin as number | undefined,
    shareholdersMax: (params as Record<string, unknown>).shareholdersMax as number | undefined,
    homeCurrency: (params as Record<string, unknown>).homeCurrency as string | undefined,
    financialYearEndMonth: (params as Record<string, unknown>).financialYearEndMonth as number | undefined,
    paidUpCapitalMin: (params as Record<string, unknown>).paidUpCapitalMin as number | undefined,
    paidUpCapitalMax: (params as Record<string, unknown>).paidUpCapitalMax as number | undefined,
    issuedCapitalMin: (params as Record<string, unknown>).issuedCapitalMin as number | undefined,
    issuedCapitalMax: (params as Record<string, unknown>).issuedCapitalMax as number | undefined,
    hasWarnings: (params as Record<string, unknown>).hasWarnings as boolean | undefined,
  }), [params]);

  // Generate active filter chips
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; value: string; onRemove: () => void }> = [];

    if (inlineFilters.companyName) {
      chips.push({
        key: 'companyName',
        label: 'Company',
        value: inlineFilters.companyName,
        onRemove: () => handleInlineFilterChange({ companyName: undefined }),
      });
    }

    if (inlineFilters.uen) {
      chips.push({
        key: 'uen',
        label: 'UEN',
        value: inlineFilters.uen,
        onRemove: () => handleInlineFilterChange({ uen: undefined }),
      });
    }

    if (inlineFilters.address) {
      chips.push({
        key: 'address',
        label: 'Address',
        value: inlineFilters.address,
        onRemove: () => handleInlineFilterChange({ address: undefined }),
      });
    }

    if (inlineFilters.hasWarnings !== undefined) {
      chips.push({
        key: 'hasWarnings',
        label: 'Warnings',
        value: inlineFilters.hasWarnings ? 'Yes' : 'No',
        onRemove: () => handleInlineFilterChange({ hasWarnings: undefined }),
      });
    }

    if (inlineFilters.entityType) {
      chips.push({
        key: 'entityType',
        label: 'Type',
        value: getEntityTypeLabel(inlineFilters.entityType, true),
        onRemove: () => handleInlineFilterChange({ entityType: undefined }),
      });
    }

    if (inlineFilters.status) {
      chips.push({
        key: 'status',
        label: 'Status',
        value: getCompanyStatusLabel(inlineFilters.status),
        onRemove: () => handleInlineFilterChange({ status: undefined }),
      });
    }

    if (inlineFilters.incorporationDateFrom || inlineFilters.incorporationDateTo) {
      const from = inlineFilters.incorporationDateFrom;
      const to = inlineFilters.incorporationDateTo;
      let value = '';
      if (from && to) {
        value = `${from} - ${to}`;
      } else if (from) {
        value = `From ${from}`;
      } else if (to) {
        value = `To ${to}`;
      }
      chips.push({
        key: 'incorporationDate',
        label: 'Incorporated',
        value,
        onRemove: () => handleInlineFilterChange({ incorporationDateFrom: undefined, incorporationDateTo: undefined }),
      });
    }

    if (inlineFilters.officersMin !== undefined || inlineFilters.officersMax !== undefined) {
      const min = inlineFilters.officersMin;
      const max = inlineFilters.officersMax;
      let value = '';
      if (min !== undefined && max !== undefined && min === max) {
        value = `${min}`;
      } else if (min !== undefined && max !== undefined) {
        value = `${min} - ${max}`;
      } else if (min !== undefined) {
        value = `≥ ${min}`;
      } else if (max !== undefined) {
        value = `≤ ${max}`;
      }
      chips.push({
        key: 'officers',
        label: 'Officers',
        value,
        onRemove: () => handleInlineFilterChange({ officersMin: undefined, officersMax: undefined }),
      });
    }

    if (inlineFilters.shareholdersMin !== undefined || inlineFilters.shareholdersMax !== undefined) {
      const min = inlineFilters.shareholdersMin;
      const max = inlineFilters.shareholdersMax;
      let value = '';
      if (min !== undefined && max !== undefined && min === max) {
        value = `${min}`;
      } else if (min !== undefined && max !== undefined) {
        value = `${min} - ${max}`;
      } else if (min !== undefined) {
        value = `≥ ${min}`;
      } else if (max !== undefined) {
        value = `≤ ${max}`;
      }
      chips.push({
        key: 'shareholders',
        label: 'Shareholders',
        value,
        onRemove: () => handleInlineFilterChange({ shareholdersMin: undefined, shareholdersMax: undefined }),
      });
    }

    if (inlineFilters.homeCurrency) {
      chips.push({
        key: 'homeCurrency',
        label: 'Currency',
        value: inlineFilters.homeCurrency,
        onRemove: () => handleInlineFilterChange({ homeCurrency: undefined }),
      });
    }

    if (inlineFilters.financialYearEndMonth) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      chips.push({
        key: 'fye',
        label: 'FYE',
        value: monthNames[inlineFilters.financialYearEndMonth - 1] || String(inlineFilters.financialYearEndMonth),
        onRemove: () => handleInlineFilterChange({ financialYearEndMonth: undefined }),
      });
    }

    if (inlineFilters.paidUpCapitalMin !== undefined || inlineFilters.paidUpCapitalMax !== undefined) {
      const min = inlineFilters.paidUpCapitalMin;
      const max = inlineFilters.paidUpCapitalMax;
      let value = '';
      if (min !== undefined && max !== undefined && min === max) {
        value = `$${min.toLocaleString()}`;
      } else if (min !== undefined && max !== undefined) {
        value = `$${min.toLocaleString()} - $${max.toLocaleString()}`;
      } else if (min !== undefined) {
        value = `≥ $${min.toLocaleString()}`;
      } else if (max !== undefined) {
        value = `≤ $${max.toLocaleString()}`;
      }
      chips.push({
        key: 'paidUpCapital',
        label: 'Paid-up Capital',
        value,
        onRemove: () => handleInlineFilterChange({ paidUpCapitalMin: undefined, paidUpCapitalMax: undefined }),
      });
    }

    if (inlineFilters.issuedCapitalMin !== undefined || inlineFilters.issuedCapitalMax !== undefined) {
      const min = inlineFilters.issuedCapitalMin;
      const max = inlineFilters.issuedCapitalMax;
      let value = '';
      if (min !== undefined && max !== undefined && min === max) {
        value = `$${min.toLocaleString()}`;
      } else if (min !== undefined && max !== undefined) {
        value = `$${min.toLocaleString()} - $${max.toLocaleString()}`;
      } else if (min !== undefined) {
        value = `≥ $${min.toLocaleString()}`;
      } else if (max !== undefined) {
        value = `≤ $${max.toLocaleString()}`;
      }
      chips.push({
        key: 'issuedCapital',
        label: 'Issued Capital',
        value,
        onRemove: () => handleInlineFilterChange({ issuedCapitalMin: undefined, issuedCapitalMax: undefined }),
      });
    }

    return chips;
  }, [inlineFilters, handleInlineFilterChange]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setParams((prev) => ({
      ...prev,
      query: '',
      entityType: undefined,
      status: undefined,
      hasCharges: undefined,
      page: 1,
    }));
  }, []);

  // Derive company filter options from the loaded companies for the dropdown
  const companyFilterOptions: CompanyFilterOption[] = useMemo(() => {
    return data?.companies?.map(c => ({ id: c.id, name: c.name })) || [];
  }, [data?.companies]);

  const handleSort = (field: string) => {
    setParams((prev) => {
      if (prev.sortBy === field) {
        // Toggle order if same field
        return { ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      // New field, default to ascending
      return { ...prev, sortBy: field, sortOrder: 'asc' };
    });
  };

  const handleDeleteClick = (id: string) => {
    setCompanyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (reason?: string) => {
    if (!companyToDelete || !reason) return;

    try {
      await deleteCompany.mutateAsync({ id: companyToDelete, reason });
      success('Company deleted successfully');
      setDeleteDialogOpen(false);
      setCompanyToDelete(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete company');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setCompanyToDelete(null);
  };

  // Bulk delete handlers
  const handleBulkDeleteClick = () => {
    if (selectedCount === 0) return;
    setBulkDeleteDialogOpen(true);
  };

  const handleBulkDeleteConfirm = async (reason?: string) => {
    if (!reason || selectedCount === 0) return;

    try {
      const result = await bulkDeleteCompanies.mutateAsync({
        ids: Array.from(selectedIds),
        reason,
      });
      success(result.message);
      setBulkDeleteDialogOpen(false);
      clearSelection();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete companies');
    }
  };

  const handleBulkDeleteCancel = () => {
    setBulkDeleteDialogOpen(false);
  };

  const handleExportContactDetails = async () => {
    if (selectedCount === 0) return;

    try {
      await exportContactDetails.mutateAsync(Array.from(selectedIds));
      success('Contact details exported successfully');
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Companies</h1>
          <p className="text-text-secondary text-sm mt-1">
            Manage company records, BizFile uploads, and compliance tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          {can.createDocument && (
            <Link href="/companies/upload" className="btn-secondary btn-sm flex items-center gap-2">
              <FileUp className="w-4 h-4" />
              <span className="hidden sm:inline">Upload BizFile</span>
              <span className="sm:hidden">Upload</span>
            </Link>
          )}
          {can.createCompany && (
            <Link href="/companies/new" className="btn-primary btn-sm flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Company</span>
              <span className="sm:hidden">Add</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && !statsError && (
        <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-oak-primary/10">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-oak-light" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.total}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Total</p>
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
                    {stats.byStatus['LIVE'] || 0}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Live</p>
                </div>
              </div>
            </div>

            <div className="card card-compact sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.recentlyAdded}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">New (30d)</p>
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
                    {stats.withOverdueFilings}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Overdue</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters */}
      <div className="mb-6">
        <CompanyFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialFilters={{
            entityType: params.entityType,
            status: params.status,
            hasCharges: params.hasCharges,
            address: (params as Record<string, unknown>).address as string | undefined,
            homeCurrency: (params as Record<string, unknown>).homeCurrency as string | undefined,
            hasWarnings: (params as Record<string, unknown>).hasWarnings as boolean | undefined,
            incorporationDateFrom: (params as Record<string, unknown>).incorporationDateFrom as string | undefined,
            incorporationDateTo: (params as Record<string, unknown>).incorporationDateTo as string | undefined,
            officersMin: (params as Record<string, unknown>).officersMin as number | undefined,
            officersMax: (params as Record<string, unknown>).officersMax as number | undefined,
            shareholdersMin: (params as Record<string, unknown>).shareholdersMin as number | undefined,
            shareholdersMax: (params as Record<string, unknown>).shareholdersMax as number | undefined,
            paidUpCapitalMin: (params as Record<string, unknown>).paidUpCapitalMin as number | undefined,
            paidUpCapitalMax: (params as Record<string, unknown>).paidUpCapitalMax as number | undefined,
            issuedCapitalMin: (params as Record<string, unknown>).issuedCapitalMin as number | undefined,
            issuedCapitalMax: (params as Record<string, unknown>).issuedCapitalMax as number | undefined,
            financialYearEndMonth: (params as Record<string, unknown>).financialYearEndMonth as number | undefined,
          }}
          initialQuery={params.query}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load companies'}</p>
          </div>
        </div>
      )}

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
            className="text-sm text-text-muted hover:text-text-primary transition-colors ml-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Loading State - Only show on initial load when no data exists */}
      {isLoading && !data && (
        <div className="card p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-oak-light border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-text-secondary">Loading companies...</span>
        </div>
      )}

      {/* Table - Only render when data exists */}
      {data && (
        <CompanyTable
          companies={data.companies}
          onDelete={handleDeleteClick}
          isFetching={isFetching}
          canEdit={canEditCompany}
          canDelete={canDeleteCompany}
          canCreate={can.createCompany}
          selectable={can.deleteCompany || can.exportCompany}
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
          columnWidths={columnWidths}
          onColumnWidthChange={handleColumnWidthChange}
        />
      )}

      {/* Pagination */}
      {data && data.totalPages > 0 && (
        <div className="mt-4">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}

      {/* Floating Bulk Actions Toolbar */}
      {(can.deleteCompany || can.exportCompany) && (
        <BulkActionsToolbar
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
          itemLabel="company"
          actions={[
            ...(can.exportCompany ? [{
              id: 'export-contacts',
              label: 'Export Contacts',
              icon: Download,
              description: 'Export contact details to Excel',
              variant: 'default' as const,
              isLoading: exportContactDetails.isPending,
            }] : []),
            ...(can.deleteCompany ? [{
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              description: 'Delete selected companies',
              variant: 'danger' as const,
              isLoading: bulkDeleteCompanies.isPending,
            }] : []),
          ]}
          onAction={(actionId) => {
            if (actionId === 'delete') {
              handleBulkDeleteClick();
            } else if (actionId === 'export-contacts') {
              handleExportContactDetails();
            }
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Company"
        description="This action cannot be undone. The company will be soft-deleted and can be restored by an administrator."
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this company..."
        reasonMinLength={10}
        isLoading={deleteCompany.isPending}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={handleBulkDeleteCancel}
        onConfirm={handleBulkDeleteConfirm}
        title={`Delete ${selectedCount} ${selectedCount > 1 ? 'Companies' : 'Company'}`}
        description={`You are about to delete ${selectedCount} ${selectedCount > 1 ? 'companies' : 'company'}. This action cannot be undone. The companies will be soft-deleted and can be restored by an administrator.`}
        confirmLabel={`Delete ${selectedCount} ${selectedCount > 1 ? 'Companies' : 'Company'}`}
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting these companies..."
        reasonMinLength={10}
        isLoading={bulkDeleteCompanies.isPending}
      />
    </div>
  );
}
