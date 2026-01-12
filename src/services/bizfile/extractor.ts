/**
 * BizFile Extractor Service
 *
 * Handles AI-based extraction of BizFile documents using vision models.
 */

import { createLogger } from '@/lib/logger';
import {
  callAI,
  callAIWithConnector,
  getBestAvailableModel,
  getBestAvailableModelForTenant,
  getModelConfig,
} from '@/lib/ai';
import type { AIModel, AIImageInput } from '@/lib/ai';
import type {
  ExtractedBizFileData,
  BizFileVisionInput,
  BizFileExtractionOptions,
  BizFileExtractionResult,
} from './types';

const log = createLogger('bizfile-extractor');

// ============================================================================
// AI Prompts
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a document extraction specialist with expertise in analyzing Singapore ACRA BizFile documents. You have excellent vision capabilities and can accurately read and extract information from document images.

Your task is to carefully analyze the provided document image and extract all relevant information with high accuracy and confidence.`;

const EXTRACTION_PROMPT = `Extract all relevant information from this Singapore ACRA BizFile document image.

Return a JSON object with the following structure (include only fields that have data):

{
  "entityDetails": {
    "uen": "string - Unique Entity Number",
    "name": "string - Current company name",
    "formerName": "string - Previous company name if any (from 'former_name' field)",
    "dateOfNameChange": "YYYY-MM-DD - Date when name was changed",
    "formerNames": [{ "name": "string", "effectiveFrom": "YYYY-MM-DD", "effectiveTo": "YYYY-MM-DD" }],
    "entityType": "PRIVATE_LIMITED | EXEMPTED_PRIVATE_LIMITED | PUBLIC_LIMITED | SOLE_PROPRIETORSHIP | PARTNERSHIP | LIMITED_PARTNERSHIP | LIMITED_LIABILITY_PARTNERSHIP | FOREIGN_COMPANY | VARIABLE_CAPITAL_COMPANY | OTHER (use EXEMPTED_PRIVATE_LIMITED for 'Exempt Private Company Limited by Shares')",
    "status": "LIVE | STRUCK_OFF | WINDING_UP | DISSOLVED | IN_LIQUIDATION | IN_RECEIVERSHIP | AMALGAMATED | CONVERTED | OTHER",
    "statusDate": "YYYY-MM-DD - Date when status became effective (from 'status_date')",
    "incorporationDate": "YYYY-MM-DD",
    "registrationDate": "YYYY-MM-DD"
  },
  "ssicActivities": {
    "primary": { "code": "string", "description": "string" },
    "secondary": { "code": "string", "description": "string" }
  },
  "registeredAddress": {
    "block": "string",
    "streetName": "string",
    "level": "string",
    "unit": "string",
    "buildingName": "string",
    "postalCode": "string",
    "effectiveFrom": "YYYY-MM-DD - Date of address (from 'date_of_address')"
  },
  "mailingAddress": { ... same as registeredAddress },
  "paidUpCapital": {
    "amount": number,
    "currency": "SGD"
  },
  "issuedCapital": {
    "amount": number,
    "currency": "SGD"
  },
  "shareCapital": [{
    "shareClass": "ORDINARY | PREFERENCE | etc",
    "currency": "SGD",
    "numberOfShares": number,
    "parValue": number,
    "totalValue": number,
    "isPaidUp": boolean,
    "isTreasury": boolean
  }],
  "treasuryShares": {
    "numberOfShares": number,
    "currency": "string"
  },
  "shareholders": [{
    "name": "string",
    "type": "INDIVIDUAL | CORPORATE",
    "identificationType": "NRIC | FIN | PASSPORT | UEN | OTHER",
    "identificationNumber": "string",
    "nationality": "string",
    "placeOfOrigin": "string - For corporate shareholders",
    "address": "string - Full address",
    "shareClass": "ORDINARY",
    "numberOfShares": number,
    "percentageHeld": number,
    "currency": "SGD"
  }],
  "officers": [{
    "name": "string",
    "role": "DIRECTOR | MANAGING_DIRECTOR | ALTERNATE_DIRECTOR | SECRETARY | CEO | CFO | AUDITOR | LIQUIDATOR | RECEIVER | JUDICIAL_MANAGER",
    "identificationType": "NRIC | FIN | PASSPORT",
    "identificationNumber": "string",
    "nationality": "string",
    "address": "string - Full address",
    "appointmentDate": "YYYY-MM-DD",
    "cessationDate": "YYYY-MM-DD or null if current"
  }],
  "auditor": {
    "name": "string",
    "address": "string",
    "appointmentDate": "YYYY-MM-DD"
  },
  "financialYear": {
    "endDay": number (1-31),
    "endMonth": number (1-12)
  },
  "homeCurrency": "string - Company's home currency (default SGD)",
  "compliance": {
    "lastAgmDate": "YYYY-MM-DD (from 'date_of_last_agm')",
    "lastArFiledDate": "YYYY-MM-DD (from 'date_of_last_annual_return')",
    "fyeAsAtLastAr": "YYYY-MM-DD (from 'financial_year_end_as_at_last_ar')",
    "accountsDueDate": "YYYY-MM-DD"
  },
  "charges": [{
    "chargeNumber": "string (from 'charge_number')",
    "chargeType": "string",
    "description": "string",
    "chargeHolderName": "string (from 'chargee')",
    "amountSecured": number (only if numeric),
    "amountSecuredText": "string (use for text like 'All Monies')",
    "currency": "SGD",
    "registrationDate": "YYYY-MM-DD (from 'date_registered')",
    "dischargeDate": "YYYY-MM-DD or null if not discharged"
  }],
  "documentMetadata": {
    "receiptNo": "string - The ACRA receipt number (e.g., 'ACRA250807001467')",
    "receiptDate": "YYYY-MM-DD - Date the BizFile was generated"
  }
}

