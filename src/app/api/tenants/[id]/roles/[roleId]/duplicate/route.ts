/**
 * Duplicate Role API
 *
 * POST /api/tenants/:id/roles/:roleId/duplicate - Duplicate a role
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { createAuditContext, logCreate } from '@/lib/audit';
import { duplicateRole, roleBelongsToTenant } from '@/services/role.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId, roleId } = await params;

    // Check access
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify role belongs to tenant
    const belongsToTenant = await roleBelongsToTenant(roleId, tenantId);
    if (!belongsToTenant) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'New role name is required' }, { status: 400 });
    }

    if (name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { error: 'Role name must be between 2 and 50 characters' },
        { status: 400 }
      );
    }

    // Duplicate the role
    const newRole = await duplicateRole(roleId, name.trim(), tenantId);

    // Log the creation
    const ctx = await createAuditContext({
      tenantId,
      userId: session.id,
      changeSource: 'MANUAL',
    });
    await logCreate(ctx, 'Role', newRole.id, newRole.name, {
      description: newRole.description,
      permissionCount: newRole.permissions.length,
      duplicatedFrom: roleId,
    });

    return NextResponse.json(newRole, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'A role with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to duplicate role:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
