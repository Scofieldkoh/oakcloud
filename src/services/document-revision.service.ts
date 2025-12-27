/**
 * Document Revision Service
 *
 * Handles document revision workflow including creation, approval,
 * and lifecycle management as defined in Oakcloud_Document_Processing_Spec_v3.3.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';
import type { DocumentRevision, DocumentRevisionLineItem } from '@/generated/prisma';
import type {
  RevisionType,
  DocumentCategory,
  DocumentSubCategory,
  GstTreatment,
  ExchangeRateSource,
  ValidationStatus,
} from '@/generated/prisma';
import { Decimal as PrismaDecimal } from '@prisma/client/runtime/client';
import { hashBlake3 } from '@/lib/encryption';

type Decimal = Prisma.Decimal;

const log = createLogger('document-revision');

/**
 * Sanitize a value for Decimal conversion
 * Removes thousands separators (commas) and handles parentheses for negative values
 */
function sanitizeDecimalValue(value: Decimal | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  let str = value.toString().trim();

  // Handle parentheses notation for negative values: (123.45) -> -123.45
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }

  // Remove currency symbols and whitespace
  str = str.replace(/[$€£¥\s]/g, '');

  // Remove thousands separators (commas)
  str = str.replace(/,/g, '');

  return str || null;
}

/**
 * Create a PrismaDecimal from a value, handling formatting issues
 */
function toDecimal(value: Decimal | number | string | null | undefined): PrismaDecimal | null {
  const sanitized = sanitizeDecimalValue(value);
  if (!sanitized) return null;

  try {
    return new PrismaDecimal(sanitized);
  } catch (error) {
    log.warn(`Failed to parse decimal value: "${value}" -> "${sanitized}"`, error);
    return null;
  }
}

/**
 * Create a PrismaDecimal from a value, with fallback to zero
 */
function toDecimalOrZero(value: Decimal | number | string | null | undefined): PrismaDecimal {
  return toDecimal(value) || new PrismaDecimal(0);
}

// ============================================================================
// Types
// ============================================================================

export interface CreateRevisionInput {
  processingDocumentId: string;
  revisionType: RevisionType;
  basedOnRevisionId?: string;
  extractionId?: string;
  createdById: string;

  // Classification
  documentCategory: DocumentCategory;
  documentSubCategory?: DocumentSubCategory;

  // Header fields
  vendorName?: string;
  vendorId?: string;
  documentNumber?: string;
  documentDate?: Date;
  dueDate?: Date;

  // Amounts
  currency: string;
  subtotal?: Decimal | number | string;
  taxAmount?: Decimal | number | string;
  totalAmount: Decimal | number | string;

  // GST
  gstTreatment?: GstTreatment;
  supplierGstNo?: string;

  // Evidence
  headerEvidenceJson?: Record<string, unknown>;

  // Line items
  items?: LineItemInput[];

  // Reason
  reason?: string;
}

export interface LineItemInput {
  lineNo: number;
  description: string;
  quantity?: Decimal | number | string;
  unitPrice?: Decimal | number | string;
  amount: Decimal | number | string;
  gstAmount?: Decimal | number | string;
  taxCode?: string;
  evidenceJson?: Record<string, unknown>;
}

export interface RevisionPatchInput {
  set?: {
    vendorName?: string;
    vendorId?: string;
    documentNumber?: string;
    documentDate?: Date;
    dueDate?: Date;
    currency?: string;
    subtotal?: Decimal | number | string;
    taxAmount?: Decimal | number | string;
    totalAmount?: Decimal | number | string;
    gstTreatment?: GstTreatment;
    supplierGstNo?: string;
    documentCategory?: DocumentCategory;
    documentSubCategory?: DocumentSubCategory;
  };
  itemsToUpsert?: LineItemInput[];
  itemsToDelete?: number[];
}

export interface ApproveRevisionInput {
  userId: string;
  homeCurrency?: string;
  exchangeRate?: Decimal | number | string;
  exchangeRateSource?: ExchangeRateSource;
  exchangeRateDate?: Date;
  overrideReason?: string;
}

export interface RevisionWithItems extends DocumentRevision {
  items: DocumentRevisionLineItem[];
}

export interface ValidationIssue {
  code: string;
  severity: 'WARN' | 'ERROR';
  message: string;
  field?: string;
}

