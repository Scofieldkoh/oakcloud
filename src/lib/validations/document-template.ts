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

// ============================================================================
// Placeholder Schema
// ============================================================================

export const placeholderDefinitionSchema = z.object({
  key: z.string().min(1).max(100), // e.g., "company.name", "director[0].name"
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'date', 'number', 'currency', 'list', 'conditional']),
  source: z.enum(['company', 'contact', 'officer', 'shareholder', 'custom', 'system']),
  category: z.string().optional(), // Category for grouping (e.g., 'custom')
  path: z.string().optional(), // Data path for auto-resolution
  defaultValue: z.string().optional(),
  format: z.string().optional(), // Date format, number format, etc.
  required: z.boolean().default(false),
});

export type PlaceholderDefinition = z.infer<typeof placeholderDefinitionSchema>;

// ============================================================================
// Create Template
// ============================================================================

export const createDocumentTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  description: z.string().max(5000).optional().nullable(),
  category: documentTemplateCategoryEnum.default('OTHER'),
  content: z.string().min(1, 'Template content is required'),
  contentJson: z.any().optional().nullable(), // TipTap JSON, validated client-side
  placeholders: z.array(placeholderDefinitionSchema).default([]),
  isActive: z.boolean().default(true),
  defaultShareExpiryHours: z.number().int().min(1).max(8760).optional().nullable(), // max 1 year
});

export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;

// ============================================================================
// Update Template
// ============================================================================

export const updateDocumentTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  category: documentTemplateCategoryEnum.optional(),
  content: z.string().min(1).optional(),
  contentJson: z.any().optional().nullable(),
  placeholders: z.array(placeholderDefinitionSchema).optional(),
  isActive: z.boolean().optional(),
  defaultShareExpiryHours: z.number().int().min(1).max(8760).optional().nullable(),
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
