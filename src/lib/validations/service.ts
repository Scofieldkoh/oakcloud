import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const serviceTypeEnum = z.enum(['RECURRING', 'ONE_TIME']);

export const serviceStatusEnum = z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'PENDING']);

export const billingFrequencyEnum = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUALLY',
  'ANNUALLY',
  'ONE_TIME',
]);

// ============================================================================
// Service Form Schema
// ============================================================================

export const createServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required').max(200, 'Service name is too long'),
  serviceType: serviceTypeEnum.default('RECURRING'),
  status: serviceStatusEnum.default('ACTIVE'),
  rate: z
    .string()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val === '') return null;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? null : parsed;
    })
    .refine((val) => val === null || val >= 0, { message: 'Rate must be a positive number' }),
  currency: z.string().max(3).default('SGD'),
  frequency: billingFrequencyEnum.optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val === '' ? null : val)),
  scope: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val === '' ? null : val)),
  autoRenewal: z.boolean().default(false),
  renewalPeriodMonths: z
    .string()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val === '') return null;
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? null : parsed;
    })
    .refine((val) => val === null || (val >= 1 && val <= 120), {
      message: 'Renewal period must be between 1 and 120 months',
    }),
});

export const updateServiceSchema = createServiceSchema.extend({
  id: z.string().uuid(),
});

// ============================================================================
// Type Exports
// ============================================================================

/** Output type after Zod transforms (rate and renewalPeriodMonths are numbers) */
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

/** Input type for forms before Zod transforms (rate and renewalPeriodMonths are strings) */
export type CreateServiceFormInput = z.input<typeof createServiceSchema>;
export type UpdateServiceFormInput = z.input<typeof updateServiceSchema>;