// Validation issue codes from Appendix F
const VALIDATION_CODES = {
  PARTIAL_EXTRACTION: { severity: 'WARN' as const, message: 'Extraction may be incomplete' },
  HEADER_ARITHMETIC_MISMATCH: {
    severity: 'WARN' as const,
    message: 'Header amounts do not compute correctly (subtotal + tax ≠ total)',
  },
  LINE_SUM_MISMATCH: {
    severity: 'WARN' as const,
    message: 'Sum of line items does not match subtotal',
  },
  LINE_GST_SUM_MISMATCH: {
    severity: 'WARN' as const,
    message: 'Sum of line item GST does not match tax amount',
  },
  FUTURE_DATE: { severity: 'WARN' as const, message: 'Document date is in the future' },
  INVALID_CURRENCY: { severity: 'ERROR' as const, message: 'Currency code is invalid' },
  MISSING_VENDOR: { severity: 'WARN' as const, message: 'Vendor name is missing' },
  GST_RATE_MISMATCH: { severity: 'WARN' as const, message: 'GST rate does not match expected' },
  CREDIT_NOTE_TOTAL_NOT_NEGATIVE: {
    severity: 'ERROR' as const,
    message: 'Credit note total must be negative',
  },
};

// ============================================================================
// Create Revision
// ============================================================================

/**
 * Create a new revision from extraction or user edit
 */
export async function createRevision(input: CreateRevisionInput): Promise<RevisionWithItems> {
  const {
    processingDocumentId,
    revisionType,
    basedOnRevisionId,
    extractionId,
    createdById,
    documentCategory,
    documentSubCategory,
    vendorName,
    vendorId,
    documentNumber,
    documentDate,
    dueDate,
    currency,
    subtotal,
    taxAmount,
    totalAmount,
    gstTreatment,
    supplierGstNo,
    headerEvidenceJson,
    items = [],
    reason,
  } = input;

  log.info(`Creating revision for document ${processingDocumentId}, type: ${revisionType}`);

  // Get next revision number
  const lastRevision = await prisma.documentRevision.findFirst({
    where: { processingDocumentId },
    orderBy: { revisionNumber: 'desc' },
  });
  const revisionNumber = (lastRevision?.revisionNumber ?? 0) + 1;

  // Generate document key for duplicate detection
  const documentKey = generateDocumentKey({
    vendorName,
    documentNumber,
    documentDate,
    totalAmount,
    currency,
  });

  // Generate search text for full-text search
  const searchText = generateSearchText({
    vendorName,
    documentNumber,
    documentDate,
    totalAmount: totalAmount?.toString(),
    currency,
  });

  // Create revision with items in a transaction
  const revision = await prisma.$transaction(async (tx) => {
    const rev = await tx.documentRevision.create({
      data: {
        processingDocumentId,
        basedOnRevisionId,
        extractionId,
        revisionNumber,
        revisionType,
        status: 'DRAFT',
        reason,
        documentCategory,
        documentSubCategory,
        vendorName,
        vendorId,
        documentNumber,
        documentDate,
        dueDate,
        currency,
        subtotal: toDecimal(subtotal),
        taxAmount: toDecimal(taxAmount),
        totalAmount: toDecimalOrZero(totalAmount),
        gstTreatment,
        supplierGstNo,
        headerEvidenceJson: headerEvidenceJson as Prisma.InputJsonValue,
        documentKey,
        documentKeyVersion: '1',
        searchText,
        createdById,
        validationStatus: 'PENDING',
      },
    });

    // Create line items
    if (items.length > 0) {
      await tx.documentRevisionLineItem.createMany({
        data: items.map((item) => ({
          revisionId: rev.id,
          lineNo: item.lineNo,
          description: item.description,
          quantity: toDecimal(item.quantity),
          unitPrice: toDecimal(item.unitPrice),
          amount: toDecimalOrZero(item.amount),
          gstAmount: toDecimal(item.gstAmount),
          taxCode: item.taxCode,
          evidenceJson: item.evidenceJson as Prisma.InputJsonValue,
        })),
      });
    }

    return rev;
  });

  // Validate the revision
  await validateRevision(revision.id);

  // Fetch the complete revision with items
  const completeRevision = await getRevision(revision.id);
  if (!completeRevision) {
    throw new Error('Failed to create revision');
  }

  log.info(`Created revision ${revision.id} (rev #${revisionNumber}) for document ${processingDocumentId}`);

  return completeRevision;
}

/**
 * Create a new revision by editing an existing one
 */
