import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { previewDeadlinesFromRuleInputs } from '@/services/deadline-generation.service';
import { deadlineRuleInputSchema } from '@/lib/validations/service';

type RouteParams = {
  params: Promise<{ id: string }>;
};

const previewSchema = z.object({
  tenantId: z.string().optional(),
  rules: z.array(deadlineRuleInputSchema).default([]),
  serviceStartDate: z.string().optional().nullable(),
  monthsAhead: z.number().int().min(1).max(60).optional(),
  fyeYearOverride: z.number().int().min(1900).max(2100).optional().nullable(),
});

/**
 * POST /api/companies/[id]/services/preview-deadlines
 * Preview generated deadlines from rule inputs without saving.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await requirePermission(session, 'contract', 'read', companyId);

    const body = await request.json();
    const data = previewSchema.parse(body);

    let tenantId: string | null = null;
    const tenantResult = await requireTenantContext(session, data.tenantId);
    if (tenantResult.error) {
      if (!session.isSuperAdmin) return tenantResult.error;

      const company = await prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
        select: { tenantId: true },
      });

      if (!company?.tenantId) {
        return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
      }

      tenantId = company.tenantId;
    } else {
      tenantId = tenantResult.tenantId;
    }

    const preview = await previewDeadlinesFromRuleInputs(
      companyId,
      data.rules,
      { tenantId, userId: session.id },
      {
        monthsAhead: data.monthsAhead,
        serviceStartDate: data.serviceStartDate ?? undefined,
        fyeYearOverride: data.fyeYearOverride ?? undefined,
      }
    );

    return NextResponse.json({
      deadlines: preview.deadlines.map((deadline) => ({
        taskName: deadline.title,
        statutoryDueDate: deadline.statutoryDueDate.toISOString(),
      })),
      warnings: preview.warnings,
    });
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
    console.error('Error previewing deadlines:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
