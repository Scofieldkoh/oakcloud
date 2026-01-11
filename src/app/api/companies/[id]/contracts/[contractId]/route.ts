import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { getContractById, updateContract, deleteContract } from '@/services/contract.service';
import { updateContractSchema, deleteContractSchema } from '@/lib/validations/contract';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string; contractId: string }>;
};

/**
 * GET /api/companies/[id]/contracts/[contractId]
 * Get a single contract with its services
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

    const contract = await getContractById(contractId, tenantId);

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Verify contract belongs to the specified company
    if (contract.companyId !== companyId) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json(contract);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Error fetching contract:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/companies/[id]/contracts/[contractId]
 * Update a contract
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check update permission
    await requirePermission(session, 'contract', 'update', companyId);

    const body = await request.json();

    // Resolve tenant context
    const { tenantId: bodyTenantId, ...contractData } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Verify contract belongs to the company
    const existingContract = await getContractById(contractId, tenantId);
    if (!existingContract || existingContract.companyId !== companyId) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Parse and validate input
    const data = updateContractSchema.parse({ ...contractData, id: contractId });

    const contract = await updateContract(data, { tenantId, userId: session.id });

    return NextResponse.json(contract);
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
      if (error.message === 'Contract not found' || error.message === 'Document not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error updating contract:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]/contracts/[contractId]
 * Soft delete a contract
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, contractId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check delete permission
    await requirePermission(session, 'contract', 'delete', companyId);

    const body = await request.json();

    // Resolve tenant context
    const { tenantId: bodyTenantId, reason } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Verify contract belongs to the company
    const existingContract = await getContractById(contractId, tenantId);
    if (!existingContract || existingContract.companyId !== companyId) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Validate reason
    const validated = deleteContractSchema.parse({ id: contractId, reason });

    await deleteContract(contractId, validated.reason, { tenantId, userId: session.id });

    return NextResponse.json({ success: true });
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
    console.error('Error deleting contract:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
