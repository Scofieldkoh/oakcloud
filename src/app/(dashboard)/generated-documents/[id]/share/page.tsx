'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Share2,
  Copy,
  Link2,
  Trash2,
  Plus,
  Eye,
  Download,
  MessageSquare,
  Calendar,
  Lock,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';

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
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    comments: number;
  };
}

interface DocumentInfo {
  id: string;
  title: string;
  status: string;
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ShareManagementPage() {
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
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [shares, setShares] = useState<DocumentShare[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create share dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newSharePassword, setNewSharePassword] = useState('');
  const [newShareExpiry, setNewShareExpiry] = useState('');
  const [allowView, setAllowView] = useState(true);
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComments, setAllowComments] = useState(false);

  // Revoke dialog
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [shareToRevoke, setShareToRevoke] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Fetch document and shares
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Build URL params for SUPER_ADMIN
        const queryParams = new URLSearchParams();
        if (session?.isSuperAdmin && activeTenantId) {
          queryParams.set('tenantId', activeTenantId);
        }
        const queryString = queryParams.toString() ? `?${queryParams}` : '';

        // Fetch document info
        const docResponse = await fetch(`/api/generated-documents/${documentId}${queryString}`);
        if (!docResponse.ok) {
          if (docResponse.status === 404) {
            throw new Error('Document not found');
          }
          throw new Error('Failed to fetch document');
        }
        const docData = await docResponse.json();
        setDocument({ id: docData.id, title: docData.title, status: docData.status });

        // Fetch shares
        const sharesResponse = await fetch(`/api/generated-documents/${documentId}/share${queryString}`);
        if (sharesResponse.ok) {
          const sharesData = await sharesResponse.json();
          setShares(sharesData);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [documentId, session?.isSuperAdmin, activeTenantId]);

