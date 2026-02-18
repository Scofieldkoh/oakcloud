import { z } from 'zod';
import { deadlineExclusionInputSchema, deadlineRuleInputSchema } from './service';

// ============================================================================
// Enums
// ============================================================================

export const contractTypeEnum = z.enum([
  'ENGAGEMENT_LETTER',
  'SERVICE_AGREEMENT',
  'RETAINER_CONTRACT',
  'NDA',
  'VENDOR_AGREEMENT',
  'OTHER',
]);

export const contractStatusEnum = z.enum([
  'DRAFT',
  'ACTIVE',
  'TERMINATED',
]);

export const serviceTypeEnum = z.enum([
  'RECURRING',
  'ONE_TIME',
  'BOTH',
]);

export const serviceStatusEnum = z.enum([
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'PENDING',
]);

export const billingFrequencyEnum = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUALLY',
  'ANNUALLY',
  'ONE_TIME',
]);

// ============================================================================
// Helpers
// ============================================================================

// Helper for date string transformation
const dateStringTransform = z
  .string()
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    if (val.includes('T')) return val;
    return new Date(val).toISOString();
  });

// Required date string transform
const requiredDateStringTransform = z.string().transform((val) => {
  if (val.includes('T')) return val;
  return new Date(val).toISOString();
});

const numberTransform = z.preprocess((val) => {
  if (val === '' || val === undefined || val === null) return undefined;
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  return Number.isNaN(num) ? undefined : num;
}, z.number().min(0).optional());

// ============================================================================
// Contract Schemas
// ============================================================================

export const createContractSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title is too long'),
  contractType: contractTypeEnum.default('OTHER'),
  status: contractStatusEnum.default('DRAFT'),
  startDate: requiredDateStringTransform,
  signedDate: dateStringTransform,
  documentId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

export const updateContractSchema = createContractSchema.partial().extend({
  id: z.string().uuid(),
});

export const deleteContractSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(10, 'Please provide a reason for deletion (at least 10 characters)'),
});

// ============================================================================
// Contract Service Schemas
// ============================================================================

export const createContractServiceSchema = z.object({
  name: z.string().min(1, 'Service name is required').max(200, 'Service name is too long'),
  serviceType: serviceTypeEnum.default('RECURRING'),
  status: serviceStatusEnum.default('ACTIVE'),
  rate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? null : val),
    z.number().min(0).optional().nullable()
  ),
  currency: z.string().max(3).default('SGD'),
  frequency: billingFrequencyEnum.default('MONTHLY'),
  startDate: requiredDateStringTransform,
  endDate: dateStringTransform,
  scope: z.string().optional().nullable(),
  displayOrder: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? 0 : val),
    z.number().min(0).default(0)
  ),
  // Service template integration for deadline management
  serviceTemplateCode: z.string().optional().nullable(),
  // NEW: Custom deadline rules (replaces old template-based system)
  deadlineRules: z.array(deadlineRuleInputSchema).optional().nullable(),
  // Optional: remove specific generated deadlines before persisting
  excludedDeadlines: z.array(deadlineExclusionInputSchema).optional().nullable(),
  // Optional: override FYE year for deadline generation
  fyeYearOverride: z.number().int().min(1900).max(2100).optional().nullable(),
  // Suffix fields for "BOTH" service type (creates two linked services)
  oneTimeSuffix: z.string().max(50).optional().nullable(),
  recurringSuffix: z.string().max(50).optional().nullable(),
  // One-time rate (used when serviceType is BOTH)
  oneTimeRate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? null : val),
    z.number().min(0).optional().nullable()
  ),
});

const BILLING_ALIGNMENT_TOLERANCE = 0.009;

function formatAmount(value: number): string {
  return value.toFixed(2);
}

/**
 * Enforce billing alignment between configured billable deadline totals and service rates.
 * Returns an error string when the payload should be rejected.
 */
