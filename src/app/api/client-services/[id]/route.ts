import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { requirePermission } from '@/lib/rbac';
import { archiveClientServiceSchema, updateClientServiceSchema } from '@/lib/validations/client-service';
import { archiveClientService, getClientService, updateClientService } from '@/services/client-service';

type Context = { params: Promise<{ id: string }> };
const actor = (session: Awaited<ReturnType<typeof requireAuth>>) => ({ tenantId: requireSessionWorkspaceId(session), userId: session.id });

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const service = await getClientService(id, actor(session));
    await requirePermission(session, 'company', 'read', service.companyId);
    return NextResponse.json(service);
  } catch (error) { return createErrorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const paramsActor = actor(session);
    const service = await getClientService(id, paramsActor);
    await requirePermission(session, 'company', 'update', service.companyId);
    return NextResponse.json(await updateClientService(id, updateClientServiceSchema.parse(await request.json()), paramsActor));
  } catch (error) { return createErrorResponse(error); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const paramsActor = actor(session);
    const service = await getClientService(id, paramsActor);
    await requirePermission(session, 'company', 'update', service.companyId);
    const { reason } = archiveClientServiceSchema.parse(await request.json());
    return NextResponse.json(await archiveClientService(id, reason, paramsActor));
  } catch (error) { return createErrorResponse(error); }
}
