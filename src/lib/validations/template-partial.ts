import { z } from 'zod';
import { placeholderDefinitionSchema } from './document-template';

// ============================================================================
// Partial Name Validation
// ============================================================================

/**
 * Partial names must:
 * - Start with a letter
 * - Contain only letters, numbers, hyphens, and underscores
 * - Be between 1-100 characters
 */
const partialNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name must be 100 characters or less')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'Name must start with a letter and contain only letters, numbers, hyphens, and underscores'
  );

// ============================================================================
// Create Partial
// ============================================================================

export const createTemplatePartialSchema = z.object({
  name: partialNameSchema,
  description: z.string().max(1000).optional().nullable(),
  content: z.string().min(1, 'Content is required').max(50000, 'Content is too large'),
  placeholders: z.array(placeholderDefinitionSchema).default([]),
});

export type CreateTemplatePartialInput = z.infer<typeof createTemplatePartialSchema>;

// ============================================================================
// Update Partial
// ============================================================================

export const updateTemplatePartialSchema = z.object({
  id: z.string().uuid(),
  name: partialNameSchema.optional(),
  description: z.string().max(1000).optional().nullable(),
  content: z.string().min(1).max(50000).optional(),
  placeholders: z.array(placeholderDefinitionSchema).optional(),
});

export type UpdateTemplatePartialInput = z.infer<typeof updateTemplatePartialSchema>;

// ============================================================================
// Search Partials
// ============================================================================

export const searchTemplatePartialsSchema = z.object({
  search: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type SearchTemplatePartialsInput = z.infer<typeof searchTemplatePartialsSchema>;

// ============================================================================
// Duplicate Partial
// ============================================================================

export const duplicateTemplatePartialSchema = z.object({
  id: z.string().uuid(),
  name: partialNameSchema,
});

export type DuplicateTemplatePartialInput = z.infer<typeof duplicateTemplatePartialSchema>;
