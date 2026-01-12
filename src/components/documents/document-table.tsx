'use client';

import Link from 'next/link';
import { formatDate, cn } from '@/lib/utils';
import {
  FileText,
  Eye,
  Pencil,
  Trash2,
  Download,
  Share2,
  Clock,
  CheckCircle,
  Archive,
  Building2,
  User,
} from 'lucide-react';
import { PrefetchLink } from '@/components/ui/prefetch-link';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';

// ============================================================================
// Types
// ============================================================================

export interface GeneratedDocument {
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

interface DocumentTableProps {
  documents: GeneratedDocument[];
  onDelete?: (id: string) => void;
  onExport?: (id: string) => void;
  isLoading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canShare?: boolean;
  canCreate?: boolean;
}

// ============================================================================
// Status Config
// ============================================================================

const statusConfig: Record<string, { color: string; label: string; icon: typeof Clock }> = {
  DRAFT: { color: 'badge-warning', label: 'Draft', icon: Clock },
  FINALIZED: { color: 'badge-success', label: 'Finalized', icon: CheckCircle },
  ARCHIVED: { color: 'badge-neutral', label: 'Archived', icon: Archive },
};

// ============================================================================
// Action Icons Component
// ============================================================================

interface DocumentActionsProps {
  documentId: string;
  documentTitle: string;
  status: string;
  onDelete?: (id: string) => void;
  onExport?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canShare?: boolean;
}

function DocumentActions({
  documentId,
  documentTitle,
  status,
  onDelete,
  onExport,
  canEdit,
  canDelete,
  canExport,
  canShare,
}: DocumentActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {/* View */}
      <Link
        href={`/generated-documents/${documentId}`}
        className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
        aria-label={`View ${documentTitle}`}
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
      </Link>

      {/* Edit (only for drafts) */}
      {canEdit && status === 'DRAFT' && (
        <Link
          href={`/generated-documents/${documentId}/edit`}
          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
          aria-label={`Edit ${documentTitle}`}
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}

      {/* Export PDF */}
      {canExport && (
        <button
          type="button"
          onClick={() => onExport?.(documentId)}
          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
          aria-label={`Export ${documentTitle} as PDF`}
        >
          <Download className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

      {/* Share */}
      {canShare && (
        <Link
          href={`/generated-documents/${documentId}/share`}
          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
          aria-label={`Share ${documentTitle}`}
        >
          <Share2 className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}

      {/* Delete */}
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete?.(documentId)}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors"
          aria-label={`Delete ${documentTitle}`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Document Table Component
// ============================================================================

export function DocumentTable({
  documents,
  onDelete,
  onExport,
  isLoading,
  canEdit = true,
  canDelete = true,
  canExport = true,
  canShare = true,
  canCreate = true,
}: DocumentTableProps) {
  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Company</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Updated</th>
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
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-24 ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="card p-12 text-center">
        <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">No documents found</h3>
        <p className="text-text-secondary mb-4">
          {canCreate
            ? 'Get started by generating your first document or adjusting your filters.'
            : 'No documents available. Try adjusting your filters.'}
        </p>
        {canCreate && (
          <Link href="/generated-documents/generate" className="btn-primary btn-sm inline-flex">
            Generate Document
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {documents.map((doc) => {
          const status = statusConfig[doc.status] || statusConfig.DRAFT;
          const StatusIcon = status.icon;

          return (
            <MobileCard
              key={doc.id}
              title={doc.title}
              subtitle={doc.template?.name}
              badge={
                <span className={cn('badge inline-flex items-center gap-1', status.color)}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </span>
              }
              details={
                <CardDetailsGrid>
                  <CardDetailItem
                    label="Company"
                    value={doc.company?.name || '"”'}
                    icon={<Building2 className="w-3 h-3" />}
                  />
                  <CardDetailItem
                    label="Created By"
                    value={`${doc.createdBy.firstName} ${doc.createdBy.lastName}`}
                    icon={<User className="w-3 h-3" />}
                  />
                  <CardDetailItem
                    label="Updated"
                    value={formatDate(doc.updatedAt)}
                    icon={<Clock className="w-3 h-3" />}
                  />
                  {doc._count && doc._count.shares > 0 && (
                    <CardDetailItem
                      label="Shares"
                      value={doc._count.shares.toString()}
                      icon={<Share2 className="w-3 h-3" />}
                    />
                  )}
                </CardDetailsGrid>
              }
              actions={
                <div className="flex items-center gap-1">
                  <Link
                    href={`/generated-documents/${doc.id}`}
                    className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={`View ${doc.title}`}
                  >
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  </Link>
                  {canEdit && doc.status === 'DRAFT' && (
                    <Link
                      href={`/generated-documents/${doc.id}/edit`}
                      className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label={`Edit ${doc.title}`}
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  )}
                  {canExport && (
                    <button
                      type="button"
                      onClick={() => onExport?.(doc.id)}
                      className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label={`Export ${doc.title} as PDF`}
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                  {canShare && (
                    <Link
                      href={`/generated-documents/${doc.id}/share`}
                      className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label={`Share ${doc.title}`}
                    >
                      <Share2 className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete?.(doc.id)}
                      className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label={`Delete ${doc.title}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              }
            />
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Company</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Updated</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const status = statusConfig[doc.status] || statusConfig.DRAFT;
              const StatusIcon = status.icon;

              return (
                <tr key={doc.id}>
                  <td>
                    <PrefetchLink
                      href={`/generated-documents/${doc.id}`}
                      className="font-medium text-text-primary hover:text-oak-light transition-colors"
                    >
                      {doc.title}
                    </PrefetchLink>
                    {doc.template && (
                      <p className="text-xs text-text-tertiary mt-0.5 truncate max-w-xs">
                        {doc.template.name}
                      </p>
                    )}
                  </td>
                  <td className="text-text-secondary">
                    {doc.company ? (
                      <span className="truncate max-w-[200px] block">{doc.company.name}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${status.color} inline-flex items-center gap-1`}>
                      <StatusIcon className="w-3 h-3" aria-hidden="true" />
                      {status.label}
                    </span>
                  </td>
                  <td className="text-text-secondary">
                    {doc.createdBy.firstName} {doc.createdBy.lastName}
                  </td>
                  <td className="text-text-secondary">
                    {formatDate(doc.updatedAt)}
                  </td>
                  <td className="text-right">
                    <DocumentActions
                      documentId={doc.id}
                      documentTitle={doc.title}
                      status={doc.status}
                      onDelete={onDelete}
                      onExport={onExport}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canExport={canExport}
                      canShare={canShare}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
