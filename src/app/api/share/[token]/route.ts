import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getShareByToken,
  verifySharePassword,
  recordShareView,
  createDocumentComment,
  checkCommentRateLimit,
} from '@/services/document-generator.service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/share/[token]
 * Get shared document by token (public access)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const share = await getShareByToken(token);

    if (!share) {
      return NextResponse.json(
        { error: 'Share link not found, expired, or revoked' },
        { status: 404 }
      );
    }

    // Check if password is required
    if (share.passwordHash) {
      const { searchParams } = new URL(request.url);
      const password = searchParams.get('password');

      if (!password) {
        return NextResponse.json(
          { error: 'Password required', requiresPassword: true },
          { status: 401 }
        );
      }

      const valid = await verifySharePassword(share.id, password);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid password', requiresPassword: true },
          { status: 401 }
        );
      }
    }

    // Record the view
    await recordShareView(share.id);

    // Return document without sensitive fields
    const response = {
      shareId: share.id,
      allowedActions: share.allowedActions,
      allowComments: share.allowComments,
      document: {
        id: share.document.id,
        title: share.document.title,
        content: share.document.content,
        contentJson: share.document.contentJson,
        status: share.document.status,
        useLetterhead: share.document.useLetterhead,
        createdAt: share.document.createdAt,
        updatedAt: share.document.updatedAt,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Share access error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Validation schema for external comments
const externalCommentSchema = z.object({
  content: z.string().min(1).max(1000),
  guestName: z.string().min(1).max(100).optional(),
  guestEmail: z.string().email().max(255).optional(),
  selectionStart: z.number().int().optional().nullable(),
  selectionEnd: z.number().int().optional().nullable(),
  selectedText: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/share/[token]
 * Add a comment to shared document (external access)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;

    const share = await getShareByToken(token);

    if (!share) {
      return NextResponse.json(
        { error: 'Share link not found, expired, or revoked' },
        { status: 404 }
      );
    }

    // Check if comments are allowed
    if (!share.allowComments) {
      return NextResponse.json(
        { error: 'Comments are not allowed on this share' },
        { status: 403 }
      );
    }

    // Check password if required
    const body = await request.json();
    if (share.passwordHash) {
      const valid = await verifySharePassword(share.id, body.password);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    }

    // Validate comment data
    const commentData = externalCommentSchema.parse(body);

    // Get IP address for rate limiting
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    // Check rate limit
    if (ipAddress) {
      const { allowed, remaining } = await checkCommentRateLimit(ipAddress, share.id);
      if (!allowed) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded. Please try again later.',
            remaining,
            retryAfter: 3600, // 1 hour in seconds
          },
          {
            status: 429,
            headers: {
              'Retry-After': '3600',
              'X-RateLimit-Remaining': String(remaining),
            },
          }
        );
      }
    }

    // Create comment
    const comment = await createDocumentComment(
      {
        documentId: share.document.id,
        shareId: share.id,
        content: commentData.content,
        guestName: commentData.guestName || null,
        guestEmail: commentData.guestEmail || null,
        selectionStart: commentData.selectionStart ?? null,
        selectionEnd: commentData.selectionEnd ?? null,
        selectedText: commentData.selectedText ?? null,
        parentId: commentData.parentId ?? null,
      },
      ipAddress
    );

    return NextResponse.json(
      {
        id: comment.id,
        content: comment.content,
        guestName: comment.guestName,
        selectedText: comment.selectedText,
        createdAt: comment.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid comment data', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('Rate limit')) {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Comment creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
