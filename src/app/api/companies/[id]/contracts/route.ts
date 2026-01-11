import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { getCompanyContracts, createContract } from '@/services/contract.service';
import { createContractSchema, contractSearchSchema } from '@/lib/validations/contract';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/companies/[id]/contracts
 * Get all contracts for a company
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check read permission
    await requirePermission(session, 'contract', 'read', companyId);

    // Resolve tenant context
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Parse query params
    const queryParams = contractSearchSchema.parse({
      query: searchParams.get('query') || undefined,
      status: searchParams.get('status') || undefined,
      contractType: searchParams.get('contractType') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') || 'updatedAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    const result = await getCompanyContracts(companyId, tenantId, queryParams);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
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
    }
    console.error('Error fetching contracts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/contracts
 * Create a new contract for the company
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check create permission
    await requirePermission(session, 'contract', 'create', companyId);

    const body = await request.json();

    // Resolve tenant context
    const { tenantId: bodyTenantId, ...contractData } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Parse and validate input
    const data = createContractSchema.parse(contractData);

    const contract = await createContract(
      { ...data, companyId },
      { tenantId, userId: session.id }
    );

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Company not found' || error.message === 'Document not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error creating contract:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
