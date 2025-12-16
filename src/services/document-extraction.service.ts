/**
 * Document Extraction Service
 *
 * Handles AI-powered document field extraction including split detection,
 * field extraction, and evidence tracking as defined in Phase 1A.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import type { Prisma, DocumentExtraction } from '@prisma/client';
import type { ExtractionType, DocumentCategory, GstTreatment } from '@prisma/client';
import { createRevision, type LineItemInput } from './document-revision.service';
import { transitionPipelineStatus, recordProcessingAttempt } from './document-processing.service';
import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';

const log = createLogger('document-extraction');

// ============================================================================
// Types
// ============================================================================

export interface ExtractionConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export interface EvidenceBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  unit: 'normalized';
  origin: 'top-left';
}

export interface FieldEvidence {
  containerPageNumber: number;
  childPageNumber: number;
  text: string;
  confidence: number;
  coordSpace: 'RENDERED_IMAGE';
  renderFingerprint: string;
  bbox: EvidenceBbox;
}

export interface ExtractedField<T> {
  value: T;
  evidence?: FieldEvidence;
  confidence?: number;
}

export interface SplitDetectionResult {
  documentBoundaries: Array<{
    pageFrom: number;
    pageTo: number;
    confidence: number;
    predictedCategory?: DocumentCategory;
  }>;
  overallConfidence: number;
}

export interface FieldExtractionResult {
  documentCategory: ExtractedField<DocumentCategory>;
  vendorName?: ExtractedField<string>;
  documentNumber?: ExtractedField<string>;
  documentDate?: ExtractedField<string>;
  dueDate?: ExtractedField<string>;
  currency: ExtractedField<string>;
  subtotal?: ExtractedField<string>;
  taxAmount?: ExtractedField<string>;
  totalAmount: ExtractedField<string>;
  gstTreatment?: ExtractedField<GstTreatment>;
  supplierGstNo?: ExtractedField<string>;
  lineItems?: Array<{
    lineNo: number;
    description: ExtractedField<string>;
    quantity?: ExtractedField<string>;
    unitPrice?: ExtractedField<string>;
    amount: ExtractedField<string>;
    gstAmount?: ExtractedField<string>;
    taxCode?: ExtractedField<string>;
  }>;
  overallConfidence: number;
}

export interface ExtractionJobResult {
  success: boolean;
  extractionId: string;
  revisionId?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Default extraction configuration
const DEFAULT_CONFIG: ExtractionConfig = {
  provider: 'openai',
  model: 'gpt-4-vision',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
};

// ============================================================================
// Split Detection
// ============================================================================

/**
 * Detect document boundaries in a multi-page container
 */
export async function detectSplitBoundaries(
  processingDocumentId: string,
  tenantId: string,
  companyId: string,
  config: Partial<ExtractionConfig> = {}
): Promise<SplitDetectionResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  log.info(`Detecting split boundaries for document ${processingDocumentId}`);

  // Get document pages
  const pages = await prisma.documentPage.findMany({
    where: { processingDocumentId },
    orderBy: { pageNumber: 'asc' },
  });

  if (pages.length === 0) {
    throw new Error('No pages found for document');
  }

  // Record attempt start
  await recordProcessingAttempt(processingDocumentId, 'SPLIT_DETECTION', 'RUNNING');

  try {
    // In production, this would call the AI provider
    // For now, we simulate the extraction
    const startTime = Date.now();

    const result = await simulateSplitDetection(pages);

    const latencyMs = Date.now() - startTime;

    // Create extraction record
    await prisma.documentExtraction.create({
      data: {
        processingDocumentId,
        extractionType: 'SPLIT',
        provider: mergedConfig.provider,
        model: mergedConfig.model,
        promptVersion: mergedConfig.promptVersion,
        extractionSchemaVersion: mergedConfig.schemaVersion,
        rawJson: result as unknown as Prisma.InputJsonValue,
        confidenceJson: { overall: result.overallConfidence } as Prisma.InputJsonValue,
        overallConfidence: result.overallConfidence,
        latencyMs,
      },
    });

    // Record success
    await recordProcessingAttempt(processingDocumentId, 'SPLIT_DETECTION', 'SUCCEEDED', {
      providerLatencyMs: latencyMs,
    });

    log.info(
      `Split detection completed for ${processingDocumentId}: ${result.documentBoundaries.length} documents found`
    );

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await recordProcessingAttempt(processingDocumentId, 'SPLIT_DETECTION', 'FAILED_RETRYABLE', {
      errorCode: 'SPLIT_FAILED',
      errorMessage,
    });

    throw error;
  }
}