  // Get share URL
  const getShareUrl = (token: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/share/${token}`;
  };

  // Copy share link
  const handleCopyLink = async (token: string, shareId: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(token));
      setCopiedId(shareId);
      success('Link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toastError('Failed to copy link');
    }
  };

  // Create new share
  const handleCreateShare = async () => {
    setIsCreating(true);
    try {
      const body: Record<string, unknown> = {
        documentId,
        allowedActions: [
          ...(allowView ? ['view'] : []),
          ...(allowDownload ? ['download'] : []),
        ],
        allowComments,
      };

      if (newSharePassword.trim()) {
        body.password = newSharePassword;
      }

      if (newShareExpiry) {
        body.expiresAt = new Date(newShareExpiry).toISOString();
      }

      if (session?.isSuperAdmin && activeTenantId) {
        body.tenantId = activeTenantId;
      }

      const response = await fetch(`/api/generated-documents/${documentId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create share link');
      }

      const newShare = await response.json();
      setShares((prev) => [newShare, ...prev]);

      // Reset form
      setNewSharePassword('');
      setNewShareExpiry('');
      setAllowView(true);
      setAllowDownload(true);
      setAllowComments(false);
      setCreateDialogOpen(false);

      // Copy the new link
      await navigator.clipboard.writeText(getShareUrl(newShare.shareToken));
      success('Share link created and copied to clipboard');
    } catch (err) {
      console.error('Create share error:', err);
      toastError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setIsCreating(false);
    }
  };

  // Revoke share
  const handleRevokeShare = async () => {
    if (!shareToRevoke) return;

    setIsRevoking(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('shareId', shareToRevoke);
      if (session?.isSuperAdmin && activeTenantId) {
        queryParams.set('tenantId', activeTenantId);
      }

      const response = await fetch(
        `/api/generated-documents/${documentId}/share?${queryParams}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to revoke share link');
      }

      setShares((prev) => prev.filter((s) => s.id !== shareToRevoke));
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

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 animate-spin text-accent-primary mb-4" />
          <p className="text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !document) {
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

  const activeShares = shares.filter((s) => s.isActive);
  const inactiveShares = shares.filter((s) => !s.isActive);

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Header */}
      <div className="border-b border-border-primary bg-background-secondary sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/generated-documents/${documentId}`}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="h-6 w-px bg-border-secondary" />
              <div>
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-accent-primary" />
                  <h1 className="text-xl font-semibold text-text-primary">
                    Share Document
                  </h1>
                </div>
                <p className="text-sm text-text-muted">{document.title}</p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Share Link
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Active shares */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Active Share Links ({activeShares.length})
          </h2>

          {activeShares.length === 0 ? (
            <div className="p-8 bg-background-secondary border border-border-primary rounded-lg text-center">
              <Share2 className="w-10 h-10 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary mb-4">
                No active share links. Create one to share this document externally.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Share Link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeShares.map((share) => (
                <div
                  key={share.id}
                  className="p-4 bg-background-secondary border border-border-primary rounded-lg"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <code className="text-sm bg-background-tertiary px-2 py-1 rounded truncate max-w-[400px]">
                          {getShareUrl(share.shareToken)}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(share.shareToken, share.id)}
                          className="p-1.5 hover:bg-background-tertiary rounded transition-colors"
                          title="Copy link"
                        >
                          {copiedId === share.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-text-muted" />
                          )}
                        </button>
                        <a
                          href={getShareUrl(share.shareToken)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-background-tertiary rounded transition-colors"
                          title="Open in new tab"
                        >
                          <ExternalLink className="w-4 h-4 text-text-muted" />
                        </a>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                        {share.allowedActions.includes('view') && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-background-tertiary rounded">
                            <Eye className="w-3 h-3" />
                            View
                          </span>
                        )}
                        {share.allowedActions.includes('download') && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-background-tertiary rounded">
                            <Download className="w-3 h-3" />
                            Download
                          </span>
                        )}
                        {share.allowComments && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-background-tertiary rounded">
                            <MessageSquare className="w-3 h-3" />
                            Comments
                          </span>
                        )}
                        {share.passwordHash && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded">
                            <Lock className="w-3 h-3" />
                            Protected
                          </span>
                        )}
                        {share.expiresAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Expires {format(new Date(share.expiresAt), 'MMM d, yyyy')}
                          </span>
                        )}
                        <span>
                          {share.viewCount || 0} view{share.viewCount !== 1 ? 's' : ''}
                        </span>
                        {share._count && (
                          <span>{share._count.comments} comments</span>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShareToRevoke(share.id);
                        setRevokeDialogOpen(true);
                      }}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revoked shares */}
        {inactiveShares.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-text-muted mb-4">
              Revoked Share Links ({inactiveShares.length})
            </h2>
            <div className="space-y-2 opacity-60">
              {inactiveShares.map((share) => (
                <div
                  key={share.id}
                  className="p-3 bg-background-tertiary border border-border-secondary rounded-lg"
                >
                  <div className="flex items-center gap-3 text-sm text-text-muted">
                    <span className="line-through">{getShareUrl(share.shareToken)}</span>
                    <span className="text-xs">Revoked</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create share dialog */}
      <Modal
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create Share Link"
        size="md"
      >
        <ModalBody>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-text-secondary mb-4">
                Create a shareable link that allows external parties to view this document
                without logging in.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-text-primary mb-2">Permissions</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={allowView}
                    onChange={() => setAllowView(!allowView)}
                    size="sm"
                  />
                  <span className="text-sm text-text-primary flex items-center gap-2">
                    <Eye className="w-4 h-4 text-text-muted" />
                    Allow viewing
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={allowDownload}
                    onChange={() => setAllowDownload(!allowDownload)}
                    size="sm"
                  />
                  <span className="text-sm text-text-primary flex items-center gap-2">
                    <Download className="w-4 h-4 text-text-muted" />
                    Allow PDF download
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={allowComments}
                    onChange={() => setAllowComments(!allowComments)}
                    size="sm"
                  />
                  <span className="text-sm text-text-primary flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-text-muted" />
                    Allow comments
                  </span>
                </label>
              </div>
            </div>

            <div>
              <FormInput
                label="Password Protection (optional)"
                type="password"
                value={newSharePassword}
                onChange={(e) => setNewSharePassword(e.target.value)}
                placeholder="Leave empty for no password"
              />
              <p className="text-xs text-text-muted mt-1">
                Recipients will need this password to view the document
              </p>
            </div>

            <div>
              <FormInput
                label="Expiry Date (optional)"
                type="datetime-local"
                value={newShareExpiry}
                onChange={(e) => setNewShareExpiry(e.target.value)}
              />
              <p className="text-xs text-text-muted mt-1">
                Link will stop working after this date
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setCreateDialogOpen(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateShare}
            isLoading={isCreating}
            disabled={!allowView && !allowDownload}
          >
            Create Link
          </Button>
        </ModalFooter>
      </Modal>

      {/* Revoke dialog */}
      <ConfirmDialog
        isOpen={revokeDialogOpen}
        onClose={() => {
          setRevokeDialogOpen(false);
          setShareToRevoke(null);
        }}
        onConfirm={handleRevokeShare}
        title="Revoke Share Link"
        description="This will immediately disable the share link. Anyone with the link will no longer be able to access the document. This action cannot be undone."
        confirmLabel={isRevoking ? 'Revoking...' : 'Revoke Link'}
        variant="danger"
      />
    </div>
  );
}
