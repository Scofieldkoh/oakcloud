import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itemFindFirst: vi.fn(),
  itemUpdateMany: vi.fn(),
  stepCount: vi.fn(),
  stepFindFirst: vi.fn(),
  stepCreate: vi.fn(),
}));

const tx = {
  businessAssistantRunItem: {
    findFirst: mocks.itemFindFirst,
    updateMany: mocks.itemUpdateMany,
  },
  businessAssistantRunStep: {
    count: mocks.stepCount,
    findFirst: mocks.stepFindFirst,
    updateMany: vi.fn(),
    create: mocks.stepCreate,
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    businessAssistantRunItem: { updateMany: mocks.itemUpdateMany },
  },
}));
vi.mock('@/lib/prisma-transaction', () => ({
  runSerializableTransaction: vi.fn(async (_db: unknown, callback: (client: typeof tx) => unknown) => callback(tx)),
}));

import { startStageAttempt, updateClaimedItem } from '@/services/business-assistant/claim.repository';
import { BUSINESS_ASSISTANT_OPERATIONAL_LIMITS } from '@/services/business-assistant/operational-policy';

const claim = {
  id: 'item-1',
  tenantId: 'tenant-1',
  runId: 'run-1',
  activeStage: 'EXECUTION',
  token: 'claim-token',
  generation: 4,
  leaseExpiresAt: new Date(Date.now() + 60_000),
};

describe('Business Assistant claim hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.itemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.itemFindFirst.mockResolvedValue({ retryCount: 0, id: claim.id, activeStage: 'EXECUTION' });
    mocks.stepCount.mockResolvedValue(0);
    mocks.stepFindFirst.mockResolvedValue(null);
    mocks.stepCreate.mockResolvedValue({ id: 'step-1' });
  });

  it('atomically marks an item failed when the next worker failure exhausts its retry budget', async () => {
    mocks.itemFindFirst.mockResolvedValue({ retryCount: BUSINESS_ASSISTANT_OPERATIONAL_LIMITS.maxWorkerFailuresPerItem - 1 });
    await expect(updateClaimedItem(claim, { retryCount: { increment: 1 }, availableAt: new Date() })).resolves.toBe(true);
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ retryCount: BUSINESS_ASSISTANT_OPERATIONAL_LIMITS.maxWorkerFailuresPerItem - 1 }),
      data: expect.objectContaining({
        lifecycleState: 'FAILED',
        activeStage: null,
        dispositionReason: 'RETRY_BUDGET_EXHAUSTED',
        retryCount: { increment: 1 },
      }),
    }));
  });

  it('keeps an item retryable below the terminal retry boundary', async () => {
    mocks.itemFindFirst.mockResolvedValue({ retryCount: 1 });
    const availableAt = new Date(Date.now() + 2_000);
    await updateClaimedItem(claim, { retryCount: { increment: 1 }, availableAt });
    expect(mocks.itemUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { retryCount: { increment: 1 }, availableAt },
    }));
  });

  it('rejects a new stage attempt when the durable total-stage budget is exhausted', async () => {
    mocks.stepCount.mockResolvedValue(BUSINESS_ASSISTANT_OPERATIONAL_LIMITS.maxTotalStageAttemptsPerItem);
    await expect(startStageAttempt(claim, 'EXECUTION', { operationId: 'op-1' })).rejects.toThrow(/stage budget exhausted/i);
    expect(mocks.stepCreate).not.toHaveBeenCalled();
  });
});