/**
 * Simulate split detection (placeholder for actual AI implementation)
 */
async function simulateSplitDetection(
  pages: { pageNumber: number }[]
): Promise<SplitDetectionResult> {
  // Simple heuristic: treat each page as a separate document
  // In production, this would use AI to detect actual boundaries
  const boundaries = pages.map((page) => ({
    pageFrom: page.pageNumber,
    pageTo: page.pageNumber,
    confidence: 0.85,
    predictedCategory: 'INVOICE' as DocumentCategory,
  }));

  // If single page, high confidence
  if (pages.length === 1) {
    return {
      documentBoundaries: boundaries,
      overallConfidence: 0.95,
    };
  }

  return {
    documentBoundaries: boundaries,
    overallConfidence: 0.75,
  };
}

// ============================================================================
// Field Extraction
// ============================================================================

/**
 * Extract fields from a document
 */
export async function extractFields(
  processingDocumentId: string,
  tenantId: string,
  companyId: string,
  userId: string,
  config: Partial<ExtractionConfig> = {}
): Promise<ExtractionJobResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  log.info(`Extracting fields for document ${processingDocumentId}`);

  // Update pipeline status
  await transitionPipelineStatus(processingDocumentId, 'PROCESSING', tenantId, companyId);

  // Record attempt start
  await recordProcessingAttempt(processingDocumentId, 'FIELD_EXTRACTION', 'RUNNING');

  try {
    const startTime = Date.now();

    // Get document pages for extraction
    const pages = await prisma.documentPage.findMany({
      where: { processingDocumentId },
      orderBy: { pageNumber: 'asc' },
    });

    // Validate that pages exist - cannot extract without rendered pages
    if (pages.length === 0) {
      throw new Error('No pages found for document. Pages must be created before extraction.');
    }

    log.info(`Found ${pages.length} pages for document ${processingDocumentId}`);

    // Generate input fingerprint for reproducibility
    const inputFingerprint = generateInputFingerprint(
      pages.map((p) => p.id),
      mergedConfig
    );

    // Perform extraction (in production, this calls AI provider)
    const extractionResult = await simulateFieldExtraction(pages);

    const latencyMs = Date.now() - startTime;

    // Build evidence JSON
    const evidenceJson = buildEvidenceJson(extractionResult);

    // Create extraction record
    const extraction = await prisma.documentExtraction.create({
      data: {
        processingDocumentId,
        extractionType: 'FIELDS',
        provider: mergedConfig.provider,
        model: mergedConfig.model,
        promptVersion: mergedConfig.promptVersion,
        extractionSchemaVersion: mergedConfig.schemaVersion,
        inputFingerprint,
        rawJson: extractionResult as unknown as Prisma.InputJsonValue,
        confidenceJson: buildConfidenceJson(extractionResult),
        evidenceJson: evidenceJson as Prisma.InputJsonValue,
        overallConfidence: extractionResult.overallConfidence,
        latencyMs,
      },
    });

    // Create revision from extraction
    const revision = await createRevision({
      processingDocumentId,
      revisionType: 'EXTRACTION',
      extractionId: extraction.id,
      createdById: userId,
      documentCategory: extractionResult.documentCategory.value,
      vendorName: extractionResult.vendorName?.value,
      documentNumber: extractionResult.documentNumber?.value,
      documentDate: extractionResult.documentDate?.value
        ? new Date(extractionResult.documentDate.value)
        : undefined,
      dueDate: extractionResult.dueDate?.value ? new Date(extractionResult.dueDate.value) : undefined,
      currency: extractionResult.currency.value,
      subtotal: extractionResult.subtotal?.value,
      taxAmount: extractionResult.taxAmount?.value,
      totalAmount: extractionResult.totalAmount.value,
      gstTreatment: extractionResult.gstTreatment?.value,
      supplierGstNo: extractionResult.supplierGstNo?.value,
      headerEvidenceJson: evidenceJson,
      items: extractionResult.lineItems?.map((item) => ({
        lineNo: item.lineNo,
        description: item.description.value,
        quantity: item.quantity?.value,
        unitPrice: item.unitPrice?.value,
        amount: item.amount.value,
        gstAmount: item.gstAmount?.value,
        taxCode: item.taxCode?.value,
        evidenceJson: {
          description: item.description.evidence,
          amount: item.amount.evidence,
        },
      })) as LineItemInput[],
      reason: 'initial_extraction',
    });

    // Update pipeline status to EXTRACTION_DONE
    await transitionPipelineStatus(processingDocumentId, 'EXTRACTION_DONE', tenantId, companyId);

    // Record success
    await recordProcessingAttempt(processingDocumentId, 'FIELD_EXTRACTION', 'SUCCEEDED', {
      providerLatencyMs: latencyMs,
    });

    log.info(`Field extraction completed for ${processingDocumentId}, revision ${revision.id} created`);

    return {
      success: true,
      extractionId: extraction.id,
      revisionId: revision.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRetryable = isRetryableError(error);

    await recordProcessingAttempt(
      processingDocumentId,
      'FIELD_EXTRACTION',
      isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
      {
        errorCode: 'EXTRACTION_FAILED',
        errorMessage,
      }
    );

    await transitionPipelineStatus(
      processingDocumentId,
      isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
      tenantId,
      companyId,
      { error: { code: 'EXTRACTION_FAILED', message: errorMessage } }
    );

    return {
      success: false,
      extractionId: '',
      error: {
        code: 'EXTRACTION_FAILED',
        message: errorMessage,
        retryable: isRetryable,
      },
    };
  }
}

