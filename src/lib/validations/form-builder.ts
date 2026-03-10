import { z } from 'zod';
import { FORM_FIELD_KEY_MAX_LENGTH } from '@/lib/form-utils';
import { evaluateArithmeticExpression } from '@/lib/safe-math';

const MAX_FIELD_OPTIONS = 500;
const MAX_FIELD_LABEL_LENGTH = 1000;
const MAX_FIELD_SUBTEXT_LENGTH = 10000;
const DATE_BOUND_PATTERN = /^(?:\d{4}-\d{2}-\d{2}|today)$/;

// Field key references like [fieldName] or [field_name_123] — valid identifier characters
const FIELD_KEY_REF_PATTERN = /\[[a-zA-Z][a-zA-Z0-9_]{0,119}\]/g;

function isValidFormulaExpression(formula: string): boolean {
  // Strip optional comparison prefix (>=, <=, >, <, =)
  const withoutPrefix = formula.replace(/^(?:>=|<=|>|<|=)\s*/, '');
  // Replace all [fieldKey] references with 1 (a valid numeric literal)
  const resolved = withoutPrefix.replace(FIELD_KEY_REF_PATTERN, '1');
  // The resolved expression must parse as valid arithmetic
  return evaluateArithmeticExpression(resolved) !== null;
}

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
  'info_heading_1',
  'info_heading_2',
  'info_heading_3',
  'repeat_start',
  'repeat_end',
]);

export const fieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).max(5000).optional(),
    maxLength: z.number().int().min(1).max(5000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    equal: z.number().optional(),
    minFormula: z.string().min(1).max(500).refine(isValidFormulaExpression, { message: 'Invalid formula expression' }).optional(),
    maxFormula: z.string().min(1).max(500).refine(isValidFormulaExpression, { message: 'Invalid formula expression' }).optional(),
    equalFormula: z.string().min(1).max(500).refine(isValidFormulaExpression, { message: 'Invalid formula expression' }).optional(),
    minDate: z.string().regex(DATE_BOUND_PATTERN).optional(),
    maxDate: z.string().regex(DATE_BOUND_PATTERN).optional(),
    startsWith: z.string().max(200).optional(),
    containsText: z.string().max(200).optional(),
    notContainsText: z.string().max(200).optional(),
    endsWith: z.string().max(200).optional(),
    pattern: z.string().max(500).optional(),
    maxFileSizeMb: z.number().int().min(1).max(100).optional(),
    allowMultipleFiles: z.boolean().optional(),
    allowedMimeTypes: z.array(z.string().min(1).max(120)).max(20).optional(),
    uploadFileNameTemplate: z.string().min(1).max(240).optional(),
    tooltipEnabled: z.boolean().optional(),
    choiceInlineRight: z.boolean().optional(),
    defaultToday: z.boolean().optional(),
    splitPhoneCountryCode: z.boolean().optional(),
    phoneDefaultCountryCode: z.string().regex(/^\+\d{1,4}$/).optional(),
    infoBackgroundColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    infoPaddingPx: z.number().int().min(0).max(80).optional(),
    infoPaddingTopPx: z.number().int().min(0).max(80).optional(),
    infoPaddingRightPx: z.number().int().min(0).max(80).optional(),
    infoPaddingBottomPx: z.number().int().min(0).max(80).optional(),
    infoPaddingLeftPx: z.number().int().min(0).max(80).optional(),
    repeatMinItems: z.number().int().min(1).max(50).optional(),
    repeatMaxItems: z.number().int().min(1).max(50).optional(),
    repeatAddLabel: z.string().min(1).max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.minLength !== undefined && value.maxLength !== undefined) {
      if (value.maxLength < value.minLength) {
        ctx.addIssue({ code: 'custom', message: 'maxLength must be >= minLength', path: ['maxLength'] });
      }
    }
    if (value.min !== undefined && value.max !== undefined) {
      if (value.max < value.min) {
        ctx.addIssue({ code: 'custom', message: 'max must be >= min', path: ['max'] });
      }
    }
    if (value.minFormula !== undefined && value.minFormula.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'minFormula must not be empty', path: ['minFormula'] });
    }
    if (value.maxFormula !== undefined && value.maxFormula.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'maxFormula must not be empty', path: ['maxFormula'] });
    }
    if (value.equalFormula !== undefined && value.equalFormula.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'equalFormula must not be empty', path: ['equalFormula'] });
    }
    if (value.minDate !== undefined && value.maxDate !== undefined) {
      if (value.minDate !== 'today' && value.maxDate !== 'today' && value.maxDate < value.minDate) {
        ctx.addIssue({ code: 'custom', message: 'maxDate must be >= minDate', path: ['maxDate'] });
      }
    }
    if (value.repeatMinItems !== undefined && value.repeatMaxItems !== undefined) {
      if (value.repeatMaxItems < value.repeatMinItems) {
        ctx.addIssue({ code: 'custom', message: 'repeatMaxItems must be >= repeatMinItems', path: ['repeatMaxItems'] });
      }
    }
  });

