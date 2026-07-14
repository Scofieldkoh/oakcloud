/**
 * Document Extraction Service
 *
 * Handles AI-powered document field extraction including split detection,
 * field extraction, and evidence tracking as defined in Phase 1A.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';
import type { DocumentExtraction } from '@/generated/prisma';
import type { ExtractionType, DocumentCategory, DocumentSubCategory, ExchangeRateSource } from '@/generated/prisma';
import {
  createRevision,
  normalizeCounterpartyIdentityDraft,
  type CounterpartyIdentityDraft,
  type LineItemInput,
} from './document-revision.service';
import { transitionPipelineStatus, recordProcessingAttempt, saveCheckpoint } from './document-processing.service';
import { checkForDuplicates, updateDuplicateStatus } from './duplicate-detection.service';
import {
  callAIWithConnector,
  getBestAvailableModelForWorkspace,
  getDocumentInputModeForModel,
  getModelConfig,
  logExtractionResults,
  isAIDebugEnabled,
  stripMarkdownCodeBlocks,
  AI_MODELS,
} from '@/lib/ai';
import { prepareImageUrlVisionInput } from '@/lib/ai/vision-input';
import type { AIModel } from '@/lib/ai/types';
import { PDFDocument } from 'pdf-lib';
import {
  inspectOpenAIBatchJob,
  submitOpenAIBatchJob,
} from '@/lib/ai/providers/openai-batch';
import {
  extractStructuredWithMistralOCR,
  MISTRAL_OCR_MODEL_ID,
  MistralOCRNotConfiguredError,
  inspectMistralOCRBatchJob,
  submitMistralOCRBatchJob,
} from '@/lib/ocr/mistral';
import { storage } from '@/lib/storage';
import { performAISplitDetection } from '@/lib/split-detection';
import { hashBlake3 } from '@/lib/encryption';
import {
  getCatchAllSubCategory,
  isValidSubCategoryForCategory,
} from '@/lib/document-categories';
import { getAccountsForSelect } from './chart-of-accounts.service';
import { getRateWithPreference } from './exchange-rate.service';
import type { SupportedCurrency } from '@/lib/validations/exchange-rate';
import { resolveVendor } from './vendor-resolution.service';
import { resolveCustomer } from './customer-resolution.service';
import { resolveLookupDate } from '@/lib/date-lookup';
import { normalizeCompanyName } from '@/lib/utils';
import { normalizeVendorName } from '@/lib/vendor-name';
import {
  getDocumentExtractionPromptSettings,
  resolveDocumentExtractionPrompt,
} from './document-extraction-prompt-settings.service';

type _Decimal = Prisma.Decimal;

const log = createLogger('document-extraction');

// ============================================================================
// Types
// ============================================================================

export interface ExtractionConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'mistral';
  model: string;
  promptVersion: string;
  schemaVersion: string;
  /** Additional context to help AI extraction (e.g., "Focus on line items") */
  additionalContext?: string;
  /** Queue extraction as a provider batch job when supported */
  batchMode?: boolean;
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

export interface HomeCurrencyEquivalent {
  currency: string;
  exchangeRate: string;
  subtotal?: string;
  taxAmount?: string;
  totalAmount: string;
  confidence: number;
}

export interface FieldExtractionResult {
  documentCategory: ExtractedField<DocumentCategory>;
  documentSubCategory?: ExtractedField<DocumentSubCategory>;
  vendorName?: ExtractedField<string>;
  customerName?: ExtractedField<string>;
  counterpartyIdentificationType?: ExtractedField<string>;
  counterpartyIdentificationNumber?: ExtractedField<string>;
  counterpartyAddress?: ExtractedField<string>;
  counterpartyEmail?: ExtractedField<string>;
  counterpartyPhone?: ExtractedField<string>;
  counterpartyIdentity?: CounterpartyIdentityDraft;
  documentNumber?: ExtractedField<string>;
  documentDate?: ExtractedField<string>;
  dueDate?: ExtractedField<string>;
  currency: ExtractedField<string>;
  subtotal?: ExtractedField<string>;
  taxAmount?: ExtractedField<string>;
  totalAmount: ExtractedField<string>;
  supplierGstNo?: ExtractedField<string>;
  homeCurrencyEquivalent?: HomeCurrencyEquivalent;
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
  model: '',
  promptVersion: '1.0.0',
  schemaVersion: '1.0.0',
};

const OCR_CONFIDENCE_FIELD_JSON_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    value: {
      type: ['string', 'number', 'null'],
    },
    confidence: {
      type: 'number',
    },
  },
};

const OCR_HOME_CURRENCY_JSON_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    currency: { type: 'string' },
    exchangeRate: { type: ['string', 'number'] },
    subtotal: { type: ['string', 'number', 'null'] },
    taxAmount: { type: ['string', 'number', 'null'] },
    totalAmount: { type: ['string', 'number'] },
    confidence: { type: 'number' },
  },
};

const OCR_LINE_ITEM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lineNo: { type: 'number' },
    description: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    quantity: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    unitPrice: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    amount: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    gstAmount: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    taxCode: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    accountCode: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
  },
  required: ['lineNo', 'description', 'amount'],
};

const MISTRAL_DOCUMENT_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentCategory: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    documentSubCategory: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    vendorName: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    customerName: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    counterpartyIdentificationType: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    counterpartyIdentificationNumber: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    counterpartyAddress: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    counterpartyEmail: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    counterpartyPhone: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    documentNumber: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    documentDate: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    dueDate: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    currency: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    subtotal: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    taxAmount: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    totalAmount: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    supplierGstNo: OCR_CONFIDENCE_FIELD_JSON_SCHEMA,
    homeCurrencyEquivalent: OCR_HOME_CURRENCY_JSON_SCHEMA,
    lineItems: {
      type: 'array',
      items: OCR_LINE_ITEM_JSON_SCHEMA,
    },
    overallConfidence: {
      type: 'number',
    },
  },
  required: ['documentCategory', 'currency', 'totalAmount', 'lineItems', 'overallConfidence'],
};

const MISTRAL_LINE_ITEM_ONLY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lineItems: {
      type: 'array',
      items: OCR_LINE_ITEM_JSON_SCHEMA,
    },
  },
  required: ['lineItems'],
};

const LIGHTWEIGHT_COUNTERPARTY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendorName: { type: ['string', 'null'] },
    customerName: { type: ['string', 'null'] },
  },
  required: ['vendorName', 'customerName'],
};

const LIGHTWEIGHT_COUNTERPARTY_MAX_OUTPUT_TOKENS = 80;
const COUNTERPARTY_IDENTITY_PROMPT = `

## Counterparty Identity
Extract the external vendor/customer's identification data when visible. Prioritize UEN or registration identifiers, then preserve every available address, email, and phone value. Return confidence-bearing fields named counterpartyIdentificationType, counterpartyIdentificationNumber, counterpartyAddress, counterpartyEmail, and counterpartyPhone. Use UEN for Singapore entity registration numbers and OTHER for other organization registration identifiers. Do not return the uploading company's own identity.`;

function withCounterpartyIdentityPrompt(prompt: string): string {
  return `${prompt.trim()}${COUNTERPARTY_IDENTITY_PROMPT}`;
}
const LEARNING_CONTEXT_MAX_RECORDS = 3;
const LEARNING_CONTEXT_FALLBACK_SCAN_LIMIT = 30;
const LEARNING_CONTEXT_MAX_LINE_ITEMS_PER_RECORD = 8;
const LEARNING_CONTEXT_DESCRIPTION_MAX_CHARS = 120;
const LEARNING_CONTEXT_MAX_CHARS = 6000;

interface LightweightCounterpartyPassResult {
  vendorName: string | null;
  customerName: string | null;
}

interface CounterpartyHintCompanyContext {
  name: string;
  uen: string;
  formerName?: string | null;
  formerNames: string[];
}

type HistoricalCounterpartySide = 'vendor' | 'customer';
type HistoricalCounterpartyMatchMode = 'CONTACT_ID' | 'NORMALIZED_NAME';

interface HistoricalRevisionContextRecord {
  id: string;
  documentCategory: DocumentCategory;
  documentSubCategory: DocumentSubCategory | null;
  vendorName: string | null;
  customerName: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  currency: string;
  subtotal: Prisma.Decimal | null;
  taxAmount: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal;
  supplierGstNo: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  items: Array<{
    lineNo: number;
    description: string;
    quantity: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal | null;
    amount: Prisma.Decimal;
    gstAmount: Prisma.Decimal | null;
    taxCode: string | null;
    accountCode: string | null;
  }>;
}

