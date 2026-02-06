import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { parseIdParams } from '@/lib/validations/params';
import {
  retrieveFYEFromACRA,
  isCompanyEntityType,
  ACRARateLimitError,
} from '@/lib/external/acra-fye';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);

    // Check permission - need update permission since this is used to populate edit form
    await requirePermission(session, 'company', 'update', id);

    // Additional check for company-scoped users
    if (!session.isSuperAdmin && !session.isTenantAdmin && !(await canAccessCompany(session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the company with tenant validation
    const whereClause: { id: string; tenantId?: string } = { id };
    if (!session.isSuperAdmin && session.tenantId) {
      whereClause.tenantId = session.tenantId;
    }

    const company = await prisma.company.findUnique({
      where: whereClause,
      select: {
        id: true,
        name: true,
        uen: true,
        entityType: true,
        financialYearEndDay: true,
        financialYearEndMonth: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Validate entity type is a company structure
    if (!isCompanyEntityType(company.entityType)) {
      return NextResponse.json(
        { error: 'FYE retrieval is only available for company entity types' },
        { status: 400 }
      );
    }

    // Retrieve FYE from ACRA
    const fye = await retrieveFYEFromACRA(
      company.name,
      company.uen,
      company.entityType
    );

    if (!fye) {
      return NextResponse.json(
        { error: 'Could not retrieve FYE data from ACRA. Company may not have filed annual returns yet.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      financialYearEndDay: fye.day,
      financialYearEndMonth: fye.month,
    });
  } catch (error) {
    if (error instanceof ACRARateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 429,
          headers: error.retryAfterSeconds
            ? { 'Retry-After': String(error.retryAfterSeconds) }
            : undefined,
        }
      );
    }

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
