import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getFormResponses } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function resolveTenantId(session: Awaited<ReturnType<typeof requireAuth>>, requestedTenantId?: string | null): string {
  if (session.isSuperAdmin) {
    const tenantId = requestedTenantId || session.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context required');
    }
    return tenantId;
  }

  if (!session.tenantId) {
    throw new Error('Tenant context required');
  }

  return session.tenantId;
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
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
