/**
 * Admin Data Purge API Routes
 *
 * GET   /api/admin/purge - Get soft-deleted records available for purging
 * POST  /api/admin/purge - Permanently delete soft-deleted records
 * PATCH /api/admin/purge - Restore soft-deleted records
 *
 * SUPER_ADMIN only - for managing soft-deleted data
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';

export type PurgeableEntity = 'tenant' | 'user' | 'company' | 'contact';

interface PurgeStats {
  tenants: number;
  users: number;
  companies: number;
  contacts: number;
}

/**
 * GET - Retrieve counts and records of soft-deleted data
 */
export async function GET() {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get counts of soft-deleted records
    const [tenants, users, companies, contacts] = await Promise.all([
      prisma.tenant.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          name: true,
          slug: true,
          deletedAt: true,
          deletedReason: true,
          _count: {
            select: {
              users: true,
              companies: true,
            },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.user.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          deletedAt: true,
          tenant: {
            select: { name: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.company.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          name: true,
          uen: true,
          deletedAt: true,
          deletedReason: true,
          tenant: {
            select: { name: true },
          },
          _count: {
            select: {
              documents: true,
              officers: true,
              shareholders: true,
            },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      prisma.contact.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          fullName: true,
          email: true,
          deletedAt: true,
          tenant: {
            select: { name: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);

    const stats: PurgeStats = {
      tenants: tenants.length,
      users: users.length,
      companies: companies.length,
      contacts: contacts.length,
    };

    return NextResponse.json({
      stats,
      records: {
        tenants,
        users,
        companies,
        contacts,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST - Permanently delete soft-deleted records
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { entityType, entityIds, reason } = body as {
      entityType: PurgeableEntity;
      entityIds: string[];
      reason: string;
    };

    // Validate inputs
    if (!entityType || !['tenant', 'user', 'company', 'contact'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entity type. Must be tenant, user, company, or contact' },
        { status: 400 }
      );
    }

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Entity IDs are required' },
        { status: 400 }
      );
    }

    if (!reason || reason.length < 10) {
      return NextResponse.json(
        { error: 'Reason must be at least 10 characters' },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    const deletedRecords: { id: string; name: string }[] = [];

    switch (entityType) {
      case 'tenant':
        // Get tenant info before deletion for audit
        const tenantsToDelete = await prisma.tenant.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, name: true, slug: true },
        });

        if (tenantsToDelete.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted tenants found with the provided IDs' },
            { status: 404 }
          );
        }

        // Delete in order: roles, documents, companies, users, then tenant
        for (const tenant of tenantsToDelete) {
          await prisma.$transaction(async (tx) => {
            // Delete role assignments and roles
            await tx.userRoleAssignment.deleteMany({
              where: { role: { tenantId: tenant.id } },
            });
            await tx.rolePermission.deleteMany({
              where: { role: { tenantId: tenant.id } },
            });
            await tx.role.deleteMany({
              where: { tenantId: tenant.id },
            });

            // Delete user company assignments
            await tx.userCompanyAssignment.deleteMany({
              where: { user: { tenantId: tenant.id } },
            });

            // Delete company-related data
            await tx.companyCharge.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });
            await tx.companyShareholder.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });
            await tx.shareCapital.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });
            await tx.companyOfficer.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });
            await tx.companyAddress.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });
            await tx.companyFormerName.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });
            await tx.companyContact.deleteMany({
              where: { company: { tenantId: tenant.id } },
            });

            // Delete documents
            await tx.document.deleteMany({
              where: { tenantId: tenant.id },
            });

            // Delete companies
            await tx.company.deleteMany({
              where: { tenantId: tenant.id },
            });

            // Delete contacts
            await tx.contact.deleteMany({
              where: { tenantId: tenant.id },
            });

            // Delete users
            await tx.user.deleteMany({
              where: { tenantId: tenant.id },
            });

            // Delete audit logs for this tenant
            await tx.auditLog.deleteMany({
              where: { tenantId: tenant.id },
            });

            // Finally delete the tenant
            await tx.tenant.delete({
              where: { id: tenant.id },
            });
          });

          deletedRecords.push({ id: tenant.id, name: tenant.name });
        }
        deletedCount = tenantsToDelete.length;
        break;

      case 'user':
        const usersToDelete = await prisma.user.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });

        if (usersToDelete.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted users found with the provided IDs' },
            { status: 404 }
          );
        }

        for (const user of usersToDelete) {
          await prisma.$transaction(async (tx) => {
            // Delete role assignments
            await tx.userRoleAssignment.deleteMany({
              where: { userId: user.id },
            });

            // Delete company assignments
            await tx.userCompanyAssignment.deleteMany({
              where: { userId: user.id },
            });

            // Delete user
            await tx.user.delete({
              where: { id: user.id },
            });
          });

          deletedRecords.push({ id: user.id, name: `${user.firstName} ${user.lastName}` });
        }
        deletedCount = usersToDelete.length;
        break;

      case 'company':
        const companiesToDelete = await prisma.company.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, name: true, uen: true },
        });

        if (companiesToDelete.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted companies found with the provided IDs' },
            { status: 404 }
          );
        }

        for (const company of companiesToDelete) {
          await prisma.$transaction(async (tx) => {
            // Delete company-related data
            await tx.companyCharge.deleteMany({
              where: { companyId: company.id },
            });
            await tx.companyShareholder.deleteMany({
              where: { companyId: company.id },
            });
            await tx.shareCapital.deleteMany({
              where: { companyId: company.id },
            });
            await tx.companyOfficer.deleteMany({
              where: { companyId: company.id },
            });
            await tx.companyAddress.deleteMany({
              where: { companyId: company.id },
            });
            await tx.companyFormerName.deleteMany({
              where: { companyId: company.id },
            });
            await tx.companyContact.deleteMany({
              where: { companyId: company.id },
            });

            // Delete documents
            await tx.document.deleteMany({
              where: { companyId: company.id },
            });

            // Delete user company assignments
            await tx.userCompanyAssignment.deleteMany({
              where: { companyId: company.id },
            });

            // Delete role assignments scoped to this company
            await tx.userRoleAssignment.deleteMany({
              where: { companyId: company.id },
            });

            // Delete the company
            await tx.company.delete({
              where: { id: company.id },
            });
          });

          deletedRecords.push({ id: company.id, name: company.name });
        }
        deletedCount = companiesToDelete.length;
        break;

      case 'contact':
        const contactsToDelete = await prisma.contact.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, fullName: true },
        });

        if (contactsToDelete.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted contacts found with the provided IDs' },
            { status: 404 }
          );
        }

        for (const contact of contactsToDelete) {
          await prisma.$transaction(async (tx) => {
            // Delete company contact relations
            await tx.companyContact.deleteMany({
              where: { contactId: contact.id },
            });

            // Update officers to remove contact reference
            await tx.companyOfficer.updateMany({
              where: { contactId: contact.id },
              data: { contactId: null },
            });

            // Update shareholders to remove contact reference
            await tx.companyShareholder.updateMany({
              where: { contactId: contact.id },
              data: { contactId: null },
            });

            // Update charges to remove contact reference
            await tx.companyCharge.updateMany({
              where: { chargeHolderId: contact.id },
              data: { chargeHolderId: null },
            });

            // Delete the contact
            await tx.contact.delete({
              where: { id: contact.id },
            });
          });

          deletedRecords.push({ id: contact.id, name: contact.fullName });
        }
        deletedCount = contactsToDelete.length;
        break;
    }

    // Log the purge action
    const recordNames = deletedRecords.map(r => r.name).join(', ');
    await createAuditLog({
      userId: session.id,
      action: 'DELETE',
      entityType: `Purge_${entityType}`,
      entityId: entityIds.join(','),
      entityName: recordNames,
      summary: `Permanently deleted ${deletedCount} ${entityType}(s): ${recordNames}`,
      changeSource: 'MANUAL',
      reason,
      metadata: {
        purgeType: 'permanent',
        entityType,
        deletedCount,
        deletedRecords,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Permanently deleted ${deletedCount} ${entityType}(s)`,
      deletedCount,
      deletedRecords,
    });
  } catch (error) {
    console.error('Purge error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH - Restore soft-deleted records
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { entityType, entityIds } = body as {
      entityType: PurgeableEntity;
      entityIds: string[];
    };

    // Validate inputs
    if (!entityType || !['tenant', 'user', 'company', 'contact'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entity type. Must be tenant, user, company, or contact' },
        { status: 400 }
      );
    }

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Entity IDs are required' },
        { status: 400 }
      );
    }

    let restoredCount = 0;
    const restoredRecords: { id: string; name: string }[] = [];

    switch (entityType) {
      case 'tenant':
        const tenantsToRestore = await prisma.tenant.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, name: true },
        });

        if (tenantsToRestore.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted tenants found with the provided IDs' },
            { status: 404 }
          );
        }

        // Cascade restore: tenant + all associated users, companies, contacts
        for (const tenant of tenantsToRestore) {
          await prisma.$transaction(async (tx) => {
            // Restore all users belonging to this tenant
            await tx.user.updateMany({
              where: { tenantId: tenant.id, deletedAt: { not: null } },
              data: { deletedAt: null, isActive: false },
            });

            // Restore all companies belonging to this tenant
            await tx.company.updateMany({
              where: { tenantId: tenant.id, deletedAt: { not: null } },
              data: { deletedAt: null, deletedReason: null },
            });

            // Restore all contacts belonging to this tenant
            await tx.contact.updateMany({
              where: { tenantId: tenant.id, deletedAt: { not: null } },
              data: { deletedAt: null },
            });

            // Restore the tenant - set to SUSPENDED so admin can review before activating
            await tx.tenant.update({
              where: { id: tenant.id },
              data: {
                deletedAt: null,
                deletedReason: null,
                status: 'SUSPENDED',
              },
            });
          });

          restoredRecords.push({ id: tenant.id, name: tenant.name });
        }
        restoredCount = tenantsToRestore.length;
        break;

      case 'user':
        const usersToRestore = await prisma.user.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, firstName: true, lastName: true, tenantId: true },
        });

        if (usersToRestore.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted users found with the provided IDs' },
            { status: 404 }
          );
        }

        // Check if parent tenant is active
        for (const user of usersToRestore) {
          if (!user.tenantId) continue;
          const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { deletedAt: true, status: true },
          });

          if (tenant?.deletedAt) {
            return NextResponse.json(
              { error: `Cannot restore user "${user.firstName} ${user.lastName}" - parent tenant is deleted. Restore the tenant first.` },
              { status: 400 }
            );
          }
        }

        await prisma.user.updateMany({
          where: { id: { in: entityIds }, deletedAt: { not: null } },
          data: {
            deletedAt: null,
            isActive: false, // Set inactive so admin can review before activating
          },
        });

        for (const user of usersToRestore) {
          restoredRecords.push({ id: user.id, name: `${user.firstName} ${user.lastName}` });
        }
        restoredCount = usersToRestore.length;
        break;

      case 'company':
        const companiesToRestore = await prisma.company.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, name: true, tenantId: true },
        });

        if (companiesToRestore.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted companies found with the provided IDs' },
            { status: 404 }
          );
        }

        // Check if parent tenant is active
        for (const company of companiesToRestore) {
          if (!company.tenantId) continue;
          const tenant = await prisma.tenant.findUnique({
            where: { id: company.tenantId },
            select: { deletedAt: true },
          });

          if (tenant?.deletedAt) {
            return NextResponse.json(
              { error: `Cannot restore company "${company.name}" - parent tenant is deleted. Restore the tenant first.` },
              { status: 400 }
            );
          }
        }

        await prisma.company.updateMany({
          where: { id: { in: entityIds }, deletedAt: { not: null } },
          data: {
            deletedAt: null,
            deletedReason: null,
          },
        });

        for (const company of companiesToRestore) {
          restoredRecords.push({ id: company.id, name: company.name });
        }
        restoredCount = companiesToRestore.length;
        break;

      case 'contact':
        const contactsToRestore = await prisma.contact.findMany({
          where: {
            id: { in: entityIds },
            deletedAt: { not: null },
          },
          select: { id: true, fullName: true, tenantId: true },
        });

        if (contactsToRestore.length === 0) {
          return NextResponse.json(
            { error: 'No soft-deleted contacts found with the provided IDs' },
            { status: 404 }
          );
        }

        // Check if parent tenant is active
        for (const contact of contactsToRestore) {
          if (!contact.tenantId) continue;
          const tenant = await prisma.tenant.findUnique({
            where: { id: contact.tenantId },
            select: { deletedAt: true },
          });

          if (tenant?.deletedAt) {
            return NextResponse.json(
              { error: `Cannot restore contact "${contact.fullName}" - parent tenant is deleted. Restore the tenant first.` },
              { status: 400 }
            );
          }
        }

        await prisma.contact.updateMany({
          where: { id: { in: entityIds }, deletedAt: { not: null } },
          data: {
            deletedAt: null,
          },
        });

        for (const contact of contactsToRestore) {
          restoredRecords.push({ id: contact.id, name: contact.fullName });
        }
        restoredCount = contactsToRestore.length;
        break;
    }

    // Log the restore action
    const restoredNames = restoredRecords.map(r => r.name).join(', ');
    await createAuditLog({
      userId: session.id,
      action: 'RESTORE',
      entityType: `Restore_${entityType}`,
      entityId: entityIds.join(','),
      entityName: restoredNames,
      summary: `Restored ${restoredCount} ${entityType}(s): ${restoredNames}`,
      changeSource: 'MANUAL',
      metadata: {
        entityType,
        restoredCount,
        restoredRecords,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Restored ${restoredCount} ${entityType}(s)`,
      restoredCount,
      restoredRecords,
    });
  } catch (error) {
    console.error('Restore error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