interface CounterpartyLearningCandidate {
  side: HistoricalCounterpartySide;
  rawName: string;
  normalizedName: string;
  canonicalId?: string;
  canonicalName?: string;
  resolutionConfidence: number;
  resolutionStrategy: string;
  matchMode?: HistoricalCounterpartyMatchMode;
  revisions: HistoricalRevisionContextRecord[];
}

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
  userId: string,
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

    const result = await performAISplitDetection(pages, tenantId, userId, mergedConfig);

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

    const shouldUseMistral =
      mergedConfig.provider === 'mistral' || mergedConfig.model === MISTRAL_OCR_MODEL_ID;
    const explicitModel =
      mergedConfig.model && mergedConfig.model !== MISTRAL_OCR_MODEL_ID
        ? mergedConfig.model
        : undefined;
    const batchModelId = explicitModel
      ? explicitModel
      : shouldUseMistral
        ? null
        : await getBestAvailableModelForWorkspace(tenantId);
    const batchModelProvider = batchModelId && AI_MODELS[batchModelId as AIModel]
      ? getModelConfig(batchModelId as AIModel).provider
      : null;

    const learnedHistoricalContext = await buildHistoricalCounterpartyLearningContext({
      processingDocumentId,
      pages,
      tenantId,
      companyId,
      userId,
      modelId: batchModelId as AIModel | null,
      forceMistral: shouldUseMistral,
    });

    const promptSettings = await getDocumentExtractionPromptSettings(tenantId);

    // Generate input fingerprint for reproducibility using the effective prompt context.
    const inputFingerprint = generateInputFingerprint(
      pages.map((p) => p.id),
      mergedConfig
    );

    if (mergedConfig.batchMode && shouldUseMistral) {
      const firstPage = pages[0];
      if (!firstPage?.storageKey) {
        throw new Error('No pages to extract from or missing storage key');
      }

      const fileBuffer = await storage.download(firstPage.storageKey);
      const mimeType = getDocumentMimeTypeFromStorageKey(firstPage.storageKey);
      const prompt = await buildBatchExtractionPrompt(
        tenantId,
        companyId,
        mergedConfig.additionalContext,
        learnedHistoricalContext,
        promptSettings.promptTemplate
      );
      const batchJob = await submitMistralOCRBatchJob({
        customId: processingDocumentId,
        document: {
          base64: fileBuffer.toString('base64'),
          mimeType,
        },
        prompt,
        tenantId,
        userId,
        operation: 'document_field_extraction_batch',
        usageMetadata: {
          companyId,
          processingDocumentId,
          processingDocumentPageCount: pages.length,
        },
        schemaName: 'processing_document_extraction',
        jsonSchema: MISTRAL_DOCUMENT_EXTRACTION_JSON_SCHEMA,
        metadata: {
          processingDocumentId,
          companyId,
        },
      });

      await transitionPipelineStatus(processingDocumentId, 'QUEUED', tenantId, companyId, {
        reason: 'Queued for Mistral batch extraction',
        actorUserId: userId,
      });

      await saveCheckpoint(processingDocumentId, 'FIELD_EXTRACTION', 'STARTED', {
        mode: 'mistral_batch',
        batchJobId: batchJob.jobId,
        prompt,
        promptVersion: mergedConfig.promptVersion,
        schemaVersion: mergedConfig.schemaVersion,
        inputFingerprint,
        additionalContext: mergedConfig.additionalContext,
        submittedAt: new Date().toISOString(),
      } satisfies PendingMistralBatchState);

      return {
        success: true,
        extractionId: '',
      };
    }

    if (mergedConfig.batchMode && batchModelId && batchModelProvider === 'openai') {
      const firstPage = pages[0];
      if (!firstPage?.storageKey) {
        throw new Error('No pages to extract from or missing storage key');
      }

      const fileBuffer = await storage.download(firstPage.storageKey);
      const mimeType = getDocumentMimeTypeFromStorageKey(firstPage.storageKey);
      const prompt = await buildBatchExtractionPrompt(
        tenantId,
        companyId,
        mergedConfig.additionalContext,
        learnedHistoricalContext,
        promptSettings.promptTemplate
      );
      const batchJob = await submitOpenAIBatchJob({
        customId: processingDocumentId,
        tenantId,
        model: batchModelId as AIModel,
        userPrompt: prompt,
        images: [{
          base64: fileBuffer.toString('base64'),
          mimeType,
        }],
        jsonMode: true,
        metadata: {
          processingDocumentId,
          companyId,
        },
      });

      await transitionPipelineStatus(processingDocumentId, 'QUEUED', tenantId, companyId, {
        reason: `Queued for OpenAI batch extraction (${batchModelId})`,
        actorUserId: userId,
      });

      await saveCheckpoint(processingDocumentId, 'FIELD_EXTRACTION', 'STARTED', {
        mode: 'openai_batch',
        batchJobId: batchJob.jobId,
        inputFileId: batchJob.inputFileId,
        modelId: batchModelId as AIModel,
        prompt,
        promptVersion: mergedConfig.promptVersion,
        schemaVersion: mergedConfig.schemaVersion,
        inputFingerprint,
        additionalContext: mergedConfig.additionalContext,
        submittedAt: new Date().toISOString(),
      } satisfies PendingOpenAIBatchState);

      return {
        success: true,
        extractionId: '',
      };
    }

    // Perform AI extraction (falls back to simulation if AI unavailable)
    const { result: extractionResult, modelUsed, providerUsed } = await performAIExtraction(
      pages,
      tenantId,
      companyId,
      userId,
      mergedConfig,
      learnedHistoricalContext,
      promptSettings.promptTemplate
    );

    const latencyMs = Date.now() - startTime;
    const completed = await persistCompletedExtraction({
      processingDocumentId,
      tenantId,
      companyId,
      userId,
      extractionResult,
      modelUsed,
      providerUsed,
      promptVersion: mergedConfig.promptVersion,
      schemaVersion: mergedConfig.schemaVersion,
      inputFingerprint,
      latencyMs,
    });

    return {
      success: true,
      extractionId: completed.extractionId,
      revisionId: completed.revisionId,
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

export async function reconcilePendingMistralBatchExtraction(
  processingDocumentId: string,
  tenantId: string,
  companyId: string,
  userId: string
): Promise<{
  status: 'QUEUED' | 'RUNNING' | 'CANCELLATION_REQUESTED' | 'SUCCESS' | 'FAILED' | 'TIMEOUT_EXCEEDED' | 'CANCELLED' | 'NOT_PENDING';
  extractionId?: string;
  revisionId?: string;
  errorMessage?: string;
}> {
  const checkpoint = await prisma.processingCheckpoint.findUnique({
    where: {
      processingDocumentId_step: {
        processingDocumentId,
        step: 'FIELD_EXTRACTION',
      },
    },
  });

  const state = checkpoint?.stateJson as PendingMistralBatchState | null;
  if (!checkpoint || !state || state.mode !== 'mistral_batch') {
    return { status: 'NOT_PENDING' };
  }

  if (checkpoint.status === 'COMPLETED') {
    return {
      status: 'SUCCESS',
      extractionId: state.extractionId,
      revisionId: state.revisionId,
    };
  }

  if (checkpoint.status === 'FAILED') {
    return {
      status: state.failedStatus ?? 'FAILED',
      errorMessage: state.errorMessage,
    };
  }

  const inspected = await inspectMistralOCRBatchJob<Record<string, unknown>>(state.batchJobId, {
    prompt: state.prompt,
    tenantId,
    operation: 'document_field_extraction_batch',
    // Safe to log here now that completed/failed checkpoints short-circuit earlier.
    logAIDebug: true,
    usageMetadata: {
      companyId,
      processingDocumentId,
    },
  });

  if (inspected.status === 'QUEUED' || inspected.status === 'RUNNING' || inspected.status === 'CANCELLATION_REQUESTED') {
    return { status: inspected.status };
  }

  if (
    inspected.status === 'FAILED' ||
    inspected.status === 'TIMEOUT_EXCEEDED' ||
    inspected.status === 'CANCELLED'
  ) {
    const isRetryable = inspected.status !== 'CANCELLED';
    await recordProcessingAttempt(
      processingDocumentId,
      'FIELD_EXTRACTION',
      isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
      {
        errorCode: 'EXTRACTION_FAILED',
        errorMessage: inspected.errorMessage,
        providerRequestId: state.batchJobId,
      }
    );
    await transitionPipelineStatus(
      processingDocumentId,
      isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
      tenantId,
      companyId,
      { error: { code: 'EXTRACTION_FAILED', message: inspected.errorMessage } }
    );
    await saveCheckpoint(processingDocumentId, 'FIELD_EXTRACTION', 'FAILED', {
      ...state,
      failedAt: new Date().toISOString(),
      failedStatus: inspected.status,
      errorMessage: inspected.errorMessage,
    });

    return {
      status: inspected.status,
      errorMessage: inspected.errorMessage,
    };
  }

  if (inspected.status !== 'SUCCESS') {
    return { status: inspected.status };
  }

  const pages = await prisma.documentPage.findMany({
    where: { processingDocumentId },
    orderBy: { pageNumber: 'asc' },
    select: {
      pageNumber: true,
      storageKey: true,
      imageFingerprint: true,
      id: true,
    },
  });
  let extractionResult = mapAIResponseToResult(
    inspected.result.documentAnnotation as Record<string, unknown>,
    pages
  );
  const firstPage = pages[0];
  const extractionMimeType = firstPage?.storageKey
    ? getDocumentMimeTypeFromStorageKey(firstPage.storageKey)
    : 'image/png';

  if (firstPage?.storageKey && shouldUseChunkedMistralLineItemFallback(extractionResult, pages, extractionMimeType)) {
    const extractionDocumentBuffer = await storage.download(firstPage.storageKey);
    extractionResult = await applyChunkedMistralLineItemFallback({
      result: extractionResult,
      pages,
      documentBuffer: extractionDocumentBuffer,
      mimeType: extractionMimeType,
      tenantId,
      companyId,
      userId,
      additionalContext: state.additionalContext,
    });
  }
  const completed = await persistCompletedExtraction({
    processingDocumentId,
    tenantId,
    companyId,
    userId,
    extractionResult,
    modelUsed: inspected.result.model,
    providerUsed: inspected.result.provider,
    promptVersion: state.promptVersion,
    schemaVersion: state.schemaVersion,
    inputFingerprint: state.inputFingerprint,
    latencyMs: 0,
  });
  await saveCheckpoint(processingDocumentId, 'FIELD_EXTRACTION', 'COMPLETED', {
    ...state,
    completedAt: new Date().toISOString(),
    extractionId: completed.extractionId,
    revisionId: completed.revisionId,
  });

  return {
    status: 'SUCCESS',
    extractionId: completed.extractionId,
    revisionId: completed.revisionId,
  };
}

export async function reconcilePendingOpenAIBatchExtraction(
  processingDocumentId: string,
  tenantId: string,
  companyId: string,
  userId: string
): Promise<{
  status:
    | 'validating'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelling'
    | 'cancelled'
    | 'NOT_PENDING';
  extractionId?: string;
  revisionId?: string;
  errorMessage?: string;
}> {
  const checkpoint = await prisma.processingCheckpoint.findUnique({
    where: {
      processingDocumentId_step: {
        processingDocumentId,
        step: 'FIELD_EXTRACTION',
      },
    },
  });

  const state = checkpoint?.stateJson as PendingOpenAIBatchState | null;
  if (!checkpoint || !state || state.mode !== 'openai_batch') {
    return { status: 'NOT_PENDING' };
  }

  if (checkpoint.status === 'COMPLETED') {
    return {
      status: 'completed',
      extractionId: state.extractionId,
      revisionId: state.revisionId,
    };
  }

  if (checkpoint.status === 'FAILED') {
    return {
      status: state.failedStatus ?? 'failed',
      errorMessage: state.errorMessage,
    };
  }

  const inspected = await inspectOpenAIBatchJob(state.batchJobId, {
    tenantId,
    model: state.modelId,
    userPrompt: state.prompt,
    userId,
    operation: 'document_field_extraction_batch',
    usageMetadata: {
      companyId,
      processingDocumentId,
    },
  });

  if (
    inspected.status === 'validating' ||
    inspected.status === 'in_progress' ||
    inspected.status === 'finalizing' ||
    inspected.status === 'cancelling'
  ) {
    return { status: inspected.status };
  }

  if (
    inspected.status === 'failed' ||
    inspected.status === 'expired' ||
    inspected.status === 'cancelled'
  ) {
    const isRetryable = inspected.status !== 'cancelled';
    await recordProcessingAttempt(
      processingDocumentId,
      'FIELD_EXTRACTION',
      isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
      {
        errorCode: 'EXTRACTION_FAILED',
        errorMessage: inspected.errorMessage,
        providerRequestId: state.batchJobId,
      }
    );
    await transitionPipelineStatus(
      processingDocumentId,
      isRetryable ? 'FAILED_RETRYABLE' : 'FAILED_PERMANENT',
      tenantId,
      companyId,
      { error: { code: 'EXTRACTION_FAILED', message: inspected.errorMessage } }
    );
    await saveCheckpoint(processingDocumentId, 'FIELD_EXTRACTION', 'FAILED', {
      ...state,
      failedAt: new Date().toISOString(),
      failedStatus: inspected.status,
      errorMessage: inspected.errorMessage,
    });

    return {
      status: inspected.status,
      errorMessage: inspected.errorMessage,
    };
  }

  if (inspected.status !== 'completed') {
    return { status: inspected.status };
  }

  const pages = await prisma.documentPage.findMany({
    where: { processingDocumentId },
    orderBy: { pageNumber: 'asc' },
    select: {
      pageNumber: true,
      storageKey: true,
      imageFingerprint: true,
      id: true,
    },
  });

  const cleanedContent = stripMarkdownCodeBlocks(inspected.result.content);
  const parsed = JSON.parse(cleanedContent) as Record<string, unknown>;
  const extractionResult = mapAIResponseToResult(parsed, pages);

  const completed = await persistCompletedExtraction({
    processingDocumentId,
    tenantId,
    companyId,
    userId,
    extractionResult,
    modelUsed: inspected.result.model,
    providerUsed: inspected.result.provider,
    promptVersion: state.promptVersion,
    schemaVersion: state.schemaVersion,
    inputFingerprint: state.inputFingerprint,
    latencyMs: 0,
  });

  await saveCheckpoint(processingDocumentId, 'FIELD_EXTRACTION', 'COMPLETED', {
    ...state,
    completedAt: new Date().toISOString(),
    extractionId: completed.extractionId,
    revisionId: completed.revisionId,
  });

  return {
    status: 'completed',
    extractionId: completed.extractionId,
    revisionId: completed.revisionId,
  };
}

export async function reconcilePendingBatchExtraction(
  processingDocumentId: string,
  tenantId: string,
  companyId: string,
  userId: string
): Promise<
  | Awaited<ReturnType<typeof reconcilePendingMistralBatchExtraction>>
  | Awaited<ReturnType<typeof reconcilePendingOpenAIBatchExtraction>>
> {
  const checkpoint = await prisma.processingCheckpoint.findUnique({
    where: {
      processingDocumentId_step: {
        processingDocumentId,
        step: 'FIELD_EXTRACTION',
      },
    },
    select: {
      stateJson: true,
    },
  });

  const state = checkpoint?.stateJson as PendingBatchExtractionState | null;
  if (!state?.mode) {
    return { status: 'NOT_PENDING' };
  }

  if (state.mode === 'openai_batch') {
    return reconcilePendingOpenAIBatchExtraction(
      processingDocumentId,
      tenantId,
      companyId,
      userId
    );
  }

  return reconcilePendingMistralBatchExtraction(
    processingDocumentId,
    tenantId,
    companyId,
    userId
  );
}

interface AIExtractionResult {
  result: FieldExtractionResult;
  modelUsed: string;
  providerUsed: string;
}

interface PendingMistralBatchState {
  mode: 'mistral_batch';
  batchJobId: string;
  prompt: string;
  promptVersion: string;
  schemaVersion: string;
  inputFingerprint: string;
  additionalContext?: string;
  submittedAt: string;
  completedAt?: string;
  extractionId?: string;
  revisionId?: string;
  failedAt?: string;
  failedStatus?: 'FAILED' | 'TIMEOUT_EXCEEDED' | 'CANCELLED';
  errorMessage?: string;
}

interface PendingOpenAIBatchState {
  mode: 'openai_batch';
  batchJobId: string;
  inputFileId: string;
  modelId: AIModel;
  prompt: string;
  promptVersion: string;
  schemaVersion: string;
  inputFingerprint: string;
  additionalContext?: string;
  submittedAt: string;
  completedAt?: string;
  extractionId?: string;
  revisionId?: string;
  failedAt?: string;
  failedStatus?: 'failed' | 'expired' | 'cancelled';
  errorMessage?: string;
}

type PendingBatchExtractionState = PendingMistralBatchState | PendingOpenAIBatchState;

async function persistCompletedExtraction(params: {
  processingDocumentId: string;
  tenantId: string;
  companyId: string;
  userId: string;
  extractionResult: FieldExtractionResult;
  modelUsed: string;
  providerUsed: string;
  promptVersion: string;
  schemaVersion: string;
  inputFingerprint: string;
  latencyMs: number;
}): Promise<{ extractionId: string; revisionId: string }> {
  const {
    processingDocumentId,
    tenantId,
    companyId,
    userId,
    extractionResult,
    modelUsed,
    providerUsed,
    promptVersion,
    schemaVersion,
    inputFingerprint,
    latencyMs,
  } = params;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { homeCurrency: true },
  });
  const companyHomeCurrency = company?.homeCurrency || 'SGD';
  const normalizedExtractionResult = normalizeHeaderAmountsFromLineItems(extractionResult);

  const evidenceJson = buildEvidenceJson(normalizedExtractionResult);

  const extraction = await prisma.documentExtraction.create({
    data: {
      processingDocumentId,
      extractionType: 'FIELDS',
      provider: providerUsed,
      model: modelUsed,
      promptVersion,
      extractionSchemaVersion: schemaVersion,
      inputFingerprint,
      rawJson: extractionResult as unknown as Prisma.InputJsonValue,
      confidenceJson: buildConfidenceJson(normalizedExtractionResult),
      evidenceJson: evidenceJson as Prisma.InputJsonValue,
      overallConfidence: normalizedExtractionResult.overallConfidence,
      latencyMs,
    },
  });

  const hce = normalizedExtractionResult.homeCurrencyEquivalent;
  const homeCurrency = companyHomeCurrency;
  const documentCurrency = normalizedExtractionResult.currency.value;
  const isSameCurrency = documentCurrency === homeCurrency;

  let exchangeRate: string;
  let exchangeRateSource: ExchangeRateSource = 'PROVIDER_DEFAULT';

  const hceExchangeRateValid = hce?.exchangeRate && hce?.currency === companyHomeCurrency;

  if (hceExchangeRateValid) {
    exchangeRate = hce.exchangeRate;
    exchangeRateSource = 'DOCUMENT';
  } else if (isSameCurrency) {
    // Legitimate rate=1 (document currency == home currency); no fallback.
    exchangeRate = '1';
    exchangeRateSource = 'PROVIDER_DEFAULT';
  } else {
    const lookupDate = resolveLookupDate(normalizedExtractionResult.documentDate?.value);
    const documentDate = lookupDate.date;
    const documentDateIso = lookupDate.isoDate;

    // Correlation context shared by every log emitted from this block so an
    // operator can alert on `event: 'fx_rate_fallback'` and immediately see
    // which tenant/document/currency was affected. Critical for detecting
    // systemic FX-sync outages — behavior still falls back to rate=1 so the
    // pipeline does not stall, but the degradation is no longer silent.
    const fxLogContext = {
      event: 'fx_rate_fallback' as const,
      tenantId,
      processingDocumentId,
      documentCurrency,
      homeCurrency: companyHomeCurrency,
      documentDate: documentDateIso,
      documentDateFallback: lookupDate.usedFallback,
    };

    if (lookupDate.usedFallback) {
      log.warn(
        `Invalid extraction document date "${lookupDate.rawValue ?? ''}" for ${processingDocumentId}; using ${documentDateIso} for FX lookup`,
        { ...fxLogContext, reason: 'invalid_document_date' }
      );
    }

    try {
      const rateResult = await getRateWithPreference(
        documentCurrency as SupportedCurrency,
        companyHomeCurrency as SupportedCurrency,
        documentDate,
        tenantId
      );

      if (rateResult) {
        exchangeRate = rateResult.rate.toString();
        if (rateResult.rateType === 'MAS_DAILY_RATE') {
          exchangeRateSource = 'MAS_DAILY';
        } else if (rateResult.rateType === 'MAS_MONTHLY_RATE') {
          exchangeRateSource = 'IRAS_MONTHLY_AVG';
        } else if (rateResult.rateType === 'MANUAL_RATE') {
          exchangeRateSource = 'MANUAL';
        } else {
          exchangeRateSource = 'PROVIDER_DEFAULT';
        }
        log.info(
          `Exchange rate resolved for ${documentCurrency} on ${documentDateIso}: ${exchangeRate} (source: ${exchangeRateSource})`
        );
      } else {
        exchangeRate = '1';
        exchangeRateSource = 'PROVIDER_DEFAULT';
        log.warn(
          `FX fallback: no rate found for ${documentCurrency} on ${documentDateIso}, coerced to 1`,
          { ...fxLogContext, reason: 'rate_not_found' }
        );
      }
    } catch (rateError) {
      exchangeRate = '1';
      exchangeRateSource = 'PROVIDER_DEFAULT';
      log.error(
        `FX fallback: lookup threw for ${documentCurrency} on ${documentDateIso}, coerced to 1`,
        {
          ...fxLogContext,
          reason: 'lookup_threw',
          errorMessage: rateError instanceof Error ? rateError.message : String(rateError),
        }
      );
    }
  }
  const exchangeRateNum = parseFloat(exchangeRate);

  const hceMatchesHomeCurrency = hce?.currency === companyHomeCurrency;
  const useExtractedHce = hceMatchesHomeCurrency && hce;

  const lineItemInputs = normalizedExtractionResult.lineItems?.map((item) => {
    const amount = parseFloat(item.amount.value) || 0;
    const gstAmount = item.gstAmount?.value ? parseFloat(item.gstAmount.value) : 0;

    return {
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
      homeAmount: (amount * exchangeRateNum).toFixed(2),
      homeGstAmount: (gstAmount * exchangeRateNum).toFixed(2),
    };
  }) as LineItemInput[] | undefined;

  const homeSubtotalFromLines = lineItemInputs?.reduce(
    (sum, item) => sum + (parseFloat(String(item.homeAmount)) || 0),
    0
  );
  const homeTaxFromLines = lineItemInputs?.reduce(
    (sum, item) => sum + (parseFloat(String(item.homeGstAmount)) || 0),
    0
  );
  const homeTotalFromLines =
    homeSubtotalFromLines !== undefined && homeTaxFromLines !== undefined
      ? homeSubtotalFromLines + homeTaxFromLines
      : undefined;

  const homeSubtotal = homeSubtotalFromLines !== undefined
    ? homeSubtotalFromLines.toFixed(2)
    : (useExtractedHce && hce?.subtotal) ||
      (normalizedExtractionResult.subtotal?.value
        ? (parseFloat(normalizedExtractionResult.subtotal.value) * exchangeRateNum).toFixed(2)
        : undefined);
  const homeTaxAmount = homeTaxFromLines !== undefined
    ? homeTaxFromLines.toFixed(2)
    : (useExtractedHce && hce?.taxAmount) ||
      (normalizedExtractionResult.taxAmount?.value
        ? (parseFloat(normalizedExtractionResult.taxAmount.value) * exchangeRateNum).toFixed(2)
        : undefined);
  const homeEquivalent = homeTotalFromLines !== undefined
    ? homeTotalFromLines.toFixed(2)
    : (useExtractedHce && hce?.totalAmount) ||
      (parseFloat(normalizedExtractionResult.totalAmount.value) * exchangeRateNum).toFixed(2);

  const isReceivable = normalizedExtractionResult.documentCategory.value === 'ACCOUNTS_RECEIVABLE';
  const rawCounterpartyName = isReceivable
    ? normalizedExtractionResult.customerName?.value ?? normalizedExtractionResult.vendorName?.value
    : normalizedExtractionResult.vendorName?.value;

  const revision = await createRevision({
    processingDocumentId,
    revisionType: 'EXTRACTION',
    extractionId: extraction.id,
    createdById: userId,
    documentCategory: normalizedExtractionResult.documentCategory.value,
    documentSubCategory: normalizedExtractionResult.documentSubCategory?.value,
    vendorName: rawCounterpartyName,
    customerName: isReceivable ? rawCounterpartyName : undefined,
    counterpartyIdentity: normalizedExtractionResult.counterpartyIdentity,
    documentNumber: normalizedExtractionResult.documentNumber?.value,
    documentDate: normalizedExtractionResult.documentDate?.value
      ? new Date(normalizedExtractionResult.documentDate.value)
      : undefined,
    dueDate: normalizedExtractionResult.dueDate?.value
      ? new Date(normalizedExtractionResult.dueDate.value)
      : normalizedExtractionResult.documentDate?.value
        ? new Date(normalizedExtractionResult.documentDate.value)
        : undefined,
    currency: normalizedExtractionResult.currency.value,
    subtotal: normalizedExtractionResult.subtotal?.value,
    taxAmount: normalizedExtractionResult.taxAmount?.value,
    totalAmount: normalizedExtractionResult.totalAmount.value,
    supplierGstNo: normalizedExtractionResult.supplierGstNo?.value,
    homeCurrency,
    homeExchangeRate: exchangeRate,
    homeExchangeRateSource: exchangeRateSource,
    homeSubtotal,
    homeTaxAmount,
    homeEquivalent,
    headerEvidenceJson: evidenceJson,
    items: lineItemInputs,
    reason: 'initial_extraction',
  });

  await prisma.processingDocument.update({
    where: { id: processingDocumentId },
    data: {
      currentRevisionId: revision.id,
      lockVersion: { increment: 1 },
    },
  });

  await transitionPipelineStatus(processingDocumentId, 'EXTRACTION_DONE', tenantId, companyId);

  await recordProcessingAttempt(processingDocumentId, 'FIELD_EXTRACTION', 'SUCCEEDED', {
    providerLatencyMs: latencyMs,
  });

  try {
    const duplicateResult = await checkForDuplicates(processingDocumentId, tenantId, companyId);
    if (duplicateResult.hasPotentialDuplicate) {
      await updateDuplicateStatus(processingDocumentId, duplicateResult);
      log.info(
        `Post-extraction duplicate check found ${duplicateResult.candidates.length} candidates ` +
          `for ${processingDocumentId}`
      );
    }
  } catch (dupError) {
    log.warn(`Post-extraction duplicate check failed for ${processingDocumentId}:`, dupError);
  }

  log.info(`Field extraction completed for ${processingDocumentId}, revision ${revision.id} created`);

  return {
    extractionId: extraction.id,
    revisionId: revision.id,
  };
}

