import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/api-helpers';
import { bulkDeleteCommunicationsSchema } from '@/lib/validations/communication';
import { deleteTenantCommunicationsBulk } from '@/services/outlook-email-ingestion.service';

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bulkDeleteCommunicationsSchema.parse(body);

    const tenantResult = await requireTenantContext(session, parsed.tenantId);
    if (tenantResult.error) return tenantResult.error;

    const result = await deleteTenantCommunicationsBulk({
      tenantId: tenantResult.tenantId,
      userId: session.id,
      communicationIds: parsed.ids,
    });

    return NextResponse.json(result);
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

