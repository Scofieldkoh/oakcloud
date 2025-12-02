/**
 * Tenant Users API Routes
 *
 * GET  /api/tenants/:id/users - List users in tenant
 * POST /api/tenants/:id/users - Invite user to tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, canManageTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { inviteUserSchema } from '@/lib/validations/tenant';
import { inviteUserToTenant } from '@/services/tenant.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id: tenantId } = await params;

    // Check access
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const query = searchParams.get('query') || undefined;
    const role = searchParams.get('role') || undefined;

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
      ...(role && { role: role as 'TENANT_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_USER' }),
    };

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              name: true,
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
      if (error.message === 'Forbidden') {
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
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id: tenantId } = await params;

    // Check access
    if (!canManageTenant(session, tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = inviteUserSchema.parse(body);

    const result = await inviteUserToTenant(tenantId, data, session.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
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
