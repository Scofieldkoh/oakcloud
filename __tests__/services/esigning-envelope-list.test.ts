import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEsigningEnvelopes } from '@/services/esigning-envelope.service';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
  companyFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    esigningEnvelope: {
      count: mocks.count,
      findMany: mocks.findMany,
      groupBy: mocks.groupBy,
    },
    company: {
      findMany: mocks.companyFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const session = {
  id: 'user-1',
  tenantId: 'tenant-1',
  isSuperAdmin: true,
  isWorkspaceAdmin: true,
} as never;

describe('e-signing envelope list company filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (queries: Promise<unknown>[]) =>
      Promise.all(queries)
    );
    mocks.count.mockResolvedValue(27);
    mocks.findMany.mockResolvedValue([]);
    mocks.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { companyId: 'company-2', _count: { _all: 12 } },
        { companyId: null, _count: { _all: 3 } },
      ]);
    mocks.companyFindMany.mockResolvedValue([{ id: 'company-2', name: 'Acme Pte Ltd' }]);
  });

  it('applies the company filter before count, skip, and take', async () => {
    const result = await listEsigningEnvelopes(session, 'tenant-1', {
      companyId: 'company-2',
      page: 3,
      limit: 20,
      createdBy: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(mocks.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId: 'company-2' }),
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-2' }),
        skip: 40,
        take: 20,
      })
    );
    expect(result.total).toBe(27);
  });

  it('builds company options from all matching envelopes, not returned page rows', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'envelope-1',
        tenantId: 'tenant-1',
        title: 'NDA',
        message: null,
        status: 'COMPLETED',
        signingOrder: 'PARALLEL',
        expiresAt: null,
        reminderFrequencyDays: null,
        reminderStartDays: null,
        expiryWarningDays: null,
        companyId: null,
        company: null,
        certificateId: 'certificate-1',
        completedAt: null,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        voidedAt: null,
        voidReason: null,
        pdfGenerationStatus: null,
        pdfGenerationError: null,
        autoFilingStatus: 'NOT_REQUIRED',
        createdById: 'user-1',
        createdBy: { id: 'user-1', firstName: 'Sender', lastName: null, email: 'sender@example.com' },
        documents: [],
        recipients: [],
        emailDeliveries: [],
        metadata: null,
      },
    ]);

    const result = await listEsigningEnvelopes(session, 'tenant-1', {
      page: 1,
      limit: 20,
      createdBy: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(result.envelopes).toHaveLength(1);
    expect(result.companyOptions).toEqual([
      { id: 'company-2', name: 'Acme Pte Ltd', count: 12 },
    ]);
    expect(mocks.companyFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['company-2'] },
        tenantId: 'tenant-1',
      },
      select: { id: true, name: true },
    });
  });

  it('keeps status tab counts scoped to the company but company options scoped to the tab', async () => {
    await listEsigningEnvelopes(session, 'tenant-1', {
      companyId: 'company-2',
      statuses: ['DRAFT'],
      page: 1,
      limit: 20,
      createdBy: 'all',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(mocks.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['status'],
        where: expect.objectContaining({
          companyId: 'company-2',
        }),
      })
    );
    expect(mocks.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        by: ['companyId'],
        where: expect.objectContaining({
          status: { in: ['DRAFT'] },
          companyId: { not: null },
        }),
      })
    );
  });
});
