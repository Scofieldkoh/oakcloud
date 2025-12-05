/**
 * Connector Tenant Access API Routes
 *
 * GET   /api/connectors/[id]/access - Get tenant access list (SUPER_ADMIN only)
 * PATCH /api/connectors/[id]/access - Update tenant access (SUPER_ADMIN only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { updateTenantAccessSchema } from '@/lib/validations/connector';
import { getTenantAccess, updateTenantAccess } from '@/services/connector.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantAccess = await getTenantAccess(id, {
      tenantId: session.tenantId,
      userId: session.id,
      isSuperAdmin: session.isSuperAdmin,
    });

    return NextResponse.json({ tenantAccess });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message.includes('only applies to system')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === 'Connector not found') {
        return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = updateTenantAccessSchema.parse(body);

    await updateTenantAccess(id, data, {
      tenantId: session.tenantId,
      userId: session.id,
      isSuperAdmin: session.isSuperAdmin,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message.includes('only applies to system')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message === 'Connector not found') {
        return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
