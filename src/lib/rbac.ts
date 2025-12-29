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
  'connector',
  'chart_of_accounts',
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
      'connector:create',
      'connector:read',
      'connector:update',
      'connector:delete',
      'chart_of_accounts:create',
      'chart_of_accounts:read',
      'chart_of_accounts:update',
      'chart_of_accounts:delete',
      'chart_of_accounts:export',
      'chart_of_accounts:import',
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
      'chart_of_accounts:read',
      'chart_of_accounts:update',
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
      'chart_of_accounts:read',
    ] as PermissionString[],
  },
} as const;

export type SystemRoleName = keyof typeof SYSTEM_ROLES;

/**
 * Default custom roles created for every new tenant
 * These can be modified or deleted by tenant admins
 */
export const DEFAULT_CUSTOM_ROLES = [
  {
    name: 'Auditor',
    description: 'Read-only access to audit logs, companies, and documents for compliance review',
    permissions: [
      'company:read',
      'contact:read',
      'document:read',
      'officer:read',
      'shareholder:read',
      'audit_log:read',
      'audit_log:export',
    ] as PermissionString[],
  },
  {
    name: 'Data Entry Clerk',
    description: 'Create and update companies and contacts, but cannot delete or export',
    permissions: [
      'company:create', 'company:read', 'company:update',
      'contact:create', 'contact:read', 'contact:update',
      'document:create', 'document:read', 'document:update',
      'officer:create', 'officer:read', 'officer:update',
      'shareholder:create', 'shareholder:read', 'shareholder:update',
    ] as PermissionString[],
  },
  {
    name: 'Report Viewer',
    description: 'View and export data for reporting purposes',
    permissions: [
      'company:read', 'company:export',
      'contact:read', 'contact:export',
      'document:read', 'document:export',
      'officer:read', 'officer:export',
      'shareholder:read', 'shareholder:export',
      'audit_log:read', 'audit_log:export',
    ] as PermissionString[],
  },
  {
    name: 'Document Manager',
    description: 'Full document management with read-only access to company data',
    permissions: [
      'company:read',
      'contact:read',
      'document:create', 'document:read', 'document:update', 'document:delete', 'document:export', 'document:manage',
      'officer:read',
      'shareholder:read',
    ] as PermissionString[],
  },
  {
    name: 'Manager',
    description: 'Full access to company data including delete, but no user or role management',
    permissions: [
      'company:create', 'company:read', 'company:update', 'company:delete', 'company:export',
      'contact:create', 'contact:read', 'contact:update', 'contact:delete', 'contact:export',
      'document:create', 'document:read', 'document:update', 'document:delete', 'document:export',
      'officer:create', 'officer:read', 'officer:update', 'officer:delete', 'officer:export',
      'shareholder:create', 'shareholder:read', 'shareholder:update', 'shareholder:delete', 'shareholder:export',
      'audit_log:read', 'audit_log:export',
    ] as PermissionString[],
  },
] as const;

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if user has a specific permission
 *
 * Permission Resolution (Specificity Priority):
 * 1. If companyId provided, look for role assignment specific to that company
 * 2. If no company-specific role, fall back to tenant-wide role (companyId = null)
 * 3. Company-specific roles OVERRIDE tenant-wide roles (not combined)
 *
 * Special cases:
 * - SUPER_ADMIN (systemRoleType): Has all permissions everywhere
 * - TENANT_ADMIN (systemRoleType): Has all permissions within their tenant
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

  // Check for system role types via role assignments
  const hasSuperAdminRole = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const hasTenantAdminRole = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  // SUPER_ADMIN has all permissions everywhere
  if (hasSuperAdminRole) {
    return true;
  }

  // TENANT_ADMIN has all permissions within their tenant
  if (hasTenantAdminRole) {
    // If checking for a specific company, verify it belongs to user's tenant
    if (companyId && user.tenantId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { tenantId: true },
      });
      if (!company || company.tenantId !== user.tenantId) {
        return false;
      }
    }
    return true;
  }

  // Get effective role assignments using specificity priority
  const effectiveAssignments = getEffectiveRoleAssignments(user.roleAssignments, companyId);

  // Check if any effective role has the required permission
  for (const assignment of effectiveAssignments) {
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
 * Get effective role assignments based on specificity
 * Company-specific roles override tenant-wide roles
 *
 * Resolution logic:
 * - If no companyId: Return ALL roles (tenant-wide + company-specific)
 *   This allows checking "does user have this permission anywhere?"
 * - If specific companyId: Use specificity rules
 *   1. Company-specific roles for that company override tenant-wide
 *   2. If no company-specific roles, fall back to tenant-wide
 */
function getEffectiveRoleAssignments<T extends { companyId: string | null }>(
  assignments: T[],
  companyId?: string
): T[] {
  if (!companyId) {
    // No specific company - return ALL roles (tenant-wide + company-specific)
    // This handles cases like "can this user read companies?" where we want
    // to know if they have the permission via ANY of their role assignments
    return assignments;
  }

  // Check if there are company-specific roles for the given company
  const companySpecific = assignments.filter(a => a.companyId === companyId);

  if (companySpecific.length > 0) {
    // Use ONLY company-specific roles (override behavior)
    return companySpecific;
  }

  // Fall back to tenant-wide roles
  return assignments.filter(a => a.companyId === null);
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
 * Uses the same specificity-based resolution as hasPermission
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

  // Check for system role types via role assignments
  const hasSuperAdminRole = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const hasTenantAdminRole = user.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  // SUPER_ADMIN and TENANT_ADMIN have all permissions
  if (hasSuperAdminRole || hasTenantAdminRole) {
    const allPermissions: PermissionString[] = [];
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        allPermissions.push(`${resource}:${action}`);
      }
    }
    return allPermissions;
  }

  // Get effective role assignments using specificity priority
  const effectiveAssignments = getEffectiveRoleAssignments(user.roleAssignments, companyId);

  const permissions = new Set<PermissionString>();

  for (const assignment of effectiveAssignments) {
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
 * Uses computed flags from session (derived from role assignments)
 */
export async function requirePermission(
  session: SessionUser,
  resource: Resource,
  action: Action,
  companyId?: string
): Promise<void> {
  // SUPER_ADMIN bypasses all permission checks
  if (session.isSuperAdmin) {
    return;
  }

  // TENANT_ADMIN has full access within their tenant
  if (session.isTenantAdmin) {
    return;
  }

  const granted = await hasPermission(session.id, resource, action, companyId);

  if (!granted) {
    throw new Error(`Permission denied: ${resource}:${action}`);
  }
}

/**
 * Require any of the specified permissions - throws if none granted
 * Uses computed flags from session (derived from role assignments)
 */
export async function requireAnyPermission(
  session: SessionUser,
  permissions: Array<{ resource: Resource; action: Action }>,
  companyId?: string
): Promise<void> {
  // SUPER_ADMIN and TENANT_ADMIN bypass all permission checks
  if (session.isSuperAdmin || session.isTenantAdmin) {
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
 * @param companyId - If null/undefined, the role applies to "All Companies" (tenant-wide)
 *                   If a company ID, the role only applies to that specific company
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  companyId?: string | null
): Promise<void> {
  await prisma.userRoleAssignment.create({
    data: {
      userId,
      roleId,
      companyId: companyId || null, // Explicitly set to null for "All Companies"
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

    // Create role with systemRoleType for proper auth checks
    const role = await prisma.role.create({
      data: {
        tenantId,
        name: roleConfig.name,
        description: roleConfig.description,
        isSystem: true,
        systemRoleType: roleKey, // e.g., 'TENANT_ADMIN', 'COMPANY_ADMIN', 'COMPANY_USER'
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

  // Create default custom roles
  await createDefaultCustomRolesForTenant(tenantId, permissionMap);
}

/**
 * Create default custom roles for a tenant
 * These are non-system roles that can be modified or deleted
 */
export async function createDefaultCustomRolesForTenant(
  tenantId: string,
  permissionMap?: Map<string, string>
): Promise<void> {
  // Get permission map if not provided
  if (!permissionMap) {
    const allPermissions = await prisma.permission.findMany();
    permissionMap = new Map(
      allPermissions.map((p) => [`${p.resource}:${p.action}`, p.id])
    );
  }

  // Create each default custom role
  for (const roleConfig of DEFAULT_CUSTOM_ROLES) {
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

    // Create role (not a system role - can be modified/deleted)
    const role = await prisma.role.create({
      data: {
        tenantId,
        name: roleConfig.name,
        description: roleConfig.description,
        isSystem: false,
      },
    });

    // Assign permissions to role
    const rolePermissions = roleConfig.permissions
      .map((permStr) => permissionMap!.get(permStr))
      .filter((id): id is string => id !== undefined);

    if (rolePermissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: rolePermissions.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }
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
 * Uses computed flags from session
 */
export function canReadCompanies(session: SessionUser): boolean {
  // Super admin and tenant admin can always read
  if (session.isSuperAdmin || session.isTenantAdmin) return true;
  // All authenticated users can read companies (via role assignments for specific permissions)
  return true;
}

/**
 * Check if user can create companies in tenant
 * Uses computed flags from session
 */
export function canCreateCompanies(session: SessionUser): boolean {
  return session.isSuperAdmin || session.isTenantAdmin;
}

/**
 * Check if user can manage users in tenant
 * Uses computed flags from session
 */
export function canManageUsers(session: SessionUser): boolean {
  return session.isSuperAdmin || session.isTenantAdmin;
}

/**
 * Check if user can manage roles in tenant
 * Uses computed flags from session
 */
export function canManageRoles(session: SessionUser): boolean {
  return session.isSuperAdmin || session.isTenantAdmin;
}

/**
 * Check if user can access audit logs
 * Uses computed flags from session
 *
 * Only admins can access audit logs by default.
 * Regular users need explicit audit_log:read permission.
 */
export function canAccessAuditLogs(session: SessionUser): boolean {
  // Super admin and tenant admin can always access
  if (session.isSuperAdmin || session.isTenantAdmin) return true;
  // Regular users need explicit permission - this should be checked via hasPermission
  // in the calling code for more granular control
  return false;
}

/**
 * Check if user can export data
 * Uses computed flags from session
 */
export function canExportData(session: SessionUser): boolean {
  // Super admin and tenant admin can always export
  if (session.isSuperAdmin || session.isTenantAdmin) return true;
  // Other users need specific permissions (checked via hasPermission)
  return false;
}
