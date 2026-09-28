import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma';
import { ValidationError } from '@/lib/errors';

/**
 * Staff-facing filing status for a company obligation period. Each choice maps
 * onto the stored occurrence status and filing responsibility, so the writer
 * keeps it: STAFF responsibility is never replaced by a projection, and
 * completed or waived rows are preserved.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const COMPANY_OBLIGATION_STATUSES = [
  'TO_BE_CONFIRMED',
  'PENDING_FILING',
  'FILED',
  'MANAGED_EXTERNALLY',
  'NOT_REQUIRED',
] as const;

export type CompanyObligationStatus = typeof COMPANY_OBLIGATION_STATUSES[number];

export const COMPANY_OBLIGATION_STATUS_LABELS: Record<CompanyObligationStatus, string> = {
  TO_BE_CONFIRMED: 'To be confirmed',
  PENDING_FILING: 'Pending filing',
  FILED: 'Filed',
  MANAGED_EXTERNALLY: 'Managed externally',
  NOT_REQUIRED: 'Not required',
};

export function isCompanyObligationStatus(value: unknown): value is CompanyObligationStatus {
  return typeof value === 'string' && (COMPANY_OBLIGATION_STATUSES as readonly string[]).includes(value);
}

/** The status a stored company occurrence reads as. */
export function companyObligationStatusOf(occurrence: {
  status: string;
  filingResponsibility: string | null;
}): CompanyObligationStatus {
  if (occurrence.status === 'COMPLETED') return 'FILED';
  if (occurrence.status === 'WAIVED') return 'NOT_REQUIRED';
  if (occurrence.filingResponsibility === 'EXTERNAL_PROVIDER' || occurrence.filingResponsibility === 'CLIENT') {
    return 'MANAGED_EXTERNALLY';
  }
  if (occurrence.filingResponsibility === 'OAKCLOUD') return 'PENDING_FILING';
  return 'TO_BE_CONFIRMED';
}

const RESPONSIBILITY_FOR: Partial<Record<CompanyObligationStatus, 'OAKCLOUD' | 'EXTERNAL_PROVIDER' | 'UNCONFIRMED'>> = {
  TO_BE_CONFIRMED: 'UNCONFIRMED',
  PENDING_FILING: 'OAKCLOUD',
  MANAGED_EXTERNALLY: 'EXTERNAL_PROVIDER',
};

export type SetCompanyObligationStatusInput = {
  tenantId: string;
  companyId: string;
  obligationCode: string;
  periodKey: string;
  status: CompanyObligationStatus;
  actorId: string | null;
};

/**
 * Record a staff status on every stored occurrence of one company obligation
 * period. Returns how many occurrences changed; zero when the writer has not
 * created that period yet.
 */
export async function setCompanyObligationStatus(
  input: SetCompanyObligationStatusInput,
  db: Db = prisma,
): Promise<number> {
  if (!isCompanyObligationStatus(input.status)) throw new ValidationError('Unknown filing status');
  const occurrences = await db.deadlineOccurrence.findMany({
    where: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      ownershipScope: 'COMPANY',
      obligationCode: input.obligationCode,
      obligationPeriodKey: input.periodKey,
      status: { not: 'CANCELLED' },
    },
    select: { id: true, status: true, filingResponsibility: true, completedAt: true },
  });
  const now = new Date();
  let changed = 0;
  for (const occurrence of occurrences) {
    if (companyObligationStatusOf(occurrence) === input.status) continue;
    const data: Prisma.DeadlineOccurrenceUncheckedUpdateInput = {};
    if (input.status === 'FILED') {
      Object.assign(data, {
        status: 'COMPLETED',
        completedAt: occurrence.completedAt ?? now,
        completedById: input.actorId,
        waivedAt: null,
        waivedById: null,
        waiverReason: null,
        filingStatusUnconfirmed: false,
      });
    } else if (input.status === 'NOT_REQUIRED') {
      Object.assign(data, {
        status: 'WAIVED',
        waivedAt: now,
        waivedById: input.actorId,
        waiverReason: 'Marked not required by staff',
        completedAt: null,
        completedById: null,
        filingStatusUnconfirmed: false,
      });
    } else {
      Object.assign(data, {
        status: 'OPEN',
        completedAt: null,
        completedById: null,
        waivedAt: null,
        waivedById: null,
        waiverReason: null,
      });
    }

    const responsibility = RESPONSIBILITY_FOR[input.status];
    if (responsibility && responsibility !== occurrence.filingResponsibility) {
      Object.assign(data, {
        filingResponsibility: responsibility,
        responsibilitySource: 'STAFF',
        responsibilityConfirmedAt: responsibility === 'UNCONFIRMED' ? null : now,
        responsibilityConfirmedById: responsibility === 'UNCONFIRMED' ? null : input.actorId,
      });
      await db.deadlineResponsibilityChange.create({
        data: {
          tenantId: input.tenantId,
          occurrenceId: occurrence.id,
          previousResponsibility: (occurrence.filingResponsibility ?? null) as never,
          newResponsibility: responsibility,
          source: 'STAFF',
          actorId: input.actorId,
          reason: `Filing status set to ${COMPANY_OBLIGATION_STATUS_LABELS[input.status]}`,
        },
      });
    }
    await db.deadlineOccurrence.update({ where: { id: occurrence.id }, data });
    changed += 1;
  }
  return changed;
}
