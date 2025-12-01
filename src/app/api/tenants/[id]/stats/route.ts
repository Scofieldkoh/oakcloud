/**
 * Tenant Statistics API Route
 *
 * GET /api/tenants/:id/stats - Get tenant statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canManageTenant } from '@/lib/auth';
import { getTenantStats } from '@/services/tenant.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id: tenantId } = await params;

    // Check access
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stats = await getTenantStats(tenantId);

    return NextResponse.json(stats);
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
