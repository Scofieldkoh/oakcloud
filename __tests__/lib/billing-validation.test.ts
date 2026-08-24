import { describe, expect, it } from 'vitest';

import { billingScheduleConfigSchema } from '@/lib/validations/billing';

const entry = (key: string, day: number) => ({
  key,
  label: key,
  expression: { kind: 'DAY_OF_MONTH' as const, day },
  businessDayAdjustment: 'NEXT' as const,
});

describe('billing schedule validation', () => {
  it('accepts multiple billing entries through the shared schedule schema', () => {
    const result = billingScheduleConfigSchema.parse({
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: '2026-08-01',
      customInterval: null,
      scheduleEntries: [entry('deposit', 1), entry('balance', 15)],
    });

    expect(result.scheduleEntries).toHaveLength(2);
    expect(result.scheduleEntries[1]?.businessDayAdjustment).toBe('NEXT');
  });

  it('requires a structured custom interval', () => {
    expect(() => billingScheduleConfigSchema.parse({
      schemaVersion: 1,
      cadence: 'CUSTOM',
      startDate: '2026-08-01',
      customInterval: null,
      scheduleEntries: [],
    })).toThrow('customInterval');
  });

  it('uses the shared date-only and unique-entry constraints', () => {
    expect(() => billingScheduleConfigSchema.parse({
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: '2026-02-30',
      customInterval: null,
      scheduleEntries: [],
    })).toThrow('Gregorian');

    expect(() => billingScheduleConfigSchema.parse({
      schemaVersion: 1,
      cadence: 'MONTHLY',
      startDate: null,
      customInterval: null,
      scheduleEntries: [entry('same', 1), entry('same', 2)],
    })).toThrow('unique');
  });
});
