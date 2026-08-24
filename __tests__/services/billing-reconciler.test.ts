import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateOnly } from '@/services/service-schedule';
import { hashConfiguration } from '@/services/service-schedule';
import { reconcileClientServiceBilling } from '@/services/billing';

type Occurrence = Record<string, unknown> & {
  id: string;
  feeLineId: string;
  billingPeriodKey: string;
  scheduleEntryKey: string;
  generationKey: string;
  calculatedExpectedDate: Date;
  operativeExpectedDate: Date;
  dateOverridden: boolean;
  valueOverridden: boolean;
  status: string;
};

const mocks = vi.hoisted(() => ({
  clientService: { findFirst: vi.fn() },
  businessCalendar: { findFirst: vi.fn() },
  billingOccurrence: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks }));

const input = {
  tenantId: 'tenant-1',
  clientServiceId: 'service-1',
  today: '2026-08-18' as DateOnly,
  horizonEnd: '2027-08-18' as DateOnly,
  writeMode: 'APPLY' as const,
  reconciliationRequestId: 'request-1',
};

function feeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fee-1',
    description: 'Monthly support',
    amount: '100.00',
    currency: 'SGD',
    billingFrequency: 'MONTHLY',
    billingStartDate: new Date('2026-08-01T00:00:00.000Z'),
    scheduleConfig: {
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: '2026-08-01',
      customInterval: { unit: 'MONTH', count: 1 },
      scheduleEntries: [{
        key: 'default',
        label: 'Billing date',
        expression: { kind: 'DAY_OF_MONTH', day: 1 },
        businessDayAdjustment: 'NONE',
      }],
    },
    isActive: true,
    deletedAt: null,
    deletedReason: null,
    ...overrides,
  };
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: 'service-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
    status: 'ACTIVE',
    deletedAt: null,
    endDate: null,
    billingDisposition: 'CONFIGURED',
    feeLines: [feeLine()],
    ...overrides,
  };
}

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'occ-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
    clientServiceId: 'service-1',
    feeLineId: 'fee-1',
    billingPeriodKey: '2026-09',
    scheduleEntryKey: 'default',
    generationKey: 'generation-1',
    calculatedExpectedDate: new Date('2026-09-01T00:00:00.000Z'),
    operativeExpectedDate: new Date('2026-09-01T00:00:00.000Z'),
    dateOverridden: false,
    valueOverridden: false,
    baseAmount: '100.00',
    baseCurrency: 'SGD',
    operativeAmount: '100.00',
    operativeCurrency: 'SGD',
    status: 'OPEN',
    billedDate: null,
    markedBilledAt: null,
    markedBilledById: null,
    waivedAt: null,
    waivedById: null,
    waiverReason: null,
    cancelledAt: null,
    cancelledById: null,
    cancellationReason: null,
    ...overrides,
  };
}

