import { z } from 'zod';

export const entityTypeEnum = z.enum([
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'SOLE_PROPRIETORSHIP',
  'PARTNERSHIP',
  'LIMITED_PARTNERSHIP',
  'LIMITED_LIABILITY_PARTNERSHIP',
  'FOREIGN_COMPANY',
  'VARIABLE_CAPITAL_COMPANY',
  'OTHER',
]);

export const companyStatusEnum = z.enum([
  'LIVE',
  'STRUCK_OFF',
  'WINDING_UP',
  'DISSOLVED',
  'IN_LIQUIDATION',
  'IN_RECEIVERSHIP',
  'AMALGAMATED',
  'CONVERTED',
  'OTHER',
]);

// Helper for date string transformation
const dateStringTransform = z.string().optional().nullable().transform((val) => {
  if (!val) return null;
  if (val.includes('T')) return val;
  return new Date(val).toISOString();
});

export const createCompanySchema = z.object({
  uen: z
    .string()
    .min(9, 'UEN must be at least 9 characters')
    .max(10, 'UEN must be at most 10 characters')
    .regex(/^[A-Z0-9]+$/, 'UEN must contain only uppercase letters and numbers'),
  name: z.string().min(1, 'Company name is required').max(200, 'Company name is too long'),
  formerName: z.string().max(200).optional().nullable(),
  dateOfNameChange: dateStringTransform,
  entityType: entityTypeEnum.default('PRIVATE_LIMITED'),
  status: companyStatusEnum.default('LIVE'),
  statusDate: dateStringTransform,
  incorporationDate: dateStringTransform,
  registrationDate: dateStringTransform,
  dateOfAddress: dateStringTransform,
  primarySsicCode: z.string().max(10).optional().nullable(),
  primarySsicDescription: z.string().max(500).optional().nullable(),
  secondarySsicCode: z.string().max(10).optional().nullable(),
  secondarySsicDescription: z.string().max(500).optional().nullable(),
  financialYearEndDay: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? null : val),
    z.number().min(1).max(31).optional().nullable()
  ),
  financialYearEndMonth: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? null : val),
    z.number().min(1).max(12).optional().nullable()
  ),
  fyeAsAtLastAr: dateStringTransform,
  homeCurrency: z.string().max(3).default('SGD'),
  paidUpCapitalCurrency: z.string().default('SGD'),
  paidUpCapitalAmount: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? null : val),
    z.number().min(0).optional().nullable()
  ),
  issuedCapitalCurrency: z.string().default('SGD'),
  issuedCapitalAmount: z.preprocess(
    (val) => (val === '' || val === null || val === undefined || Number.isNaN(val) ? null : val),
    z.number().min(0).optional().nullable()
  ),
  isGstRegistered: z.boolean().default(false),
  gstRegistrationNumber: z.string().max(20).optional().nullable(),
  gstRegistrationDate: dateStringTransform,
  internalNotes: z.string().max(5000).optional().nullable(),
});

export const updateCompanySchema = createCompanySchema.partial().extend({
  id: z.string().uuid(),
});

export const deleteCompanySchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(10, 'Please provide a reason for deletion (at least 10 characters)'),
});

export const companySearchSchema = z.object({
  query: z.string().optional(),
  entityType: entityTypeEnum.optional(),
  status: companyStatusEnum.optional(),
  incorporationDateFrom: z.string().optional().transform((val) => {
    if (!val) return undefined;
    if (val.includes('T')) return val;
    return new Date(val).toISOString();
  }),
  incorporationDateTo: z.string().optional().transform((val) => {
    if (!val) return undefined;
    if (val.includes('T')) return val;
    return new Date(val).toISOString();
  }),
  hasCharges: z.boolean().optional(),
  financialYearEndMonth: z.number().min(1).max(12).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(200).default(20),
  sortBy: z
    .enum(['name', 'uen', 'incorporationDate', 'status', 'updatedAt', 'createdAt'])
    .default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const companyAddressSchema = z.object({
  addressType: z.enum(['REGISTERED_OFFICE', 'MAILING', 'RESIDENTIAL', 'BUSINESS']),
  block: z.string().max(10).optional().nullable(),
  streetName: z.string().min(1, 'Street name is required').max(200),
  level: z.string().max(10).optional().nullable(),
  unit: z.string().max(10).optional().nullable(),
  buildingName: z.string().max(200).optional().nullable(),
  postalCode: z.string().min(5).max(10),
  country: z.string().default('SINGAPORE'),
  effectiveFrom: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    if (val.includes('T')) return val;
    return new Date(val).toISOString();
  }),
  isCurrent: z.boolean().default(true),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type DeleteCompanyInput = z.infer<typeof deleteCompanySchema>;
export type CompanySearchInput = z.infer<typeof companySearchSchema>;
export type CompanyAddressInput = z.infer<typeof companyAddressSchema>;
