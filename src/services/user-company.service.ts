/**
 * User Company Assignment Service
 *
 * Handles multi-company user assignments with access levels.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type { CompanyAccessLevel } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface UserCompanyAssignment {
  id: string;
  userId: string;
  companyId: string;
  accessLevel: CompanyAccessLevel;
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
  accessLevel?: CompanyAccessLevel;
  isPrimary?: boolean;
}

export interface UpdateAssignmentInput {
  accessLevel?: CompanyAccessLevel;
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
  const { userId, companyId, accessLevel = 'VIEW', isPrimary = false } = input;

  // Verify user belongs to tenant
  const user = await prisma.user.findUnique({
    where: { id: userId, tenantId, deletedAt: null },
  });

  if (!user) {
    throw new Error('User not found in this tenant');
  }

  // Verify company belongs to tenant
  const company = await prisma.company.findUnique({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found in this tenant');
  }

  // Check if assignment already exists
  const existing = await prisma.userCompanyAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });

  if (existing) {
    throw new Error('User is already assigned to this company');
  }

  // If setting as primary, unset other primary assignments
  if (isPrimary) {
    await prisma.userCompanyAssignment.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Also update the user's primary companyId
    await prisma.user.update({
      where: { id: userId },
      data: { companyId },
    });
  }

  // Create assignment
  const assignment = await prisma.userCompanyAssignment.create({
    data: {
      userId,
      companyId,
      accessLevel,
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

  // Log the assignment
  await createAuditLog({
    tenantId,
    userId: assignedByUserId,
    action: 'USER_COMPANY_ASSIGNED',
    entityType: 'UserCompanyAssignment',
    entityId: assignment.id,
    changeSource: 'MANUAL',
    metadata: {
      targetUserId: userId,
      companyId,
      companyName: company.name,
      accessLevel,
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
      ...(input.accessLevel && { accessLevel: { old: assignment.accessLevel, new: input.accessLevel } }),
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
  companyId: string,
  requiredLevel?: CompanyAccessLevel
): Promise<{ hasAccess: boolean; accessLevel: CompanyAccessLevel | null }> {
  const assignment = await prisma.userCompanyAssignment.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });

  if (!assignment) {
    // Check if user has the legacy single-company assignment
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });

    // Tenant admins have access to all companies in their tenant
    if (user?.role === 'TENANT_ADMIN') {
      return { hasAccess: true, accessLevel: 'MANAGE' };
    }

    // Legacy single-company assignment
    if (user?.companyId === companyId) {
      return { hasAccess: true, accessLevel: 'VIEW' };
    }

    return { hasAccess: false, accessLevel: null };
  }

  // Check if access level is sufficient
  if (requiredLevel) {
    const levels: CompanyAccessLevel[] = ['VIEW', 'EDIT', 'MANAGE'];
    const userLevelIndex = levels.indexOf(assignment.accessLevel);
    const requiredLevelIndex = levels.indexOf(requiredLevel);

    return {
      hasAccess: userLevelIndex >= requiredLevelIndex,
      accessLevel: assignment.accessLevel,
    };
  }

  return { hasAccess: true, accessLevel: assignment.accessLevel };
}

// ============================================================================
// Get Companies User Can Access
// ============================================================================

export async function getUserAccessibleCompanies(
  userId: string,
  tenantId: string
): Promise<Array<{ id: string; name: string; uen: string; accessLevel: CompanyAccessLevel }>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  // Tenant admins can access all companies
  if (user?.role === 'TENANT_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, uen: true },
      orderBy: { name: 'asc' },
    });

    return companies.map((c) => ({ ...c, accessLevel: 'MANAGE' as CompanyAccessLevel }));
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
    accessLevel: a.accessLevel,
  }));
}
