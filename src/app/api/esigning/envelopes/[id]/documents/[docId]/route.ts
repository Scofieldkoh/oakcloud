import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveTenantId } from '@/lib/api-helpers';
import { reorderEsigningDocumentSchema } from '@/lib/validations/esigning';
import {
  deleteEsigningEnvelopeDocument,
  reorderEsigningEnvelopeDocument,
} from '@/services/esigning-envelope.service';

interface RouteParams {
  params: Promise<{ id: string; docId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, docId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'update');

    const body = await request.json();
    const tenantId = resolveTenantId(session, body.tenantId);
    const parsed = reorderEsigningDocumentSchema.parse(body);

    const result = await reorderEsigningEnvelopeDocument(session, tenantId, id, docId, parsed.sortOrder);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 });
    }

    return createErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, docId } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'update');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));

    const result = await deleteEsigningEnvelopeDocument(session, tenantId, id, docId);
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
