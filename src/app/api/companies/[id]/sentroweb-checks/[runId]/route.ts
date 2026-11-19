/**
 * GET /api/companies/:id/sentroweb-checks/:runId (company:read)
 *
 * One run with its per-entity results. The UI polls this while the run is QUEUED or RUNNING.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRun } from '@/services/sentroweb/check.service';
import {
  authorizeCompanyRequest,
  isResponse,
  sentrowebRouteError,
} from '@/services/sentroweb/route-support';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const context = await authorizeCompanyRequest(request, params, 'read');
    if (isResponse(context)) return context;
    const { runId } = await params;
    return NextResponse.json({ run: await getRun(context.tenantId, context.companyId, runId) });
  } catch (error) {
    return sentrowebRouteError(error);
  }
}
