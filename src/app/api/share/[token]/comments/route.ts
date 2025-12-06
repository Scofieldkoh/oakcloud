import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSharedDocumentComments,
  createExternalComment,
  checkCommentRateLimit,
} from '@/services/document-comment.service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createExternalCommentSchema = z.object({
  guestName: z.string().min(1, 'Name is required').max(100),
  guestEmail: z.string().email().max(255).optional().nullable(),
  content: z.string().min(1, 'Comment is required').max(1000),
  selectionStart: z.number().int().nonnegative().optional(),
  selectionEnd: z.number().int().nonnegative().optional(),
  selectedText: z.string().optional(),
  parentId: z.string().uuid().optional(),
});

// ============================================================================
// GET /api/share/[token]/comments
// Get comments for a shared document
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const comments = await getSharedDocumentComments(token);

    return NextResponse.json({ comments });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Invalid or expired share link' ||
        error.message === 'This share link has expired'
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Get shared comments error:', error);
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

// ============================================================================
// POST /api/share/[token]/comments
// Create a comment on a shared document (external user)
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const body = await request.json();

    // Validate input
    const parsed = createExternalCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Get client IP for rate limiting
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      'unknown';

    // Check rate limit before creating
    const rateLimit = await checkCommentRateLimit(token, ipAddress);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          remainingCount: rateLimit.remainingCount,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 }
      );
    }

    const comment = await createExternalComment({
      shareToken: token,
      guestName: parsed.data.guestName,
      guestEmail: parsed.data.guestEmail || undefined,
      content: parsed.data.content,
      selectionStart: parsed.data.selectionStart,
      selectionEnd: parsed.data.selectionEnd,
      selectedText: parsed.data.selectedText,
      parentId: parsed.data.parentId,
      ipAddress,
    });

    // Return remaining rate limit info
    const updatedRateLimit = await checkCommentRateLimit(token, ipAddress);

    return NextResponse.json(
      {
        comment,
        rateLimit: {
          remainingCount: updatedRateLimit.remainingCount,
          resetAt: updatedRateLimit.resetAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'Invalid share link' ||
        error.message === 'This share link has been revoked' ||
        error.message === 'This share link has expired'
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === 'Comments are not allowed on this document') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'Rate limit exceeded. Please try again later.') {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
      if (error.message === 'Parent comment not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Create external comment error:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
