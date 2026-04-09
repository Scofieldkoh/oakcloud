import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveTenantId } from '@/lib/api-helpers';
import { uploadEsigningEnvelopeDocument } from '@/services/esigning-envelope.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'update');

    const formData = await request.formData();
    const file = formData.get('file');
    const tenantId = resolveTenantId(session, formData.get('tenantId')?.toString());

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const result = await uploadEsigningEnvelopeDocument(session, tenantId, id, file);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return createErrorResponse(error);
  }
}
