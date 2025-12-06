import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  replyToComment,
  checkCommentRateLimit,
} from '@/services/document-comment.service';

interface RouteParams {
  params: Promise<{ token: string; commentId: string }>;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const replySchema = z.object({
  guestName: z.string().min(1, 'Name is required').max(100),
  guestEmail: z.string().email().max(255).optional().nullable(),
  content: z.string().min(1, 'Reply is required').max(1000),
});

// ============================================================================
// POST /api/share/[token]/comments/[commentId]
// Reply to a comment on a shared document
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token, commentId } = await params;
    const body = await request.json();

    // Validate input
    const parsed = replySchema.safeParse(body);
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

    const reply = await replyToComment(
      token,
      commentId,
      parsed.data.guestName,
      parsed.data.content,
      parsed.data.guestEmail || undefined,
      ipAddress
    );

    // Return remaining rate limit info
    const updatedRateLimit = await checkCommentRateLimit(token, ipAddress);

    return NextResponse.json(
      {
        comment: reply,
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
        error.message === 'This share link has expired' ||
        error.message === 'Parent comment not found'
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === 'Comments are not allowed on this document') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'Rate limit exceeded. Please try again later.') {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Reply to comment error:', error);
    return NextResponse.json({ error: 'Failed to create reply' }, { status: 500 });
  }
}
