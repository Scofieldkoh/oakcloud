/**
 * User Company Assignment Service
 *
 * Handles multi-company user assignments.
 * Note: Permissions are controlled through role assignments (UserRoleAssignment),
 * not through this table. This service only tracks WHICH companies a user can access.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';

// ============================================================================
// Types
// ============================================================================

export interface UserCompanyAssignment {
  id: string;
  userId: string;
  companyId: string;
  isPrimary: boolean;
  createdAt: Date;
  company: {
    id: string;
    name: string;
    uen: string;
  };
}

export interface AssignCompanyInput {
  userId: string;
  companyId: string;
  roleId?: string; // Optional role to assign for this company
  isPrimary?: boolean;
}

export interface UpdateAssignmentInput {
  isPrimary?: boolean;
}

// ============================================================================
// Get User's Company Assignments
// ============================================================================

export async function getUserCompanyAssignments(
  userId: string,
  tenantId: string
): Promise<UserCompanyAssignment[]> {
  const assignments = await prisma.userCompanyAssignment.findMany({
    where: {
      userId,
      company: { tenantId, deletedAt: null },
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  return assignments;
}

// ============================================================================
// Assign User to Company
// ============================================================================

export async function assignUserToCompany(
  input: AssignCompanyInput,
  tenantId: string,
  assignedByUserId: string
): Promise<UserCompanyAssignment> {
  const { userId, companyId, roleId, isPrimary = false } = input;

  // First verify company belongs to tenant (this confirms the target tenant)
  const company = await prisma.company.findUnique({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found in this tenant');
  }

  // Now verify user - use company's tenantId to ensure we're looking in the right tenant
  // This fixes the SUPER_ADMIN bug where session.tenantId could be null
  const user = await prisma.user.findUnique({
    where: { id: userId, tenantId: company.tenantId, deletedAt: null },
  });

  if (!user) {
    throw new Error('User not found in this tenant');
  }

  // Verify role belongs to tenant if provided
  if (roleId) {
    const role = await prisma.role.findUnique({
      where: { id: roleId, tenantId: company.tenantId },
    });
    if (!role) {
      throw new Error('Role not found in this tenant');
    }
  }

  // Check if company assignment already exists
  let existing = await prisma.userCompanyAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
  });

  // Use a transaction to prevent race conditions when setting primary assignment
  // This ensures atomicity when updating multiple records
  const assignment = await prisma.$transaction(async (tx) => {
    if (existing) {
      // Company assignment exists - update isPrimary if needed, but don't throw error
      // This allows adding a new role to a company where user already has access
      if (isPrimary && !existing.isPrimary) {
        // Unset other primary assignments
        await tx.userCompanyAssignment.updateMany({
          where: { userId, isPrimary: true, id: { not: existing.id } },
          data: { isPrimary: false },
        });

        // Update this assignment to be primary
        existing = await tx.userCompanyAssignment.update({
          where: { id: existing.id },
          data: { isPrimary: true },
          include: {
            company: {
              select: {
                id: true,
                name: true,
                uen: true,
              },
            },
          },
        });

        // Also update the user's primary companyId
        await tx.user.update({
          where: { id: userId },
          data: { companyId },
        });
      }
      return existing;
    } else {
      // If setting as primary, unset other primary assignments
      if (isPrimary) {
        await tx.userCompanyAssignment.updateMany({
          where: { userId, isPrimary: true },
          data: { isPrimary: false },
        });

        // Also update the user's primary companyId
        await tx.user.update({
          where: { id: userId },
          data: { companyId },
        });
      }

      // Create company assignment
      return tx.userCompanyAssignment.create({
        data: {
          userId,
          companyId,
          isPrimary,
        },
        include: {
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
  });

  // Create role assignment if roleId provided
  if (roleId) {
    // Check if role assignment already exists for this user/role/company combo
    const existingRoleAssignment = await prisma.userRoleAssignment.findFirst({
      where: { userId, roleId, companyId },
    });

    if (!existingRoleAssignment) {
      await prisma.userRoleAssignment.create({
        data: {
          userId,
          roleId,
          companyId,
        },
      });
    }
  }

  // Log the assignment - use company's tenantId for proper audit trail
  await createAuditLog({
    tenantId: company.tenantId,
    userId: assignedByUserId,
    action: 'USER_COMPANY_ASSIGNED',
    entityType: 'UserCompanyAssignment',
    entityId: assignment.id,
    changeSource: 'MANUAL',
    metadata: {
      targetUserId: userId,
      companyId,
      companyName: company.name,
      roleId,
      isPrimary,
    },
  });

  return assignment;
}

// ============================================================================
// Update Company Assignment
// ============================================================================

export async function updateCompanyAssignment(
  assignmentId: string,
  input: UpdateAssignmentInput,
  tenantId: string,
  updatedByUserId: string
): Promise<UserCompanyAssignment> {
  const assignment = await prisma.userCompanyAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: true,
      company: true,
    },
  });

  if (!assignment || assignment.company.tenantId !== tenantId) {
    throw new Error('Assignment not found');
  }

  // If setting as primary, unset other primary assignments
  if (input.isPrimary) {
    await prisma.userCompanyAssignment.updateMany({
      where: { userId: assignment.userId, isPrimary: true, id: { not: assignmentId } },
      data: { isPrimary: false },
    });

    // Also update the user's primary companyId
    await prisma.user.update({
      where: { id: assignment.userId },
      data: { companyId: assignment.companyId },
    });
  }

  const updated = await prisma.userCompanyAssignment.update({
    where: { id: assignmentId },
    data: input,
    include: {
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
  });

  // Log the update
  await createAuditLog({
    tenantId,
    userId: updatedByUserId,
    action: 'USER_COMPANY_UPDATED',
    entityType: 'UserCompanyAssignment',
    entityId: assignmentId,
    changeSource: 'MANUAL',
    changes: {
      ...(input.isPrimary !== undefined && { isPrimary: { old: assignment.isPrimary, new: input.isPrimary } }),
    },
  });

  return updated;
}

// ============================================================================
// Remove Company Assignment
// ============================================================================

export async function removeCompanyAssignment(
  assignmentId: string,
  tenantId: string,
  removedByUserId: string
): Promise<void> {
  const assignment = await prisma.userCompanyAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: true,
      company: true,
    },
  });

  if (!assignment || assignment.company.tenantId !== tenantId) {
    throw new Error('Assignment not found');
  }

  // If removing primary, set another assignment as primary or clear user's companyId
  if (assignment.isPrimary) {
    const nextPrimary = await prisma.userCompanyAssignment.findFirst({
      where: { userId: assignment.userId, id: { not: assignmentId } },
      orderBy: { createdAt: 'asc' },
    });

    if (nextPrimary) {
      await prisma.userCompanyAssignment.update({
        where: { id: nextPrimary.id },
        data: { isPrimary: true },
      });
      await prisma.user.update({
        where: { id: assignment.userId },
        data: { companyId: nextPrimary.companyId },
      });
    } else {
      await prisma.user.update({
        where: { id: assignment.userId },
        data: { companyId: null },
      });
    }
  }

  // Delete assignment
  await prisma.userCompanyAssignment.delete({
    where: { id: assignmentId },
  });

  // Log the removal
  await createAuditLog({
    tenantId,
    userId: removedByUserId,
    action: 'USER_COMPANY_REMOVED',
    entityType: 'UserCompanyAssignment',
    entityId: assignmentId,
    changeSource: 'MANUAL',
    metadata: {
      targetUserId: assignment.userId,
      companyId: assignment.companyId,
      companyName: assignment.company.name,
    },
  });
}

// ============================================================================
// Check User Access to Company
// ============================================================================

export async function checkUserCompanyAccess(
  userId: string,
  companyId: string
): Promise<boolean> {
  // Check if user has explicit company assignment
  const assignment = await prisma.userCompanyAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });

  if (assignment) {
    return true;
  }

  // Check if user has system admin role via role assignments
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      companyId: true,
      roleAssignments: {
        select: {
          role: {
            select: { systemRoleType: true },
          },
        },
      },
    },
  });

  // SUPER_ADMIN and TENANT_ADMIN have access to all companies in their tenant
  const isSuperAdmin = user?.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const isTenantAdmin = user?.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  if (isSuperAdmin || isTenantAdmin) {
    return true;
  }

  // Legacy single-company assignment
  if (user?.companyId === companyId) {
    return true;
  }

  return false;
}

// ============================================================================
// Get Companies User Can Access
// ============================================================================

export async function getUserAccessibleCompanies(
  userId: string,
  tenantId: string
): Promise<Array<{ id: string; name: string; uen: string }>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      roleAssignments: {
        select: {
          role: {
            select: { systemRoleType: true },
          },
        },
      },
    },
  });

  // SUPER_ADMIN and TENANT_ADMIN can access all companies
  const isSuperAdmin = user?.roleAssignments.some(
    (a) => a.role.systemRoleType === 'SUPER_ADMIN'
  );
  const isTenantAdmin = user?.roleAssignments.some(
    (a) => a.role.systemRoleType === 'TENANT_ADMIN'
  );

  if (isSuperAdmin || isTenantAdmin) {
    const companies = await prisma.company.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, uen: true },
      orderBy: { name: 'asc' },
    });

    return companies;
  }

  // Get assigned companies
  const assignments = await prisma.userCompanyAssignment.findMany({
    where: {
      userId,
      company: { tenantId, deletedAt: null },
    },
    include: {
      company: {
        select: { id: true, name: true, uen: true },
      },
    },
    orderBy: [
      { isPrimary: 'desc' },
      { company: { name: 'asc' } },
    ],
  });

  return assignments.map((a) => ({
    id: a.company.id,
    name: a.company.name,
    uen: a.company.uen,
  }));
}
