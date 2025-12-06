'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  FileText,
  AlertCircle,
  Trash2,
  Eye,
  Download,
  Share2,
  MoreVertical,
  Clock,
  CheckCircle,
  Archive,
  Search,
  Filter,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';

// ============================================================================
// Types
// ============================================================================

interface GeneratedDocument {
  id: string;
  title: string;
  status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  content: string;
  useLetterhead: boolean;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  template?: {
    id: string;
    name: string;
    category: string;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  _count?: {
    shares: number;
    comments: number;
  };
}

interface DocumentListResponse {
  documents: GeneratedDocument[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const config = {
    DRAFT: {
      icon: Clock,
      label: 'Draft',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    },
    FINALIZED: {
      icon: CheckCircle,
      label: 'Finalized',
      className: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
    },
    ARCHIVED: {
      icon: Archive,
      label: 'Archived',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
  }[status] || {
    icon: FileText,
    label: status,
    className: 'bg-gray-100 text-gray-600',
  };

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        config.className
      )}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Document Card Component
// ============================================================================

interface DocumentCardProps {
  document: GeneratedDocument;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onShare?: () => void;
}

function DocumentCard({
  document,
  onView,
  onEdit,
  onDelete,
  onExport,
  onShare,
}: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="group relative p-4 bg-background-elevated border border-border-primary rounded-lg hover:border-accent-primary hover:shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-text-primary truncate">
              {document.title}
            </h3>
            {document.template && (
              <p className="text-xs text-text-muted">
                Template: {document.template.name}
              </p>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded hover:bg-background-secondary text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-background-elevated border border-border-primary rounded-lg shadow-lg z-20">
                <button
                  type="button"
                  onClick={() => {
                    onView();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                {onEdit && document.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => {
                      onEdit();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Edit
                  </button>
                )}
                {onExport && (
                  <button
                    type="button"
                    onClick={() => {
                      onExport();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export PDF
                  </button>
                )}
                {onShare && (
                  <button
                    type="button"
                    onClick={() => {
                      onShare();
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                )}
                {onDelete && (
                  <>
                    <div className="h-px bg-border-secondary my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        onDelete();
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-red-50 dark:hover:bg-red-950 text-red-600 dark:text-red-400 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Company info */}
      {document.company && (
        <div className="flex items-center gap-1.5 mb-3 text-sm text-text-muted">
          <Building2 className="w-3.5 h-3.5" />
          <span className="truncate">{document.company.name}</span>
          <span className="text-xs">({document.company.uen})</span>
        </div>
      )}

      {/* Status and stats */}
      <div className="flex items-center justify-between">
        <StatusBadge status={document.status} />
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {document._count?.shares !== undefined && document._count.shares > 0 && (
            <span className="flex items-center gap-1">
              <Share2 className="w-3 h-3" />
              {document._count.shares}
            </span>
          )}
          <span>
            {new Date(document.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function GeneratedDocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { data: session } = useSession();

  // Tenant selection (for SUPER_ADMIN)
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    selectedTenantId,
    session?.tenantId
  );

  // Permission checks
  const canCreate = can.createDocument;
  const canRead = can.readDocument;
  const canUpdate = can.updateDocument;
  const canDelete = can.deleteDocument;
  const canExport = can.exportDocument;

  // State
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get('status') || ''
  );
  const [page, setPage] = useState(
    parseInt(searchParams.get('page') || '1', 10)
  );
  const limit = 12;

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    // Don't fetch if SUPER_ADMIN hasn't selected a tenant
    if (session?.isSuperAdmin && !activeTenantId) {
      setDocuments([]);
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
      // Add tenantId for SUPER_ADMIN
      if (session?.isSuperAdmin && activeTenantId) {
        params.set('tenantId', activeTenantId);
      }

      const response = await fetch(`/api/generated-documents?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data: DocumentListResponse = await response.json();
      setDocuments(data.documents);
      setTotal(data.total);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, page, session?.isSuperAdmin, activeTenantId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle delete
  const handleDelete = async () => {
    if (!documentToDelete) return;

    try {
      const response = await fetch(
        `/api/generated-documents/${documentToDelete}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      success('Document deleted successfully');
      setDocuments((prev) => prev.filter((d) => d.id !== documentToDelete));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.error('Delete error:', err);
      toastError('Failed to delete document');
    } finally {
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  // Handle export
  const handleExport = async (documentId: string) => {
    try {
      const response = await fetch(
        `/api/generated-documents/${documentId}/export/pdf`
      );
      if (!response.ok) {
        throw new Error('Failed to export document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${documentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      toastError('Failed to export document');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Generated Documents
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage and export your generated documents
          </p>
        </div>

        {canCreate && (
          <Link href="/generated-documents/generate">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Generate Document
            </Button>
          </Link>
        )}
      </div>

      {/* Tenant Selector for SUPER_ADMIN */}
      {session?.isSuperAdmin && (
        <div className="mb-6">
          <TenantSelector
            value={selectedTenantId}
            onChange={setSelectedTenantId}
            label="Select Tenant"
            helpText="Select a tenant to view their documents"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-border-primary rounded-lg bg-background-elevated text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="FINALIZED">Finalized</option>
          <option value="ARCHIVED">Archived</option>
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
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-40 bg-background-secondary rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && documents.length === 0 && (
        <div className="py-16 text-center">
          <FileText className="w-16 h-16 mx-auto text-text-muted opacity-50 mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">
            {session?.isSuperAdmin && !activeTenantId
              ? 'Select a Tenant'
              : 'No documents found'}
          </h3>
          <p className="text-text-muted mb-6">
            {session?.isSuperAdmin && !activeTenantId
              ? 'Please select a tenant to view their documents'
              : searchQuery || statusFilter
                ? 'Try adjusting your filters'
                : 'Get started by generating your first document'}
          </p>
          {!searchQuery && !statusFilter && canCreate && activeTenantId && (
            <Link href="/generated-documents/generate">
              <Button variant="primary" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Generate Document
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Document grid */}
      {!isLoading && documents.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onView={() => router.push(`/generated-documents/${doc.id}`)}
                onEdit={
                  canUpdate && doc.status === 'DRAFT'
                    ? () => router.push(`/generated-documents/${doc.id}/edit`)
                    : undefined
                }
                onDelete={
                  canDelete
                    ? () => {
                        setDocumentToDelete(doc.id);
                        setDeleteDialogOpen(true);
                      }
                    : undefined
                }
                onExport={canExport ? () => handleExport(doc.id) : undefined}
                onShare={
                  canUpdate
                    ? () => router.push(`/generated-documents/${doc.id}/share`)
                    : undefined
                }
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">
                Showing {(page - 1) * limit + 1} to{' '}
                {Math.min(page * limit, total)} of {total} documents
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="px-3 py-1 text-xs text-text-muted">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDocumentToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
