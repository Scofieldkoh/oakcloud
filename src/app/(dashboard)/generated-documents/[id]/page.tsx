'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  AlertCircle,
  FileText,
  Download,
  Share2,
  Edit,
  Lock,
  Unlock,
  Archive,
  Clock,
  CheckCircle,
  Building2,
  Calendar,
  User,
  MoreVertical,
  Copy,
  Printer,
  Eye,
  EyeOff,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-auth';
import { A4PageEditor } from '@/components/documents/a4-page-editor';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format date as "d MMM yyyy" (e.g., "9 Dec 2025")
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Format datetime as "d MMM yyyy, h:mm a" (e.g., "9 Dec 2025, 2:30 PM")
 */
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} ${month} ${year}, ${time}`;
}

// ============================================================================
// Types
// ============================================================================

interface GeneratedDocument {
  id: string;
  title: string;
  status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  content: string;
  contentJson?: Record<string, unknown> | null;
  useLetterhead: boolean;
  shareExpiryHours?: number | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | null;
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
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  finalizedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  _count?: {
    shares: number;
    comments: number;
  };
}

interface DocumentComment {
  id: string;
  content: string;
  createdAt: string;
  resolvedAt?: string | null;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  resolvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  replies?: DocumentComment[];
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
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
        config.className
      )}
    >
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function DocumentViewPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.id as string;
  const { success, error: toastError } = useToast();
  const { data: session } = useSession();

  // Tenant selection for SUPER_ADMIN
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // State
  const [docData, setDocData] = useState<GeneratedDocument | null>(null);
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeLetterhead, setIncludeLetterhead] = useState(true);

  // Dialogs
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [unfinalizeDialogOpen, setUnfinalizeDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch document and comments
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Build URL with tenantId for SUPER_ADMIN
        const urlParams = new URLSearchParams();
        if (session?.isSuperAdmin && activeTenantId) {
          urlParams.set('tenantId', activeTenantId);
        }
        const queryString = urlParams.toString();
        const docUrl = `/api/generated-documents/${documentId}${queryString ? `?${queryString}` : ''}`;
        const commentsUrl = `/api/generated-documents/${documentId}/comments${queryString ? `?${queryString}` : ''}`;

        // Fetch document and comments in parallel
        const [docResponse, commentsResponse] = await Promise.all([
          fetch(docUrl),
          fetch(commentsUrl),
        ]);

        if (!docResponse.ok) {
          if (docResponse.status === 404) {
            throw new Error('Document not found');
          }
          throw new Error('Failed to fetch document');
        }

        const data = await docResponse.json();
        setDocData(data);
        setIncludeLetterhead(data.useLetterhead);

        // Load comments if available
        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          setComments(commentsData);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [documentId, session?.isSuperAdmin, activeTenantId]);

  // Handle finalize
  const handleFinalize = async () => {
    setIsProcessing(true);
    try {
      const body: Record<string, unknown> = {};
      if (session?.isSuperAdmin && activeTenantId) {
        body.tenantId = activeTenantId;
      }

      const response = await fetch(
        `/api/generated-documents/${documentId}/finalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to finalize document');
      }

      const updated = await response.json();
      setDocData(updated);
      success('Document finalized successfully');
    } catch (err) {
      console.error('Finalize error:', err);
      toastError('Failed to finalize document');
    } finally {
      setIsProcessing(false);
      setFinalizeDialogOpen(false);
    }
  };

  // Handle unfinalize
  const handleUnfinalize = async () => {
    setIsProcessing(true);
    try {
      // Build URL with reason and tenantId as query params
      const params = new URLSearchParams();
      params.set('reason', 'User requested to edit document');
      if (session?.isSuperAdmin && activeTenantId) {
        params.set('tenantId', activeTenantId);
      }

      const response = await fetch(
        `/api/generated-documents/${documentId}/finalize?${params}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to unfinalize document');
      }

      const updated = await response.json();
      setDocData(updated);
      success('Document unlocked for editing');
    } catch (err) {
      console.error('Unfinalize error:', err);
      toastError(err instanceof Error ? err.message : 'Failed to unlock document');
    } finally {
      setIsProcessing(false);
      setUnfinalizeDialogOpen(false);
    }
  };

  // Handle archive
  const handleArchive = async () => {
    setIsProcessing(true);
    try {
      const body: Record<string, unknown> = {
        action: 'archive',
        reason: 'User requested to archive document',
      };
      if (session?.isSuperAdmin && activeTenantId) {
        body.tenantId = activeTenantId;
      }

      const response = await fetch(`/api/generated-documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to archive document');
      }

      const updated = await response.json();
      setDocData(updated);
      success('Document archived');
    } catch (err) {
      console.error('Archive error:', err);
      toastError('Failed to archive document');
    } finally {
      setIsProcessing(false);
      setArchiveDialogOpen(false);
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.set('letterhead', String(includeLetterhead));
      if (session?.isSuperAdmin && activeTenantId) {
        params.set('tenantId', activeTenantId);
      }

      const response = await fetch(
        `/api/generated-documents/${documentId}/export/pdf?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to export document');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docData?.title || 'document'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      toastError('Failed to export document');
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  // Handle clone
  const handleClone = async () => {
    try {
      const body: Record<string, unknown> = {};
      if (session?.isSuperAdmin && activeTenantId) {
        body.tenantId = activeTenantId;
      }

      const response = await fetch(
        `/api/generated-documents/${documentId}/clone`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to clone document');
      }

      const cloned = await response.json();
      success('Document cloned successfully');
      router.push(`/generated-documents/${cloned.id}/edit`);
    } catch (err) {
      console.error('Clone error:', err);
      toastError('Failed to clone document');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 animate-spin text-accent-primary mb-4" />
          <p className="text-text-muted">Loading document...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !docData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h3 className="text-lg font-medium text-red-700 dark:text-red-400 mb-2">
            {error || 'Document not found'}
          </h3>
          <Link href="/generated-documents">
            <Button variant="secondary">Back to Documents</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary truncate">
              {docData.title}
            </h1>
            <StatusBadge status={docData.status} />
          </div>
          {docData.template && (
            <p className="text-text-secondary text-sm mt-1">
              From template: {docData.template.name}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Letterhead toggle */}
          <button
            type="button"
            onClick={() => setIncludeLetterhead(!includeLetterhead)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
              includeLetterhead
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'bg-background-tertiary text-text-muted hover:text-text-primary'
            )}
            title={includeLetterhead ? 'Hide letterhead' : 'Show letterhead'}
          >
            {includeLetterhead ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
            Letterhead
          </button>

          <div className="w-px h-6 bg-border-secondary" />

          {/* Edit (only for drafts) */}
          {docData.status === 'DRAFT' && (
            <Link href={`/generated-documents/${docData.id}/edit`}>
              <Button variant="secondary" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </Link>
          )}

          {/* Finalize/Unfinalize */}
          {docData.status === 'DRAFT' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFinalizeDialogOpen(true)}
            >
              <Lock className="w-4 h-4 mr-2" />
              Finalize
            </Button>
          )}
          {docData.status === 'FINALIZED' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUnfinalizeDialogOpen(true)}
            >
              <Unlock className="w-4 h-4 mr-2" />
              Unlock
            </Button>
          )}

          {/* Export */}
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>

          {/* Share */}
          <Link href={`/generated-documents/${docData.id}/share`}>
            <Button variant="secondary" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </Link>

          {/* More actions */}
          <div className="relative group">
            <Button variant="ghost" size="sm">
              <MoreVertical className="w-4 h-4" />
            </Button>
            <div className="absolute right-0 top-full mt-1 w-40 py-1 bg-background-elevated border border-border-primary rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                type="button"
                onClick={handleClone}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Clone
              </button>
              {docData.status !== 'ARCHIVED' && (
                <>
                  <div className="h-px bg-border-secondary my-1" />
                  <button
                    type="button"
                    onClick={() => setArchiveDialogOpen(true)}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-secondary text-amber-600 flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    Archive
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mt-6">
        <div className="flex gap-6">
          {/* Document metadata sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="sticky top-24 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
              {/* Details Panel */}
              <div className="p-4 bg-background-secondary border border-border-primary rounded-lg space-y-3">
                <h4 className="text-sm font-medium text-text-primary">
                  Details
                </h4>

                {docData.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-text-muted" />
                    <div>
                      <p className="text-text-primary">{docData.company.name}</p>
                      <p className="text-xs text-text-muted">
                        {docData.company.uen}
                      </p>
                    </div>
                  </div>
                )}

                {docData.createdBy && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-text-muted" />
                    <span className="text-text-secondary">
                      {docData.createdBy.firstName} {docData.createdBy.lastName}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-text-muted" />
                  <span className="text-text-secondary">
                    {formatDate(docData.createdAt)}
                  </span>
                </div>

                {docData.finalizedAt && docData.finalizedBy && (
                  <div className="pt-2 border-t border-border-secondary">
                    <p className="text-xs text-text-muted">
                      Finalized by {docData.finalizedBy.firstName}{' '}
                      {docData.finalizedBy.lastName}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatDateTime(docData.finalizedAt)}
                    </p>
                  </div>
                )}

                {docData._count && (
                  <div className="pt-2 border-t border-border-secondary flex items-center gap-4 text-xs text-text-muted">
                    <span>{docData._count.shares} shares</span>
                    <span>{docData._count.comments} comments</span>
                  </div>
                )}
              </div>

              {/* Comments Section - Inside sticky container */}
              {comments.length > 0 && (
                <div className="p-4 bg-background-secondary border border-border-primary rounded-lg">
                  <h4 className="text-sm font-medium text-text-primary flex items-center gap-2 mb-3">
                    <MessageCircle className="w-4 h-4" />
                    Comments ({comments.length})
                  </h4>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={cn(
                          'p-3 rounded-lg text-sm',
                          comment.resolvedAt
                            ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800'
                            : 'bg-background-tertiary'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-text-primary">
                            {comment.user
                              ? `${comment.user.firstName} ${comment.user.lastName}`
                              : 'Unknown'}
                          </span>
                          <span className="text-xs text-text-muted">
                            {formatDate(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-text-secondary whitespace-pre-wrap">
                          {comment.content}
                        </p>
                        {comment.resolvedAt && comment.resolvedBy && (
                          <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                            Resolved by {comment.resolvedBy.firstName}{' '}
                            {comment.resolvedBy.lastName}
                          </p>
                        )}
                        {/* Replies */}
                        {comment.replies && comment.replies.length > 0 && (
                          <div className="mt-2 pl-3 border-l-2 border-border-secondary space-y-2">
                            {comment.replies.map((reply) => (
                              <div key={reply.id} className="text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-text-primary text-xs">
                                    {reply.user
                                      ? `${reply.user.firstName} ${reply.user.lastName}`
                                      : 'Unknown'}
                                  </span>
                                  <span className="text-xs text-text-muted">
                                    {formatDate(reply.createdAt)}
                                  </span>
                                </div>
                                <p className="text-text-secondary text-xs mt-0.5">
                                  {reply.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Document content using A4PageEditor in read-only mode */}
          <div className="flex-1 min-w-0">
            <div className="border border-border-primary rounded-lg shadow-sm overflow-hidden h-[calc(100vh-12rem)]">
              <A4PageEditor
                value={docData.content}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Finalize dialog */}
      <ConfirmDialog
        isOpen={finalizeDialogOpen}
        onClose={() => setFinalizeDialogOpen(false)}
        onConfirm={handleFinalize}
        title="Finalize Document"
        description="Finalizing this document will lock it for editing. You can unlock it later if needed. Do you want to continue?"
        confirmLabel={isProcessing ? 'Finalizing...' : 'Finalize'}
        variant="info"
      />

      {/* Unfinalize dialog */}
      <ConfirmDialog
        isOpen={unfinalizeDialogOpen}
        onClose={() => setUnfinalizeDialogOpen(false)}
        onConfirm={handleUnfinalize}
        title="Unlock Document"
        description="Unlocking this document will allow editing. This action will be logged. Do you want to continue?"
        confirmLabel={isProcessing ? 'Unlocking...' : 'Unlock'}
        variant="info"
      />

      {/* Archive dialog */}
      <ConfirmDialog
        isOpen={archiveDialogOpen}
        onClose={() => setArchiveDialogOpen(false)}
        onConfirm={handleArchive}
        title="Archive Document"
        description="Archiving this document will hide it from the main list. It can still be accessed from archived documents. Do you want to continue?"
        confirmLabel={isProcessing ? 'Archiving...' : 'Archive'}
        variant="warning"
      />
    </div>
  );
}