/**
 * Simulate field extraction (placeholder for actual AI implementation)
 */
async function simulateFieldExtraction(
  pages: { pageNumber: number; imagePath: string; imageFingerprint: string | null }[]
): Promise<FieldExtractionResult> {
  // Generate sample extraction result
  // In production, this would call the AI provider
  const now = new Date();

  return {
    documentCategory: {
      value: 'INVOICE',
      confidence: 0.95,
    },
    vendorName: {
      value: 'Acme Corporation Pte Ltd',
      confidence: 0.92,
      evidence: {
        containerPageNumber: pages[0]?.pageNumber ?? 1,
        childPageNumber: 1,
        text: 'Acme Corporation Pte Ltd',
        confidence: 0.92,
        coordSpace: 'RENDERED_IMAGE',
        renderFingerprint: pages[0]?.imageFingerprint ?? '',
        bbox: { x0: 0.1, y0: 0.05, x1: 0.4, y1: 0.08, unit: 'normalized', origin: 'top-left' },
      },
    },
    documentNumber: {
      value: `INV-${now.getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      confidence: 0.98,
    },
    documentDate: {
      value: now.toISOString().split('T')[0],
      confidence: 0.94,
    },
    currency: {
      value: 'SGD',
      confidence: 0.99,
    },
    subtotal: {
      value: '1000.00',
      confidence: 0.96,
    },
    taxAmount: {
      value: '90.00',
      confidence: 0.96,
    },
    totalAmount: {
      value: '1090.00',
      confidence: 0.98,
      evidence: {
        containerPageNumber: pages[0]?.pageNumber ?? 1,
        childPageNumber: 1,
        text: 'Total: SGD 1,090.00',
        confidence: 0.98,
        coordSpace: 'RENDERED_IMAGE',
        renderFingerprint: pages[0]?.imageFingerprint ?? '',
        bbox: { x0: 0.6, y0: 0.85, x1: 0.9, y1: 0.88, unit: 'normalized', origin: 'top-left' },
      },
    },
    gstTreatment: {
      value: 'STANDARD_RATED',
      confidence: 0.85,
    },
    lineItems: [
      {
        lineNo: 1,
        description: { value: 'Consulting Services', confidence: 0.92 },
        quantity: { value: '10', confidence: 0.90 },
        unitPrice: { value: '50.00', confidence: 0.88 },
        amount: { value: '500.00', confidence: 0.95 },
      },
      {
        lineNo: 2,
        description: { value: 'Software License', confidence: 0.94 },
        quantity: { value: '1', confidence: 0.95 },
        unitPrice: { value: '500.00', confidence: 0.92 },
        amount: { value: '500.00', confidence: 0.96 },
      },
    ],
    overallConfidence: 0.92,
  };
}

/**
 * Re-extract fields with a different configuration
 */
export async function reextractFields(
  processingDocumentId: string,
  tenantId: string,
  companyId: string,
  userId: string,
  config: Partial<ExtractionConfig>
): Promise<ExtractionJobResult> {
  log.info(`Re-extracting fields for document ${processingDocumentId}`);

  return extractFields(processingDocumentId, tenantId, companyId, userId, config);
}

// ============================================================================
// Retrieval
// ============================================================================

/**
 * Get extraction by ID
 */
export async function getExtraction(extractionId: string): Promise<DocumentExtraction | null> {
  return prisma.documentExtraction.findUnique({
    where: { id: extractionId },
  });
}

/**
 * Get extractions for a document
 */
export async function getExtractionsByDocument(
  processingDocumentId: string,
  type?: ExtractionType
): Promise<DocumentExtraction[]> {
  const where: Prisma.DocumentExtractionWhereInput = { processingDocumentId };
  if (type) {
    where.extractionType = type;
  }

  return prisma.documentExtraction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// Page Management
// ============================================================================

/**
 * Create document page records
 */
export async function createDocumentPages(
  processingDocumentId: string,
  pages: Array<{
    pageNumber: number;
    imagePath: string;
    widthPx: number;
    heightPx: number;
    imageFingerprint?: string;
    renderDpi?: number;
  }>
): Promise<void> {
  await prisma.documentPage.createMany({
    data: pages.map((page) => ({
      processingDocumentId,
      pageNumber: page.pageNumber,
      imagePath: page.imagePath,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      imageFingerprint: page.imageFingerprint,
      renderDpi: page.renderDpi ?? 200,
    })),
  });

  log.info(`Created ${pages.length} page records for document ${processingDocumentId}`);
}

/**
 * Get document pages
 */
export async function getDocumentPages(processingDocumentId: string) {
  return prisma.documentPage.findMany({
    where: { processingDocumentId },
    orderBy: { pageNumber: 'asc' },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate input fingerprint for reproducibility
 */
function generateInputFingerprint(pageIds: string[], config: ExtractionConfig): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({ pageIds, config }));
  return hash.digest('hex');
}

/**
 * Build evidence JSON from extraction result
 */
function buildEvidenceJson(result: FieldExtractionResult): Record<string, FieldEvidence | undefined> {
  const evidence: Record<string, FieldEvidence | undefined> = {};

  if (result.vendorName?.evidence) {
    evidence.vendorName = result.vendorName.evidence;
  }
  if (result.documentNumber?.evidence) {
    evidence.documentNumber = result.documentNumber.evidence;
  }
  if (result.documentDate?.evidence) {
    evidence.documentDate = result.documentDate.evidence;
  }
  if (result.totalAmount?.evidence) {
    evidence.totalAmount = result.totalAmount.evidence;
  }

  return evidence;
}

/**
 * Build confidence JSON from extraction result
 */
function buildConfidenceJson(result: FieldExtractionResult): Prisma.InputJsonValue {
  return {
    overall: result.overallConfidence,
    fields: {
      documentCategory: result.documentCategory.confidence,
      vendorName: result.vendorName?.confidence,
      documentNumber: result.documentNumber?.confidence,
      documentDate: result.documentDate?.confidence,
      currency: result.currency.confidence,
      totalAmount: result.totalAmount.confidence,
    },
  } as Prisma.InputJsonValue;
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Non-retryable errors
    if (
      message.includes('pdf encrypted') ||
      message.includes('pdf corrupted') ||
      message.includes('unsupported')
    ) {
      return false;
    }
    // Retryable errors
    if (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('network') ||
      message.includes('temporary')
    ) {
      return true;
    }
  }
  // Default to retryable
  return true;
}

// Types are already exported via interface declarations
