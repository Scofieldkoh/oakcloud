import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createCompanySchema, companySearchSchema } from '@/lib/validations/company';
import { createCompany, searchCompanies, getCompanyByUen, getCompanyById } from '@/services/company.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission
    await requirePermission(session, 'company', 'read');

    const { searchParams } = new URL(request.url);

    // Let Zod handle all parsing and validation - no manual parseInt or type casts
    const params = companySearchSchema.parse({
      query: searchParams.get('query') || undefined,
      entityType: searchParams.get('entityType') || undefined,
      status: searchParams.get('status') || undefined,
      incorporationDateFrom: searchParams.get('incorporationDateFrom') || undefined,
      incorporationDateTo: searchParams.get('incorporationDateTo') || undefined,
      hasCharges: searchParams.get('hasCharges')
        ? searchParams.get('hasCharges') === 'true'
        : undefined,
      financialYearEndMonth: searchParams.get('financialYearEndMonth')
        ? Number(searchParams.get('financialYearEndMonth'))
        : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    });

    // Company-scoped users can only see their own company
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      if (session.companyId && session.tenantId) {
        // Return only their assigned company
        const company = await getCompanyById(session.companyId, session.tenantId);
        return NextResponse.json({
          companies: company ? [company] : [],
          total: company ? 1 : 0,
          page: 1,
          limit: params.limit,
          totalPages: 1,
        });
      }
      // No company assigned - return empty
      return NextResponse.json({
        companies: [],
        total: 0,
        page: 1,
        limit: params.limit,
        totalPages: 0,
      });
    }

    // For SUPER_ADMIN without tenantId, allow cross-tenant access
    const result = await searchCompanies(
      params,
      session.tenantId,
      { skipTenantFilter: session.isSuperAdmin && !session.tenantId }
    );

    return NextResponse.json(result);
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check create permission
    await requirePermission(session, 'company', 'create');

    const body = await request.json();
    const data = createCompanySchema.parse(body);

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Check if UEN already exists within tenant
    const existing = await getCompanyByUen(data.uen, session.tenantId, {});
    if (existing) {
      return NextResponse.json(
        { error: 'A company with this UEN already exists' },
        { status: 409 }
      );
    }

    const company = await createCompany(data, { tenantId: session.tenantId, userId: session.id });

    return NextResponse.json(company, { status: 201 });
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
