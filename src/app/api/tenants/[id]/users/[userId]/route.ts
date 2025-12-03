/**
 * Individual User API Routes
 *
 * GET    /api/tenants/:id/users/:userId - Get user details
 * PATCH  /api/tenants/:id/users/:userId - Update user (role, status, name, etc.)
 * DELETE /api/tenants/:id/users/:userId - Remove user from tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { removeUserFromTenant } from '@/services/tenant.service';
import { requestPasswordReset } from '@/services/password.service';
import { createAuditLog, computeChanges } from '@/lib/audit';
import { z } from 'zod';

// Validation schema for user updates
const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
  companyId: z.string().uuid().nullable().optional(),
  sendPasswordReset: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireAuth();
    const { id: tenantId, userId } = await params;

    // Check tenant access and permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'user', 'read');

    const user = await prisma.user.findUnique({
      where: { id: userId, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
            uen: true,
          },
        },
        companyAssignments: {
          select: {
            id: true,
            companyId: true,
            isPrimary: true,
            company: {
              select: {
                id: true,
                name: true,
                uen: true,
              },
            },
          },
        },
        roleAssignments: {
          select: {
            id: true,
            role: {
              select: {
                id: true,
                name: true,
                isSystem: true,
                systemRoleType: true,
              },
            },
            companyId: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireAuth();
    const { id: tenantId, userId } = await params;

    // Check tenant access and permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'user', 'update');

    const body = await request.json();
    const data = updateUserSchema.parse(body);

    // Get existing user
    const existingUser = await prisma.user.findUnique({
      where: { id: userId, tenantId, deletedAt: null },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle password reset request
    if (data.sendPasswordReset) {
      await requestPasswordReset(existingUser.email);
    }

    // Prepare update data (excluding role which is handled separately)
    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.companyId !== undefined) updateData.companyId = data.companyId;

    // Handle email change (check uniqueness)
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
      if (emailExists) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      updateData.email = data.email.toLowerCase();
    }

    // Update user if there are changes
    let updatedUser = existingUser;
    if (Object.keys(updateData).length > 0) {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      // Log changes
      const changes = computeChanges(
        existingUser as unknown as Record<string, unknown>,
        updateData,
        ['firstName', 'lastName', 'email', 'isActive', 'companyId']
      );

      if (changes) {
        const userName = `${updatedUser.firstName} ${updatedUser.lastName}`.trim() || updatedUser.email;
        await createAuditLog({
          tenantId,
          userId: session.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: userId,
          entityName: userName,
          summary: `Updated user "${userName}"`,
          changeSource: 'MANUAL',
          changes,
        });
      }
    }

    return NextResponse.json({
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      isActive: updatedUser.isActive,
      passwordResetSent: data.sendPasswordReset || false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('Cannot demote') || error.message.includes('Cannot remove the last')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireAuth();
    const { id: tenantId, userId } = await params;

    // Check tenant access and permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'user', 'delete');

    // Prevent self-deletion
    if (userId === session.id) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }

    // Get reason from request body (optional)
    let reason = 'Removed by administrator';
    try {
      const body = await request.json();
      if (body.reason && typeof body.reason === 'string') {
        reason = body.reason;
      }
    } catch {
      // No body or invalid JSON - use default reason (DELETE with no body is valid)
      console.debug('DELETE request with no/invalid JSON body, using default reason');
    }

    await removeUserFromTenant(tenantId, userId, session.id, reason);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('Cannot remove the last tenant administrator')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