Important:
- Parse all dates in YYYY-MM-DD format
- Include all officers (current and ceased)
- Include all shareholders with their nationality and address
- Extract share capital structure completely including treasury shares
- IMPORTANT: Extract paidUpCapital and issuedCapital amounts directly from the "PAID-UP CAPITAL" and "ISSUED/REGISTERED CAPITAL" sections in the document - do NOT calculate from share capital
- Mark cessation dates as null for current officers
- Include both primary and secondary SSIC codes if available
- Extract any charges/encumbrances registered against the company
- For charges with text amounts like "All Monies", use amountSecuredText field
- Extract status_date as the date when the company status became effective
- Read text carefully from the document image, even if it appears small or faded
- If text is unclear, make reasonable inferences based on document context
- IMPORTANT: Extract the receipt number and date from the END of the document, typically formatted as:
  RECEIPT NO. : ACRA250807001467
  DATE : 07 AUG 2025
  Parse the date format (DD MMM YYYY) into YYYY-MM-DD format for receiptDate
- For FREE BUSINESS PROFILE documents (no receipt number), use "FREE" as the receiptNo value

Respond ONLY with valid JSON, no markdown or explanation.`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the user prompt with optional additional context
 */
function buildUserPrompt(additionalContext?: string): string {
  let prompt = EXTRACTION_PROMPT;
  if (additionalContext?.trim()) {
    prompt += `\n\nAdditional context from user:\n${additionalContext.trim()}`;
  }
  return prompt;
}

/**
 * Clean AI response content by removing markdown code blocks
 * Some models (especially Claude) wrap JSON in ```json ... ``` blocks
 */
function cleanJsonResponse(content: string): string {
  let cleaned = content.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Also handle case where there's text before/after the JSON
  // Try to extract JSON object from the content
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  return cleaned;
}

/**
 * Parse and validate AI response
 */
function parseExtractionResponse(content: string): ExtractedBizFileData {
  let parsed: ExtractedBizFileData;

  // Clean the response (remove markdown code blocks, etc.)
  const cleanedContent = cleanJsonResponse(content);

  try {
    parsed = JSON.parse(cleanedContent) as ExtractedBizFileData;
  } catch {
    log.error('Failed to parse AI response:', content.substring(0, 500));
    log.error('Cleaned content:', cleanedContent.substring(0, 500));
    throw new Error('Failed to parse AI extraction response. The AI returned invalid JSON.');
  }

  // Basic validation of required fields
  if (!parsed.entityDetails?.uen || !parsed.entityDetails?.name) {
    throw new Error('AI extraction missing required fields (UEN or company name)');
  }

  return parsed;
}

// ============================================================================
// Main Extraction Functions
// ============================================================================

/**
 * Extract data from BizFile using AI vision (recommended for higher accuracy)
 *
 * This function sends the document directly to the AI model as an image,
 * allowing the model to visually analyze the document for better extraction accuracy.
 * Supports PDF, PNG, JPG, and other image formats.
 *
 * When a tenantId is provided, uses connector-aware AI resolution:
 * 1. First looks for tenant-specific AI connector
 * 2. Falls back to system connector (if tenant has access)
 * 3. Falls back to environment variables
 *
 * @param fileInput - The base64-encoded file with MIME type
 * @param options - Optional extraction options including model selection, context, and tenant ID
 * @returns Extracted data with model metadata
 */
export async function extractBizFileWithVision(
  fileInput: BizFileVisionInput,
  options?: BizFileExtractionOptions
): Promise<BizFileExtractionResult> {
  // Determine which model to use based on tenant context
  let modelId: AIModel | null;

  if (options?.tenantId !== undefined) {
    // Use connector-aware model resolution
    modelId = options.modelId || (await getBestAvailableModelForTenant(options.tenantId));
  } else {
    // Use environment-based model resolution
    modelId = options?.modelId || getBestAvailableModel();
  }

  if (!modelId) {
    throw new Error(
      'No AI provider configured. Please configure an AI connector for this tenant ' +
        'or set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY'
    );
  }

  const modelConfig = getModelConfig(modelId);

  log.info(`Using AI vision model: ${modelConfig.name} (${modelConfig.provider})`);
  log.info(`File type: ${fileInput.mimeType}, size: ${Math.round(fileInput.base64.length * 0.75 / 1024)}KB`);
  if (options?.tenantId !== undefined) {
    log.info(`Using connector-aware AI for tenant: ${options.tenantId || 'system'}`);
  }

  // Prepare the image input for the AI
  const images: AIImageInput[] = [
    {
      base64: fileInput.base64,
      mimeType: fileInput.mimeType,
    },
  ];

  // Build user prompt with optional context
  const userPrompt = buildUserPrompt(options?.additionalContext);

  // Call the appropriate AI service (connector-aware or direct)
  let response;
  if (options?.tenantId !== undefined) {
    // Use connector-aware AI call
    response = await callAIWithConnector({
      model: modelId,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      images,
      jsonMode: true,
      temperature: 0.1,
      tenantId: options.tenantId,
      userId: options.userId,
      operation: 'bizfile_extraction',
      usageMetadata: {
        companyId: options.companyId,
        documentId: options.documentId,
        extractionType: 'vision',
      },
    });
  } else {
    // Use direct AI call (environment variables)
    response = await callAI({
      model: modelId,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      images,
      jsonMode: true,
      temperature: 0.1,
    });
  }

  // Parse and validate the response
  const parsed = parseExtractionResponse(response.content);

  return {
    data: parsed,
    modelUsed: modelId,
    providerUsed: modelConfig.provider,
    usage: response.usage,
  };
}

/**
 * Extract data from BizFile PDF text using AI (legacy method)
 *
 * @deprecated Use extractBizFileWithVision for better accuracy
 * @param pdfText - The text content extracted from the BizFile PDF
 * @param options - Optional extraction options including model selection and tenant ID
 * @returns Extracted data with model metadata
 */
export async function extractBizFileData(
  pdfText: string,
  options?: BizFileExtractionOptions
): Promise<BizFileExtractionResult> {
  // Determine which model to use based on tenant context
  let modelId: AIModel | null;

  if (options?.tenantId !== undefined) {
    // Use connector-aware model resolution
    modelId = options.modelId || (await getBestAvailableModelForTenant(options.tenantId));
  } else {
    // Use environment-based model resolution
    modelId = options?.modelId || getBestAvailableModel();
  }

  if (!modelId) {
    throw new Error(
      'No AI provider configured. Please configure an AI connector for this tenant ' +
        'or set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY'
    );
  }

  const modelConfig = getModelConfig(modelId);

  log.info(`Using AI model (text mode): ${modelConfig.name} (${modelConfig.provider})`);

  // Build user prompt with optional context
  const basePrompt = buildUserPrompt(options?.additionalContext);
  const userPrompt = `${basePrompt}\n\nDocument text content:\n\n${pdfText}`;

  // Call the appropriate AI service (connector-aware or direct)
  let response;
  if (options?.tenantId !== undefined) {
    // Use connector-aware AI call
    response = await callAIWithConnector({
      model: modelId,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.1,
      tenantId: options.tenantId,
      userId: options.userId,
      operation: 'bizfile_extraction',
      usageMetadata: {
        companyId: options.companyId,
        documentId: options.documentId,
        extractionType: 'text',
      },
    });
  } else {
    // Use direct AI call (environment variables)
    response = await callAI({
      model: modelId,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0.1,
    });
  }

  // Parse and validate the response
  const parsed = parseExtractionResponse(response.content);

  return {
    data: parsed,
    modelUsed: modelId,
    providerUsed: modelConfig.provider,
    usage: response.usage,
  };
}
