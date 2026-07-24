import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import {
  archiveTaskSchema,
  updateTaskMetadataSchema,
} from '@/lib/validations/task';
import { taskRouteParamsSchema } from '@/lib/validations/task-api';
import {
  archiveTask,
  getTask,
  updateTaskMetadata,
} from '@/services/tasks';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = taskRouteParamsSchema.parse(await params);

    return NextResponse.json(await getTask(requireSessionWorkspaceId(session), id));
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const { id } = taskRouteParamsSchema.parse(await params);
    const body = await request.json();
    const { tenantId: _ignoredTenantId, ...input } = body;
    const parsed = updateTaskMetadataSchema.parse(input);

    return NextResponse.json(
      await updateTaskMetadata(tenantId, id, parsed, session.id),
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const { id } = taskRouteParamsSchema.parse(await params);
    const parsed = archiveTaskSchema.parse(await request.json());

    await archiveTask(tenantId, id, parsed.reason, session.id);
    return NextResponse.json({ id, archived: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
