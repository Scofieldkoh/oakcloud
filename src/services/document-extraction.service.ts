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
import { createRevision, type LineItemInput } from './document-revision.service';
import { transitionPipelineStatus, recordProcessingAttempt } from './document-processing.service';
import { checkForDuplicates, updateDuplicateStatus } from './duplicate-detection.service';
import { callAIWithConnector, getBestAvailableModelForTenant, logExtractionResults, isAIDebugEnabled, stripMarkdownCodeBlocks } from '@/lib/ai';
import type { AIModel } from '@/lib/ai/types';
import { storage } from '@/lib/storage';
import { performAISplitDetection } from '@/lib/split-detection';
import { hashBlake3 } from '@/lib/encryption';
import { getAccountsForSelect } from './chart-of-accounts.service';
import { getRate } from './exchange-rate.service';
import type { SupportedCurrency } from '@/lib/validations/exchange-rate';
import { learnVendorAlias, resolveVendor } from './vendor-resolution.service';
import { learnCustomerAlias, resolveCustomer } from './customer-resolution.service';

type _Decimal = Prisma.Decimal;

const log = createLogger('document-extraction');

// ============================================================================
// Types
// ============================================================================

export interface ExtractionConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  promptVersion: string;
  schemaVersion: string;
  /** Additional context to help AI extraction (e.g., "Focus on line items") */
  additionalContext?: string;
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

    // Fetch company's home currency - this is the currency used for home equivalent calculations
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { homeCurrency: true },
    });
    const companyHomeCurrency = company?.homeCurrency || 'SGD';

    // Generate input fingerprint for reproducibility
    const inputFingerprint = generateInputFingerprint(
      pages.map((p) => p.id),
      mergedConfig
    );

    // Perform AI extraction (falls back to simulation if AI unavailable)
    const { result: extractionResult, modelUsed, providerUsed } = await performAIExtraction(pages, tenantId, companyId, userId, mergedConfig);

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

    // Extract home currency equivalent if present (from invoice showing home currency tax equivalent)
    const hce = extractionResult.homeCurrencyEquivalent;

    // Home currency is ALWAYS the company's home currency, not extracted from document
    // The AI may extract HCE amounts, but the currency itself comes from company settings
    const homeCurrency = companyHomeCurrency;
    const documentCurrency = extractionResult.currency.value;
    const isSameCurrency = documentCurrency === homeCurrency;

    // Determine exchange rate with priority:
    // 1. Document-extracted exchange rate (only if HCE currency matches company home currency)
    // 2. Database lookup (MAS/IRAS rates based on document date)
    // 3. Default to 1 (same currency or fallback)
    let exchangeRate: string;
    let exchangeRateSource: ExchangeRateSource = 'PROVIDER_DEFAULT';

    // Only use document exchange rate if the HCE currency matches company's home currency
    // Example: Invoice MYR→SGD rate is only useful if company's home currency is SGD
    const hceExchangeRateValid = hce?.exchangeRate && hce?.currency === companyHomeCurrency;

    if (hceExchangeRateValid) {
      // Priority 1: Use exchange rate from document (HCE currency matches company home currency)
      exchangeRate = hce!.exchangeRate!;
      exchangeRateSource = 'DOCUMENT';
    } else if (isSameCurrency) {
      // Same currency - no conversion needed
      exchangeRate = '1';
      exchangeRateSource = 'PROVIDER_DEFAULT';
    } else {
      // Priority 2: Look up exchange rate from database
      const documentDate = extractionResult.documentDate?.value
        ? new Date(extractionResult.documentDate.value)
        : new Date(); // Use today if no date

      try {
        const rateResult = await getRate(
          documentCurrency as SupportedCurrency,
          companyHomeCurrency as SupportedCurrency,
          documentDate,
          tenantId
        );

        if (rateResult) {
          exchangeRate = rateResult.rate.toString();
          // Map the rate type to ExchangeRateSource
          if (rateResult.rateType === 'MAS_DAILY_RATE') {
            exchangeRateSource = 'MAS_DAILY';
          } else if (rateResult.rateType === 'MAS_MONTHLY_RATE') {
            exchangeRateSource = 'IRAS_MONTHLY_AVG';
          } else if (rateResult.rateType === 'MANUAL_RATE') {
            exchangeRateSource = 'MANUAL';
          } else {
            exchangeRateSource = 'PROVIDER_DEFAULT';
          }
          log.info(`Exchange rate lookup for ${documentCurrency} on ${documentDate.toISOString().split('T')[0]}: ${exchangeRate} (source: ${exchangeRateSource})`);
        } else {
          // Priority 3: No rate found, default to 1
          exchangeRate = '1';
          exchangeRateSource = 'PROVIDER_DEFAULT';
          log.warn(`No exchange rate found for ${documentCurrency} on ${documentDate.toISOString().split('T')[0]}, defaulting to 1`);
        }
      } catch (rateError) {
        // Log error but don't fail extraction - use default rate
        log.error(`Failed to lookup exchange rate for ${documentCurrency}:`, rateError);
        exchangeRate = '1';
        exchangeRateSource = 'PROVIDER_DEFAULT';
      }
    }
    const exchangeRateNum = parseFloat(exchangeRate);

    // Only use AI-extracted HCE amounts if the extracted currency matches company's home currency
    // Example: Invoice shows MYR with SGD equivalents, but company uses USD
    // In this case, we must calculate USD equivalents, not use the SGD amounts from the invoice
    const hceMatchesHomeCurrency = hce?.currency === companyHomeCurrency;
    const useExtractedHce = hceMatchesHomeCurrency && hce;

    // Calculate home amounts - prefer extracted if currency matches, otherwise calculate
    const homeSubtotal = (useExtractedHce && hce?.subtotal) ||
      (extractionResult.subtotal?.value ? (parseFloat(extractionResult.subtotal.value) * exchangeRateNum).toFixed(2) : undefined);
    const homeTaxAmount = (useExtractedHce && hce?.taxAmount) ||
      (extractionResult.taxAmount?.value ? (parseFloat(extractionResult.taxAmount.value) * exchangeRateNum).toFixed(2) : undefined);
    const homeEquivalent = (useExtractedHce && hce?.totalAmount) ||
      (parseFloat(extractionResult.totalAmount.value) * exchangeRateNum).toFixed(2);

    // Counterparty canonicalization:
    // - For ACCOUNTS_PAYABLE: vendor is the other party (vendorName).
    // - For ACCOUNTS_RECEIVABLE: customer is the other party (customerName).
    const isReceivable = extractionResult.documentCategory.value === 'ACCOUNTS_RECEIVABLE';
    const rawCounterpartyName = isReceivable
      ? extractionResult.customerName?.value ?? extractionResult.vendorName?.value
      : extractionResult.vendorName?.value;

    const vendorResolution = isReceivable
      ? { vendorName: undefined, vendorId: undefined, confidence: 0, strategy: 'NONE' as const }
      : await resolveVendor({
          tenantId,
          companyId,
          rawVendorName: rawCounterpartyName,
          createdById: userId,
        });

    const customerResolution = isReceivable
      ? await resolveCustomer({
          tenantId,
          companyId,
          rawCustomerName: rawCounterpartyName,
          createdById: userId,
        })
      : { customerName: undefined, customerId: undefined, confidence: 0, strategy: 'NONE' as const };

    // Learn aliases from extraction (best-effort)
    if (rawCounterpartyName) {
      if (!isReceivable && vendorResolution.vendorId) {
        try {
          const conf = vendorResolution.confidence || extractionResult.vendorName?.confidence || 0.9;
          await learnVendorAlias({
            tenantId,
            companyId,
            rawName: rawCounterpartyName,
            vendorId: vendorResolution.vendorId,
            confidence: conf,
            createdById: userId,
          });
        } catch (e) {
          log.warn(`Failed to learn vendor alias for "${rawCounterpartyName}"`, e);
        }
      }

      if (isReceivable && customerResolution.customerId) {
        try {
          const conf =
            customerResolution.confidence ||
            extractionResult.customerName?.confidence ||
            extractionResult.vendorName?.confidence ||
            0.9;
          await learnCustomerAlias({
            tenantId,
            companyId,
            rawName: rawCounterpartyName,
            customerId: customerResolution.customerId,
            confidence: conf,
            createdById: userId,
          });
        } catch (e) {
          log.warn(`Failed to learn customer alias for "${rawCounterpartyName}"`, e);
        }
      }
    }

    // Create revision from extraction with calculated home amounts
    const revision = await createRevision({
      processingDocumentId,
      revisionType: 'EXTRACTION',
      extractionId: extraction.id,
      createdById: userId,
      documentCategory: extractionResult.documentCategory.value,
      documentSubCategory: extractionResult.documentSubCategory?.value,
      // Keep `vendorName` populated for existing UI/duplicate detection; for AR docs, this is the customer name.
      vendorName: isReceivable ? customerResolution.customerName : vendorResolution.vendorName,
      vendorId: isReceivable ? undefined : vendorResolution.vendorId,
      customerName: isReceivable ? customerResolution.customerName : undefined,
      customerId: isReceivable ? customerResolution.customerId : undefined,
      documentNumber: extractionResult.documentNumber?.value,
      documentDate: extractionResult.documentDate?.value
        ? new Date(extractionResult.documentDate.value)
        : undefined,
      // Fallback: if dueDate is not provided, use documentDate
      dueDate: extractionResult.dueDate?.value
        ? new Date(extractionResult.dueDate.value)
        : extractionResult.documentDate?.value
          ? new Date(extractionResult.documentDate.value)
          : undefined,
      currency: extractionResult.currency.value,
      subtotal: extractionResult.subtotal?.value,
      taxAmount: extractionResult.taxAmount?.value,
      totalAmount: extractionResult.totalAmount.value,
      supplierGstNo: extractionResult.supplierGstNo?.value,
      // Home currency equivalent - use extracted or calculated values
      homeCurrency,
      homeExchangeRate: exchangeRate,
      homeExchangeRateSource: exchangeRateSource,
      homeSubtotal,
      homeTaxAmount,
      homeEquivalent,
      headerEvidenceJson: evidenceJson,
      items: extractionResult.lineItems?.map((item) => {
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
          // Calculate home amounts for line items
          homeAmount: (amount * exchangeRateNum).toFixed(2),
          homeGstAmount: gstAmount > 0 ? (gstAmount * exchangeRateNum).toFixed(2) : undefined,
        };
      }) as LineItemInput[],
      reason: 'initial_extraction',
    });

    // Point the processing document to the latest extracted draft revision so list views and sorting
    // can use it immediately (no approval required).
    await prisma.processingDocument.update({
      where: { id: processingDocumentId },
      data: {
        currentRevisionId: revision.id,
        lockVersion: { increment: 1 },
      },
    });

    // Update pipeline status to EXTRACTION_DONE
    await transitionPipelineStatus(processingDocumentId, 'EXTRACTION_DONE', tenantId, companyId);

    // Record success
    await recordProcessingAttempt(processingDocumentId, 'FIELD_EXTRACTION', 'SUCCEEDED', {
      providerLatencyMs: latencyMs,
    });

    // Re-run duplicate check now that extraction data is available
    // This is critical for image PDFs where content-based matching wasn't possible at upload time
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
      // Log but don't fail extraction if duplicate check fails
      log.warn(`Post-extraction duplicate check failed for ${processingDocumentId}:`, dupError);
    }

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

