import { randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { currentDateInSingapore, addMonthsClamped } from '@/services/service-schedule/date-only';
import { getServiceWorkspaceFlagsForTenant } from './settings';
import { reconcileClientServiceDeadlines } from './deadline-reconciler';
import { enqueueScheduleReconciliation } from './queue';
import type {
  DeadlineReconciliationCounts,
  DeadlineReconciliationPreservedCounts,
  DeadlineReconciliationResult,
} from './types';

const log = createLogger('schedule-reconciliation-worker');

const BACKOFF_MINUTES = [1, 5, 15, 60, 240] as const;
const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000; // 5 minutes
const PERMANENT_ERROR_CODES = new Set([
  'MISSING_RULE_INPUT',
  'RULE_NOT_APPLICABLE',
  'VALIDATION_ERROR',
  'SCHEDULE_LIMIT_EXCEEDED',
  'DUPLICATE_SCHEDULE_ENTRY',
]);

export type ProcessBatchOptions = {
  limit?: number;
  concurrency?: number;
  now?: Date;
  leaseMs?: number;
};

export type ProcessBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
  summaries: DeadlineReconciliationResult[];
};

/** Queue one tenant-scoped rolling-horizon pass for each active workspace. */
export async function enqueueDailyRollingHorizonRequests(now: Date = new Date()): Promise<number> {
  const today = currentDateInSingapore(now);
  const tenants = await prisma.workspace.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });

  for (const tenant of tenants) {
    await prisma.$transaction((tx) => enqueueScheduleReconciliation(tx, {
      tenantId: tenant.id,
      scopeType: 'TENANT',
      scopeId: tenant.id,
      triggerType: 'ROLLING_HORIZON',
      correlationId: `rolling-horizon-${today}`,
      requestedById: null,
      notBefore: now,
    }));
  }
  return tenants.length;
}

type ClaimedRequest = {
  id: string;
  tenantId: string;
  scopeType: 'TENANT' | 'COMPANY' | 'CLIENT_SERVICE' | 'RULE' | 'BUSINESS_CALENDAR';
  scopeId: string;
  triggerType: string;
  correlationId: string;
  attemptCount: number;
  leaseOwner: string;
};

