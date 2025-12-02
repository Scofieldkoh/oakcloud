import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { getTenantRoles } from '@/lib/rbac';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId } = await params;

    // Check access - SUPER_ADMIN or TENANT_ADMIN of this tenant
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const roles = await getTenantRoles(tenantId);

    return NextResponse.json(roles);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
