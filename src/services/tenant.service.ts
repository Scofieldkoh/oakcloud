/**
 * Tenant Service
 *
 * Business logic for tenant management including CRUD operations,
 * user management within tenants, and tenant-level operations.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { TenantStatus } from '@prisma/client';
import {
  createAuditLog,
  computeChanges,
  logTenantOperation,
  logUserMembership,
  logRoleChange,
  type AuditContext,
} from '@/lib/audit';
import { generateTenantSlug, getTenantLimits } from '@/lib/tenant';
import {
  createSystemRolesForTenant,
  getSystemRoleId,
  assignRoleToUser,
  type SystemRoleName,
} from '@/lib/rbac';
import type {
  CreateTenantInput,
  UpdateTenantInput,
  TenantSearchInput,
  InviteUserInput,
  TenantSettingsInput,
} from '@/lib/validations/tenant';
import bcrypt from 'bcryptjs';

// ============================================================================
// Types
// ============================================================================

export interface TenantWithStats {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  contactEmail: string | null;
  createdAt: Date;
  _count: {
    users: number;
    companies: number;
  };
}

// Fields tracked for audit logging
const TRACKED_FIELDS: (keyof UpdateTenantInput)[] = [
  'name',
  'slug',
  'contactEmail',
  'contactPhone',
  'maxUsers',
  'maxCompanies',
  'maxStorageMb',
  'logoUrl',
  'primaryColor',
];

// ============================================================================
// Create Tenant
// ============================================================================

export async function createTenant(
  data: CreateTenantInput,
  userId?: string
) {
  // Generate slug if not provided
  const slug = data.slug || (await generateTenantSlug(data.name));

  // Check slug uniqueness
  const existing = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existing) {
    throw new Error('Tenant slug already exists');
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: data.name,
      slug,
      status: 'PENDING_SETUP',
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      maxUsers: data.maxUsers || 50,
      maxCompanies: data.maxCompanies || 100,
      maxStorageMb: data.maxStorageMb || 10240,
      logoUrl: data.logoUrl,
      primaryColor: data.primaryColor || '#294d44',
      settings: data.settings ? (data.settings as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  // Log tenant creation
  await logTenantOperation('TENANT_CREATED', tenant.id, tenant.name, userId, undefined, undefined);

  // Initialize system roles for the new tenant
  await createSystemRolesForTenant(tenant.id);

  return tenant;
}

// ============================================================================
// Get Tenant
// ============================================================================

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: {
          users: { where: { deletedAt: null, isActive: true } },
          companies: { where: { deletedAt: null } },
          documents: true,
        },
      },
    },
  });
}

export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug, deletedAt: null },
    include: {
      _count: {
        select: {
          users: { where: { deletedAt: null, isActive: true } },
          companies: { where: { deletedAt: null } },
        },
      },
    },
  });
}

// ============================================================================
// Update Tenant
// ============================================================================

export async function updateTenant(
  data: UpdateTenantInput,
  userId?: string,
  reason?: string
) {
  const { id, ...updateData } = data;

  // Get existing tenant
  const existing = await prisma.tenant.findUnique({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Tenant not found');
  }

  // Check slug uniqueness if being updated
  if (updateData.slug && updateData.slug !== existing.slug) {
    const slugExists = await prisma.tenant.findUnique({
      where: { slug: updateData.slug },
    });
    if (slugExists) {
      throw new Error('Tenant slug already exists');
    }
  }

  // Update tenant
  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...updateData,
      settings: updateData.settings
        ? (updateData.settings as Prisma.InputJsonValue)
        : undefined,
    },
  });

  // Compute and log changes
  const changes = computeChanges(
    existing as unknown as Record<string, unknown>,
    updateData as Record<string, unknown>,
    TRACKED_FIELDS as string[]
  );

  if (changes) {
    await logTenantOperation('TENANT_UPDATED', tenant.id, tenant.name, userId, changes, reason);
  }

  return tenant;
}

// ============================================================================
// Update Tenant Status
// ============================================================================

export async function updateTenantStatus(
  id: string,
  status: TenantStatus,
  userId?: string,
  reason?: string
) {
  const existing = await prisma.tenant.findUnique({
    where: { id, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Tenant not found');
  }

  const oldStatus = existing.status;

  const updateData: Prisma.TenantUpdateInput = {
    status,
  };

  // Set timestamps based on status change
  if (status === 'ACTIVE' && oldStatus !== 'ACTIVE') {
    updateData.activatedAt = new Date();
    updateData.suspendedAt = null;
    updateData.suspendReason = null;
  } else if (status === 'SUSPENDED') {
    updateData.suspendedAt = new Date();
    updateData.suspendReason = reason;
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: updateData,
  });

  // Log status change
  const action = status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED';
  await logTenantOperation(
    action,
    tenant.id,
    tenant.name,
    userId,
    { status: { old: oldStatus, new: status } },
    reason
  );

  return tenant;
}

// ============================================================================
// Search Tenants
// ============================================================================

export async function searchTenants(params: TenantSearchInput) {
  const where: Prisma.TenantWhereInput = {
    deletedAt: null,
    ...(params.query && {
      OR: [
        { name: { contains: params.query, mode: 'insensitive' } },
        { slug: { contains: params.query, mode: 'insensitive' } },
        { contactEmail: { contains: params.query, mode: 'insensitive' } },
      ],
    }),
    ...(params.status && { status: params.status }),
  };

  const orderBy: Prisma.TenantOrderByWithRelationInput = {
    [params.sortBy]: params.sortOrder,
  };

  const [tenants, totalCount] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null, isActive: true } },
            companies: { where: { deletedAt: null } },
          },
        },
      },
      orderBy,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    tenants,
    totalCount,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(totalCount / params.limit),
  };
}

// ============================================================================
// Delete Tenant (Soft Delete with Cascade)
// ============================================================================

export async function deleteTenant(
  id: string,
  userId: string,
  reason: string
) {
  const existing = await prisma.tenant.findUnique({
    where: { id, deletedAt: null },
    include: {
      _count: {
        select: {
          users: { where: { deletedAt: null } },
          companies: { where: { deletedAt: null } },
          contacts: { where: { deletedAt: null } },
        },
      },
    },
  });

  if (!existing) {
    throw new Error('Tenant not found');
  }

  // Only allow deletion when tenant is SUSPENDED or PENDING_SETUP
  if (existing.status !== 'SUSPENDED' && existing.status !== 'PENDING_SETUP') {
    throw new Error('Tenant must be suspended or pending setup before it can be deleted');
  }

  const deletedAt = new Date();

  // Cascade soft-delete in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Soft-delete all users belonging to this tenant
    const usersDeleted = await tx.user.updateMany({
      where: { tenantId: id, deletedAt: null },
      data: { deletedAt, isActive: false },
    });

    // Soft-delete all companies belonging to this tenant
    const companiesDeleted = await tx.company.updateMany({
      where: { tenantId: id, deletedAt: null },
      data: { deletedAt, deletedReason: `Tenant deleted: ${reason}` },
    });

    // Soft-delete all contacts belonging to this tenant
    const contactsDeleted = await tx.contact.updateMany({
      where: { tenantId: id, deletedAt: null },
      data: { deletedAt },
    });

    // Soft-delete the tenant itself
    const tenant = await tx.tenant.update({
      where: { id },
      data: {
        deletedAt,
        deletedReason: reason,
        status: 'DEACTIVATED',
      },
    });

    return {
      tenant,
      usersDeleted: usersDeleted.count,
      companiesDeleted: companiesDeleted.count,
      contactsDeleted: contactsDeleted.count,
    };
  });

  // Log deletion with cascade info
  const cascadeInfo = [];
  if (result.usersDeleted > 0) cascadeInfo.push(`${result.usersDeleted} users`);
  if (result.companiesDeleted > 0) cascadeInfo.push(`${result.companiesDeleted} companies`);
  if (result.contactsDeleted > 0) cascadeInfo.push(`${result.contactsDeleted} contacts`);
  const cascadeSummary = cascadeInfo.length > 0 ? ` (cascade: ${cascadeInfo.join(', ')})` : '';

  await createAuditLog({
    tenantId: result.tenant.id,
    userId,
    action: 'DELETE',
    entityType: 'Tenant',
    entityId: result.tenant.id,
    entityName: result.tenant.name,
    summary: `Deleted tenant "${result.tenant.name}"${cascadeSummary}`,
    changeSource: 'MANUAL',
    reason,
    metadata: {
      name: result.tenant.name,
      slug: result.tenant.slug,
      cascade: {
        usersDeleted: result.usersDeleted,
        companiesDeleted: result.companiesDeleted,
        contactsDeleted: result.contactsDeleted,
      },
    },
  });

  return result.tenant;
}

// ============================================================================
// Tenant User Management
// ============================================================================

export async function inviteUserToTenant(
  tenantId: string,
  data: InviteUserInput,
  invitedByUserId: string
) {
  // Check tenant limits
  const limits = await getTenantLimits(tenantId);
  if (limits.currentUsers >= limits.maxUsers) {
    throw new Error(`Tenant has reached the maximum number of users (${limits.maxUsers})`);
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error('A user with this email already exists');
  }

  // Validate company belongs to tenant if provided
  if (data.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: data.companyId, tenantId, deletedAt: null },
    });
    if (!company) {
      throw new Error('Company not found in this tenant');
    }
  }

  // Validate all company assignments belong to tenant
  if (data.companyAssignments && data.companyAssignments.length > 0) {
    const companyIds = data.companyAssignments.map((a) => a.companyId);
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds }, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (companies.length !== companyIds.length) {
      throw new Error('One or more companies not found in this tenant');
    }
  }

  // Validate all role assignments have valid roles
  if (data.roleAssignments && data.roleAssignments.length > 0) {
    const roleIds = data.roleAssignments.map((a) => a.roleId);
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds }, tenantId },
      select: { id: true },
    });
    if (roles.length !== roleIds.length) {
      throw new Error('One or more roles not found in this tenant');
    }

    // Validate company-scoped role assignments reference valid companies
    const companyIdsInRoles = data.roleAssignments
      .filter((a) => a.companyId)
      .map((a) => a.companyId as string);
    if (companyIdsInRoles.length > 0) {
      const companiesForRoles = await prisma.company.findMany({
        where: { id: { in: companyIdsInRoles }, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (companiesForRoles.length !== companyIdsInRoles.length) {
        throw new Error('One or more companies in role assignments not found in this tenant');
      }
    }
  }

  // Generate temporary password (should be changed on first login)
  const tempPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Determine primary company ID
  const primaryCompanyId = data.companyAssignments?.find((a) => a.isPrimary)?.companyId
    || data.companyAssignments?.[0]?.companyId
    || data.companyId;

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      firstName: data.firstName,
      lastName: data.lastName,
      passwordHash,
      role: data.role,
      tenantId,
      companyId: primaryCompanyId,
      isActive: true,
      mustChangePassword: true, // Force password change on first login
    },
  });

  // Create company assignments if provided (just tracks which companies user can access)
  if (data.companyAssignments && data.companyAssignments.length > 0) {
    await prisma.userCompanyAssignment.createMany({
      data: data.companyAssignments.map((assignment, index) => ({
        userId: user.id,
        companyId: assignment.companyId,
        isPrimary: assignment.isPrimary ?? (index === 0),
      })),
    });
  } else if (data.companyId) {
    // Create a single assignment for the primary company
    await prisma.userCompanyAssignment.create({
      data: {
        userId: user.id,
        companyId: data.companyId,
        isPrimary: true,
      },
    });
  }

  // Handle role assignments
  if (data.roleAssignments && data.roleAssignments.length > 0) {
    // Use custom role assignments provided
    await prisma.userRoleAssignment.createMany({
      data: data.roleAssignments.map((assignment) => ({
        userId: user.id,
        roleId: assignment.roleId,
        companyId: assignment.companyId || null, // null = "All Companies"
      })),
    });
  } else {
    // Default: Assign system role based on user role (tenant-wide)
    const roleMapping: Record<string, SystemRoleName> = {
      TENANT_ADMIN: 'TENANT_ADMIN',
      COMPANY_ADMIN: 'COMPANY_ADMIN',
      COMPANY_USER: 'COMPANY_USER',
    };

    const systemRoleName = roleMapping[data.role];
    if (systemRoleName) {
      const roleId = await getSystemRoleId(tenantId, systemRoleName);
      if (roleId) {
        // TENANT_ADMIN gets tenant-wide role (no company scope)
        // Others get tenant-wide role too (can be overridden per company later)
        await assignRoleToUser(user.id, roleId, null);
      }
    }
  }

  // Log user invitation
  const auditContext: AuditContext = {
    tenantId,
    userId: invitedByUserId,
  };

  await logUserMembership(auditContext, 'USER_INVITED', user.id, {
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    companyAssignments: data.companyAssignments?.length || (data.companyId ? 1 : 0),
    roleAssignments: data.roleAssignments?.length || 1,
  });

  // Return user without exposing temp password in response
  // In production, you'd send an email with the temp password
  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    // Only for development/testing - remove in production
    temporaryPassword: process.env.NODE_ENV === 'development' ? tempPassword : undefined,
  };
}

export async function removeUserFromTenant(
  tenantId: string,
  userId: string,
  removedByUserId: string,
  reason: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId, tenantId, deletedAt: null },
  });

  if (!user) {
    throw new Error('User not found in this tenant');
  }

  // Prevent removing the last tenant admin
  if (user.role === 'TENANT_ADMIN') {
    const adminCount = await prisma.user.count({
      where: {
        tenantId,
        role: 'TENANT_ADMIN',
        deletedAt: null,
        isActive: true,
      },
    });

    if (adminCount <= 1) {
      throw new Error('Cannot remove the last tenant administrator');
    }
  }

  // Soft delete the user
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });

  // Log user removal
  const auditContext: AuditContext = {
    tenantId,
    userId: removedByUserId,
  };

  await logUserMembership(auditContext, 'USER_REMOVED', userId, {
    email: user.email,
    role: user.role,
    reason,
  });

  return { success: true };
}

export async function updateUserRole(
  tenantId: string,
  userId: string,
  newRole: 'TENANT_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_USER',
  updatedByUserId: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId, tenantId, deletedAt: null },
  });

  if (!user) {
    throw new Error('User not found in this tenant');
  }

  const oldRole = user.role;

  // Prevent demoting the last tenant admin
  if (oldRole === 'TENANT_ADMIN' && newRole !== 'TENANT_ADMIN') {
    const adminCount = await prisma.user.count({
      where: {
        tenantId,
        role: 'TENANT_ADMIN',
        deletedAt: null,
        isActive: true,
      },
    });

    if (adminCount <= 1) {
      throw new Error('Cannot demote the last tenant administrator');
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  });

  // Log role change
  const auditContext: AuditContext = {
    tenantId,
    userId: updatedByUserId,
  };
  const userName = `${user.firstName} ${user.lastName}`.trim() || user.email;

  await logRoleChange(auditContext, userId, userName, oldRole, newRole);

  return { success: true, oldRole, newRole };
}

// ============================================================================
// Tenant Settings
// ============================================================================

export async function updateTenantSettings(
  tenantId: string,
  settings: TenantSettingsInput,
  userId: string
) {
  const existing = await prisma.tenant.findUnique({
    where: { id: tenantId, deletedAt: null },
    select: { settings: true },
  });

  if (!existing) {
    throw new Error('Tenant not found');
  }

  const currentSettings = (existing.settings as Record<string, unknown>) || {};
  const newSettings = { ...currentSettings, ...settings };

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: newSettings as Prisma.InputJsonValue,
    },
  });

  // Log settings update
  await createAuditLog({
    tenantId,
    userId,
    action: 'UPDATE',
    entityType: 'TenantSettings',
    entityId: tenantId,
    changeSource: 'MANUAL',
    changes: { settings: { old: currentSettings, new: newSettings } },
  });

  return tenant;
}

// ============================================================================
// Tenant Statistics
// ============================================================================

export async function getTenantStats(tenantId: string) {
  const [
    userStats,
    companyStats,
    documentStats,
    storageUsage,
    recentActivity,
  ] = await Promise.all([
    // User statistics
    prisma.user.groupBy({
      by: ['role'],
      where: { tenantId, deletedAt: null, isActive: true },
      _count: true,
    }),

    // Company statistics
    prisma.company.groupBy({
      by: ['status'],
      where: { tenantId, deletedAt: null },
      _count: true,
    }),

    // Document statistics
    prisma.document.groupBy({
      by: ['documentType'],
      where: { tenantId },
      _count: true,
    }),

    // Storage usage
    prisma.document.aggregate({
      where: { tenantId },
      _sum: { fileSize: true },
    }),

    // Recent activity (last 30 days)
    prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const limits = await getTenantLimits(tenantId);

  return {
    users: {
      total: limits.currentUsers,
      max: limits.maxUsers,
      byRole: userStats.map((s) => ({ role: s.role, count: s._count })),
    },
    companies: {
      total: limits.currentCompanies,
      max: limits.maxCompanies,
      byStatus: companyStats.map((s) => ({ status: s.status, count: s._count })),
    },
    documents: {
      byType: documentStats.map((s) => ({ type: s.documentType, count: s._count })),
    },
    storage: {
      usedMb: limits.currentStorageMb,
      maxMb: limits.maxStorageMb,
      usedBytes: storageUsage._sum.fileSize || 0,
    },
    activity: {
      last30Days: recentActivity,
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ============================================================================
// Complete Tenant Setup (Wizard)
// ============================================================================

export interface TenantSetupData {
  tenantInfo?: {
    name?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  adminUser: {
    email: string;
    firstName: string;
    lastName: string;
  };
  firstCompany?: {
    uen: string;
    name: string;
    entityType?: string;
  } | null;
}

export interface TenantSetupResult {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: TenantStatus;
  };
  adminUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword?: string;
  };
  company?: {
    id: string;
    uen: string;
    name: string;
  } | null;
}

/**
 * Complete tenant setup wizard - creates admin user, optionally creates first company,
 * and activates the tenant in a single operation.
 */
