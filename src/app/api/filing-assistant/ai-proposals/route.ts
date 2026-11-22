import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import { createProposal, proposalRequestSchema } from '@/services/filing-assistant/ai-proposals';

/** Snapshots are small; anything larger is not from the extension. */
const MAX_BODY_BYTES = 300_000;

/**
 * POST /api/filing-assistant/ai-proposals
 * Called by the OakCloud Filing Assistant extension through the signed-in OakCloud tab. Returns an
 * AI proposal for mapping or repairing a Bizfile screen; staff approve it in the extension.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'update');
    const tenantId = requireSessionWorkspaceId(session);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw new ApiError(ErrorCodes.PAYLOAD_TOO_LARGE, 'The screen snapshot is too large.', 413);
    }
    const body = proposalRequestSchema.parse(JSON.parse(raw));
    const proposal = await createProposal(body, { tenantId, userId: session.id });
    return NextResponse.json({ proposal }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(new ApiError(ErrorCodes.VALIDATION_ERROR, 'Invalid filing assistant request', 400, { issues: error.issues.slice(0, 10) }));
    }
    return routeErrorResponse(error);
  }
}
