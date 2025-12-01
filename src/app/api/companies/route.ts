import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createCompanySchema, companySearchSchema } from '@/lib/validations/company';
import { createCompany, searchCompanies, getCompanyByUen } from '@/services/company.service';

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'COMPANY_ADMIN']);

    const { searchParams } = new URL(request.url);

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
        ? parseInt(searchParams.get('financialYearEndMonth')!)
        : undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: (searchParams.get('sortBy') as typeof params.sortBy) || 'updatedAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    });

    // Company Admin can only see their own company
    if (session.role === 'COMPANY_ADMIN' && session.companyId) {
      params.query = session.companyId;
    }

    const result = await searchCompanies(params);

    return NextResponse.json(result);
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(['SUPER_ADMIN']);

    const body = await request.json();
    const data = createCompanySchema.parse(body);

    // Check if UEN already exists
    const existing = await getCompanyByUen(data.uen, true);
    if (existing) {
      return NextResponse.json(
        { error: 'A company with this UEN already exists' },
        { status: 409 }
      );
    }

    const company = await createCompany(data, session.id);

    return NextResponse.json(company, { status: 201 });
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