/**
 * Get Chart of Accounts context for AI extraction.
 * Returns accounts in the 4xxx-8xxx range (Revenue, COGS, Expenses)
 * formatted as a string for the AI prompt.
 */
async function getCOAContextForExtraction(
  tenantId: string,
  companyId?: string | null
): Promise<string> {
  try {
    // Fetch accounts for the tenant (includes system accounts)
    const accounts = await getAccountsForSelect(tenantId, companyId);

    // Filter to relevant ranges: 4xxx (Revenue), 5xxx (COGS), 6xxx-8xxx (Expenses)
    const relevantAccounts = accounts.filter((acc) => {
      const code = acc.code;
      return code >= '4000' && code <= '8999';
    });

    if (relevantAccounts.length === 0) {
      return '';
    }

    // Format as structured list for AI
    const accountList = relevantAccounts
      .map((acc) => `- ${acc.code}: ${acc.name} (${acc.accountType})`)
      .join('\n');

    return `## Available Chart of Accounts (for accountCode assignment)
IMPORTANT: You SHOULD attempt to assign an accountCode to every line item based on the description.
Even if uncertain, make your best guess - the user can correct it later.

${accountList}

Guidelines for account selection:
- 4xxx: Revenue accounts (use for sales, service income, other income)
- 5xxx: Cost of goods sold (use for direct costs, purchases, manufacturing)
- 6xxx-7xxx: Operating expenses (use for admin, marketing, utilities, rent, professional fees, software, subscriptions, cloud services, etc.)
- 8xxx: Tax expenses (use for income tax, deferred tax)

Common mappings for vendor invoices (Accounts Payable):
- Software/SaaS subscriptions (e.g., Wix, Adobe, Microsoft) â†’ 6xxx (IT/Software expenses)
- Professional services (legal, accounting, consulting) â†’ 6xxx (Professional fees)
- Office supplies, utilities â†’ 6xxx (Administrative expenses)
- Inventory purchases â†’ 5xxx (Cost of goods sold)
- Advertising, marketing â†’ 6xxx (Marketing expenses)

Set lower confidence (0.5-0.7) if the account mapping is a best guess rather than obvious.`;
  } catch (error) {
    log.warn('Failed to fetch COA context for extraction:', error);
    return '';
  }
}