/**
 * Extract fields using AI vision model
 */
async function performAIExtraction(
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[],
  tenantId: string,
  companyId: string | null,
  userId: string,
  config: ExtractionConfig
): Promise<AIExtractionResult> {
  // Use config.model if provided and valid, otherwise get best available for tenant
  const modelId = config.model && config.model !== 'gpt-4-vision'
    ? config.model
    : await getBestAvailableModelForTenant(tenantId);

  if (!modelId) {
    log.warn('No AI model available for extraction');
    throw new Error('No AI model configured. Please configure an AI provider (OpenAI, Anthropic, or Google) to enable document extraction.');
  }

  // Read and encode the first page image
  const firstPage = pages[0];
  if (!firstPage || !firstPage.storageKey) {
    throw new Error('No pages to extract from or missing storage key');
  }

  let imageBase64: string;
  let mimeType: string = 'image/png';

  // Derive provider from model ID
  const providerFromModel = modelId.startsWith('gpt') ? 'openai'
    : modelId.startsWith('claude') ? 'anthropic'
    : modelId.startsWith('gemini') ? 'google'
    : 'openai';

  try {
    // Download image from storage
    const imageBuffer = await storage.download(firstPage.storageKey);
    imageBase64 = imageBuffer.toString('base64');

    // Detect mime type from extension
    const storageKey = firstPage.storageKey.toLowerCase();
    if (storageKey.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (storageKey.endsWith('.png')) {
      mimeType = 'image/png';
    }
  } catch (error) {
    log.error(`Failed to read image from storage: ${firstPage.storageKey}`, error);
    throw new Error(`Failed to read document image from storage. Please ensure the document was uploaded correctly.`);
  }

  // Build extraction prompt with optional additional context
  let extractionPrompt = `You are a document data extraction AI specializing in Singapore business documents. Analyze this document image and extract all relevant information with high accuracy.

## Response Schema (JSON)
{
  "documentCategory": {
    "value": "ACCOUNTS_PAYABLE" | "ACCOUNTS_RECEIVABLE" | "TREASURY" | "TAX_COMPLIANCE" | "PAYROLL" | "CORPORATE_SECRETARIAL" | "CONTRACTS" | "FINANCIAL_REPORTS" | "INSURANCE" | "CORRESPONDENCE" | "OTHER",
    "confidence": number between 0 and 1
  },
  "documentSubCategory": {
    "value": "(see sub-category list below)",
    "confidence": number between 0 and 1
  } | null,
  "vendorName": {
    "value": "string",
    "confidence": number
  } | null,
  "customerName": {
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
  "homeCurrencyEquivalent": {
    "currency": "3-letter code (e.g., SGD)",
    "exchangeRate": "decimal number as string",
    "subtotal": "decimal number as string" | null,
    "taxAmount": "decimal number as string" | null,
    "totalAmount": "decimal number as string",
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
      "taxCode": { "value": "string (SR, ZR, ES, NA, TX, etc.)", "confidence": number },
      "accountCode": { "value": "string (e.g., 5000, 6000, 6100)", "confidence": number } | null
    }
  ],
  "overallConfidence": number between 0 and 1
}

## Counterparty Field Rules (IMPORTANT)
- For **ACCOUNTS_PAYABLE** documents, extract the supplier into "vendorName".
- For **ACCOUNTS_RECEIVABLE** documents, extract the buyer into "customerName".
- Do NOT put a person's name (e.g., "Raymond") unless the counterparty on the document is clearly an individual.

## Singapore GST Tax Codes (REQUIRED for each line item)
You MUST assign a taxCode to EVERY line item based on these rules:
- **SR (Standard-Rated 9%)**: Most goods and services in Singapore. ONLY use if supplier has GST registration number.
- **ZR (Zero-Rated 0%)**: Exports, international services, prescribed goods
- **ES (Exempt Supply)**: Financial services, residential property sales/rentals, precious metals
- **NA (Not Applicable)**: Use when supplier is NOT GST registered, or for non-business transactions, private expenses, government fees/fines
- **TX (Taxable Purchases)**: Standard input tax claimable purchases
- **BL (Blocked Input Tax)**: Club subscriptions, medical expenses, motor vehicle expenses

**CRITICAL - GST Registration Check:**
First, look for a GST Registration Number on the document. It typically appears as:
- "GST Reg No: M12345678X" or "GST No: 12345678X"
- Usually near the company name, address, or footer
- Format: 9-10 alphanumeric characters (e.g., M12345678X, 200012345M)

Determination logic:
1. **If NO GST registration number found** â†’ ALL line items should use **NA** (supplier is not GST registered, no GST claimable)
2. If GST registration found AND GST/tax amount is shown â†’ SR (9% GST)
3. If GST registration found but explicitly marked as "0% GST" or "Zero-rated" â†’ ZR
4. If GST registration found but no GST charged â†’ Could be ZR, ES, or exempt item
5. If foreign supplier/service â†’ ZR or NA depending on nature
6. When in doubt AND supplier is GST registered â†’ SR

## Amount Validation Rules (CRITICAL)
1. **Line Item Calculation**: For each line item, verify: quantity * unitPrice = amount (with small rounding tolerance)
2. **Subtotal Validation**: Sum of all line item amounts MUST equal subtotal
3. **Tax Calculation**: taxAmount should be approximately 9% of subtotal for SR items (or sum of line item gstAmounts)
4. **Total Validation**: subtotal + taxAmount MUST equal totalAmount

**IMPORTANT: For GST-INCLUSIVE documents (see GST-INCLUSIVE section below):**
- The "amount" field should contain the PRE-GST amount (calculated by dividing inclusive price by 1.09)
- Do NOT extract the GST-inclusive amount as the line item amount
- This ensures validation rules work correctly

If the document shows values that don't add up:
- Extract the values as shown on the document
- Lower your confidence score for affected fields
- The document's printed values take precedence over calculations

## Line Item GST Amount Calculation
For each line item with taxCode = "SR":
- gstAmount = amount * 0.09 (rounded to 2 decimal places)
- If the document shows a different GST amount per line, use the document's value

## GST-INCLUSIVE Pricing (CRITICAL - Common in Singapore)
Many Singapore documents show prices INCLUSIVE of GST. Look for these indicators:
- "GST inclusive", "GST included", "Inclusive of GST", "Price inclusive of GST"
- "Inc. GST", "incl. GST", "w/ GST", "Including 9% GST"
- "All prices are inclusive of GST", "Prices shown include GST"
- Total amount shown with "GST @ 9% Inclusive" or similar notation

**When amounts are GST-INCLUSIVE, you MUST calculate backwards to get the pre-GST amount:**
- For 9% GST: Pre-GST Amount = Inclusive Amount / 1.09
- For 8% GST: Pre-GST Amount = Inclusive Amount / 1.08

**Example (9% GST):**
- Document shows line item: $205.69 (GST inclusive)
- Pre-GST amount (what to extract): $205.69 / 1.09 = $188.71
- GST amount: $205.69 - $188.71 = $16.98 (or $188.71 * 0.09 = $16.98)
- Extract: amount = "188.71", gstAmount = "16.98"

**Validation for GST-inclusive documents:**
- amount (pre-GST) * 1.09 should approximately equal the displayed inclusive price
- Sum of all line item amounts = subtotal (pre-GST)
- subtotal + taxAmount = totalAmount (which may equal the GST-inclusive total shown)

**How to identify GST-inclusive vs GST-exclusive:**
1. Look for explicit labels: "incl GST", "excl GST", "before GST", "after GST"
2. Check if the math works: If line items sum to total without adding GST separately, it's likely inclusive
3. Look at the GST breakdown section - does it show "GST @ 9% Inclusive" or "Add: GST 9%"?
4. Singapore retail receipts and some invoices commonly use GST-inclusive pricing

## Negative Amounts (Credits/Refunds) - CRITICAL
Amounts shown in parentheses like ($17.50) or (17.50) represent NEGATIVE values:
- Extract as negative decimal: "($17.50)" â†’ "-17.50"
- Extract as negative decimal: "(17.50)" â†’ "-17.50"
- These are credits, refunds, discounts, or reversals
- When calculating subtotal: $25.00 + ($17.50) = $25.00 + (-$17.50) = $7.50
- The subtotal must be the algebraic SUM of all line items including negatives

## Document Categories and Sub-Categories
Select the most appropriate category and sub-category based on document content:

**ACCOUNTS_PAYABLE** (Vendor/Purchase Documents):
- VENDOR_INVOICE: Purchase invoices & debit notes from suppliers
- VENDOR_CREDIT_NOTE: Credit notes from suppliers
- PURCHASE_ORDER: Purchase orders issued
- DELIVERY_NOTE: Goods received notes, delivery receipts
- VENDOR_STATEMENT: Supplier statements of account
- VENDOR_QUOTATION: Quotations from suppliers

**ACCOUNTS_RECEIVABLE** (Customer/Sales Documents):
- SALES_INVOICE: Invoices & debit notes to customers
- SALES_CREDIT_NOTE: Credit notes to customers
- SALES_ORDER: Sales orders & quotations
- DELIVERY_ORDER: Delivery orders issued
- CUSTOMER_STATEMENT: Customer statements of account

**TREASURY** (Banking & Cash Management):
- BANK_STATEMENT: Monthly/periodic bank statements
- BANK_ADVICE: Debit/credit advices, TT advices, FD advices
- PAYMENT_VOUCHER: Payment vouchers, cheques
- RECEIPT_VOUCHER: Receipt vouchers
- LOAN_DOCUMENT: Loan agreements, facility letters

**TAX_COMPLIANCE** (Tax & Regulatory):
- GST_RETURN: GST F5/F7 returns & assessments
- INCOME_TAX: Form C/C-S, tax assessments, computations
- WITHHOLDING_TAX: WHT certificates (Form IR37)
- TAX_INVOICE: Tax invoices & receipts

**PAYROLL** (HR & Payroll):
- PAYSLIP: Employee payslips
- CPF_SUBMISSION: CPF contribution records
- IR8A: Annual IR8A/IR8S forms
- EXPENSE_CLAIM: Employee expense claims, timesheets

**CORPORATE_SECRETARIAL** (Corporate Governance):
- BIZFILE: ACRA BizFile extracts
- RESOLUTION: Board/shareholder resolutions
- REGISTER: Statutory registers (members, directors, charges)
- INCORPORATION: Constitution, incorporation cert, share certs
- ANNUAL_RETURN: Annual returns, statutory forms
- MEETING_MINUTES: AGM, EGM, board meeting minutes

**CONTRACTS** (Legal Agreements):
- VENDOR_CONTRACT: Supplier/service provider agreements, NDAs
- CUSTOMER_CONTRACT: Customer/client agreements
- EMPLOYMENT_CONTRACT: Employment agreements
- LEASE_AGREEMENT: Property/equipment leases, licenses

**FINANCIAL_REPORTS** (Reporting & Analysis):
- FINANCIAL_STATEMENT: Balance sheet, P&L, cash flow
- MANAGEMENT_REPORT: Trial balance, GL reports, management accounts
- AUDIT_REPORT: Auditor's report, supporting schedules

**INSURANCE** (Risk Management):
- INSURANCE_POLICY: Policies, certificates, renewals
- INSURANCE_CLAIM: Claim documents

**CORRESPONDENCE** (General Communications):
- LETTER: Business letters, memos, notices
- EMAIL: Email correspondence

**OTHER** (Uncategorized):
- MISCELLANEOUS: Documents that don't fit other categories
- SUPPORTING_DOCUMENT: Supporting/backup documents

## Home Currency Equivalent (IMPORTANT for Singapore Tax)
Many foreign currency invoices show SGD equivalent amounts for Singapore GST purposes.
Look for sections labeled:
- "Tax information", "For GST purposes", "Singapore Tax Information"
- "Total Charges (excluding GST)" in SGD
- "Total GST" in SGD
- "Total charges (including GST)" in SGD
- Exchange rate or conversion rate shown on document

If you find SGD equivalents on a foreign currency invoice:
- Extract them in "homeCurrencyEquivalent" object
- The document's printed exchange rate takes precedence over any calculated rate
- These amounts should be used for Singapore GST reporting

Example: A USD invoice showing "Total charges (including GST): 507.97 SGD"
{
  "homeCurrencyEquivalent": {
    "currency": "SGD",
    "exchangeRate": "1.2940",
    "subtotal": "465.48",
    "taxAmount": "41.89",
    "totalAmount": "507.97",
    "confidence": 0.95
  }
}

## Important Rules
- All monetary values should be decimal numbers as strings (e.g., "1234.56" or "-17.50" for negatives)
- Amounts in parentheses are NEGATIVE - convert (X) to -X
- Dates should be in YYYY-MM-DD format
- If a field is not visible or cannot be determined, use null
- The totalAmount field is required - estimate if necessary
- taxCode is REQUIRED for every line item - never leave it null
- Be precise with numbers - extract exactly as shown, don't round
- When extracting from Singapore invoices, assume SGD unless otherwise specified
- Always select both documentCategory AND documentSubCategory when possible
- ALWAYS look for and extract home currency equivalents on foreign currency invoices

## Line Item Aggregation (IMPORTANT for Receipts & Claims)
For certain document types, DO NOT extract every individual item as a separate line item.
Instead, aggregate items into meaningful categories for accounting purposes.

### CRITICAL: Always Consolidate Minor Adjustments
The following should NEVER appear as separate line items - always include them in the main line item amount:
- **Service Charge** - add to the main line item (e.g., F&B total should include service charge)
- **Rounding Adjustments** - include in the nearest appropriate line item
- **Discounts** - deduct from the relevant line item, don't show as negative line
- **Minor fees** (tray return charge, takeaway fee, etc.) - include in main line item
- **Tips/Gratuity** - include in the service line item unless separately invoiced

**Rationale**: These minor adjustments provide no accounting value when separated. For expense claims and receipts, what matters is the total spent per category, not the breakdown of charges vs adjustments.

### When to Aggregate:

**1. Restaurant/Dining Receipts**
- Create a SINGLE line item: "Food & Beverage" or "Meals"
- This amount should include: food, drinks, service charge, rounding, minor fees
- The line item amount = subtotal before GST (including service charge and adjustments)
- DO NOT list each food/drink item separately
- DO NOT create separate lines for service charge, rounding, or discounts

**2. Cafe/Coffee Shop Receipts**
- Create a SINGLE line: "Refreshments" or "Team Refreshments"
- Include all drinks, snacks, and any service/adjustment fees
- DO NOT list individual coffees, pastries, or fees separately

**3. Entertainment/Events**
- Create minimal lines by major category only: "Event Admission", "F&B", "Merchandise"
- Include booking fees, service fees, convenience fees in the main category
- DO NOT create separate lines for fees and adjustments

**4. Supermarket/Grocery Receipts**
- For office/pantry purchases: SINGLE line as "Office Pantry" or "Office Supplies"
- Include bag charges, rounding in the total
- For inventory: AGGREGATE by product category unless specifically for resale

**5. Hotel/Accommodation**
- Maximum 2-3 lines for major expense types:
  - "Room Charges" (all room nights + resort fees + service charges)
  - "Food & Beverage" (all F&B + service charges)
  - "Other Services" (laundry, internet, parking combined if applicable)
- DO NOT create separate lines for service charges, tourism taxes, or adjustments

**6. Transport/Parking**
- SINGLE line: "Parking" or "Transport"
- Include all fees, surcharges, admin fees in the total
- DO NOT separate booking fees, platform fees, etc.

**7. Petty Cash Claims/Expense Reports**
- Group by expense nature: "Office Supplies", "Transport", "Meals"
- Each category should be a single line with total amount

### When NOT to Aggregate (keep individual items):
- Official invoices for products/services purchased for resale
- Capital expenditure items (equipment, assets)
- Items that need individual tracking for warranty/support
- Professional services invoices with distinct billable services
- Inventory purchases for resale where item-level tracking is needed

### Aggregation Guidelines:
- **Minimize line items**: For receipts/claims, aim for 1-3 lines maximum
- Use clear, professional descriptions (e.g., "Food & Beverage", not "Various food items")
- The aggregated amount MUST equal the subtotal before GST (including all adjustments)
- GST should be calculated on the final aggregated subtotal
- Set quantity to 1 for aggregated items
- Set unitPrice equal to the aggregated amount
- **Never create lines for amounts under $5 that are adjustments/fees** - always consolidate them`;

  // Fetch COA context for intelligent account code suggestions
  const coaContext = await getCOAContextForExtraction(tenantId, companyId);
  if (coaContext) {
    extractionPrompt += `\n\n${coaContext}`;
    // Log COA context for debugging
    if (isAIDebugEnabled()) {
      const accountCount = (coaContext.match(/^- /gm) || []).length;
      log.info(`[ai-debug] COA context added to prompt: ${accountCount} accounts`);
    }
  } else if (isAIDebugEnabled()) {
    log.info('[ai-debug] No COA context available - account codes will use fallback logic');
  }

  // Append additional context if provided
  if (config.additionalContext) {
    extractionPrompt += `\n\n## Additional Context\n${config.additionalContext}`;
  }

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
      providerUsed: providerFromModel,
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
  const documentSubCategory: ExtractedField<DocumentSubCategory> | undefined = docSubCategory
    ? {
        value: docSubCategory.value as DocumentSubCategory,
        confidence: docSubCategory.confidence || 0.8,
      }
    : undefined;

  // Handle optional header fields with bbox
  const vendorNameField = extractFieldValue(data.vendorName);
  const customerNameField = extractFieldValue(data.customerName);
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