export async function createRevisionFromEdit(
  processingDocumentId: string,
  basedOnRevisionId: string,
  patch: RevisionPatchInput,
  createdById: string,
  reason: string = 'user_edit'
): Promise<RevisionWithItems> {
  log.info(`Creating edit revision based on ${basedOnRevisionId}`);

  // Get the base revision with items
  const baseRevision = await getRevision(basedOnRevisionId);
  if (!baseRevision) {
    throw new Error(`Base revision ${basedOnRevisionId} not found`);
  }

  // Apply patches to create new revision data
  const revisionData: CreateRevisionInput = {
    processingDocumentId,
    revisionType: 'USER_EDIT',
    basedOnRevisionId,
    createdById,
    reason,
    documentCategory: patch.set?.documentCategory ?? baseRevision.documentCategory,
    documentSubCategory: patch.set?.documentSubCategory ?? baseRevision.documentSubCategory ?? undefined,
    vendorName: patch.set?.vendorName ?? baseRevision.vendorName ?? undefined,
    vendorId: patch.set?.vendorId ?? baseRevision.vendorId ?? undefined,
    documentNumber: patch.set?.documentNumber ?? baseRevision.documentNumber ?? undefined,
    documentDate: patch.set?.documentDate ?? baseRevision.documentDate ?? undefined,
    dueDate: patch.set?.dueDate ?? baseRevision.dueDate ?? undefined,
    currency: patch.set?.currency ?? baseRevision.currency,
    subtotal: patch.set?.subtotal ?? baseRevision.subtotal ?? undefined,
    taxAmount: patch.set?.taxAmount ?? baseRevision.taxAmount ?? undefined,
    totalAmount: patch.set?.totalAmount ?? baseRevision.totalAmount,
    gstTreatment: patch.set?.gstTreatment ?? baseRevision.gstTreatment ?? undefined,
    supplierGstNo: patch.set?.supplierGstNo ?? baseRevision.supplierGstNo ?? undefined,
  };

  // Handle line items
  let items = [...baseRevision.items];

  // Delete specified items
  if (patch.itemsToDelete && patch.itemsToDelete.length > 0) {
    items = items.filter((item) => !patch.itemsToDelete!.includes(item.lineNo));
  }

  // Upsert items
  if (patch.itemsToUpsert && patch.itemsToUpsert.length > 0) {
    for (const upsertItem of patch.itemsToUpsert) {
      const existingIndex = items.findIndex((i) => i.lineNo === upsertItem.lineNo);
      if (existingIndex >= 0) {
        // Update existing
        items[existingIndex] = {
          ...items[existingIndex],
          description: upsertItem.description,
          quantity: toDecimal(upsertItem.quantity),
          unitPrice: toDecimal(upsertItem.unitPrice),
          amount: toDecimalOrZero(upsertItem.amount),
          gstAmount: toDecimal(upsertItem.gstAmount),
          taxCode: upsertItem.taxCode ?? null,
        } as DocumentRevisionLineItem;
      } else {
        // Add new item
        items.push({
          id: '',
          revisionId: '',
          lineNo: upsertItem.lineNo,
          description: upsertItem.description,
          quantity: toDecimal(upsertItem.quantity),
          unitPrice: toDecimal(upsertItem.unitPrice),
          amount: toDecimalOrZero(upsertItem.amount),
          gstAmount: toDecimal(upsertItem.gstAmount),
          taxCode: upsertItem.taxCode ?? null,
          evidenceJson: upsertItem.evidenceJson as Prisma.JsonValue,
        } as DocumentRevisionLineItem);
      }
    }
  }

  // Renumber items sequentially
  items = items
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((item, index) => ({ ...item, lineNo: index + 1 }));

  revisionData.items = items.map((item) => ({
    lineNo: item.lineNo,
    description: item.description,
    quantity: item.quantity ?? undefined,
    unitPrice: item.unitPrice ?? undefined,
    amount: item.amount,
    gstAmount: item.gstAmount ?? undefined,
    taxCode: item.taxCode ?? undefined,
    evidenceJson: item.evidenceJson as Record<string, unknown> | undefined,
  }));

  return createRevision(revisionData);
}

// ============================================================================
// Approve Revision
// ============================================================================

/**
 * Approve a revision
 */
