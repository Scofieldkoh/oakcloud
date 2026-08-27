import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { ApiError } from '@/lib/errors';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { getCompanyReadScope } from '@/lib/api/company-query';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import { listServiceRosterFamilies } from '@/services/service-roster';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    await requireServicesWorkspaceEnabled(tenantId);

    const scope = getCompanyReadScope(session);
    if ('empty' in scope || scope.options.companyIds?.length === 0) {
      return NextResponse.json({ families: [] });
    }

    return NextResponse.json({
      families: await listServiceRosterFamilies({
        tenantId,
        companyIds: scope.options.companyIds,
      }),
    });
  } catch (error) {
    console.error('[API /api/client-services/families GET] error:', error);
    if (error instanceof ApiError) return createErrorResponse(error);
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden' || error.message.startsWith('Permission denied'))) {
      return createErrorResponse(error);
    }
    return createErrorResponse(new Error('An unexpected error occurred'));
  }
}
