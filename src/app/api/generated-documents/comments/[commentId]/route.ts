import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { z } from 'zod';
import {
  getComment,
  updateComment,
  deleteComment,
  resolveComment,
  reopenComment,
  hideComment,
  unhideComment,
} from '@/services/document-comment.service';

interface RouteParams {
  params: Promise<{ commentId: string }>;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const updateCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

const actionSchema = z.object({
  action: z.enum(['resolve', 'reopen', 'hide', 'unhide']),
  reason: z.string().max(255).optional(),
});

// ============================================================================
// GET /api/generated-documents/comments/[commentId]
// Get a single comment
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { commentId } = await params;

    await requirePermission(session, 'document', 'read');

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const comment = await getComment(session.tenantId, commentId);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json(comment);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Get comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/generated-documents/comments/[commentId]
// Update a comment or perform an action
// ============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { commentId } = await params;

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();

    // Check if this is an action (resolve, reopen, hide, unhide)
    if (body.action) {
      await requirePermission(session, 'document', 'update');

      const { action, reason } = actionSchema.parse(body);

      let result;
      switch (action) {
        case 'resolve':
          result = await resolveComment(session.tenantId, session.id, commentId);
          break;
        case 'reopen':
          result = await reopenComment(session.tenantId, session.id, commentId);
          break;
        case 'hide':
          result = await hideComment(session.tenantId, session.id, commentId, reason);
          break;
        case 'unhide':
          result = await unhideComment(session.tenantId, session.id, commentId);
          break;
      }

      return NextResponse.json(result);
    }

    // Regular content update
    await requirePermission(session, 'document', 'update');

    const { content } = updateCommentSchema.parse(body);

    const updated = await updateComment(session.tenantId, session.id, commentId, { content });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.flatten() },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Comment not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Update comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/generated-documents/comments/[commentId]
// Delete a comment
// ============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { commentId } = await params;

    await requirePermission(session, 'document', 'update');

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    await deleteComment(session.tenantId, session.id, commentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Comment not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Delete comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
