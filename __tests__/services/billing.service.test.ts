import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '@/lib/errors';

const prismaMock = vi.hoisted(() => ({
  billingOccurrence: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import {
  deriveBillingTiming,
  getBillingOccurrence,
  listBillingOccurrences,
  resetBillingOverride,
  updateBillingOccurrence,
} from '@/services/billing';

const actor = { tenantId: 'tenant-1', userId: 'user-1', companyIds: ['company-1'] };
const occurrence = {
  id: 'occurrence-1',
  tenantId: actor.tenantId,
  companyId: 'company-1',
  clientServiceId: 'service-1',
  feeLineId: 'fee-1',
  billingPeriodKey: '2026-08',
  scheduleEntryKey: 'default',
  generationKey: 'generation-1',
  calculatedExpectedDate: new Date('2026-08-18T00:00:00.000Z'),
  operativeExpectedDate: new Date('2026-08-18T00:00:00.000Z'),
  dateOverridden: false,
  dateOverrideReason: null,
  dateOverriddenAt: null,
  dateOverriddenById: null,
  baseAmount: '100.00',
  baseCurrency: 'SGD',
  operativeAmount: '100.00',
  operativeCurrency: 'SGD',
  valueOverridden: false,
  valueOverrideReason: null,
  valueOverriddenAt: null,
  valueOverriddenById: null,
  status: 'OPEN' as const,
  billedDate: null,
  markedBilledAt: null,
  markedBilledById: null,
  externalReference: null,
  notes: null,
  waivedAt: null,
  waivedById: null,
  waiverReason: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
  cancellationReconciliationRequestId: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-10T00:00:00.000Z'),
  company: { id: 'company-1', tenantId: actor.tenantId, name: 'Example Pte. Ltd.', displayAlias: null, uen: '202400001A' },
  clientService: {
    id: 'service-1',
    tenantId: actor.tenantId,
    companyId: 'company-1',
    serviceName: 'Annual Return',
    familyName: 'Corporate',
    serviceVariant: {
      id: 'variant-1',
      tenantId: actor.tenantId,
      name: 'Annual Return',
      family: { id: 'family-1', tenantId: actor.tenantId, name: 'Corporate', displayColor: '#2F6F5E' },
    },
  },
  feeLine: { id: 'fee-1', tenantId: actor.tenantId, clientServiceId: 'service-1', description: 'Annual filing', amount: '100.00', currency: 'SGD' },
};

const search = {
  from: '2026-08-01',
  to: '2026-08-31',
  companyIds: [],
  familyIds: [],
  statuses: [],
  timing: [],
  page: 1,
  limit: 50,
  sortBy: 'expectedDate' as const,
  sortOrder: 'asc' as const,
};

describe('billing occurrence service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.billingOccurrence.findMany.mockResolvedValue([occurrence]);
    prismaMock.billingOccurrence.count.mockResolvedValue(1);
    prismaMock.billingOccurrence.findFirst.mockResolvedValue(occurrence);
    prismaMock.billingOccurrence.updateMany.mockResolvedValue({ count: 1 });
    auditMock.createAuditLog.mockResolvedValue(undefined);
  });

  it.each([
    ['2026-08-18', 'UPCOMING'],
    ['2026-08-17', 'DUE'],
    ['2026-08-16', 'OVERDUE'],
  ] as const)('derives %s as %s using the Singapore date', (expectedDate, timing) => {
    expect(deriveBillingTiming('OPEN', expectedDate, '2026-08-17')).toBe(timing);
  });

  it('does not derive timing for billed, waived, or cancelled rows', () => {
    expect(deriveBillingTiming('BILLED', '2026-08-16', '2026-08-17')).toBeNull();
    expect(deriveBillingTiming('WAIVED', '2026-08-16', '2026-08-17')).toBeNull();
    expect(deriveBillingTiming('CANCELLED', '2026-08-16', '2026-08-17')).toBeNull();
  });

  it('keeps tenant and accessible-company predicates in the list query', async () => {
    await listBillingOccurrences(search, actor, prismaMock as never, { today: '2026-08-17' });

    expect(prismaMock.billingOccurrence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        companyId: { in: ['company-1'] },
        operativeExpectedDate: { gte: new Date('2026-08-01T00:00:00.000Z'), lte: new Date('2026-08-31T00:00:00.000Z') },
        company: expect.objectContaining({ tenantId: actor.tenantId, deletedAt: null }),
      }),
    }));
  });

  it('returns a serializable DTO with company, family, fee, dates, values, and timing', async () => {
    const result = await listBillingOccurrences(search, actor, prismaMock as never, { today: '2026-08-17' });

    expect(result).toMatchObject({
      mode: 'TABLE',
      total: 1,
      items: [{
        id: 'occurrence-1',
        calculatedExpectedDate: '2026-08-18',
        operativeExpectedDate: '2026-08-18',
        timingState: 'UPCOMING',
        baseAmount: '100.00',
        operativeAmount: '100.00',
        billedDate: null,
        company: { displayLabel: 'E', name: 'Example Pte. Ltd.' },
        family: { name: 'Corporate', displayColor: '#2F6F5E' },
        feeLine: { id: 'fee-1', description: 'Annual filing' },
      }],
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('allows Billed without a billed date and records exact billed metadata', async () => {
    await updateBillingOccurrence('occurrence-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      status: 'BILLED',
      billedDate: null,
      updateScope: 'THIS_OCCURRENCE',
      reason: null,
    }, actor, prismaMock as never);

    expect(prismaMock.billingOccurrence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'occurrence-1', tenantId: actor.tenantId, updatedAt: occurrence.updatedAt, status: { not: 'CANCELLED' } }),
      data: expect.objectContaining({ status: 'BILLED', billedDate: null, markedBilledAt: expect.any(Date), markedBilledById: actor.userId }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'BillingOccurrence',
      reason: undefined,
      changes: expect.objectContaining({ status: expect.any(Object), markedBilledAt: expect.any(Object), markedBilledById: expect.any(Object), billedDate: expect.any(Object) }),
    }), expect.anything());
  });

  it('updates selected plus matching future Open rows only for THIS_AND_FUTURE value edits', async () => {
    prismaMock.billingOccurrence.findMany.mockResolvedValue([{ id: 'future-1' }]);
    await updateBillingOccurrence('occurrence-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      amount: '1500.00',
      currency: 'USD',
      updateScope: 'THIS_AND_FUTURE',
      reason: 'Updated engagement pricing',
    }, actor, prismaMock as never);

    expect(prismaMock.billingOccurrence.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.billingOccurrence.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        companyId: occurrence.companyId,
        feeLineId: occurrence.feeLineId,
        clientServiceId: occurrence.clientServiceId,
        scheduleEntryKey: occurrence.scheduleEntryKey,
        generationKey: occurrence.generationKey,
        status: 'OPEN',
        operativeExpectedDate: { gte: occurrence.operativeExpectedDate },
      }),
      data: expect.objectContaining({ operativeAmount: '1500.00', operativeCurrency: 'USD', valueOverridden: true }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ updateScope: 'THIS_AND_FUTURE', affectedCount: 2, affectedIds: ['occurrence-1', 'future-1'] }),
    }), expect.anything());
  });

  it('rejects system-cancelled rows without writing or auditing', async () => {
    prismaMock.billingOccurrence.findFirst.mockResolvedValue({ ...occurrence, status: 'CANCELLED' });

    await expect(updateBillingOccurrence('occurrence-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      status: 'OPEN',
      updateScope: 'THIS_OCCURRENCE',
      reason: 'Reopen',
    }, actor, prismaMock as never)).rejects.toMatchObject({ code: ErrorCodes.OCCURRENCE_IMMUTABLE });
    expect(prismaMock.billingOccurrence.updateMany).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('turns an optimistic claim miss into a version conflict without an audit', async () => {
    prismaMock.billingOccurrence.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateBillingOccurrence('occurrence-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      status: 'BILLED',
      updateScope: 'THIS_OCCURRENCE',
      reason: null,
    }, actor, prismaMock as never)).rejects.toMatchObject({ code: ErrorCodes.VERSION_CONFLICT });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('resets only the requested date override to calculated expected date', async () => {
    const overridden = {
      ...occurrence,
      dateOverridden: true,
      dateOverrideReason: 'Client request',
      dateOverriddenById: actor.userId,
      dateOverriddenAt: new Date('2026-08-10T00:00:00.000Z'),
      operativeExpectedDate: new Date('2026-08-20T00:00:00.000Z'),
    };
    prismaMock.billingOccurrence.findFirst.mockResolvedValue(overridden);

    await resetBillingOverride('occurrence-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      target: 'DATE',
      reason: 'Reset after review',
    }, actor, prismaMock as never);

    expect(prismaMock.billingOccurrence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operativeExpectedDate: overridden.calculatedExpectedDate,
        dateOverridden: false,
        dateOverrideReason: null,
        dateOverriddenById: null,
        dateOverriddenAt: null,
      }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalled();
  });
});
