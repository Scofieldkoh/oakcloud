import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { getContractById } from '@/services/contract.service';
import {
  getContractServices,
  createContractService,
  createBothServices,
} from '@/services/contract-service.service';
import {
  createContractServiceSchema,
  getCreateServiceBillingAlignmentError,
} from '@/lib/validations/contract';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string; contractId: string }>;
};

/**
 * GET /api/companies/[id]/contracts/[contractId]/services
 * Get all services for a contract
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId } = await params;

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

    // Verify contract belongs to the company
    const contract = await getContractById(contractId, tenantId);
    if (!contract || contract.companyId !== companyId) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const services = await getContractServices(contractId, tenantId);

    return NextResponse.json({ services });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Contract not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error fetching services:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/contracts/[contractId]/services
 * Create a new service under a contract
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check create permission
    await requirePermission(session, 'contract', 'create', companyId);

    const body = await request.json();

    // Resolve tenant context
    const { tenantId: bodyTenantId, ...serviceData } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Verify contract belongs to the company
    const contract = await getContractById(contractId, tenantId);
    if (!contract || contract.companyId !== companyId) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Parse and validate input
    const data = createContractServiceSchema.parse(serviceData);
    const billingAlignmentError = getCreateServiceBillingAlignmentError(data);
    if (billingAlignmentError) {
      return NextResponse.json({ error: billingAlignmentError }, { status: 400 });
    }

    // Handle "BOTH" service type - creates two linked services in this contract
    if (data.serviceType === 'BOTH') {
      const result = await createBothServices(
        { ...data, contractId },
        { tenantId, userId: session.id }
      );

      return NextResponse.json({
        services: [result.oneTimeService, result.recurringService],
        linkedServiceIds: [result.oneTimeService.id, result.recurringService.id],
        deadlinesGenerated:
          (result.oneTimeService.deadlinesGenerated ?? 0) +
          (result.recurringService.deadlinesGenerated ?? 0),
      }, { status: 201 });
    }

    const service = await createContractService(
      { ...data, contractId },
      { tenantId, userId: session.id }
    );

    return NextResponse.json(service, { status: 201 });
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
      if (error.message === 'Contract not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error creating service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
