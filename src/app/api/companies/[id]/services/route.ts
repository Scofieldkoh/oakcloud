import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/companies/:id/services
 * Get all services for a company (across all contracts)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: companyId } = await params;

    // Get company to verify it belongs to the same tenant
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Verify same tenant
    if (company.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all services for this company
    const services = await prisma.contractService.findMany({
      where: {
        contract: {
          companyId: companyId,
        },
        deletedAt: null,
      },
      include: {
        contract: {
          select: {
            title: true,
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
      autoRenewal: service.autoRenewal,
      renewalPeriodMonths: service.renewalPeriodMonths,
      companyName: company.name,
      companyId: companyId,
      contractTitle: service.contract.title,
    }));

    return NextResponse.json({ services: formattedServices });
  } catch (error) {
    console.error('Error fetching company services:', error);
    return NextResponse.json(
      { error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
