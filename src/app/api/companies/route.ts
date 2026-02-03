import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createCompanySchema, companySearchSchema } from '@/lib/validations/company';
import { createCompany, searchCompanies, getCompanyByUen } from '@/services/company.service';
import { getTenantById } from '@/services/tenant.service';
import { migrateBizFileToProcessing } from '@/services/document-processing.service';
import { createLogger, sanitizeError } from '@/lib/logger';

const log = createLogger('api:companies');

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission
    await requirePermission(session, 'company', 'read');

    const { searchParams } = new URL(request.url);

    // Let Zod handle all parsing and validation - no manual parseInt or type casts
    const params = companySearchSchema.parse({
      query: searchParams.get('query') || undefined,
      uen: searchParams.get('uen') || undefined,
      address: searchParams.get('address') || undefined,
      hasWarnings: searchParams.get('hasWarnings')
        ? searchParams.get('hasWarnings') === 'true'
        : undefined,
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
      homeCurrency: searchParams.get('homeCurrency') || undefined,
      paidUpCapitalMin: searchParams.get('paidUpCapitalMin')
        ? Number(searchParams.get('paidUpCapitalMin'))
        : undefined,
      paidUpCapitalMax: searchParams.get('paidUpCapitalMax')
        ? Number(searchParams.get('paidUpCapitalMax'))
        : undefined,
      issuedCapitalMin: searchParams.get('issuedCapitalMin')
        ? Number(searchParams.get('issuedCapitalMin'))
        : undefined,
      issuedCapitalMax: searchParams.get('issuedCapitalMax')
        ? Number(searchParams.get('issuedCapitalMax'))
        : undefined,
      officersMin: searchParams.get('officersMin')
        ? Number(searchParams.get('officersMin'))
        : undefined,
      officersMax: searchParams.get('officersMax')
        ? Number(searchParams.get('officersMax'))
        : undefined,
      shareholdersMin: searchParams.get('shareholdersMin')
        ? Number(searchParams.get('shareholdersMin'))
        : undefined,
      shareholdersMax: searchParams.get('shareholdersMax')
        ? Number(searchParams.get('shareholdersMax'))
        : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    });

    // Company-scoped users can only see companies they have role assignments for
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      // Check if user has "All Companies" access (role with null companyId)
      if (session.hasAllCompaniesAccess && session.tenantId) {
        // User has a role for "All Companies" - return all companies in tenant
        const result = await searchCompanies(params, session.tenantId);
        return NextResponse.json(result);
      }

      if (session.companyIds && session.companyIds.length > 0 && session.tenantId) {
        // Return all companies the user has access to via role assignments
        const result = await searchCompanies(
          params,
          session.tenantId,
          { companyIds: session.companyIds }
        );
        return NextResponse.json(result);
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

    // For SUPER_ADMIN, allow specifying tenantId via query param
    // This ensures companies dropdown in user management is scoped to selected tenant
    const tenantIdParam = searchParams.get('tenantId');
    let effectiveTenantId = session.tenantId;

    if (session.isSuperAdmin && tenantIdParam) {
      // Validate that the tenant exists before using it
      const tenant = await getTenantById(tenantIdParam);
      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        );
      }
      effectiveTenantId = tenantIdParam;
    }

    const result = await searchCompanies(
      params,
      effectiveTenantId,
      { skipTenantFilter: session.isSuperAdmin && !effectiveTenantId }
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
      // Check for Prisma/database errors (they have a 'code' property)
      if ('code' in error) {
        log.error('GET /companies database error:', sanitizeError(error));
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      // Validation and business logic errors
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.error('GET /companies failed with unexpected error:', sanitizeError(error));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check create permission
    await requirePermission(session, 'company', 'create');

    const body = await request.json();
    const { tenantId: bodyTenantId, ...companyData } = body;
    const data = createCompanySchema.parse(companyData);

    // Determine tenant ID: SUPER_ADMIN can specify tenantId, others use session
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && bodyTenantId) {
      tenantId = bodyTenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Check if UEN already exists within tenant
    const existing = await getCompanyByUen(data.uen, tenantId, {});
    if (existing) {
      return NextResponse.json(
        { error: 'A company with this UEN already exists' },
        { status: 409 }
      );
    }

    const company = await createCompany(data, { tenantId, userId: session.id });

    // If a bizfileDocumentId is provided, migrate it to the processing pipeline
    const bizfileDocumentId = body.bizfileDocumentId as string | undefined;
    if (bizfileDocumentId) {
      try {
        log.info(`Migrating BizFile document ${bizfileDocumentId} for company ${company.id}`);
        await migrateBizFileToProcessing(bizfileDocumentId, company.id, tenantId);
        log.info(`Successfully migrated BizFile document ${bizfileDocumentId}`);
      } catch (error) {
        // Log error but don't fail company creation
        log.error(`Failed to migrate BizFile document ${bizfileDocumentId}:`, sanitizeError(error));
        // Company is still created, but BizFile migration failed
        // User can manually retry or upload the document again
      }
    }

    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      // Check for Prisma/database errors (they have a 'code' property)
      if ('code' in error) {
        log.error('POST /companies database error:', sanitizeError(error));
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      // Validation and business logic errors
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.error('POST /companies failed with unexpected error:', sanitizeError(error));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
