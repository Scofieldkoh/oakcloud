/**
 * Document Comment Service
 *
 * Manages comments and annotations on generated documents for review workflows.
 * Supports both internal users and external/anonymous commenters via shared links.
 *
 * Features:
 * - Internal comments (authenticated users)
 * - External comments (via share links, no login required)
 * - Text selection highlighting
 * - Comment threading (replies)
 * - Resolve/reopen workflow
 * - Moderation (hide/unhide)
 * - Rate limiting for external comments
 */

import { prisma } from '@/lib/prisma';
import { createAuditContext, logCreate, logUpdate, logDelete } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import { notificationEmail } from '@/lib/email-templates';
import {
  MAX_COMMENT_LENGTH,
  DEFAULT_COMMENT_RATE_LIMIT,
  COMMENT_RATE_LIMIT_WINDOW_MS,
} from '@/lib/constants/application';
import { Prisma } from '@/generated/prisma';
import type { DocumentComment, DocumentCommentStatus } from '@/generated/prisma';

const log = createLogger('document-comment');

// ============================================================================
// Types
// ============================================================================

// Comment with relations
export interface CommentWithRelations extends DocumentComment {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  resolvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  hiddenBy?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  replies?: CommentWithRelations[];
  _count?: {
    replies: number;
  };
}

// Input for creating internal comments (authenticated users)
export interface CreateInternalCommentInput {
  documentId: string;
  content: string;
  selectionStart?: number;
  selectionEnd?: number;
  selectedText?: string;
  parentId?: string;
}

// Input for creating external comments (via share link)
export interface CreateExternalCommentInput {
  shareToken: string;
  guestName: string;
  guestEmail?: string;
  content: string;
  selectionStart?: number;
  selectionEnd?: number;
  selectedText?: string;
  parentId?: string;
  ipAddress?: string;
}

// Input for updating a comment
export interface UpdateCommentInput {
  content: string;
}

// Rate limit check result
export interface RateLimitResult {
  allowed: boolean;
  remainingCount: number;
  resetAt: Date;
}

// ============================================================================
// Include definitions for queries
// ============================================================================

const commentInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  hiddenBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  _count: {
    select: {
      replies: true,
    },
  },
} satisfies Prisma.DocumentCommentInclude;

const commentWithRepliesInclude = {
  ...commentInclude,
  replies: {
    where: { deletedAt: null },
    include: commentInclude,
    orderBy: { createdAt: 'asc' as const },
  },
};

// ============================================================================
// Internal Comment Functions (Authenticated)
// ============================================================================

/**
 * Create an internal comment (authenticated user)
 */
