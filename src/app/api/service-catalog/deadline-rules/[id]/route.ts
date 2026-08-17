import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { requireServiceAdministrator } from '@/lib/service-administration-auth';
import { deadlineRuleDraftSchema } from '@/lib/validations/deadline-rule';
import {
  getDeadlineRule,
  updateDeadlineRuleDraft,
} from '@/services/deadline-rule';
import { serviceCatalogErrorResponse } from '../../route-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tenantId = resolveWorkspaceId(session, searchParams.get('tenantId'));
    const rule = await getDeadlineRule(id, { tenantId, userId: session.id });
    return NextResponse.json(rule);
  } catch (error) {
    return serviceCatalogErrorResponse(error, 'GET /api/service-catalog/deadline-rules/[id]');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const tenantId = resolveWorkspaceId(
      session,
      typeof body.tenantId === 'string' ? body.tenantId : null,
    );
    const { tenantId: _tenantId, ...payload } = body;
    const input = deadlineRuleDraftSchema.parse(payload);
    const rule = await updateDeadlineRuleDraft(id, input, { tenantId, userId: session.id });
    return NextResponse.json(rule);
  } catch (error) {
    return serviceCatalogErrorResponse(error, 'PATCH /api/service-catalog/deadline-rules/[id]');
  }
}
