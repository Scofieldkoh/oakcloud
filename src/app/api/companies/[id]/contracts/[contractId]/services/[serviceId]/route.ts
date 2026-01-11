import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { getContractById } from '@/services/contract.service';
import {
  getContractServiceById,
  updateContractService,
  deleteContractService,
} from '@/services/contract-service.service';
import { updateContractServiceSchema } from '@/lib/validations/contract';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string; contractId: string; serviceId: string }>;
};

/**
 * GET /api/companies/[id]/contracts/[contractId]/services/[serviceId]
 * Get a single service
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId, serviceId } = await params;

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

    const service = await getContractServiceById(serviceId, tenantId);

    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Verify service belongs to the specified contract and company
    if (service.contractId !== contractId || service.contract?.companyId !== companyId) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    return NextResponse.json(service);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Error fetching service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/companies/[id]/contracts/[contractId]/services/[serviceId]
 * Update a service
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId, serviceId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check update permission
    await requirePermission(session, 'contract', 'update', companyId);

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

    // Verify service belongs to the contract
    const existingService = await getContractServiceById(serviceId, tenantId);
    if (!existingService || existingService.contractId !== contractId) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    // Parse and validate input
    const data = updateContractServiceSchema.parse({ ...serviceData, id: serviceId });

    const service = await updateContractService(data, { tenantId, userId: session.id });

    return NextResponse.json(service);
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
      if (error.message === 'Service not found' || error.message === 'Contract not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error updating service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]/contracts/[contractId]/services/[serviceId]
 * Soft delete a service
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId, serviceId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check delete permission
    await requirePermission(session, 'contract', 'delete', companyId);

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

    // Verify service belongs to the contract
    const existingService = await getContractServiceById(serviceId, tenantId);
    if (!existingService || existingService.contractId !== contractId) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    await deleteContractService(serviceId, { tenantId, userId: session.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Service not found' || error.message === 'Contract not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error deleting service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
