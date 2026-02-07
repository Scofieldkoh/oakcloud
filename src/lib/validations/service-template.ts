import { z } from 'zod';
import {
  billingFrequencyEnum,
  deadlineCategoryEnum,
  deadlineRuleInputSchema,
  serviceStatusEnum,
  serviceTypeEnum,
} from './service';

const serviceTemplateBaseSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200, 'Template name is too long'),
  category: deadlineCategoryEnum,
  description: z.string().max(5000, 'Description is too long').optional().nullable(),
  serviceType: serviceTypeEnum.default('RECURRING'),
  status: serviceStatusEnum.default('ACTIVE'),
  rate: z.number().min(0, 'Rate cannot be negative').optional().nullable(),
  currency: z.string().max(3).default('SGD'),
  frequency: billingFrequencyEnum.default('ANNUALLY'),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  deadlineRules: z.array(deadlineRuleInputSchema).default([]),
});

export const createServiceTemplateSchema = serviceTemplateBaseSchema;
export const updateServiceTemplateSchema = serviceTemplateBaseSchema.partial();

export const storedServiceTemplateSchema = serviceTemplateBaseSchema.extend({
  code: z
    .string()
    .min(3, 'Template code is required')
    .max(120, 'Template code is too long')
    .regex(/^[A-Z0-9_]+$/, 'Template code must be uppercase letters, numbers, and underscores'),
  isSystemOverride: z.boolean().default(false),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateServiceTemplateInput = z.infer<typeof createServiceTemplateSchema>;
export type UpdateServiceTemplateInput = z.infer<typeof updateServiceTemplateSchema>;
export type StoredServiceTemplate = z.infer<typeof storedServiceTemplateSchema>;
