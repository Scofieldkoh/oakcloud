import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { ApiError, ErrorCodes } from '@/lib/errors';
import {
  createErrorResponse,
  requireSessionWorkspaceId,
} from '@/lib/api-helpers';
import {
  getCompanyReadScope,
} from '@/lib/api/company-query';
import {
  emptyServiceRosterResult,
  parseServiceRosterSearchParams,
} from '@/lib/validations/service-roster';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import { listServiceRoster } from '@/services/service-roster';

function safeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return createErrorResponse(error);
  if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden' || error.message.startsWith('Permission denied'))) {
    return createErrorResponse(error);
  }
  return createErrorResponse(new ApiError(
    ErrorCodes.INTERNAL_ERROR,
    'An unexpected error occurred',
    500,
  ));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');
    const tenantId = requireSessionWorkspaceId(session);
    await requireServicesWorkspaceEnabled(tenantId);

    const search = parseServiceRosterSearchParams(request);
    const scope = getCompanyReadScope(session);
    if ('empty' in scope || scope.options.companyIds?.length === 0) {
      return NextResponse.json(emptyServiceRosterResult(search));
    }

    return NextResponse.json(await listServiceRoster(search, {
      tenantId,
      companyIds: scope.options.companyIds,
    }));
  } catch (error) {
    return safeErrorResponse(error);
  }
}