export async function approveRevision(
  revisionId: string,
  input: ApproveRevisionInput
): Promise<RevisionWithItems> {
  const { userId, homeCurrency, exchangeRate, exchangeRateSource, exchangeRateDate, overrideReason } = input;

  log.info(`Approving revision ${revisionId} by user ${userId}`);

  const revision = await getRevision(revisionId);
  if (!revision) {
    throw new Error(`Revision ${revisionId} not found`);
  }

  // Check revision is in DRAFT status
  if (revision.status !== 'DRAFT') {
    throw new Error(`Cannot approve revision in status ${revision.status}`);
  }

  // Check for blocking validation errors
  const validationIssues = revision.validationIssues as { issues?: ValidationIssue[] } | null;
  const errors = validationIssues?.issues?.filter((i) => i.severity === 'ERROR') ?? [];
  if (errors.length > 0 && !overrideReason) {
    throw new Error(`Cannot approve revision with validation errors: ${errors.map((e) => e.code).join(', ')}`);
  }

  // Calculate home currency equivalent if needed
  let homeEquivalent: Decimal | null = null;
  if (homeCurrency && homeCurrency !== revision.currency && exchangeRate) {
    const rate = toDecimal(exchangeRate);
    homeEquivalent = rate ? new PrismaDecimal(revision.totalAmount.toString()).mul(rate) : null;
  } else if (!homeCurrency || homeCurrency === revision.currency) {
    homeEquivalent = revision.totalAmount;
  }

  // Supersede any previously approved revision
  await prisma.documentRevision.updateMany({
    where: {
      processingDocumentId: revision.processingDocumentId,
      status: 'APPROVED',
    },
    data: {
      status: 'SUPERSEDED',
      supersededAt: new Date(),
    },
  });

  // Approve this revision
  await prisma.documentRevision.update({
    where: { id: revisionId },
    data: {
      status: 'APPROVED',
      approvedById: userId,
      approvedAt: new Date(),
      homeCurrency: homeCurrency ?? revision.currency,
      homeExchangeRate: toDecimal(exchangeRate),
      homeExchangeRateSource: exchangeRateSource,
      exchangeRateDate,
      homeEquivalent,
    },
  });

  // Update processing document to point to this revision
  await prisma.processingDocument.update({
    where: { id: revision.processingDocumentId },
    data: {
      currentRevisionId: revisionId,
      lockVersion: { increment: 1 },
    },
  });

  const approvedRevision = await getRevision(revisionId);
  log.info(`Revision ${revisionId} approved`);

  return approvedRevision!;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a revision and update validation status
 */
export async function validateRevision(revisionId: string): Promise<{
  status: ValidationStatus;
  issues: ValidationIssue[];
}> {
  const revision = await getRevision(revisionId);
  if (!revision) {
    throw new Error(`Revision ${revisionId} not found`);
  }

  const issues: ValidationIssue[] = [];

  // Check for missing vendor
  if (!revision.vendorName) {
    issues.push({
      code: 'MISSING_VENDOR',
      ...VALIDATION_CODES.MISSING_VENDOR,
    });
  }

  // Check for future date
  if (revision.documentDate && revision.documentDate > new Date()) {
    issues.push({
      code: 'FUTURE_DATE',
      ...VALIDATION_CODES.FUTURE_DATE,
      field: 'documentDate',
    });
  }

  // Check credit note total is negative (credit notes are now sub-categories)
  const isCreditNote =
    revision.documentSubCategory === 'VENDOR_CREDIT_NOTE' ||
    revision.documentSubCategory === 'SALES_CREDIT_NOTE';
  if (isCreditNote && revision.totalAmount.greaterThan(0)) {
    issues.push({
      code: 'CREDIT_NOTE_TOTAL_NOT_NEGATIVE',
      ...VALIDATION_CODES.CREDIT_NOTE_TOTAL_NOT_NEGATIVE,
      field: 'totalAmount',
    });
  }

  // Check line item sum matches subtotal
  if (revision.items.length > 0) {
    const lineSum = revision.items.reduce((sum, item) => sum.add(item.amount), new PrismaDecimal(0));

    // Compare against subtotal if available, otherwise against total (when no tax)
    if (revision.subtotal) {
      // Allow small rounding difference (0.01)
      const diff = lineSum.sub(revision.subtotal).abs();
      if (diff.greaterThan(new PrismaDecimal('0.01'))) {
        issues.push({
          code: 'LINE_SUM_MISMATCH',
          ...VALIDATION_CODES.LINE_SUM_MISMATCH,
          field: 'subtotal',
        });
      }
    }

    // Check line item GST sum matches tax amount
    const lineGstSum = revision.items.reduce(
      (sum, item) => sum.add(item.gstAmount || new PrismaDecimal(0)),
      new PrismaDecimal(0)
    );
    if (revision.taxAmount) {
      const gstDiff = lineGstSum.sub(revision.taxAmount).abs();
      if (gstDiff.greaterThan(new PrismaDecimal('0.01'))) {
        issues.push({
          code: 'LINE_GST_SUM_MISMATCH',
          ...VALIDATION_CODES.LINE_GST_SUM_MISMATCH,
          field: 'taxAmount',
        });
      }
    }
  }

  // Check header arithmetic: subtotal + tax = total
  // This check runs if we have subtotal OR taxAmount (not just both)
  if (revision.subtotal || revision.taxAmount) {
    const subtotal = revision.subtotal || new PrismaDecimal(0);
    const tax = revision.taxAmount || new PrismaDecimal(0);
    const expected = subtotal.add(tax);
    // Allow small rounding difference (0.01)
    const diff = expected.sub(revision.totalAmount).abs();
    if (diff.greaterThan(new PrismaDecimal('0.01'))) {
      issues.push({
        code: 'HEADER_ARITHMETIC_MISMATCH',
        ...VALIDATION_CODES.HEADER_ARITHMETIC_MISMATCH,
      });
    }
  }

  // Determine validation status
  let validationStatus: ValidationStatus = 'VALID';
  if (issues.some((i) => i.severity === 'ERROR')) {
    validationStatus = 'INVALID';
  } else if (issues.length > 0) {
    validationStatus = 'WARNINGS';
  }

  // Update revision with validation results
  await prisma.documentRevision.update({
    where: { id: revisionId },
    data: {
      validationStatus,
      validationIssues: { issues } as unknown as Prisma.InputJsonValue,
    },
  });

  return { status: validationStatus, issues };
}

// ============================================================================
// Retrieval
// ============================================================================

/**
 * Get a revision with items
 */
export async function getRevision(revisionId: string): Promise<RevisionWithItems | null> {
  const revision = await prisma.documentRevision.findUnique({
    where: { id: revisionId },
    include: {
      items: {
        orderBy: { lineNo: 'asc' },
      },
    },
  });

  return revision;
}

/**
 * Get current approved revision for a document
 */
export async function getCurrentRevision(processingDocumentId: string): Promise<RevisionWithItems | null> {
  const doc = await prisma.processingDocument.findUnique({
    where: { id: processingDocumentId },
    select: { currentRevisionId: true },
  });

  if (!doc?.currentRevisionId) {
    return null;
  }

  return getRevision(doc.currentRevisionId);
}

/**
 * Get revision history for a document
 */
export async function getRevisionHistory(processingDocumentId: string): Promise<DocumentRevision[]> {
  return prisma.documentRevision.findMany({
    where: { processingDocumentId },
    orderBy: { revisionNumber: 'desc' },
  });
}

/**
 * Get latest draft revision for a document
 */
export async function getLatestDraftRevision(processingDocumentId: string): Promise<RevisionWithItems | null> {
  const revision = await prisma.documentRevision.findFirst({
    where: {
      processingDocumentId,
      status: 'DRAFT',
    },
    orderBy: { revisionNumber: 'desc' },
    include: {
      items: {
        orderBy: { lineNo: 'asc' },
      },
    },
  });

  return revision;
}

// ============================================================================
// Document Key & Search
// ============================================================================

/**
 * Generate document key for duplicate detection (per Appendix B)
 */
function generateDocumentKey(input: {
  vendorName?: string | null;
  documentNumber?: string | null;
  documentDate?: Date | null;
  totalAmount: Decimal | number | string;
  currency: string;
}): string {
  const components = [
    normalizeVendorName(input.vendorName ?? ''),
    input.documentNumber?.toLowerCase() ?? '',
    input.documentDate?.toISOString().split('T')[0] ?? '',
    input.totalAmount.toString(),
    input.currency,
  ].filter(Boolean);

  return hashBlake3(components.join('|'));
}

/**
 * Normalize vendor name for comparison (per Appendix B)
 */
function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pte|ltd|llc|inc|corp|co)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Generate search text for full-text search
 */
function generateSearchText(input: {
  vendorName?: string | null;
  documentNumber?: string | null;
  documentDate?: Date | null;
  totalAmount?: string | null;
  currency?: string | null;
}): string {
  return [
    input.vendorName,
    input.documentNumber,
    input.documentDate?.toISOString().split('T')[0],
    input.totalAmount,
    input.currency,
  ]
    .filter(Boolean)
    .join(' ');
}

// Export helper functions for use in other modules
export { generateDocumentKey, normalizeVendorName, generateSearchText };
