import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { getCompanyReadScope } from '@/lib/api/company-query';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import { findUnbilledFilings } from '@/services/billing/postpaid';

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/**
 * Before deadlines are marked Filed in bulk: which ones would raise no
 * postpaid bill because their YA is before a service's engagement start.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    await requireServicesWorkspaceEnabled(tenantId);
    const { ids } = bodySchema.parse(await request.json());
    const scope = getCompanyReadScope(session);
    if ('empty' in scope || scope.options.companyIds?.length === 0) return NextResponse.json({ items: [] });
    const items = await findUnbilledFilings({ tenantId, companyIds: scope.options.companyIds, occurrenceIds: ids });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(new ApiError(ErrorCodes.VALIDATION_ERROR, 'Invalid deadline request', 400, { issues: error.issues }));
    }
    if (error instanceof SyntaxError) {
      return createErrorResponse(new ApiError(ErrorCodes.VALIDATION_ERROR, 'Invalid JSON request', 400));
    }
    return routeErrorResponse(error);
  }
}
