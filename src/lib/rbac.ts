/**
 * Role-Based Access Control (RBAC) Utilities
 *
 * Provides permission checking and role management utilities
 * for fine-grained access control across the application.
 */

import { prisma } from './prisma';
import type { SessionUser } from './auth';

// ============================================================================
// Permission Definitions
// ============================================================================

/**
 * All available resources in the system
 */
export const RESOURCES = [
  'tenant',
  'user',
  'role',
  'company',
  'contact',
  'document',
  'officer',
  'shareholder',
  'audit_log',
] as const;

export type Resource = (typeof RESOURCES)[number];

/**
 * All available actions for resources
 */
export const ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
  'export',
  'import',
  'manage', // Full control including admin actions
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Permission string format: "resource:action"
 */
export type PermissionString = `${Resource}:${Action}`;

/**
 * Default system roles with their permissions
 */
export const SYSTEM_ROLES = {
  TENANT_ADMIN: {
    name: 'Tenant Admin',
    description: 'Full access to all tenant resources',
    permissions: [
      'tenant:read',
      'tenant:update',
      'user:create',
      'user:read',
      'user:update',
      'user:delete',
      'role:create',
      'role:read',
      'role:update',
      'role:delete',
      'company:create',
      'company:read',
      'company:update',
      'company:delete',
      'company:export',
      'company:import',
      'contact:create',
      'contact:read',
      'contact:update',
      'contact:delete',
      'document:create',
      'document:read',
      'document:update',
      'document:delete',
      'document:export',
      'officer:create',
      'officer:read',
      'officer:update',
      'officer:delete',
      'shareholder:create',
      'shareholder:read',
      'shareholder:update',
      'shareholder:delete',
      'audit_log:read',
      'audit_log:export',
    ] as PermissionString[],
  },
  COMPANY_ADMIN: {
    name: 'Company Admin',
    description: 'Manage assigned company and its data',
    permissions: [
      'company:read',
      'company:update',
      'company:export',
      'contact:create',
      'contact:read',
      'contact:update',
      'document:create',
      'document:read',
      'document:update',
      'document:delete',
      'officer:create',
      'officer:read',
      'officer:update',
      'officer:delete',
      'shareholder:create',
      'shareholder:read',
      'shareholder:update',
      'shareholder:delete',
      'audit_log:read',
    ] as PermissionString[],
  },
  COMPANY_USER: {
    name: 'Company User',
    description: 'View-only access to assigned company',
    permissions: [
      'company:read',
      'contact:read',
      'document:read',
      'officer:read',
      'shareholder:read',
      'audit_log:read',
    ] as PermissionString[],
  },
} as const;

export type SystemRoleName = keyof typeof SYSTEM_ROLES;

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if user has a specific permission
 */
export async function hasPermission(
  userId: string,
  resource: Resource,
  action: Action,
  companyId?: string
): Promise<boolean> {
  // Get user with role assignments
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
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
        },
      },
    },
  });

  if (!user || user.deletedAt || !user.isActive) {
    return false;
  }

  // SUPER_ADMIN has all permissions
  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  // Check role assignments for the permission
  for (const assignment of user.roleAssignments) {
    // Check if assignment is scoped to a specific company
    if (companyId && assignment.companyId && assignment.companyId !== companyId) {
      continue; // Skip this role assignment if company doesn't match
    }

    // Check if role has the required permission
    const hasMatch = assignment.role.permissions.some(
      (rp) =>
        rp.permission.resource === resource &&
        (rp.permission.action === action || rp.permission.action === 'manage')
    );

    if (hasMatch) {
      return true;
    }
  }

  return false;
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissions: Array<{ resource: Resource; action: Action }>,
  companyId?: string
): Promise<boolean> {
  for (const { resource, action } of permissions) {
    if (await hasPermission(userId, resource, action, companyId)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: string,
  permissions: Array<{ resource: Resource; action: Action }>,
  companyId?: string
): Promise<boolean> {
  for (const { resource, action } of permissions) {
    if (!(await hasPermission(userId, resource, action, companyId))) {
      return false;
    }
  }
  return true;
}

/**
 * Get all permissions for a user
 */
export async function getUserPermissions(
  userId: string,
  companyId?: string
): Promise<PermissionString[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleAssignments: {
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
        },
      },
    },
  });

  if (!user || user.deletedAt || !user.isActive) {
    return [];
  }

  // SUPER_ADMIN has all permissions
  if (user.role === 'SUPER_ADMIN') {
    const allPermissions: PermissionString[] = [];
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        allPermissions.push(`${resource}:${action}`);
      }
    }
    return allPermissions;
  }

  const permissions = new Set<PermissionString>();

  for (const assignment of user.roleAssignments) {
    // Filter by company scope if specified
    if (companyId && assignment.companyId && assignment.companyId !== companyId) {
      continue;
    }

    for (const rp of assignment.role.permissions) {
      permissions.add(`${rp.permission.resource}:${rp.permission.action}` as PermissionString);
    }
  }

  return Array.from(permissions);
}

