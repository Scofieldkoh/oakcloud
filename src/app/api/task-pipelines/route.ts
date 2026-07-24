import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { createTaskPipelineSchema } from '@/lib/validations/task-pipeline';
import { createTaskPipeline, listTaskPipelines } from '@/services/tasks';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';

    return NextResponse.json(await listTaskPipelines(tenantId, { includeArchived }));
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const tenantId = requireSessionWorkspaceId(session);
    const body = await request.json();
    const { tenantId: _ignoredTenantId, ...input } = body;
    const parsed = createTaskPipelineSchema.parse(input);

    return NextResponse.json(
      await createTaskPipeline(tenantId, parsed, session.id),
      { status: 201 },
    );
  } catch (error) {
    return createErrorResponse(error);
  }
}