async function claimRequests(
  limit: number,
  now: Date,
  leaseMs: number,
): Promise<ClaimedRequest[]> {
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const workerId = randomUUID();

  return prisma.$transaction(async (tx) => {
    // Claim pending or expired-processing requests using FOR UPDATE SKIP LOCKED
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        tenantId: string;
        scopeType: 'TENANT' | 'COMPANY' | 'CLIENT_SERVICE' | 'RULE' | 'BUSINESS_CALENDAR';
        scopeId: string;
        triggerType: string;
        correlationId: string;
        attemptCount: number;
      }>
    >(Prisma.sql`
      SELECT
        "id",
        "tenant_id" AS "tenantId",
        "scope_type" AS "scopeType",
        "scope_id" AS "scopeId",
        "trigger_type" AS "triggerType",
        "correlation_id" AS "correlationId",
        "attempt_count" AS "attemptCount"
      FROM "service_schedule_reconciliation_requests"
      WHERE ("status" = 'PENDING' AND "next_attempt_at" <= ${now})
         OR ("status" = 'PROCESSING' AND "lease_expires_at" <= ${now})
      ORDER BY "next_attempt_at" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);

    const claimed: ClaimedRequest[] = [];

    for (const row of rows) {
      const result = await tx.serviceScheduleReconciliationRequest.updateMany({
        where: {
          id: row.id,
          tenantId: row.tenantId,
          OR: [
            { status: 'PENDING', nextAttemptAt: { lte: now } },
            { status: 'PROCESSING', leaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          startedAt: now,
          leaseOwner: workerId,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
        },
      });

      if (result.count === 1) {
        claimed.push({
          ...row,
          attemptCount: row.attemptCount + 1,
          leaseOwner: workerId,
        });
      }
    }

    return claimed;
  });
}

async function resolveClientServiceIds(
  req: ClaimedRequest,
): Promise<string[]> {
  switch (req.scopeType) {
    case 'CLIENT_SERVICE':
      return [req.scopeId];

    case 'COMPANY': {
      const services = await prisma.clientService.findMany({
        where: { tenantId: req.tenantId, companyId: req.scopeId, deletedAt: null },
        select: { id: true },
      });
      return services.map((s) => s.id);
    }

    case 'RULE': {
      const services = await prisma.clientService.findMany({
        where: {
          tenantId: req.tenantId,
          deletedAt: null,
          deadlineRules: { some: { ruleId: req.scopeId } },
        },
        select: { id: true },
      });
      return services.map((s) => s.id);
    }

    case 'BUSINESS_CALENDAR':
    case 'TENANT': {
      const services = await prisma.clientService.findMany({
        where: { tenantId: req.tenantId, deletedAt: null },
        select: { id: true },
      });
      return services.map((s) => s.id);
    }

    default:
      return [];
  }
}

async function processSingleRequest(
  req: ClaimedRequest,
  now: Date,
): Promise<{ success: boolean; summaries: DeadlineReconciliationResult[] }> {
  try {
    const flags = await getServiceWorkspaceFlagsForTenant(req.tenantId);
    if (!flags.workspaceEnabled) {
      await prisma.serviceScheduleReconciliationRequest.updateMany({
        where: { id: req.id, tenantId: req.tenantId, status: 'PROCESSING', leaseOwner: req.leaseOwner },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          summary: { warnings: ['Services workspace is disabled for this workspace'] } as never,
        },
      });
      return { success: true, summaries: [] };
    }
    const writeMode = flags.deadlineWritesEnabled ? 'APPLY' : 'OBSERVE';
    const today = currentDateInSingapore(now);
    const horizonEnd = addMonthsClamped(today, 12);

    const clientServiceIds = await resolveClientServiceIds(req);
    const summaries: DeadlineReconciliationResult[] = [];

    const aggregatedCounts: DeadlineReconciliationCounts = {
      created: 0,
      recalculated: 0,
      cancelled: 0,
      preserved: 0,
      noChange: 0,
    };

    const aggregatedPreserved: DeadlineReconciliationPreservedCounts = {
      MANUAL_TRIGGER: 0,
      HISTORICAL: 0,
      COMPLETED: 0,
      WAIVED: 0,
      CANCELLED: 0,
      OVERRIDDEN: 0,
    };

    const allWarnings: string[] = [];

    for (const clientServiceId of clientServiceIds) {
      const result = await prisma.$transaction((tx) => reconcileClientServiceDeadlines({
        tenantId: req.tenantId,
        clientServiceId,
        today,
        horizonEnd,
        writeMode,
        reconciliationRequestId: req.id,
      }, tx));

      summaries.push(result);

      aggregatedCounts.created += result.counts.created;
      aggregatedCounts.recalculated += result.counts.recalculated;
      aggregatedCounts.cancelled += result.counts.cancelled;
      aggregatedCounts.preserved += result.counts.preserved;
      aggregatedCounts.noChange += result.counts.noChange;

      for (const [reason, count] of Object.entries(result.preservedByReason)) {
        aggregatedPreserved[reason as keyof DeadlineReconciliationPreservedCounts] += count;
      }

      allWarnings.push(...result.warnings);
    }

    await prisma.serviceScheduleReconciliationRequest.updateMany({
      where: {
        id: req.id,
        tenantId: req.tenantId,
        status: 'PROCESSING',
        leaseOwner: req.leaseOwner,
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        summary: {
          clientServiceCount: clientServiceIds.length,
          counts: aggregatedCounts,
          preservedByReason: aggregatedPreserved,
          warnings: allWarnings,
        } as never,
      },
    });

    return { success: true, summaries };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as { code?: string })?.code ?? 'RECONCILIATION_FAILED';

    log.error('Reconciliation request failed', {
      requestId: req.id,
      tenantId: req.tenantId,
      error,
    });

    const isPermanent = PERMANENT_ERROR_CODES.has(errorCode);
    const backoffIndex = Math.min(req.attemptCount - 1, BACKOFF_MINUTES.length - 1);
    const backoffMinutes = BACKOFF_MINUTES[Math.max(0, backoffIndex)] ?? 1;
    const nextAttemptAt = new Date(now.getTime() + backoffMinutes * 60_000);

    if (isPermanent) {
      await prisma.serviceScheduleReconciliationRequest.updateMany({
        where: {
          id: req.id,
          tenantId: req.tenantId,
          status: 'PROCESSING',
          leaseOwner: req.leaseOwner,
        },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
          summary: {
            warnings: [`${errorCode}: ${errorMessage}`],
            permanent: true,
          } as never,
          nextAttemptAt: now,
        },
      });
      return { success: true, summaries: [] };
    }

    const retryExhausted = req.attemptCount > MAX_ATTEMPTS;

    await prisma.serviceScheduleReconciliationRequest.updateMany({
      where: {
        id: req.id,
        tenantId: req.tenantId,
        status: 'PROCESSING',
        leaseOwner: req.leaseOwner,
      },
      data: {
        status: retryExhausted ? 'FAILED' : 'PENDING',
        completedAt: retryExhausted ? now : null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
        nextAttemptAt: retryExhausted ? now : nextAttemptAt,
      },
    });

    return { success: false, summaries: [] };
  }
}

export async function processScheduleReconciliationBatch(
  options: ProcessBatchOptions = {},
): Promise<ProcessBatchResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const concurrency = Math.min(Math.max(options.concurrency ?? 4, 1), 20);
  const now = options.now ?? new Date();
  const leaseMs = options.leaseMs ?? LEASE_MS;

  const claims = await claimRequests(limit, now, leaseMs);
  let completed = 0;
  let failed = 0;
  const allSummaries: DeadlineReconciliationResult[] = [];

  for (let offset = 0; offset < claims.length; offset += concurrency) {
    const chunk = claims.slice(offset, offset + concurrency);
    const results = await Promise.all(
      chunk.map((req) => processSingleRequest(req, now)),
    );

    for (const res of results) {
      if (res.success) {
        completed += 1;
        allSummaries.push(...res.summaries);
      } else {
        failed += 1;
      }
    }
  }

  return {
    claimed: claims.length,
    completed,
    failed,
    summaries: allSummaries,
  };
}
