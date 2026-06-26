import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || searchParams.get('query') || '').trim();
    const parsedLimit = Number(searchParams.get('limit') || DEFAULT_LIMIT);
    const limit = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT, MAX_LIMIT));

    const effectiveTenantId = session.tenantId;

    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
    };

    if (effectiveTenantId) {
      where.tenantId = effectiveTenantId;
    } else {
      return NextResponse.json({ options: [] });
    }

    if (!session.isSuperAdmin && !session.isWorkspaceAdmin && !session.hasAllCompaniesAccess) {
      if (!session.companyIds.length) {
        return NextResponse.json({ options: [] });
      }
      where.id = { in: session.companyIds };
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { uen: { contains: query, mode: 'insensitive' } },
      ];
    }

    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        uen: true,
        primarySsicDescription: true,
        homeCurrency: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    return NextResponse.json({
      options: companies.map((company) => ({
        id: company.id,
        name: company.name,
        uen: company.uen,
        primarySsicDescription: company.primarySsicDescription,
        homeCurrency: company.homeCurrency,
      })),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
