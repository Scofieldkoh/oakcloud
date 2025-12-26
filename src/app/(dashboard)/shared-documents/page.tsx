'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Share2,
  Search,
  AlertCircle,
  Copy,
  Trash2,
  Eye,
  ExternalLink,
  Check,
  Clock,
  XCircle,
  Lock,
  Download,
  MessageSquare,
  Calendar,
  FileText,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { Pagination } from '@/components/companies/pagination';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { cn, formatDate } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface DocumentShare {
  id: string;
  shareToken: string;
  allowedActions: string[];
  allowComments: boolean;
  expiresAt: string | null;
  isActive: boolean;
  viewCount: number;
  passwordHash: string | null;
  createdAt: string;
  effectiveStatus: 'active' | 'expired' | 'revoked';
  document: {
    id: string;
    title: string;
    status: string;
    company: {
      id: string;
      name: string;
    } | null;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count: {
    comments: number;
  };
}

interface SharesResponse {
  shares: DocumentShare[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Status Badge Component
// ============================================================================

function ShareStatusBadge({ status }: { status: 'active' | 'expired' | 'revoked' }) {
  const config = {
    active: {
      icon: Check,
      label: 'Active',
      className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    },
    expired: {
      icon: Clock,
      label: 'Expired',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    },
    revoked: {
      icon: XCircle,
      label: 'Revoked',
      className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        config.className
      )}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SharedDocumentsPage() {
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();

  // Tenant selection for SUPER_ADMIN
  const { selectedTenantId } = useTenantSelection();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // State
  const [shares, setShares] = useState<DocumentShare[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Revoke dialog
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [shareToRevoke, setShareToRevoke] = useState<DocumentShare | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Fetch shares
  const fetchShares = useCallback(async () => {
    // Don't fetch if SUPER_ADMIN hasn't selected a tenant
    if (session?.isSuperAdmin && !activeTenantId) {
      setShares([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (session?.isSuperAdmin && activeTenantId) {
        params.set('tenantId', activeTenantId);
      }

      const response = await fetch(`/api/document-shares?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch shares');
      }

      const data: SharesResponse = await response.json();
      setShares(data.shares);
      setTotal(data.total);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, page, session?.isSuperAdmin, activeTenantId]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // Get share URL
  const getShareUrl = (token: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/share/${token}`;
  };

  // Copy share link
  const handleCopyLink = async (share: DocumentShare) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(share.shareToken));
      setCopiedId(share.id);
      success('Link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toastError('Failed to copy link');
    }
  };

  // Revoke share
  const handleRevokeShare = async () => {
    if (!shareToRevoke) return;

    setIsRevoking(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('shareId', shareToRevoke.id);
      if (session?.isSuperAdmin && activeTenantId) {
        queryParams.set('tenantId', activeTenantId);
      }

      const response = await fetch(
        `/api/generated-documents/${shareToRevoke.document.id}/share?${queryParams}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to revoke share link');
      }

      // Update local state
      setShares((prev) =>
        prev.map((s) =>
          s.id === shareToRevoke.id
            ? { ...s, isActive: false, effectiveStatus: 'revoked' as const }
            : s
        )
      );
      success('Share link revoked');
    } catch (err) {
      console.error('Revoke share error:', err);
      toastError(err instanceof Error ? err.message : 'Failed to revoke share link');
    } finally {
      setIsRevoking(false);
      setRevokeDialogOpen(false);
      setShareToRevoke(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Shared Documents
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage all document share links
          </p>
        </div>
      </div>

      {/* Tenant context info for SUPER_ADMIN */}
      {session?.isSuperAdmin && !activeTenantId && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Please select a tenant from the sidebar to view shared documents.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by document title..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Company</th>
                <th>Status</th>
                <th>Permissions</th>
                <th>Views</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td><div className="skeleton h-4 w-48" /></td>
                  <td><div className="skeleton h-4 w-32" /></td>
                  <td><div className="skeleton h-4 w-20" /></td>
                  <td><div className="skeleton h-4 w-24" /></td>
                  <td><div className="skeleton h-4 w-12" /></td>
                  <td><div className="skeleton h-4 w-24" /></td>
                  <td><div className="skeleton h-4 w-24 ml-auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : shares.length === 0 ? (
        <div className="card p-12 text-center">
          <Share2 className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No shared documents</h3>
          <p className="text-text-secondary mb-4">
            Share links will appear here when you share documents.
          </p>
          <Link href="/generated-documents">
            <Button variant="secondary" size="sm">
              Go to Documents
            </Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 mb-6">
            {shares.map((share) => (
              <MobileCard
                key={share.id}
                title={share.document.title}
                subtitle={
                  share.expiresAt && (
                    <span className="flex items-center gap-1 text-text-tertiary">
                      <Calendar className="w-3 h-3" />
                      Expires {formatDate(share.expiresAt)}
                    </span>
                  )
                }
                badge={<ShareStatusBadge status={share.effectiveStatus} />}
                details={
                  <div className="space-y-3">
                    {/* Permissions */}
                    <div className="flex flex-wrap items-center gap-1">
                      {share.allowedActions.includes('view') && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-background-tertiary rounded text-xs text-text-muted">
                          <Eye className="w-3 h-3" />
                          View
                        </span>
                      )}
                      {share.allowedActions.includes('download') && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-background-tertiary rounded text-xs text-text-muted">
                          <Download className="w-3 h-3" />
                          Download
                        </span>
                      )}
                      {share.allowComments && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-background-tertiary rounded text-xs text-text-muted">
                          <MessageSquare className="w-3 h-3" />
                          Comments
                        </span>
                      )}
                      {share.passwordHash && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 rounded text-xs text-amber-700 dark:text-amber-400">
                          <Lock className="w-3 h-3" />
                          Protected
                        </span>
                      )}
                    </div>

                    <CardDetailsGrid>
                      <CardDetailItem
                        label="Company"
                        value={share.document.company?.name || '—'}
                        icon={<Building2 className="w-3 h-3" />}
                      />
                      <CardDetailItem
                        label="Views"
                        value={`${share.viewCount}${share._count.comments > 0 ? ` (${share._count.comments} comments)` : ''}`}
                        icon={<Eye className="w-3 h-3" />}
                      />
                      <CardDetailItem
                        label="Created"
                        value={formatDate(share.createdAt)}
                        icon={<Calendar className="w-3 h-3" />}
                      />
                      <CardDetailItem
                        label="By"
                        value={`${share.createdBy.firstName} ${share.createdBy.lastName}`}
                      />
                    </CardDetailsGrid>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-1">
                    {/* Copy link */}
                    <button
                      type="button"
                      onClick={() => handleCopyLink(share)}
                      className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Copy link"
                      disabled={share.effectiveStatus !== 'active'}
                    >
                      {copiedId === share.id ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Open link */}
                    <a
                      href={getShareUrl(share.shareToken)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
                        share.effectiveStatus !== 'active' && 'opacity-50 pointer-events-none'
                      )}
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    {/* Manage shares */}
                    <Link
                      href={`/generated-documents/${share.document.id}/share`}
                      className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Manage shares"
                    >
                      <FileText className="w-4 h-4" />
                    </Link>

                    {/* Revoke */}
                    {share.effectiveStatus === 'active' && (
                      <button
                        type="button"
                        onClick={() => {
                          setShareToRevoke(share);
                          setRevokeDialogOpen(true);
                        }}
                        className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Revoke"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block table-container mb-6">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Views</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((share) => (
                  <tr key={share.id}>
                    <td>
                      <Link
                        href={`/generated-documents/${share.document.id}`}
                        className="font-medium text-text-primary hover:text-oak-light transition-colors"
                      >
                        {share.document.title}
                      </Link>
                      {share.expiresAt && (
                        <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Expires {formatDate(share.expiresAt)}
                        </p>
                      )}
                    </td>
                    <td className="text-text-secondary">
                      {share.document.company ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-text-muted" />
                          {share.document.company.name}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <ShareStatusBadge status={share.effectiveStatus} />
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1">
                        {share.allowedActions.includes('view') && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-background-tertiary rounded text-xs text-text-muted">
                            <Eye className="w-3 h-3" />
                          </span>
                        )}
                        {share.allowedActions.includes('download') && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-background-tertiary rounded text-xs text-text-muted">
                            <Download className="w-3 h-3" />
                          </span>
                        )}
                        {share.allowComments && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-background-tertiary rounded text-xs text-text-muted">
                            <MessageSquare className="w-3 h-3" />
                          </span>
                        )}
                        {share.passwordHash && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 rounded text-xs text-amber-700 dark:text-amber-400">
                            <Lock className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-text-secondary">
                      {share.viewCount}
                      {share._count.comments > 0 && (
                        <span className="text-text-muted ml-1">
                          ({share._count.comments} comments)
                        </span>
                      )}
                    </td>
                    <td className="text-text-secondary">
                      <div>
                        <p className="text-sm">{formatDate(share.createdAt)}</p>
                        <p className="text-xs text-text-tertiary">
                          by {share.createdBy.firstName} {share.createdBy.lastName}
                        </p>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {/* Copy link */}
                        <button
                          type="button"
                          onClick={() => handleCopyLink(share)}
                          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
                          title="Copy link"
                          disabled={share.effectiveStatus !== 'active'}
                        >
                          {copiedId === share.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {/* Open link */}
                        <a
                          href={getShareUrl(share.shareToken)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            'p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors',
                            share.effectiveStatus !== 'active' && 'opacity-50 pointer-events-none'
                          )}
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        {/* Manage shares */}
                        <Link
                          href={`/generated-documents/${share.document.id}/share`}
                          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
                          title="Manage shares"
                        >
                          <FileText className="w-4 h-4" />
                        </Link>

                        {/* Revoke */}
                        {share.effectiveStatus === 'active' && (
                          <button
                            type="button"
                            onClick={() => {
                              setShareToRevoke(share);
                              setRevokeDialogOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Revoke"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={() => {}}
        />
      )}

      {/* Revoke dialog */}
      <ConfirmDialog
        isOpen={revokeDialogOpen}
        onClose={() => {
          setRevokeDialogOpen(false);
          setShareToRevoke(null);
        }}
        onConfirm={handleRevokeShare}
        title="Revoke Share Link"
        description={`This will immediately disable the share link for "${shareToRevoke?.document.title}". Anyone with the link will no longer be able to access the document.`}
        confirmLabel={isRevoking ? 'Revoking...' : 'Revoke Link'}
        variant="danger"
      />
    </div>
  );
}