export async function createComment(
  tenantId: string,
  userId: string,
  input: CreateInternalCommentInput
): Promise<CommentWithRelations> {
  // Validate content length
  if (input.content.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }

  // Verify document exists and belongs to tenant
  const document = await prisma.generatedDocument.findFirst({
    where: {
      id: input.documentId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // If parentId provided, verify parent exists
  if (input.parentId) {
    const parent = await prisma.documentComment.findFirst({
      where: {
        id: input.parentId,
        documentId: input.documentId,
        deletedAt: null,
      },
    });

    if (!parent) {
      throw new Error('Parent comment not found');
    }
  }

  const comment = await prisma.documentComment.create({
    data: {
      documentId: input.documentId,
      userId,
      content: input.content,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      selectedText: input.selectedText,
      parentId: input.parentId,
      status: 'OPEN',
    },
    include: commentInclude,
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logCreate(ctx, 'DocumentComment', comment.id, undefined, {
    documentId: input.documentId,
    hasSelection: !!input.selectedText,
    isReply: !!input.parentId,
  });

  return comment as CommentWithRelations;
}

/**
 * Update a comment (only author can update)
 */
export async function updateComment(
  tenantId: string,
  userId: string,
  commentId: string,
  input: UpdateCommentInput
): Promise<CommentWithRelations> {
  // Validate content length
  if (input.content.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }

  // Find comment and verify ownership
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  if (comment.userId !== userId) {
    throw new Error('Only the author can edit this comment');
  }

  if (comment.status === 'RESOLVED') {
    throw new Error('Cannot edit a resolved comment');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      content: input.content,
      updatedAt: new Date(),
    },
    include: commentInclude,
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logUpdate(ctx, 'DocumentComment', commentId, {
    content: { old: comment.content, new: input.content },
  });

  return updated as CommentWithRelations;
}

/**
 * Delete a comment (soft delete)
 */
export async function deleteComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<void> {
  // Find comment
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  // Only author or tenant admin can delete
  // Check if user is the author
  const isAuthor = comment.userId === userId;

  // Check if user is tenant admin - simplified check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
        include: {
          role: { select: { systemRoleType: true } },
        },
      },
    },
  });

  const isTenantAdmin = user?.roleAssignments.some(
    (ra: { role: { systemRoleType: string | null } }) => ra.role.systemRoleType === 'TENANT_ADMIN'
  );

  if (!isAuthor && !isTenantAdmin) {
    throw new Error('Only the author or admin can delete this comment');
  }

  // Soft delete
  await prisma.documentComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logDelete(ctx, 'DocumentComment', commentId, 'Comment', 'User deleted comment');
}

/**
 * Resolve a comment
 */
export async function resolveComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<CommentWithRelations> {
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  if (comment.status === 'RESOLVED') {
    throw new Error('Comment is already resolved');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      status: 'RESOLVED',
      resolvedById: userId,
      resolvedAt: new Date(),
    },
    include: commentInclude,
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logUpdate(ctx, 'DocumentComment', commentId, {
    status: { old: 'OPEN', new: 'RESOLVED' },
  });

  return updated as CommentWithRelations;
}

/**
 * Reopen a resolved comment
 */
export async function reopenComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<CommentWithRelations> {
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  if (comment.status !== 'RESOLVED') {
    throw new Error('Comment is not resolved');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      status: 'OPEN',
      resolvedById: null,
      resolvedAt: null,
    },
    include: commentInclude,
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logUpdate(ctx, 'DocumentComment', commentId, {
    status: { old: 'RESOLVED', new: 'OPEN' },
  });

  return updated as CommentWithRelations;
}

/**
 * Get all comments for a document
 */
export async function getDocumentComments(
  tenantId: string,
  documentId: string,
  options: {
    includeResolved?: boolean;
    includeHidden?: boolean;
    includeReplies?: boolean;
  } = {}
): Promise<CommentWithRelations[]> {
  const { includeResolved = false, includeHidden = false, includeReplies = true } = options;

  // Verify document belongs to tenant
  const document = await prisma.generatedDocument.findFirst({
    where: {
      id: documentId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const where: Prisma.DocumentCommentWhereInput = {
    documentId,
    deletedAt: null,
    parentId: null, // Only top-level comments
  };

  if (!includeResolved) {
    where.status = 'OPEN';
  }

  if (!includeHidden) {
    where.hiddenAt = null;
  }

  const comments = await prisma.documentComment.findMany({
    where,
    include: includeReplies ? commentWithRepliesInclude : commentInclude,
    orderBy: { createdAt: 'desc' },
  });

  return comments as CommentWithRelations[];
}

/**
 * Get a single comment by ID
 */
export async function getComment(
  tenantId: string,
  commentId: string
): Promise<CommentWithRelations | null> {
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      ...commentWithRepliesInclude,
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    return null;
  }

  return comment as CommentWithRelations;
}

// ============================================================================
// External Comment Functions (No Auth Required)
// ============================================================================

/**
 * Check rate limit for external comments
 */
export async function checkCommentRateLimit(
  shareToken: string,
  ipAddress: string
): Promise<RateLimitResult> {
  // Get share link to check rate limit
  const share = await prisma.documentShare.findUnique({
    where: { shareToken },
  });

  if (!share || !share.isActive || !share.allowComments) {
    return { allowed: false, remainingCount: 0, resetAt: new Date() };
  }

  const rateLimit = share.commentRateLimit || DEFAULT_COMMENT_RATE_LIMIT;
  const windowStart = new Date(Date.now() - COMMENT_RATE_LIMIT_WINDOW_MS);

  // Count recent comments from this IP
  const recentCount = await prisma.documentComment.count({
    where: {
      shareId: share.id,
      ipAddress,
      createdAt: { gte: windowStart },
    },
  });

  const resetAt = new Date(Date.now() + COMMENT_RATE_LIMIT_WINDOW_MS);
  const remaining = Math.max(0, rateLimit - recentCount);

  return {
    allowed: recentCount < rateLimit,
    remainingCount: remaining,
    resetAt,
  };
}

/**
 * Send notification email when a new external comment is added
 */
async function sendCommentNotification(
  share: { documentId: string; createdById: string },
  comment: { content: string; selectedText?: string | null },
  guestName: string
): Promise<void> {
  // Get the document and its creator
  const document = await prisma.generatedDocument.findUnique({
    where: { id: share.documentId },
    include: {
      template: { select: { name: true } },
    },
  });

  if (!document) {
    log.warn(`Document ${share.documentId} not found for notification`);
    return;
  }

  // Get the share creator to notify them
  const shareCreator = await prisma.user.findUnique({
    where: { id: share.createdById },
    select: { email: true, firstName: true, lastName: true },
  });

  if (!shareCreator?.email) {
    log.warn(`Share creator ${share.createdById} not found or has no email`);
    return;
  }

  // Prepare email content
  const documentTitle = document.title || document.template?.name || 'Untitled Document';
  const commentPreview = comment.content.length > 200
    ? comment.content.slice(0, 200) + '...'
    : comment.content;

  let messageHtml = `
    <p><strong>${guestName}</strong> left a comment on your shared document:</p>
    <div style="background-color: #f5f5f5; border-left: 4px solid #294d44; padding: 16px; margin: 16px 0; border-radius: 4px;">
      <p style="margin: 0; font-style: italic;">"${commentPreview}"</p>
    </div>
    <p><strong>Document:</strong> ${documentTitle}</p>
  `;

  if (comment.selectedText) {
    messageHtml += `
    <p><strong>Selected text:</strong></p>
    <div style="background-color: #fff3cd; padding: 12px; border-radius: 4px; margin-top: 8px;">
      <p style="margin: 0; font-size: 13px;">"${comment.selectedText}"</p>
    </div>
    `;
  }

  const email = notificationEmail({
    firstName: shareCreator.firstName,
    subject: `New comment on "${documentTitle}" from ${guestName}`,
    title: 'New Comment Received',
    message: messageHtml,
  });

  const result = await sendEmail({
    to: shareCreator.email,
    subject: email.subject,
    html: email.html,
  });

  if (result.success) {
    log.info(`Comment notification sent to ${shareCreator.email} for document ${share.documentId}`);
  } else {
    log.error(`Failed to send comment notification: ${result.error}`);
  }
}

/**
 * Create an external comment via share link
 */
export async function createExternalComment(
  input: CreateExternalCommentInput
): Promise<CommentWithRelations> {
  // Validate content length
  if (input.content.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }

  // Validate guest name
  if (!input.guestName.trim()) {
    throw new Error('Name is required');
  }

  if (input.guestName.length > 100) {
    throw new Error('Name cannot exceed 100 characters');
  }

  // Validate email if provided
  if (input.guestEmail && input.guestEmail.length > 255) {
    throw new Error('Email cannot exceed 255 characters');
  }

  // Find and validate share link
  const share = await prisma.documentShare.findUnique({
    where: { shareToken: input.shareToken },
    include: {
      document: { select: { id: true, tenantId: true, status: true } },
    },
  });

  if (!share) {
    throw new Error('Invalid share link');
  }

  if (!share.isActive) {
    throw new Error('This share link has been revoked');
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    throw new Error('This share link has expired');
  }

  if (!share.allowComments) {
    throw new Error('Comments are not allowed on this document');
  }

  // Check rate limit
  if (input.ipAddress) {
    const rateLimit = await checkCommentRateLimit(input.shareToken, input.ipAddress);
    if (!rateLimit.allowed) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
  }

  // If parentId provided, verify parent exists
  if (input.parentId) {
    const parent = await prisma.documentComment.findFirst({
      where: {
        id: input.parentId,
        documentId: share.documentId,
        deletedAt: null,
      },
    });

    if (!parent) {
      throw new Error('Parent comment not found');
    }
  }

  const comment = await prisma.documentComment.create({
    data: {
      documentId: share.documentId,
      shareId: share.id,
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail?.trim() || null,
      content: input.content,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      selectedText: input.selectedText,
      parentId: input.parentId,
      ipAddress: input.ipAddress,
      status: 'OPEN',
    },
    include: commentInclude,
  });

  // Send notification if notifyOnComment is enabled
  if (share.notifyOnComment) {
    // Run notification asynchronously to not block the response
    sendCommentNotification(share, comment, input.guestName).catch((err) => {
      log.error('Failed to send comment notification:', err);
    });
  }

  return comment as CommentWithRelations;
}

/**
 * Get comments for a shared document
 */
export async function getSharedDocumentComments(
  shareToken: string
): Promise<CommentWithRelations[]> {
  // Find and validate share link
  const share = await prisma.documentShare.findUnique({
    where: { shareToken },
  });

  if (!share || !share.isActive) {
    throw new Error('Invalid or expired share link');
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    throw new Error('This share link has expired');
  }

  if (!share.allowComments) {
    return [];
  }

  const comments = await prisma.documentComment.findMany({
    where: {
      documentId: share.documentId,
      deletedAt: null,
      hiddenAt: null, // External users don't see hidden comments
      parentId: null, // Only top-level comments
    },
    include: {
      ...commentInclude,
      replies: {
        where: { deletedAt: null, hiddenAt: null },
        include: commentInclude,
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return comments as CommentWithRelations[];
}

/**
 * Reply to a comment via share link
 */
export async function replyToComment(
  shareToken: string,
  parentId: string,
  guestName: string,
  content: string,
  guestEmail?: string,
  ipAddress?: string
): Promise<CommentWithRelations> {
  return createExternalComment({
    shareToken,
    guestName,
    guestEmail,
    content,
    parentId,
    ipAddress,
  });
}

// ============================================================================
// Moderation Functions
// ============================================================================

/**
 * Hide a comment (moderation)
 */
export async function hideComment(
  tenantId: string,
  userId: string,
  commentId: string,
  reason?: string
): Promise<CommentWithRelations> {
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  if (comment.hiddenAt) {
    throw new Error('Comment is already hidden');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      hiddenAt: new Date(),
      hiddenById: userId,
      hiddenReason: reason,
    },
    include: commentInclude,
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logUpdate(ctx, 'DocumentComment', commentId, {
    hidden: { old: false, new: true },
    hiddenReason: { old: null, new: reason || null },
  });

  return updated as CommentWithRelations;
}

/**
 * Unhide a previously hidden comment
 */
export async function unhideComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<CommentWithRelations> {
  const comment = await prisma.documentComment.findFirst({
    where: {
      id: commentId,
      deletedAt: null,
    },
    include: {
      document: { select: { tenantId: true } },
    },
  });

  if (!comment || comment.document.tenantId !== tenantId) {
    throw new Error('Comment not found');
  }

  if (!comment.hiddenAt) {
    throw new Error('Comment is not hidden');
  }

  const updated = await prisma.documentComment.update({
    where: { id: commentId },
    data: {
      hiddenAt: null,
      hiddenById: null,
      hiddenReason: null,
    },
    include: commentInclude,
  });

  // Audit log
  const ctx = await createAuditContext({
    tenantId,
    userId,
    changeSource: 'MANUAL',
  });

  await logUpdate(ctx, 'DocumentComment', commentId, {
    hidden: { old: true, new: false },
  });

  return updated as CommentWithRelations;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get comment statistics for a document
 */
export async function getDocumentCommentStats(
  tenantId: string,
  documentId: string
): Promise<{
  total: number;
  open: number;
  resolved: number;
  hidden: number;
}> {
  // Verify document belongs to tenant
  const document = await prisma.generatedDocument.findFirst({
    where: {
      id: documentId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const [total, open, resolved, hidden] = await Promise.all([
    prisma.documentComment.count({
      where: { documentId, deletedAt: null },
    }),
    prisma.documentComment.count({
      where: { documentId, deletedAt: null, status: 'OPEN', hiddenAt: null },
    }),
    prisma.documentComment.count({
      where: { documentId, deletedAt: null, status: 'RESOLVED' },
    }),
    prisma.documentComment.count({
      where: { documentId, deletedAt: null, hiddenAt: { not: null } },
    }),
  ]);

  return { total, open, resolved, hidden };
}
