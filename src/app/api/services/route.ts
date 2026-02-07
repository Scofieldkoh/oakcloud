import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import {
  getAllServices,
  bulkUpdateServiceEndDate,
  bulkHardDeleteServices,
} from '@/services/contract-service.service';
import {
  serviceSearchSchema,
  bulkServiceEndDateSchema,
  bulkServiceHardDeleteSchema,
} from '@/lib/validations/contract';
import { ZodError } from 'zod';

/**
 * GET /api/services
 * Get all services across the tenant (for Services Overview page)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Resolve tenant context
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Parse query params
    const queryParams = serviceSearchSchema.parse({
      query: searchParams.get('query') || undefined,
      status: searchParams.get('status') || undefined,
      serviceType: searchParams.get('serviceType') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      contractId: searchParams.get('contractId') || undefined,
      startDateFrom: searchParams.get('startDateFrom') || undefined,
      startDateTo: searchParams.get('startDateTo') || undefined,
      endDateFrom: searchParams.get('endDateFrom') || undefined,
      endDateTo: searchParams.get('endDateTo') || undefined,
      rateFrom: searchParams.get('rateFrom') || undefined,
      rateTo: searchParams.get('rateTo') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') || 'updatedAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    const result = await getAllServices(tenantId, queryParams);

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
    console.error('Error fetching services:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/services
 * Bulk operations for services
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();

    const tenantIdParam = body?.tenantId;
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    if (!body?.action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    switch (body.action) {
      case 'bulk-end-date': {
        const parseResult = bulkServiceEndDateSchema.safeParse(body);
        if (!parseResult.success) {
          return NextResponse.json(
            { error: parseResult.error.errors[0]?.message || 'Invalid input' },
            { status: 400 }
          );
        }

        const { serviceIds, endDate } = parseResult.data;

        const services = await prisma.contractService.findMany({
          where: { id: { in: serviceIds }, tenantId, deletedAt: null },
          select: { id: true, contract: { select: { companyId: true } } },
        });

        const uniqueCompanyIds = [...new Set(services.map((service) => service.contract.companyId))];
        for (const companyId of uniqueCompanyIds) {
          const canUpdate = await hasPermission(session.id, 'company', 'update', companyId);
          if (!canUpdate) {
            return NextResponse.json({ error: 'Permission denied for one or more services' }, { status: 403 });
          }
        }

        const count = await bulkUpdateServiceEndDate(
          serviceIds,
          endDate,
          { tenantId, userId: session.id }
        );

        return NextResponse.json({ success: true, count });
      }

      case 'bulk-hard-delete': {
        const parseResult = bulkServiceHardDeleteSchema.safeParse(body);
        if (!parseResult.success) {
          return NextResponse.json(
            { error: parseResult.error.errors[0]?.message || 'Invalid input' },
            { status: 400 }
          );
        }

        const { serviceIds } = parseResult.data;

        const services = await prisma.contractService.findMany({
          where: { id: { in: serviceIds }, tenantId, deletedAt: null },
          select: { id: true, contract: { select: { companyId: true } } },
        });

        const uniqueCompanyIds = [...new Set(services.map((service) => service.contract.companyId))];
        for (const companyId of uniqueCompanyIds) {
          const canUpdate = await hasPermission(session.id, 'company', 'update', companyId);
          if (!canUpdate) {
            return NextResponse.json({ error: 'Permission denied for one or more services' }, { status: 403 });
          }
        }

        const count = await bulkHardDeleteServices(
          serviceIds,
          { tenantId, userId: session.id }
        );

        return NextResponse.json({ success: true, count });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
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
    console.error('Error handling service bulk operation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
