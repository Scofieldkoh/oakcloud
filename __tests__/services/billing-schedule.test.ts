import { describe, expect, it } from 'vitest';

import {
  convertLegacyBillingSchedule,
  evaluateBillingSchedule,
} from '@/services/billing';
import type { BillingScheduleConfigV1 } from '@/services/billing';
import type { BusinessCalendarSnapshot } from '@/services/service-schedule';

const calendar: BusinessCalendarSnapshot = {
  id: 'sg-calendar',
  timeZone: 'Asia/Singapore',
  revision: 1,
  weekendDays: new Set([0, 6]),
  holidays: new Set(['2026-02-16']),
};

const entry = (key: string, day: number, businessDayAdjustment: 'NONE' | 'PREVIOUS' | 'NEXT' = 'NONE') => ({
  key,
  label: key,
  expression: { kind: 'DAY_OF_MONTH' as const, day },
  businessDayAdjustment,
});

describe('legacy billing schedule conversion', () => {
  it.each([
    ['MONTHLY', 1],
    ['QUARTERLY', 3],
    ['SEMI_ANNUALLY', 6],
    ['ANNUALLY', 12],
  ] as const)('converts %s without guessing a missing start date', (frequency, monthCount) => {
    expect(convertLegacyBillingSchedule({
      billingFrequency: frequency,
      billingStartDate: null,
      customFrequencyLabel: null,
    })).toMatchObject({
      config: {
        cadence: frequency,
        startDate: null,
        customInterval: { unit: 'MONTH', count: monthCount },
        scheduleEntries: [],
      },
      issueType: 'MISSING_START_DATE',
    });
  });

  it('converts a dated legacy line into a stable default entry', () => {
    expect(convertLegacyBillingSchedule({
      billingFrequency: 'MONTHLY',
      billingStartDate: '2026-08-31',
      customFrequencyLabel: null,
    })).toEqual({
      config: {
        schemaVersion: 1,
        cadence: 'MONTHLY',
        startDate: '2026-08-31',
        customInterval: { unit: 'MONTH', count: 1 },
        scheduleEntries: [{
          key: 'default',
          label: 'Billing date',
          expression: { kind: 'DAY_OF_MONTH', day: 31 },
          businessDayAdjustment: 'NONE',
        }],
      },
      issueType: null,
    });
  });

  it('keeps one-time conversion bounded and preserves its optional start date', () => {
    expect(convertLegacyBillingSchedule({
      billingFrequency: 'ONE_TIME',
      billingStartDate: '2026-08-15',
      customFrequencyLabel: null,
    })).toEqual({
      config: {
        schemaVersion: 1,
        cadence: 'ONE_TIME',
        startDate: '2026-08-15',
        customInterval: null,
        scheduleEntries: [{
          key: 'default',
          label: 'Billing date',
          expression: { kind: 'DAY_OF_MONTH', day: 15 },
          businessDayAdjustment: 'NONE',
        }],
      },
      issueType: null,
    });
  });

  it('leaves label-only custom schedules invalid for review', () => {
    expect(convertLegacyBillingSchedule({
      billingFrequency: 'CUSTOM',
      billingStartDate: null,
      customFrequencyLabel: 'When needed',
    })).toEqual({ config: null, issueType: 'INVALID_CUSTOM_SCHEDULE' });
  });
});

