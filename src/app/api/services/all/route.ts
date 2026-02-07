import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/services/all
 * Get all services across all companies in the tenant (excluding current company)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate tenant ID (required for this endpoint)
    if (!session.tenantId) {
      return NextResponse.json(
        { error: 'Tenant ID required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const excludeCompanyId = searchParams.get('excludeCompanyId');

    // Fetch all services in tenant
    const services = await prisma.contractService.findMany({
      where: {
        tenantId: session.tenantId,
        ...(excludeCompanyId ? {
          contract: { companyId: { not: excludeCompanyId } },
        } : {}),
        deletedAt: null,
      },
      include: {
        contract: {
          select: {
            title: true,
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const formattedServices = services.map((service) => ({
      id: service.id,
      name: service.name,
      serviceType: service.serviceType,
      status: service.status,
      rate: service.rate,
      currency: service.currency,
      frequency: service.frequency,
      startDate: service.startDate,
      endDate: service.endDate,
      scope: service.scope,
      companyName: service.contract.company.name,
      companyId: service.contract.company.id,
      contractTitle: service.contract.title,
    }));

    return NextResponse.json({ services: formattedServices });
  } catch (error) {
    console.error('Error fetching all services:', error);
    return NextResponse.json(
      { error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
