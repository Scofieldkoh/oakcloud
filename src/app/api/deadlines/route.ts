import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { getCompanyReadScope, jsonWithServerTiming, withServerTiming } from '@/lib/api/company-query';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import { routeErrorResponse } from '@/lib/api-route-errors';
import {
  emptyDeadlineResult,
  parseDeadlineSearchParams,
} from '@/lib/validations/deadline';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import { listDeadlines } from '@/services/deadline';
import { parseComplianceOverviewParams } from '@/lib/validations/deadline-overview';
import { emptyComplianceOverview, getComplianceOverview } from '@/services/deadline/overview';

function safeErrorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return createErrorResponse(new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid deadline request',
      400,
      { issues: error.issues },
    ));
  }
  return routeErrorResponse(error);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = performance.now();
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    await requireServicesWorkspaceEnabled(tenantId);

    const overview = request.nextUrl.searchParams.has('overview')
      ? parseComplianceOverviewParams(request.nextUrl.searchParams)
      : null;
    const search = overview ? null : parseDeadlineSearchParams(request);
    const scope = getCompanyReadScope(session);
    if ('empty' in scope || scope.options.companyIds?.length === 0) {
      return jsonWithServerTiming(overview ? emptyComplianceOverview(overview) : emptyDeadlineResult(search!), startedAt);
    }

    const readScope = { tenantId, companyIds: scope.options.companyIds };
    if (overview) return jsonWithServerTiming(await getComplianceOverview(overview, readScope), startedAt);
    return jsonWithServerTiming(await listDeadlines(search!, readScope), startedAt);
  } catch (error) {
    return withServerTiming(safeErrorResponse(error), startedAt);
  }
}
