import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveTenantId } from '@/lib/api-helpers';
import { resendEsigningEnvelopeRecipient } from '@/services/esigning-envelope.service';

interface RouteParams {
  params: Promise<{ id: string; recipientId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, recipientId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'update');

    const body = await request.json().catch(() => ({}));
    const tenantId = resolveTenantId(session, body.tenantId);

    const result = await resendEsigningEnvelopeRecipient(session, tenantId, id, recipientId);
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
