import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { createContract, getContractById } from '@/services/contract.service';
import { createContractService, getAllServices } from '@/services/contract-service.service';
import { createContractServiceSchema, serviceSearchSchema } from '@/lib/validations/contract';

type RouteParams = {
  params: Promise<{ id: string }>;
};

interface ResolveServiceContractIdInput {
  companyId: string;
  tenantId: string;
  userId: string;
  preferredContractId?: string;
}

async function resolveServiceContractId({
  companyId,
  tenantId,
  userId,
  preferredContractId,
}: ResolveServiceContractIdInput): Promise<string> {
  if (preferredContractId) {
    const preferredContract = await getContractById(preferredContractId, tenantId);
    if (!preferredContract || preferredContract.companyId !== companyId) {
      throw new Error('Contract not found');
    }
    return preferredContract.id;
  }

  const defaultContract = await prisma.contract.findFirst({
    where: {
      tenantId,
      companyId,
      deletedAt: null,
      title: {
        equals: 'Services',
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (defaultContract) {
    return defaultContract.id;
  }

  const existingContracts = await prisma.contract.findMany({
    where: {
      tenantId,
      companyId,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
    take: 2,
  });

  if (existingContracts.length === 1) {
    return existingContracts[0].id;
  }

  const createdContract = await createContract(
    {
      companyId,
      title: 'Services',
      contractType: 'SERVICE_AGREEMENT',
      status: 'ACTIVE',
      startDate: new Date(),
      internalNotes: 'Auto-created for services-first management.',
    },
    { tenantId, userId }
  );

  return createdContract.id;
}

/**
 * GET /api/companies/[id]/services
 * List services for a company.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await requirePermission(session, 'contract', 'read', companyId);

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const queryParams = serviceSearchSchema.parse({
      query: searchParams.get('query') || undefined,
      status: searchParams.get('status') || undefined,
      serviceType: searchParams.get('serviceType') || undefined,
      contractId: searchParams.get('contractId') || undefined,
      startDateFrom: searchParams.get('startDateFrom') || undefined,
      startDateTo: searchParams.get('startDateTo') || undefined,
      endDateFrom: searchParams.get('endDateFrom') || undefined,
      endDateTo: searchParams.get('endDateTo') || undefined,
      rateFrom: searchParams.get('rateFrom') || undefined,
      rateTo: searchParams.get('rateTo') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50,
      sortBy: searchParams.get('sortBy') || 'updatedAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    const result = await getAllServices(tenantId, {
      ...queryParams,
      companyId,
    });

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
    }
    console.error('Error fetching company services:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/services
 * Create a service for a company, with contract assignment handled automatically.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await requirePermission(session, 'contract', 'create', companyId);

    const body = await request.json();
    const {
      tenantId: bodyTenantId,
      contractId,
      ...serviceData
    } = body as {
      tenantId?: string;
      contractId?: string;
      [key: string]: unknown;
    };

    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const data = createContractServiceSchema.parse(serviceData);
    const resolvedContractId = await resolveServiceContractId({
      companyId,
      tenantId,
      userId: session.id,
      preferredContractId: contractId,
    });

    const service = await createContractService(
      { ...data, contractId: resolvedContractId },
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
        return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
      }
    }
    console.error('Error creating company service:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
