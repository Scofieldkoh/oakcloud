import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { requirePermission } from '@/lib/rbac';
import { saveGenerationSessionSchema } from '@/lib/validations/generated-document';
import { createGenerationSession } from '@/services/document-generation-session.service';
import {
  linkGeneratedDocumentTaskOutcome,
  parseTaskLaunchContext,
} from '@/services/tasks/integration.service';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'create');

    const body = await request.json();
    const {
      tenantId: _ignoredTenantId,
      taskContext: rawTaskContext,
      ...payload
    } = body;
    const taskContext = parseTaskLaunchContext(rawTaskContext);
    const input = saveGenerationSessionSchema.parse(payload);
    const result = await createGenerationSession(input, {
      tenantId: requireSessionWorkspaceId(session),
      userId: session.id,
    });
    if (taskContext) {
      await linkGeneratedDocumentTaskOutcome({
        tenantId: requireSessionWorkspaceId(session),
        context: taskContext,
        authoritativeId: result.id,
        userId: session.id,
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return createErrorResponse(error);
  }
}
