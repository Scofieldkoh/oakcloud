'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Building2, AlertCircle, FileUp, Trash2 } from 'lucide-react';
import { useCompanies, useCompanyStats, useDeleteCompany, useBulkDeleteCompanies } from '@/hooks/use-companies';
import { usePermissions, useCompanyPermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { CompanyTable } from '@/components/companies/company-table';
import { CompanyFilters, type FilterValues } from '@/components/companies/company-filters';
import { Pagination } from '@/components/companies/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BulkActionsToolbar, type BulkAction } from '@/components/ui/bulk-actions-toolbar';
import { useToast } from '@/components/ui/toast';
import type { EntityType, CompanyStatus } from '@/generated/prisma';

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
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: searchParams.get('sortBy') || 'updatedAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
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
  const { data, isLoading, error } = useCompanies({
    ...params,
    tenantId: activeTenantId,
  });
  const { data: stats, error: statsError } = useCompanyStats(activeTenantId);
  const deleteCompany = useDeleteCompany();
  const bulkDeleteCompanies = useBulkDeleteCompanies();

  // Selection state for bulk operations
  const {
    selectedIds,
    selectedCount,
    isSelected,
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

  // Memoize URL construction to avoid rebuilding on every render
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'updatedAt') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'desc') urlParams.set('sortOrder', params.sortOrder);
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="card p-3 sm:p-4">
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

          <div className="card p-3 sm:p-4">
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

          <div className="card p-3 sm:p-4">
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

          <div className="card p-3 sm:p-4">
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
          }}
          initialQuery={params.query}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load companies'}</p>
          </div>
        </div>
      )}


      {/* Table */}
      <div className="mb-6">
        <CompanyTable
          companies={data?.companies || []}
          onDelete={handleDeleteClick}
          isLoading={isLoading}
          canEdit={canEditCompany}
          canDelete={canDeleteCompany}
          canCreate={can.createCompany}
          selectable={can.deleteCompany}
          selectedIds={selectedIds}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
          isAllSelected={isAllSelected}
          isIndeterminate={isIndeterminate}
        />
      </div>

      {/* Pagination */}
      {data && data.totalPages > 0 && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          limit={data.limit}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      )}

      {/* Floating Bulk Actions Toolbar */}
      {can.deleteCompany && (
        <BulkActionsToolbar
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
          itemLabel="company"
          actions={[
            {
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              description: 'Delete selected companies',
              variant: 'danger',
              isLoading: bulkDeleteCompanies.isPending,
            },
          ]}
          onAction={(actionId) => {
            if (actionId === 'delete') {
              handleBulkDeleteClick();
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
