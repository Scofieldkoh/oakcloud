/**
 * Individual Role API
 *
 * GET /api/tenants/:id/roles/:roleId - Get a specific role
 * PATCH /api/tenants/:id/roles/:roleId - Update a role
 * DELETE /api/tenants/:id/roles/:roleId - Delete a role
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createAuditContext, logUpdate, logDelete } from '@/lib/audit';
import {
  getRoleById,
  updateRole,
  deleteRole,
  validatePermissionIds,
  roleBelongsToTenant,
} from '@/services/role.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId, roleId } = await params;

    // Check tenant access and role:read permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'role', 'read');

    // Verify role belongs to tenant
    const belongsToTenant = await roleBelongsToTenant(roleId, tenantId);
    if (!belongsToTenant) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const role = await getRoleById(roleId, { tenantId });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    return NextResponse.json(role);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId, roleId } = await params;

    // Check tenant access and role:update permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'role', 'update');

    // Verify role belongs to tenant
    const belongsToTenant = await roleBelongsToTenant(roleId, tenantId);
    if (!belongsToTenant) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Get current role for comparison (pass tenantId for authorization)
    const currentRole = await getRoleById(roleId, { tenantId });
    if (!currentRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, permissions } = body;

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length < 2 || name.length > 50) {
        return NextResponse.json(
          { error: 'Role name must be between 2 and 50 characters' },
          { status: 400 }
        );
      }
    }

    // Validate permissions if provided
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        return NextResponse.json(
          { error: 'Permissions must be an array' },
          { status: 400 }
        );
      }
      if (permissions.length > 0) {
        const validPermissions = await validatePermissionIds(permissions);
        if (!validPermissions) {
          return NextResponse.json(
            { error: 'One or more permission IDs are invalid' },
            { status: 400 }
          );
        }
      }
    }

    // Update the role (pass tenantId for authorization)
    const updatedRole = await updateRole(roleId, {
      name: name?.trim(),
      description: description?.trim(),
      permissions,
    }, tenantId);

    // Build changes for audit log
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (name && name !== currentRole.name) {
      changes.name = { old: currentRole.name, new: name };
    }
    if (description !== undefined && description !== currentRole.description) {
      changes.description = { old: currentRole.description, new: description };
    }
    if (permissions !== undefined) {
      const oldPermissionIds = currentRole.permissions.map((p) => p.permissionId).sort();
      const newPermissionIds = [...permissions].sort();
      if (JSON.stringify(oldPermissionIds) !== JSON.stringify(newPermissionIds)) {
        changes.permissions = {
          old: oldPermissionIds.length,
          new: newPermissionIds.length,
        };
      }
    }

    // Log the update if there are changes
    if (Object.keys(changes).length > 0) {
      const ctx = await createAuditContext({
        tenantId,
        userId: session.id,
        changeSource: 'MANUAL',
      });
      await logUpdate(ctx, 'Role', roleId, changes, updatedRole.name);
    }

    return NextResponse.json(updatedRole);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied') || error.message === 'System roles cannot be modified') {
        return NextResponse.json({ error: error.message === 'System roles cannot be modified' ? error.message : 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'A role with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to update role:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId, roleId } = await params;

    // Check tenant access and role:delete permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'role', 'delete');

    // Verify role belongs to tenant
    const belongsToTenant = await roleBelongsToTenant(roleId, tenantId);
    if (!belongsToTenant) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Get role for audit log (pass tenantId for authorization)
    const role = await getRoleById(roleId, { tenantId });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Delete the role (pass tenantId for authorization)
    await deleteRole(roleId, tenantId);

    // Log the deletion
    const ctx = await createAuditContext({
      tenantId,
      userId: session.id,
      changeSource: 'MANUAL',
    });
    await logDelete(ctx, 'Role', roleId, role.name, 'Role deleted by administrator');

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied') || error.message === 'System roles cannot be deleted') {
        return NextResponse.json({ error: error.message === 'System roles cannot be deleted' ? error.message : 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('Cannot delete role')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to delete role:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
