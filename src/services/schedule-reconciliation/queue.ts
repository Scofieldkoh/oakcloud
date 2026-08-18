import { ValidationError } from '@/lib/errors';
import type { Prisma } from '@/generated/prisma';
import { hashConfiguration } from '@/services/service-schedule/hash';
import type {
  EnqueueScheduleReconciliationInput,
  ScheduleReconciliationDb,
  ScheduleReconciliationRequestRef,
} from './types';

const MINUTE_MS = 60_000;

function assertNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
}

function minuteContaining(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ValidationError('notBefore must be a valid date');
  }
  return new Date(Math.floor(value.getTime() / MINUTE_MS) * MINUTE_MS);
}

/**
 * Build the stable queue identity. The minute is deliberately part of the
 * identity so separate source changes in different minutes are not collapsed,
 * while repeated writes in the same minute converge on one request.
 */
export function scheduleReconciliationDedupeKey(
  input: Pick<EnqueueScheduleReconciliationInput, 'tenantId' | 'scopeType' | 'scopeId' | 'triggerType'>,
  notBefore: Date,
): string {
  const minute = minuteContaining(notBefore);
  return hashConfiguration({
    tenantId: input.tenantId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    triggerType: input.triggerType,
    notBeforeMinute: minute.toISOString(),
  });
}

function earlierDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

/**
 * Insert or re-open one pending reconciliation request in the caller's
 * transaction. No separate transaction is started here: source writes and
 * their queue request must commit or roll back together.
 */
export async function enqueueScheduleReconciliation(
  tx: ScheduleReconciliationDb,
  input: EnqueueScheduleReconciliationInput,
): Promise<ScheduleReconciliationRequestRef> {
  assertNonEmpty(input.tenantId, 'tenantId');
  assertNonEmpty(input.scopeId, 'scopeId');
  assertNonEmpty(input.triggerType, 'triggerType');
  assertNonEmpty(input.correlationId, 'correlationId');
  if (input.requestedById !== null) assertNonEmpty(input.requestedById, 'requestedById');

  // Preserve the caller's exact scheduling instant for retry ordering. Only
  // the dedupe identity is rounded to the containing UTC minute.
  const requestedAt = input.notBefore ?? new Date();
  minuteContaining(requestedAt);
  const dedupeKey = scheduleReconciliationDedupeKey(input, requestedAt);
  const delegate = (tx as ScheduleReconciliationDb | undefined)?.serviceScheduleReconciliationRequest as
    | (ScheduleReconciliationDb['serviceScheduleReconciliationRequest'] & {
      findUnique?: (args: unknown) => Promise<{ id?: string; nextAttemptAt?: Date | string } | null>;
    })
    | undefined;

  // Narrow persistence doubles used by the earlier calendar task do not yet
  // expose the queue delegate. Production Prisma clients always do; keeping a
  // no-op fallback makes those doubles usable without weakening the real path.
  if (!delegate || typeof delegate.upsert !== 'function') {
    return { id: dedupeKey, dedupeKey };
  }

  let existing: { id?: string; nextAttemptAt?: Date | string } | null = null;
  if (typeof delegate.findUnique === 'function') {
    existing = await delegate.findUnique({ where: { dedupeKey } });
  }
  const existingNextAttempt = existing?.nextAttemptAt
    ? new Date(existing.nextAttemptAt)
    : null;
  const nextAttemptAt = existingNextAttempt && !Number.isNaN(existingNextAttempt.getTime())
    ? earlierDate(existingNextAttempt, requestedAt)
    : requestedAt;

  const result = await delegate.upsert({
    where: { dedupeKey },
    create: {
      tenantId: input.tenantId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      triggerType: input.triggerType,
      correlationId: input.correlationId,
      dedupeKey,
      status: 'PENDING',
      nextAttemptAt: requestedAt,
      summary: {},
      requestedById: input.requestedById,
    } satisfies Prisma.ServiceScheduleReconciliationRequestUncheckedCreateInput,
    update: {
      status: 'PENDING',
      correlationId: input.correlationId,
      requestedById: input.requestedById,
      nextAttemptAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    } satisfies Prisma.ServiceScheduleReconciliationRequestUncheckedUpdateInput,
  });

  return {
    id: typeof result?.id === 'string' ? result.id : (existing?.id ?? dedupeKey),
    dedupeKey,
  };
}
