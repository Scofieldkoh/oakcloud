'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  FileText,
  Lock,
  Eye,
  Download,
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  Calendar,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Alert } from '@/components/ui/alert';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';

// ============================================================================
// Types
// ============================================================================

interface SharedDocument {
  shareId: string;
  allowedActions: string[];
  allowComments: boolean;
  document: {
    id: string;
    title: string;
    content: string;
    contentJson: unknown;
    status: string;
    useLetterhead: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

interface Comment {
  id: string;
  content: string;
  guestName?: string;
  selectedText?: string;
  createdAt: string;
}

// ============================================================================
// Main Component
// ============================================================================

export default function SharedDocumentPage() {
  const params = useParams();
  const token = params.token as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<SharedDocument | null>(null);

  // Comment state
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // PDF Download state
  const [isDownloading, setIsDownloading] = useState(false);

  // Verification token for password-protected shares (stored in memory, not localStorage for security)
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  // Verify password and get verification token
  const verifyPassword = async (pass: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/share/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid password');
      }

      return result.verificationToken || null;
    } catch (err) {
      throw err;
    }
  };

  // Fetch document
  const fetchDocument = async (pass?: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // If password provided, verify it first and get verification token
      let currentVerificationToken = verificationToken;
      if (pass) {
        currentVerificationToken = await verifyPassword(pass);
        if (currentVerificationToken) {
          setVerificationToken(currentVerificationToken);
        }
      }

      // Build headers with verification token if available
      const headers: HeadersInit = {};
      if (currentVerificationToken) {
        headers['X-Verification-Token'] = currentVerificationToken;
      }

      const response = await fetch(`/api/share/${token}`, { headers });
      const result = await response.json();

      if (response.status === 401 && result.requiresPassword) {
        setRequiresPassword(true);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load document');
      }

      setData(result);
      setRequiresPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDocument();
    }
  }, [token]);

  // Handle password submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await fetchDocument(password);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !data) return;

    setIsSubmittingComment(true);
    setCommentError(null);

    try {
      // Build headers with verification token if available (for password-protected shares)
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (verificationToken) {
        headers['X-Verification-Token'] = verificationToken;
      }

      const response = await fetch(`/api/share/${token}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: newComment,
          guestName: guestName.trim() || undefined,
          guestEmail: guestEmail.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add comment');
      }

      setComments((prev) => [result, ...prev]);
      setNewComment('');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handle PDF download
  const handleDownloadPDF = async () => {
    if (!data) return;

    setIsDownloading(true);
    try {
      // Build headers with verification token if available (for password-protected shares)
      const headers: HeadersInit = {};
      if (verificationToken) {
        headers['X-Verification-Token'] = verificationToken;
      }

      const response = await fetch(`/api/share/${token}/pdf`, { headers });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.document.title || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
          <p className="text-text-muted text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  // Error state (document not found or expired)
  if (error && !requiresPassword) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-status-error/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-status-error" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary mb-2">
            Document Not Available
          </h1>
          <p className="text-text-muted text-sm mb-6">
            {error === 'Share link not found, expired, or revoked'
              ? 'This share link may have expired or been revoked.'
              : error}
          </p>
          <p className="text-2xs text-text-tertiary">
            If you believe this is an error, please contact the document owner.
          </p>
        </div>
      </div>
    );
  }

  // Password required state
  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-background-elevated border border-border-primary rounded-lg p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent-primary/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-accent-primary" />
              </div>
              <h1 className="text-lg font-semibold text-text-primary mb-1">
                Password Protected
              </h1>
              <p className="text-text-muted text-sm">
                Enter the password to view this document.
              </p>
            </div>

            {error && (
              <Alert variant="error" className="mb-4">
                {error}
              </Alert>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <FormInput
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                required
              />
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                isLoading={isSubmitting}
              >
                View Document
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Document view
  if (!data) return null;

  const canDownload = data.allowedActions.includes('download');
  const canPrint = data.allowedActions.includes('print');

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background-elevated border-b border-border-primary">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h1 className="text-sm font-medium text-text-primary line-clamp-1">
                {data.document.title}
              </h1>
              <div className="flex items-center gap-2 text-2xs text-text-muted">
                <Calendar className="w-3 h-3" />
                <span>
                  {new Date(data.document.updatedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {data.document.status !== 'FINALIZED' && (
                  <span className="px-1.5 py-0.5 rounded bg-status-warning/10 text-status-warning text-2xs font-medium">
                    Draft
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data.allowComments && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowComments(!showComments)}
                className="relative"
              >
                <MessageSquare className="w-4 h-4" />
                {comments.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent-primary text-white text-2xs flex items-center justify-center">
                    {comments.length}
                  </span>
                )}
              </Button>
            )}
            {canDownload && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadPDF}
                isLoading={isDownloading}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline ml-1.5">Download PDF</span>
              </Button>
            )}
            {canPrint && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.print()}
              >
                Print
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* Document Content */}
          <div className={`flex-1 ${showComments ? 'max-w-[calc(100%-320px)]' : ''}`}>
            <div className="bg-white border border-border-primary rounded-lg shadow-sm overflow-hidden">
              {/* Draft watermark */}
              {data.document.status !== 'FINALIZED' && (
                <div className="bg-status-warning/5 border-b border-status-warning/20 px-4 py-2">
                  <p className="text-status-warning text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    This document is a draft and has not been finalized.
                  </p>
                </div>
              )}

              {/* Document body */}
              <div className="p-8 print:p-0">
                <RichTextDisplay
                  content={data.document.content}
                  className="prose prose-sm max-w-none"
                />
              </div>
            </div>
          </div>

          {/* Comments Panel */}
          {showComments && data.allowComments && (
            <div className="w-80 shrink-0">
              <div className="sticky top-20 bg-background-elevated border border-border-primary rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-border-primary bg-background-secondary">
                  <h2 className="text-sm font-medium text-text-primary flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Comments
                  </h2>
                </div>

                {/* Comment Form */}
                <form onSubmit={handleCommentSubmit} className="p-4 border-b border-border-primary">
                  {commentError && (
                    <Alert variant="error" className="mb-3 text-xs">
                      {commentError}
                    </Alert>
                  )}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <FormInput
                        label=""
                        placeholder="Your name (optional)"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="text-xs"
                      />
                      <FormInput
                        label=""
                        type="email"
                        placeholder="Email (optional)"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="text-xs"
                      />
                    </div>
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary resize-none"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="w-full"
                      disabled={!newComment.trim()}
                      isLoading={isSubmittingComment}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      Post Comment
                    </Button>
                  </div>
                </form>

                {/* Comments List */}
                <div className="max-h-96 overflow-y-auto">
                  {comments.length === 0 ? (
                    <div className="p-6 text-center">
                      <MessageSquare className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
                      <p className="text-xs text-text-muted">No comments yet</p>
                      <p className="text-2xs text-text-tertiary mt-1">
                        Be the first to leave feedback
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border-primary">
                      {comments.map((comment) => (
                        <div key={comment.id} className="p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-accent-primary/10 flex items-center justify-center">
                              <User className="w-3.5 h-3.5 text-accent-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-primary truncate">
                                {comment.guestName || 'Anonymous'}
                              </p>
                              <p className="text-2xs text-text-muted">
                                {new Date(comment.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                          {comment.selectedText && (
                            <div className="mb-2 px-2 py-1 bg-status-warning/10 border-l-2 border-status-warning rounded-r text-2xs text-text-secondary italic">
                              &quot;{comment.selectedText}&quot;
                            </div>
                          )}
                          <p className="text-sm text-text-primary">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-border-primary py-4 print:hidden">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between text-2xs text-text-tertiary">
          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            <span>View only</span>
          </div>
          <p>Shared document • Do not distribute</p>
        </div>
      </footer>
    </div>
  );
}
