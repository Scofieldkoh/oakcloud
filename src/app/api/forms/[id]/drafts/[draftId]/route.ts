import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveTenantId } from '@/lib/api-helpers';
import { deleteFormDraft, getFormDraftById } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{
    id: string;
    draftId: string;
  }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, draftId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'document', 'delete');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));
    const reason = searchParams.get('reason') || undefined;

    const result = await deleteFormDraft(
      id,
      draftId,
      {
        tenantId,
        userId: session.id,
      },
      reason
    );

    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, draftId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));

    const result = await getFormDraftById(id, draftId, tenantId);
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
