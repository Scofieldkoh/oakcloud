import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    contractService: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    deadline: {
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { deleteContractService, updateContractService } from '@/services/contract-service.service';

describe('Contract Service deadline cascade cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('stopping a service removes future deadlines from the provided stop date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T10:30:00.000Z'));

    vi.mocked(prisma.contractService.findFirst).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      endDate: null,
      contract: {
        id: 'contract-1',
        title: 'Main contract',
        companyId: 'company-1',
      },
    } as never);

    vi.mocked(prisma.contractService.update).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      status: 'CANCELLED',
    } as never);

    vi.mocked(prisma.deadline.deleteMany).mockResolvedValue({ count: 3 } as never);

    await updateContractService(
      {
        id: 'service-1',
        status: 'CANCELLED',
        endDate: '2026-02-20',
      },
      { tenantId: 'tenant-1', userId: 'user-1' }
    );

    const call = vi.mocked(prisma.deadline.deleteMany).mock.calls[0][0];
    const statutoryDueDate = call?.where?.statutoryDueDate as { gte: Date } | undefined;
    const actualThreshold = statutoryDueDate?.gte as Date;

    const expectedThreshold = new Date('2026-02-20');
    expectedThreshold.setHours(0, 0, 0, 0);
    expectedThreshold.setDate(expectedThreshold.getDate() + 1);

    expect(actualThreshold.toISOString()).toBe(expectedThreshold.toISOString());
    expect(call?.where).toMatchObject({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      contractServiceId: 'service-1',
      deletedAt: null,
    });
  });

  it('does not remove deadlines when service update is not a stop and has no end date', async () => {
    vi.mocked(prisma.contractService.findFirst).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      endDate: null,
      contract: {
        id: 'contract-1',
        title: 'Main contract',
        companyId: 'company-1',
      },
    } as never);

    vi.mocked(prisma.contractService.update).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      status: 'ACTIVE',
    } as never);

    await updateContractService(
      {
        id: 'service-1',
        name: 'Updated name',
      },
      { tenantId: 'tenant-1', userId: 'user-1' }
    );

    expect(prisma.deadline.deleteMany).not.toHaveBeenCalled();
  });

  it('removes future deadlines when deleting a service (cutoff = deletion date)', async () => {
    vi.mocked(prisma.contractService.findFirst).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      endDate: null,
      contract: {
        id: 'contract-1',
        title: 'Main contract',
        companyId: 'company-1',
      },
    } as never);

    vi.mocked(prisma.contractService.update).mockResolvedValue({
      id: 'service-1',
      deletedAt: new Date(),
    } as never);

    vi.mocked(prisma.deadline.deleteMany).mockResolvedValue({ count: 2 } as never);

    await deleteContractService('service-1', { tenantId: 'tenant-1', userId: 'user-1' });

    const call = vi.mocked(prisma.deadline.deleteMany).mock.calls[0][0];
    expect(call?.where).toMatchObject({
      tenantId: 'tenant-1',
      companyId: 'company-1',
      contractServiceId: 'service-1',
      deletedAt: null,
    });
    expect(call?.where?.statutoryDueDate).toBeUndefined();
  });

  it('stopping a service uses existing end date as stop date when no end date is provided in update', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T10:30:00.000Z'));

    vi.mocked(prisma.contractService.findFirst).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      contract: {
        id: 'contract-1',
        title: 'Main contract',
        companyId: 'company-1',
      },
    } as never);

    vi.mocked(prisma.contractService.update).mockResolvedValue({
      id: 'service-1',
      name: 'Bookkeeping',
      status: 'CANCELLED',
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    } as never);

    vi.mocked(prisma.deadline.deleteMany).mockResolvedValue({ count: 4 } as never);

    await updateContractService(
      {
        id: 'service-1',
        status: 'CANCELLED',
      },
      { tenantId: 'tenant-1', userId: 'user-1' }
    );

    const call = vi.mocked(prisma.deadline.deleteMany).mock.calls[0][0];
    const statutoryDueDate = call?.where?.statutoryDueDate as { gte: Date } | undefined;
    const actualThreshold = statutoryDueDate?.gte as Date;

    const expectedThreshold = new Date('2026-12-31T00:00:00.000Z');
    expectedThreshold.setHours(0, 0, 0, 0);
    expectedThreshold.setDate(expectedThreshold.getDate() + 1);

    expect(actualThreshold.toISOString()).toBe(expectedThreshold.toISOString());
  });
});
