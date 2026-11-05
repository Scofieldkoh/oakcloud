import { NextResponse } from 'next/server';
import {
  RATE_LIMIT_CONFIGS,
  checkRateLimit,
  createRateLimitHeaders,
  getClientIp,
  getRateLimitKey,
  type RateLimitConfig,
  type RateLimitResult,
} from '@/lib/rate-limit';
import { getEsigningSessionClaims, isSameOriginRequest } from '@/lib/esigning-session';

function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: result.isLockedOut ? 'Too many attempts' : 'Rate limit exceeded' },
    {
      status: 429,
      headers: createRateLimitHeaders(result),
    }
  );
}

export function enforceEsigningRateLimit(
  request: Request,
  operation: string,
  identifier: string,
  config: RateLimitConfig
): { ip: string } | { response: NextResponse } {
  const ip = getClientIp(request);
  const result = checkRateLimit(getRateLimitKey(operation, `${ip}:${identifier}`), config);

  if (!result.allowed) {
    return { response: rateLimitResponse(result) };
  }

  return { ip };
}

/**
 * Rate limit for the routes a signer calls once they hold a signing session. The limit is kept per
 * recipient (from the verified session cookie), so signers behind one office address do not share an
 * allowance and a changed `X-Forwarded-For` does not reset it. Without a valid session it falls back to
 * the address plus `identifier`, like `enforceEsigningRateLimit`.
 */
export async function enforceEsigningSessionRateLimit(
  request: Request,
  operation: string,
  identifier: string,
  config: RateLimitConfig
): Promise<{ ip: string } | { response: NextResponse }> {
  const ip = getClientIp(request);
  let recipientId: string | null = null;
  try {
    recipientId = (await getEsigningSessionClaims())?.recipientId ?? null;
  } catch {
    // No readable session (no cookie store, or a token that does not verify): treat as signed out.
  }

  const subject = recipientId ? `recipient:${recipientId}:${identifier}` : `${ip}:${identifier}`;
  const result = checkRateLimit(getRateLimitKey(operation, subject), config);

  if (!result.allowed) {
    return { response: rateLimitResponse(result) };
  }

  return { ip };
}

/**
 * One allowance per address across every public certificate lookup (verify data, bootstrap data and
 * the file check), so trying many certificate IDs does not get a fresh per-ID allowance each time.
 */
export function enforceEsigningLookupAggregateLimit(request: Request): { ip: string } | { response: NextResponse } {
  const ip = getClientIp(request);
  const result = checkRateLimit(
    getRateLimitKey('esigning_lookup_aggregate', ip),
    RATE_LIMIT_CONFIGS.ESIGNING_PUBLIC_LOOKUP_AGGREGATE
  );

  if (!result.allowed) {
    return { response: rateLimitResponse(result) };
  }

  return { ip };
}

export function requireEsigningSameOrigin(request: Request): NextResponse | null {
  if (isSameOriginRequest(request)) {
    return null;
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
