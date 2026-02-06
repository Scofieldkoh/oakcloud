'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Users, AlertCircle, Building2, User, Trash2, X, RefreshCw } from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { useContacts, useDeleteContact, useBulkDeleteContacts } from '@/hooks/use-contacts';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSelection } from '@/hooks/use-selection';
import { useUserPreference, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { ContactTable, type ContactInlineFilters, type ContactFilterOption } from '@/components/contacts/contact-table';
import { ContactFilters, type FilterValues } from '@/components/contacts/contact-filters';
import { Pagination } from '@/components/companies/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar';
import { useToast } from '@/components/ui/toast';
import type { ContactType, IdentificationType } from '@/generated/prisma';

// Types for search params
type SortByField = 'fullName' | 'contactType' | 'nationality' | 'companyRelationsCount' | 'createdAt' | 'updatedAt';

interface ContactPageParams {
  query: string;
  page: number;
  limit: number;
  sortBy: SortByField;
  sortOrder: 'asc' | 'desc';
  contactType?: ContactType;
  // Inline filters
  fullName?: string;
  identificationType?: IdentificationType;
  identificationNumber?: string;
  nationality?: string;
  email?: string;
  phone?: string;
  companiesMin?: number;
  companiesMax?: number;
}

// Filter chip type for active filters display
interface ActiveFilterChip {
  key: string;
  label: string;
  onClear: () => void;
}

const CONTACT_SEARCH_INPUT_ID = 'contacts-search-input';

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

  // Column width persistence
  const COLUMN_PREF_KEY = 'contact-table-column-widths';
  const { data: columnPref } = useUserPreference<Record<string, number>>(COLUMN_PREF_KEY);
  const saveColumnPref = useUpsertUserPreference<Record<string, number>>();
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const value = columnPref?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    setColumnWidths(value as Record<string, number>);
  }, [columnPref?.value]);

  // Parse URL params
  const getParamsFromUrl = useCallback((): ContactPageParams => {
    return {
      query: searchParams.get('q') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: (searchParams.get('sortBy') || 'fullName') as SortByField,
      sortOrder: (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc',
      contactType: (searchParams.get('contactType') || undefined) as ContactType | undefined,
      // Inline filters
      fullName: searchParams.get('fullName') || undefined,
      identificationType: (searchParams.get('identificationType') || undefined) as IdentificationType | undefined,
      identificationNumber: searchParams.get('identificationNumber') || undefined,
      nationality: searchParams.get('nationality') || undefined,
      email: searchParams.get('email') || undefined,
      phone: searchParams.get('phone') || undefined,
      companiesMin: searchParams.get('companiesMin') ? parseInt(searchParams.get('companiesMin')!, 10) : undefined,
      companiesMax: searchParams.get('companiesMax') ? parseInt(searchParams.get('companiesMax')!, 10) : undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Pass tenantId to filter contacts by selected tenant (for SUPER_ADMIN)
  const { data, isLoading, isFetching, error, refetch } = useContacts({
    ...params,
    tenantId: activeTenantId,
  });
  const deleteContact = useDeleteContact();
  const bulkDeleteContacts = useBulkDeleteContacts();

  // Selection state for bulk operations
  const {
    selectedIds,
    selectedCount,
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

  // Generate contact filter options for the name dropdown
  const contactFilterOptions: ContactFilterOption[] = useMemo(() => {
    if (!data?.contacts) return [];
    return data.contacts.map((c) => ({ id: c.id, name: c.fullName }));
  }, [data?.contacts]);

  // Memoize URL construction
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'fullName') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'asc') urlParams.set('sortOrder', params.sortOrder);
    if (params.contactType) urlParams.set('contactType', params.contactType);
    // Inline filters
    if (params.fullName) urlParams.set('fullName', params.fullName);
    if (params.identificationType) urlParams.set('identificationType', params.identificationType);
    if (params.identificationNumber) urlParams.set('identificationNumber', params.identificationNumber);
    if (params.nationality) urlParams.set('nationality', params.nationality);
    if (params.email) urlParams.set('email', params.email);
    if (params.phone) urlParams.set('phone', params.phone);
    if (params.companiesMin !== undefined) urlParams.set('companiesMin', params.companiesMin.toString());
    if (params.companiesMax !== undefined) urlParams.set('companiesMax', params.companiesMax.toString());

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

  const handleInlineFilterChange = useCallback((filters: Partial<ContactInlineFilters>) => {
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
        // Toggle order if same field
        return { ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      // New field, default to ascending
      return { ...prev, sortBy: field as SortByField, sortOrder: 'asc' };
    });
  };

  const handleColumnWidthChange = useCallback((columnId: string, width: number) => {
    const nextWidths = { ...columnWidths, [columnId]: width };
    setColumnWidths(nextWidths);
    saveColumnPref.mutate({ key: COLUMN_PREF_KEY, value: nextWidths });
  }, [columnWidths, saveColumnPref]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const focusSearchInput = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.getElementById(CONTACT_SEARCH_INPUT_ID) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

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

  useKeyboardShortcuts([
    {
      key: 'r',
      ctrl: true,
      handler: handleRefresh,
      description: 'Refresh contacts',
    },
    ...(can.createContact ? [{
      key: 'F1',
      handler: () => router.push('/contacts/new'),
      description: 'Add contact',
    }] : []),
    {
      key: 'k',
      ctrl: true,
      handler: focusSearchInput,
      description: 'Focus search',
    },
  ]);

  // Build active filter chips
  const activeFilterChips: ActiveFilterChip[] = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (params.fullName) {
      chips.push({
        key: 'fullName',
        label: `Name: ${params.fullName}`,
        onClear: () => setParams((p) => ({ ...p, fullName: undefined, page: 1 })),
      });
    }
    if (params.contactType) {
      chips.push({
        key: 'contactType',
        label: `Type: ${params.contactType === 'INDIVIDUAL' ? 'Individual' : 'Corporate'}`,
        onClear: () => setParams((p) => ({ ...p, contactType: undefined, page: 1 })),
      });
    }
    if (params.identificationType) {
      const labels: Record<IdentificationType, string> = {
        NRIC: 'NRIC', FIN: 'FIN', PASSPORT: 'Passport', UEN: 'UEN', OTHER: 'Other'
      };
      chips.push({
        key: 'identificationType',
        label: `ID Type: ${labels[params.identificationType]}`,
        onClear: () => setParams((p) => ({ ...p, identificationType: undefined, page: 1 })),
      });
    }
    if (params.identificationNumber) {
      chips.push({
        key: 'identificationNumber',
        label: `ID: ${params.identificationNumber}`,
        onClear: () => setParams((p) => ({ ...p, identificationNumber: undefined, page: 1 })),
      });
    }
    if (params.nationality) {
      chips.push({
        key: 'nationality',
        label: `Nationality: ${params.nationality}`,
        onClear: () => setParams((p) => ({ ...p, nationality: undefined, page: 1 })),
      });
    }
    if (params.email) {
      chips.push({
        key: 'email',
        label: `Email: ${params.email}`,
        onClear: () => setParams((p) => ({ ...p, email: undefined, page: 1 })),
      });
    }
    if (params.phone) {
      chips.push({
        key: 'phone',
        label: `Phone: ${params.phone}`,
        onClear: () => setParams((p) => ({ ...p, phone: undefined, page: 1 })),
      });
    }
    if (params.companiesMin !== undefined || params.companiesMax !== undefined) {
      let label = 'Companies: ';
      if (params.companiesMin !== undefined && params.companiesMax !== undefined) {
        label += params.companiesMin === params.companiesMax
          ? `${params.companiesMin}`
          : `${params.companiesMin} - ${params.companiesMax}`;
      } else if (params.companiesMin !== undefined) {
        label += `≥ ${params.companiesMin}`;
      } else {
        label += `≤ ${params.companiesMax}`;
      }
      chips.push({
        key: 'companies',
        label,
        onClear: () => setParams((p) => ({ ...p, companiesMin: undefined, companiesMax: undefined, page: 1 })),
      });
    }

    return chips;
  }, [params]);

  const clearAllFilters = () => {
    setParams((p) => ({
      ...p,
      fullName: undefined,
      contactType: undefined,
      identificationType: undefined,
      identificationNumber: undefined,
      nationality: undefined,
      email: undefined,
      phone: undefined,
      companiesMin: undefined,
      companiesMax: undefined,
      page: 1,
    }));
  };

  // Map params to inline filters
  const inlineFilters: ContactInlineFilters = useMemo(() => ({
    fullName: params.fullName,
    contactType: params.contactType,
    identificationType: params.identificationType,
    identificationNumber: params.identificationNumber,
    nationality: params.nationality,
    email: params.email,
    phone: params.phone,
    companiesMin: params.companiesMin,
    companiesMax: params.companiesMax,
  }), [params]);

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
          <button
            type="button"
            onClick={handleRefresh}
            className="btn-secondary btn-sm flex items-center gap-2"
            aria-label="Refresh contacts"
            title="Refresh list (Ctrl+R)"
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh (Ctrl+R)</span>
            <span className="sm:hidden">Refresh</span>
          </button>
          {can.createContact && (
            <Link href="/contacts/new" className="btn-primary btn-sm flex items-center gap-2" title="Add contact (F1)">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Contact (F1)</span>
              <span className="sm:hidden">Add</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card card-compact sm:p-4">
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

            <div className="card card-compact sm:p-4">
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

            <div className="card card-compact sm:p-4">
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

            <div className="card card-compact sm:p-4">
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
            fullName: params.fullName,
            identificationType: params.identificationType,
            identificationNumber: params.identificationNumber,
            nationality: params.nationality,
            email: params.email,
            phone: params.phone,
            companiesMin: params.companiesMin,
            companiesMax: params.companiesMax,
          }}
          initialQuery={params.query}
          searchInputId={CONTACT_SEARCH_INPUT_ID}
        />
      </div>

      {/* Active Filter Chips */}
      {activeFilterChips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">Active filters:</span>
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={chip.onClear}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-oak-primary/10 text-oak-light hover:bg-oak-primary/20 transition-colors group"
            >
              <span>{chip.label}</span>
              <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
          {activeFilterChips.length > 1 && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-text-secondary hover:text-text-primary underline ml-2"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load contacts'}</p>
          </div>
        </div>
      )}


      {/* Table */}
      <div>
        <ContactTable
          contacts={data?.contacts || []}
          onDelete={handleDeleteClick}
          isLoading={isLoading}
          isFetching={isFetching}
          canEdit={can.updateContact}
          canDelete={can.deleteContact}
          canCreate={can.createContact}
          selectable={can.deleteContact}
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
          contactFilterOptions={contactFilterOptions}
          columnWidths={columnWidths}
          onColumnWidthChange={handleColumnWidthChange}
        />
      </div>

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
