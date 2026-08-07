'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, AlertCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  readSessionListSnapshot,
  writeSessionListSnapshot,
} from '@/hooks/use-session-query-restore';
import { DocumentTable, type GeneratedDocument } from '@/components/documents/document-table';
import { DocumentGenerationTabs } from '@/components/documents/document-generation-tabs';
import { Pagination } from '@/components/ui/pagination';

// ============================================================================
// Types
// ============================================================================

interface DocumentListResponse {
  documents: GeneratedDocument[];
  total: number;
  page: number;
  limit: number;
}

function generatedDocumentsListKey(
  page: number,
  searchQuery: string,
  statusFilter: string,
  companyFilter: string,
): readonly unknown[] {
  return ['generated-documents', page, searchQuery, statusFilter, companyFilter];
}

function isDocumentListResponse(value: unknown): value is DocumentListResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DocumentListResponse>;
  return (
    !!candidate.documents &&
    Array.isArray(candidate.documents) &&
    typeof candidate.total === 'number'
  );
}


// ============================================================================
// Main Page Component
// ============================================================================

export default function GeneratedDocumentsPage() {
  const searchParams = useSearchParams();
  const { success, error: toastError } = useToast();
  const { can } = usePermissions();

  // Permission checks
  const canCreate = can.createDocument;
  const canUpdate = can.updateDocument;
  const canDelete = can.deleteDocument;
  const canExport = can.exportDocument;

  // Initial URL-derived list state, used both for filters and for restoring the
  // last-known list snapshot when this page is mounted cold (e.g. browser Back).
  const initialSearchQuery = searchParams.get('q') || '';
  const initialStatusFilter = searchParams.get('status') || '';
  const initialCompanyFilter = searchParams.get('company') || '';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const [initialListSnapshot] = useState<DocumentListResponse | undefined>(() => {
    const snapshot = readSessionListSnapshot<DocumentListResponse>(
      generatedDocumentsListKey(initialPage, initialSearchQuery, initialStatusFilter, initialCompanyFilter),
    );
    return isDocumentListResponse(snapshot) ? snapshot : undefined;
  });

  // State
  const [documents, setDocuments] = useState<GeneratedDocument[]>(
    () => initialListSnapshot?.documents ?? [],
  );
  const [total, setTotal] = useState(() => initialListSnapshot?.total ?? 0);
  const [isLoading, setIsLoading] = useState(() => initialListSnapshot === undefined);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [draftToDiscard, setDraftToDiscard] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
  const [companyFilter, setCompanyFilter] = useState<string>(initialCompanyFilter);
  const [page, setPage] = useState(initialPage);
  const limit = 20; // More items per page for list view
  const firstFetchRef = useRef(true);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    const hasRestoredSnapshot = firstFetchRef.current && initialListSnapshot !== undefined;
    firstFetchRef.current = false;
    if (!hasRestoredSnapshot) setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (statusFilter) params.set('status', statusFilter);
      if (companyFilter) params.set('companyName', companyFilter);
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      const response = await fetch(`/api/generated-documents?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data: DocumentListResponse = await response.json();
      setDocuments(data.documents);
      setTotal(data.total);
      writeSessionListSnapshot(
        generatedDocumentsListKey(page, searchQuery, statusFilter, companyFilter),
        data,
      );
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, companyFilter, page, initialListSnapshot]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Handle delete
  const handleDelete = async (reason?: string) => {
    if (!documentToDelete || !reason) return;

    try {
      const params = new URLSearchParams();
      params.set('reason', reason);
      const url = `/api/generated-documents/${documentToDelete}?${params}`;

      const response = await fetch(url, { method: 'DELETE' });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // If already deleted, still remove from UI and show success
        if (errorData.error === 'Document is already deleted') {
          success('Document removed from list');
          setDocuments((prev) => prev.filter((d) => d.id !== documentToDelete));
          setTotal((prev) => prev - 1);
          return;
        }
        throw new Error(errorData.error || 'Failed to delete document');
      }

      success('Document deleted successfully');
      setDocuments((prev) => prev.filter((d) => d.id !== documentToDelete));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.error('Delete error:', err);
      toastError(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const handleDiscardDraft = async () => {
    if (!draftToDiscard) return;

    try {
      const params = new URLSearchParams({ reason: 'Discarded document generation draft' });
      const response = await fetch(`/api/generated-documents/${draftToDiscard}?${params}`, {
        method: 'DELETE',
      });
      const errorData = response.ok ? null : await response.json().catch(() => ({}));
      if (!response.ok && errorData?.error !== 'Document is already deleted') {
        throw new Error(errorData?.error || 'Failed to discard draft');
      }

      setDocuments((previous) => previous.filter((document) => document.id !== draftToDiscard));
      setTotal((previous) => Math.max(0, previous - 1));
      success('Draft discarded');
    } catch (err) {
      console.error('Discard draft error:', err);
      toastError(err instanceof Error ? err.message : 'Failed to discard draft');
    } finally {
      setDraftToDiscard(null);
    }
  };

  // Handle export
  const handleExport = async (documentId: string) => {
    try {
      const response = await fetch(`/api/generated-documents/${documentId}/export/pdf`);
      if (!response.ok) {
        throw new Error('Failed to export document');
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `document-${documentId}.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Export error:', err);
      toastError('Failed to export document');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 sm:p-6">
      <DocumentGenerationTabs />
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
      </div>

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
            placeholder="Search documents..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
          />
        </div>

        {/* Company Filter */}
        <input
          type="text"
          value={companyFilter}
          onChange={(e) => {
            setCompanyFilter(e.target.value);
            setPage(1);
          }}
          placeholder="Filter by company..."
          className="px-3 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary min-w-[150px]"
        />

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
          <option value="DRAFT">Draft</option>
          <option value="FINALIZED">Finalized</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        <div className="flex-1" />

        {canCreate && (
          <Link href="/generated-documents/generate">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Generate Document
            </Button>
          </Link>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Document Table */}
      <div>
        <DocumentTable
          documents={documents}
          onDelete={(id) => {
            setDocumentToDelete(id);
            setDeleteDialogOpen(true);
          }}
          onExport={handleExport}
          onDiscardDraft={setDraftToDiscard}
          isLoading={isLoading}
          canEdit={canUpdate}
          canDelete={canDelete}
          canExport={canExport}
          canShare={canUpdate}
          canCreate={canCreate}
        />
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 0 && (
        <div className="mt-4">
          <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={() => {
            setPage(1);
            // Note: limit is a const, so we need to refetch with new limit
            // For now, we'll keep the current behavior
          }}
          />
        </div>
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
        description="This action cannot be undone. The document will be soft-deleted and can be restored by an administrator."
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this document..."
        reasonMinLength={10}
      />

      <ConfirmDialog
        isOpen={draftToDiscard !== null}
        onClose={() => setDraftToDiscard(null)}
        onConfirm={handleDiscardDraft}
        title="Discard Draft"
        description="Discard this saved draft? This action cannot be undone."
        confirmLabel="Discard Draft"
        variant="danger"
      />
    </div>
  );
}
