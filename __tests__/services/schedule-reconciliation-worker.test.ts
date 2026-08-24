import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    clientService: { findMany: vi.fn() },
    workspace: { findMany: vi.fn() },
    serviceScheduleReconciliationRequest: { updateMany: vi.fn() },
  },
  flags: vi.fn(),
  reconcile: vi.fn(),
  billingReconcile: vi.fn(),
  enqueue: vi.fn(),
  logger: { info: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/logger', () => ({ createLogger: () => mocks.logger }));
vi.mock('@/services/schedule-reconciliation/settings', () => ({
  getServiceWorkspaceFlagsForTenant: mocks.flags,
}));
vi.mock('@/services/schedule-reconciliation/deadline-reconciler', () => ({
  reconcileClientServiceDeadlines: mocks.reconcile,
}));
vi.mock('@/services/billing', () => ({
  reconcileClientServiceBilling: mocks.billingReconcile,
}));
vi.mock('@/services/schedule-reconciliation/queue', () => ({
  enqueueScheduleReconciliation: mocks.enqueue,
}));

import {
  enqueueDailyRollingHorizonRequests,
  processScheduleReconciliationBatch,
  reconcileClientServiceThroughWorkerTransaction,
} from '@/services/schedule-reconciliation/worker';

const request = {
  id: 'request-1', tenantId: 'tenant-1', scopeType: 'CLIENT_SERVICE', scopeId: 'service-1',
  triggerType: 'CLIENT_SERVICE_CREATED', correlationId: 'corr-1', requestedById: null, attemptCount: 0,
};

function queryText(value: unknown): string {
  const shape = value as { sql?: string; strings?: readonly string[] };
  return [shape.sql, ...(shape.strings ?? [])].filter(Boolean).join(' ');
}

describe('schedule reconciliation worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logger.info.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'));
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
    mocks.prisma.$queryRaw.mockResolvedValue([request]);
    mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.clientService.findMany.mockResolvedValue([{ id: 'service-1' }]);
    mocks.prisma.workspace.findMany.mockResolvedValue([{ id: 'tenant-1' }]);
    mocks.flags.mockResolvedValue({ workspaceEnabled: true, deadlineWritesEnabled: false });
    mocks.reconcile.mockResolvedValue({
      tenantId: 'tenant-1', clientServiceId: 'service-1', reconciliationRequestId: 'request-1',
      writeMode: 'OBSERVE',
      counts: { created: 0, recalculated: 0, cancelled: 0, preserved: 0, noChange: 1 },
      preservedByReason: { MANUAL_TRIGGER: 0, HISTORICAL: 0, COMPLETED: 0, WAIVED: 0, CANCELLED: 0, OVERRIDDEN: 0 },
      warnings: [],
    });
    mocks.billingReconcile.mockResolvedValue({
      clientServiceId: 'service-1',
      created: 0,
      recalculated: 0,
      cancelled: 0,
      preserved: 0,
      preservedByReason: {
        MANUAL_TRIGGER: 0,
        HISTORICAL: 0,
        BILLED: 0,
        WAIVED: 0,
        CANCELLED: 0,
        OVERRIDDEN: 0,
      },
      warnings: [],
    });
  });

  it('claims with a five-minute lease and SKIP LOCKED, then completes the request', async () => {
    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    const claimSql = queryText(mocks.prisma.$queryRaw.mock.calls[0]?.[0]);
    expect(claimSql).toContain('FOR UPDATE');
    expect(claimSql).toContain('SKIP LOCKED');
    expect(mocks.reconcile.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      tenantId: 'tenant-1', clientServiceId: 'service-1', writeMode: 'OBSERVE', horizonEnd: '2027-08-18',
    }));
    expect(mocks.billingReconcile).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', clientServiceId: 'service-1', writeMode: 'OBSERVE', horizonEnd: '2027-08-18',
      reconciliationRequestId: 'request-1', cancellationActorId: null,
    }), expect.anything());
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-1', tenantId: 'tenant-1', status: 'PROCESSING' }),
      data: expect.objectContaining({ status: 'COMPLETED', leaseOwner: null, leaseExpiresAt: null }),
    }));
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mock.calls.filter(([call]) => (
      call.where?.leaseOwner !== undefined && call.data?.leaseExpiresAt instanceof Date
    ))).not.toHaveLength(0);
  });

  it('runs deadlines then billing through one leased service transaction', async () => {
    let leaseCalls = 0;

    const summary = await reconcileClientServiceThroughWorkerTransaction(mocks.prisma as never, {
      tenantId: 'tenant-1',
      clientServiceId: 'service-1',
      operation: 'PUBLISH',
      today: '2026-08-18',
      horizonEnd: '2027-08-18',
      writeMode: 'APPLY',
      reconciliationRequestId: 'request-1',
      cancellationActorId: null,
      assertLease: async () => { leaseCalls += 1; },
    });

    expect(leaseCalls).toBe(1);
    expect(summary).toEqual(expect.objectContaining({ deadlines: expect.any(Object), billing: expect.any(Object) }));
    expect(mocks.reconcile.mock.invocationCallOrder[0]).toBeLessThan(mocks.billingReconcile.mock.invocationCallOrder[0]!);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reclaims expired processing work and completes permanent missing-input outcomes with warnings', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ ...request, attemptCount: 1 }]);
    mocks.reconcile.mockResolvedValueOnce({
      tenantId: 'tenant-1', clientServiceId: 'service-1', reconciliationRequestId: 'request-1',
      writeMode: 'OBSERVE',
      counts: { created: 0, recalculated: 0, cancelled: 0, preserved: 0, noChange: 0 },
      preservedByReason: { MANUAL_TRIGGER: 0, HISTORICAL: 0, COMPLETED: 0, WAIVED: 0, CANCELLED: 0, OVERRIDDEN: 0 },
      warnings: [{
        code: 'MISSING_INPUT', message: 'Company.entityType is required', ruleId: 'rule-1',
        missingFields: ['entityType'], permanent: true,
      }],
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date), leaseOwner: null }),
    }));
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mock.calls.at(-1)?.[0].data.summary)
      .toEqual(expect.objectContaining({ warnings: [expect.objectContaining({ code: 'MISSING_INPUT', permanent: true })] }));
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });

  it('backs off transient failures using the bounded retry schedule', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ ...request, attemptCount: 1 }]);
    mocks.reconcile.mockRejectedValueOnce(new Error('temporary dependency failure'));

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1, leaseLost: 0 });
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', nextAttemptAt: new Date('2026-08-18T00:05:00.000Z') }),
    }));
  });

  it('does not let a throwing logger turn a completed request into a failed execution', async () => {
    mocks.logger.info.mockImplementation(() => {
      throw new Error('log sink unavailable');
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0, leaseLost: 0 });
  });

  it('does not let a throwing logger replace a retryable failure outcome', async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error('transient dependency failure: secret-note'));
    mocks.logger.info.mockImplementation(() => {
      throw new Error('log sink unavailable');
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1, leaseLost: 0 });
  });

  it('does not let a throwing logger replace a lease-loss outcome', async () => {
    let renewals = 0;
    mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mockImplementation(async (args?: unknown) => {
      const value = args as { where?: { leaseOwner?: string } } | undefined;
      if (value?.where?.leaseOwner !== undefined) {
        renewals += 1;
        return { count: renewals === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });
    mocks.logger.info.mockImplementation(() => {
      throw new Error('log sink unavailable');
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 0, leaseLost: 1 });
  });

  it('retains counts and warnings from committed services when a later service fails', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{
      ...request,
      scopeType: 'TENANT',
      scopeId: 'tenant-1',
    }]);
    mocks.prisma.clientService.findMany.mockResolvedValue([{ id: 'service-1' }, { id: 'service-2' }]);
    mocks.reconcile
      .mockResolvedValueOnce({
        tenantId: 'tenant-1', clientServiceId: 'service-1', reconciliationRequestId: 'request-1',
        writeMode: 'OBSERVE',
        counts: { created: 2, recalculated: 1, cancelled: 0, preserved: 3, noChange: 4 },
        preservedByReason: { MANUAL_TRIGGER: 1, HISTORICAL: 0, COMPLETED: 0, WAIVED: 0, CANCELLED: 0, OVERRIDDEN: 0 },
        warnings: [{ code: 'MISSING_INPUT', message: 'secret rule wording', missingFields: ['fye'] }],
      })
      .mockRejectedValueOnce(new Error('later service failed: private-note'));

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });
    const event = mocks.logger.info.mock.calls.at(-1)?.[1] as Record<string, unknown>;

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1, leaseLost: 0 });
    expect(event).toMatchObject({
      counts: { created: 2, recalculated: 1, cancelled: 0, preserved: 3, noChange: 4 },
      preservedByReason: { MANUAL_TRIGGER: 1 },
    });
    expect(event.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_INPUT' }),
      expect.objectContaining({ code: 'RECONCILIATION_FAILED' }),
    ]));
    expect(JSON.stringify(event)).not.toContain('secret rule wording');
    expect(JSON.stringify(event)).not.toContain('private-note');
  });

  it('retains counts and warnings from committed services when a later lease check fails', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{
      ...request,
      scopeType: 'TENANT',
      scopeId: 'tenant-1',
    }]);
    mocks.prisma.clientService.findMany.mockResolvedValue([{ id: 'service-1' }, { id: 'service-2' }]);
    mocks.reconcile.mockResolvedValueOnce({
      tenantId: 'tenant-1', clientServiceId: 'service-1', reconciliationRequestId: 'request-1',
      writeMode: 'OBSERVE',
      counts: { created: 1, recalculated: 0, cancelled: 1, preserved: 0, noChange: 0 },
      preservedByReason: { MANUAL_TRIGGER: 0, HISTORICAL: 1, COMPLETED: 0, WAIVED: 0, CANCELLED: 0, OVERRIDDEN: 0 },
      warnings: [{ code: 'RULE_WARNING', message: 'secret document content' }],
    });
    let renewals = 0;
    mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mockImplementation(async (args?: unknown) => {
      const value = args as { where?: { leaseOwner?: string } } | undefined;
      if (value?.where?.leaseOwner !== undefined) {
        renewals += 1;
        return { count: renewals <= 2 ? 1 : 0 };
      }
      return { count: 1 };
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });
    const event = mocks.logger.info.mock.calls.at(-1)?.[1] as Record<string, unknown>;

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 0, leaseLost: 1 });
    expect(event).toMatchObject({
      counts: { created: 1, recalculated: 0, cancelled: 1, preserved: 0, noChange: 0 },
      preservedByReason: { HISTORICAL: 1 },
    });
    expect(event.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RULE_WARNING' }),
      expect.objectContaining({ code: 'LEASE_LOST' }),
    ]));
    expect(JSON.stringify(event)).not.toContain('secret document content');
  });

  it('persists a stable safe error instead of arbitrary dependency text', async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error('secret document note: do-not-store-this'));

    await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    const update = mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mock.calls
      .map(([args]) => args as { data?: { lastErrorCode?: string; lastErrorMessage?: string; summary?: { warnings?: Array<{ message?: string }> } } })
      .filter((args) => args.data?.lastErrorCode !== undefined)
      .at(-1) as {
      data?: { lastErrorMessage?: string; summary?: { warnings?: Array<{ message?: string }> } };
    };
    expect(update.data?.lastErrorMessage).toBe('Reconciliation failed and will retry');
    expect(update.data?.lastErrorMessage).not.toContain('do-not-store-this');
    expect(update.data?.summary?.warnings?.[0]?.message).toBeUndefined();
  });

  it('does not count a permanent completion when the lease was handed off', async () => {
    const error = new Error('required evaluator input is missing');
    (error as { code?: string }).code = 'MISSING_RULE_INPUT';
    mocks.reconcile.mockRejectedValueOnce(error);
    mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mockImplementation(async (args?: unknown) => {
      const status = (args as { data?: { status?: string }} | undefined)?.data?.status;
      return { count: status === 'COMPLETED' ? 0 : 1 };
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 0, leaseLost: 1 });
  });

  it('does not count a transient failure when the lease was handed off', async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error('temporary dependency failure'));
    mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mockImplementation(async (args?: unknown) => {
      const status = (args as { data?: { status?: string }} | undefined)?.data?.status;
      return { count: status === 'PENDING' || status === 'FAILED' ? 0 : 1 };
    });

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 0, leaseLost: 1 });
  });

  it('enqueues one tenant rolling-horizon request per active workspace', async () => {
    vi.setSystemTime(new Date('2026-08-18T16:00:00.000Z'));
    const result = await enqueueDailyRollingHorizonRequests();

    expect(result).toBe(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(mocks.prisma, expect.objectContaining({
      tenantId: 'tenant-1', scopeType: 'TENANT', scopeId: 'tenant-1', triggerType: 'ROLLING_HORIZON',
    }));
  });

  it('carries RULE_ARCHIVED operation and rule identity into reconciliation', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{
      ...request,
      scopeType: 'RULE',
      scopeId: 'rule-1',
      triggerType: 'RULE_ARCHIVED',
    }]);
    mocks.prisma.clientService.findMany.mockResolvedValue([{ id: 'service-1' }]);

    await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      ruleId: 'rule-1',
      operation: 'ARCHIVE',
    }), expect.anything());
  });
});
