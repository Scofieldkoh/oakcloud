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

export const deadlineRuleTypeEnum = z.enum(['RULE_BASED', 'FIXED_DATE']);

export const deadlineCategoryEnum = z.enum([
  'CORPORATE_SECRETARY',
  'TAX',
  'ACCOUNTING',
  'AUDIT',
  'COMPLIANCE',
  'OTHER',
]);

export const deadlineAnchorTypeEnum = z.enum([
  'FYE',
  'SERVICE_START',
  'FIXED_CALENDAR',
  'QUARTER_END',
  'MONTH_END',
  'INCORPORATION',
  'IPC_EXPIRY',
]);

export const deadlineFrequencyEnum = z.enum(['ANNUALLY', 'QUARTERLY', 'MONTHLY', 'ONE_TIME']);

// ============================================================================
// Deadline Rule Schema
// ============================================================================

export const deadlineRuleInputSchema = z
  .object({
    taskName: z.string().min(1, 'Task name is required').max(200, 'Task name is too long'),
    description: z.string().optional().nullable(),
    category: deadlineCategoryEnum,
    ruleType: deadlineRuleTypeEnum,

    // Rule-based fields
    anchorType: deadlineAnchorTypeEnum.optional().nullable(),
    offsetMonths: z
      .number()
      .int()
      .min(-120, 'Offset months must be between -120 and 120')
      .max(120, 'Offset months must be between -120 and 120')
      .optional()
      .nullable(),
    offsetDays: z
      .number()
      .int()
      .min(-365, 'Offset days must be between -365 and 365')
      .max(365, 'Offset days must be between -365 and 365')
      .optional()
      .nullable(),
    offsetBusinessDays: z.boolean().optional().nullable(),
    fixedMonth: z.number().int().min(1).max(12).optional().nullable(),
    fixedDay: z.number().int().min(1).max(31).optional().nullable(),

    // Fixed-date fields
    specificDate: z.string().optional().nullable(),

    // Recurrence
    isRecurring: z.boolean(),
    frequency: deadlineFrequencyEnum.optional().nullable(),
    generateUntilDate: z.string().optional().nullable(),
    generateOccurrences: z.number().int().min(1).max(120).optional().nullable(),

    // Billing
    isBillable: z.boolean(),
    amount: z.number().min(0, 'Amount cannot be negative').optional().nullable(),
    currency: z.string().max(3).default('SGD'),

    displayOrder: z.number().int().min(0).default(0),
    sourceTemplateCode: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      // Rule-based must have anchorType
      if (data.ruleType === 'RULE_BASED' && !data.anchorType) {
        return false;
      }
      return true;
    },
    {
      message: 'Anchor type is required for rule-based deadlines',
      path: ['anchorType'],
    }
  )
  .refine(
    (data) => {
      // Fixed-date must have specificDate
      if (data.ruleType === 'FIXED_DATE' && !data.specificDate) {
        return false;
      }
      return true;
    },
    {
      message: 'Specific date is required for fixed-date deadlines',
      path: ['specificDate'],
    }
  )
  .refine(
    (data) => {
      // FIXED_CALENDAR must have fixedMonth and fixedDay
      if (data.anchorType === 'FIXED_CALENDAR' && (!data.fixedMonth || !data.fixedDay)) {
        return false;
      }
      return true;
    },
    {
      message: 'Fixed month and day are required for FIXED_CALENDAR anchor type',
      path: ['fixedMonth'],
    }
  )
  .refine(
    (data) => {
      // Recurring must have frequency
      if (data.isRecurring && !data.frequency) {
        return false;
      }
      return true;
    },
    {
      message: 'Frequency is required for recurring deadlines',
      path: ['frequency'],
    }
  )
  .refine(
    (data) => {
      // Recurring must have either generateUntilDate or generateOccurrences
      if (data.isRecurring && !data.generateUntilDate && !data.generateOccurrences) {
        return false;
      }
      return true;
    },
    {
      message: 'Either generate until date or occurrences count is required for recurring deadlines',
      path: ['generateUntilDate'],
    }
  );

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

  // Deadline Management
  serviceTemplateCode: z.string().optional().nullable(),
  deadlineRules: z.array(deadlineRuleInputSchema).optional().nullable(),
});

export const updateServiceSchema = createServiceSchema.extend({
  id: z.string().uuid(),
});

// ============================================================================
// Type Exports
// ============================================================================

/** Deadline rule input type */
export type DeadlineRuleInput = z.infer<typeof deadlineRuleInputSchema>;

/** Output type after Zod transforms (rate and renewalPeriodMonths are numbers) */
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

/** Input type for forms before Zod transforms (rate and renewalPeriodMonths are strings) */
export type CreateServiceFormInput = z.input<typeof createServiceSchema>;
export type UpdateServiceFormInput = z.input<typeof updateServiceSchema>;
