'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  AlertCircle,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  Copy,
  FileStack,
  Square,
  CheckSquare,
  MinusSquare,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { useProcessingDocuments, type ProcessingDocumentSearchParams } from '@/hooks/use-processing-documents';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { BulkActionsToolbar } from '@/components/processing/bulk-actions-toolbar';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import type { PipelineStatus, DuplicateStatus, RevisionStatus } from '@/generated/prisma';
import { cn } from '@/lib/utils';

// Revision status display config
const revisionStatusConfig: Record<
  RevisionStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: 'Pending Review', color: 'text-status-warning bg-status-warning/10' },
  APPROVED: { label: 'Approved', color: 'text-oak-primary bg-oak-primary/10' },
  SUPERSEDED: { label: 'Superseded', color: 'text-text-muted bg-background-tertiary' },
};

// Pipeline status display config
const pipelineStatusConfig: Record<
  PipelineStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  UPLOADED: { label: 'Uploaded', color: 'text-text-secondary bg-background-tertiary', icon: Upload },
  QUEUED: { label: 'Queued', color: 'text-status-info bg-status-info/10', icon: Clock },
  PROCESSING: { label: 'Processing', color: 'text-status-info bg-status-info/10', icon: RefreshCw },
  SPLIT_PENDING: { label: 'Split Pending', color: 'text-status-warning bg-status-warning/10', icon: FileStack },
  SPLIT_DONE: { label: 'Split Done', color: 'text-status-success bg-status-success/10', icon: FileStack },
  EXTRACTION_DONE: { label: 'Extracted', color: 'text-status-success bg-status-success/10', icon: CheckCircle },
  FAILED_RETRYABLE: { label: 'Failed (Retry)', color: 'text-status-warning bg-status-warning/10', icon: AlertTriangle },
  FAILED_PERMANENT: { label: 'Failed', color: 'text-status-error bg-status-error/10', icon: XCircle },
  DEAD_LETTER: { label: 'Dead Letter', color: 'text-status-error bg-status-error/10', icon: XCircle },
};

// Duplicate status display config
const duplicateStatusConfig: Record<
  DuplicateStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  NONE: { label: 'None', color: 'text-text-muted bg-background-tertiary', icon: Clock },
  SUSPECTED: { label: 'Suspected', color: 'text-status-warning bg-status-warning/10', icon: AlertTriangle },
  CONFIRMED: { label: 'Confirmed', color: 'text-status-error bg-status-error/10', icon: Copy },
  REJECTED: { label: 'Not Duplicate', color: 'text-status-success bg-status-success/10', icon: CheckCircle },
};

function StatusBadge({
  config,
}: {
  status: string;
  config: { label: string; color: string; icon: React.ComponentType<{ className?: string }> };
}) {
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: string, currency: string): string {
  const num = parseFloat(amount);
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: currency || 'SGD',
    minimumFractionDigits: 2,
  }).format(num);
}

