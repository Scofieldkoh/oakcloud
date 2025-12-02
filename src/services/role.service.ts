/**
 * Role Service
 *
 * Business logic for role management including CRUD operations
 * and permission assignment.
 */

import { prisma } from '@/lib/prisma';
import { RESOURCES, ACTIONS, type Resource, type Action } from '@/lib/rbac';

// ============================================================================
// Types
// ============================================================================

export interface CreateRoleData {
  tenantId: string;
  name: string;
  description?: string;
  permissions?: string[]; // Array of permission IDs
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
  permissions?: string[]; // Array of permission IDs (replaces existing)
}

export interface RoleWithPermissions {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{
    id: string;
    permissionId: string;
    permission: {
      id: string;
      resource: string;
      action: string;
      description: string | null;
    };
  }>;
  _count: {
    users: number;
  };
}

// ============================================================================
// Permission Operations
// ============================================================================

/**
 * Get all available permissions
 */
export async function getAllPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  });
}

/**
 * Get permissions grouped by resource
 */
export async function getPermissionsGroupedByResource() {
  const permissions = await getAllPermissions();

  const grouped: Record<string, Array<{ id: string; action: string; description: string | null }>> = {};

  for (const permission of permissions) {
    if (!grouped[permission.resource]) {
      grouped[permission.resource] = [];
    }
    grouped[permission.resource].push({
      id: permission.id,
      action: permission.action,
      description: permission.description,
    });
  }

  return {
    resources: RESOURCES,
    actions: ACTIONS,
    grouped,
    permissions,
  };
}

// ============================================================================
// Role CRUD Operations
// ============================================================================

/**
 * Get a role by ID
 */
export async function getRoleById(roleId: string): Promise<RoleWithPermissions | null> {
  return prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: { users: true },
      },
    },
  });
}

/**
 * Get all roles for a tenant
 */
export async function getTenantRoles(tenantId: string): Promise<RoleWithPermissions[]> {
  return prisma.role.findMany({
    where: { tenantId },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: { users: true },
      },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

/**
 * Create a new custom role
 */
export async function createRole(data: CreateRoleData): Promise<RoleWithPermissions> {
  const { tenantId, name, description, permissions = [] } = data;

  // Check if role name already exists in tenant
  const existing = await prisma.role.findUnique({
    where: {
      tenantId_name: { tenantId, name },
    },
  });

  if (existing) {
    throw new Error('A role with this name already exists');
  }

  // Create role with permissions
  const role = await prisma.role.create({
    data: {
      tenantId,
      name,
      description,
      isSystem: false, // Custom roles are never system roles
      permissions: {
        create: permissions.map((permissionId) => ({
          permissionId,
        })),
      },
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: { users: true },
      },
    },
  });

  return role;
}

/**
 * Update a role
 */
export async function updateRole(
  roleId: string,
  data: UpdateRoleData
): Promise<RoleWithPermissions> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });

  if (!role) {
    throw new Error('Role not found');
  }

  if (role.isSystem) {
    throw new Error('System roles cannot be modified');
  }

  // Check for name uniqueness if name is being updated
  if (data.name && data.name !== role.name) {
    const existing = await prisma.role.findUnique({
      where: {
        tenantId_name: { tenantId: role.tenantId, name: data.name },
      },
    });

    if (existing) {
      throw new Error('A role with this name already exists');
    }
  }

  // Update role in transaction
  return prisma.$transaction(async (tx) => {
    // Update basic info
    await tx.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description,
      },
    });

    // Update permissions if provided
    if (data.permissions !== undefined) {
      // Delete existing permissions
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // Create new permissions
      if (data.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: data.permissions.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }
    }

    // Return updated role
    return tx.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
    }) as Promise<RoleWithPermissions>;
  });
}

/**
 * Delete a role
 */
export async function deleteRole(roleId: string): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      _count: {
        select: { users: true },
      },
    },
  });

  if (!role) {
    throw new Error('Role not found');
  }

  if (role.isSystem) {
    throw new Error('System roles cannot be deleted');
  }

  if (role._count.users > 0) {
    throw new Error(
      `Cannot delete role that is assigned to ${role._count.users} user(s). Remove all user assignments first.`
    );
  }

  // Delete role (cascade will handle RolePermission)
  await prisma.role.delete({
    where: { id: roleId },
  });
}

/**
 * Duplicate a role (for creating similar roles)
 */
export async function duplicateRole(
  roleId: string,
  newName: string,
  tenantId: string
): Promise<RoleWithPermissions> {
  const sourceRole = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: true,
    },
  });

  if (!sourceRole) {
    throw new Error('Source role not found');
  }

  // Create new role with same permissions
  return createRole({
    tenantId,
    name: newName,
    description: sourceRole.description || undefined,
    permissions: sourceRole.permissions.map((rp) => rp.permissionId),
  });
}

// ============================================================================
// User Role Assignment Operations
// ============================================================================

/**
 * Get users assigned to a role
 */
export async function getRoleUsers(roleId: string) {
  return prisma.userRoleAssignment.findMany({
    where: { roleId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
  });
}

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  companyId?: string
): Promise<void> {
  // Check if assignment already exists
  const existing = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      roleId,
      companyId: companyId || null,
    },
  });

  if (existing) {
    throw new Error('User already has this role assignment');
  }

  await prisma.userRoleAssignment.create({
    data: {
      userId,
      roleId,
      companyId,
    },
  });
}

/**
 * Remove a role from a user
 */
export async function removeRoleFromUser(
  userId: string,
  roleId: string,
  companyId?: string
): Promise<void> {
  await prisma.userRoleAssignment.deleteMany({
    where: {
      userId,
      roleId,
      companyId: companyId || null,
    },
  });
}

/**
 * Get all role assignments for a user
 */
export async function getUserRoles(userId: string) {
  return prisma.userRoleAssignment.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
  });
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that permission IDs exist
 */
export async function validatePermissionIds(permissionIds: string[]): Promise<boolean> {
  if (permissionIds.length === 0) return true;

  const count = await prisma.permission.count({
    where: {
      id: { in: permissionIds },
    },
  });

  return count === permissionIds.length;
}

/**
 * Check if a role belongs to a tenant
 */
export async function roleBelongsToTenant(roleId: string, tenantId: string): Promise<boolean> {
  const role = await prisma.role.findFirst({
    where: {
      id: roleId,
      tenantId,
    },
  });

  return !!role;
}