export const fieldConditionSchema = z.object({
  fieldKey: z.string().min(1).max(FORM_FIELD_KEY_MAX_LENGTH),
  operator: z.enum(['equals', 'not_equals', 'contains', 'is_empty', 'not_empty']),
  value: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
});

const choiceOptionSchema = z.object({
  label: z.string().min(1).max(200),
  value: z.string().min(1).max(200).optional(),
  allowTextInput: z.boolean().optional(),
  textInputLabel: z.string().max(200).optional().nullable(),
  textInputPlaceholder: z.string().max(200).optional().nullable(),
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
  label: z.string().max(MAX_FIELD_LABEL_LENGTH).optional().nullable(),
  key: z
    .string()
    .min(1)
    .max(FORM_FIELD_KEY_MAX_LENGTH)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field key must start with a letter and use alphanumeric/underscore only')
    .optional(),
  placeholder: z.string().max(500).optional().nullable(),
  subtext: z.string().max(MAX_FIELD_SUBTEXT_LENGTH).optional().nullable(),
  helpText: z.string().max(2000).optional().nullable(),
  inputType: shortInputTypeSchema.optional().nullable(),
  options: z.array(z.union([z.string().min(1).max(200), choiceOptionSchema])).max(MAX_FIELD_OPTIONS).optional().nullable(),
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

export const formDraftCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5}$/, 'Draft code must be exactly 5 alphanumeric characters');

export const formDraftAccessTokenSchema = z
  .string()
  .trim()
  .min(16)
  .max(255);

export const updateFormSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  status: formStatusSchema.optional(),
  slug: formSlugSchema.optional(),
  settings: z.record(z.unknown()).optional().nullable().refine(
    (val) => val == null || JSON.stringify(val).length <= 50_000,
    { message: 'Settings payload must not exceed 50KB' }
  ),
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
  draftCode: formDraftCodeSchema.optional(),
  accessToken: formDraftAccessTokenSchema.optional(),
  metadata: z.preprocess(
    (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      return value;
    },
    z.record(z.string(), z.unknown()).optional()
  ),
});

export const publicDraftSaveSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  uploadIds: z.preprocess(
    (value) => {
      if (!Array.isArray(value)) return value;
      return value.filter((item): item is string => typeof item === 'string');
    },
    z.array(z.string().uuid()).max(100).optional().default([])
  ),
  draftCode: formDraftCodeSchema.optional(),
  accessToken: formDraftAccessTokenSchema.optional(),
  metadata: z.preprocess(
    (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      return value;
    },
    z.record(z.string(), z.unknown()).optional()
  ),
});

export const publicUploadSchema = z.object({
  fieldKey: z.string().min(1).max(FORM_FIELD_KEY_MAX_LENGTH),
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
export type PublicDraftSaveInput = z.infer<typeof publicDraftSaveSchema>;
