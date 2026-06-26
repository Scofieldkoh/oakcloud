import { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api-helpers';
import { RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import { enforceEsigningRateLimit } from '@/lib/esigning-public-route';
import { jsonWithServerTiming } from '@/lib/api/company-query';
import { loadEsigningSigningSession } from '@/services/esigning-signing.service';

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const rateLimit = enforceEsigningRateLimit(
    request,
    'esigning_sign_load',
    'session-bootstrap',
    RATE_LIMIT_CONFIGS.ESIGNING_SIGN_LOAD
  );
  if ('response' in rateLimit) {
    return rateLimit.response;
  }

  try {
    const result = await loadEsigningSigningSession();
    return jsonWithServerTiming({ session: result }, startedAt);
  } catch (error) {
    return createErrorResponse(error);
  }
}
