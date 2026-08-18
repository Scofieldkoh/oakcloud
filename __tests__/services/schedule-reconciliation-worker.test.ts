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
  enqueue: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/services/schedule-reconciliation/settings', () => ({
  getServiceWorkspaceFlagsForTenant: mocks.flags,
}));
vi.mock('@/services/schedule-reconciliation/deadline-reconciler', () => ({
  reconcileClientServiceDeadlines: mocks.reconcile,
}));
vi.mock('@/services/schedule-reconciliation/queue', () => ({
  enqueueScheduleReconciliation: mocks.enqueue,
}));

import { enqueueDailyRollingHorizonRequests, processScheduleReconciliationBatch } from '@/services/schedule-reconciliation/worker';

const request = {
  id: 'request-1', tenantId: 'tenant-1', scopeType: 'CLIENT_SERVICE', scopeId: 'service-1',
  triggerType: 'CLIENT_SERVICE_CREATED', correlationId: 'corr-1', attemptCount: 0,
};

function queryText(value: unknown): string {
  const shape = value as { sql?: string; strings?: readonly string[] };
  return [shape.sql, ...(shape.strings ?? [])].filter(Boolean).join(' ');
}

describe('schedule reconciliation worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-1', tenantId: 'tenant-1', status: 'PROCESSING' }),
      data: expect.objectContaining({ status: 'COMPLETED', leaseOwner: null, leaseExpiresAt: null }),
    }));
  });

  it('reclaims expired processing work and completes permanent missing-input outcomes with warnings', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ ...request, attemptCount: 1 }]);
    mocks.reconcile.mockRejectedValueOnce(Object.assign(new Error('rule input is missing'), { code: 'MISSING_RULE_INPUT' }));

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date), leaseOwner: null }),
    }));
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany.mock.calls.at(-1)?.[0].data.summary)
      .toEqual(expect.objectContaining({ warnings: [expect.stringContaining('MISSING_RULE_INPUT')] }));
  });

  it('backs off transient failures using the bounded retry schedule', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ ...request, attemptCount: 1 }]);
    mocks.reconcile.mockRejectedValueOnce(new Error('temporary dependency failure'));

    const result = await processScheduleReconciliationBatch({ limit: 1, concurrency: 1 });

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1 });
    expect(mocks.prisma.serviceScheduleReconciliationRequest.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', nextAttemptAt: new Date('2026-08-18T00:05:00.000Z') }),
    }));
  });

  it('enqueues one tenant rolling-horizon request per active workspace', async () => {
    vi.setSystemTime(new Date('2026-08-18T16:00:00.000Z'));
    const result = await enqueueDailyRollingHorizonRequests();

    expect(result).toBe(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(mocks.prisma, expect.objectContaining({
      tenantId: 'tenant-1', scopeType: 'TENANT', scopeId: 'tenant-1', triggerType: 'ROLLING_HORIZON',
    }));
  });
});
