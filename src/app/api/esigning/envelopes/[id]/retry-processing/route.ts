import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createErrorResponse, resolveTenantId } from '@/lib/api-helpers';
import { retryEsigningEnvelopePdfGeneration } from '@/services/esigning-envelope.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'esigning', 'manage');

    const body = await request.json().catch(() => ({}));
    const tenantId = resolveTenantId(session, body.tenantId);

    const result = await retryEsigningEnvelopePdfGeneration(session, tenantId, id);
    return NextResponse.json(result);
  } catch (error) {
    return createErrorResponse(error);
  }
}
