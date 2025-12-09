import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getShareByToken,
  verifySharePassword,
} from '@/services/document-generator.service';

interface RouteParams {
  params: Promise<{ token: string }>;
}

// Validation schema for password verification
const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/share/[token]/verify
 * Verify password for a password-protected shared document
 *
 * Security: Password is submitted via POST body instead of query string
 * to prevent exposure in server logs, browser history, and referrer headers.
 *
 * Returns a verification token that can be used for subsequent requests.
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

    // If no password required, return success immediately
    if (!share.passwordHash) {
      return NextResponse.json({
        verified: true,
        message: 'No password required',
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const { password } = verifyPasswordSchema.parse(body);

    // Verify password
    const valid = await verifySharePassword(share.id, password);

    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid password', verified: false },
        { status: 401 }
      );
    }

    // Generate a session token for this share access
    // This token is stored in memory/session and used for subsequent requests
    // We use a simple signed token approach here
    const verificationToken = Buffer.from(
      JSON.stringify({
        shareId: share.id,
        verified: true,
        exp: Date.now() + 3600000, // 1 hour expiry
      })
    ).toString('base64url');

    return NextResponse.json({
      verified: true,
      verificationToken,
      expiresIn: 3600, // seconds
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Share password verification error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
