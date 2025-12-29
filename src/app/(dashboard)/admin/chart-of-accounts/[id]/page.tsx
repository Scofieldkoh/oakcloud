'use client';

import { use, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  History,
  Pencil,
  Trash2,
  AlertCircle,
  ChevronRight,
  CornerDownRight,
} from 'lucide-react';
import {
  useAccount,
  useChartOfAccounts,
  useDeleteAccount,
  useAccountsForSelect,
  type ChartOfAccount,
} from '@/hooks/use-chart-of-accounts';
import { useSession } from '@/hooks/use-auth';
import { formatDate } from '@/lib/utils';
import { ACCOUNT_TYPE_NAMES, ACCOUNT_STATUS_NAMES } from '@/lib/validations/chart-of-accounts';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  AccountTypeBadge,
  AccountFormModal,
} from '@/components/chart-of-accounts';

export default function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { data: session } = useSession();
  const { data: account, isLoading, error, refetch } = useAccount(id);
  const deleteAccount = useDeleteAccount();

  // Fetch children accounts
  const { data: childrenData } = useChartOfAccounts({
    parentId: id,
    limit: 100,
    sortBy: 'sortOrder',
    sortOrder: 'asc',
  });

  // Fetch parent options for edit modal
  const { data: parentOptions } = useAccountsForSelect({
    tenantId: account?.tenantId || undefined,
    companyId: account?.companyId || undefined,
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Permissions - allow edit/delete for non-system accounts
  const canEdit = (session?.isSuperAdmin || session?.isTenantAdmin) && !account?.isSystem;
  const canDelete = (session?.isSuperAdmin || session?.isTenantAdmin) && !account?.isSystem;

  // Parent options for edit modal
  const parentSelectOptions = useMemo(() => {
    if (!parentOptions) return [];
    // Exclude current account and its children from parent options
    return parentOptions
      .filter((opt) => opt.id !== id)
      .map((opt) => ({
        value: opt.id,
        label: `${opt.code} - ${opt.name}`,
      }));
  }, [parentOptions, id]);

  const handleDeleteConfirm = async (reason?: string) => {
    if (!reason) return;

    try {
      await deleteAccount.mutateAsync({ id, reason });
      toast.success('Account deleted successfully');
      router.push('/admin/chart-of-accounts');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account');
    }
  };

  const handleEditSuccess = () => {
    toast.success('Account updated successfully');
    setEditModalOpen(false);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton" />
          <div className="h-4 w-48 skeleton" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 skeleton rounded-lg" />
            <div className="h-48 skeleton rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Account not found</h2>
          <p className="text-text-secondary mb-4">
            {error instanceof Error ? error.message : 'The account you are looking for does not exist.'}
          </p>
          <Link href="/admin/chart-of-accounts" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Chart of Accounts
          </Link>
        </div>
      </div>
    );
  }

  const childAccounts = childrenData?.accounts || [];
  const hasChildren = childAccounts.length > 0;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/admin/chart-of-accounts"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chart of Accounts
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg text-text-secondary">{account.code}</span>
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
              {account.name}
            </h1>
          </div>
          {account.description && (
            <p className="text-sm text-text-secondary mt-2">{account.description}</p>
          )}
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-2 sm:gap-3">
            {canEdit && (
              <button
                onClick={() => setEditModalOpen(true)}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="btn-danger btn-sm flex items-center gap-2"
                disabled={hasChildren}
                title={hasChildren ? 'Cannot delete account with children' : undefined}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Details */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-text-tertiary" />
                Account Details
              </h2>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Account Code</p>
                <p className="font-mono text-text-primary">{account.code}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Account Name</p>
                <p className="text-text-primary">{account.name}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Account Type</p>
                <p className="text-text-primary">{ACCOUNT_TYPE_NAMES[account.accountType]}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Status</p>
                <p className="text-text-primary">{ACCOUNT_STATUS_NAMES[account.status]}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Tax Applicable</p>
                <p className="text-text-primary">{account.isTaxApplicable ? 'Yes' : 'No'}</p>
              </div>
              {account.isSystem && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase mb-1">Read-Only</p>
                  <p className="text-text-muted text-sm">This is a system account and cannot be modified.</p>
                </div>
              )}
            </div>
          </div>

          {/* Hierarchy */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-text-tertiary" />
                Hierarchy
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Parent Account */}
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-2">Parent Account</p>
                {account.parent ? (
                  <Link
                    href={`/admin/chart-of-accounts/${account.parent.id}`}
                    className="flex items-center gap-2 p-2 rounded-md bg-background-secondary hover:bg-background-tertiary transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-oak-light" />
                    <span className="font-mono text-sm text-text-secondary">{account.parent.code}</span>
                    <span className="text-text-primary">{account.parent.name}</span>
                  </Link>
                ) : (
                  <p className="text-text-muted italic">No parent (root account)</p>
                )}
              </div>

              {/* Child Accounts */}
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-2">
                  Child Accounts {hasChildren && <span className="text-text-muted">({childAccounts.length})</span>}
                </p>
                {hasChildren ? (
                  <div className="space-y-1">
                    {childAccounts.map((child: ChartOfAccount) => (
                      <Link
                        key={child.id}
                        href={`/admin/chart-of-accounts/${child.id}`}
                        className="flex items-center gap-2 p-2 rounded-md bg-background-secondary hover:bg-background-tertiary transition-colors"
                      >
                        <CornerDownRight className="w-4 h-4 text-text-muted" />
                        <span className="font-mono text-sm text-text-secondary">{child.code}</span>
                        <span className="text-text-primary">{child.name}</span>
                        <AccountTypeBadge type={child.accountType} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted italic">No child accounts</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Record Info */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                Record Info
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Created</p>
                <p className="text-sm text-text-primary">{formatDate(account.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Last Updated</p>
                <p className="text-sm text-text-primary">{formatDate(account.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* Audit History */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <History className="w-4 h-4 text-text-tertiary" />
                Audit History
              </h2>
            </div>
            <div className="p-4">
              <Link
                href={`/admin/audit-logs?entityType=ChartOfAccount&entityId=${id}`}
                className="btn-secondary btn-sm w-full justify-center"
              >
                View History
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Account"
        description={`Are you sure you want to delete the account "${account.code} - ${account.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this account..."
        reasonMinLength={10}
        isLoading={deleteAccount.isPending}
      />

      {/* Edit Modal */}
      <AccountFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        account={account}
        parentOptions={parentSelectOptions}
        tenantId={account.tenantId || undefined}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
