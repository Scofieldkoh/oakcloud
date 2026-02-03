'use client';

import { use, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Pencil,
  Trash2,
  Upload,
  Hash,
  Building2,
} from 'lucide-react';
import {
  useCompany,
  useDeleteCompany,
} from '@/hooks/use-companies';
import { useCompanyContactDetails } from '@/hooks/use-contact-details';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/utils';
import { getEntityTypeLabel } from '@/lib/constants';
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

// Inner component that uses useSearchParams (needs Suspense boundary)
function CompanyDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { data: company, isLoading, error } = useCompany(id);
  const deleteCompany = useDeleteCompany();
  const { success, error: toastError } = useToast();
  // Get permissions for this specific company
  const { can } = usePermissions(id);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // URL-persisted tab state
  const [activeTab, setActiveTab] = useTabState();

  // OPTIMIZED: Removed prefetch hooks - let tabs fetch their own data lazily
  // This prevents sequential loading where prefetch waits for company to load first

  // Get contact details to check hasPoc for the warning icon
  const { data: contactDetailsData } = useCompanyContactDetails(id);

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
        {(can.updateCompany || can.deleteCompany) && (
          <div className="flex items-center gap-2 sm:gap-3">
            {can.updateCompany && (
              <Link
                href={`/companies/${id}/edit`}
                className="btn-primary btn-sm flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            {can.updateDocument && (
              <Link
                href={`/companies/upload?companyId=${id}`}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Update via BizFile</span>
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
        )}
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
      {activeTab === 'contracts' && (
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
