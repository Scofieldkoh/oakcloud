import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const documentTemplateCategoryEnum = z.enum([
  'RESOLUTION',
  'CONTRACT',
  'LETTER',
  'MINUTES',
  'NOTICE',
  'CERTIFICATE',
  'OTHER',
]);

export const documentTemplateCompositionTypeEnum = z.enum([
  'STANDARD',
  'SERVICE_AGREEMENT',
]);

// ============================================================================
// JSON / Placeholder Schemas
// ============================================================================

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

/**
 * F1/W1 storage contract.
 *
 * Stored field definitions are intentionally lossless at this request boundary:
 * stable IDs, preserve-only/future type strings, options/format/default values,
 * omitted-vs-explicit required state and unknown JSON-compatible metadata must
 * survive API -> persistence -> API unchanged. Trusted-rich authority is never
 * derived from this declarative data; C06 owns that in-process capability.
 */
export const placeholderDefinitionSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  source: z.string().min(1).max(100).optional(),
  category: z.string().optional(),
  path: z.string().optional(),
  defaultValue: jsonValueSchema.optional(),
  format: jsonValueSchema.optional(),
  options: jsonValueSchema.optional(),
  required: z.boolean().optional(),
  linkedTo: z.string().optional(),
  sourcePartial: z.string().optional(),
}).catchall(jsonValueSchema);

export type PlaceholderDefinition = z.infer<typeof placeholderDefinitionSchema>;

const a4LayoutSchema = z.object({
  version: z.literal(1),
  lineHeight: z.number().min(1).max(3),
  paragraphSpacing: z.string(),
  marginsMm: z.object({
    top: z.number().finite().min(5).max(60),
    right: z.number().finite().min(5).max(60),
    bottom: z.number().finite().min(5).max(60),
    left: z.number().finite().min(5).max(60),
  }),
});

const contentJsonSchema = z.record(jsonValueSchema).superRefine((value, context) => {
  if (value.layout === undefined) return;
  const parsed = a4LayoutSchema.safeParse(value.layout);
  if (!parsed.success) {
    context.addIssue({
      code: 'custom',
      path: ['layout'],
      message: 'Invalid A4 document layout',
    });
  }
});

// ============================================================================
// Create Template
// ============================================================================

export const createDocumentTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  description: z.string().max(5000).optional().nullable(),
  category: documentTemplateCategoryEnum.default('OTHER'),
  compositionType: documentTemplateCompositionTypeEnum.default('STANDARD'),
  content: z.string().min(1, 'Template content is required'),
  contentJson: contentJsonSchema.optional().nullable(),
  placeholders: z.array(placeholderDefinitionSchema).default([]),
  sharePointRelativeFolderPath: z.string().max(400, 'SharePoint subfolder is too long').optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;

// ============================================================================
// Update Template
// ============================================================================

export const updateDocumentTemplateSchema = z.object({
  id: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  category: documentTemplateCategoryEnum.optional(),
  compositionType: documentTemplateCompositionTypeEnum.optional(),
  content: z.string().min(1).optional(),
  contentJson: contentJsonSchema.optional().nullable(),
  placeholders: z.array(placeholderDefinitionSchema).optional(),
  sharePointRelativeFolderPath: z.string().max(400, 'SharePoint subfolder is too long').optional().nullable(),
  isActive: z.boolean().optional(),
});

export type UpdateDocumentTemplateInput = z.infer<typeof updateDocumentTemplateSchema>;

// ============================================================================
// Search Templates
// ============================================================================

export const searchDocumentTemplatesSchema = z.object({
  query: z.string().optional(),
  category: documentTemplateCategoryEnum.optional(),
  isActive: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'category', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type SearchDocumentTemplatesInput = z.infer<typeof searchDocumentTemplatesSchema>;

// ============================================================================
// Duplicate Template
// ============================================================================

export const duplicateDocumentTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(), // Optional new name, defaults to "Copy of X"
});

export type DuplicateDocumentTemplateInput = z.infer<typeof duplicateDocumentTemplateSchema>;
