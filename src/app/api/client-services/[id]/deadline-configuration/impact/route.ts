import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { ValidationError } from '@/lib/errors';
import { requirePermission } from '@/lib/rbac';
import { clientServiceDeadlineImpactSchema } from '@/lib/validations/client-service';
import { getClientService, previewClientServiceDeadlineConfiguration } from '@/services/client-service';

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const session = await requireAuth();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const actor = { tenantId: requireSessionWorkspaceId(session), userId: session.id };
    const service = await getClientService(id, actor);
    await requirePermission(session, 'company', 'update', service.companyId);
    const body = await request.json().catch(() => {
      throw new ValidationError('Request body must be valid JSON');
    });
    const input = clientServiceDeadlineImpactSchema.parse(body);
    return NextResponse.json(await previewClientServiceDeadlineConfiguration(id, input, actor));
  } catch (error) {
    return createErrorResponse(error);
  }
}
