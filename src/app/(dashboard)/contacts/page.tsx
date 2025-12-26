'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Users, AlertCircle, Building2, User, Trash2 } from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { useContacts, useDeleteContact, useBulkDeleteContacts } from '@/hooks/use-contacts';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { ContactTable } from '@/components/contacts/contact-table';
import { ContactFilters, type FilterValues } from '@/components/contacts/contact-filters';
import { Pagination } from '@/components/companies/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar';
import { useToast } from '@/components/ui/toast';
import type { ContactType } from '@/generated/prisma';

export default function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();
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
      sortBy: (searchParams.get('sortBy') || 'fullName') as 'fullName' | 'createdAt' | 'updatedAt',
      sortOrder: (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc',
      contactType: (searchParams.get('contactType') || undefined) as ContactType | undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Pass tenantId to filter contacts by selected tenant (for SUPER_ADMIN)
  const { data, isLoading, error } = useContacts({
    ...params,
    tenantId: activeTenantId,
  });
  const deleteContact = useDeleteContact();
  const bulkDeleteContacts = useBulkDeleteContacts();

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
  } = useSelection(data?.contacts || []);

  // Calculate stats from current data
  const stats = useMemo(() => {
    if (!data) return null;
    const individuals = data.contacts.filter((c) => c.contactType === 'INDIVIDUAL').length;
    const corporates = data.contacts.filter((c) => c.contactType === 'CORPORATE').length;
    const withCompanies = data.contacts.filter((c) => (c._count?.companyRelations || 0) > 0).length;
    return {
      total: data.total,
      individuals,
      corporates,
      withCompanies,
    };
  }, [data]);

  // Memoize URL construction
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'fullName') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'asc') urlParams.set('sortOrder', params.sortOrder);
    if (params.contactType) urlParams.set('contactType', params.contactType);

    const queryString = urlParams.toString();
    return queryString ? `/contacts?${queryString}` : '/contacts';
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

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const handleLimitChange = (limit: number) => {
    setParams((prev) => ({ ...prev, limit, page: 1 }));
  };

  const handleDeleteClick = (id: string) => {
    setContactToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (reason?: string) => {
    if (!contactToDelete || !reason) return;

    try {
      await deleteContact.mutateAsync({ id: contactToDelete, reason });
      success('Contact deleted successfully');
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete contact');
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setContactToDelete(null);
  };

  // Bulk delete handlers
  const handleBulkDeleteClick = () => {
    if (selectedCount === 0) return;
    setBulkDeleteDialogOpen(true);
  };

  const handleBulkDeleteConfirm = async (reason?: string) => {
    if (!reason || selectedCount === 0) return;

    try {
      const result = await bulkDeleteContacts.mutateAsync({
        ids: Array.from(selectedIds),
        reason,
      });
      success(result.message);
      setBulkDeleteDialogOpen(false);
      clearSelection();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete contacts');
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
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Contacts</h1>
          <p className="text-text-secondary text-sm mt-1">
            Manage individuals and corporate contacts linked to companies
          </p>
        </div>
        <div className="flex items-center gap-3">
          {can.createContact && (
            <Link href="/contacts/new" className="btn-primary btn-sm flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Contact</span>
              <span className="sm:hidden">Add</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-oak-primary/10">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-oak-light" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.total}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Total</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.individuals}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Individuals</p>
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
                    {stats.corporates}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Corporates</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-warning/10">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.withCompanies}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Linked</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters */}
      <div className="mb-6">
        <ContactFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialFilters={{
            contactType: params.contactType,
          }}
          initialQuery={params.query}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load contacts'}</p>
          </div>
        </div>
      )}


      {/* Table */}
      <div className="mb-6">
        <ContactTable
          contacts={data?.contacts || []}
          onDelete={handleDeleteClick}
          isLoading={isLoading}
          canEdit={can.updateContact}
          canDelete={can.deleteContact}
          canCreate={can.createContact}
          selectable={can.deleteContact}
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
      {can.deleteContact && (
        <BulkActionsToolbar
          selectedCount={selectedCount}
          onClearSelection={clearSelection}
          itemLabel="contact"
          actions={[
            {
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              description: 'Delete selected contacts',
              variant: 'danger',
              isLoading: bulkDeleteContacts.isPending,
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
        title="Delete Contact"
        description="This action cannot be undone. The contact will be soft-deleted and can be restored by an administrator."
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this contact..."
        reasonMinLength={10}
        isLoading={deleteContact.isPending}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={handleBulkDeleteCancel}
        onConfirm={handleBulkDeleteConfirm}
        title={`Delete ${selectedCount} Contact${selectedCount > 1 ? 's' : ''}`}
        description={`You are about to delete ${selectedCount} contact${selectedCount > 1 ? 's' : ''}. This action cannot be undone. The contacts will be soft-deleted and can be restored by an administrator.`}
        confirmLabel={`Delete ${selectedCount} Contact${selectedCount > 1 ? 's' : ''}`}
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting these contacts..."
        reasonMinLength={10}
        isLoading={bulkDeleteContacts.isPending}
      />
    </div>
  );
}
