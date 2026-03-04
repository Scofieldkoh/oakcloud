import { z } from 'zod';

export const formStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

export const formFieldTypeSchema = z.enum([
  'SHORT_TEXT',
  'LONG_TEXT',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'DROPDOWN',
  'FILE_UPLOAD',
  'SIGNATURE',
  'PARAGRAPH',
  'HTML',
  'PAGE_BREAK',
  'HIDDEN',
]);

export const shortInputTypeSchema = z.enum([
  'text',
  'email',
  'phone',
  'number',
  'date',
  'info_text',
  'info_image',
  'info_url',
]);

export const fieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).max(5000).optional(),
    maxLength: z.number().int().min(1).max(5000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().max(500).optional(),
    maxFileSizeMb: z.number().int().min(1).max(100).optional(),
    allowedMimeTypes: z.array(z.string().min(1).max(120)).max(20).optional(),
    tooltipEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => {
      if (value.minLength !== undefined && value.maxLength !== undefined) {
        return value.maxLength >= value.minLength;
      }
      if (value.min !== undefined && value.max !== undefined) {
        return value.max >= value.min;
      }
      return true;
    },
    { message: 'Invalid validation range' }
  );

export const fieldConditionSchema = z.object({
  fieldKey: z.string().min(1).max(120),
  operator: z.enum(['equals', 'not_equals', 'contains', 'is_empty', 'not_empty']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
});

const layoutWidthSchema = z.union([
  z.literal(25),
  z.literal(33),
  z.literal(50),
  z.literal(66),
  z.literal(75),
  z.literal(100),
]);

export const formFieldSchema = z.object({
  id: z.string().uuid().optional(),
  type: formFieldTypeSchema,
  label: z.string().max(200).optional().nullable(),
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field key must start with a letter and use alphanumeric/underscore only')
    .optional(),
  placeholder: z.string().max(500).optional().nullable(),
  subtext: z.string().max(2000).optional().nullable(),
  helpText: z.string().max(2000).optional().nullable(),
  inputType: shortInputTypeSchema.optional().nullable(),
  options: z.array(z.string().min(1).max(200)).max(100).optional().nullable(),
  validation: fieldValidationSchema.optional().nullable(),
  condition: fieldConditionSchema.optional().nullable(),
  isRequired: z.boolean().optional().default(false),
  hideLabel: z.boolean().optional().default(false),
  isReadOnly: z.boolean().optional().default(false),
  layoutWidth: layoutWidthSchema.optional().default(100),
  position: z.number().int().min(0),
});

export const createFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120, 'Title must be 120 characters or less'),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  status: formStatusSchema.optional().default('DRAFT'),
});

export const formSlugSchema = z
  .string()
  .trim()
  .min(3, 'URL segment must be at least 3 characters')
  .max(80, 'URL segment must be at most 80 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens only');

export const updateFormSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  status: formStatusSchema.optional(),
  slug: formSlugSchema.optional(),
  settings: z.record(z.unknown()).optional().nullable(),
});

export const saveFormFieldsSchema = z.object({
  fields: z.array(formFieldSchema).max(300),
});

export const duplicateFormSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const listFormsQuerySchema = z.object({
  query: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  status: formStatusSchema.optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const publicSubmissionSchema = z.object({
  respondentName: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return null;
      if (trimmed.length > 200) return null;
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(200).optional().nullable()
  ),
  respondentEmail: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim().toLowerCase();
      if (trimmed.length > 320) return null;
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().email().max(320).optional().nullable()
  ),
  answers: z.record(z.string(), z.unknown()),
  uploadIds: z.preprocess(
    (value) => {
      if (!Array.isArray(value)) return value;
      return value.filter((item): item is string => typeof item === 'string');
    },
    z.array(z.string().uuid()).max(100).optional().default([])
  ),
  metadata: z.preprocess(
    (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      return value;
    },
    z.record(z.string(), z.unknown()).optional()
  ),
});

export const publicUploadSchema = z.object({
  fieldKey: z.string().min(1).max(120),
});

export type FormStatusInput = z.infer<typeof formStatusSchema>;
export type FormFieldTypeInput = z.infer<typeof formFieldTypeSchema>;
export type FormFieldInput = z.infer<typeof formFieldSchema>;
export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type SaveFormFieldsInput = z.infer<typeof saveFormFieldsSchema>;
export type DuplicateFormInput = z.infer<typeof duplicateFormSchema>;
export type ListFormsQueryInput = z.infer<typeof listFormsQuerySchema>;
export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;
