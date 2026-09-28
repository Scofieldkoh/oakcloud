import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { currentDateInSingapore, type DateOnly } from '@/services/service-schedule';
import {
  isPostpaidTrigger,
  POSTPAID_SCHEDULE_ENTRY_KEY,
  POSTPAID_TRIGGER_OBLIGATIONS,
  postpaidBillingPeriodKey,
  postpaidGenerationKey,
} from './postpaid-triggers';

export { isPostpaidGenerationKey, POSTPAID_GENERATION_PREFIX, POSTPAID_SCHEDULE_ENTRY_KEY } from './postpaid-triggers';

/**
 * Postpaid fee lines bill once per Year of Assessment when their trigger
 * filing is set to Filed. Entries are keyed by fee line and YA, so setting
 * Filed again, or filing both ECI and Form C, never adds a second entry.
 * Moving the YA back from Filed cancels an entry that is still Open; filing
 * again reopens it. Billed, waived and staff-cancelled entries are kept.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const POSTPAID_UNFILED_REASON = 'Filing status is no longer Filed';

export type PostpaidBillingSyncResult = {
  created: number;
  reopened: number;
  cancelled: number;
  updated: number;
};

type FiledObligation = { obligationCode: string | null; yearOfAssessment: number | null; completedAt: Date | null };

type PostpaidService = {
  id: string;
  companyId: string;
  startDate: Date;
  engagementStartYearOfAssessment: number | null;
  feeLines: Array<{ id: string; amount: Prisma.Decimal; currency: string; postpaidTrigger: string | null }>;
};

function dateValue(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function amountString(value: unknown): string {
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  return new Prisma.Decimal(String(value)).toFixed(2);
}

/**
 * The YAs a service bills for, each with the day its trigger was first filed.
 * A YA bills from the service's engagement start YA onwards; with no
 * engagement start YA, it bills when it was filed on or after the service
 * start.
 */
export function postpaidBillableYears(
  service: Pick<PostpaidService, 'startDate' | 'engagementStartYearOfAssessment'>,
  trigger: string | null,
  filed: readonly FiledObligation[],
): Map<number, DateOnly> {
  const result = new Map<number, DateOnly>();
  if (!isPostpaidTrigger(trigger)) return result;
  const codes = POSTPAID_TRIGGER_OBLIGATIONS[trigger];
  const serviceStart = service.startDate.toISOString().slice(0, 10);
  for (const row of filed) {
    if (!row.obligationCode || !codes.includes(row.obligationCode)) continue;
    if (row.yearOfAssessment == null || !row.completedAt) continue;
    const filedOn = currentDateInSingapore(row.completedAt);
    if (service.engagementStartYearOfAssessment != null) {
      if (row.yearOfAssessment < service.engagementStartYearOfAssessment) continue;
    } else if (filedOn < serviceStart) {
      continue;
    }
    const earlier = result.get(row.yearOfAssessment);
    if (!earlier || filedOn < earlier) result.set(row.yearOfAssessment, filedOn);
  }
  return result;
}

export type SyncPostpaidBillingInput = {
  tenantId: string;
  companyId: string;
  /** Sync one service instead of every service of the company. */
  clientServiceId?: string;
  /** Who cancels an entry whose YA is no longer Filed (a user or a reconciliation request). */
  cancelledById?: string | null;
  cancellationReconciliationRequestId?: string | null;
};

/**
 * Bring a company's postpaid billing entries in line with its filed
 * obligations. Without a cancelling user or request, entries are only
 * created or reopened.
 */
