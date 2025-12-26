'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Plus,
  Loader2,
  RefreshCw,
  X,
  AlertCircle,
  User,
  Mail,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommentThread, Comment } from './comment-thread';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ExternalCommentPanelProps {
  shareToken: string;
  allowComments?: boolean;
  onSelectText?: (start: number, end: number) => void;
  className?: string;
}

interface GuestInfo {
  name: string;
  email: string;
}

interface RateLimitInfo {
  remainingCount: number;
  resetAt: string;
}

interface ExternalCommentFormProps {
  onSubmit: (content: string, guestName: string, guestEmail?: string, selectionStart?: number, selectionEnd?: number, selectedText?: string) => Promise<void>;
  selectedText?: { start: number; end: number; text: string } | null;
  onClearSelection?: () => void;
  isLoading: boolean;
  guestInfo: GuestInfo;
  onGuestInfoChange: (info: GuestInfo) => void;
  rateLimit?: RateLimitInfo | null;
}

// ============================================================================
// External Comment Form Component
// ============================================================================

function ExternalCommentForm({
  onSubmit,
  selectedText,
  onClearSelection,
  isLoading,
  guestInfo,
  onGuestInfoChange,
  rateLimit,
}: ExternalCommentFormProps) {
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showGuestFields, setShowGuestFields] = useState(!guestInfo.name);

  useEffect(() => {
    if (selectedText) {
      setIsExpanded(true);
    }
  }, [selectedText]);

  const handleSubmit = async () => {
    if (!content.trim() || !guestInfo.name.trim()) return;

    try {
      await onSubmit(
        content.trim(),
        guestInfo.name.trim(),
        guestInfo.email.trim() || undefined,
        selectedText?.start,
        selectedText?.end,
        selectedText?.text
      );
      setContent('');
      setIsExpanded(false);
      onClearSelection?.();
    } catch {
      // Error handled by parent
    }
  };

  const handleCancel = () => {
    setContent('');
    setIsExpanded(false);
    onClearSelection?.();
  };

  const isRateLimited = !!(rateLimit && rateLimit.remainingCount <= 0);
  const resetTime = rateLimit?.resetAt ? new Date(rateLimit.resetAt) : null;

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        disabled={isRateLimited}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
          isRateLimited
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 cursor-not-allowed'
            : 'text-text-muted bg-background-secondary hover:bg-background-tertiary'
        )}
      >
        {isRateLimited ? (
          <>
            <Clock className="w-4 h-4" />
            Rate limited. Try again {resetTime ? `at ${resetTime.toLocaleTimeString()}` : 'later'}.
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Leave a comment...
          </>
        )}
      </button>
    );
  }

  return (
    <div className="bg-background-secondary rounded-md p-3">
      {/* Guest info fields */}
      {showGuestFields && (
        <div className="space-y-2 mb-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={guestInfo.name}
              onChange={(e) => onGuestInfoChange({ ...guestInfo, name: e.target.value })}
              placeholder="Your name *"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="email"
              value={guestInfo.email}
              onChange={(e) => onGuestInfoChange({ ...guestInfo, email: e.target.value })}
              placeholder="Your email (optional)"
              className="w-full pl-9 pr-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
            />
          </div>
        </div>
      )}

      {/* Show name badge if fields are hidden */}
      {!showGuestFields && guestInfo.name && (
        <button
          type="button"
          onClick={() => setShowGuestFields(true)}
          className="mb-2 flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
        >
          <User className="w-3 h-3" />
          Commenting as <span className="font-medium text-text-primary">{guestInfo.name}</span>
          <span className="text-accent-primary">(change)</span>
        </button>
      )}

      {/* Selected text reference */}
      {selectedText && (
        <div className="mb-2 flex items-start gap-2">
          <div className="flex-1 px-2 py-1 text-xs bg-accent-primary/10 text-accent-primary rounded border-l-2 border-accent-primary italic">
            &quot;{selectedText.text.slice(0, 100)}
            {selectedText.text.length > 100 ? '...' : ''}&quot;
          </div>
          <button
            type="button"
            onClick={onClearSelection}
            className="p-1 text-text-muted hover:text-text-primary"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Comment textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your comment..."
        rows={3}
        disabled={isLoading}
        autoFocus={!showGuestFields}
        className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary/50 disabled:opacity-50"
      />

      {/* Rate limit info */}
      {rateLimit && rateLimit.remainingCount <= 5 && (
        <p className="mt-1 text-xs text-amber-600">
          {rateLimit.remainingCount} comment{rateLimit.remainingCount !== 1 ? 's' : ''} remaining
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="ghost" size="xs" onClick={handleCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="xs"
          onClick={handleSubmit}
          disabled={!content.trim() || !guestInfo.name.trim() || isLoading || isRateLimited}
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Post Comment'}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// External Reply Form Component
// ============================================================================

function ExternalReplyForm({
  onSubmit,
  onCancel,
  isLoading,
  guestInfo,
}: {
  onSubmit: (content: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  guestInfo: GuestInfo;
}) {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content.trim());
      setContent('');
    }
  };

  return (
    <div className="mt-3 pl-10">
      <div className="text-xs text-text-muted mb-1 flex items-center gap-1">
        <User className="w-3 h-3" />
        Replying as {guestInfo.name}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a reply..."
        rows={2}
        disabled={isLoading}
        className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary/50 disabled:opacity-50"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="ghost" size="xs" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="xs"
          onClick={handleSubmit}
          disabled={!content.trim() || isLoading}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main External Comment Panel Component
// ============================================================================

export function ExternalCommentPanel({
  shareToken,
  allowComments = true,
  onSelectText,
  className,
}: ExternalCommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState<{ start: number; end: number; text: string } | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);

  // Guest info stored in localStorage for convenience
  const [guestInfo, setGuestInfo] = useState<GuestInfo>({ name: '', email: '' });

  // Load guest info from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('comment-guest-info');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setGuestInfo({ name: parsed.name || '', email: parsed.email || '' });
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, []);

  // Save guest info to localStorage
  const handleGuestInfoChange = (info: GuestInfo) => {
    setGuestInfo(info);
    if (typeof window !== 'undefined') {
      localStorage.setItem('comment-guest-info', JSON.stringify(info));
    }
  };

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/share/${shareToken}/comments`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load comments');
      }

      const data = await response.json();
      // Filter out hidden comments for external users
      const visibleComments = (data.comments || []).filter((c: Comment) => !c.hiddenAt);
      setComments(visibleComments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Create comment
  const handleCreateComment = async (
    content: string,
    guestName: string,
    guestEmail?: string,
    selectionStart?: number,
    selectionEnd?: number,
    selectedTextContent?: string
  ) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/share/${shareToken}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName,
          guestEmail,
          content,
          selectionStart,
          selectionEnd,
          selectedText: selectedTextContent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create comment');
      }

      // Update rate limit info
      if (data.rateLimit) {
        setRateLimit(data.rateLimit);
      }

      await fetchComments();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reply to comment
  const handleReply = async (parentId: string, content: string) => {
    const response = await fetch(`/api/share/${shareToken}/comments/${parentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: guestInfo.name,
        guestEmail: guestInfo.email || undefined,
        content,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reply');
    }

    // Update rate limit info
    if (data.rateLimit) {
      setRateLimit(data.rateLimit);
    }

    await fetchComments();
  };

  // Handle text selection from document
  const handleTextSelection = useCallback((start: number, end: number, text: string) => {
    setSelectedText({ start, end, text });
  }, []);

  // Expose selection handler
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { handleExternalDocumentTextSelection?: typeof handleTextSelection }).handleExternalDocumentTextSelection = handleTextSelection;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { handleExternalDocumentTextSelection?: typeof handleTextSelection }).handleExternalDocumentTextSelection;
      }
    };
  }, [handleTextSelection]);

  // Comments not allowed
  if (!allowComments) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-text-muted" />
            <h3 className="font-medium text-sm text-text-primary">Comments</h3>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-text-muted">Comments are disabled for this document.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-text-muted" />
          <h3 className="font-medium text-sm text-text-primary">Comments</h3>
          <span className="text-xs text-text-muted">({comments.length})</span>
        </div>
        <button
          type="button"
          onClick={fetchComments}
          disabled={isLoading}
          className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* New comment form */}
      <div className="px-4 py-3 border-b border-border-primary">
        <ExternalCommentForm
          onSubmit={handleCreateComment}
          selectedText={selectedText}
          onClearSelection={() => setSelectedText(null)}
          isLoading={isSubmitting}
          guestInfo={guestInfo}
          onGuestInfoChange={handleGuestInfoChange}
          rateLimit={rateLimit}
        />
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-red-500">
            <AlertCircle className="w-5 h-5 mb-2" />
            <p className="text-sm">{error}</p>
            <Button variant="ghost" size="xs" onClick={fetchComments} className="mt-2">
              Retry
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs mt-1">Be the first to leave a comment!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                isExternal
                onReply={guestInfo.name ? handleReply : undefined}
                onSelectText={onSelectText}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
