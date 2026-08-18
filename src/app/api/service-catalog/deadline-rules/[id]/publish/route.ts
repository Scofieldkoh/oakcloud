import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { requireServiceAdministrator } from '@/lib/service-administration-auth';
import { idParamSchema, uuidSchema } from '@/lib/validations/params';
import {
  deadlineRulePublishSchema,
  publishDeadlineRule,
} from '@/services/deadline-rule';
import {
  parseRequestTenantId,
  readJsonRecord,
  selectRequestTenantId,
  serviceCatalogErrorResponse,
} from '../../../route-utils';

type RouteParams = { params: Promise<{ id: string }> };

function parseTenantQuery(request: NextRequest): string | undefined {
  const { searchParams } = new URL(request.url);
  return z.object({ tenantId: uuidSchema.optional() }).strict().parse({
    tenantId: searchParams.get('tenantId') ?? undefined,
  }).tenantId;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const { id } = idParamSchema.parse(await params);
    const queryTenantId = parseTenantQuery(request);
    const body = await readJsonRecord(request);
    const bodyTenantId = parseRequestTenantId(body);
    const tenantId = resolveWorkspaceId(session, selectRequestTenantId(queryTenantId, bodyTenantId) ?? null);
    const { tenantId: _tenantId, ...payload } = body;
    const input = deadlineRulePublishSchema.parse(payload);
    const rule = await publishDeadlineRule(id, input, { tenantId, userId: session.id });
    return NextResponse.json(rule);
  } catch (error) {
    return serviceCatalogErrorResponse(error, 'POST /api/service-catalog/deadline-rules/[id]/publish');
  }
}
