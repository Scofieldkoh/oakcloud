'use client';

import { useState } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  usePurgeData,
  usePurgeRecords,
  useRestoreRecords,
  type PurgeableEntity,
  type PurgeableTenant,
  type PurgeableUser,
  type PurgeableCompany,
  type PurgeableContact,
} from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/companies/pagination';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Trash2,
  AlertTriangle,
  Building,
  Users,
  Building2,
  Contact,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type TabType = 'tenants' | 'users' | 'companies' | 'contacts';

const TABS: { id: TabType; label: string; icon: React.ReactNode; entityType: PurgeableEntity }[] = [
  { id: 'tenants', label: 'Tenants', icon: <Building className="w-4 h-4" />, entityType: 'tenant' },
  { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, entityType: 'user' },
  { id: 'companies', label: 'Companies', icon: <Building2 className="w-4 h-4" />, entityType: 'company' },
  { id: 'contacts', label: 'Contacts', icon: <Contact className="w-4 h-4" />, entityType: 'contact' },
];

export default function DataPurgePage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('tenants');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading, error, refetch } = usePurgeData();
  const purgeMutation = usePurgeRecords();
  const restoreMutation = useRestoreRecords();

  // Only SUPER_ADMIN can access this page
  if (!session?.isSuperAdmin) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="error">You do not have permission to access this page.</Alert>
      </div>
    );
  }

  const currentEntityType = TABS.find((t) => t.id === activeTab)?.entityType || 'tenant';
  const allRecords = data?.records?.[activeTab] || [];

  // Client-side pagination
  const totalRecords = allRecords.length;
  const totalPages = Math.ceil(totalRecords / limit);
  const startIndex = (page - 1) * limit;
  const currentRecords = allRecords.slice(startIndex, startIndex + limit);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === currentRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentRecords.map((r) => r.id)));
    }
  };

  // Compute selection states
  const isAllSelected = currentRecords.length > 0 && selectedIds.size === currentRecords.length;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < currentRecords.length;

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setPage(1); // Reset to first page when changing tabs
  };

  const handlePurge = async (reason?: string) => {
    if (selectedIds.size === 0 || !reason) return;

    try {
      const result = await purgeMutation.mutateAsync({
        entityType: currentEntityType,
        entityIds: Array.from(selectedIds),
        reason,
      });
      success(`Permanently deleted ${result.deletedCount} record(s)`);
      setSelectedIds(new Set());
      setConfirmDialogOpen(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to purge records');
    }
  };

  const handleRestore = async () => {
    if (selectedIds.size === 0) return;

    try {
      const result = await restoreMutation.mutateAsync({
        entityType: currentEntityType,
        entityIds: Array.from(selectedIds),
      });
      success(`Restored ${result.restoredCount} record(s)`);
      setSelectedIds(new Set());
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to restore records');
    }
  };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-status-error" />
            Data Purge
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Permanently delete soft-deleted records. This action cannot be undone.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw className="w-4 h-4" />}
          onClick={() => refetch()}
          isLoading={isLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Warning Banner */}
      <Alert variant="warning" className="mb-6">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Permanent Deletion Warning</p>
            <p className="text-sm mt-1">
              Records purged from this page will be permanently deleted from the database. This includes all related
              data (documents, assignments, audit logs for tenants). This action cannot be reversed.
            </p>
          </div>
        </div>
      </Alert>

      {/* Stats Cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {TABS.map((tab) => {
            const count = data.stats[tab.id as keyof typeof data.stats];
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'card p-4 text-left transition-all hover:shadow-md',
                  activeTab === tab.id && 'ring-2 ring-oak-primary'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      count > 0 ? 'bg-status-error/10 text-status-error' : 'bg-background-tertiary text-text-muted'
                    )}
                  >
                    {tab.icon}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-text-primary">{count}</p>
                    <p className="text-sm text-text-secondary">{tab.label}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error instanceof Error ? error.message : 'Failed to load data'}
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12 text-text-secondary">Loading soft-deleted records...</div>
      )}

      {/* Records Table */}
      {data && (
        <div className="card overflow-hidden">
          {/* Table Header with Actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between p-4 border-b border-border-primary bg-background-secondary">
              <span className="text-sm text-text-secondary">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                  onClick={handleRestore}
                  isLoading={restoreMutation.isPending}
                >
                  Restore ({selectedIds.size})
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 className="w-4 h-4" />}
                  onClick={() => setConfirmDialogOpen(true)}
                >
                  Purge ({selectedIds.size})
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">
                    <Checkbox
                      size="sm"
                      checked={isAllSelected}
                      indeterminate={isIndeterminate}
                      onChange={toggleSelectAll}
                      aria-label="Select all records"
                    />
                  </th>
                  {activeTab === 'tenants' && (
                    <>
                      <th>Tenant</th>
                      <th>Slug</th>
                      <th>Related Data</th>
                      <th>Reason</th>
                      <th>Deleted At</th>
                    </>
                  )}
                  {activeTab === 'users' && (
                    <>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Tenant</th>
                      <th>Deleted At</th>
                    </>
                  )}
                  {activeTab === 'companies' && (
                    <>
                      <th>Company</th>
                      <th>UEN</th>
                      <th>Related Data</th>
                      <th>Tenant</th>
                      <th>Deleted At</th>
                    </>
                  )}
                  {activeTab === 'contacts' && (
                    <>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Tenant</th>
                      <th>Deleted At</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'contacts' ? 5 : 6} className="text-center py-8 text-text-secondary">
                      No soft-deleted {activeTab} found
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((record) => (
                    <tr
                      key={record.id}
                      className={cn(selectedIds.has(record.id) && 'bg-oak-primary/5')}
                    >
                      <td>
                        <Checkbox
                          size="sm"
                          checked={selectedIds.has(record.id)}
                          onChange={() => toggleSelection(record.id)}
                          aria-label={`Select record`}
                        />
                      </td>

                      {activeTab === 'tenants' && (
                        <>
                          <td className="font-medium text-text-primary">
                            {(record as PurgeableTenant).name}
                          </td>
                          <td className="font-mono text-sm text-text-secondary">
                            {(record as PurgeableTenant).slug}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableTenant)._count.users} users,{' '}
                            {(record as PurgeableTenant)._count.companies} companies
                          </td>
                          <td className="text-sm text-text-secondary max-w-xs truncate" title={(record as PurgeableTenant).deletedReason || ''}>
                            {(record as PurgeableTenant).deletedReason || '—'}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {format(new Date(record.deletedAt), 'MMM d, yyyy HH:mm')}
                          </td>
                        </>
                      )}

                      {activeTab === 'users' && (
                        <>
                          <td className="font-medium text-text-primary">
                            {(record as PurgeableUser).firstName} {(record as PurgeableUser).lastName}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableUser).email}
                          </td>
                          <td>
                            <span className="badge bg-background-tertiary text-text-secondary">
                              {(record as PurgeableUser).role}
                            </span>
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableUser).tenant?.name || '—'}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {format(new Date(record.deletedAt), 'MMM d, yyyy HH:mm')}
                          </td>
                        </>
                      )}

                      {activeTab === 'companies' && (
                        <>
                          <td className="font-medium text-text-primary">
                            {(record as PurgeableCompany).name}
                          </td>
                          <td className="font-mono text-sm text-text-secondary">
                            {(record as PurgeableCompany).uen}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableCompany)._count.documents} docs,{' '}
                            {(record as PurgeableCompany)._count.officers} officers,{' '}
                            {(record as PurgeableCompany)._count.shareholders} shareholders
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableCompany).tenant?.name || '—'}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {format(new Date(record.deletedAt), 'MMM d, yyyy HH:mm')}
                          </td>
                        </>
                      )}

                      {activeTab === 'contacts' && (
                        <>
                          <td className="font-medium text-text-primary">
                            {(record as PurgeableContact).fullName}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableContact).email || '—'}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {(record as PurgeableContact).tenant?.name || '—'}
                          </td>
                          <td className="text-sm text-text-secondary">
                            {format(new Date(record.deletedAt), 'MMM d, yyyy HH:mm')}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalRecords > 0 && (
            <div className="p-4 border-t border-border-primary">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={totalRecords}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(newLimit) => {
                  setLimit(newLimit);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={handlePurge}
        title={`Permanently Delete ${selectedIds.size} ${activeTab.slice(0, -1)}${selectedIds.size > 1 ? 's' : ''}?`}
        description={`This will permanently remove ${selectedIds.size} record(s) and all related data from the database. This action cannot be undone.`}
        confirmLabel="Permanently Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Enter the reason for permanently deleting these records..."
        reasonMinLength={10}
        isLoading={purgeMutation.isPending}
      />
    </div>
  );
}
