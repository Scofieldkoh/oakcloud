import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createAuditLog } from '@/lib/audit';
import { compareDateOnly, parseDateOnly } from '@/services/service-schedule/date-only';
import { financialYearEndInYear, normalYearOfAssessment } from '@/services/service-schedule/obligation-periods';
import type { DateOnly } from '@/services/service-schedule';
import { enqueueScheduleReconciliation } from '@/services/schedule-reconciliation/queue';

/**
 * Staff-confirmed financial periods. Confirming the first period after
 * incorporation (which may run longer than 12 months) and its Year of
 * Assessment replaces the provisional derived periods it overlaps, so company
 * tax deadlines stop needing review.
 */

export type FirstFinancialPeriodSuggestion = {
  periodStart: DateOnly;
  periodEnd: DateOnly;
  yearOfAssessment: number;
};

function toDateOnly(value: Date | null | undefined): DateOnly | null {
  return value ? value.toISOString().slice(0, 10) as DateOnly : null;
}

/** First FYE on or after incorporation, as a starting point staff can change. */
export function suggestFirstFinancialPeriod(company: {
  incorporationDate: Date | string | null;
  financialYearEndMonth: number | null;
  financialYearEndDay: number | null;
}): FirstFinancialPeriodSuggestion | null {
  const incorporation = typeof company.incorporationDate === 'string'
    ? company.incorporationDate.slice(0, 10) as DateOnly
    : toDateOnly(company.incorporationDate);
  const month = company.financialYearEndMonth;
  const day = company.financialYearEndDay;
  if (!incorporation || !month || !day) return null;
  const year = Number(incorporation.slice(0, 4));
  let end = financialYearEndInYear(year, month, day);
  if (compareDateOnly(end, incorporation) < 0) end = financialYearEndInYear(year + 1, month, day);
  return { periodStart: incorporation, periodEnd: end, yearOfAssessment: normalYearOfAssessment(end) };
}

export type ConfirmFinancialPeriodInput = {
  periodStart: DateOnly;
  periodEnd: DateOnly;
  yearOfAssessment: number;
};

export async function confirmFinancialPeriod(
  params: { tenantId: string; companyId: string; userId: string | null },
  input: ConfirmFinancialPeriodInput,
) {
  parseDateOnly(input.periodStart);
  parseDateOnly(input.periodEnd);
  if (compareDateOnly(input.periodEnd, input.periodStart) <= 0) {
    throw new ValidationError('The period must end after it starts.');
  }
  const months = (Number(input.periodEnd.slice(0, 4)) - Number(input.periodStart.slice(0, 4))) * 12
    + Number(input.periodEnd.slice(5, 7)) - Number(input.periodStart.slice(5, 7));
  if (months > 18) {
    throw new ValidationError('A financial period cannot run longer than 18 months.');
  }
  const endYear = Number(input.periodEnd.slice(0, 4));
  if (!Number.isInteger(input.yearOfAssessment) || input.yearOfAssessment < endYear || input.yearOfAssessment > endYear + 1) {
    throw new ValidationError(`The Year of Assessment for a period ending in ${endYear} must be ${endYear} or ${endYear + 1}.`);
  }

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: params.companyId, tenantId: params.tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundError('Company not found');

    const start = new Date(`${input.periodStart}T00:00:00.000Z`);
    const end = new Date(`${input.periodEnd}T00:00:00.000Z`);
    const overlapping = await tx.companyFinancialPeriod.findFirst({
      where: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        periodStart: { lte: end },
        periodEnd: { gte: start },
        NOT: { periodEnd: end },
      },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlapping) {
      throw new ValidationError(
        `This overlaps the confirmed period ${toDateOnly(overlapping.periodStart)} to ${toDateOnly(overlapping.periodEnd)}.`,
      );
    }

    const now = new Date();
    const period = await tx.companyFinancialPeriod.upsert({
      where: { tenantId_companyId_periodEnd: { tenantId: params.tenantId, companyId: params.companyId, periodEnd: end } },
      create: {
        tenantId: params.tenantId,
        companyId: params.companyId,
        periodStart: start,
        periodEnd: end,
        yearsOfAssessment: [input.yearOfAssessment],
        provenance: 'CONFIRMED',
        confirmedAt: now,
        confirmedById: params.userId,
      },
      update: {
        periodStart: start,
        yearsOfAssessment: [input.yearOfAssessment],
        provenance: 'CONFIRMED',
        confirmedAt: now,
        confirmedById: params.userId,
      },
    });

    await enqueueScheduleReconciliation(tx, {
      tenantId: params.tenantId,
      scopeType: 'COMPANY',
      scopeId: params.companyId,
      triggerType: 'COMPANY_SOURCE_CHANGED',
      correlationId: `financial-period-${period.id}-${now.getTime()}`,
      requestedById: params.userId,
    });

    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId ?? undefined,
      companyId: params.companyId,
      entityType: 'Company',
      entityId: params.companyId,
      entityName: company.name,
      action: 'UPDATE',
      changeSource: 'MANUAL',
      changes: {
        financialPeriod: {
          old: null,
          new: `${input.periodStart} to ${input.periodEnd} (YA ${input.yearOfAssessment})`,
        },
      },
    }, tx);

    return {
      id: period.id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      yearOfAssessment: input.yearOfAssessment,
    };
  });
}