async function getCounterpartyHintCompanyContext(
  companyId: string
): Promise<CounterpartyHintCompanyContext | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      uen: true,
      formerName: true,
      formerNames: {
        select: {
          formerName: true,
        },
        orderBy: {
          effectiveFrom: 'desc',
        },
        take: 5,
      },
    },
  });

  if (!company) {
    return null;
  }

  const formerNames = Array.from(
    new Set(
      [
        company.formerName,
        ...company.formerNames.map((item) => item.formerName),
      ]
        .map((name) => sanitizeCounterpartyName(name))
        .filter((name): name is string => Boolean(name))
    )
  );

  return {
    name: company.name,
    uen: company.uen,
    formerName: company.formerName,
    formerNames,
  };
}

function buildLightweightCounterpartyPrompt(
  companyContext?: CounterpartyHintCompanyContext | null
): string {
  const parts = [
    'Extract only the counterparty names from the first page of this business document.',
    'Return JSON with exactly 2 keys: vendorName and customerName.',
    'Return AT MOST ONE non-null field whenever possible.',
    'vendorName = the external supplier, seller, issuer, charging party, or service provider organization shown on the document.',
    'customerName = the buyer, bill-to, ship-to, applicant, account holder, or customer organization shown on the document.',
    'Prefer the corporate or legal entity name over any contact person name.',
    'If the same organization appears in abbreviated and expanded form, prefer the expanded legal or corporate name shown on the document.',
    'Only return the actual accounting counterparty. Ignore product names, plans, packages, subscriptions, service modules, business-profile subjects, searched entities, regulated entities, and reference companies unless they are clearly the buyer or seller on the document.',
    'If another company is mentioned only as the company profile purchased, searched company, subject company, or service target, do not return it as customerName.',
    'Use null when a field is not clearly visible.',
    'Do not infer, explain, or add extra keys.',
  ];

  if (companyContext) {
    parts.push('');
    parts.push('Current processing company context:');
    parts.push(`- Official company name: ${companyContext.name}`);
    parts.push(`- UEN: ${companyContext.uen}`);
    if (companyContext.formerNames.length > 0) {
      parts.push(`- Known former names: ${companyContext.formerNames.join(' | ')}`);
    }
    parts.push('Use this context to disambiguate roles on the document:');
    parts.push('- If a visible organization matches the current company context, treat that as the in-scope company mention.');
    parts.push('- Do not mistake the in-scope company for the external issuer/supplier unless the document clearly shows the in-scope company is the seller or issuer.');
    parts.push('- If the in-scope company appears only as a searched entity, subject company, business-profile target, service target, regulated entity, or reference company, do not return it as customerName.');
    parts.push('- For vendor invoices and receipts issued to the in-scope company, prefer vendorName only.');
    parts.push('- For sales invoices issued by the in-scope company to an external customer, prefer customerName only.');
  }

  return parts.join('\n');
}

function sanitizeCounterpartyName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function alignNameToCompanyContext(
  value: string | null | undefined,
  companyContext?: CounterpartyHintCompanyContext | null
): string | null {
  const sanitizedValue = sanitizeCounterpartyName(value);
  if (!sanitizedValue || !companyContext) {
    return sanitizedValue;
  }

  const normalizedValue = normalizeVendorName(sanitizedValue);
  if (!normalizedValue) {
    return sanitizedValue;
  }

  const knownCompanyNames = [companyContext.name, ...companyContext.formerNames];
  const matchesCompany = knownCompanyNames.some((name) => normalizeVendorName(name) === normalizedValue);

  return matchesCompany ? companyContext.name : sanitizedValue;
}

function nameMatchesCompanyContext(
  value: string | null | undefined,
  companyContext?: CounterpartyHintCompanyContext | null
): boolean {
  const sanitizedValue = sanitizeCounterpartyName(value);
  if (!sanitizedValue || !companyContext) {
    return false;
  }

  const normalizedValue = normalizeVendorName(sanitizedValue);
  if (!normalizedValue) {
    return false;
  }

  return [companyContext.name, ...companyContext.formerNames].some(
    (name) => normalizeVendorName(name) === normalizedValue
  );
}

function normalizeLightweightCounterpartyResult(
  result: LightweightCounterpartyPassResult,
  companyContext?: CounterpartyHintCompanyContext | null
): LightweightCounterpartyPassResult {
  let vendorName = alignNameToCompanyContext(result.vendorName, companyContext);
  let customerName = alignNameToCompanyContext(result.customerName, companyContext);

  const vendorMatchesCompany = nameMatchesCompanyContext(vendorName, companyContext);
  const customerMatchesCompany = nameMatchesCompanyContext(customerName, companyContext);

  // Keep only the external accounting counterparty when both sides are returned.
  if (vendorName && customerName) {
    if (!vendorMatchesCompany && customerMatchesCompany) {
      customerName = null;
    } else if (vendorMatchesCompany && !customerMatchesCompany) {
      vendorName = null;
    } else if (vendorMatchesCompany && customerMatchesCompany) {
      customerName = null;
    }
  }

  return {
    vendorName,
    customerName,
  };
}

async function buildLightweightCounterpartyDocumentInput(
  documentBuffer: Buffer,
  mimeType: string
): Promise<{ base64: string; mimeType: string }> {
  if (mimeType !== 'application/pdf') {
    return {
      base64: documentBuffer.toString('base64'),
      mimeType,
    };
  }

  try {
    const sourcePdf = await PDFDocument.load(documentBuffer, { ignoreEncryption: true });
    if (sourcePdf.getPageCount() <= 1) {
      return {
        base64: documentBuffer.toString('base64'),
        mimeType: 'application/pdf',
      };
    }

    const singlePagePdf = await PDFDocument.create();
    const copiedPages = await singlePagePdf.copyPages(sourcePdf, [0]);
    singlePagePdf.addPage(copiedPages[0]);
    const singlePageBytes = await singlePagePdf.save();

    return {
      base64: Buffer.from(singlePageBytes).toString('base64'),
      mimeType: 'application/pdf',
    };
  } catch (error) {
    log.warn('Failed to reduce PDF to first page for lightweight counterparty pass', error);
    return {
      base64: documentBuffer.toString('base64'),
      mimeType: 'application/pdf',
    };
  }
}

async function runLightweightCounterpartyPass(params: {
  pages: Array<{ pageNumber: number; storageKey: string | null; imageFingerprint: string | null }>;
  tenantId: string;
  companyId: string;
  userId: string;
  modelId: AIModel | string | null;
  forceMistral: boolean;
}): Promise<LightweightCounterpartyPassResult | null> {
  const { pages, tenantId, companyId, userId, modelId, forceMistral } = params;
  const firstPage = pages[0];
  if (!firstPage?.storageKey) {
    return null;
  }

  const documentBuffer = await storage.download(firstPage.storageKey);
  const mimeType = getDocumentMimeTypeFromStorageKey(firstPage.storageKey);
  const document = await buildLightweightCounterpartyDocumentInput(documentBuffer, mimeType);
  const companyContext = await getCounterpartyHintCompanyContext(companyId);
  const prompt = buildLightweightCounterpartyPrompt(companyContext);

  if (forceMistral) {
    const response = await extractStructuredWithMistralOCR<LightweightCounterpartyPassResult>({
      document,
      prompt,
      tenantId,
      userId,
      operation: 'document_counterparty_hint',
      usageMetadata: {
        companyId,
        processingDocumentPageCount: 1,
        lightweightPass: true,
      },
      schemaName: 'processing_document_counterparty_hint',
      jsonSchema: LIGHTWEIGHT_COUNTERPARTY_JSON_SCHEMA,
    });

    return normalizeLightweightCounterpartyResult({
      vendorName: response.documentAnnotation?.vendorName ?? null,
      customerName: response.documentAnnotation?.customerName ?? null,
    }, companyContext);
  }

  if (!modelId) {
    return null;
  }

  const documentInputMode = await getDocumentInputModeForModel(tenantId, modelId);
  const connectorDocument =
    document.mimeType === 'application/pdf' && documentInputMode === 'image'
      ? await prepareImageUrlVisionInput(Buffer.from(document.base64, 'base64'), document.mimeType)
      : document;

  const response = await callAIWithConnector({
    model: modelId,
    tenantId,
    userId,
    userPrompt: prompt,
    jsonMode: true,
    images: [connectorDocument],
    operation: 'document_counterparty_hint',
    temperature: 0,
    maxTokens: LIGHTWEIGHT_COUNTERPARTY_MAX_OUTPUT_TOKENS,
    usageMetadata: {
      companyId,
      processingDocumentPageCount: 1,
      lightweightPass: true,
    },
  });

  const parsed = JSON.parse(
    stripMarkdownCodeBlocks(response.content)
  ) as Partial<LightweightCounterpartyPassResult>;

  return normalizeLightweightCounterpartyResult({
    vendorName: parsed.vendorName ?? null,
    customerName: parsed.customerName ?? null,
  }, companyContext);
}

