/**
 * Combined Session + Permissions API
 *
 * GET /api/auth/session - Get current user's session and permissions in one call
 *
 * This endpoint combines /api/auth/me and /api/auth/permissions to reduce
 * the number of API calls needed on page load.
 *
 * Returns:
 * - user: Session user data
 * - permissions: Array of permission strings (e.g., "company:read")
 * - isSuperAdmin, isTenantAdmin: Role flags
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserPermissions } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Get companyId from query params if provided (for checking specific company permissions)
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId') || undefined;

    // Get user's effective permissions
    const permissions = await getUserPermissions(session.id, companyId);

    return NextResponse.json({
      user: {
        id: session.id,
        email: session.email,
        firstName: session.firstName,
        lastName: session.lastName,
        tenantId: session.tenantId,
        isSuperAdmin: session.isSuperAdmin,
        isTenantAdmin: session.isTenantAdmin,
        companyIds: session.companyIds,
      },
      permissions,
      isSuperAdmin: session.isSuperAdmin,
      isTenantAdmin: session.isTenantAdmin,
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
