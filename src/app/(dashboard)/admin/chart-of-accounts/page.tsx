'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useChartOfAccounts,
  useDeleteAccount,
  useAccountsForSelect,
  type AccountSearchParams,
  type ChartOfAccount,
} from '@/hooks/use-chart-of-accounts';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES, ACCOUNT_TYPE_NAMES, ACCOUNT_STATUS_NAMES } from '@/lib/validations/chart-of-accounts';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/companies/pagination';
import { useToast } from '@/components/ui/toast';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { TenantSelector } from '@/components/ui/tenant-selector';
import {
  AccountTypeBadge,
  AccountStatusBadge,
  AccountScopeBadge,
  AccountFormModal,
  AccountActionsDropdown,
} from '@/components/chart-of-accounts';
import {
  Plus,
  Search,
  Loader2,
  BookOpen,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useTenantStore } from '@/stores/tenant-store';
import type { AccountType, AccountStatus } from '@/generated/prisma';
import { useDebouncedCallback } from 'use-debounce';

// ============================================================================
// Helper Components
// ============================================================================

/** Sortable column header component */
function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}) {
  const isActive = sortBy === field;

  if (!onSort) {
    return <th>{label}</th>;
  }

  return (
    <th className="cursor-pointer select-none group">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-text-primary transition-colors',
          isActive ? 'text-text-primary' : ''
        )}
      >
        <span>{label}</span>
        {isActive ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-oak-light" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-oak-light" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100" />
        )}
      </button>
    </th>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ChartOfAccountsPage() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const toast = useToast();
  const { selectedTenantId, setSelectedTenant } = useTenantStore();

  // State - show all results by default (no pagination)
  const [params, setParams] = useState<AccountSearchParams>({
    page: 1,
    limit: 500, // Show all accounts by default
    sortBy: 'sortOrder',
    sortOrder: 'asc',
    includeSystem: true,
  });
  const [search, setSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountType | ''>('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | ''>('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<ChartOfAccount | null>(null);
  // Collapsed parents - start with null to indicate "collapse all on first load"
  const [collapsedParents, setCollapsedParents] = useState<Set<string> | null>(null);

  // Determine tenant context
  const effectiveTenantId = session?.isSuperAdmin ? selectedTenantId : session?.tenantId;

  // Build query params
  const queryParams = useMemo<AccountSearchParams>(() => ({
    ...params,
    search: search || undefined,
    accountType: accountTypeFilter || undefined,
    status: statusFilter || undefined,
    tenantId: effectiveTenantId || undefined,
  }), [params, search, accountTypeFilter, statusFilter, effectiveTenantId]);

  // Queries
  const { data, isLoading, refetch } = useChartOfAccounts(queryParams);
  const { data: parentOptions } = useAccountsForSelect({ tenantId: effectiveTenantId });
  const deleteAccount = useDeleteAccount();

  // Debounced search
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearch(value);
    setParams((prev) => ({ ...prev, page: 1 }));
  }, 300);

  // Handlers
  const handleSort = useCallback((field: string) => {
    setParams((prev) => {
      if (prev.sortBy === field) {
        return { ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      return { ...prev, sortBy: field as AccountSearchParams['sortBy'], sortOrder: 'asc' };
    });
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const handleEdit = useCallback((account: ChartOfAccount) => {
    setEditingAccount(account);
    setShowFormModal(true);
  }, []);

  const handleDelete = useCallback((account: ChartOfAccount) => {
    setDeletingAccount(account);
  }, []);

  const handleConfirmDelete = useCallback(async (reason?: string) => {
    if (!deletingAccount) return;

    try {
      await deleteAccount.mutateAsync({ id: deletingAccount.id, reason: reason || '' });
      toast.success('Account deleted successfully');
      setDeletingAccount(null);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete account');
    }
  }, [deletingAccount, deleteAccount, toast, refetch]);

  const handleFormSuccess = useCallback(() => {
    toast.success(editingAccount ? 'Account updated successfully' : 'Account created successfully');
    setShowFormModal(false);
    setEditingAccount(null);
    refetch();
  }, [editingAccount, toast, refetch]);

  // Toggle parent collapse state
  const toggleParent = useCallback((parentId: string) => {
    setCollapsedParents((prev) => {
      const current = prev || new Set<string>();
      const next = new Set(current);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }, []);

  // Expand all parents
  const expandAll = useCallback(() => {
    setCollapsedParents(new Set());
  }, []);

  // Collapse all parents - calculate inline to avoid dependency issues
  const collapseAll = useCallback(() => {
    if (!data?.accounts) return;
    // Build parent IDs set inline
    const accountParentIds = new Set(data.accounts.map((a) => a.parentId).filter(Boolean));
    const parentIds = new Set<string>();
    data.accounts.forEach((account) => {
      if (accountParentIds.has(account.id)) {
        parentIds.add(account.id);
      }
    });
    setCollapsedParents(parentIds);
  }, [data?.accounts]);

  // Initialize collapsed state when data loads (collapse all by default)
  useMemo(() => {
    if (data?.accounts && collapsedParents === null) {
      const accountParentIds = new Set(data.accounts.map((a) => a.parentId).filter(Boolean));
      const parentIds = new Set<string>();
      data.accounts.forEach((account) => {
        if (accountParentIds.has(account.id)) {
          parentIds.add(account.id);
        }
      });
      setCollapsedParents(parentIds);
    }
  }, [data?.accounts, collapsedParents]);

  // Parent options for the form modal
  const parentSelectOptions = useMemo(() => {
    if (!parentOptions) return [];
    return parentOptions.map((opt) => ({
      value: opt.id,
      label: `${opt.code} - ${opt.name}`,
    }));
  }, [parentOptions]);

  // Filter options
  const accountTypeOptions = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: ACCOUNT_TYPE_NAMES[type],
  }));

  const statusOptions = ACCOUNT_STATUSES.map((status) => ({
    value: status,
    label: ACCOUNT_STATUS_NAMES[status],
  }));

  // Compute account depth map for hierarchical display
  const accountDepthMap = useMemo(() => {
    const depthMap = new Map<string, number>();
    if (!data?.accounts) return depthMap;

    // Build parent lookup map
    const parentMap = new Map<string, string | null>();
    data.accounts.forEach((account) => {
      parentMap.set(account.id, account.parentId);
    });

    // Calculate depth for each account
    const getDepth = (accountId: string, visited = new Set<string>()): number => {
      if (visited.has(accountId)) return 0; // Prevent cycles
      visited.add(accountId);

      const parentId = parentMap.get(accountId);
      if (!parentId) return 0;

      // Check if parent is in our current list
      if (parentMap.has(parentId)) {
        return 1 + getDepth(parentId, visited);
      }
      // Parent exists but not in current view (e.g., filtered out)
      return 1;
    };

    data.accounts.forEach((account) => {
      depthMap.set(account.id, getDepth(account.id));
    });

    return depthMap;
  }, [data?.accounts]);

  // Check if an account has children in the current view
  const accountHasChildrenMap = useMemo(() => {
    const hasChildrenMap = new Map<string, boolean>();
    if (!data?.accounts) return hasChildrenMap;

    const parentIds = new Set(data.accounts.map((a) => a.parentId).filter(Boolean));
    data.accounts.forEach((account) => {
      hasChildrenMap.set(account.id, parentIds.has(account.id));
    });

    return hasChildrenMap;
  }, [data?.accounts]);

  // Filter visible accounts based on collapsed state
  const visibleAccounts = useMemo(() => {
    if (!data?.accounts) return [];
    const collapsed = collapsedParents || new Set<string>();

    return data.accounts.filter((account) => {
      // Always show root accounts (no parent)
      if (!account.parentId) return true;

      // Check if any ancestor is collapsed
      let currentParentId: string | null = account.parentId;
      while (currentParentId) {
        if (collapsed.has(currentParentId)) {
          return false; // Hide this account
        }
        // Find the parent account to check its parent
        const parentAccount = data.accounts.find((a) => a.id === currentParentId);
        currentParentId = parentAccount?.parentId || null;
      }

      return true;
    });
  }, [data?.accounts, collapsedParents]);

  // Count children for display
  const childCountMap = useMemo(() => {
    const countMap = new Map<string, number>();
    if (!data?.accounts) return countMap;

    data.accounts.forEach((account) => {
      if (account.parentId) {
        countMap.set(account.parentId, (countMap.get(account.parentId) || 0) + 1);
      }
    });

    return countMap;
  }, [data?.accounts]);

  // Check if any parents have children (for showing expand/collapse buttons)
  const hasAnyParentWithChildren = useMemo(() => {
    if (!data?.accounts) return false;
    return data.accounts.some((account) => accountHasChildrenMap.get(account.id));
  }, [data?.accounts, accountHasChildrenMap]);

  // Check permissions
  const canCreate = session?.isSuperAdmin || session?.isTenantAdmin;
  const canEdit = session?.isSuperAdmin || session?.isTenantAdmin;
  const canDelete = session?.isSuperAdmin || session?.isTenantAdmin;

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Chart of Accounts
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your chart of accounts for financial reporting
          </p>
        </div>
        {canCreate && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setEditingAccount(null);
              setShowFormModal(true);
            }}
          >
            Add Account
          </Button>
        )}
      </div>

      {/* SUPER_ADMIN Tenant Selector */}
      {session?.isSuperAdmin && (
        <div className="mb-6">
          <TenantSelector
            value={selectedTenantId}
            onChange={(id) => setSelectedTenant(id)}
            placeholder="All Tenants (System Accounts)"
            helpText="Select a tenant to view tenant-specific accounts, or leave empty to view system accounts."
          />
        </div>
      )}

      {/* Empty state for SUPER_ADMIN without tenant selected */}
      {session?.isSuperAdmin && !selectedTenantId && (
        <div className="text-center py-12 bg-background-secondary border border-border-primary rounded-lg mb-6">
          <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            Viewing System Accounts
          </h3>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            You are viewing system-level accounts. Select a tenant above to view or manage tenant-specific accounts.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <FormInput
            placeholder="Search by code or name..."
            leftIcon={<Search className="w-4 h-4" />}
            onChange={(e) => debouncedSearch(e.target.value)}
            inputSize="sm"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={accountTypeFilter}
            onChange={(e) => {
              setAccountTypeFilter(e.target.value as AccountType | '');
              setParams((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-3 py-1.5 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-oak-primary"
          >
            <option value="">All Types</option>
            {accountTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as AccountStatus | '');
              setParams((prev) => ({ ...prev, page: 1 }));
            }}
            className="px-3 py-1.5 text-sm rounded-md border border-border-primary bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-oak-primary"
          >
            <option value="">All Status</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Expand/Collapse buttons */}
          {hasAnyParentWithChildren && (
            <button
              type="button"
              onClick={(collapsedParents?.size || 0) > 0 ? expandAll : collapseAll}
              className="px-3 py-1.5 text-sm rounded-md border border-border-primary bg-background-primary text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors flex items-center gap-1.5"
              title={(collapsedParents?.size || 0) > 0 ? 'Expand all' : 'Collapse all'}
            >
              <ChevronsUpDown className="w-4 h-4" />
              <span className="hidden sm:inline">
                {(collapsedParents?.size || 0) > 0 ? 'Expand All' : 'Collapse All'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data && data.accounts.length === 0 && (
        <div className="text-center py-12 bg-background-secondary border border-border-primary rounded-lg">
          <BookOpen className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No accounts found
          </h3>
          <p className="text-sm text-text-secondary">
            {search || accountTypeFilter || statusFilter
              ? 'Try adjusting your filters'
              : 'Get started by adding your first account'}
          </p>
        </div>
      )}

      {/* Mobile Card View */}
      {!isLoading && data && visibleAccounts.length > 0 && (
        <div className="md:hidden space-y-3">
          {visibleAccounts.map((account) => {
            const depth = accountDepthMap.get(account.id) || 0;
            const isChild = depth > 0;
            const hasChildren = accountHasChildrenMap.get(account.id) || false;
            const isCollapsed = collapsedParents?.has(account.id) || false;
            const childCount = childCountMap.get(account.id) || 0;

            return (
              <div
                key={account.id}
                className={cn(isChild && 'ml-4 border-l-2 border-border-secondary pl-3')}
              >
                <MobileCard
                  title={
                    <div className="flex items-center gap-2">
                      {/* Collapsible toggle for parents */}
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleParent(account.id);
                          }}
                          className="p-0.5 rounded hover:bg-background-tertiary transition-colors"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5 text-oak-light" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-oak-light" />
                          )}
                        </button>
                      )}
                      {isChild && (
                        <CornerDownRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                      )}
                      <Link
                        href={`/admin/chart-of-accounts/${account.id}`}
                        className="flex items-center gap-2 hover:text-oak-primary transition-colors"
                      >
                        <span className="font-mono text-sm">{account.code}</span>
                        <span className={cn('text-text-primary', isChild && 'text-text-secondary')}>
                          {account.name}
                        </span>
                      </Link>
                      {hasChildren && isCollapsed && (
                        <span className="text-xs text-text-muted">({childCount})</span>
                      )}
                    </div>
                  }
                  badge={<AccountTypeBadge type={account.accountType} />}
                  actions={
                    <AccountActionsDropdown
                      account={account}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  }
                  details={
                    <CardDetailsGrid>
                      <CardDetailItem label="Status" value={<AccountStatusBadge status={account.status} />} />
                      <CardDetailItem
                        label="Scope"
                        value={
                          <AccountScopeBadge
                            tenantId={account.tenantId}
                            companyId={account.companyId}
                            isSystem={account.isSystem}
                          />
                        }
                      />
                      {account.parent && (
                        <CardDetailItem
                          label="Parent Account"
                          value={
                            <Link
                              href={`/admin/chart-of-accounts/${account.parent.id}`}
                              className="text-text-secondary hover:text-oak-primary transition-colors"
                            >
                              {account.parent.code} - {account.parent.name}
                            </Link>
                          }
                          fullWidth
                        />
                      )}
                    </CardDetailsGrid>
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Desktop Table View */}
      {!isLoading && data && visibleAccounts.length > 0 && (
        <div className="hidden md:block table-container">
          <table className="table">
            <thead>
              <tr>
                <SortableHeader
                  label="Code"
                  field="code"
                  sortBy={params.sortBy}
                  sortOrder={params.sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Account Name"
                  field="name"
                  sortBy={params.sortBy}
                  sortOrder={params.sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Type"
                  field="accountType"
                  sortBy={params.sortBy}
                  sortOrder={params.sortOrder}
                  onSort={handleSort}
                />
                <th>Status</th>
                <th>Scope</th>
                <th className="w-10">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => {
                const depth = accountDepthMap.get(account.id) || 0;
                const hasChildren = accountHasChildrenMap.get(account.id) || false;
                const isChild = depth > 0;
                const isCollapsed = collapsedParents?.has(account.id) || false;
                const childCount = childCountMap.get(account.id) || 0;

                return (
                  <tr
                    key={account.id}
                    className={cn(
                      'hover:bg-background-tertiary/50 transition-colors',
                      isChild && 'bg-background-secondary/30'
                    )}
                  >
                    <td className="font-mono text-sm">
                      <div className="flex items-center">
                        {/* Indentation spacer */}
                        {depth > 0 && (
                          <span
                            className="inline-block"
                            style={{ width: `${depth * 20}px` }}
                          />
                        )}
                        {/* Tree connector for child items */}
                        {isChild && (
                          <CornerDownRight className="w-3.5 h-3.5 text-text-muted mr-1.5 flex-shrink-0" />
                        )}
                        {/* Collapsible parent indicator */}
                        {!isChild && hasChildren && (
                          <button
                            type="button"
                            onClick={() => toggleParent(account.id)}
                            className="p-0.5 rounded hover:bg-background-tertiary transition-colors mr-1 flex-shrink-0"
                            title={isCollapsed ? 'Expand' : 'Collapse'}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-oak-light" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-oak-light" />
                            )}
                          </button>
                        )}
                        {/* Non-parent spacer for alignment */}
                        {!isChild && !hasChildren && (
                          <span className="inline-block w-5" />
                        )}
                        <Link
                          href={`/admin/chart-of-accounts/${account.id}`}
                          className="hover:text-oak-primary hover:underline transition-colors"
                        >
                          {account.code}
                        </Link>
                        {/* Child count when collapsed */}
                        {hasChildren && isCollapsed && (
                          <span className="ml-1 text-xs text-text-muted">({childCount})</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center">
                        {/* Indentation for name too for visual consistency */}
                        {depth > 0 && (
                          <span
                            className="inline-block"
                            style={{ width: `${depth * 12}px` }}
                          />
                        )}
                        <Link
                          href={`/admin/chart-of-accounts/${account.id}`}
                          className={cn(
                            'hover:text-oak-primary hover:underline transition-colors',
                            isChild && 'text-text-secondary'
                          )}
                        >
                          {account.name}
                        </Link>
                      </div>
                    </td>
                    <td><AccountTypeBadge type={account.accountType} /></td>
                    <td><AccountStatusBadge status={account.status} /></td>
                    <td>
                      <AccountScopeBadge
                        tenantId={account.tenantId}
                        companyId={account.companyId}
                        isSystem={account.isSystem}
                      />
                    </td>
                    <td>
                      <AccountActionsDropdown
                        account={account}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        canEdit={canEdit}
                        canDelete={canDelete}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={handlePageChange}
            total={data.total}
            limit={data.limit}
          />
        </div>
      )}

      {/* Form Modal */}
      <AccountFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingAccount(null);
        }}
        account={editingAccount}
        parentOptions={parentSelectOptions}
        tenantId={effectiveTenantId}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingAccount}
        onClose={() => setDeletingAccount(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Account"
        description={`Are you sure you want to delete the account "${deletingAccount?.code} - ${deletingAccount?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
