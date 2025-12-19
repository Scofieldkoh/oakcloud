import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { updateCompanySchema, deleteCompanySchema } from '@/lib/validations/company';
import { parseIdParams } from '@/lib/validations/params';
import { HTTP_STATUS } from '@/lib/constants/application';
import {
  getCompanyById,
  getCompanyFullDetails,
  updateCompany,
  deleteCompany,
  restoreCompany,
} from '@/services/company.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    // SECURITY: Validate ID format before any database operations
    const { id } = await parseIdParams(params);

    // Check permission - RBAC will handle SUPER_ADMIN bypass
    await requirePermission(session, 'company', 'read', id);

    // Additional check for company-scoped users
    if (!(await canAccessCompany(session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === 'true';

    // SUPER_ADMIN can access cross-tenant, others must have tenantId
    const skipTenantFilter = session.isSuperAdmin && !session.tenantId;
    const company = full
      ? await getCompanyFullDetails(id, session.tenantId, { skipTenantFilter })
      : await getCompanyById(id, session.tenantId, { skipTenantFilter });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    // SECURITY: Validate ID format before any database operations
    const { id } = await parseIdParams(params);

    // Check permission - allows SUPER_ADMIN, TENANT_ADMIN, and COMPANY_ADMIN (for their company)
    await requirePermission(session, 'company', 'update', id);

    // Additional check for company-scoped users
    if (!session.isSuperAdmin && !session.isTenantAdmin && !(await canAccessCompany(session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = updateCompanySchema.parse({ ...body, id });

    // Get the company with tenant validation
    const whereClause: { id: string; tenantId?: string } = { id };
    if (!session.isSuperAdmin && session.tenantId) {
      whereClause.tenantId = session.tenantId;
    }

    const existingCompany = await prisma.company.findUnique({
      where: whereClause,
      select: { tenantId: true },
    });

    if (!existingCompany) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = await updateCompany(
      data,
      { tenantId: existingCompany.tenantId, userId: session.id },
      body.reason
    );

    return NextResponse.json(company);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Company not found') {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    // SECURITY: Validate ID format before any database operations
    const { id } = await parseIdParams(params);

    // Check permission - allows SUPER_ADMIN and TENANT_ADMIN
    await requirePermission(session, 'company', 'delete', id);

    const body = await request.json();
    const data = deleteCompanySchema.parse({ id, reason: body.reason });

    // Get the company with tenant validation
    const whereClause: { id: string; tenantId?: string } = { id };
    if (!session.isSuperAdmin && session.tenantId) {
      whereClause.tenantId = session.tenantId;
    }

    const existingCompany = await prisma.company.findUnique({
      where: whereClause,
      select: { tenantId: true },
    });

    if (!existingCompany) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const company = await deleteCompany(
      data.id,
      { tenantId: existingCompany.tenantId, userId: session.id },
      data.reason
    );

    return NextResponse.json(company);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Company not found') {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    // SECURITY: Validate ID format before any database operations
    const { id } = await parseIdParams(params);

    // Check permission for restore (treated as update)
    await requirePermission(session, 'company', 'update', id);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'restore') {
      // Get the company with tenant validation
      const whereClause: { id: string; tenantId?: string } = { id };
      if (!session.isSuperAdmin && session.tenantId) {
        whereClause.tenantId = session.tenantId;
      }

      const existingCompany = await prisma.company.findUnique({
        where: whereClause,
        select: { tenantId: true },
      });

      if (!existingCompany) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }

      const company = await restoreCompany(
        id,
        { tenantId: existingCompany.tenantId, userId: session.id }
      );
      return NextResponse.json(company);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Company not found') {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
