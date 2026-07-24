import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { taskStageMetadataSchema } from '@/lib/validations/task';
import {
  getTaskStageDetail,
  updateTaskStageMetadata,
} from '@/services/tasks';

interface RouteParams {
  params: Promise<{ taskId: string; stageId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { taskId, stageId } = await params;

    return NextResponse.json(
      await getTaskStageDetail(
        requireSessionWorkspaceId(session),
        taskId,
        stageId,
      ),
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const { taskId, stageId } = await params;
    const parsed = taskStageMetadataSchema.parse(await request.json());

    await getTaskStageDetail(tenantId, taskId, stageId);
    return NextResponse.json(
      await updateTaskStageMetadata(tenantId, stageId, parsed, session.id),
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}
