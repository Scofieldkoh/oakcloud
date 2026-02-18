import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    contract: {
      findFirst: vi.fn(),
    },
    contractService: {
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    mockTx: tx,
    mockPrisma: {
      $transaction: vi.fn(async (callback: (transactionClient: typeof tx) => unknown) => callback(tx)),
      contract: tx.contract,
      contractService: tx.contractService,
      auditLog: tx.auditLog,
      deadline: {
        deleteMany: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}));

vi.mock('@/services/deadline-rule.service', () => ({
  createDeadlineRules: vi.fn(),
}));

vi.mock('@/services/deadline-generation.service', () => ({
  generateDeadlinesFromRules: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { createBothServices } from '@/services/contract-service.service';

describe('createBothServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates linked one-time + recurring services and uses transaction-bound audit logs', async () => {
    vi.mocked(mockTx.contract.findFirst).mockResolvedValue({
      id: 'contract-1',
      title: 'Services',
      companyId: 'company-1',
      company: { id: 'company-1', name: 'Acme Pte Ltd' },
    } as never);

    vi.mocked(mockTx.contractService.create)
      .mockResolvedValueOnce({
        id: 'service-setup',
        name: 'Annual Accounts (Setup)',
        serviceType: 'ONE_TIME',
        status: 'ACTIVE',
        rate: 1200,
      } as never)
      .mockResolvedValueOnce({
        id: 'service-recurring',
        name: 'Annual Accounts (Recurring)',
        serviceType: 'RECURRING',
        status: 'ACTIVE',
        rate: 500,
      } as never);

    vi.mocked(mockTx.contractService.update).mockResolvedValue({ id: 'service-setup' } as never);
    vi.mocked(createAuditLog).mockResolvedValue({ id: 'audit-1' } as never);

    const result = await createBothServices(
      {
        contractId: 'contract-1',
        name: 'Annual Accounts',
        serviceType: 'BOTH',
        startDate: '2026-01-01',
        frequency: 'ONE_TIME',
        rate: 500,
        oneTimeRate: 1200,
      },
      { tenantId: 'tenant-1', userId: 'user-1' }
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.contractService.create).toHaveBeenCalledTimes(2);

    const firstCreate = vi.mocked(mockTx.contractService.create).mock.calls[0][0];
    expect(firstCreate.data).toMatchObject({
      name: 'Annual Accounts (Setup)',
      serviceType: 'ONE_TIME',
      frequency: 'ONE_TIME',
      rate: 1200,
    });

    const secondCreate = vi.mocked(mockTx.contractService.create).mock.calls[1][0];
    expect(secondCreate.data).toMatchObject({
      name: 'Annual Accounts (Recurring)',
      serviceType: 'RECURRING',
      frequency: 'ANNUALLY',
      rate: 500,
    });

    expect(mockTx.contractService.update).toHaveBeenCalledWith({
      where: { id: 'service-setup' },
      data: { linkedServiceId: 'service-recurring' },
    });

    expect(result.oneTimeService.linkedServiceId).toBe('service-recurring');
    expect(result.recurringService.id).toBe('service-recurring');

    expect(createAuditLog).toHaveBeenCalledTimes(3);
    vi.mocked(createAuditLog).mock.calls.forEach((call) => {
      expect(call[1]).toBeDefined();
    });
  });
});
