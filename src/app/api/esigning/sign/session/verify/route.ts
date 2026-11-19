import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createErrorResponse } from '@/lib/api-helpers';
import { getEsigningChallengeClaims } from '@/lib/esigning-session';
import {
  RATE_LIMIT_CONFIGS,
  checkRateLimit,
  createRateLimitHeaders,
  getRateLimitKey,
  recordFailure,
  recordSuccess,
} from '@/lib/rate-limit';
import { enforceEsigningRateLimit, requireEsigningSameOrigin } from '@/lib/esigning-public-route';
import { verifyEsigningAccessCodeSchema } from '@/lib/validations/esigning';
import { ESIGNING_PAYLOAD_LIMITS } from '@/lib/esigning-payload-limits';
import { readLimitedJson } from '@/lib/esigning-request-body';
import { verifyEsigningAccessCode } from '@/services/esigning-signing.service';

export async function POST(request: NextRequest) {
  const sameOriginError = requireEsigningSameOrigin(request);
  if (sameOriginError) {
    return sameOriginError;
  }

  const claims = await getEsigningChallengeClaims();
  const identifier = claims?.recipientId ?? 'unknown';
  const rateLimit = enforceEsigningRateLimit(
    request,
    'esigning_sign_verify',
    identifier,
    RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY
  );
  if ('response' in rateLimit) {
    return rateLimit.response;
  }

  const rateLimitKey = getRateLimitKey('esigning_sign_verify', `${rateLimit.ip}:${identifier}`);

  // A second limit per recipient from any address: guessing a code from many addresses, or with a
  // changed X-Forwarded-For, shares one allowance and one lockout.
  const recipientRateLimitKey = claims?.recipientId
    ? getRateLimitKey('esigning_sign_verify_recipient', claims.recipientId)
    : null;
  if (recipientRateLimitKey) {
    const recipientLimit = checkRateLimit(recipientRateLimitKey, RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY_RECIPIENT);
    if (!recipientLimit.allowed) {
      return NextResponse.json(
        { error: recipientLimit.isLockedOut ? 'Too many attempts' : 'Rate limit exceeded' },
        { status: 429, headers: createRateLimitHeaders(recipientLimit) }
      );
    }
  }

  try {
    const body = verifyEsigningAccessCodeSchema.parse(
      await readLimitedJson(request, ESIGNING_PAYLOAD_LIMITS.SMALL_BODY_BYTES)
    );
    await verifyEsigningAccessCode(body.accessCode);
    recordSuccess(rateLimitKey);
    if (recipientRateLimitKey) recordSuccess(recipientRateLimitKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    recordFailure(rateLimitKey, RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY);
    if (recipientRateLimitKey) recordFailure(recipientRateLimitKey, RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY_RECIPIENT);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 });
    }

    return createErrorResponse(error);
  }
}
