import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { resolveWorkspaceId } from '@/lib/api-helpers';
import { requireServiceAdministrator } from '@/lib/service-administration-auth';
import { applyDeadlineRulePreset } from '@/services/deadline-rule';
import {
  parseRequestTenantId,
  parseStrictTenantQuery,
  readJsonRecord,
  selectRequestTenantId,
  serviceCatalogErrorResponse,
} from '../../route-utils';

const applyPresetSchema = z.object({
  code: z.enum(['SG_ECI', 'SG_FORM_C']),
}).strict();

/** Create or re-stage the workspace's rule for a reviewed IRAS preset as a draft. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    requireServiceAdministrator(session);
    const queryTenantId = parseStrictTenantQuery(request);
    const body = await readJsonRecord(request);
    const bodyTenantId = parseRequestTenantId(body);
    const tenantId = resolveWorkspaceId(session, selectRequestTenantId(queryTenantId, bodyTenantId) ?? null);
    const { tenantId: _tenantId, ...payload } = body;
    const { code } = applyPresetSchema.parse(payload);
    const rule = await applyDeadlineRulePreset(code, { tenantId, userId: session.id });
    return NextResponse.json(rule);
  } catch (error) {
    return serviceCatalogErrorResponse(error, 'POST /api/service-catalog/deadline-rules/presets');
  }
}
