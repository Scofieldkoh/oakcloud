import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';
import { requirePermission } from '@/lib/rbac';
import { confirmFinancialPeriod } from '@/services/compliance-monitoring/financial-periods';
import type { DateOnly } from '@/services/service-schedule';

const confirmPeriodSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  yearOfAssessment: z.number().int().min(1990).max(2200),
}).strict();

/** Confirm a financial period (for example the first one after incorporation) and its Year of Assessment. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'company', 'update', id);
    const tenantId = requireSessionWorkspaceId(session);
    const input = confirmPeriodSchema.parse(await request.json());
    const period = await confirmFinancialPeriod(
      { tenantId, companyId: id, userId: session.id },
      {
        periodStart: input.periodStart as DateOnly,
        periodEnd: input.periodEnd as DateOnly,
        yearOfAssessment: input.yearOfAssessment,
      },
    );
    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    return createErrorResponse(error);
  }
}
