/**
 * Permissions API
 *
 * GET /api/permissions - Get all available permissions
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getPermissionsGroupedByResource } from '@/services/role.service';

export async function GET() {
  try {
    const session = await requireAuth();

    // Only SUPER_ADMIN and TENANT_ADMIN can view permissions
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const permissions = await getPermissionsGroupedByResource();

    return NextResponse.json(permissions);
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
