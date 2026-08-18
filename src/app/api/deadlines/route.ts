import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { getCompanyReadScope } from '@/lib/api/company-query';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import {
  emptyDeadlineResult,
  parseDeadlineSearchParams,
} from '@/lib/validations/deadline';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import { listDeadlines } from '@/services/deadline';

function safeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return createErrorResponse(error);
  if (error instanceof z.ZodError) {
    return createErrorResponse(new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid deadline request',
      400,
      { issues: error.issues },
    ));
  }
  if (error instanceof Error && (
    error.message === 'Unauthorized'
    || error.message === 'Forbidden'
    || error.message.startsWith('Permission denied')
  )) return createErrorResponse(error);
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

    const search = parseDeadlineSearchParams(request);
    const scope = getCompanyReadScope(session);
    if ('empty' in scope || scope.options.companyIds?.length === 0) {
      return NextResponse.json(emptyDeadlineResult(search));
    }

    return NextResponse.json(await listDeadlines(search, {
      tenantId,
      companyIds: scope.options.companyIds,
    }));
  } catch (error) {
    return safeErrorResponse(error);
  }
}
