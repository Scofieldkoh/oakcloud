import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const generatedDocumentStatusEnum = z.enum(['DRAFT', 'FINALIZED', 'ARCHIVED']);

// ============================================================================
// Create Document from Template
// ============================================================================

export const createDocumentFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  companyId: z.string().uuid().optional().nullable(),
  title: z.string().min(1, 'Title is required').max(300),
  customData: z.record(z.unknown()).optional(), // Custom placeholder values
  useLetterhead: z.boolean().default(true),
  shareExpiryHours: z.number().int().min(1).max(8760).optional().nullable(),
});

export type CreateDocumentFromTemplateInput = z.infer<typeof createDocumentFromTemplateSchema>;

// ============================================================================
// Create Blank Document
// ============================================================================

export const createBlankDocumentSchema = z.object({
  companyId: z.string().uuid().optional().nullable(),
  title: z.string().min(1, 'Title is required').max(300),
  content: z.string().optional().default(''),
  contentJson: z.any().optional().nullable(),
  useLetterhead: z.boolean().default(true),
  shareExpiryHours: z.number().int().min(1).max(8760).optional().nullable(),
});

export type CreateBlankDocumentInput = z.infer<typeof createBlankDocumentSchema>;

// ============================================================================
// Update Document
// ============================================================================

export const updateGeneratedDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
  contentJson: z.any().optional().nullable(),
  useLetterhead: z.boolean().optional(),
  shareExpiryHours: z.number().int().min(1).max(8760).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type UpdateGeneratedDocumentInput = z.infer<typeof updateGeneratedDocumentSchema>;

// ============================================================================
// Search Documents
// ============================================================================

export const searchGeneratedDocumentsSchema = z.object({
  query: z.string().optional(),
  companyId: z.string().uuid().optional(),
  companyName: z.string().optional(), // Free text filter by company name
  templateId: z.string().uuid().optional(),
  status: generatedDocumentStatusEnum.optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['title', 'status', 'createdAt', 'updatedAt', 'finalizedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchGeneratedDocumentsInput = z.infer<typeof searchGeneratedDocumentsSchema>;

// ============================================================================
// Clone Document
// ============================================================================

export const cloneDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300).optional(), // Optional new title
});

export type CloneDocumentInput = z.infer<typeof cloneDocumentSchema>;

// ============================================================================
// Document Share
// ============================================================================

export const createDocumentShareSchema = z.object({
  documentId: z.string().uuid(),
  expiresAt: z.string().datetime().optional().nullable(),
  password: z.string().min(4).max(100).optional().nullable(),
  allowedActions: z.array(z.enum(['view', 'download', 'print'])).default(['view']),
  allowComments: z.boolean().default(false),
  commentRateLimit: z.number().int().min(1).max(100).default(20),
  notifyOnComment: z.boolean().default(false),
  notifyOnView: z.boolean().default(false),
});

export type CreateDocumentShareInput = z.infer<typeof createDocumentShareSchema>;

// ============================================================================
// Document Comment
// ============================================================================

export const createDocumentCommentSchema = z.object({
  documentId: z.string().uuid(),
  shareId: z.string().uuid().optional().nullable(), // For external comments
  content: z.string().min(1).max(1000),
  guestName: z.string().min(1).max(100).optional().nullable(),
  guestEmail: z.string().email().max(255).optional().nullable(),
  selectionStart: z.number().int().optional().nullable(),
  selectionEnd: z.number().int().optional().nullable(),
  selectedText: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(), // For replies
});

export type CreateDocumentCommentInput = z.infer<typeof createDocumentCommentSchema>;

// ============================================================================
// Auto-save Draft
// ============================================================================

export const saveDraftSchema = z.object({
  documentId: z.string().uuid(),
  content: z.string(),
  contentJson: z.any().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
