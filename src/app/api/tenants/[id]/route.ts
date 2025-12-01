/**
 * Individual Tenant API Routes
 *
 * GET    /api/tenants/:id - Get tenant details
 * PATCH  /api/tenants/:id - Update tenant
 * DELETE /api/tenants/:id - Soft delete tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canManageTenant } from '@/lib/auth';
import { updateTenantSchema, updateTenantStatusSchema } from '@/lib/validations/tenant';
import {
  getTenantById,
  updateTenant,
  updateTenantStatus,
  deleteTenant,
} from '@/services/tenant.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id } = await params;

    // Check access
    if (!canManageTenant(session, id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenant = await getTenantById(id);

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json(tenant);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id } = await params;

    // Check access
    if (!canManageTenant(session, id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Check if this is a status update
    if (body.status && Object.keys(body).length <= 3) {
      const data = updateTenantStatusSchema.parse({ ...body, id });
      const tenant = await updateTenantStatus(id, data.status, session.id, data.reason);
      return NextResponse.json(tenant);
    }

    // Regular update
    const data = updateTenantSchema.parse({ ...body, id });
    const tenant = await updateTenant(data, session.id);

    return NextResponse.json(tenant);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Tenant not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === 'Tenant slug already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN']);
    const { id } = await params;

    const body = await request.json();
    const reason = body.reason;

    if (!reason || reason.length < 10) {
      return NextResponse.json(
        { error: 'Deletion reason must be at least 10 characters' },
        { status: 400 }
      );
    }

    const tenant = await deleteTenant(id, session.id, reason);

    return NextResponse.json(tenant);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Tenant not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
