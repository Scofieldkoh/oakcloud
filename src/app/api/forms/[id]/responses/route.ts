import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { resolveTenantId, createErrorResponse } from '@/lib/api-helpers';
import { getFormResponses } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || '20')));

    const responses = await getFormResponses(id, tenantId, page, limit);

    return NextResponse.json(responses);
  } catch (error) {
    return createErrorResponse(error);
  }
}
