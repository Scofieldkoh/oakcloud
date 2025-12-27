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
import type { ExtractionType, DocumentCategory, DocumentSubCategory } from '@/generated/prisma';
import { createRevision, type LineItemInput } from './document-revision.service';
import { transitionPipelineStatus, recordProcessingAttempt } from './document-processing.service';
import { checkForDuplicates, updateDuplicateStatus } from './duplicate-detection.service';
import { callAIWithConnector, getBestAvailableModelForTenant } from '@/lib/ai';
import type { AIModel } from '@/lib/ai/types';
import { storage } from '@/lib/storage';
import { hashBlake3 } from '@/lib/encryption';

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

export interface FieldExtractionResult {
  documentCategory: ExtractedField<DocumentCategory>;
  documentSubCategory?: ExtractedField<DocumentSubCategory>;
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
      documentSubCategory: extractionResult.documentSubCategory?.value,
      vendorName: extractionResult.vendorName?.value,
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
 * Extract fields using AI vision model
 */
async function performAIExtraction(
  pages: { pageNumber: number; storageKey: string | null; imageFingerprint: string | null }[],
  tenantId: string,
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
      "taxCode": { "value": "string (SR, ZR, ES, NA, TX, etc.)", "confidence": number },
      "accountCode": { "value": "string (e.g., 5000, 6000, 6100)", "confidence": number } | null
    }
  ],
  "overallConfidence": number between 0 and 1
}

## Singapore GST Tax Codes (REQUIRED for each line item)
You MUST assign a taxCode to EVERY line item based on these rules:
- **SR (Standard-Rated 9%)**: Most goods and services in Singapore. If supplier has GST registration number, default to SR.
- **ZR (Zero-Rated 0%)**: Exports, international services, prescribed goods
- **ES (Exempt Supply)**: Financial services, residential property sales/rentals, precious metals
- **NA (Not Applicable)**: Non-business transactions, private expenses, government fees/fines, no GST registration
- **TX (Taxable Purchases)**: Standard input tax claimable purchases
- **BL (Blocked Input Tax)**: Club subscriptions, medical expenses, motor vehicle expenses

Determination logic:
1. If GST/tax amount is shown on line item → SR (9% GST)
2. If explicitly marked as "0% GST" or "Zero-rated" → ZR
3. If no GST registration on document and local supplier → NA
4. If foreign supplier/service → ZR or NA depending on nature
5. When in doubt for taxable business expenses → SR

## Amount Validation Rules (CRITICAL)
1. **Line Item Calculation**: For each line item, verify: quantity × unitPrice = amount (with small rounding tolerance)
2. **Subtotal Validation**: Sum of all line item amounts MUST equal subtotal
3. **Tax Calculation**: taxAmount should be approximately 9% of subtotal for SR items (or sum of line item gstAmounts)
4. **Total Validation**: subtotal + taxAmount MUST equal totalAmount

If the document shows values that don't add up:
- Extract the values as shown on the document
- Lower your confidence score for affected fields
- The document's printed values take precedence over calculations

## Line Item GST Amount Calculation
For each line item with taxCode = "SR":
- gstAmount = amount × 0.09 (rounded to 2 decimal places)
- If the document shows a different GST amount per line, use the document's value

## Negative Amounts (Credits/Refunds) - CRITICAL
Amounts shown in parentheses like ($17.50) or (17.50) represent NEGATIVE values:
- Extract as negative decimal: "($17.50)" → "-17.50"
- Extract as negative decimal: "(17.50)" → "-17.50"
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

## Important Rules
- All monetary values should be decimal numbers as strings (e.g., "1234.56" or "-17.50" for negatives)
- Amounts in parentheses are NEGATIVE - convert (X) to -X
- Dates should be in YYYY-MM-DD format
- If a field is not visible or cannot be determined, use null
- The totalAmount field is required - estimate if necessary
- taxCode is REQUIRED for every line item - never leave it null
- Be precise with numbers - extract exactly as shown, don't round
- When extracting from Singapore invoices, assume SGD unless otherwise specified
- Always select both documentCategory AND documentSubCategory when possible`;

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

    // Determine tax code with intelligent fallback
    let taxCode = taxCodeField?.value;
    let taxCodeConfidence = taxCodeField?.confidence || 0.7;

    if (!taxCode) {
      // Apply fallback logic based on document context
      if (gstAmountField?.value && parseFloat(gstAmountField.value) > 0) {
        // Has GST amount → Standard-Rated
        taxCode = 'SR';
        taxCodeConfidence = 0.85;
      } else if (hasGstRegistration) {
        // Supplier is GST registered → default to Standard-Rated
        taxCode = 'SR';
        taxCodeConfidence = 0.75;
      } else {
        // No GST registration → Not Applicable
        taxCode = 'NA';
        taxCodeConfidence = 0.6;
      }
    }

    // Calculate GST amount if not provided but tax code is SR
    let gstAmount = gstAmountField?.value;
    let gstAmountConfidence = gstAmountField?.confidence || 0.8;

    if (!gstAmount && taxCode === 'SR' && amountField?.value) {
      // Calculate 9% GST for standard-rated items
      const amount = parseFloat(amountField.value);
      if (!isNaN(amount) && amount > 0) {
        gstAmount = (amount * 0.09).toFixed(2);
        gstAmountConfidence = 0.7; // Lower confidence for calculated values
      }
    }

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
      gstAmount: gstAmount ? { value: gstAmount, confidence: gstAmountConfidence } : undefined,
      taxCode: { value: taxCode, confidence: taxCodeConfidence },
      accountCode: accountCodeField ? { value: accountCodeField.value, confidence: accountCodeField.confidence } : undefined,
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
