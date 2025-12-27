'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Plus,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Circle,
  EyeOff,
  X,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommentThread, Comment } from './comment-thread';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type CommentFilter = 'all' | 'open' | 'resolved' | 'hidden';

export interface CommentPanelProps {
  documentId: string;
  currentUserId: string;
  isAdmin?: boolean;
  onCommentCountChange?: (count: number) => void;
  onSelectText?: (start: number, end: number) => void;
  className?: string;
}

interface CommentStats {
  total: number;
  open: number;
  resolved: number;
  hidden: number;
}

interface NewCommentFormProps {
  onSubmit: (content: string, selectionStart?: number, selectionEnd?: number, selectedText?: string) => Promise<void>;
  selectedText?: { start: number; end: number; text: string } | null;
  onClearSelection?: () => void;
  isLoading: boolean;
}

// ============================================================================
// New Comment Form Component
// ============================================================================

function NewCommentForm({ onSubmit, selectedText, onClearSelection, isLoading }: NewCommentFormProps) {
  const [content, setContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (selectedText) {
      setIsExpanded(true);
    }
  }, [selectedText]);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    try {
      await onSubmit(
        content.trim(),
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

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted bg-background-secondary rounded-md hover:bg-background-tertiary transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add a comment...
      </button>
    );
  }

  return (
    <div className="bg-background-secondary rounded-md p-3">
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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your comment..."
        rows={3}
        disabled={isLoading}
        autoFocus
        className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary/50 disabled:opacity-50"
      />

      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="ghost" size="xs" onClick={handleCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="xs"
          onClick={handleSubmit}
          disabled={!content.trim() || isLoading}
        >
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Post Comment'}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Filter Bar Component
// ============================================================================

function FilterBar({
  filter,
  onFilterChange,
  stats,
}: {
  filter: CommentFilter;
  onFilterChange: (filter: CommentFilter) => void;
  stats: CommentStats;
}) {
  const filters: { value: CommentFilter; label: string; icon: React.ReactNode; count: number }[] = [
    { value: 'all', label: 'All', icon: <MessageSquare className="w-3 h-3" />, count: stats.total },
    { value: 'open', label: 'Open', icon: <Circle className="w-3 h-3" />, count: stats.open },
    {
      value: 'resolved',
      label: 'Resolved',
      icon: <CheckCircle2 className="w-3 h-3" />,
      count: stats.resolved,
    },
    { value: 'hidden', label: 'Hidden', icon: <EyeOff className="w-3 h-3" />, count: stats.hidden },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-background-secondary rounded-md">
      {filters.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onFilterChange(f.value)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors',
            filter === f.value
              ? 'bg-background-primary text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          )}
        >
          {f.icon}
          <span>{f.label}</span>
          <span className="text-text-muted">({f.count})</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Comment Panel Component
// ============================================================================

export function CommentPanel({
  documentId,
  currentUserId,
  isAdmin = false,
  onCommentCountChange,
  onSelectText,
  className,
}: CommentPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CommentFilter>('all');
  const [selectedText, setSelectedText] = useState<{ start: number; end: number; text: string } | null>(null);

  // Calculate stats
  const stats: CommentStats = {
    total: comments.length,
    open: comments.filter((c) => c.status === 'OPEN' && !c.hiddenAt).length,
    resolved: comments.filter((c) => c.status === 'RESOLVED' && !c.hiddenAt).length,
    hidden: comments.filter((c) => !!c.hiddenAt).length,
  };

  // Filter comments
  const filteredComments = comments.filter((comment) => {
    switch (filter) {
      case 'open':
        return comment.status === 'OPEN' && !comment.hiddenAt;
      case 'resolved':
        return comment.status === 'RESOLVED' && !comment.hiddenAt;
      case 'hidden':
        return !!comment.hiddenAt;
      default:
        return true;
    }
  });

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/generated-documents/${documentId}/comments`);
      if (!response.ok) {
        throw new Error('Failed to load comments');
      }

      const data = await response.json();
      setComments(data.comments || []);
      onCommentCountChange?.(data.comments?.length || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  }, [documentId, onCommentCountChange]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Create comment
  const handleCreateComment = async (
    content: string,
    selectionStart?: number,
    selectionEnd?: number,
    selectedTextContent?: string
  ) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/generated-documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          selectionStart,
          selectionEnd,
          selectedText: selectedTextContent,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create comment');
      }

      await fetchComments();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reply to comment
  const handleReply = async (parentId: string, content: string) => {
    const response = await fetch(`/api/generated-documents/${documentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parentId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to reply');
    }

    await fetchComments();
  };

  // Edit comment
  const handleEdit = async (commentId: string, content: string) => {
    const response = await fetch(`/api/generated-documents/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update comment');
    }

    await fetchComments();
  };

  // Delete comment
  const handleDelete = async (commentId: string) => {
    const response = await fetch(`/api/generated-documents/comments/${commentId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete comment');
    }

    await fetchComments();
  };

  // Resolve comment
  const handleResolve = async (commentId: string) => {
    const response = await fetch(`/api/generated-documents/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve' }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to resolve comment');
    }

    await fetchComments();
  };

  // Reopen comment
  const handleReopen = async (commentId: string) => {
    const response = await fetch(`/api/generated-documents/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reopen' }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to reopen comment');
    }

    await fetchComments();
  };

  // Hide comment
  const handleHide = async (commentId: string, reason: string) => {
    const response = await fetch(`/api/generated-documents/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'hide', reason }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to hide comment');
    }

    await fetchComments();
  };

  // Unhide comment
  const handleUnhide = async (commentId: string) => {
    const response = await fetch(`/api/generated-documents/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unhide' }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to unhide comment');
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
      (window as unknown as { handleDocumentTextSelection?: typeof handleTextSelection }).handleDocumentTextSelection = handleTextSelection;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { handleDocumentTextSelection?: typeof handleTextSelection }).handleDocumentTextSelection;
      }
    };
  }, [handleTextSelection]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-text-muted" />
          <h3 className="font-medium text-sm text-text-primary">Comments</h3>
          <span className="text-xs text-text-muted">({stats.total})</span>
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

      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-border-primary">
        <FilterBar filter={filter} onFilterChange={setFilter} stats={stats} />
      </div>

      {/* New comment form */}
      <div className="px-4 py-3 border-b border-border-primary">
        <NewCommentForm
          onSubmit={handleCreateComment}
          selectedText={selectedText}
          onClearSelection={() => setSelectedText(null)}
          isLoading={isSubmitting}
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
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">
              {filter === 'all' ? 'No comments yet' : `No ${filter} comments`}
            </p>
            {filter !== 'all' && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="text-xs text-accent-primary hover:underline mt-1"
              >
                Show all comments
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredComments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onReply={handleReply}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onResolve={handleResolve}
                onReopen={handleReopen}
                onHide={handleHide}
                onUnhide={handleUnhide}
                onSelectText={onSelectText}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