export async function syncPostpaidBilling(
  input: SyncPostpaidBillingInput,
  db: Db = prisma,
): Promise<PostpaidBillingSyncResult> {
  const result: PostpaidBillingSyncResult = { created: 0, reopened: 0, cancelled: 0, updated: 0 };
  const services = await db.clientService.findMany({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      ...(input.clientServiceId ? { id: input.clientServiceId } : {}),
      status: 'ACTIVE',
      deletedAt: null,
      billingDisposition: 'CONFIGURED',
      feeLines: { some: { billingTiming: 'POSTPAID', isActive: true, deletedAt: null } },
    },
    select: {
      id: true,
      companyId: true,
      startDate: true,
      engagementStartYearOfAssessment: true,
      feeLines: {
        where: { billingTiming: 'POSTPAID', isActive: true, deletedAt: null },
        select: { id: true, amount: true, currency: true, postpaidTrigger: true },
      },
    },
  }) as PostpaidService[];
  if (services.length === 0) return result;

  const filed = await db.deadlineOccurrence.findMany({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      ownershipScope: 'COMPANY',
      obligationCode: { in: [...new Set(Object.values(POSTPAID_TRIGGER_OBLIGATIONS).flat())] },
      status: 'COMPLETED',
      yearOfAssessment: { not: null },
    },
    select: { obligationCode: true, yearOfAssessment: true, completedAt: true },
  });

  for (const service of services) {
    for (const feeLine of service.feeLines) {
      const billable = postpaidBillableYears(service, feeLine.postpaidTrigger, filed);
      const generationKey = postpaidGenerationKey(feeLine.id);
      const existing = await db.billingOccurrence.findMany({
        where: { tenantId: input.tenantId, clientServiceId: service.id, feeLineId: feeLine.id, generationKey },
        select: {
          id: true,
          billingPeriodKey: true,
          status: true,
          cancellationReason: true,
          dateOverridden: true,
          valueOverridden: true,
          baseAmount: true,
          baseCurrency: true,
        },
      });
      const byPeriod = new Map(existing.map((row) => [row.billingPeriodKey, row]));
      const amount = amountString(feeLine.amount);

      const creates: Prisma.BillingOccurrenceCreateManyInput[] = [];
      for (const [yearOfAssessment, filedOn] of billable) {
        const periodKey = postpaidBillingPeriodKey(yearOfAssessment);
        const row = byPeriod.get(periodKey);
        if (!row) {
          creates.push({
            tenantId: input.tenantId,
            companyId: service.companyId,
            clientServiceId: service.id,
            feeLineId: feeLine.id,
            billingPeriodKey: periodKey,
            scheduleEntryKey: POSTPAID_SCHEDULE_ENTRY_KEY,
            generationKey,
            calculatedExpectedDate: dateValue(filedOn),
            operativeExpectedDate: dateValue(filedOn),
            baseAmount: amount,
            baseCurrency: feeLine.currency,
            operativeAmount: amount,
            operativeCurrency: feeLine.currency,
            status: 'OPEN',
          });
          continue;
        }
        if (row.status === 'CANCELLED' && row.cancellationReason === POSTPAID_UNFILED_REASON) {
          await db.billingOccurrence.update({
            where: { id: row.id },
            data: {
              status: 'OPEN',
              cancelledAt: null,
              cancelledById: null,
              cancellationReason: null,
              cancellationReconciliationRequestId: null,
              calculatedExpectedDate: dateValue(filedOn),
              ...(row.dateOverridden ? {} : { operativeExpectedDate: dateValue(filedOn) }),
            },
          });
          result.reopened += 1;
          continue;
        }
        // Keep an Open entry's fee in step with the line, as prepaid rows are.
        if (row.status === 'OPEN'
          && (amountString(row.baseAmount) !== amount || row.baseCurrency !== feeLine.currency)) {
          await db.billingOccurrence.update({
            where: { id: row.id },
            data: {
              baseAmount: amount,
              baseCurrency: feeLine.currency,
              ...(row.valueOverridden ? {} : { operativeAmount: amount, operativeCurrency: feeLine.currency }),
            },
          });
          result.updated += 1;
        }
      }
      if (creates.length > 0) {
        const created = await db.billingOccurrence.createMany({ data: creates, skipDuplicates: true });
        result.created += created.count;
      }

      const billablePeriods = new Set([...billable.keys()].map(postpaidBillingPeriodKey));
      const unfiled = existing.filter((row) => row.status === 'OPEN' && !billablePeriods.has(row.billingPeriodKey));
      if (unfiled.length > 0 && (input.cancelledById || input.cancellationReconciliationRequestId)) {
        const cancelled = await db.billingOccurrence.updateMany({
          where: { id: { in: unfiled.map((row) => row.id) }, status: 'OPEN' },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: input.cancelledById ?? null,
            cancellationReason: POSTPAID_UNFILED_REASON,
            cancellationReconciliationRequestId: input.cancelledById ? null : input.cancellationReconciliationRequestId ?? null,
          },
        });
        result.cancelled += cancelled.count;
      }
    }
  }
  return result;
}
