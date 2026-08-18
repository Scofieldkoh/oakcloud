import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import { resetDeadlineDateOverrideSchema } from '@/lib/validations/deadline';
import {
  getDeadlineOccurrence,
  resetDeadlineDateOverride,
} from '@/services/deadline';

const deadlineIdSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

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
  return createErrorResponse(new ApiError(ErrorCodes.INTERNAL_ERROR, 'An unexpected error occurred', 500));
}

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    await requireServicesWorkspaceEnabled(tenantId);
    const { id: rawId } = await params;
    const id = deadlineIdSchema.parse(rawId);
    const actor = { tenantId, userId: session.id };
    const deadline = await getDeadlineOccurrence(id, actor);
    await requirePermission(session, 'company', 'update', deadline.companyId);
    const input = resetDeadlineDateOverrideSchema.parse(await request.json());
    return NextResponse.json(await resetDeadlineDateOverride(id, input, actor));
  } catch (error) {
    return safeErrorResponse(error);
  }
}
