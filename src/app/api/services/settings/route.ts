import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getServiceWorkspaceFlagsForTenant } from '@/services/schedule-reconciliation';

/**
 * Return feature flags for the authenticated workspace. The workspace is
 * always derived from the session; this endpoint intentionally has no tenant
 * query parameter.
 */
export async function GET(_request?: Request) {
  try {
    const session = await requireAuth();
    if (!session.tenantId) {
      return NextResponse.json({ error: 'Workspace context required' }, { status: 400 });
    }

    return NextResponse.json(await getServiceWorkspaceFlagsForTenant(session.tenantId));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