describe('reconcileClientServiceBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientService.findFirst.mockResolvedValue(service());
    mocks.businessCalendar.findFirst.mockResolvedValue(null);
    mocks.billingOccurrence.findMany.mockResolvedValue([]);
    mocks.billingOccurrence.createMany.mockResolvedValue({ count: 12 });
    mocks.billingOccurrence.updateMany.mockResolvedValue({ count: 1 });
  });

  it('creates rolling occurrences from active configured fee lines', async () => {
    const result = await reconcileClientServiceBilling(input);

    expect(result.created).toBe(12);
    expect(mocks.billingOccurrence.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-1',
          companyId: 'company-1',
          clientServiceId: 'service-1',
          feeLineId: 'fee-1',
          billingPeriodKey: expect.any(String),
          generationKey: expect.any(String),
          status: 'OPEN',
        }),
      ]),
    }));
  });

  it('preserves historical, billed, waived, cancelled, and overridden occurrences', async () => {
    mocks.billingOccurrence.findMany.mockResolvedValue([
      occurrence({ id: 'occ-historical', billingPeriodKey: '2026-07', calculatedExpectedDate: new Date('2026-07-01'), operativeExpectedDate: new Date('2026-07-01') }),
      occurrence({ id: 'occ-billed', billingPeriodKey: '2028-01', status: 'BILLED' }),
      occurrence({ id: 'occ-waived', billingPeriodKey: '2028-02', status: 'WAIVED' }),
      occurrence({ id: 'occ-cancelled', billingPeriodKey: '2028-03', status: 'CANCELLED' }),
      occurrence({ id: 'occ-overridden', billingPeriodKey: '2028-04', dateOverridden: true, operativeExpectedDate: new Date('2028-04-15') }),
    ]);

    const result = await reconcileClientServiceBilling({ ...input, writeMode: 'OBSERVE' });

    expect(result.preservedByReason).toMatchObject({
      HISTORICAL: 1,
      BILLED: 1,
      WAIVED: 1,
      CANCELLED: 1,
      OVERRIDDEN: 1,
    });
    expect(mocks.billingOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['PAUSED', null],
    ['ENDED', null],
    ['ACTIVE', new Date('2026-08-01')],
  ] as const)('does not extend a %s/deleted service', async (status, deletedAt) => {
    mocks.clientService.findFirst.mockResolvedValue(service({ status, deletedAt }));

    const result = await reconcileClientServiceBilling(input);

    expect(result.created).toBe(0);
    expect(mocks.billingOccurrence.createMany).not.toHaveBeenCalled();
  });

  it('does not generate for a not-required service and reports future cancellation as a proposed change', async () => {
    mocks.clientService.findFirst.mockResolvedValue(service({ billingDisposition: 'NOT_REQUIRED', billingNotRequiredReason: 'Included elsewhere' }));
    mocks.billingOccurrence.findMany.mockResolvedValue([occurrence({ billingPeriodKey: '2026-09' })]);

    const result = await reconcileClientServiceBilling({ ...input, writeMode: 'APPLY' });

    expect(result.created).toBe(0);
    expect(result.cancelled).toBe(1);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CANCELLATION_ACTOR_REQUIRED' }),
    ]));
    expect(mocks.billingOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it('preserves existing rows when a fee-line schedule is incomplete', async () => {
    mocks.clientService.findFirst.mockResolvedValue(service({
      feeLines: [feeLine({ scheduleConfig: null, billingStartDate: null })],
    }));
    mocks.billingOccurrence.findMany.mockResolvedValue([occurrence({ billingPeriodKey: '2026-09' })]);

    const result = await reconcileClientServiceBilling(input);

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_SCHEDULE', feeLineId: 'fee-1' }),
    ]));
    expect(result.preserved).toBe(1);
    expect(result.cancelled).toBe(0);
    expect(mocks.billingOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it('refreshes calculated/base values while retaining operative overrides', async () => {
    const generation = `billing-v1-${hashConfiguration({
      feeLineId: 'fee-1',
      config: feeLine().scheduleConfig,
    })}`;
    const overridden = occurrence({
      id: 'occ-overridden',
      billingPeriodKey: '2026-09',
      generationKey: generation,
      dateOverridden: true,
      calculatedExpectedDate: new Date('2026-08-25'),
      operativeExpectedDate: new Date('2026-09-15'),
      valueOverridden: true,
      baseAmount: '90.00',
      baseCurrency: 'SGD',
      operativeAmount: '125.00',
      operativeCurrency: 'USD',
    });
    mocks.billingOccurrence.findMany.mockResolvedValue([overridden]);

    const result = await reconcileClientServiceBilling(input);

    expect(result.preservedByReason.OVERRIDDEN).toBe(1);
    expect(mocks.billingOccurrence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'occ-overridden', tenantId: 'tenant-1', clientServiceId: 'service-1' },
      data: expect.objectContaining({
        calculatedExpectedDate: new Date('2026-09-01T00:00:00.000Z'),
        baseAmount: '100.00',
      }),
    }));
    const update = mocks.billingOccurrence.updateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(update).not.toHaveProperty('operativeExpectedDate');
    expect(update).not.toHaveProperty('operativeAmount');
  });

  it('writes cancellation metadata only when an actor is supplied', async () => {
    mocks.billingOccurrence.findMany.mockResolvedValue([occurrence({ billingPeriodKey: '2026-09', generationKey: 'old-generation' })]);

    await reconcileClientServiceBilling({
      ...input,
      cancellationActorId: 'user-1',
    });

    expect(mocks.billingOccurrence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'CANCELLED',
        cancelledById: 'user-1',
        cancelledAt: expect.any(Date),
        cancellationReason: expect.any(String),
      }),
    }));
  });
});
