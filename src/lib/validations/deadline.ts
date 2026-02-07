/**
 * Zod validation schemas for Deadline operations
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const DeadlineCategoryEnum = z.enum([
  'CORPORATE_SECRETARY',
  'TAX',
  'ACCOUNTING',
  'AUDIT',
  'COMPLIANCE',
  'OTHER',
]);

export const DeadlineStatusEnum = z.enum([
  'PENDING',
  'PENDING_CLIENT',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'COMPLETED',
  'CANCELLED',
  'WAIVED',
]);

export const DeadlineTimingStatusEnum = z.enum([
  'OVERDUE',
  'DUE_SOON',
  'UPCOMING',
  'COMPLETED',
  'CANCELLED',
  'WAIVED',
]);

export const DeadlineBillingStatusEnum = z.enum([
  'NOT_APPLICABLE',
  'PENDING',
  'TO_BE_BILLED',
  'INVOICED',
  'PAID',
]);

export const DeadlineGenerationTypeEnum = z.enum(['AUTO', 'MANUAL']);

// =============================================================================
// CREATE DEADLINE
// =============================================================================

export const createDeadlineSchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),
  contractServiceId: z.string().uuid('Invalid contract service ID').nullish(),
  deadlineTemplateId: z.string().uuid('Invalid deadline template ID').nullish(),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  description: z.string().nullish(),
  internalNotes: z.string().nullish(),
  category: DeadlineCategoryEnum,
  referenceCode: z.string().max(50, 'Reference code must be 50 characters or less').nullish(),
  periodLabel: z
    .string()
    .min(1, 'Period label is required')
    .max(50, 'Period label must be 50 characters or less'),
  periodStart: z.string().datetime().or(z.date()).nullish(),
  periodEnd: z.string().datetime().or(z.date()).nullish(),
  statutoryDueDate: z.string().datetime().or(z.date()),
  extendedDueDate: z.string().datetime().or(z.date()).nullish(),
  internalDueDate: z.string().datetime().or(z.date()).nullish(),
  isInScope: z.boolean().default(true),
  scopeNote: z.string().nullish(),
  isBacklog: z.boolean().default(false),
  backlogNote: z.string().nullish(),
  status: DeadlineStatusEnum.default('PENDING'),
  isBillable: z.boolean().default(false),
  amount: z.number().positive('Amount must be positive').nullish(),
  currency: z.string().length(3, 'Currency must be 3 characters').default('SGD'),
  assigneeId: z.string().uuid('Invalid assignee ID').nullish(),
  generationType: DeadlineGenerationTypeEnum.default('MANUAL'),
});

export type CreateDeadlineInput = z.infer<typeof createDeadlineSchema>;

// =============================================================================
// UPDATE DEADLINE
// =============================================================================

export const updateDeadlineSchema = z.object({
  id: z.string().uuid('Invalid deadline ID'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .optional(),
  description: z.string().nullish(),
  internalNotes: z.string().nullish(),
  category: DeadlineCategoryEnum.optional(),
  referenceCode: z.string().max(50).nullish(),
  periodLabel: z.string().min(1).max(50).optional(),
  periodStart: z.string().datetime().or(z.date()).nullish(),
  periodEnd: z.string().datetime().or(z.date()).nullish(),
  extendedDueDate: z.string().datetime().or(z.date()).nullish(),
  internalDueDate: z.string().datetime().or(z.date()).nullish(),
  eotReference: z.string().max(100).nullish(),
  eotNote: z.string().nullish(),
  isInScope: z.boolean().optional(),
  scopeNote: z.string().nullish(),
  isBacklog: z.boolean().optional(),
  backlogNote: z.string().nullish(),
  status: DeadlineStatusEnum.optional(),
  isBillable: z.boolean().optional(),
  overrideBillable: z.boolean().nullish(),
  amount: z.number().positive().nullish(),
  overrideAmount: z.number().positive().nullish(),
  currency: z.string().length(3).optional(),
  assigneeId: z.string().uuid().nullish(),
});

export type UpdateDeadlineInput = z.infer<typeof updateDeadlineSchema>;

// =============================================================================
// COMPLETE DEADLINE
// =============================================================================

export const completeDeadlineSchema = z.object({
  id: z.string().uuid('Invalid deadline ID'),
  completionNote: z.string().nullish(),
  filingDate: z.string().datetime().or(z.date()).nullish(),
  filingReference: z.string().max(100, 'Filing reference must be 100 characters or less').nullish(),
  billingStatus: DeadlineBillingStatusEnum.optional(),
  invoiceReference: z.string().max(100, 'Invoice reference must be 100 characters or less').nullish(),
});

export type CompleteDeadlineInput = z.infer<typeof completeDeadlineSchema>;

// =============================================================================
// UPDATE BILLING
// =============================================================================

export const updateBillingSchema = z.object({
  id: z.string().uuid('Invalid deadline ID'),
  billingStatus: DeadlineBillingStatusEnum,
  invoiceReference: z.string().max(100).nullish(),
});

export type UpdateBillingInput = z.infer<typeof updateBillingSchema>;

// =============================================================================
// SEARCH DEADLINES
// =============================================================================

export const deadlineSearchSchema = z.object({
  companyId: z.string().uuid().optional(),
  contractServiceId: z.string().uuid().optional(),
  category: DeadlineCategoryEnum.optional(),
  status: z.union([DeadlineStatusEnum, z.array(DeadlineStatusEnum)]).optional(),
  timing: DeadlineTimingStatusEnum.optional(),
  assigneeId: z.string().uuid().nullish(),
  isInScope: z.boolean().optional(),
  isBacklog: z.boolean().optional(),
  billingStatus: DeadlineBillingStatusEnum.optional(),
  dueDateFrom: z.string().datetime().or(z.date()).nullish(),
  dueDateTo: z.string().datetime().or(z.date()).nullish(),
  query: z.string().optional(),
  includeDeleted: z.boolean().default(false),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z
    .enum([
      'title',
      'periodLabel',
      'service',
      'billingStatus',
      'amount',
      'assignee',
      'statutoryDueDate',
      'status',
      'category',
      'company',
      'createdAt',
      'updatedAt',
    ])
    .default('statutoryDueDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type DeadlineSearchInput = z.infer<typeof deadlineSearchSchema>;

// =============================================================================
// BULK OPERATIONS
// =============================================================================

export const bulkAssignSchema = z.object({
  action: z.literal('bulk-assign'),
  deadlineIds: z.array(z.string().uuid()).min(1, 'At least one deadline ID is required'),
  assigneeId: z.string().uuid().nullable(),
});

export const bulkStatusSchema = z.object({
  action: z.literal('bulk-status'),
  deadlineIds: z.array(z.string().uuid()).min(1, 'At least one deadline ID is required'),
  status: DeadlineStatusEnum,
});

export const bulkBillingSchema = z.object({
  action: z.literal('bulk-billing'),
  deadlineIds: z.array(z.string().uuid()).min(1, 'At least one deadline ID is required'),
  billingStatus: DeadlineBillingStatusEnum,
});

export const bulkDeleteSchema = z.object({
  action: z.literal('bulk-delete'),
  deadlineIds: z.array(z.string().uuid()).min(1, 'At least one deadline ID is required'),
});

export const generateDeadlinesSchema = z.object({
  action: z.literal('generate'),
  companyId: z.string().uuid('Invalid company ID'),
  templateCodes: z.array(z.string()).optional(),
  monthsAhead: z.number().int().positive().max(36).default(18),
  serviceId: z.string().uuid().optional(),
});

export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type BulkStatusInput = z.infer<typeof bulkStatusSchema>;
export type BulkBillingInput = z.infer<typeof bulkBillingSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type GenerateDeadlinesInput = z.infer<typeof generateDeadlinesSchema>;
