/**
 * User Permissions API
 *
 * GET /api/auth/permissions - Get current user's effective permissions
 *
 * Returns permissions based on role assignments. For company-scoped users,
 * returns permissions from their company-specific roles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserPermissions } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Get companyId from query params if provided (for checking specific company permissions)
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || undefined;

    // Get user's effective permissions
    const permissions = await getUserPermissions(session.id, companyId || session.companyId || undefined);

    // Also include computed role flags for convenience
    return NextResponse.json({
      permissions,
      isSuperAdmin: session.isSuperAdmin,
      isTenantAdmin: session.isTenantAdmin,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