describe('billing schedule evaluation', () => {
  it('clamps month dates and applies Singapore business-day adjustments at cadence boundaries', () => {
    const config: BillingScheduleConfigV1 = {
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: '2026-01-31',
      customInterval: { unit: 'MONTH', count: 1 },
      scheduleEntries: [entry('default', 31, 'NEXT')],
    };

    const occurrences = evaluateBillingSchedule({
      config,
      feeLine: { id: 'fee-1', amount: '125.00', currency: 'SGD' },
      calendar,
      from: '2026-01-01',
      to: '2026-03-31',
      generationKey: 'rolling-v1',
    });

    expect(occurrences.map(({ billingPeriodKey, scheduleEntryKey, calculatedExpectedDate, operativeExpectedDate }) => ({
      billingPeriodKey,
      scheduleEntryKey,
      calculatedExpectedDate,
      operativeExpectedDate,
    }))).toEqual([
      { billingPeriodKey: '2026-01', scheduleEntryKey: 'default', calculatedExpectedDate: '2026-01-31', operativeExpectedDate: '2026-02-02' },
      { billingPeriodKey: '2026-02', scheduleEntryKey: 'default', calculatedExpectedDate: '2026-02-28', operativeExpectedDate: '2026-03-02' },
      { billingPeriodKey: '2026-03', scheduleEntryKey: 'default', calculatedExpectedDate: '2026-03-31', operativeExpectedDate: '2026-03-31' },
    ]);
    expect(occurrences.every((occurrence) => occurrence.amount === '125.00' && occurrence.currency === 'SGD')).toBe(true);
  });

  it('uses structured custom month intervals and deterministic period keys', () => {
    const config: BillingScheduleConfigV1 = {
      schemaVersion: 1,
      cadence: 'CUSTOM',
      startDate: '2026-01-15',
      customInterval: { unit: 'MONTH', count: 2 },
      scheduleEntries: [entry('installment', 15)],
    };

    const occurrences = evaluateBillingSchedule({
      config,
      feeLine: { id: 'fee-2', amount: '50', currency: 'USD' },
      calendar,
      from: '2026-01-01',
      to: '2026-06-30',
      generationKey: 'reconciliation-v1',
    });

    expect(occurrences.map((occurrence) => [occurrence.billingPeriodKey, occurrence.calculatedExpectedDate])).toEqual([
      ['2026-01+2M', '2026-01-15'],
      ['2026-03+2M', '2026-03-15'],
      ['2026-05+2M', '2026-05-15'],
    ]);
  });

  it('returns one one-time occurrence only when its date is inside the requested range', () => {
    const config: BillingScheduleConfigV1 = {
      schemaVersion: 1,
      cadence: 'ONE_TIME',
      startDate: '2026-08-15',
      customInterval: null,
      scheduleEntries: [entry('z-balance', 15), entry('a-deposit', 1)],
    };

    const inRange = evaluateBillingSchedule({
      config,
      feeLine: { id: 'fee-3', amount: '75', currency: 'SGD' },
      calendar,
      from: '2026-08-01',
      to: '2026-08-31',
      generationKey: 'rolling-v1',
    });
    const outOfRange = evaluateBillingSchedule({
      config,
      feeLine: { id: 'fee-3', amount: '75', currency: 'SGD' },
      calendar,
      from: '2026-08-16',
      to: '2026-08-31',
      generationKey: 'rolling-v1',
    });

    expect(inRange).toHaveLength(1);
    expect(inRange[0]).toMatchObject({
      billingPeriodKey: 'ONE_TIME:2026-08-15',
      scheduleEntryKey: 'a-deposit',
      calculatedExpectedDate: '2026-08-01',
    });
    expect(outOfRange).toEqual([]);
  });

  it('sorts entries by stable key so reordering configuration does not change identities or values', () => {
    const base: BillingScheduleConfigV1 = {
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: '2026-08-01',
      customInterval: { unit: 'MONTH', count: 1 },
      scheduleEntries: [entry('second', 15), entry('first', 1)],
    };
    const evaluate = (config: BillingScheduleConfigV1) => evaluateBillingSchedule({
      config,
      feeLine: { id: 'fee-4', amount: '90.00', currency: 'SGD' },
      calendar,
      from: '2026-08-01',
      to: '2026-08-31',
      generationKey: 'rolling-v1',
    });

    expect(evaluate(base)).toEqual(evaluate({ ...base, scheduleEntries: [...base.scheduleEntries].reverse() }));
  });

  it('does not invent occurrences for an empty or missing-start schedule', () => {
    const base: BillingScheduleConfigV1 = {
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: null,
      customInterval: { unit: 'MONTH', count: 1 },
      scheduleEntries: [],
    };

    expect(evaluateBillingSchedule({
      config: base,
      feeLine: { id: 'fee-5', amount: '10', currency: 'SGD' },
      calendar,
      from: '2026-08-01',
      to: '2026-08-31',
      generationKey: 'rolling-v1',
    })).toEqual([]);
  });
});
