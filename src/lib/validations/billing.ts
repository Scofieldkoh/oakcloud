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

/** Versioned, generic fee-line recurrence configuration. */
export const billingScheduleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  cadence: billingCadenceSchema,
  startDate: dateOnlySchema.nullable(),
  customInterval: customIntervalSchema.nullable(),
  scheduleEntries: scheduleEntriesSchema,
}).strict().superRefine((value, ctx) => {
  if (value.cadence === 'CUSTOM' && !value.customInterval) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customInterval'],
      message: 'customInterval is required for a custom schedule',
    });
  }
});

export { billingCadenceSchema };
export const billingCustomIntervalSchema = customIntervalSchema;

export type BillingScheduleConfigInput = z.input<typeof billingScheduleConfigSchema>;
export type BillingScheduleConfigOutput = z.output<typeof billingScheduleConfigSchema>;
