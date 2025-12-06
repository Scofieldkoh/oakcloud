'use client';

import { useState, useCallback } from 'react';
import {
  MessageSquare,
  Reply,
  MoreVertical,
  Check,
  CheckCheck,
  RotateCcw,
  EyeOff,
  Eye,
  Trash2,
  Edit2,
  Clock,
  User,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export interface CommentUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface Comment {
  id: string;
  content: string;
  userId?: string | null;
  user?: CommentUser | null;
  guestName?: string | null;
  guestEmail?: string | null;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  selectedText?: string | null;
  status: 'OPEN' | 'RESOLVED';
  resolvedById?: string | null;
  resolvedBy?: CommentUser | null;
  resolvedAt?: string | null;
  hiddenAt?: string | null;
  hiddenBy?: CommentUser | null;
  hiddenReason?: string | null;
  parentId?: string | null;
  replies?: Comment[];
  createdAt: string;
  updatedAt: string;
  _count?: { replies: number };
}

export interface CommentThreadProps {
  comment: Comment;
  currentUserId?: string;
  isAdmin?: boolean;
  isExternal?: boolean;
  onReply?: (parentId: string, content: string) => Promise<void>;
  onEdit?: (commentId: string, content: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  onResolve?: (commentId: string) => Promise<void>;
  onReopen?: (commentId: string) => Promise<void>;
  onHide?: (commentId: string, reason: string) => Promise<void>;
  onUnhide?: (commentId: string) => Promise<void>;
  onSelectText?: (start: number, end: number) => void;
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

function CommentAvatar({
  user,
  guestName,
  isExternal,
}: {
  user?: CommentUser | null;
  guestName?: string | null;
  isExternal?: boolean;
}) {
  const name = user ? `${user.firstName} ${user.lastName}` : guestName || 'Guest';
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
        user
          ? 'bg-accent-primary/10 text-accent-primary'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
      )}
      title={name}
    >
      {initials}
    </div>
  );
}

