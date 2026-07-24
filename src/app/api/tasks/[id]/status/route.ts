import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { taskStatusTransitionSchema } from '@/lib/validations/task-api';
import { cancelTask, pauseTask, resumeTask } from '@/services/tasks';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const { id } = await params;
    const { action } = taskStatusTransitionSchema.parse(await request.json());
    const transition = {
      pause: pauseTask,
      resume: resumeTask,
      cancel: cancelTask,
    }[action];

    return NextResponse.json(await transition(tenantId, id, session.id));
  } catch (error) {
    return createErrorResponse(error);
  }
}

export const PATCH = POST;
