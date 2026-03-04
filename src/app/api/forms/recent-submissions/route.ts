import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listRecentFormSubmissions } from '@/services/form-builder.service';

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

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = resolveTenantId(session, searchParams.get('tenantId'));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || '8')));

    const recent = await listRecentFormSubmissions(tenantId, limit);
    return NextResponse.json({ submissions: recent });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
