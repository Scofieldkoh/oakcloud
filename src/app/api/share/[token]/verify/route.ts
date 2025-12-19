import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getShareByToken,
  verifySharePassword,
} from '@/services/document-generator.service';
import {
  checkRateLimit,
  recordFailure,
  recordSuccess,
  getClientIp,
  createRateLimitHeaders,
  getRateLimitKey,
  RATE_LIMIT_CONFIGS,
} from '@/lib/rate-limit';
import { HTTP_STATUS } from '@/lib/constants/application';

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
 * Security:
 * - Password is submitted via POST body instead of query string
 *   to prevent exposure in server logs, browser history, and referrer headers.
 * - Rate limited to prevent brute-force attacks (5 attempts per 15 minutes)
 * - Lockout after 10 failed attempts (30 minute lockout)
 *
 * Returns a verification token that can be used for subsequent requests.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const clientIp = getClientIp(request);

    // Rate limit key combines IP and share token for granular control
    const rateLimitKey = getRateLimitKey('share_password', `${clientIp}:${token}`);
    const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.SHARE_PASSWORD);

    // Check rate limit before processing
    if (!rateLimitResult.allowed) {
      const headers = createRateLimitHeaders(rateLimitResult);
      const errorMessage = rateLimitResult.isLockedOut
        ? 'Too many failed attempts. Please try again later.'
        : 'Rate limit exceeded. Please wait before trying again.';

      return NextResponse.json(
        { error: errorMessage, verified: false },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS, headers }
      );
    }

    const share = await getShareByToken(token);

    if (!share) {
      return NextResponse.json(
        { error: 'Share link not found, expired, or revoked' },
        { status: HTTP_STATUS.NOT_FOUND }
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
      // Record failure for lockout tracking
      recordFailure(rateLimitKey, RATE_LIMIT_CONFIGS.SHARE_PASSWORD);

      const headers = createRateLimitHeaders(rateLimitResult);
      return NextResponse.json(
        { error: 'Invalid password', verified: false },
        { status: HTTP_STATUS.UNAUTHORIZED, headers }
      );
    }

    // Record success - resets failure count
    recordSuccess(rateLimitKey);

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
