import { z } from 'zod';

import {
  dateOnlySchema,
  scheduleEntriesSchema,
} from './service-schedule';

const customIntervalSchema = z.object({
  unit: z.literal('MONTH'),
  count: z.number().int().min(1).max(120),
}).strict();

const billingCadenceSchema = z.enum([
  'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'CUSTOM',
]);

const FIXED_CADENCE_INTERVALS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUALLY: 6,
  ANNUALLY: 12,
} as const;

const billingScheduleEntriesSchema = scheduleEntriesSchema.superRefine((entries, ctx) => {
  for (const [index, entry] of entries.entries()) {
    if (entry.expression.kind !== 'RELATIVE_TO_SOURCE') continue;

    if (typeof entry.expression.offset !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'expression', 'offset'],
        message: 'Billing schedule offsets must be numeric literals',
      });
    }

    if (!['CYCLE_START', 'CYCLE_END', 'CURRENT_SCHEDULE_ENTRY'].includes(entry.expression.source.kind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'expression', 'source'],
        message: 'Billing schedule sources must be cycle or current-entry references',
      });
    }
  }
});

/** Versioned, generic fee-line recurrence configuration. */
export const billingScheduleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  cadence: billingCadenceSchema,
  startDate: dateOnlySchema.nullable(),
  customInterval: customIntervalSchema.nullable(),
  scheduleEntries: billingScheduleEntriesSchema,
}).strict().superRefine((value, ctx) => {
  if (value.cadence === 'CUSTOM' && !value.customInterval) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customInterval'],
      message: 'customInterval is required for a custom schedule',
    });
  }

  if (value.cadence === 'ONE_TIME' && value.customInterval !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customInterval'],
      message: 'customInterval must be null for a one-time schedule',
    });
  }

  if (value.cadence in FIXED_CADENCE_INTERVALS) {
    const expectedCount = FIXED_CADENCE_INTERVALS[value.cadence as keyof typeof FIXED_CADENCE_INTERVALS];
    if (!value.customInterval || value.customInterval.count !== expectedCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customInterval'],
        message: `${value.cadence} schedules require a ${expectedCount}-month interval`,
      });
    }
  }
});

export { billingCadenceSchema };
export const billingCustomIntervalSchema = customIntervalSchema;

export type BillingScheduleConfigInput = z.input<typeof billingScheduleConfigSchema>;
export type BillingScheduleConfigOutput = z.output<typeof billingScheduleConfigSchema>;
