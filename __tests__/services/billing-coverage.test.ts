import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateOnly } from '@/services/service-schedule';
import { hashConfiguration } from '@/services/service-schedule';
import {
  type BillingScheduleConfigV1,
  type EvaluatedBillingOccurrence,
  reconcileBillingCoverage,
  billingCoverageIssueKey,
} from '@/services/billing';
import { evaluateBillingSchedule } from '@/services/billing/schedule';

const mocks = vi.hoisted(() => ({
  clientService: { findFirst: vi.fn() },
  businessCalendar: { findFirst: vi.fn() },
  billingOccurrence: { findMany: vi.fn() },
  billingCoverageIssue: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
};

const baseService = {
  id: 'service-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  status: 'ACTIVE',
  deletedAt: null,
  billingDisposition: 'UNREVIEWED',
  billingNotRequiredReason: null,
  feeLines: [],
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
    ...overrides,
  };
}

describe('reconcileBillingCoverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientService.findFirst.mockResolvedValue(baseService);
    mocks.businessCalendar.findFirst.mockResolvedValue(null);
    mocks.billingOccurrence.findMany.mockResolvedValue([]);
    mocks.billingCoverageIssue.findMany.mockResolvedValue([]);
    mocks.billingCoverageIssue.create.mockResolvedValue({});
    mocks.billingCoverageIssue.update.mockResolvedValue({});
    mocks.billingCoverageIssue.updateMany.mockResolvedValue({ count: 0 });
  });

  it.each([
    ['UNREVIEWED', [], 'MISSING_DISPOSITION'],
    ['CONFIGURED', [], 'MISSING_FEE_LINES'],
  ] as const)('detects %s coverage as %s', async (disposition, feeLines, issueType) => {
    mocks.clientService.findFirst.mockResolvedValue({ ...baseService, billingDisposition: disposition, feeLines });

    const result = await reconcileBillingCoverage(input);

    expect(result.openIssues).toContainEqual(expect.objectContaining({ type: issueType }));
  });

  it('requires a reason for Not required and creates no missing-fee issue', async () => {
    mocks.clientService.findFirst.mockResolvedValue({
      ...baseService,
      billingDisposition: 'NOT_REQUIRED',
      billingNotRequiredReason: 'Included in another engagement',
      feeLines: [],
    });

    const result = await reconcileBillingCoverage(input);

    expect(result.openIssues).toHaveLength(0);
    expect(mocks.billingCoverageIssue.create).not.toHaveBeenCalled();
  });

  it('uses a tenant and schedule-stable SHA-256 issue key and does not write in Observe mode', async () => {
    mocks.clientService.findFirst.mockResolvedValue({
      ...baseService,
      billingDisposition: 'CONFIGURED',
      feeLines: [feeLine({ amount: '-1.00' })],
    });

    const result = await reconcileBillingCoverage({ ...input, writeMode: 'OBSERVE' });
    const issue = result.openIssues.find((item) => item.type === 'INVALID_AMOUNT_OR_CURRENCY');

    expect(issue?.issueKey).toMatch(/^[a-f0-9]{64}$/);
    expect(issue?.issueKey).toBe(billingCoverageIssueKey({
      tenantId: 'tenant-1',
      clientServiceId: 'service-1',
      feeLineId: 'fee-1',
      type: 'INVALID_AMOUNT_OR_CURRENCY',
      scheduleKey: 'fee-line',
    }));
    expect(issue?.issueKey).toBe(hashConfiguration({
      tenantId: 'tenant-1',
      clientServiceId: 'service-1',
      feeLineId: 'fee-1',
      type: 'INVALID_AMOUNT_OR_CURRENCY',
      scheduleKey: 'fee-line',
    }));
    expect(mocks.billingCoverageIssue.create).not.toHaveBeenCalled();
    expect(mocks.billingCoverageIssue.update).not.toHaveBeenCalled();
    expect(mocks.billingCoverageIssue.updateMany).not.toHaveBeenCalled();
  });

  it('retains existing issues for paused services without creating rolling-gap issues', async () => {
    mocks.clientService.findFirst.mockResolvedValue({ ...baseService, status: 'PAUSED' });
    mocks.billingCoverageIssue.findMany.mockResolvedValue([{
      issueKey: 'existing-key',
      type: 'MISSING_DISPOSITION',
      severity: 'ERROR',
      feeLineId: null,
      details: { message: 'Review billing disposition' },
    }]);

    const result = await reconcileBillingCoverage(input);

    expect(result.openIssues).toEqual([expect.objectContaining({ issueKey: 'existing-key' })]);
    expect(mocks.billingCoverageIssue.create).not.toHaveBeenCalled();
    expect(mocks.billingOccurrence.findMany).not.toHaveBeenCalled();
  });

  it('counts billed, waived, and cancelled occurrences toward rolling coverage', async () => {
    mocks.clientService.findFirst.mockResolvedValue({
      ...baseService,
      billingDisposition: 'CONFIGURED',
      feeLines: [feeLine()],
    });
    const expected: EvaluatedBillingOccurrence[] = evaluateBillingSchedule({
      config: feeLine().scheduleConfig as BillingScheduleConfigV1,
      feeLine: { id: 'fee-1', amount: '100.00', currency: 'SGD' },
      calendar: {
        id: 'default',
        timeZone: 'Asia/Singapore',
        revision: 1,
        weekendDays: new Set([0, 6]),
        holidays: new Set(),
      },
      from: input.today,
      to: input.horizonEnd,
      generationKey: `billing-v1-${hashConfiguration({ feeLineId: 'fee-1' })}`,
    });
    mocks.billingOccurrence.findMany.mockResolvedValue(expected.map((occurrence, index) => ({
      ...occurrence,
      status: index % 3 === 0 ? 'BILLED' : index % 3 === 1 ? 'WAIVED' : 'CANCELLED',
    })));

    const result = await reconcileBillingCoverage(input);

    expect(result.openIssues).toHaveLength(0);
  });

  it('refreshes detected issues and resolves open issues no longer present', async () => {
    mocks.clientService.findFirst.mockResolvedValue({ ...baseService, billingDisposition: 'UNREVIEWED' });
    mocks.billingCoverageIssue.findMany.mockResolvedValue([{
      id: 'issue-1',
      issueKey: 'old-key',
      type: 'MISSING_FEE_LINES',
      severity: 'ERROR',
      feeLineId: null,
      details: { message: 'Old issue' },
    }]);

    const result = await reconcileBillingCoverage(input);

    expect(result.openIssues).toContainEqual(expect.objectContaining({ type: 'MISSING_DISPOSITION' }));
    expect(mocks.billingCoverageIssue.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        clientServiceId: 'service-1',
        resolvedAt: null,
        issueKey: { notIn: expect.arrayContaining([expect.any(String)]) },
      }),
      data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
    }));
  });
});
