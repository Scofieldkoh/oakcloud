/**
 * GET /api/companies/:id/sentroweb-checks/candidates (company:read)
 *
 * The people and companies the confirm dialog can offer, whether Sentroweb is configured, and
 * whether a run may start now (an active run or the cooldown).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCandidatesInfo } from '@/services/sentroweb/check.service';
import {
  authorizeCompanyRequest,
  isResponse,
  sentrowebRouteError,
} from '@/services/sentroweb/route-support';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authorizeCompanyRequest(request, params, 'read');
    if (isResponse(context)) return context;
    return NextResponse.json(await getCandidatesInfo(context.tenantId, context.companyId));
  } catch (error) {
    return sentrowebRouteError(error);
  }
}
