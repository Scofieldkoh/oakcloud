/**
 * Role Users API
 *
 * GET /api/tenants/:id/roles/:roleId/users - Get users assigned to a role
 * POST /api/tenants/:id/roles/:roleId/users - Assign a user to a role
 * DELETE /api/tenants/:id/roles/:roleId/users - Remove a user from a role
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import {
  getRoleUsers,
  assignRoleToUser,
  removeRoleFromUser,
  roleBelongsToTenant,
} from '@/services/role.service';
import { prisma } from '@/lib/prisma';

export async function GET(
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

    const users = await getRoleUsers(roleId);

    return NextResponse.json({ users });
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
    const { userId, companyId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Verify user belongs to tenant
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found in this tenant' }, { status: 404 });
    }

    // Verify company belongs to tenant if provided
    if (companyId) {
      const company = await prisma.company.findFirst({
        where: {
          id: companyId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!company) {
        return NextResponse.json({ error: 'Company not found in this tenant' }, { status: 404 });
      }
    }

    // Assign role to user
    await assignRoleToUser(userId, roleId, companyId);

    // Log the assignment
    await createAuditLog({
      tenantId,
      userId: session.id,
      changeSource: 'MANUAL',
      action: 'PERMISSION_GRANTED',
      entityType: 'UserRoleAssignment',
      entityId: userId,
      summary: `Assigned role to user`,
      metadata: { roleId, companyId },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'User already has this role assignment') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to assign role:', error);
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
    const { userId, companyId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Remove role from user
    await removeRoleFromUser(userId, roleId, companyId);

    // Log the removal
    await createAuditLog({
      tenantId,
      userId: session.id,
      changeSource: 'MANUAL',
      action: 'PERMISSION_REVOKED',
      entityType: 'UserRoleAssignment',
      entityId: userId,
      summary: `Removed role from user`,
      metadata: { roleId, companyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Failed to remove role:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
