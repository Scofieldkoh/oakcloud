import { z } from 'zod';
import { billingFrequencySchema, serviceCadenceSchema } from '@/lib/validations/service-catalog';

const dateOrderIssue = (ctx: z.RefinementCtx) => ctx.addIssue({
  code: z.ZodIssueCode.custom,
  path: ['endDate'],
  message: 'End date must be on or after start date',
});

function validateCadenceAndDates(
  value: { serviceCadence?: string; customCadenceLabel?: string | null; startDate?: string; endDate?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.serviceCadence === 'CUSTOM' && !value.customCadenceLabel?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customCadenceLabel'], message: 'Custom cadence label is required' });
  }
  if (value.startDate && value.endDate && value.endDate < value.startDate) dateOrderIssue(ctx);
}

export const clientServiceFeeLineInputSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  billingFrequency: billingFrequencySchema,
  customFrequencyLabel: z.string().trim().min(1).max(100).nullable().optional(),
  billingStartDate: z.string().date().nullable().optional(),
  displayOrder: z.number().int().min(0),
}).superRefine((value, ctx) => {
  if (value.billingFrequency === 'CUSTOM' && !value.customFrequencyLabel?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customFrequencyLabel'], message: 'Custom frequency label is required' });
  }
});

export const updateClientServiceSchema = z.object({
  updatedAt: z.string().datetime(),
  familyName: z.string().trim().min(1).max(200).optional(),
  serviceName: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional(),
  serviceCadence: serviceCadenceSchema.optional(),
  customCadenceLabel: z.string().trim().min(1).max(100).nullable().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().nullable().optional(),
  fieldValues: z.record(z.string(), z.string().max(10_000)).optional(),
  feeLines: z.array(clientServiceFeeLineInputSchema).min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  validateCadenceAndDates(value, ctx);
  if (Object.keys(value).every((key) => key === 'updatedAt')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one service field must be updated' });
  }
});

export const archiveClientServiceSchema = z.object({ reason: z.string().trim().min(10).max(1000) });
export const markServiceAgreementEffectiveSchema = z.object({
  signedAt: z.string().datetime(),
  effectiveDate: z.string().date(),
  reason: z.string().trim().min(10).max(1000),
});
export const searchClientServicesSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional(),
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UpdateClientServiceInput = z.infer<typeof updateClientServiceSchema>;
export type SearchClientServicesInput = z.infer<typeof searchClientServicesSchema>;
export type MarkServiceAgreementEffectiveInput = z.infer<typeof markServiceAgreementEffectiveSchema>;
