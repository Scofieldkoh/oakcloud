import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireSessionWorkspaceId } from '@/lib/api-helpers';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { getBestAvailableModelForWorkspace } from '@/lib/ai';
import { requirePermission } from '@/lib/rbac';

/**
 * GET /api/filing-assistant/status
 * Lets the Filing Assistant extension check that OakCloud is reachable through the signed-in tab,
 * who is signed in, and whether AI is configured for the workspace.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    const model = await getBestAvailableModelForWorkspace(tenantId);
    return NextResponse.json(
      { ok: true, user: [session.firstName, session.lastName].filter(Boolean).join(' ') || session.email, aiAvailable: Boolean(model) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
