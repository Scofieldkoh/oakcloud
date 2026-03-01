import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/api-helpers';
import { deleteCommunicationSchema } from '@/lib/validations/communication';
import { deleteTenantCommunication } from '@/services/outlook-email-ingestion.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = deleteCommunicationSchema.parse(body);

    const tenantResult = await requireTenantContext(session, parsed.tenantId);
    if (tenantResult.error) return tenantResult.error;

    await deleteTenantCommunication({
      tenantId: tenantResult.tenantId,
      userId: session.id,
      communicationId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

