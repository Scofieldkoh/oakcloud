import { z } from 'zod';

export const contactTypeEnum = z.enum(['INDIVIDUAL', 'CORPORATE']);

export const identificationTypeEnum = z.enum(['NRIC', 'FIN', 'PASSPORT', 'UEN', 'OTHER']);

// Phone number validation - allows common formats
const phoneRegex = /^[+\d\s\-()]+$/;

// Base schema without refinements for partial operations
const contactBaseSchema = z.object({
  contactType: contactTypeEnum.default('INDIVIDUAL'),

  // Individual fields
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  identificationType: identificationTypeEnum.optional().nullable(),
  identificationNumber: z.string().max(50).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  dateOfBirth: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true;
        const dob = new Date(val);
        const today = new Date();
        // Not in future
        if (dob > today) return false;
        // Not older than 150 years
        const age = today.getFullYear() - dob.getFullYear();
        if (age > 150) return false;
        return true;
      },
      { message: 'Date of birth must be valid and not in the future' }
    ),

  // Corporate fields
  corporateName: z.string().max(200).optional().nullable(),
  corporateUen: z
    .string()
    .max(10)
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true;
        // Singapore UEN format: 9-10 alphanumeric characters
        return /^[A-Za-z0-9]{9,10}$/.test(val);
      },
      { message: 'Corporate UEN must be 9-10 alphanumeric characters' }
    ),

  // Contact info
  email: z.string().email().max(200).optional().nullable(),
  phone: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true;
        return phoneRegex.test(val);
      },
      { message: 'Phone number can only contain digits, spaces, dashes, parentheses, and + sign' }
    ),

  // Address
  fullAddress: z.string().max(500).optional().nullable(),

  // Meta
  internalNotes: z.string().max(5000).optional().nullable(),
});

export const createContactSchema = contactBaseSchema.refine(
  (data) => {
    if (data.contactType === 'INDIVIDUAL') {
      return data.firstName || data.lastName;
    }
    return data.corporateName;
  },
  {
    message: 'Individual contacts require a name; Corporate contacts require a corporate name',
  }
);

export const updateContactSchema = contactBaseSchema.partial().extend({
  id: z.string().uuid(),
});

export const contactSearchSchema = z.object({
  query: z.string().optional(),
  contactType: contactTypeEnum.optional(),
  companyId: z.string().uuid().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(200).default(20),
  sortBy: z.enum(['fullName', 'createdAt', 'updatedAt']).default('fullName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactSearchInput = z.infer<typeof contactSearchSchema>;
