import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getCompanyStats } from '@/services/company.service';

export async function GET() {
  try {
    // Allow both SUPER_ADMIN (global stats) and TENANT_ADMIN (tenant-scoped stats)
    const session = await requireAuth();
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Pass tenantId for non-SUPER_ADMIN users to get tenant-scoped stats
    // SUPER_ADMIN can get global stats with skipTenantFilter
    const stats = await getCompanyStats(
      session.tenantId,
      { skipTenantFilter: session.isSuperAdmin && !session.tenantId }
    );

    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
