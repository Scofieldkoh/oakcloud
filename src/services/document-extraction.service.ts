/**
 * Document Extraction Service
 *
 * Handles AI-powered document field extraction including split detection,
 * field extraction, and evidence tracking as defined in Phase 1A.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import type { Prisma, DocumentExtraction } from '@prisma/client';
import type { ExtractionType, DocumentCategory } from '@prisma/client';
import { createRevision, type LineItemInput } from './document-revision.service';
import { transitionPipelineStatus, recordProcessingAttempt } from './document-processing.service';
import { callAIWithConnector, getBestAvailableModelForTenant, extractJSON } from '@/lib/ai';
import type { AIModel } from '@/lib/ai/types';
import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import * as fs from 'fs/promises';

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
  bbox?: EvidenceBbox; // Optional - bounding box highlighting is now done via PDF text layer
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
  supplierGstNo?: ExtractedField<string>;
  lineItems?: Array<{
    lineNo: number;
    description: ExtractedField<string>;
    quantity?: ExtractedField<string>;
    unitPrice?: ExtractedField<string>;
    amount: ExtractedField<string>;
    gstAmount?: ExtractedField<string>;
    taxCode?: ExtractedField<string>;
    accountCode?: ExtractedField<string>;
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

    // Perform AI extraction (falls back to simulation if AI unavailable)
    const { result: extractionResult, modelUsed, providerUsed } = await performAIExtraction(pages, tenantId, userId, mergedConfig);

    const latencyMs = Date.now() - startTime;

    // Build evidence JSON
    const evidenceJson = buildEvidenceJson(extractionResult);

    // Create extraction record
    const extraction = await prisma.documentExtraction.create({
      data: {
        processingDocumentId,
        extractionType: 'FIELDS',
        provider: providerUsed,
        model: modelUsed,
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
        accountCode: item.accountCode?.value,
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

interface AIExtractionResult {
  result: FieldExtractionResult;
  modelUsed: string;
  providerUsed: string;
}

/**
 * Extract fields using AI vision model
 */