export default function ProcessingDocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const { data: session } = useSession();

  // Get active tenant ID (from store for SUPER_ADMIN, from session for others)
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Parse URL params
  const getParamsFromUrl = useCallback((): ProcessingDocumentSearchParams => {
    return {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      pipelineStatus: (searchParams.get('pipelineStatus') || undefined) as PipelineStatus | undefined,
      duplicateStatus: (searchParams.get('duplicateStatus') || undefined) as DuplicateStatus | undefined,
      revisionStatus: (searchParams.get('revisionStatus') || undefined) as RevisionStatus | undefined,
      isContainer: searchParams.get('isContainer') === 'true' ? true :
                   searchParams.get('isContainer') === 'false' ? false : undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pass tenantId to filter documents by selected tenant (for SUPER_ADMIN)
  const { data, isLoading, error, refetch } = useProcessingDocuments({
    ...params,
    tenantId: activeTenantId,
  });

  // Reset page and selection when tenant changes
  useEffect(() => {
    setParams((prev) => ({ ...prev, page: 1 }));
    setSelectedIds([]);
  }, [activeTenantId]);

  // Clear selection when params change (e.g., page change, filter change)
  useEffect(() => {
    setSelectedIds([]);
  }, [params]);

  // Selection handlers
  const toggleSelectAll = useCallback(() => {
    if (!data?.documents) return;
    const allIds = data.documents.map((d) => d.id);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  }, [data?.documents, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  // Selection state
  const selectionState = useMemo(() => {
    if (!data?.documents || data.documents.length === 0) return 'none';
    const allIds = data.documents.map((d) => d.id);
    const selectedCount = allIds.filter((id) => selectedIds.includes(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === allIds.length) return 'all';
    return 'partial';
  }, [data?.documents, selectedIds]);

  // Memoize URL construction
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.page && params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit && params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy && params.sortBy !== 'createdAt') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder && params.sortOrder !== 'desc') urlParams.set('sortOrder', params.sortOrder);
    if (params.pipelineStatus) urlParams.set('pipelineStatus', params.pipelineStatus);
    if (params.duplicateStatus) urlParams.set('duplicateStatus', params.duplicateStatus);
    if (params.revisionStatus) urlParams.set('revisionStatus', params.revisionStatus);
    if (params.isContainer !== undefined) urlParams.set('isContainer', params.isContainer.toString());

    const queryString = urlParams.toString();
    return queryString ? `/processing?${queryString}` : '/processing';
  }, [params]);

  // Sync URL when params change
  useEffect(() => {
    if (window.location.pathname + window.location.search !== targetUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  }, [targetUrl, router]);

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const handleFilterChange = (key: keyof ProcessingDocumentSearchParams, value: string | undefined) => {
    setParams((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  // Calculate stats from data
  const stats = useMemo(() => {
    if (!data?.documents) return null;
    const docs = data.documents;
    return {
      total: data.total,
      queued: docs.filter((d) => d.pipelineStatus === 'QUEUED').length,
      processing: docs.filter((d) => d.pipelineStatus === 'PROCESSING').length,
      pendingReview: docs.filter((d) =>
        d.currentRevision?.status === 'DRAFT' &&
        d.pipelineStatus === 'EXTRACTION_DONE'
      ).length,
      approved: docs.filter((d) => d.currentRevision?.status === 'APPROVED').length,
      failed: docs.filter((d) =>
        d.pipelineStatus === 'FAILED_RETRYABLE' ||
        d.pipelineStatus === 'FAILED_PERMANENT' ||
        d.pipelineStatus === 'DEAD_LETTER'
      ).length,
    };
  }, [data]);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Document Processing</h1>
          <p className="text-text-secondary text-sm mt-1">
            AI-powered document extraction, classification, and revision workflow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn-secondary btn-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {can.createDocument && (
            <Link href="/processing/upload" className="btn-primary btn-sm flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Documents</span>
              <span className="sm:hidden">Upload</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <MobileCollapsibleSection title="Statistics" count={6} className="mb-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-oak-primary/10">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-oak-light" />
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
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.queued}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Queued</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.processing}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Processing</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-warning/10">
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.pendingReview}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Pending Review</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-success/10">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.approved}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Approved</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-error/10">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-status-error" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.failed}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Failed</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Pipeline Status</label>
            <select
              value={params.pipelineStatus || ''}
              onChange={(e) => handleFilterChange('pipelineStatus', e.target.value || undefined)}
              className="input input-sm w-40"
            >
              <option value="">All Statuses</option>
              {Object.entries(pipelineStatusConfig).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Review Status</label>
            <select
              value={params.revisionStatus || ''}
              onChange={(e) => handleFilterChange('revisionStatus', e.target.value || undefined)}
              className="input input-sm w-40"
            >
              <option value="">All</option>
              <option value="DRAFT">Pending Review</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Duplicate Status</label>
            <select
              value={params.duplicateStatus || ''}
              onChange={(e) => handleFilterChange('duplicateStatus', e.target.value || undefined)}
              className="input input-sm w-40"
            >
              <option value="">All</option>
              {Object.entries(duplicateStatusConfig).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Document Type</label>
            <select
              value={params.isContainer === undefined ? '' : params.isContainer ? 'true' : 'false'}
              onChange={(e) => handleFilterChange('isContainer', e.target.value || undefined)}
              className="input input-sm w-40"
            >
              <option value="">All Types</option>
              <option value="true">Containers Only</option>
              <option value="false">Children Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load documents'}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="card p-8 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-oak-light" />
          <span className="ml-3 text-text-secondary">Loading documents...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && data?.documents.length === 0 && (
        <div className="card p-8 text-center">
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No documents found</h3>
          <p className="text-text-secondary mb-4">
            Upload invoices, receipts, and other business documents for AI-powered extraction.
          </p>
          <Link href="/processing/upload" className="btn-primary btn-sm inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Documents
          </Link>
        </div>
      )}

      {/* Document Cards - Mobile View */}
      {!isLoading && !error && data && data.documents.length > 0 && (
        <div className="md:hidden space-y-3 mb-6">
          {data.documents.map((doc) => {
            const isSelected = selectedIds.includes(doc.id);
            return (
              <MobileCard
                key={doc.id}
                isSelected={isSelected}
                selectable
                onToggle={() => toggleSelect(doc.id)}
                title={doc.document.fileName}
                subtitle={
                  <span className="text-text-muted">
                    {doc.isContainer ? 'Container' : `Pages ${doc.pageFrom}-${doc.pageTo}`}
                    {doc.document.company && ` • ${doc.document.company.name}`}
                  </span>
                }
                badge={
                  <StatusBadge
                    status={doc.pipelineStatus}
                    config={pipelineStatusConfig[doc.pipelineStatus]}
                  />
                }
                details={
                  <div className="space-y-3">
                    {/* Status Badges Row */}
                    <div className="flex flex-wrap gap-2">
                      {doc.currentRevision && (
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                          revisionStatusConfig[doc.currentRevision.status].color
                        )}>
                          {revisionStatusConfig[doc.currentRevision.status].label}
                        </span>
                      )}
                      {doc.duplicateStatus !== 'NONE' && (
                        <StatusBadge
                          status={doc.duplicateStatus}
                          config={duplicateStatusConfig[doc.duplicateStatus]}
                        />
                      )}
                    </div>

                    <CardDetailsGrid>
                      <CardDetailItem
                        label="Vendor"
                        value={doc.currentRevision?.vendorName || '-'}
                      />
                      <CardDetailItem
                        label="Amount"
                        value={doc.currentRevision
                          ? formatCurrency(doc.currentRevision.totalAmount, doc.currentRevision.currency)
                          : '-'}
                      />
                      <CardDetailItem
                        label="Uploaded"
                        value={formatDate(doc.createdAt)}
                      />
                      {doc.currentRevision?.documentNumber && (
                        <CardDetailItem
                          label="Doc #"
                          value={doc.currentRevision.documentNumber}
                        />
                      )}
                    </CardDetailsGrid>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    {doc.duplicateStatus === 'SUSPECTED' && (
                      <Link
                        href={`/processing/${doc.id}?compare=true`}
                        className="btn-ghost btn-xs inline-flex items-center gap-1 text-status-warning min-h-[44px]"
                        title="Compare with suspected duplicate"
                      >
                        <Copy className="w-4 h-4" />
                        Compare
                      </Link>
                    )}
                    <Link
                      href={`/processing/${doc.id}`}
                      className="btn-secondary btn-xs inline-flex items-center gap-1 min-h-[44px]"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Link>
                  </div>
                }
              />
            );
          })}

          {/* Mobile Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3">
              <p className="text-xs text-text-secondary">
                {(data.page - 1) * data.limit + 1}-{Math.min(data.page * data.limit, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(data.page - 1)}
                  disabled={data.page === 1}
                  className="btn-ghost btn-xs min-h-[44px]"
                >
                  Previous
                </button>
                <span className="text-xs text-text-secondary">
                  {data.page}/{data.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(data.page + 1)}
                  disabled={data.page === data.totalPages}
                  className="btn-ghost btn-xs min-h-[44px]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Table - Desktop View */}
      {!isLoading && !error && data && data.documents.length > 0 && (
        <div className="hidden md:block card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-tertiary border-b border-border-primary">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <button
                      onClick={toggleSelectAll}
                      className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                      title={selectionState === 'all' ? 'Deselect all' : 'Select all'}
                    >
                      {selectionState === 'all' ? (
                        <CheckSquare className="w-4 h-4 text-oak-primary" />
                      ) : selectionState === 'partial' ? (
                        <MinusSquare className="w-4 h-4 text-oak-light" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                      )}
                    </button>
                  </th>
                  <th className="text-left text-xs font-medium text-text-secondary px-4 py-3">Document</th>
                  <th className="text-left text-xs font-medium text-text-secondary px-4 py-3">Pipeline</th>
                  <th className="text-left text-xs font-medium text-text-secondary px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-text-secondary px-4 py-3">Duplicate</th>
                  <th className="text-left text-xs font-medium text-text-secondary px-4 py-3">Vendor</th>
                  <th className="text-right text-xs font-medium text-text-secondary px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-text-secondary px-4 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-text-secondary px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((doc) => {
                  const isSelected = selectedIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      className={cn(
                        'border-b border-border-primary transition-colors',
                        isSelected
                          ? 'bg-oak-primary/5 hover:bg-oak-primary/10'
                          : 'hover:bg-background-tertiary/50'
                      )}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSelect(doc.id)}
                          className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-oak-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-text-muted" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded bg-background-tertiary">
                            {doc.isContainer ? (
                              <FileStack className="w-4 h-4 text-text-secondary" />
                            ) : (
                              <FileText className="w-4 h-4 text-text-secondary" />
                            )}
                          </div>
                          <div>
                            <Link
                              href={`/processing/${doc.id}`}
                              className="text-sm font-medium text-text-primary hover:text-oak-light transition-colors truncate max-w-[200px] block"
                            >
                              {doc.document.fileName}
                            </Link>
                            <p className="text-xs text-text-muted">
                              {doc.isContainer ? 'Container' : `Pages ${doc.pageFrom}-${doc.pageTo}`}
                              {doc.document.company && ` • ${doc.document.company.name}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={doc.pipelineStatus}
                          config={pipelineStatusConfig[doc.pipelineStatus]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {doc.currentRevision ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                            revisionStatusConfig[doc.currentRevision.status].color
                          )}>
                            {revisionStatusConfig[doc.currentRevision.status].label}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={doc.duplicateStatus}
                          config={duplicateStatusConfig[doc.duplicateStatus]}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-primary">
                          {doc.currentRevision?.vendorName || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-text-primary">
                          {doc.currentRevision
                            ? formatCurrency(doc.currentRevision.totalAmount, doc.currentRevision.currency)
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-text-secondary">
                          {formatDate(doc.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {doc.duplicateStatus === 'SUSPECTED' && (
                            <Link
                              href={`/processing/${doc.id}?compare=true`}
                              className="btn-ghost btn-xs inline-flex items-center gap-1 text-status-warning"
                              title="Compare with suspected duplicate"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Compare
                            </Link>
                          )}
                          <Link
                            href={`/processing/${doc.id}`}
                            className="btn-ghost btn-xs inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
              <p className="text-sm text-text-secondary">
                Showing {(data.page - 1) * data.limit + 1} to{' '}
                {Math.min(data.page * data.limit, data.total)} of {data.total} documents
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(data.page - 1)}
                  disabled={data.page === 1}
                  className="btn-ghost btn-xs"
                >
                  Previous
                </button>
                <span className="text-sm text-text-secondary">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(data.page + 1)}
                  disabled={data.page === data.totalPages}
                  className="btn-ghost btn-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedIds={selectedIds}
        onClearSelection={clearSelection}
      />
    </div>
  );
}
