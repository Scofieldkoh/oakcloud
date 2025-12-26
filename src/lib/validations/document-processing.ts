/**
 * Document Processing Validation Schemas
 *
 * Zod schemas for document processing, category/sub-category validation,
 * and field extraction.
 */

import { z } from 'zod';
import { DocumentCategory, DocumentSubCategory } from '@/generated/prisma';
import {
  CATEGORY_SUBCATEGORY_MAP,
  isValidSubCategoryForCategory,
} from '@/lib/document-categories';

// =============================================================================
// Category & Sub-Category Enums
// =============================================================================

export const documentCategoryEnum = z.nativeEnum(DocumentCategory);
export const documentSubCategoryEnum = z.nativeEnum(DocumentSubCategory);

// =============================================================================
// Category-SubCategory Cross-Validation
// =============================================================================

/**
 * Schema for category with optional sub-category, with cross-validation
 * to ensure the sub-category belongs to the selected category.
 */
export const categorySubCategorySchema = z
  .object({
    documentCategory: documentCategoryEnum,
    documentSubCategory: documentSubCategoryEnum.nullable().optional(),
  })
  .refine(
    (data) => {
      // If no sub-category provided, it's valid (sub-category is optional)
      if (!data.documentSubCategory) {
        return true;
      }
      // Validate sub-category belongs to the category
      return isValidSubCategoryForCategory(data.documentCategory, data.documentSubCategory);
    },
    {
      message: 'Sub-category is not valid for the selected category',
      path: ['documentSubCategory'],
    }
  );

export type CategorySubCategoryInput = z.infer<typeof categorySubCategorySchema>;

// =============================================================================
// Document Revision Input
// =============================================================================

/**
 * Schema for creating or updating a document revision
 */
export const documentRevisionInputSchema = z
  .object({
    // Classification
    documentCategory: documentCategoryEnum,
    documentSubCategory: documentSubCategoryEnum.nullable().optional(),

    // Header fields
    vendorName: z.string().nullable().optional(),
    vendorId: z.string().uuid().nullable().optional(),
    documentNumber: z.string().max(100).nullable().optional(),
    documentDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),

    // Amounts
    currency: z.string().length(3, 'Currency must be 3 characters'),
    subtotal: z.string().nullable().optional(),
    taxAmount: z.string().nullable().optional(),
    totalAmount: z.string(),

    // GST
    gstTreatment: z.enum(['STANDARD_RATED', 'ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE', 'REVERSE_CHARGE']).nullable().optional(),
    supplierGstNo: z.string().max(50).nullable().optional(),

    // Line items
    lineItems: z
      .array(
        z.object({
          lineNo: z.number().int().positive(),
          description: z.string(),
          quantity: z.string().nullable().optional(),
          unitPrice: z.string().nullable().optional(),
          amount: z.string(),
          gstAmount: z.string().nullable().optional(),
          taxCode: z.string().nullable().optional(),
          accountCode: z.string().nullable().optional(),
        })
      )
      .optional(),
  })
  .refine(
    (data) => {
      if (!data.documentSubCategory) return true;
      return isValidSubCategoryForCategory(data.documentCategory, data.documentSubCategory);
    },
    {
      message: 'Sub-category is not valid for the selected category',
      path: ['documentSubCategory'],
    }
  );

export type DocumentRevisionInput = z.infer<typeof documentRevisionInputSchema>;

// =============================================================================
// Extraction Result Validation
// =============================================================================

/**
 * Schema for validating AI extraction results
 */
export const extractionResultSchema = z.object({
  documentCategory: z.object({
    value: documentCategoryEnum,
    confidence: z.number().min(0).max(1).optional(),
  }),
  documentSubCategory: z
    .object({
      value: documentSubCategoryEnum,
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  vendorName: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  documentNumber: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  documentDate: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  dueDate: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  currency: z.object({
    value: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  subtotal: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  taxAmount: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  totalAmount: z.object({
    value: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  supplierGstNo: z
    .object({
      value: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    })
    .nullable()
    .optional(),
  lineItems: z
    .array(
      z.object({
        lineNo: z.number(),
        description: z.object({
          value: z.string(),
          confidence: z.number().min(0).max(1).optional(),
        }),
        quantity: z
          .object({
            value: z.string(),
            confidence: z.number().min(0).max(1).optional(),
          })
          .nullable()
          .optional(),
        unitPrice: z
          .object({
            value: z.string(),
            confidence: z.number().min(0).max(1).optional(),
          })
          .nullable()
          .optional(),
        amount: z.object({
          value: z.string(),
          confidence: z.number().min(0).max(1).optional(),
        }),
        gstAmount: z
          .object({
            value: z.string(),
            confidence: z.number().min(0).max(1).optional(),
          })
          .nullable()
          .optional(),
        taxCode: z
          .object({
            value: z.string(),
            confidence: z.number().min(0).max(1).optional(),
          })
          .nullable()
          .optional(),
        accountCode: z
          .object({
            value: z.string(),
            confidence: z.number().min(0).max(1).optional(),
          })
          .nullable()
          .optional(),
      })
    )
    .optional(),
  overallConfidence: z.number().min(0).max(1),
});

export type ExtractionResultInput = z.infer<typeof extractionResultSchema>;

// =============================================================================
// Category Filter Schema (for API queries)
// =============================================================================

export const documentFilterSchema = z.object({
  category: documentCategoryEnum.optional(),
  subCategory: documentSubCategoryEnum.optional(),
  vendorId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'SUPERSEDED']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type DocumentFilterInput = z.infer<typeof documentFilterSchema>;

// =============================================================================
// Helper: Get valid sub-categories for dropdown
// =============================================================================

/**
 * Get sub-category options that are valid for a given category
 */
export function getValidSubCategories(category: DocumentCategory): DocumentSubCategory[] {
  return CATEGORY_SUBCATEGORY_MAP[category] ?? [];
}