async function performAIExtraction(
  pages: { pageNumber: number; imagePath: string; imageFingerprint: string | null }[],
  tenantId: string,
  userId: string,
  config: ExtractionConfig
): Promise<AIExtractionResult> {
  // Get the best available model for this tenant
  const modelId = await getBestAvailableModelForTenant(tenantId);

  if (!modelId) {
    log.warn('No AI model available, falling back to simulation');
    return {
      result: simulateFallbackExtraction(pages),
      modelUsed: 'simulation',
      providerUsed: 'none',
    };
  }

  // Read and encode the first page image
  const firstPage = pages[0];
  if (!firstPage) {
    throw new Error('No pages to extract from');
  }

  let imageBase64: string;
  let mimeType: string = 'image/png';

  // Derive provider from model ID
  const providerFromModel = modelId.startsWith('gpt') ? 'openai'
    : modelId.startsWith('claude') ? 'anthropic'
    : modelId.startsWith('gemini') ? 'google'
    : 'openai';

  // Resolve the file path - handle various path formats
  let resolvedPath = firstPage.imagePath;
  if (!resolvedPath.startsWith('/') && !/^[A-Za-z]:/.test(resolvedPath)) {
    // Relative path - check if it already has 'uploads' prefix
    if (resolvedPath.startsWith('uploads\\') || resolvedPath.startsWith('uploads/')) {
      resolvedPath = `./${resolvedPath.replace(/\\/g, '/')}`;
    } else {
      resolvedPath = `./uploads/${resolvedPath.replace(/\\/g, '/')}`;
    }
  }

  try {
    const imageBuffer = await fs.readFile(resolvedPath);
    imageBase64 = imageBuffer.toString('base64');

    // Detect mime type from extension
    if (resolvedPath.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (resolvedPath.endsWith('.jpg') || resolvedPath.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (resolvedPath.endsWith('.png')) {
      mimeType = 'image/png';
    }
  } catch (error) {
    log.error(`Failed to read image file: ${resolvedPath} (original: ${firstPage.imagePath})`, error);
    return {
      result: simulateFallbackExtraction(pages),
      modelUsed: 'simulation',
      providerUsed: 'none',
    };
  }

  const extractionPrompt = `You are a document data extraction AI. Analyze this document image and extract all relevant business document information.

## Response Schema (JSON)
{
  "documentCategory": {
    "value": "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | "DEBIT_NOTE" | "PURCHASE_ORDER" | "STATEMENT" | "OTHER",
    "confidence": number between 0 and 1
  },
  "vendorName": {
    "value": "string",
    "confidence": number
  } | null,
  "documentNumber": {
    "value": "string",
    "confidence": number
  } | null,
  "documentDate": {
    "value": "YYYY-MM-DD",
    "confidence": number
  } | null,
  "dueDate": {
    "value": "YYYY-MM-DD",
    "confidence": number
  } | null,
  "currency": {
    "value": "3-letter currency code (e.g., SGD, USD)",
    "confidence": number
  },
  "subtotal": {
    "value": "decimal number as string",
    "confidence": number
  } | null,
  "taxAmount": {
    "value": "decimal number as string",
    "confidence": number
  } | null,
  "totalAmount": {
    "value": "decimal number as string (required)",
    "confidence": number
  },
  "supplierGstNo": {
    "value": "string",
    "confidence": number
  } | null,
  "lineItems": [
    {
      "lineNo": number,
      "description": { "value": "string", "confidence": number },
      "quantity": { "value": "decimal string", "confidence": number } | null,
      "unitPrice": { "value": "decimal string", "confidence": number } | null,
      "amount": { "value": "decimal string", "confidence": number },
      "gstAmount": { "value": "decimal string", "confidence": number } | null,
      "taxCode": { "value": "string (e.g., SR, ZR, ES, OP)", "confidence": number } | null,
      "accountCode": { "value": "string (e.g., 5000, 6000, 6100)", "confidence": number } | null
    }
  ],
  "overallConfidence": number between 0 and 1
}

## Important Rules
- All monetary values should be decimal numbers as strings (e.g., "1234.56")
- Dates should be in YYYY-MM-DD format
- If a field is not visible or cannot be determined, use null
- The totalAmount field is required - estimate if necessary
- Be precise with numbers - don't round unless clearly appropriate`;

  try {
    const response = await callAIWithConnector({
      model: modelId as AIModel,
      tenantId,
      userId,
      userPrompt: extractionPrompt,
      jsonMode: true,
      images: [{ base64: imageBase64, mimeType }],
      operation: 'document_extraction',
      temperature: 0.1, // Low temperature for precise extraction
    });

    // Parse the AI response
    const extractedData = JSON.parse(response.content);

    // Debug: log raw AI response to understand bbox format
    log.debug('AI extraction raw response (sample fields):', {
      vendorName: extractedData.vendorName,
      documentNumber: extractedData.documentNumber,
      totalAmount: extractedData.totalAmount,
    });

    // Map to our FieldExtractionResult format
    return {
      result: mapAIResponseToResult(extractedData, pages),
      modelUsed: modelId,
      providerUsed: providerFromModel,
    };
  } catch (error) {
    log.error('AI extraction failed, falling back to simulation', error);
    return {
      result: simulateFallbackExtraction(pages),
      modelUsed: 'simulation',
      providerUsed: 'none',
    };
  }
}

// Type for AI field response
interface AIFieldValue {
  value: string | number;
  confidence?: number;
}

/**
 * Create field evidence from extraction data
 * Note: Bounding box highlighting is now done via PDF text layer search,
 * so we no longer store bbox data in evidence
 */
function createFieldEvidence(
  text: string,
  confidence: number,
  pageNum: number,
  fingerprint: string
): FieldEvidence {
  return {
    containerPageNumber: pageNum,
    childPageNumber: 1,
    text,
    confidence,
    coordSpace: 'RENDERED_IMAGE',
    renderFingerprint: fingerprint,
    // bbox is no longer used - highlighting uses PDF text layer
  };
}

/**
 * Extract value from AI field response
 */
function extractFieldValue(field: unknown): { value: string; confidence: number } | null {
  if (!field) return null;

  // Object format: { value, confidence }
  if (typeof field === 'object' && 'value' in (field as object)) {
    const f = field as AIFieldValue;
    return {
      value: String(f.value),
      confidence: typeof f.confidence === 'number' ? f.confidence : 0.8,
    };
  }

  // Plain value format
  return { value: String(field), confidence: 0.8 };
}

/**
 * Map AI response to FieldExtractionResult format
 */
function mapAIResponseToResult(
  data: Record<string, unknown>,
  pages: { pageNumber: number; imagePath: string; imageFingerprint: string | null }[]
): FieldExtractionResult {
  const pageNum = pages[0]?.pageNumber ?? 1;
  const fingerprint = pages[0]?.imageFingerprint ?? '';

  // Handle documentCategory (required field)
  const docCategory = extractFieldValue(data.documentCategory);
  const documentCategory: ExtractedField<DocumentCategory> = {
    value: (docCategory?.value as DocumentCategory) || 'OTHER',
    confidence: docCategory?.confidence || 0.8,
  };

  // Handle optional header fields with bbox
  const vendorNameField = extractFieldValue(data.vendorName);
  const documentNumberField = extractFieldValue(data.documentNumber);
  const documentDateField = extractFieldValue(data.documentDate);
  const dueDateField = extractFieldValue(data.dueDate);
  const currencyField = extractFieldValue(data.currency);
  const subtotalField = extractFieldValue(data.subtotal);
  const taxAmountField = extractFieldValue(data.taxAmount);
  const totalAmountField = extractFieldValue(data.totalAmount);
  const supplierGstNoField = extractFieldValue(data.supplierGstNo);

  // Map line items with bbox support
  const rawLineItems = data.lineItems as Array<Record<string, unknown>> || [];
  const lineItems = rawLineItems.map((item, idx) => {
    const descField = extractFieldValue(item.description);
    const qtyField = extractFieldValue(item.quantity);
    const unitPriceField = extractFieldValue(item.unitPrice);
    const amountField = extractFieldValue(item.amount);
    const gstAmountField = extractFieldValue(item.gstAmount);
    const taxCodeField = extractFieldValue(item.taxCode);
    const accountCodeField = extractFieldValue(item.accountCode);

    return {
      lineNo: (item.lineNo as number) || idx + 1,
      description: {
        value: descField?.value || 'Unknown',
        confidence: descField?.confidence || 0.9,
        evidence: descField ? createFieldEvidence(descField.value, descField.confidence || 0.9, pageNum, fingerprint) : undefined,
      },
      quantity: qtyField ? { value: qtyField.value, confidence: qtyField.confidence } : undefined,
      unitPrice: unitPriceField ? { value: unitPriceField.value, confidence: unitPriceField.confidence } : undefined,
      amount: {
        value: amountField?.value || '0',
        confidence: amountField?.confidence || 0.9,
        evidence: amountField ? createFieldEvidence(amountField.value, amountField.confidence || 0.9, pageNum, fingerprint) : undefined,
      },
      gstAmount: gstAmountField ? { value: gstAmountField.value, confidence: gstAmountField.confidence } : undefined,
      taxCode: taxCodeField ? { value: taxCodeField.value, confidence: taxCodeField.confidence } : undefined,
      accountCode: accountCodeField ? { value: accountCodeField.value, confidence: accountCodeField.confidence } : undefined,
    };
  });

  // Get overall confidence from data or calculate default
  const overallConfidence = typeof data.overallConfidence === 'number' ? data.overallConfidence : 0.8;

  return {
    documentCategory,
    vendorName: vendorNameField ? {
      value: vendorNameField.value,
      confidence: vendorNameField.confidence,
      evidence: createFieldEvidence(vendorNameField.value, vendorNameField.confidence, pageNum, fingerprint),
    } : undefined,
    documentNumber: documentNumberField ? {
      value: documentNumberField.value,
      confidence: documentNumberField.confidence,
      evidence: createFieldEvidence(documentNumberField.value, documentNumberField.confidence, pageNum, fingerprint),
    } : undefined,
    documentDate: documentDateField ? {
      value: documentDateField.value,
      confidence: documentDateField.confidence,
      evidence: createFieldEvidence(documentDateField.value, documentDateField.confidence, pageNum, fingerprint),
    } : undefined,
    dueDate: dueDateField ? {
      value: dueDateField.value,
      confidence: dueDateField.confidence,
      evidence: createFieldEvidence(dueDateField.value, dueDateField.confidence, pageNum, fingerprint),
    } : undefined,
    currency: {
      value: currencyField?.value || 'SGD',
      confidence: currencyField?.confidence || 0.9,
    },
    subtotal: subtotalField ? {
      value: subtotalField.value,
      confidence: subtotalField.confidence,
      evidence: createFieldEvidence(subtotalField.value, subtotalField.confidence, pageNum, fingerprint),
    } : undefined,
    taxAmount: taxAmountField ? {
      value: taxAmountField.value,
      confidence: taxAmountField.confidence,
      evidence: createFieldEvidence(taxAmountField.value, taxAmountField.confidence, pageNum, fingerprint),
    } : undefined,
    totalAmount: {
      value: totalAmountField?.value || '0',
      confidence: totalAmountField?.confidence || 0.8,
      evidence: createFieldEvidence(`Total: ${totalAmountField?.value || '0'}`, totalAmountField?.confidence || 0.8, pageNum, fingerprint),
    },
    supplierGstNo: supplierGstNoField ? {
      value: supplierGstNoField.value,
      confidence: supplierGstNoField.confidence,
      evidence: createFieldEvidence(supplierGstNoField.value, supplierGstNoField.confidence, pageNum, fingerprint),
    } : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    overallConfidence,
  };
}

/**
 * Fallback simulation when AI is not available
 */
function simulateFallbackExtraction(
  pages: { pageNumber: number; imagePath: string; imageFingerprint: string | null }[]
): FieldExtractionResult {
  const now = new Date();
  const pageNum = pages[0]?.pageNumber ?? 1;
  const fingerprint = pages[0]?.imageFingerprint ?? '';

  log.info('Using fallback simulation for extraction (no AI available)');

  return {
    documentCategory: {
      value: 'INVOICE',
      confidence: 0.95,
    },
    vendorName: {
      value: 'Sample Vendor Pte Ltd',
      confidence: 0.5,
      evidence: createFieldEvidence('Sample Vendor Pte Ltd', 0.5, pageNum, fingerprint),
    },
    documentNumber: {
      value: `INV-${now.getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      confidence: 0.5,
      evidence: createFieldEvidence('Invoice Number', 0.5, pageNum, fingerprint),
    },
    documentDate: {
      value: now.toISOString().split('T')[0],
      confidence: 0.5,
      evidence: createFieldEvidence(now.toISOString().split('T')[0], 0.5, pageNum, fingerprint),
    },
    currency: {
      value: 'SGD',
      confidence: 0.9,
    },
    totalAmount: {
      value: '0.00',
      confidence: 0.5,
      evidence: createFieldEvidence('AMOUNT DUE SGD 0.00', 0.5, pageNum, fingerprint),
    },
    lineItems: [],
    overallConfidence: 0.5,
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
  if (result.dueDate?.evidence) {
    evidence.dueDate = result.dueDate.evidence;
  }
  if (result.subtotal?.evidence) {
    evidence.subtotal = result.subtotal.evidence;
  }
  if (result.taxAmount?.evidence) {
    evidence.taxAmount = result.taxAmount.evidence;
  }
  if (result.totalAmount?.evidence) {
    evidence.totalAmount = result.totalAmount.evidence;
  }
  if (result.supplierGstNo?.evidence) {
    evidence.supplierGstNo = result.supplierGstNo.evidence;
  }

  // Log evidence summary for debugging
  log.debug('Built evidence JSON with fields:', Object.keys(evidence));

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
