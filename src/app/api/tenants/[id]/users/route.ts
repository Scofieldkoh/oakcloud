/**
 * Tenant Users API Routes
 *
 * GET  /api/tenants/:id/users - List users in tenant
 * POST /api/tenants/:id/users - Invite user to tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canManageTenant } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { inviteUserSchema } from '@/lib/validations/tenant';
import { inviteUserToTenant } from '@/services/tenant.service';
import {
  tenantUsersQuerySchema,
  safeParseQueryParams,
  createValidationErrorResponse,
} from '@/lib/validations/query-params';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId } = await params;

    // Check tenant access and permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'user', 'read');

    const { searchParams } = new URL(request.url);

    // Validate query parameters
    const validation = safeParseQueryParams(searchParams, tenantUsersQuerySchema);
    if (!validation.success) {
      return NextResponse.json(createValidationErrorResponse(validation.error), { status: 400 });
    }

    const { page, limit, query, role, company } = validation.data;

    const where = {
      tenantId,
      deletedAt: null,
      ...(query && {
        OR: [
          { email: { contains: query, mode: 'insensitive' as const } },
          { firstName: { contains: query, mode: 'insensitive' as const } },
          { lastName: { contains: query, mode: 'insensitive' as const } },
        ],
      }),
      // Filter by role name or systemRoleType
      // Handles both exact matches and normalized names (e.g., "COMPANY_ADMIN" matches "Company Admin")
      ...(role && {
        roleAssignments: {
          some: {
            role: {
              OR: [
                { name: role },
                { systemRoleType: role },
                // Convert "COMPANY_ADMIN" to "Company Admin" for matching
                { name: role.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') },
              ],
            },
          },
        },
      }),
      // Filter by company name (partial match)
      ...(company && {
        roleAssignments: {
          some: {
            company: {
              name: { contains: company, mode: 'insensitive' as const },
            },
          },
        },
      }),
    };

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          roleAssignments: {
            select: {
              id: true,
              roleId: true,
              companyId: true,
              role: {
                select: {
                  id: true,
                  name: true,
                  systemRoleType: true,
                },
              },
              company: {
                select: {
                  id: true,
                  name: true,
                },
              },
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
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      users,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: tenantId } = await params;

    // Check tenant access and permission
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await requirePermission(session, 'user', 'create');

    const body = await request.json();
    const data = inviteUserSchema.parse(body);

    const result = await inviteUserToTenant(tenantId, data, session.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('maximum number of users')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'A user with this email already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