// ============================================================================
// Permission Enforcement
// ============================================================================

/**
 * Require a specific permission - throws if not granted
 */
export async function requirePermission(
  session: SessionUser,
  resource: Resource,
  action: Action,
  companyId?: string
): Promise<void> {
  // SUPER_ADMIN bypasses all permission checks
  if (session.role === 'SUPER_ADMIN') {
    return;
  }

  const granted = await hasPermission(session.id, resource, action, companyId);

  if (!granted) {
    throw new Error(`Permission denied: ${resource}:${action}`);
  }
}

/**
 * Require any of the specified permissions - throws if none granted
 */
export async function requireAnyPermission(
  session: SessionUser,
  permissions: Array<{ resource: Resource; action: Action }>,
  companyId?: string
): Promise<void> {
  if (session.role === 'SUPER_ADMIN') {
    return;
  }

  const granted = await hasAnyPermission(session.id, permissions, companyId);

  if (!granted) {
    const permStr = permissions.map((p) => `${p.resource}:${p.action}`).join(', ');
    throw new Error(`Permission denied: requires one of [${permStr}]`);
  }
}

// ============================================================================
// Role Management
// ============================================================================

/**
 * Get all roles for a tenant
 */
export async function getTenantRoles(tenantId: string) {
  return prisma.role.findMany({
    where: { tenantId },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
      _count: {
        select: {
          users: true,
        },
      },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

/**
 * Get user's role assignments
 */
export async function getUserRoleAssignments(userId: string) {
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

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  companyId?: string
): Promise<void> {
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

// ============================================================================
// System Role Initialization
// ============================================================================

/**
 * Initialize system permissions in the database
 * Should be called during database seeding
 */
export async function initializePermissions(): Promise<void> {
  const permissionData: Array<{ resource: string; action: string; description: string }> = [];

  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      permissionData.push({
        resource,
        action,
        description: `${action} ${resource}`,
      });
    }
  }

  // Upsert all permissions
  for (const perm of permissionData) {
    await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: perm.resource,
          action: perm.action,
        },
      },
      create: perm,
      update: { description: perm.description },
    });
  }
}

/**
 * Create system roles for a tenant
 * Should be called when a new tenant is created
 */
export async function createSystemRolesForTenant(tenantId: string): Promise<void> {
  // Get all permissions
  const allPermissions = await prisma.permission.findMany();
  const permissionMap = new Map(
    allPermissions.map((p) => [`${p.resource}:${p.action}`, p.id])
  );

  // Create each system role
  for (const [roleKey, roleConfig] of Object.entries(SYSTEM_ROLES)) {
    // Check if role already exists
    const existing = await prisma.role.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: roleConfig.name,
        },
      },
    });

    if (existing) continue;

    // Create role
    const role = await prisma.role.create({
      data: {
        tenantId,
        name: roleConfig.name,
        description: roleConfig.description,
        isSystem: true,
      },
    });

    // Assign permissions to role
    const rolePermissions = roleConfig.permissions
      .map((permStr) => permissionMap.get(permStr))
      .filter((id): id is string => id !== undefined);

    await prisma.rolePermission.createMany({
      data: rolePermissions.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });
  }
}

/**
 * Get the system role ID for a tenant by role type
 */
export async function getSystemRoleId(
  tenantId: string,
  roleType: SystemRoleName
): Promise<string | null> {
  const roleName = SYSTEM_ROLES[roleType].name;

  const role = await prisma.role.findUnique({
    where: {
      tenantId_name: {
        tenantId,
        name: roleName,
      },
    },
  });

  return role?.id || null;
}

// ============================================================================
// Permission Helpers for Common Operations
// ============================================================================

/**
 * Check if user can read companies in tenant
 */
export function canReadCompanies(session: SessionUser): boolean {
  return ['SUPER_ADMIN', 'TENANT_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER'].includes(session.role);
}

/**
 * Check if user can create companies in tenant
 */
export function canCreateCompanies(session: SessionUser): boolean {
  return ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role);
}

/**
 * Check if user can manage users in tenant
 */
export function canManageUsers(session: SessionUser): boolean {
  return ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role);
}

/**
 * Check if user can manage roles in tenant
 */
export function canManageRoles(session: SessionUser): boolean {
  return ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(session.role);
}

/**
 * Check if user can access audit logs
 */
export function canAccessAuditLogs(session: SessionUser): boolean {
  return ['SUPER_ADMIN', 'TENANT_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER'].includes(session.role);
}

/**
 * Check if user can export data
 */
export function canExportData(session: SessionUser): boolean {
  return ['SUPER_ADMIN', 'TENANT_ADMIN', 'COMPANY_ADMIN'].includes(session.role);
}