export async function completeTenantSetup(
  tenantId: string,
  data: TenantSetupData,
  performedByUserId: string
): Promise<TenantSetupResult> {
  // Validate tenant exists and is in PENDING_SETUP status
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId, deletedAt: null },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  if (tenant.status !== 'PENDING_SETUP') {
    throw new Error(`Cannot complete setup for tenant with status: ${tenant.status}`);
  }

  // Check if admin email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.adminUser.email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error('A user with this email already exists');
  }

  // Check if company UEN already exists (if company provided)
  if (data.firstCompany) {
    const existingCompany = await prisma.company.findFirst({
      where: {
        uen: data.firstCompany.uen,
        tenantId,
        deletedAt: null,
      },
    });

    if (existingCompany) {
      throw new Error('A company with this UEN already exists in this tenant');
    }
  }

  // Generate temporary password for admin user
  const tempPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Execute all operations in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Update tenant info if provided
    let updatedTenant = tenant;
    if (data.tenantInfo && Object.keys(data.tenantInfo).some(k => data.tenantInfo![k as keyof typeof data.tenantInfo] !== undefined)) {
      updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          name: data.tenantInfo.name ?? tenant.name,
          contactEmail: data.tenantInfo.contactEmail,
          contactPhone: data.tenantInfo.contactPhone,
        },
      });
    }

    // 2. Create admin user
    const adminUser = await tx.user.create({
      data: {
        email: data.adminUser.email.toLowerCase(),
        firstName: data.adminUser.firstName,
        lastName: data.adminUser.lastName,
        passwordHash,
        role: 'TENANT_ADMIN',
        tenantId,
        isActive: true,
        mustChangePassword: true,
      },
    });

    // 3. Assign RBAC role to admin user (must use tx, not external function)
    const roleId = await getSystemRoleId(tenantId, 'TENANT_ADMIN');
    if (roleId) {
      await tx.userRoleAssignment.create({
        data: {
          userId: adminUser.id,
          roleId,
        },
      });
    }

    // 4. Create first company if provided
    let company = null;
    if (data.firstCompany) {
      company = await tx.company.create({
        data: {
          uen: data.firstCompany.uen,
          name: data.firstCompany.name,
          entityType: (data.firstCompany.entityType || 'PRIVATE_LIMITED') as 'PRIVATE_LIMITED' | 'PUBLIC_LIMITED' | 'SOLE_PROPRIETORSHIP' | 'PARTNERSHIP' | 'LIMITED_PARTNERSHIP' | 'LIMITED_LIABILITY_PARTNERSHIP' | 'FOREIGN_COMPANY' | 'VARIABLE_CAPITAL_COMPANY' | 'OTHER',
          status: 'LIVE',
          tenantId,
        },
      });
    }

    // 5. Activate tenant
    const activatedTenant = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        suspendedAt: null,
        suspendReason: null,
      },
    });

    return {
      tenant: activatedTenant,
      adminUser,
      company,
    };
  });

  // Log audit events (outside transaction for better reliability)
  const auditContext: AuditContext = {
    tenantId,
    userId: performedByUserId,
  };

  // Log tenant info update if changed
  if (data.tenantInfo) {
    await createAuditLog({
      tenantId,
      userId: performedByUserId,
      action: 'UPDATE',
      entityType: 'Tenant',
      entityId: tenantId,
      changeSource: 'MANUAL',
      metadata: {
        setupWizard: true,
        fields: Object.keys(data.tenantInfo).filter(k => data.tenantInfo![k as keyof typeof data.tenantInfo] !== undefined),
      },
    });
  }

  // Log user creation
  await logUserMembership(auditContext, 'USER_INVITED', result.adminUser.id, {
    email: result.adminUser.email,
    role: 'TENANT_ADMIN',
    setupWizard: true,
  });

  // Log company creation
  if (result.company) {
    await createAuditLog({
      tenantId,
      userId: performedByUserId,
      action: 'CREATE',
      entityType: 'Company',
      entityId: result.company.id,
      changeSource: 'MANUAL',
      metadata: {
        uen: result.company.uen,
        name: result.company.name,
        setupWizard: true,
      },
    });
  }

  // Log tenant activation
  await createAuditLog({
    tenantId,
    userId: performedByUserId,
    action: 'UPDATE',
    entityType: 'Tenant',
    entityId: tenantId,
    changeSource: 'MANUAL',
    changes: {
      status: { old: 'PENDING_SETUP', new: 'ACTIVE' },
    },
    metadata: {
      setupWizard: true,
      activated: true,
    },
  });

  return {
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug,
      status: result.tenant.status,
    },
    adminUser: {
      id: result.adminUser.id,
      email: result.adminUser.email,
      firstName: result.adminUser.firstName,
      lastName: result.adminUser.lastName,
      temporaryPassword: process.env.NODE_ENV === 'development' ? tempPassword : undefined,
    },
    company: result.company
      ? {
          id: result.company.id,
          uen: result.company.uen,
          name: result.company.name,
        }
      : null,
  };
}