async function buildHistoricalCounterpartyLearningContext(params: {
  processingDocumentId: string;
  pages: Array<{ pageNumber: number; storageKey: string | null; imageFingerprint: string | null }>;
  tenantId: string;
  companyId: string;
  userId: string;
  modelId: AIModel | string | null;
  forceMistral: boolean;
}): Promise<string | undefined> {
  try {
    const lightweightPass = await runLightweightCounterpartyPass(params);
    if (!lightweightPass?.vendorName && !lightweightPass?.customerName) {
      return undefined;
    }

    const candidatePromises: Array<Promise<CounterpartyLearningCandidate | null>> = [];
    if (lightweightPass.vendorName) {
      candidatePromises.push(
        buildCounterpartyLearningCandidate({
          processingDocumentId: params.processingDocumentId,
          tenantId: params.tenantId,
          companyId: params.companyId,
          userId: params.userId,
          side: 'vendor',
          rawName: lightweightPass.vendorName,
        })
      );
    }
    if (lightweightPass.customerName) {
      candidatePromises.push(
        buildCounterpartyLearningCandidate({
          processingDocumentId: params.processingDocumentId,
          tenantId: params.tenantId,
          companyId: params.companyId,
          userId: params.userId,
          side: 'customer',
          rawName: lightweightPass.customerName,
        })
      );
    }

    const candidates = (await Promise.all(candidatePromises))
      .filter((candidate): candidate is CounterpartyLearningCandidate => Boolean(candidate))
      .filter((candidate) => candidate.revisions.length > 0);

    if (candidates.length === 0) {
      return undefined;
    }

    candidates.sort((a, b) => scoreCounterpartyLearningCandidate(b) - scoreCounterpartyLearningCandidate(a));
    const selectedCandidate = candidates[0];
    const context = formatHistoricalLearningContext(selectedCandidate);

    if (context) {
      log.info(
        `Added learned extraction context from ${selectedCandidate.revisions.length} recent ${selectedCandidate.side} records`
      );
    }

    return context;
  } catch (error) {
    log.warn('Lightweight counterparty pass failed; continuing without learned extraction context', error);
    return undefined;
  }
}

async function buildCounterpartyLearningCandidate(params: {
  processingDocumentId: string;
  tenantId: string;
  companyId: string;
  userId: string;
  side: HistoricalCounterpartySide;
  rawName: string;
}): Promise<CounterpartyLearningCandidate | null> {
  const normalizedName = sanitizeCounterpartyName(normalizeCompanyName(params.rawName) || params.rawName);
  if (!normalizedName) {
    return null;
  }

  if (params.side === 'vendor') {
    const resolution = await resolveVendor({
      tenantId: params.tenantId,
      companyId: params.companyId,
      rawVendorName: normalizedName,
      createdById: params.userId,
    });
    const history = await findRecentApprovedRevisionsForCounterparty({
      processingDocumentId: params.processingDocumentId,
      tenantId: params.tenantId,
      companyId: params.companyId,
      side: 'vendor',
      contactId: resolution.vendorId,
      normalizedName,
    });

    return {
      side: 'vendor',
      rawName: params.rawName,
      normalizedName,
      canonicalId: resolution.vendorId,
      canonicalName: resolution.vendorName,
      resolutionConfidence: resolution.confidence,
      resolutionStrategy: resolution.strategy,
      matchMode: history.matchMode,
      revisions: history.revisions,
    };
  }

  const resolution = await resolveCustomer({
    tenantId: params.tenantId,
    companyId: params.companyId,
    rawCustomerName: normalizedName,
    createdById: params.userId,
  });
  const history = await findRecentApprovedRevisionsForCounterparty({
    processingDocumentId: params.processingDocumentId,
    tenantId: params.tenantId,
    companyId: params.companyId,
    side: 'customer',
    contactId: resolution.customerId,
    normalizedName,
  });

  return {
    side: 'customer',
    rawName: params.rawName,
    normalizedName,
    canonicalId: resolution.customerId,
    canonicalName: resolution.customerName,
    resolutionConfidence: resolution.confidence,
    resolutionStrategy: resolution.strategy,
    matchMode: history.matchMode,
    revisions: history.revisions,
  };
}

async function findRecentApprovedRevisionsForCounterparty(params: {
  processingDocumentId: string;
  tenantId: string;
  companyId: string;
  side: HistoricalCounterpartySide;
  contactId?: string;
  normalizedName: string;
}): Promise<{
  matchMode?: HistoricalCounterpartyMatchMode;
  revisions: HistoricalRevisionContextRecord[];
}> {
  const sharedWhere: Prisma.DocumentRevisionWhereInput = {
    status: 'APPROVED',
    supersededAt: null,
    currentForDocument: {
      is: {
        id: { not: params.processingDocumentId },
        document: {
          tenantId: params.tenantId,
          companyId: params.companyId,
          deletedAt: null,
        },
      },
    },
  };

  const select = {
    id: true,
    documentCategory: true,
    documentSubCategory: true,
    vendorName: true,
    customerName: true,
    documentNumber: true,
    documentDate: true,
    currency: true,
    subtotal: true,
    taxAmount: true,
    totalAmount: true,
    supplierGstNo: true,
    approvedAt: true,
    createdAt: true,
    items: {
      orderBy: { lineNo: 'asc' as const },
      take: LEARNING_CONTEXT_MAX_LINE_ITEMS_PER_RECORD + 1,
      select: {
        lineNo: true,
        description: true,
        quantity: true,
        unitPrice: true,
        amount: true,
        gstAmount: true,
        taxCode: true,
        accountCode: true,
      },
    },
  };

  if (params.contactId) {
    const contactIdMatches = await prisma.documentRevision.findMany({
      where: params.side === 'vendor'
        ? { ...sharedWhere, vendorId: params.contactId }
        : { ...sharedWhere, customerId: params.contactId },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: LEARNING_CONTEXT_MAX_RECORDS,
      select,
    });

    if (contactIdMatches.length > 0) {
      return {
        matchMode: 'CONTACT_ID',
        revisions: contactIdMatches,
      };
    }
  }

  const normalizedMatchKey = normalizeVendorName(params.normalizedName);
  if (!normalizedMatchKey) {
    return { revisions: [] };
  }

  const recentNamedRevisions = await prisma.documentRevision.findMany({
    where: params.side === 'vendor'
      ? { ...sharedWhere, vendorName: { not: null } }
      : { ...sharedWhere, customerName: { not: null } },
    orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
    take: LEARNING_CONTEXT_FALLBACK_SCAN_LIMIT,
    select,
  });

  const normalizedMatches = recentNamedRevisions
    .filter((revision) => {
      const nameToCompare = params.side === 'vendor' ? revision.vendorName : revision.customerName;
      return normalizeVendorName(nameToCompare ?? '') === normalizedMatchKey;
    })
    .slice(0, LEARNING_CONTEXT_MAX_RECORDS);

  return normalizedMatches.length > 0
    ? {
        matchMode: 'NORMALIZED_NAME',
        revisions: normalizedMatches,
      }
    : { revisions: [] };
}

function scoreCounterpartyLearningCandidate(candidate: CounterpartyLearningCandidate): number {
  const matchModeScore = candidate.matchMode === 'CONTACT_ID' ? 100 : candidate.matchMode === 'NORMALIZED_NAME' ? 50 : 0;
  return (
    candidate.revisions.length * 1000 +
    matchModeScore +
    Math.round(candidate.resolutionConfidence * 100)
  );
}

function truncateContextValue(value: string | null | undefined, maxChars: number): string {
  const trimmed = value?.trim();
  if (!trimmed) return '-';
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 3)}...` : trimmed;
}

function formatHistoricalLearningContext(candidate: CounterpartyLearningCandidate): string | undefined {
  if (candidate.revisions.length === 0) {
    return undefined;
  }

  const contextLines = [
    '## Learned Counterparty Context',
    `Lightweight pass selected ${candidate.side}Name="${truncateContextValue(candidate.rawName, 120)}".`,
    `Normalized counterparty="${truncateContextValue(candidate.canonicalName ?? candidate.normalizedName, 120)}" using ${candidate.resolutionStrategy} matching (confidence ${candidate.resolutionConfidence.toFixed(2)}).`,
    `Database match mode=${candidate.matchMode ?? 'NONE'} using ${candidate.revisions.length} recent approved current records.`,
    'Use these records only as consistency hints for naming, sub-category tendencies, line descriptions, taxCode, and accountCode assignment.',
    'Do not copy document numbers, dates, quantities, or amounts unless they are visible on the current document.',
  ];

  candidate.revisions.forEach((revision, index) => {
    const approvedDate = revision.approvedAt ?? revision.createdAt;
    const isoDate = approvedDate.toISOString().slice(0, 10);
    contextLines.push(
      `Record ${index + 1}: category=${revision.documentCategory}; subCategory=${revision.documentSubCategory ?? '-'}; documentNumber=${revision.documentNumber ?? '-'}; documentDate=${revision.documentDate ? revision.documentDate.toISOString().slice(0, 10) : '-'}; currency=${revision.currency}; subtotal=${revision.subtotal?.toString() ?? '-'}; taxAmount=${revision.taxAmount?.toString() ?? '-'}; totalAmount=${revision.totalAmount.toString()}; supplierGstNo=${revision.supplierGstNo ?? '-'}; vendorName=${revision.vendorName ?? '-'}; customerName=${revision.customerName ?? '-'}; approvedAt=${isoDate}`
    );

    revision.items.slice(0, LEARNING_CONTEXT_MAX_LINE_ITEMS_PER_RECORD).forEach((item) => {
      contextLines.push(
        `- lineNo=${item.lineNo}; description=${truncateContextValue(item.description, LEARNING_CONTEXT_DESCRIPTION_MAX_CHARS)}; quantity=${item.quantity?.toString() ?? '-'}; unitPrice=${item.unitPrice?.toString() ?? '-'}; amount=${item.amount.toString()}; gstAmount=${item.gstAmount?.toString() ?? '-'}; taxCode=${item.taxCode ?? '-'}; accountCode=${item.accountCode ?? '-'}`
      );
    });

    if (revision.items.length > LEARNING_CONTEXT_MAX_LINE_ITEMS_PER_RECORD) {
      contextLines.push(
        `- ${revision.items.length - LEARNING_CONTEXT_MAX_LINE_ITEMS_PER_RECORD} additional line items omitted to keep context compact.`
      );
    }
  });

  const context = contextLines.join('\n');
  if (context.length <= LEARNING_CONTEXT_MAX_CHARS) {
    return context;
  }

  return `${context.slice(0, LEARNING_CONTEXT_MAX_CHARS - 40).trimEnd()}\n...[context truncated]`;
}

async function buildBatchExtractionPrompt(
  tenantId: string,
  companyId: string | null,
  additionalContext: string | undefined,
  recentTransactions: string | undefined,
  promptTemplate: string
): Promise<string> {
  const coaContext = await getCOAContextForExtraction(tenantId, companyId);
  return withCounterpartyIdentityPrompt(resolveDocumentExtractionPrompt(promptTemplate, {
    additionalContext,
    chartOfAccounts: coaContext,
    recentTransactions,
  }));
}

async function buildMistralLineItemSupplementPrompt(
  tenantId: string,
  companyId: string | null,
  additionalContext?: string
): Promise<string> {
  const coaContext = await getCOAContextForExtraction(tenantId, companyId);

  const parts = [
    'You are extracting ONLY line items from a structured business document table.',
    'Return JSON with exactly one top-level field: lineItems.',
    'Extract EVERY visible business row from these pages.',
    'Do not stop at 20 or 30 rows.',
    'Do not aggregate, summarize, or skip repeated-looking rows.',
    'Continue through all rows visible on the provided page chunk only.',
    'Do not include subtotal, tax, total, freight summary, page totals, or grand total rows as line items.',
    'If a row wraps across multiple text lines, keep it as one line item.',
    'Preserve row order and use the visible row numbering when present.',
    'Each line item should include description, quantity, unitPrice, amount, gstAmount, taxCode, and accountCode when possible.',
  ];

  if (coaContext) {
    parts.push(coaContext);
  }

  if (additionalContext) {
    parts.push(`## Additional Context\n${additionalContext}`);
  }

  return parts.join('\n\n');
}

function shouldUseChunkedMistralLineItemFallback(
  result: FieldExtractionResult,
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[],
  mimeType: string
): boolean {
  return mimeType === 'application/pdf' && pages.length > 1 && (result.lineItems?.length ?? 0) === 30;
}

