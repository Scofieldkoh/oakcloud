/**
 * Tenant Roles API
 *
 * GET /api/tenants/:id/roles - List all roles for a tenant
 * POST /api/tenants/:id/roles - Create a new role
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createAuditContext, logCreate } from '@/lib/audit';
import {
  getTenantRoles,
  createRole,
  validatePermissionIds,
} from '@/services/role.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId } = await params;

    // Check tenant access and role:read permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'role', 'read');

    const roles = await getTenantRoles(tenantId);

    return NextResponse.json(roles);
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId } = await params;

    // Check tenant access and role:create permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'role', 'create');

    const body = await request.json();
    const { name, description, permissions = [] } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }

    if (name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { error: 'Role name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    // Validate permissions if provided
    if (permissions.length > 0) {
      const validPermissions = await validatePermissionIds(permissions);
      if (!validPermissions) {
        return NextResponse.json(
          { error: 'One or more permission IDs are invalid' },
          { status: 400 }
        );
      }
    }

    // Create the role
    const role = await createRole({
      tenantId,
      name: name.trim(),
      description: description?.trim(),
      permissions,
    });

    // Log the creation
    const ctx = await createAuditContext({
      tenantId,
      userId: session.id,
      changeSource: 'MANUAL',
    });
    await logCreate(ctx, 'Role', role.id, role.name, {
      description: role.description,
      permissionCount: role.permissions.length,
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'A role with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to create role:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
