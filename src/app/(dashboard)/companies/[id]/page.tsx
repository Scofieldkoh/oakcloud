'use client';

import { use, useCallback, useEffect, useState, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Pencil,
  Trash2,
  Upload,
  Hash,
  Building2,
  RefreshCw,
} from 'lucide-react';
import {
  useCompany,
  useDeleteCompany,
  useRetrieveFYE,
  useUpdateCompany,
} from '@/hooks/use-companies';
import { useCompanyContactDetails } from '@/hooks/use-contact-details';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/utils';
import { getEntityTypeLabel } from '@/lib/constants';
import { isCompanyEntityType } from '@/lib/external/acra-fye';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { InternalNotes } from '@/components/notes/internal-notes';
import {
  CompanyProfileTab,
  ContactDetailsTab,
  DeadlinesTab,
  CompanyTabs,
  useTabState,
} from '@/components/companies/company-detail';
import { ContractsTab } from '@/components/companies/contracts';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { serviceKeys } from '@/hooks/use-contract-services';
import { deadlineKeys } from '@/hooks/use-deadlines';

// Inner component that uses useSearchParams (needs Suspense boundary)
function CompanyDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: company, isLoading, error, refetch, isFetching } = useCompany(id);
  const deleteCompany = useDeleteCompany();
  const retrieveFYEMutation = useRetrieveFYE(id);
  const updateCompanyMutation = useUpdateCompany();
  const { success, error: toastError } = useToast();
  // Get permissions for this specific company
  const { can } = usePermissions(id);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // URL-persisted tab state
  const [activeTab, setActiveTab] = useTabState();

  // OPTIMIZED: Removed prefetch hooks - let tabs fetch their own data lazily
  // This prevents sequential loading where prefetch waits for company to load first

  // Get contact details to check hasPoc for the warning icon
  const { data: contactDetailsData, refetch: refetchContactDetails, isFetching: isContactDetailsFetching } = useCompanyContactDetails(id);

  // OPTIMIZED: Use counts from already-fetched company data instead of separate useCompanyLinkInfo hook
  // Build warning message based on company._count (already fetched with company data)
  const getDeleteWarning = () => {
    const counts = company?._count;
    if (!counts) {
      return 'This action cannot be undone. The company will be soft-deleted and can be restored later.';
    }

    const hasLinks = counts.officers > 0 || counts.shareholders > 0 || counts.charges > 0 || counts.documents > 0;
    if (!hasLinks) {
      return 'This action cannot be undone. The company will be soft-deleted and can be restored later.';
    }

    const parts: string[] = [];
    if (counts.officers > 0) parts.push(`${counts.officers} officer(s)`);
    if (counts.shareholders > 0) parts.push(`${counts.shareholders} shareholder(s)`);
    if (counts.charges > 0) parts.push(`${counts.charges} charge(s)`);
    if (counts.documents > 0) parts.push(`${counts.documents} document(s)`);

    return `Warning: This company has ${parts.join(', ')} linked. Deleting will remove these links, but the underlying data (contacts, documents) will remain. This action cannot be undone.`;
  };

  const handleDeleteConfirm = async (reason?: string) => {
    if (!reason) return;

    try {
      await deleteCompany.mutateAsync({ id, reason });
      success('Company deleted successfully');
      router.push('/companies');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete company');
    }
  };

  const handleRefresh = useCallback((refreshAllTabs = false) => {
    refetch();
    refetchContactDetails();
    if (refreshAllTabs || activeTab === 'services') {
      queryClient.invalidateQueries({ queryKey: serviceKeys.company(id), refetchType: 'all' });
    }
    if (refreshAllTabs || activeTab === 'deadlines') {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all, refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.stats(id), refetchType: 'all' });
    }
  }, [
    activeTab,
    id,
    queryClient,
    refetch,
    refetchContactDetails,
  ]);

  const searchParams = useSearchParams();
  const refreshToken = searchParams.get('refresh');
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    if (!refreshToken) return;

    handleRefresh(true);

    const params = new URLSearchParams(searchParamsString);
    params.delete('refresh');
    const next = params.toString();
    router.replace(next ? `/companies/${id}?${next}` : `/companies/${id}`);
  }, [handleRefresh, id, refreshToken, router, searchParamsString]);

  const handleRetrieveFYE = async () => {
    if (!company || isRetrievingFYE) return;

    try {
      const result = await retrieveFYEMutation.mutateAsync();

      await updateCompanyMutation.mutateAsync({
        id,
        data: {
          id,
          financialYearEndDay: result.financialYearEndDay,
          financialYearEndMonth: result.financialYearEndMonth,
        },
      });

      success('Financial Year End retrieved successfully');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to retrieve FYE from ACRA');
    }
  };

  const isRefreshing = isFetching || isContactDetailsFetching;
  const isRetrievingFYE = retrieveFYEMutation.isPending || updateCompanyMutation.isPending;
  const hasFinancialYearEnd = !!(company?.financialYearEndMonth && company?.financialYearEndDay);
  const showRetrieveFYEButton =
    !!company &&
    !hasFinancialYearEnd &&
    can.updateCompany &&
    isCompanyEntityType(company.entityType);

  useKeyboardShortcuts([
    {
      key: 'Backspace',
      ctrl: true,
      handler: () => router.push('/companies'),
      description: 'Back to companies',
    },
    {
      key: 'r',
      ctrl: true,
      handler: handleRefresh,
      description: 'Refresh company',
    },
    ...(can.updateDocument ? [{
      key: 'F2',
      handler: () => router.push(`/companies/upload?companyId=${id}`),
      description: 'Update via BizFile',
    }] : []),
    ...(showRetrieveFYEButton ? [{
      key: 'F3',
      handler: handleRetrieveFYE,
      description: 'Retrieve FYE',
    }] : []),
    ...(can.updateCompany ? [{
      key: 'e',
      ctrl: true,
      handler: () => router.push(`/companies/${id}/edit`),
      description: 'Edit company',
    }] : []),
  ], !deleteDialogOpen && !isRetrievingFYE);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton" />
          <div className="h-4 w-48 skeleton" />
          <div className="grid grid-cols-3 gap-6">
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Company not found</h2>
          <p className="text-text-secondary mb-4">
            {error instanceof Error ? error.message : 'The company you are looking for does not exist.'}
          </p>
          <Link href="/companies" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; label: string }> = {
    LIVE: { color: 'badge-success', label: 'Live' },
    STRUCK_OFF: { color: 'badge-error', label: 'Struck Off' },
    WINDING_UP: { color: 'badge-warning', label: 'Winding Up' },
    DISSOLVED: { color: 'badge-neutral', label: 'Dissolved' },
    IN_LIQUIDATION: { color: 'badge-warning', label: 'In Liquidation' },
    IN_RECEIVERSHIP: { color: 'badge-warning', label: 'In Receivership' },
    AMALGAMATED: { color: 'badge-info', label: 'Amalgamated' },
    CONVERTED: { color: 'badge-info', label: 'Converted' },
    OTHER: { color: 'badge-neutral', label: 'Other' },
  };

  const currentStatus = statusConfig[company.status] || { color: 'badge-neutral', label: company.status };
  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/companies"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{company.name}</h1>
            <span className={`badge ${currentStatus.color}`}>
              {currentStatus.label}
            </span>
            {company.statusDate && (
              <span className="text-xs text-text-muted">
                As at {formatDate(company.statusDate)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-text-secondary">
            <span className="flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-text-tertiary" />
              {company.uen}
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-text-tertiary" />
              {getEntityTypeLabel(company.entityType, true)}
            </span>
            {company.incorporationDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                Incorporated {formatDate(company.incorporationDate)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => handleRefresh()}
            className="btn-secondary btn-sm flex items-center gap-2"
            title="Refresh (Ctrl+R)"
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh (Ctrl+R)</span>
            <span className="sm:hidden">Refresh</span>
          </button>
          {showRetrieveFYEButton && (
            <button
              onClick={handleRetrieveFYE}
              className="btn-secondary btn-sm flex items-center gap-2"
              title="Retrieve FYE (F3)"
              disabled={isRetrievingFYE}
            >
              <RefreshCw className={`w-4 h-4 ${isRetrievingFYE ? 'animate-spin' : ''}`} />
              <span>Retrieve FYE (F3)</span>
            </button>
          )}
          {can.updateCompany && (
            <Link
              href={`/companies/${id}/edit`}
              className="btn-primary btn-sm flex items-center gap-2"
              title="Edit (Ctrl+E)"
            >
              <Pencil className="w-4 h-4" />
              <span className="hidden sm:inline">Edit (Ctrl+E)</span>
              <span className="sm:hidden">Edit</span>
            </Link>
          )}
          {can.updateDocument && (
            <Link
              href={`/companies/upload?companyId=${id}`}
              className="btn-secondary btn-sm flex items-center gap-2"
              title="Update via BizFile (F2)"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Update via BizFile (F2)</span>
              <span className="sm:hidden">BizFile</span>
            </Link>
          )}
          {can.deleteCompany && (
            <button
              onClick={() => setDeleteDialogOpen(true)}
              className="btn-danger btn-sm flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <CompanyTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasPoc={contactDetailsData?.hasPoc}
        hasFye={company.financialYearEndMonth != null}
      />

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <CompanyProfileTab
          company={company}
          companyId={id}
          can={can}
        />
      )}
      {activeTab === 'contacts' && (
        <ContactDetailsTab
          companyId={id}
          companyName={company.name}
          canEdit={can.updateCompany}
        />
      )}
      {activeTab === 'services' && (
        <ContractsTab
          companyId={id}
          canEdit={can.updateCompany}
        />
      )}
      {activeTab === 'deadlines' && (
        <DeadlinesTab companyId={id} />
      )}

      {/* Internal Notes - Full Width */}
      <InternalNotes
        entityType="company"
        entityId={id}
        canEdit={can.updateCompany}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Company"
        description={`Are you sure you want to delete "${company?.name}"? ${getDeleteWarning()}`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this company..."
        reasonMinLength={10}
        isLoading={deleteCompany.isPending}
      />
    </div>
  );
}

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <Suspense fallback={
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton" />
          <div className="h-4 w-48 skeleton" />
          <div className="grid grid-cols-3 gap-6">
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
          </div>
        </div>
      </div>
    }>
      <CompanyDetailContent id={id} />
    </Suspense>
  );
}