function getDocumentMimeTypeFromStorageKey(storageKey: string): string {
  const normalizedStorageKey = storageKey.toLowerCase();

  if (normalizedStorageKey.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (normalizedStorageKey.endsWith('.jpg') || normalizedStorageKey.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalizedStorageKey.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/png';
}

async function applyChunkedMistralLineItemFallback(params: {
  result: FieldExtractionResult;
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[];
  documentBuffer: Buffer;
  mimeType: string;
  tenantId: string;
  companyId: string | null;
  userId: string;
  additionalContext?: string;
}): Promise<FieldExtractionResult> {
  const {
    result,
    pages,
    documentBuffer,
    mimeType,
    tenantId,
    companyId,
    userId,
    additionalContext,
  } = params;

  if (!shouldUseChunkedMistralLineItemFallback(result, pages, mimeType)) {
    return result;
  }

  try {
    const fallbackLineItems = await extractMistralLineItemsByPage(
      documentBuffer,
      pages,
      tenantId,
      companyId,
      userId,
      additionalContext,
      Boolean(result.supplierGstNo?.value)
    );

    if (fallbackLineItems && fallbackLineItems.length > (result.lineItems?.length ?? 0)) {
      log.info(
        `Chunked Mistral line item fallback replaced ${result.lineItems?.length ?? 0} items with ${fallbackLineItems.length} items`
      );
      return {
        ...result,
        lineItems: fallbackLineItems,
      };
    }
  } catch (fallbackError) {
    log.warn('Chunked Mistral line item fallback failed', fallbackError);
  }

  return result;
}

async function extractMistralLineItemsByPage(
  pdfBuffer: Buffer,
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[],
  tenantId: string,
  companyId: string | null,
  userId: string,
  additionalContext?: string,
  hasGstRegistration: boolean = false
): Promise<FieldExtractionResult['lineItems']> {
  const prompt = await buildMistralLineItemSupplementPrompt(
    tenantId,
    companyId,
    additionalContext
  );

  const sourcePdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const mergedItems: NonNullable<FieldExtractionResult['lineItems']> = [];

  for (let index = 0; index < pages.length; index += 1) {
    const pageMeta = pages[index];
    const singlePagePdf = await PDFDocument.create();
    const copiedPages = await singlePagePdf.copyPages(sourcePdf, [index]);
    singlePagePdf.addPage(copiedPages[0]);
    const singlePageBytes = await singlePagePdf.save();

    const response = await extractStructuredWithMistralOCR<Record<string, unknown>>({
      document: {
        base64: Buffer.from(singlePageBytes).toString('base64'),
        mimeType: 'application/pdf',
      },
      prompt,
      tenantId,
      userId,
      operation: 'document_extraction_line_items_fallback',
      usageMetadata: {
        companyId,
        processingDocumentPageCount: 1,
        fallbackMode: 'chunked_line_items',
        sourcePageNumber: pageMeta.pageNumber,
      },
      schemaName: 'processing_document_line_items',
      jsonSchema: MISTRAL_LINE_ITEM_ONLY_JSON_SCHEMA,
    });

    const rawLineItems = Array.isArray(response.documentAnnotation?.lineItems)
      ? (response.documentAnnotation.lineItems as Array<Record<string, unknown>>)
      : [];

    mergedItems.push(
      ...mapLineItemsFromAIData(
        rawLineItems,
        pageMeta.pageNumber,
        pageMeta.imageFingerprint ?? '',
        hasGstRegistration
      )
    );
  }

  const dedupedItems = mergedItems.filter((item, index, array) => {
    const duplicateIndex = array.findIndex((candidate) =>
      candidate.lineNo === item.lineNo &&
      candidate.description.value === item.description.value &&
      candidate.amount.value === item.amount.value
    );
    return duplicateIndex === index;
  });

  return dedupedItems
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((item, index) => ({
      ...item,
      lineNo: index + 1,
    }));
}

/**
 * Extract fields using AI vision model
 */
async function performAIExtraction(
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[],
  tenantId: string,
  companyId: string | null,
  userId: string,
  config: ExtractionConfig,
  recentTransactions: string | undefined,
  promptTemplate: string
): Promise<AIExtractionResult> {
  const explicitModel =
    config.model && config.model !== MISTRAL_OCR_MODEL_ID
      ? config.model
      : undefined;
  const forceMistral =
    config.provider === 'mistral' || config.model === MISTRAL_OCR_MODEL_ID;

  // Use config.model if provided and valid, otherwise get best available for tenant
  const modelId = explicitModel
    ? explicitModel
    : forceMistral
      ? null
      : await getBestAvailableModelForWorkspace(tenantId);

  // Read and encode the first page image
  const firstPage = pages[0];
  if (!firstPage || !firstPage.storageKey) {
    throw new Error('No pages to extract from or missing storage key');
  }

  let imageBase64: string;
  let documentBuffer: Buffer;
  let mimeType: string = 'image/png';

  try {
    // Download image from storage
    documentBuffer = await storage.download(firstPage.storageKey);
    imageBase64 = documentBuffer.toString('base64');

    // Detect mime type from extension
    mimeType = getDocumentMimeTypeFromStorageKey(firstPage.storageKey);
  } catch (error) {
    log.error(`Failed to read image from storage: ${firstPage.storageKey}`, error);
    throw new Error(`Failed to read document image from storage. Please ensure the document was uploaded correctly.`);
  }

  // Build extraction prompt from workspace-managed prompt template.
  const coaContext = await getCOAContextForExtraction(tenantId, companyId);
  if (coaContext) {
    if (isAIDebugEnabled()) {
      const accountCount = (coaContext.match(/^- /gm) || []).length;
      log.info(`[ai-debug] COA context added to prompt: ${accountCount} accounts`);
    }
  } else if (isAIDebugEnabled()) {
    log.info('[ai-debug] No COA context available - account codes will use fallback logic');
  }

  const extractionPrompt = withCounterpartyIdentityPrompt(resolveDocumentExtractionPrompt(promptTemplate, {
    additionalContext: config.additionalContext,
    chartOfAccounts: coaContext,
    recentTransactions,
  }));

  if (forceMistral) {
    try {
      const mistralResponse = await extractStructuredWithMistralOCR<Record<string, unknown>>({
        document: {
          base64: imageBase64,
          mimeType,
        },
        prompt: extractionPrompt,
        tenantId,
        userId,
        operation: 'document_extraction',
        usageMetadata: {
          companyId,
          processingDocumentPageCount: pages.length,
        },
        schemaName: 'processing_document_extraction',
        jsonSchema: MISTRAL_DOCUMENT_EXTRACTION_JSON_SCHEMA,
      });

      let result = mapAIResponseToResult(mistralResponse.documentAnnotation, pages);
      result = await applyChunkedMistralLineItemFallback({
        result,
        pages,
        documentBuffer,
        mimeType,
        tenantId,
        companyId,
        userId,
        additionalContext: config.additionalContext,
      });

      if (isAIDebugEnabled()) {
        logExtractionResults(null, {
          documentCategory: result.documentCategory,
          vendorName: result.vendorName,
          totalAmount: result.totalAmount,
          currency: result.currency,
          lineItems: result.lineItems?.map((item) => ({
            lineNo: item.lineNo,
            description: item.description,
            accountCode: item.accountCode,
          })),
        });
      }

      return {
        result,
        modelUsed: mistralResponse.model || MISTRAL_OCR_MODEL_ID,
        providerUsed: 'mistral',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof MistralOCRNotConfiguredError) {
        throw new Error('Mistral OCR is not configured. Please configure a Mistral connector or choose a different extraction model.');
      }
      log.error('Mistral OCR extraction failed', error);
      throw new Error(`AI extraction failed: ${errorMessage}. Please try again or use a different AI model.`);
    }
  }

  if (!modelId) {
    log.warn('No AI model available for extraction after Mistral fallback');
    throw new Error(
      'No AI model configured. Please configure an AI provider (Mistral, OpenAI, Anthropic, Google, or OpenRouter) to enable document extraction.'
    );
  }

  try {
    const documentInputMode = await getDocumentInputModeForModel(tenantId, modelId);
    const connectorDocument =
      mimeType === 'application/pdf' && documentInputMode === 'image'
        ? await prepareImageUrlVisionInput(documentBuffer, mimeType)
        : { base64: imageBase64, mimeType };

    const response = await callAIWithConnector({
      model: modelId,
      tenantId,
      userId,
      userPrompt: extractionPrompt,
      jsonMode: true,
      images: [connectorDocument],
      operation: 'document_extraction',
      temperature: 0.1, // Low temperature for precise extraction
    });

    // Parse the AI response (strip markdown code blocks if present)
    const cleanedContent = stripMarkdownCodeBlocks(response.content);
    const extractedData = JSON.parse(cleanedContent);

    // Debug: log raw AI response to understand bbox format
    log.debug('AI extraction raw response (sample fields):', {
      vendorName: extractedData.vendorName,
      documentNumber: extractedData.documentNumber,
      totalAmount: extractedData.totalAmount,
    });

    // Map to our FieldExtractionResult format
    const result = mapAIResponseToResult(extractedData, pages);

    // Log extraction results for debugging (including account code assignments)
    if (isAIDebugEnabled()) {
      logExtractionResults(null, {
        documentCategory: result.documentCategory,
        vendorName: result.vendorName,
        totalAmount: result.totalAmount,
        currency: result.currency,
        lineItems: result.lineItems?.map((item) => ({
          lineNo: item.lineNo,
          description: item.description,
          accountCode: item.accountCode,
        })),
      });
    }

    return {
      result,
      modelUsed: modelId,
      providerUsed: response.provider,
    };
  } catch (error) {
    log.error('AI extraction failed', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`AI extraction failed: ${errorMessage}. Please try again or use a different AI model.`);
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
    // Handle null/undefined values - return null if value is actually null
    if (f.value === null || f.value === undefined || f.value === 'null') {
      return null;
    }
    return {
      value: String(f.value),
      confidence: typeof f.confidence === 'number' ? f.confidence : 0.8,
    };
  }

  // Plain value format
  return { value: String(field), confidence: 0.8 };
}

export function mapCounterpartyIdentityDraft(
  data: Record<string, unknown>,
  _pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[] = [],
): CounterpartyIdentityDraft {
  const identificationType = extractFieldValue(data.counterpartyIdentificationType);
  const identificationNumber = extractFieldValue(data.counterpartyIdentificationNumber);
  const fullAddress = extractFieldValue(data.counterpartyAddress);
  const email = extractFieldValue(data.counterpartyEmail);
  const phone = extractFieldValue(data.counterpartyPhone);
  return normalizeCounterpartyIdentityDraft({
    identificationType: identificationType?.value,
    identificationNumber: identificationNumber?.value,
    fullAddress: fullAddress?.value,
    email: email?.value,
    phone: phone?.value,
    confidence: {
      identificationNumber: identificationNumber?.confidence,
      fullAddress: fullAddress?.confidence,
      email: email?.confidence,
      phone: phone?.confidence,
    },
  });
}

function mapLineItemsFromAIData(
  rawLineItems: Array<Record<string, unknown>>,
  pageNum: number,
  fingerprint: string,
  hasGstRegistration: boolean
): NonNullable<FieldExtractionResult['lineItems']> {
  return rawLineItems.map((item, idx) => {
    const descField = extractFieldValue(item.description);
    const qtyField = extractFieldValue(item.quantity);
    const unitPriceField = extractFieldValue(item.unitPrice);
    const amountField = extractFieldValue(item.amount);
    const gstAmountField = extractFieldValue(item.gstAmount);
    const taxCodeField = extractFieldValue(item.taxCode);
    const accountCodeField = extractFieldValue(item.accountCode);

    let taxCode = taxCodeField?.value;
    let taxCodeConfidence = taxCodeField?.confidence || 0.7;

    if (!taxCode) {
      const gstAmountNum = gstAmountField?.value ? parseFloat(gstAmountField.value) : 0;
      const amountNum = amountField?.value ? parseFloat(amountField.value) : 0;

      if (gstAmountNum > 0 && amountNum > 0) {
        const actualRate = gstAmountNum / amountNum;

        if (actualRate >= 0.085 && actualRate <= 0.095) {
          taxCode = 'SR';
          taxCodeConfidence = 0.9;
        } else if (actualRate >= 0.075 && actualRate < 0.085) {
          taxCode = 'SR8';
          taxCodeConfidence = 0.9;
        } else if (actualRate >= 0.065 && actualRate < 0.075) {
          taxCode = 'SR7';
          taxCodeConfidence = 0.9;
        } else if (actualRate < 0.005) {
          taxCode = hasGstRegistration ? 'ZR' : 'NA';
          taxCodeConfidence = 0.75;
        } else {
          taxCode = 'SR';
          taxCodeConfidence = 0.6;
          log.debug(`Line item has unusual GST rate: ${(actualRate * 100).toFixed(2)}%`);
        }
      } else if (gstAmountNum > 0) {
        taxCode = 'SR';
        taxCodeConfidence = 0.8;
      } else if (hasGstRegistration) {
        taxCode = 'SR';
        taxCodeConfidence = 0.75;
      } else {
        taxCode = 'NA';
        taxCodeConfidence = 0.6;
      }
    }

    let gstAmount = gstAmountField?.value;
    let gstAmountConfidence = gstAmountField?.confidence || 0.8;

    if (!gstAmount && amountField?.value) {
      const amount = parseFloat(amountField.value);
      if (!isNaN(amount) && amount > 0) {
        let gstRate = 0;
        if (taxCode === 'SR') gstRate = 0.09;
        else if (taxCode === 'SR8') gstRate = 0.08;
        else if (taxCode === 'SR7') gstRate = 0.07;

        if (gstRate > 0) {
          gstAmount = (amount * gstRate).toFixed(2);
          gstAmountConfidence = 0.7;
        }
      }
    }

    let quantity = qtyField?.value;
    let quantityConfidence = qtyField?.confidence || 0.8;
    let unitPrice = unitPriceField?.value;
    let unitPriceConfidence = unitPriceField?.confidence || 0.8;

    if (!quantity && !unitPrice && amountField?.value) {
      quantity = '1';
      quantityConfidence = 0.6;
      unitPrice = amountField.value;
      unitPriceConfidence = 0.6;
    }

    let accountCode = accountCodeField?.value;
    let accountCodeConfidence = accountCodeField?.confidence || 0.8;

    if (!accountCode && descField?.value) {
      const desc = descField.value.toLowerCase();
      const expenseKeywords = [
        'subscription', 'software', 'saas', 'cloud', 'hosting', 'domain',
        'service', 'consulting', 'professional', 'legal', 'accounting',
        'office', 'supplies', 'utilities', 'rent', 'maintenance',
        'marketing', 'advertising', 'promotion', 'travel', 'transport',
        'insurance', 'license', 'fee', 'training', 'education'
      ];
      const cogsKeywords = [
        'purchase', 'inventory', 'goods', 'materials', 'raw material',
        'stock', 'manufacturing', 'production'
      ];

      if (cogsKeywords.some((kw) => desc.includes(kw))) {
        accountCode = '5000';
        accountCodeConfidence = 0.5;
      } else if (expenseKeywords.some((kw) => desc.includes(kw))) {
        accountCode = '6000';
        accountCodeConfidence = 0.5;
      }
    }

    return {
      lineNo: (item.lineNo as number) || idx + 1,
      description: {
        value: descField?.value || 'Unknown',
        confidence: descField?.confidence || 0.9,
        evidence: descField
          ? createFieldEvidence(descField.value, descField.confidence || 0.9, pageNum, fingerprint)
          : undefined,
      },
      quantity: quantity ? { value: quantity, confidence: quantityConfidence } : undefined,
      unitPrice: unitPrice ? { value: unitPrice, confidence: unitPriceConfidence } : undefined,
      amount: {
        value: amountField?.value || '0',
        confidence: amountField?.confidence || 0.9,
        evidence: amountField
          ? createFieldEvidence(amountField.value, amountField.confidence || 0.9, pageNum, fingerprint)
          : undefined,
      },
      gstAmount: gstAmount ? { value: gstAmount, confidence: gstAmountConfidence } : undefined,
      taxCode: { value: taxCode, confidence: taxCodeConfidence },
      accountCode: accountCode ? { value: accountCode, confidence: accountCodeConfidence } : undefined,
    };
  });
}

function normalizeDocumentSubCategory(
  rawValue: string | undefined,
  category: DocumentCategory
): DocumentSubCategory | undefined {
  if (!rawValue) return undefined;

  const normalized = rawValue.trim().toUpperCase().replace(/[\s-]+/g, '_');

  if (isValidSubCategoryForCategory(category, normalized as DocumentSubCategory)) {
    return normalized as DocumentSubCategory;
  }

  switch (normalized) {
    case 'INVOICE':
      if (category === 'ACCOUNTS_RECEIVABLE') return 'SALES_INVOICE';
      if (category === 'TAX_COMPLIANCE') return 'OTHERS_TAX_COMPLIANCE';
      return 'VENDOR_INVOICE';
    case 'CREDIT_NOTE':
      return category === 'ACCOUNTS_RECEIVABLE' ? 'SALES_CREDIT_NOTE' : 'VENDOR_CREDIT_NOTE';
    case 'DEBIT_NOTE':
      return category === 'ACCOUNTS_RECEIVABLE' ? 'SALES_INVOICE' : 'VENDOR_INVOICE';
    case 'STATEMENT':
      if (category === 'ACCOUNTS_RECEIVABLE') return 'CUSTOMER_STATEMENT';
      if (category === 'TREASURY') return 'BANK_STATEMENT';
      return 'VENDOR_STATEMENT';
    case 'RECEIPT':
      return category === 'TAX_COMPLIANCE' ? 'OTHERS_TAX_COMPLIANCE' : 'RECEIPT_VOUCHER';
    case 'PAYMENT':
    case 'PAYMENT_VOUCHER':
      return category === 'TREASURY' ? 'PAYMENT_VOUCHER' : getCatchAllSubCategory(category) ?? undefined;
    case 'ORDER':
    case 'PURCHASE_ORDER':
      return category === 'ACCOUNTS_RECEIVABLE' ? 'SALES_ORDER' : 'PURCHASE_ORDER';
    case 'DELIVERY':
    case 'DELIVERY_NOTE':
      return category === 'ACCOUNTS_RECEIVABLE' ? 'DELIVERY_ORDER' : 'DELIVERY_NOTE';
    case 'QUOTATION':
    case 'QUOTE':
      return category === 'ACCOUNTS_RECEIVABLE'
        ? 'SALES_ORDER'
        : 'VENDOR_QUOTATION';
    default:
      return getCatchAllSubCategory(category) ?? undefined;
  }
}

function parseAmountString(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amountsDiffer(a: string | undefined, b: string | undefined, tolerance = 0.005): boolean {
  const parsedA = parseAmountString(a);
  const parsedB = parseAmountString(b);

  if (parsedA === null || parsedB === null) {
    return a !== b;
  }

  return Math.abs(parsedA - parsedB) > tolerance;
}

function normalizeHeaderAmountsFromLineItems(result: FieldExtractionResult): FieldExtractionResult {
  if (!result.lineItems || result.lineItems.length === 0) {
    return result;
  }

  const subtotalFromLines = result.lineItems.reduce(
    (sum, item) => sum + (parseAmountString(item.amount.value) ?? 0),
    0
  );
  const taxFromLines = result.lineItems.reduce(
    (sum, item) => sum + (parseAmountString(item.gstAmount?.value) ?? 0),
    0
  );
  const totalFromLines = subtotalFromLines + taxFromLines;

  const computedSubtotal = subtotalFromLines.toFixed(2);
  const computedTax = taxFromLines.toFixed(2);
  const computedTotal = totalFromLines.toFixed(2);

  const shouldNormalizeSubtotal =
    !result.subtotal?.value || amountsDiffer(result.subtotal.value, computedSubtotal);
  const shouldNormalizeTax =
    result.taxAmount?.value === undefined || amountsDiffer(result.taxAmount.value, computedTax);
  const shouldNormalizeTotal = amountsDiffer(result.totalAmount.value, computedTotal);

  if (!shouldNormalizeSubtotal && !shouldNormalizeTax && !shouldNormalizeTotal) {
    return result;
  }

  return {
    ...result,
    subtotal: shouldNormalizeSubtotal
      ? {
          value: computedSubtotal,
          confidence: result.subtotal?.confidence ?? 0.75,
        }
      : result.subtotal,
    taxAmount: shouldNormalizeTax
      ? {
          value: computedTax,
          confidence: result.taxAmount?.confidence ?? 0.75,
        }
      : result.taxAmount,
    totalAmount: shouldNormalizeTotal
      ? {
          ...result.totalAmount,
          value: computedTotal,
        }
      : result.totalAmount,
  };
}

/**
 * Map AI response to FieldExtractionResult format
 */
function mapAIResponseToResult(
  data: Record<string, unknown>,
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[]
): FieldExtractionResult {
  const pageNum = pages[0]?.pageNumber ?? 1;
  const fingerprint = pages[0]?.imageFingerprint ?? '';

  // Handle documentCategory (required field)
  const docCategory = extractFieldValue(data.documentCategory);
  const documentCategory: ExtractedField<DocumentCategory> = {
    value: (docCategory?.value as DocumentCategory) || 'OTHER',
    confidence: docCategory?.confidence || 0.8,
  };

  // Handle documentSubCategory (optional field)
  const docSubCategory = extractFieldValue(data.documentSubCategory);
  const normalizedSubCategory = normalizeDocumentSubCategory(
    docSubCategory?.value,
    documentCategory.value
  );
  const documentSubCategory: ExtractedField<DocumentSubCategory> | undefined = docSubCategory
    && normalizedSubCategory
    ? {
        value: normalizedSubCategory,
        confidence: docSubCategory.confidence || 0.8,
      }
    : undefined;

  // Handle optional header fields with bbox
  const vendorNameField = extractFieldValue(data.vendorName);
  const customerNameField = extractFieldValue(data.customerName);
  const counterpartyIdentificationTypeField = extractFieldValue(data.counterpartyIdentificationType);
  const counterpartyIdentificationNumberField = extractFieldValue(data.counterpartyIdentificationNumber);
  const counterpartyAddressField = extractFieldValue(data.counterpartyAddress);
  const counterpartyEmailField = extractFieldValue(data.counterpartyEmail);
  const counterpartyPhoneField = extractFieldValue(data.counterpartyPhone);
  const documentNumberField = extractFieldValue(data.documentNumber);
  const documentDateField = extractFieldValue(data.documentDate);
  const dueDateField = extractFieldValue(data.dueDate);
  const currencyField = extractFieldValue(data.currency);
  const subtotalField = extractFieldValue(data.subtotal);
  const taxAmountField = extractFieldValue(data.taxAmount);
  const totalAmountField = extractFieldValue(data.totalAmount);
  const supplierGstNoField = extractFieldValue(data.supplierGstNo);

  // Determine if document has GST registration (to infer default tax code)
  const hasGstRegistration = !!supplierGstNoField?.value;

  // Map line items with bbox support and GST code assignment
  const rawLineItems = data.lineItems as Array<Record<string, unknown>> || [];
  const lineItems = rawLineItems.map((item, idx) => {
    const descField = extractFieldValue(item.description);
    const qtyField = extractFieldValue(item.quantity);
    const unitPriceField = extractFieldValue(item.unitPrice);
    const amountField = extractFieldValue(item.amount);
    const gstAmountField = extractFieldValue(item.gstAmount);
    const taxCodeField = extractFieldValue(item.taxCode);
    const accountCodeField = extractFieldValue(item.accountCode);

    // Determine tax code with intelligent fallback based on actual GST percentage
    let taxCode = taxCodeField?.value;
    let taxCodeConfidence = taxCodeField?.confidence || 0.7;

    if (!taxCode) {
      // Apply fallback logic based on actual GST percentage calculation
      const gstAmountNum = gstAmountField?.value ? parseFloat(gstAmountField.value) : 0;
      const amountNum = amountField?.value ? parseFloat(amountField.value) : 0;

      if (gstAmountNum > 0 && amountNum > 0) {
        // Calculate actual GST rate from amounts
        const actualRate = gstAmountNum / amountNum;

        // Determine GST code based on actual rate with tolerance bands
        if (actualRate >= 0.085 && actualRate <= 0.095) {
          // 8.5% to 9.5% â†’ SR (9%)
          taxCode = 'SR';
          taxCodeConfidence = 0.9; // High confidence when calculated from actual amounts
        } else if (actualRate >= 0.075 && actualRate < 0.085) {
          // 7.5% to 8.5% â†’ SR8 (8%)
          taxCode = 'SR8';
          taxCodeConfidence = 0.9;
        } else if (actualRate >= 0.065 && actualRate < 0.075) {
          // 6.5% to 7.5% â†’ SR7 (7%)
          taxCode = 'SR7';
          taxCodeConfidence = 0.9;
        } else if (actualRate < 0.005) {
          // Less than 0.5% â†’ Zero-rated or NA
          taxCode = hasGstRegistration ? 'ZR' : 'NA';
          taxCodeConfidence = 0.75;
        } else {
          // Other rates - default to SR but lower confidence
          taxCode = 'SR';
          taxCodeConfidence = 0.6;
          log.debug(`Line item has unusual GST rate: ${(actualRate * 100).toFixed(2)}%`);
        }
      } else if (gstAmountNum > 0) {
        // Has GST amount but no base amount to calculate rate â†’ Standard-Rated
        taxCode = 'SR';
        taxCodeConfidence = 0.8;
      } else if (hasGstRegistration) {
        // Supplier is GST registered â†’ default to Standard-Rated
        taxCode = 'SR';
        taxCodeConfidence = 0.75;
      } else {
        // No GST registration â†’ Not Applicable
        taxCode = 'NA';
        taxCodeConfidence = 0.6;
      }
    }

    // Calculate GST amount if not provided but tax code indicates GST applies
    let gstAmount = gstAmountField?.value;
    let gstAmountConfidence = gstAmountField?.confidence || 0.8;

    if (!gstAmount && amountField?.value) {
      const amount = parseFloat(amountField.value);
      if (!isNaN(amount) && amount > 0) {
        // Determine rate based on tax code
        let gstRate = 0;
        if (taxCode === 'SR') gstRate = 0.09;
        else if (taxCode === 'SR8') gstRate = 0.08;
        else if (taxCode === 'SR7') gstRate = 0.07;

        if (gstRate > 0) {
          gstAmount = (amount * gstRate).toFixed(2);
          gstAmountConfidence = 0.7; // Lower confidence for calculated values
        }
      }
    }

    // Default qty=1 and unitPrice=amount when both are not provided
    let quantity = qtyField?.value;
    let quantityConfidence = qtyField?.confidence || 0.8;
    let unitPrice = unitPriceField?.value;
    let unitPriceConfidence = unitPriceField?.confidence || 0.8;

    if (!quantity && !unitPrice && amountField?.value) {
      // When qty and unitPrice are not extracted, default qty=1 and unitPrice=amount
      quantity = '1';
      quantityConfidence = 0.6; // Lower confidence for defaulted values
      unitPrice = amountField.value;
      unitPriceConfidence = 0.6;
    }

    // Fallback account code suggestion based on description keywords
    let accountCode = accountCodeField?.value;
    let accountCodeConfidence = accountCodeField?.confidence || 0.8;

    if (!accountCode && descField?.value) {
      const desc = descField.value.toLowerCase();
      // Common keyword mappings for expenses (6xxx range)
      const expenseKeywords = [
        'subscription', 'software', 'saas', 'cloud', 'hosting', 'domain',
        'service', 'consulting', 'professional', 'legal', 'accounting',
        'office', 'supplies', 'utilities', 'rent', 'maintenance',
        'marketing', 'advertising', 'promotion', 'travel', 'transport',
        'insurance', 'license', 'fee', 'training', 'education'
      ];
      // Common keywords for COGS (5xxx range)
      const cogsKeywords = [
        'purchase', 'inventory', 'goods', 'materials', 'raw material',
        'stock', 'manufacturing', 'production'
      ];

      if (cogsKeywords.some(kw => desc.includes(kw))) {
        // Suggest a COGS account - user should have one in 5xxx range
        accountCode = '5000'; // Generic COGS
        accountCodeConfidence = 0.5;
      } else if (expenseKeywords.some(kw => desc.includes(kw))) {
        // Suggest a general expense account - user should have one in 6xxx range
        accountCode = '6000'; // Generic expense
        accountCodeConfidence = 0.5;
      }
    }

    return {
      lineNo: (item.lineNo as number) || idx + 1,
      description: {
        value: descField?.value || 'Unknown',
        confidence: descField?.confidence || 0.9,
        evidence: descField ? createFieldEvidence(descField.value, descField.confidence || 0.9, pageNum, fingerprint) : undefined,
      },
      quantity: quantity ? { value: quantity, confidence: quantityConfidence } : undefined,
      unitPrice: unitPrice ? { value: unitPrice, confidence: unitPriceConfidence } : undefined,
      amount: {
        value: amountField?.value || '0',
        confidence: amountField?.confidence || 0.9,
        evidence: amountField ? createFieldEvidence(amountField.value, amountField.confidence || 0.9, pageNum, fingerprint) : undefined,
      },
      gstAmount: gstAmount ? { value: gstAmount, confidence: gstAmountConfidence } : undefined,
      taxCode: { value: taxCode, confidence: taxCodeConfidence },
      accountCode: accountCode ? { value: accountCode, confidence: accountCodeConfidence } : undefined,
    };
  });

  // Get overall confidence from data or calculate default
  const overallConfidence = typeof data.overallConfidence === 'number' ? data.overallConfidence : 0.8;

  return {
    documentCategory,
    documentSubCategory,
    vendorName: vendorNameField ? {
      value: vendorNameField.value,
      confidence: vendorNameField.confidence,
      evidence: createFieldEvidence(vendorNameField.value, vendorNameField.confidence, pageNum, fingerprint),
    } : undefined,
    customerName: customerNameField ? {
      value: customerNameField.value,
      confidence: customerNameField.confidence,
      evidence: createFieldEvidence(customerNameField.value, customerNameField.confidence, pageNum, fingerprint),
    } : undefined,
    counterpartyIdentificationType: counterpartyIdentificationTypeField ? {
      value: counterpartyIdentificationTypeField.value,
      confidence: counterpartyIdentificationTypeField.confidence,
      evidence: createFieldEvidence(counterpartyIdentificationTypeField.value, counterpartyIdentificationTypeField.confidence, pageNum, fingerprint),
    } : undefined,
    counterpartyIdentificationNumber: counterpartyIdentificationNumberField ? {
      value: counterpartyIdentificationNumberField.value,
      confidence: counterpartyIdentificationNumberField.confidence,
      evidence: createFieldEvidence(counterpartyIdentificationNumberField.value, counterpartyIdentificationNumberField.confidence, pageNum, fingerprint),
    } : undefined,
    counterpartyAddress: counterpartyAddressField ? {
      value: counterpartyAddressField.value,
      confidence: counterpartyAddressField.confidence,
      evidence: createFieldEvidence(counterpartyAddressField.value, counterpartyAddressField.confidence, pageNum, fingerprint),
    } : undefined,
    counterpartyEmail: counterpartyEmailField ? {
      value: counterpartyEmailField.value,
      confidence: counterpartyEmailField.confidence,
      evidence: createFieldEvidence(counterpartyEmailField.value, counterpartyEmailField.confidence, pageNum, fingerprint),
    } : undefined,
    counterpartyPhone: counterpartyPhoneField ? {
      value: counterpartyPhoneField.value,
      confidence: counterpartyPhoneField.confidence,
      evidence: createFieldEvidence(counterpartyPhoneField.value, counterpartyPhoneField.confidence, pageNum, fingerprint),
    } : undefined,
    counterpartyIdentity: mapCounterpartyIdentityDraft(data, pages),
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
    homeCurrencyEquivalent: extractHomeCurrencyEquivalent(
      data.homeCurrencyEquivalent,
      totalAmountField?.value
    ),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    overallConfidence,
  };
}

/**
 * Extract home currency equivalent from AI response
 * If exchange rate is not provided, calculate it from document total / home total
 * @param data - The homeCurrencyEquivalent object from AI response
 * @param documentTotalAmount - The document's total amount (in document currency)
 */
function extractHomeCurrencyEquivalent(
  data: unknown,
  documentTotalAmount?: string
): HomeCurrencyEquivalent | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const hce = data as Record<string, unknown>;

  // Check if we have required fields
  if (!hce.currency || !hce.totalAmount) return undefined;

  const homeTotalStr = String(hce.totalAmount);
  let exchangeRate: string;

  if (hce.exchangeRate) {
    // Use the exchange rate from the document
    exchangeRate = String(hce.exchangeRate);
  } else if (documentTotalAmount) {
    // Calculate exchange rate: homeTotal / documentTotal (to 6 decimal places)
    const docTotal = parseFloat(documentTotalAmount);
    const homeTotal = parseFloat(homeTotalStr);
    if (docTotal > 0 && homeTotal > 0) {
      exchangeRate = (homeTotal / docTotal).toFixed(6);
    } else {
      exchangeRate = '1';
    }
  } else {
    exchangeRate = '1';
  }

  return {
    currency: String(hce.currency),
    exchangeRate,
    subtotal: hce.subtotal ? String(hce.subtotal) : undefined,
    taxAmount: hce.taxAmount ? String(hce.taxAmount) : undefined,
    totalAmount: homeTotalStr,
    confidence: typeof hce.confidence === 'number' ? hce.confidence : 0.8,
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
    storageKey: string;
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
      storageKey: page.storageKey,
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
  return hashBlake3(JSON.stringify({ pageIds, config }));
}

/**
 * Build evidence JSON from extraction result
 */
function buildEvidenceJson(result: FieldExtractionResult): Record<string, FieldEvidence | undefined> {
  const evidence: Record<string, FieldEvidence | undefined> = {};

  if (result.vendorName?.evidence) {
    evidence.vendorName = result.vendorName.evidence;
  }
  if (result.customerName?.evidence) {
    evidence.customerName = result.customerName.evidence;
  }
  if (result.counterpartyIdentificationType?.evidence) evidence.counterpartyIdentificationType = result.counterpartyIdentificationType.evidence;
  if (result.counterpartyIdentificationNumber?.evidence) evidence.counterpartyIdentificationNumber = result.counterpartyIdentificationNumber.evidence;
  if (result.counterpartyAddress?.evidence) evidence.counterpartyAddress = result.counterpartyAddress.evidence;
  if (result.counterpartyEmail?.evidence) evidence.counterpartyEmail = result.counterpartyEmail.evidence;
  if (result.counterpartyPhone?.evidence) evidence.counterpartyPhone = result.counterpartyPhone.evidence;
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
      documentSubCategory: result.documentSubCategory?.confidence,
      vendorName: result.vendorName?.confidence,
      customerName: result.customerName?.confidence,
      counterpartyIdentificationNumber: result.counterpartyIdentificationNumber?.confidence,
      counterpartyAddress: result.counterpartyAddress?.confidence,
      counterpartyEmail: result.counterpartyEmail?.confidence,
      counterpartyPhone: result.counterpartyPhone?.confidence,
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
