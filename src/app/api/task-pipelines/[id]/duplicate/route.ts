import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { duplicateTaskPipelineSchema } from '@/lib/validations/task-pipeline';
import { duplicateTaskPipeline } from '@/services/tasks';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const { id } = await params;
    const parsed = duplicateTaskPipelineSchema.parse(await request.json());

    return NextResponse.json(
      await duplicateTaskPipeline(tenantId, id, parsed, session.id),
      { status: 201 },
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}