export function getCreateServiceBillingAlignmentError(data: CreateContractServiceInput): string | null {
  const rules = data.deadlineRules ?? [];
  if (rules.length === 0) return null;

  const totals = rules.reduce(
    (acc, rule) => {
      if (!rule.isBillable || rule.amount == null) return acc;
      const isOneTimeRule = !rule.isRecurring || rule.frequency === 'ONE_TIME';
      if (isOneTimeRule) {
        acc.oneTime += rule.amount;
      } else {
        acc.recurring += rule.amount;
      }
      return acc;
    },
    { oneTime: 0, recurring: 0 }
  );

  const serviceType = data.serviceType ?? 'RECURRING';
  const rows =
    serviceType === 'BOTH'
      ? [
        { label: 'One-time', target: data.oneTimeRate ?? null, configured: totals.oneTime },
        { label: 'Recurring', target: data.rate ?? null, configured: totals.recurring },
      ]
      : serviceType === 'ONE_TIME'
        ? [{ label: 'One-time', target: data.rate ?? null, configured: totals.oneTime }]
        : [{ label: 'Recurring', target: data.rate ?? null, configured: totals.recurring }];

  for (const row of rows) {
    if (row.target == null) {
      if (row.configured > BILLING_ALIGNMENT_TOLERANCE) {
        return `${row.label} billable deadlines total ${formatAmount(row.configured)}, but no ${row.label.toLowerCase()} rate is set.`;
      }
      continue;
    }

    const difference = Math.abs(row.target - row.configured);
    if (difference > BILLING_ALIGNMENT_TOLERANCE) {
      return `${row.label} billable deadlines (${formatAmount(row.configured)}) do not match the configured rate (${formatAmount(row.target)}).`;
    }
  }

  return null;
}

// Individual services can only be RECURRING or ONE_TIME - BOTH is only for creation
const updateServiceTypeEnum = z.enum(['RECURRING', 'ONE_TIME']);

export const updateContractServiceSchema = createContractServiceSchema.partial().extend({
  id: z.string().uuid(),
  serviceType: updateServiceTypeEnum.optional(),
});

export const deleteContractServiceSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================================
// Query Schemas
// ============================================================================

export const contractSearchSchema = z.object({
  query: z.string().optional(),
  status: contractStatusEnum.optional(),
  contractType: contractTypeEnum.optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(200).default(20),
  sortBy: z.enum(['title', 'startDate', 'status', 'updatedAt', 'createdAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const serviceSearchSchema = z.object({
  query: z.string().optional(),
  status: serviceStatusEnum.optional(),
  serviceType: serviceTypeEnum.optional(),
  companyId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  // Date range filters for service start/end dates
  startDateFrom: dateStringTransform,
  startDateTo: dateStringTransform,
  endDateFrom: dateStringTransform,
  endDateTo: dateStringTransform,
  rateFrom: numberTransform,
  rateTo: numberTransform,
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(200).default(20),
  sortBy: z
    .enum(['name', 'startDate', 'endDate', 'status', 'rate', 'updatedAt', 'createdAt'])
    .default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// Bulk Operations
// ============================================================================

export const bulkServiceEndDateSchema = z.object({
  action: z.literal('bulk-end-date'),
  serviceIds: z.array(z.string().uuid()).min(1, 'At least one service ID is required'),
  endDate: requiredDateStringTransform,
});

export const bulkServiceHardDeleteSchema = z.object({
  action: z.literal('bulk-hard-delete'),
  serviceIds: z.array(z.string().uuid()).min(1, 'At least one service ID is required'),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type DeleteContractInput = z.infer<typeof deleteContractSchema>;
export type CreateContractServiceInput = z.infer<typeof createContractServiceSchema>;
export type UpdateContractServiceInput = z.infer<typeof updateContractServiceSchema>;
export type DeleteContractServiceInput = z.infer<typeof deleteContractServiceSchema>;
export type ContractSearchInput = z.infer<typeof contractSearchSchema>;
export type ServiceSearchInput = z.infer<typeof serviceSearchSchema>;
export type BulkServiceEndDateInput = z.infer<typeof bulkServiceEndDateSchema>;
export type BulkServiceHardDeleteInput = z.infer<typeof bulkServiceHardDeleteSchema>;
