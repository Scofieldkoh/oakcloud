import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import { requireServicesWorkspaceEnabled } from '@/services/schedule-reconciliation';
import {
  updateDeadlineOccurrenceSchema,
} from '@/lib/validations/deadline';
import {
  getDeadlineOccurrence,
  updateDeadlineOccurrence,
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

function actorFor(session: Awaited<ReturnType<typeof requireAuth>>) {
  return { tenantId: requireSessionWorkspaceId(session), userId: session.id };
}

async function loadForSession(id: string, session: Awaited<ReturnType<typeof requireAuth>>) {
  const actor = actorFor(session);
  await requireServicesWorkspaceEnabled(actor.tenantId);
  const deadline = await getDeadlineOccurrence(id, actor);
  return { actor, deadline };
}

export async function GET(_request: NextRequest, { params }: Context): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    const { id: rawId } = await params;
    const id = deadlineIdSchema.parse(rawId);
    const { deadline } = await loadForSession(id, session);
    await requirePermission(session, 'company', 'read', deadline.companyId);
    return NextResponse.json(deadline);
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    const { id: rawId } = await params;
    const id = deadlineIdSchema.parse(rawId);
    const { actor, deadline } = await loadForSession(id, session);
    await requirePermission(session, 'company', 'update', deadline.companyId);
    const input = updateDeadlineOccurrenceSchema.parse(await request.json());
    return NextResponse.json(await updateDeadlineOccurrence(id, input, actor));
  } catch (error) {
    return safeErrorResponse(error);
  }
}
