import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireTenantContext } from '@/lib/api-helpers';
import { getAllServices } from '@/services/contract-service.service';
import { serviceSearchSchema } from '@/lib/validations/contract';
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
      endDateFrom: searchParams.get('endDateFrom') || undefined,
      endDateTo: searchParams.get('endDateTo') || undefined,
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