function CommentMenu({
  comment,
  currentUserId,
  isAdmin,
  isLoading,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  onHide,
  onUnhide,
}: {
  comment: Comment;
  currentUserId?: string;
  isAdmin?: boolean;
  isLoading: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onResolve?: () => void;
  onReopen?: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const isOwner = comment.userId === currentUserId;
  const isResolved = comment.status === 'RESOLVED';
  const isHidden = !!comment.hiddenAt;

  const canEdit = isOwner && !isResolved;
  const canDelete = isOwner || isAdmin;
  const canResolve = !isResolved && (isOwner || isAdmin);
  const canReopen = isResolved && (isOwner || isAdmin);
  const canHide = !isHidden && isAdmin;
  const canUnhide = isHidden && isAdmin;

  const hasActions = canEdit || canDelete || canResolve || canReopen || canHide || canUnhide;

  if (!hasActions) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="p-1 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-40 bg-background-elevated border border-border-primary rounded-md shadow-lg z-20 py-1">
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onEdit?.();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}

            {canResolve && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onResolve?.();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2 text-green-600"
              >
                <CheckCheck className="w-4 h-4" />
                Resolve
              </button>
            )}

            {canReopen && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onReopen?.();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2 text-amber-600"
              >
                <RotateCcw className="w-4 h-4" />
                Reopen
              </button>
            )}

            {canHide && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onHide?.();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2 text-amber-600"
              >
                <EyeOff className="w-4 h-4" />
                Hide
              </button>
            )}

            {canUnhide && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onUnhide?.();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Unhide
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onDelete?.();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-background-tertiary flex items-center gap-2 text-red-600"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Reply Input Component
// ============================================================================

function ReplyInput({
  onSubmit,
  onCancel,
  isLoading,
  placeholder = 'Write a reply...',
}: {
  onSubmit: (content: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  placeholder?: string;
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
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
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
// Single Comment Component
// ============================================================================

function SingleComment({
  comment,
  currentUserId,
  isAdmin,
  isExternal,
  isReply = false,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  onHide,
  onUnhide,
  onSelectText,
}: CommentThreadProps & { isReply?: boolean }) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isLoading, setIsLoading] = useState(false);
  const [showHideReason, setShowHideReason] = useState(false);
  const [hideReason, setHideReason] = useState('');

  const authorName = comment.user
    ? `${comment.user.firstName} ${comment.user.lastName}`
    : comment.guestName || 'Guest';

  const isResolved = comment.status === 'RESOLVED';
  const isHidden = !!comment.hiddenAt;

  const handleReplySubmit = async (content: string) => {
    if (!onReply) return;
    setIsLoading(true);
    try {
      await onReply(comment.id, content);
      setShowReplyInput(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!onEdit || editContent.trim() === comment.content) {
      setIsEditing(false);
      return;
    }
    setIsLoading(true);
    try {
      await onEdit(comment.id, editContent.trim());
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: () => Promise<void> | undefined) => {
    if (!action) return;
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
    }
  };

  const handleHideSubmit = async () => {
    if (!onHide) return;
    setIsLoading(true);
    try {
      await onHide(comment.id, hideReason);
      setShowHideReason(false);
      setHideReason('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        'group',
        isReply && 'pl-10 border-l-2 border-border-secondary ml-4',
        isHidden && 'opacity-60'
      )}
    >
      <div className="flex gap-3">
        <CommentAvatar user={comment.user} guestName={comment.guestName} isExternal={!comment.user} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm text-text-primary truncate">
                {authorName}
              </span>
              {!comment.user && (
                <span className="flex items-center gap-1 text-2xs text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                  <ExternalLink className="w-3 h-3" />
                  External
                </span>
              )}
              {isResolved && (
                <span className="flex items-center gap-1 text-2xs text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                  <CheckCheck className="w-3 h-3" />
                  Resolved
                </span>
              )}
              {isHidden && (
                <span className="flex items-center gap-1 text-2xs text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
                  <EyeOff className="w-3 h-3" />
                  Hidden
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span className="text-2xs text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>

              {!isExternal && (
                <CommentMenu
                  comment={comment}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  isLoading={isLoading}
                  onEdit={() => setIsEditing(true)}
                  onDelete={() => handleAction(() => onDelete?.(comment.id))}
                  onResolve={() => handleAction(() => onResolve?.(comment.id))}
                  onReopen={() => handleAction(() => onReopen?.(comment.id))}
                  onHide={() => setShowHideReason(true)}
                  onUnhide={() => handleAction(() => onUnhide?.(comment.id))}
                />
              )}
            </div>
          </div>

          {/* Selected text reference */}
          {comment.selectedText && (
            <button
              type="button"
              onClick={() => {
                if (comment.selectionStart != null && comment.selectionEnd != null) {
                  onSelectText?.(comment.selectionStart, comment.selectionEnd);
                }
              }}
              className="mt-1 px-2 py-1 text-xs bg-accent-primary/10 text-accent-primary rounded border-l-2 border-accent-primary italic truncate max-w-full text-left hover:bg-accent-primary/20 transition-colors"
            >
              "{comment.selectedText.slice(0, 100)}
              {comment.selectedText.length > 100 ? '...' : ''}"
            </button>
          )}

          {/* Content or Edit mode */}
          {isEditing ? (
            <div className="mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                disabled={isLoading}
                className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary/50 disabled:opacity-50"
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(comment.content);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  onClick={handleEditSubmit}
                  disabled={!editContent.trim() || isLoading}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-secondary whitespace-pre-wrap">
              {comment.content}
            </p>
          )}

          {/* Hidden reason */}
          {isHidden && comment.hiddenReason && (
            <p className="mt-1 text-xs text-amber-600 italic">
              Hidden: {comment.hiddenReason}
            </p>
          )}

          {/* Hide reason input */}
          {showHideReason && (
            <div className="mt-2 p-2 bg-background-tertiary rounded-md">
              <input
                type="text"
                value={hideReason}
                onChange={(e) => setHideReason(e.target.value)}
                placeholder="Reason for hiding (optional)"
                className="w-full px-2 py-1 text-sm border border-border-primary rounded bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setShowHideReason(false);
                    setHideReason('');
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button variant="secondary" size="xs" onClick={handleHideSubmit} disabled={isLoading}>
                  Hide Comment
                </Button>
              </div>
            </div>
          )}

          {/* Reply button */}
          {!isReply && onReply && !isEditing && (
            <button
              type="button"
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="mt-2 text-xs text-text-muted hover:text-accent-primary flex items-center gap-1 transition-colors"
            >
              <Reply className="w-3 h-3" />
              Reply
              {comment._count?.replies ? ` (${comment._count.replies})` : ''}
            </button>
          )}

          {/* Reply input */}
          {showReplyInput && (
            <ReplyInput
              onSubmit={handleReplySubmit}
              onCancel={() => setShowReplyInput(false)}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Comment Thread Component
// ============================================================================

export function CommentThread({
  comment,
  currentUserId,
  isAdmin,
  isExternal,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  onHide,
  onUnhide,
  onSelectText,
  className,
}: CommentThreadProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <SingleComment
        comment={comment}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        isExternal={isExternal}
        onReply={onReply}
        onEdit={onEdit}
        onDelete={onDelete}
        onResolve={onResolve}
        onReopen={onReopen}
        onHide={onHide}
        onUnhide={onUnhide}
        onSelectText={onSelectText}
      />

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-3 mt-2">
          {comment.replies.map((reply) => (
            <SingleComment
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isExternal={isExternal}
              isReply
              onEdit={onEdit}
              onDelete={onDelete}
              onHide={onHide}
              onUnhide={onUnhide}
              onSelectText={onSelectText}
            />
          ))}
        </div>
      )}
    </div>
  );
}
