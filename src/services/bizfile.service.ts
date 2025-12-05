import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { normalizeName, normalizeCompanyName, normalizeAddress } from '@/lib/utils';
import { findOrCreateContact, createCompanyContactRelation, type PrismaTransactionClient } from './contact.service';
import {
  callAI,
  callAIWithConnector,
  getBestAvailableModel,
  getBestAvailableModelForTenant,
  getModelConfig,
} from '@/lib/ai';
import type { AIModel, AIImageInput } from '@/lib/ai';
import type { EntityType, CompanyStatus, OfficerRole, ContactType, IdentificationType } from '@prisma/client';

const log = createLogger('bizfile');

// Type definitions for extracted BizFile data
export interface ExtractedBizFileData {
  entityDetails: {
    uen: string;
    name: string;
    formerName?: string;           // Single former name from BizFile
    dateOfNameChange?: string;     // Date when name was changed
    formerNames?: Array<{ name: string; effectiveFrom: string; effectiveTo?: string }>;
    entityType: string;
    status: string;
    statusDate?: string;           // Date when status became effective
    incorporationDate?: string;
    registrationDate?: string;
  };
  ssicActivities?: {
    primary?: { code: string; description: string };
    secondary?: { code: string; description: string };
  };
  registeredAddress?: {
    block?: string;
    streetName: string;
    level?: string;
    unit?: string;
    buildingName?: string;
    postalCode: string;
    effectiveFrom?: string;        // date_of_address from BizFile
  };
  mailingAddress?: {
    block?: string;
    streetName: string;
    level?: string;
    unit?: string;
    buildingName?: string;
    postalCode: string;
  };
  shareCapital?: Array<{
    shareClass: string;
    currency: string;
    numberOfShares: number;
    parValue?: number;
    totalValue: number;
    isPaidUp: boolean;
    isTreasury?: boolean;          // For treasury shares
  }>;
  treasuryShares?: {
    numberOfShares: number;
    currency?: string;
  };
  shareholders?: Array<{
    name: string;
    type: 'INDIVIDUAL' | 'CORPORATE';
    identificationType?: string;
    identificationNumber?: string;
    nationality?: string;
    placeOfOrigin?: string;        // For corporate shareholders
    address?: string;
    shareClass: string;
    numberOfShares: number;
    percentageHeld?: number;
    currency?: string;
  }>;
  officers?: Array<{
    name: string;
    role: string;
    identificationType?: string;
    identificationNumber?: string;
    nationality?: string;
    address?: string;
    appointmentDate?: string;
    cessationDate?: string;
  }>;
  auditor?: {
    name: string;
    address?: string;
    appointmentDate?: string;
  };
  financialYear?: {
    endDay: number;
    endMonth: number;
    fyeAsAtLastAr?: string;        // Financial year end as at last AR
  };
  homeCurrency?: string;           // Company's home currency
  compliance?: {
    lastAgmDate?: string;
    lastArFiledDate?: string;
    accountsDueDate?: string;
    fyeAsAtLastAr?: string;        // financial_year_end_as_at_last_ar
  };
  charges?: Array<{
    chargeNumber?: string;
    chargeType?: string;
    description?: string;
    chargeHolderName: string;
    amountSecured?: number;
    amountSecuredText?: string;    // For text values like "All Monies"
    currency?: string;
    registrationDate?: string;
    dischargeDate?: string;
  }>;
}

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
    "entityType": "PRIVATE_LIMITED | PUBLIC_LIMITED | SOLE_PROPRIETORSHIP | PARTNERSHIP | LIMITED_PARTNERSHIP | LIMITED_LIABILITY_PARTNERSHIP | FOREIGN_COMPANY | VARIABLE_CAPITAL_COMPANY | OTHER",
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
    "role": "DIRECTOR | ALTERNATE_DIRECTOR | SECRETARY | CEO | CFO | AUDITOR | LIQUIDATOR | RECEIVER | JUDICIAL_MANAGER",
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
  }]
}

Important:
- Parse all dates in YYYY-MM-DD format
- Include all officers (current and ceased)
- Include all shareholders with their nationality and address
- Extract share capital structure completely including treasury shares
- Mark cessation dates as null for current officers
- Include both primary and secondary SSIC codes if available
- Extract any charges/encumbrances registered against the company
- For charges with text amounts like "All Monies", use amountSecuredText field
- Extract status_date as the date when the company status became effective
- Read text carefully from the document image, even if it appears small or faded
- If text is unclear, make reasonable inferences based on document context

Respond ONLY with valid JSON, no markdown or explanation.`;

/**
 * Options for BizFile extraction
 */
export interface BizFileExtractionOptions {
  /** AI model to use for extraction (optional, uses best available if not specified) */
  modelId?: AIModel;
  /** Additional context to provide to the AI for better extraction */
  additionalContext?: string;
  /** Tenant ID for connector-aware AI resolution (uses tenant's configured AI provider) */
  tenantId?: string | null;
  /** User ID who triggered the extraction (for usage tracking) */
  userId?: string;
  /** Company ID being extracted (for usage tracking) */
  companyId?: string;
  /** Document ID being processed (for usage tracking) */
  documentId?: string;
}

/**
 * Input for vision-based BizFile extraction
 */
export interface BizFileVisionInput {
  /** Base64-encoded file data */
  base64: string;
  /** MIME type of the file (e.g., 'application/pdf', 'image/png', 'image/jpeg') */
  mimeType: string;
}

/**
 * Result of BizFile extraction including metadata
 */
export interface BizFileExtractionResult {
  data: ExtractedBizFileData;
  modelUsed: AIModel;
  providerUsed: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

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

function mapEntityType(type: string): EntityType {
  const mapping: Record<string, EntityType> = {
    PRIVATE_LIMITED: 'PRIVATE_LIMITED',
    'PRIVATE LIMITED': 'PRIVATE_LIMITED',
    PUBLIC_LIMITED: 'PUBLIC_LIMITED',
    'PUBLIC LIMITED': 'PUBLIC_LIMITED',
    SOLE_PROPRIETORSHIP: 'SOLE_PROPRIETORSHIP',
    'SOLE PROPRIETORSHIP': 'SOLE_PROPRIETORSHIP',
    PARTNERSHIP: 'PARTNERSHIP',
    LIMITED_PARTNERSHIP: 'LIMITED_PARTNERSHIP',
    'LIMITED PARTNERSHIP': 'LIMITED_PARTNERSHIP',
    LIMITED_LIABILITY_PARTNERSHIP: 'LIMITED_LIABILITY_PARTNERSHIP',
    LLP: 'LIMITED_LIABILITY_PARTNERSHIP',
    FOREIGN_COMPANY: 'FOREIGN_COMPANY',
    'FOREIGN COMPANY': 'FOREIGN_COMPANY',
    VARIABLE_CAPITAL_COMPANY: 'VARIABLE_CAPITAL_COMPANY',
    VCC: 'VARIABLE_CAPITAL_COMPANY',
  };
  return mapping[type.toUpperCase()] || 'OTHER';
}

function mapCompanyStatus(status: string): CompanyStatus {
  const mapping: Record<string, CompanyStatus> = {
    LIVE: 'LIVE',
    'LIVE COMPANY': 'LIVE',
    STRUCK_OFF: 'STRUCK_OFF',
    'STRUCK OFF': 'STRUCK_OFF',
    WINDING_UP: 'WINDING_UP',
    'WINDING UP': 'WINDING_UP',
    DISSOLVED: 'DISSOLVED',
    IN_LIQUIDATION: 'IN_LIQUIDATION',
    'IN LIQUIDATION': 'IN_LIQUIDATION',
    IN_RECEIVERSHIP: 'IN_RECEIVERSHIP',
    'IN RECEIVERSHIP': 'IN_RECEIVERSHIP',
    AMALGAMATED: 'AMALGAMATED',
    CONVERTED: 'CONVERTED',
  };
  return mapping[status.toUpperCase()] || 'OTHER';
}

function mapOfficerRole(role: string): OfficerRole {
  const mapping: Record<string, OfficerRole> = {
    DIRECTOR: 'DIRECTOR',
    MANAGING_DIRECTOR: 'MANAGING_DIRECTOR',
    'MANAGING DIRECTOR': 'MANAGING_DIRECTOR',
    ALTERNATE_DIRECTOR: 'ALTERNATE_DIRECTOR',
    'ALTERNATE DIRECTOR': 'ALTERNATE_DIRECTOR',
    SECRETARY: 'SECRETARY',
    'COMPANY SECRETARY': 'SECRETARY',
    CEO: 'CEO',
    'CHIEF EXECUTIVE OFFICER': 'CEO',
    CFO: 'CFO',
    'CHIEF FINANCIAL OFFICER': 'CFO',
    AUDITOR: 'AUDITOR',
    LIQUIDATOR: 'LIQUIDATOR',
    RECEIVER: 'RECEIVER',
    JUDICIAL_MANAGER: 'JUDICIAL_MANAGER',
    'JUDICIAL MANAGER': 'JUDICIAL_MANAGER',
  };
  return mapping[role.toUpperCase()] || 'DIRECTOR';
}

function mapContactType(type: string): ContactType {
  return type.toUpperCase() === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL';
}

function mapIdentificationType(type: string | undefined): IdentificationType | null {
  if (!type) return null;
  const mapping: Record<string, IdentificationType> = {
    NRIC: 'NRIC',
    FIN: 'FIN',
    PASSPORT: 'PASSPORT',
    UEN: 'UEN',
  };
  return mapping[type.toUpperCase()] || 'OTHER';
}

function buildFullAddress(addr: {
  block?: string;
  streetName: string;
  level?: string;
  unit?: string;
  buildingName?: string;
  postalCode: string;
}): string {
  const parts: string[] = [];
  if (addr.block) parts.push(addr.block);
  parts.push(addr.streetName);
  if (addr.level && addr.unit) {
    parts.push(`#${addr.level}-${addr.unit}`);
  } else if (addr.unit) {
    parts.push(`#${addr.unit}`);
  }
  if (addr.buildingName) parts.push(addr.buildingName);
  parts.push(`Singapore ${addr.postalCode}`);
  return normalizeAddress(parts.join(' '));
}

/**
 * Normalize extracted BizFile data before saving to database
 * Applies proper casing to names, company names, and addresses
 */
export function normalizeExtractedData(data: ExtractedBizFileData): ExtractedBizFileData {
  const normalized = { ...data };

  // Normalize entity details
  if (normalized.entityDetails) {
    normalized.entityDetails = {
      ...normalized.entityDetails,
      name: normalizeCompanyName(normalized.entityDetails.name) || normalized.entityDetails.name,
      formerName: normalized.entityDetails.formerName
        ? normalizeCompanyName(normalized.entityDetails.formerName)
        : undefined,
    };

    // Normalize former names array
    if (normalized.entityDetails.formerNames) {
      normalized.entityDetails.formerNames = normalized.entityDetails.formerNames.map((fn) => ({
        ...fn,
        name: normalizeCompanyName(fn.name) || fn.name,
      }));
    }
  }

  // Normalize SSIC descriptions (but not codes)
  if (normalized.ssicActivities) {
    if (normalized.ssicActivities.primary?.description) {
      normalized.ssicActivities.primary.description = normalizeCompanyName(
        normalized.ssicActivities.primary.description
      ) || normalized.ssicActivities.primary.description;
    }
    if (normalized.ssicActivities.secondary?.description) {
      normalized.ssicActivities.secondary.description = normalizeCompanyName(
        normalized.ssicActivities.secondary.description
      ) || normalized.ssicActivities.secondary.description;
    }
  }

  // Normalize addresses
  if (normalized.registeredAddress) {
    normalized.registeredAddress = {
      ...normalized.registeredAddress,
      streetName: normalizeAddress(normalized.registeredAddress.streetName) || normalized.registeredAddress.streetName,
      buildingName: normalized.registeredAddress.buildingName
        ? normalizeAddress(normalized.registeredAddress.buildingName)
        : undefined,
    };
  }

  if (normalized.mailingAddress) {
    normalized.mailingAddress = {
      ...normalized.mailingAddress,
      streetName: normalizeAddress(normalized.mailingAddress.streetName) || normalized.mailingAddress.streetName,
      buildingName: normalized.mailingAddress.buildingName
        ? normalizeAddress(normalized.mailingAddress.buildingName)
        : undefined,
    };
  }

  // Normalize officers
  if (normalized.officers) {
    normalized.officers = normalized.officers.map((officer) => ({
      ...officer,
      name: normalizeName(officer.name) || officer.name,
      nationality: officer.nationality ? normalizeCompanyName(officer.nationality) : undefined,
      address: officer.address ? normalizeAddress(officer.address) : undefined,
    }));
  }

  // Normalize shareholders
  if (normalized.shareholders) {
    normalized.shareholders = normalized.shareholders.map((shareholder) => ({
      ...shareholder,
      name: shareholder.type === 'CORPORATE'
        ? normalizeCompanyName(shareholder.name) || shareholder.name
        : normalizeName(shareholder.name) || shareholder.name,
      nationality: shareholder.nationality ? normalizeCompanyName(shareholder.nationality) : undefined,
      placeOfOrigin: shareholder.placeOfOrigin ? normalizeCompanyName(shareholder.placeOfOrigin) : undefined,
      address: shareholder.address ? normalizeAddress(shareholder.address) : undefined,
    }));
  }

  // Normalize auditor
  if (normalized.auditor) {
    normalized.auditor = {
      ...normalized.auditor,
      name: normalizeCompanyName(normalized.auditor.name) || normalized.auditor.name,
      address: normalized.auditor.address ? normalizeAddress(normalized.auditor.address) : undefined,
    };
  }

  // Normalize charges
  if (normalized.charges) {
    normalized.charges = normalized.charges.map((charge) => ({
      ...charge,
      chargeHolderName: normalizeCompanyName(charge.chargeHolderName) || charge.chargeHolderName,
      description: charge.description ? normalizeCompanyName(charge.description) : undefined,
    }));
  }

  return normalized;
}

/**
 * Field difference entry for BizFile update comparison
 */
export interface BizFileDiffEntry {
  field: string;
  label: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
  category: 'entity' | 'ssic' | 'address' | 'compliance' | 'capital';
}

/**
 * Extracted officer from BizFile
 */
export interface ExtractedOfficerData {
  name: string;
  role: string;
  identificationType?: string;
  identificationNumber?: string;
  nationality?: string;
  address?: string;
  appointmentDate?: string;
  cessationDate?: string;
}

/**
 * Extracted shareholder from BizFile
 */
export interface ExtractedShareholderData {
  name: string;
  type: 'INDIVIDUAL' | 'CORPORATE';
  identificationType?: string;
  identificationNumber?: string;
  nationality?: string;
  placeOfOrigin?: string;
  address?: string;
  shareClass: string;
  numberOfShares: number;
  percentageHeld?: number;
  currency?: string;
}

/**
 * Officer diff entry for BizFile update comparison
 */
export interface OfficerDiffEntry {
  type: 'added' | 'updated' | 'potentially_ceased';
  officerId?: string;
  name: string;
  role: OfficerRole;
  changes?: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }>;
  extractedData?: ExtractedOfficerData;
  matchConfidence?: 'high' | 'medium' | 'low';
}

/**
 * Shareholder diff entry for BizFile update comparison
 */
export interface ShareholderDiffEntry {
  type: 'added' | 'removed' | 'updated';
  shareholderId?: string;
  name: string;
  shareholderType: 'INDIVIDUAL' | 'CORPORATE';
  changes?: Array<{ field: string; label: string; oldValue: string | number | null; newValue: string | number | null }>;
  shareholdingChanges?: {
    shareClass?: { old: string; new: string };
    numberOfShares?: { old: number; new: number };
  };
  extractedData?: ExtractedShareholderData;
  matchConfidence?: 'high' | 'medium' | 'low';
}

/**
 * Officer action from UI for processing updates
 */
export interface OfficerAction {
  officerId: string;
  action: 'cease' | 'follow_up';
  cessationDate?: string;
}

/**
 * Extended diff result including officers and shareholders
 */
export interface ExtendedBizFileDiffResult {
  hasDifferences: boolean;
  differences: BizFileDiffEntry[];
  existingCompany: { name: string; uen: string };
  officerDiffs: OfficerDiffEntry[];
  shareholderDiffs: ShareholderDiffEntry[];
  summary: {
    officersAdded: number;
    officersUpdated: number;
    officersPotentiallyCeased: number;
    shareholdersAdded: number;
    shareholdersUpdated: number;
    shareholdersRemoved: number;
  };
}

/**
 * Match extracted officer to existing officers
 */
function matchOfficer(
  extracted: ExtractedOfficerData,
  existingOfficers: Array<{ id: string; name: string; role: OfficerRole; identificationType: IdentificationType | null; identificationNumber: string | null; isCurrent: boolean }>
): { officer: typeof existingOfficers[number] | null; confidence: 'high' | 'medium' | 'low' } {
  // Priority 1: Match by identification (NRIC/FIN/Passport)
  if (extracted.identificationNumber && extracted.identificationType) {
    const idMatch = existingOfficers.find(o =>
      o.identificationNumber?.toUpperCase() === extracted.identificationNumber?.toUpperCase() &&
      o.identificationType === mapIdentificationType(extracted.identificationType)
    );
    if (idMatch) return { officer: idMatch, confidence: 'high' };
  }

  // Priority 2: Match by name + role
  const extractedRole = mapOfficerRole(extracted.role);
  const nameMatch = existingOfficers.find(o =>
    normalizeName(o.name)?.toLowerCase() === normalizeName(extracted.name)?.toLowerCase() &&
    o.role === extractedRole &&
    o.isCurrent
  );
  if (nameMatch) return { officer: nameMatch, confidence: 'medium' };

  return { officer: null, confidence: 'low' };
}

/**
 * Match extracted shareholder to existing shareholders
 */
function matchShareholder(
  extracted: ExtractedShareholderData,
  existingShareholders: Array<{ id: string; name: string; shareholderType: ContactType; identificationType: IdentificationType | null; identificationNumber: string | null; isCurrent: boolean; shareClass: string; numberOfShares: number }>
): { shareholder: typeof existingShareholders[number] | null; confidence: 'high' | 'medium' | 'low' } {
  const extractedType = extracted.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL';

  // Priority 1: Match by identification
  if (extracted.identificationNumber) {
    const idMatch = existingShareholders.find(s =>
      s.identificationNumber?.toUpperCase() === extracted.identificationNumber?.toUpperCase() &&
      s.shareholderType === extractedType &&
      s.isCurrent
    );
    if (idMatch) return { shareholder: idMatch, confidence: 'high' };
  }

  // Priority 2: Match by name
  const normalizedName = extractedType === 'CORPORATE'
    ? normalizeCompanyName(extracted.name)?.toLowerCase()
    : normalizeName(extracted.name)?.toLowerCase();

  const nameMatch = existingShareholders.find(s => {
    const existingNormalized = s.shareholderType === 'CORPORATE'
      ? normalizeCompanyName(s.name)?.toLowerCase()
      : normalizeName(s.name)?.toLowerCase();
    return existingNormalized === normalizedName && s.shareholderType === extractedType && s.isCurrent;
  });
  if (nameMatch) return { shareholder: nameMatch, confidence: 'medium' };

  return { shareholder: null, confidence: 'low' };
}

/**
 * Generate a diff between existing company data and extracted BizFile data
 * Only returns fields that have actual differences
 */
export async function generateBizFileDiff(
  existingCompanyId: string,
  extractedData: ExtractedBizFileData,
  tenantId: string
): Promise<ExtendedBizFileDiffResult> {
  const company = await prisma.company.findFirst({
    where: { id: existingCompanyId, tenantId },
    include: {
      addresses: { where: { isCurrent: true } },
      officers: { where: { isCurrent: true } },
      shareholders: { where: { isCurrent: true } },
    },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const differences: BizFileDiffEntry[] = [];
  const { entityDetails, ssicActivities, registeredAddress, compliance, financialYear } = extractedData;

  // Helper to format date for display
  const formatDate = (date: Date | string | null | undefined): string | null => {
    if (!date) return null;
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
  };

  // Compare entity details
  const entityComparisons: Array<{ field: string; label: string; oldVal: unknown; newVal: unknown }> = [
    { field: 'name', label: 'Company Name', oldVal: company.name, newVal: entityDetails.name },
    { field: 'formerName', label: 'Former Name', oldVal: company.formerName, newVal: entityDetails.formerName },
    { field: 'entityType', label: 'Entity Type', oldVal: company.entityType, newVal: mapEntityType(entityDetails.entityType) },
    { field: 'status', label: 'Status', oldVal: company.status, newVal: mapCompanyStatus(entityDetails.status) },
    { field: 'statusDate', label: 'Status Date', oldVal: formatDate(company.statusDate), newVal: entityDetails.statusDate },
    { field: 'incorporationDate', label: 'Incorporation Date', oldVal: formatDate(company.incorporationDate), newVal: entityDetails.incorporationDate },
  ];

  for (const { field, label, oldVal, newVal } of entityComparisons) {
    const oldStr = oldVal?.toString() || null;
    const newStr = newVal?.toString() || null;
    if (oldStr !== newStr && (oldStr || newStr)) {
      differences.push({ field, label, oldValue: oldStr, newValue: newStr, category: 'entity' });
    }
  }

  // Compare SSIC activities
  if (ssicActivities) {
    const ssicComparisons: Array<{ field: string; label: string; oldVal: unknown; newVal: unknown }> = [
      { field: 'primarySsicCode', label: 'Primary SSIC Code', oldVal: company.primarySsicCode, newVal: ssicActivities.primary?.code },
      { field: 'primarySsicDescription', label: 'Primary SSIC Description', oldVal: company.primarySsicDescription, newVal: ssicActivities.primary?.description },
      { field: 'secondarySsicCode', label: 'Secondary SSIC Code', oldVal: company.secondarySsicCode, newVal: ssicActivities.secondary?.code },
      { field: 'secondarySsicDescription', label: 'Secondary SSIC Description', oldVal: company.secondarySsicDescription, newVal: ssicActivities.secondary?.description },
    ];

    for (const { field, label, oldVal, newVal } of ssicComparisons) {
      const oldStr = oldVal?.toString() || null;
      const newStr = newVal?.toString() || null;
      if (oldStr !== newStr && (oldStr || newStr)) {
        differences.push({ field, label, oldValue: oldStr, newValue: newStr, category: 'ssic' });
      }
    }
  }

  // Compare registered address
  if (registeredAddress) {
    const currentAddress = company.addresses.find(a => a.addressType === 'REGISTERED_OFFICE');
    const newFullAddress = buildFullAddress(registeredAddress);
    const oldFullAddress = currentAddress?.fullAddress || null;

    if (oldFullAddress !== newFullAddress) {
      differences.push({
        field: 'registeredAddress',
        label: 'Registered Address',
        oldValue: oldFullAddress,
        newValue: newFullAddress,
        category: 'address',
      });
    }
  }

  // Compare compliance fields
  if (compliance) {
    const complianceComparisons: Array<{ field: string; label: string; oldVal: unknown; newVal: unknown }> = [
      { field: 'lastAgmDate', label: 'Last AGM Date', oldVal: formatDate(company.lastAgmDate), newVal: compliance.lastAgmDate },
      { field: 'lastArFiledDate', label: 'Last AR Filed Date', oldVal: formatDate(company.lastArFiledDate), newVal: compliance.lastArFiledDate },
      { field: 'accountsDueDate', label: 'Accounts Due Date', oldVal: formatDate(company.accountsDueDate), newVal: compliance.accountsDueDate },
    ];

    for (const { field, label, oldVal, newVal } of complianceComparisons) {
      const oldStr = oldVal?.toString() || null;
      const newStr = newVal?.toString() || null;
      if (oldStr !== newStr && (oldStr || newStr)) {
        differences.push({ field, label, oldValue: oldStr, newValue: newStr, category: 'compliance' });
      }
    }
  }

  // Compare financial year
  if (financialYear) {
    if (company.financialYearEndDay !== financialYear.endDay || company.financialYearEndMonth !== financialYear.endMonth) {
      const oldFye = company.financialYearEndDay && company.financialYearEndMonth
        ? `Day ${company.financialYearEndDay}, Month ${company.financialYearEndMonth}`
        : null;
      const newFye = `Day ${financialYear.endDay}, Month ${financialYear.endMonth}`;
      differences.push({
        field: 'financialYearEnd',
        label: 'Financial Year End',
        oldValue: oldFye,
        newValue: newFye,
        category: 'compliance',
      });
    }
  }

  // Compare share capital
  if (extractedData.shareCapital?.length) {
    // Calculate new capital values
    const newPaidUp = extractedData.shareCapital
      .filter((c) => c.isPaidUp && !c.isTreasury)
      .reduce((sum, c) => sum + c.totalValue, 0);
    const newIssued = extractedData.shareCapital
      .filter((c) => !c.isTreasury)
      .reduce((sum, c) => sum + c.totalValue, 0);
    const newCurrency = extractedData.shareCapital[0]?.currency || 'SGD';

    const oldPaidUp = company.paidUpCapitalAmount ? Number(company.paidUpCapitalAmount) : null;
    const oldIssued = company.issuedCapitalAmount ? Number(company.issuedCapitalAmount) : null;

    if (oldPaidUp !== newPaidUp) {
      differences.push({
        field: 'paidUpCapital',
        label: 'Paid Up Capital',
        oldValue: oldPaidUp ? `${company.paidUpCapitalCurrency || 'SGD'} ${oldPaidUp.toLocaleString()}` : null,
        newValue: `${newCurrency} ${newPaidUp.toLocaleString()}`,
        category: 'capital',
      });
    }

    if (oldIssued !== newIssued) {
      differences.push({
        field: 'issuedCapital',
        label: 'Issued Capital',
        oldValue: oldIssued ? `${company.issuedCapitalCurrency || 'SGD'} ${oldIssued.toLocaleString()}` : null,
        newValue: `${newCurrency} ${newIssued.toLocaleString()}`,
        category: 'capital',
      });
    }
  }

  // Generate officer diffs
  const officerDiffs: OfficerDiffEntry[] = [];
  const existingOfficers = company.officers;
  const extractedOfficers = extractedData.officers || [];
  const matchedExistingOfficerIds = new Set<string>();

  for (const extractedOfficer of extractedOfficers) {
    // Skip officers with cessation dates (they are already ceased)
    if (extractedOfficer.cessationDate) continue;

    const matchResult = matchOfficer(extractedOfficer, existingOfficers);

    if (matchResult.officer) {
      matchedExistingOfficerIds.add(matchResult.officer.id);

      // Check for updates (role changes, dates)
      const changes: Array<{ field: string; label: string; oldValue: string | null; newValue: string | null }> = [];
      const extractedRole = mapOfficerRole(extractedOfficer.role);

      if (matchResult.officer.role !== extractedRole) {
        changes.push({
          field: 'role',
          label: 'Role',
          oldValue: matchResult.officer.role,
          newValue: extractedRole,
        });
      }

      if (changes.length > 0) {
        officerDiffs.push({
          type: 'updated',
          officerId: matchResult.officer.id,
          name: extractedOfficer.name,
          role: extractedRole,
          changes,
          extractedData: extractedOfficer,
          matchConfidence: matchResult.confidence,
        });
      }
    } else {
      // New officer
      officerDiffs.push({
        type: 'added',
        name: extractedOfficer.name,
        role: mapOfficerRole(extractedOfficer.role),
        extractedData: extractedOfficer,
        matchConfidence: 'low',
      });
    }
  }

  // Find potentially ceased officers (in DB but not in extracted data)
  for (const existingOfficer of existingOfficers) {
    if (!matchedExistingOfficerIds.has(existingOfficer.id)) {
      officerDiffs.push({
        type: 'potentially_ceased',
        officerId: existingOfficer.id,
        name: existingOfficer.name,
        role: existingOfficer.role,
        matchConfidence: 'high',
      });
    }
  }

  // Generate shareholder diffs
  const shareholderDiffs: ShareholderDiffEntry[] = [];
  const existingShareholders = company.shareholders;
  const extractedShareholders = extractedData.shareholders || [];
  const matchedExistingShareholderIds = new Set<string>();

  for (const extractedShareholder of extractedShareholders) {
    const matchResult = matchShareholder(extractedShareholder, existingShareholders);

    if (matchResult.shareholder) {
      matchedExistingShareholderIds.add(matchResult.shareholder.id);

      // Check for shareholding changes
      const changes: Array<{ field: string; label: string; oldValue: string | number | null; newValue: string | number | null }> = [];
      const shareholdingChanges: ShareholderDiffEntry['shareholdingChanges'] = {};

      if (matchResult.shareholder.shareClass !== (extractedShareholder.shareClass || 'ORDINARY')) {
        shareholdingChanges.shareClass = {
          old: matchResult.shareholder.shareClass,
          new: extractedShareholder.shareClass || 'ORDINARY',
        };
        changes.push({
          field: 'shareClass',
          label: 'Share Class',
          oldValue: matchResult.shareholder.shareClass,
          newValue: extractedShareholder.shareClass || 'ORDINARY',
        });
      }

      if (matchResult.shareholder.numberOfShares !== extractedShareholder.numberOfShares) {
        shareholdingChanges.numberOfShares = {
          old: matchResult.shareholder.numberOfShares,
          new: extractedShareholder.numberOfShares,
        };
        changes.push({
          field: 'numberOfShares',
          label: 'Number of Shares',
          oldValue: matchResult.shareholder.numberOfShares,
          newValue: extractedShareholder.numberOfShares,
        });
      }

      if (changes.length > 0) {
        shareholderDiffs.push({
          type: 'updated',
          shareholderId: matchResult.shareholder.id,
          name: extractedShareholder.name,
          shareholderType: extractedShareholder.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
          changes,
          shareholdingChanges: Object.keys(shareholdingChanges).length > 0 ? shareholdingChanges : undefined,
          extractedData: extractedShareholder,
          matchConfidence: matchResult.confidence,
        });
      }
    } else {
      // New shareholder
      shareholderDiffs.push({
        type: 'added',
        name: extractedShareholder.name,
        shareholderType: extractedShareholder.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
        extractedData: extractedShareholder,
        matchConfidence: 'low',
      });
    }
  }

  // Find removed shareholders (in DB but not in extracted data)
  for (const existingShareholder of existingShareholders) {
    if (!matchedExistingShareholderIds.has(existingShareholder.id)) {
      shareholderDiffs.push({
        type: 'removed',
        shareholderId: existingShareholder.id,
        name: existingShareholder.name,
        shareholderType: existingShareholder.shareholderType === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL',
        matchConfidence: 'high',
      });
    }
  }

  // Build summary
  const summary = {
    officersAdded: officerDiffs.filter(d => d.type === 'added').length,
    officersUpdated: officerDiffs.filter(d => d.type === 'updated').length,
    officersPotentiallyCeased: officerDiffs.filter(d => d.type === 'potentially_ceased').length,
    shareholdersAdded: shareholderDiffs.filter(d => d.type === 'added').length,
    shareholdersUpdated: shareholderDiffs.filter(d => d.type === 'updated').length,
    shareholdersRemoved: shareholderDiffs.filter(d => d.type === 'removed').length,
  };

  const hasDifferences = differences.length > 0 || officerDiffs.length > 0 || shareholderDiffs.length > 0;

  return {
    hasDifferences,
    differences,
    existingCompany: { name: company.name, uen: company.uen },
    officerDiffs,
    shareholderDiffs,
    summary,
  };
}

/**
 * Process BizFile extraction with selective updates (only changed fields)
 */
export async function processBizFileExtractionSelective(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string,
  existingCompanyId: string,
  officerActions?: OfficerAction[]
): Promise<{
  companyId: string;
  created: boolean;
  updatedFields: string[];
  officerChanges: { added: number; updated: number; ceased: number; followUp: number };
  shareholderChanges: { added: number; updated: number; removed: number };
}> {
  // Normalize all text fields before processing
  const normalizedData = normalizeExtractedData(extractedData);

  // Generate diff to determine what needs updating
  const diffResult = await generateBizFileDiff(existingCompanyId, normalizedData, tenantId);
  const { differences, officerDiffs, shareholderDiffs } = diffResult;

  // Initialize change counters
  const officerChanges = { added: 0, updated: 0, ceased: 0, followUp: 0 };
  const shareholderChanges = { added: 0, updated: 0, removed: 0 };

  if (!diffResult.hasDifferences) {
    // No changes needed, just update document reference
    await prisma.document.update({
      where: { id: documentId },
      data: {
        companyId: existingCompanyId,
        extractionStatus: 'COMPLETED',
        extractedAt: new Date(),
        extractedData: normalizedData as object,
      },
    });

    return { companyId: existingCompanyId, created: false, updatedFields: [], officerChanges, shareholderChanges };
  }

  // Build update object with only changed fields
  const updateData: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  for (const diff of differences) {
    updatedFields.push(diff.label);

    // Map diff field to database field
    switch (diff.field) {
      case 'name':
        updateData.name = normalizedData.entityDetails.name;
        break;
      case 'formerName':
        updateData.formerName = normalizedData.entityDetails.formerName;
        break;
      case 'entityType':
        updateData.entityType = mapEntityType(normalizedData.entityDetails.entityType);
        break;
      case 'status':
        updateData.status = mapCompanyStatus(normalizedData.entityDetails.status);
        break;
      case 'statusDate':
        updateData.statusDate = normalizedData.entityDetails.statusDate
          ? new Date(normalizedData.entityDetails.statusDate)
          : null;
        break;
      case 'incorporationDate':
        updateData.incorporationDate = normalizedData.entityDetails.incorporationDate
          ? new Date(normalizedData.entityDetails.incorporationDate)
          : null;
        break;
      case 'primarySsicCode':
        updateData.primarySsicCode = normalizedData.ssicActivities?.primary?.code;
        break;
      case 'primarySsicDescription':
        updateData.primarySsicDescription = normalizedData.ssicActivities?.primary?.description;
        break;
      case 'secondarySsicCode':
        updateData.secondarySsicCode = normalizedData.ssicActivities?.secondary?.code;
        break;
      case 'secondarySsicDescription':
        updateData.secondarySsicDescription = normalizedData.ssicActivities?.secondary?.description;
        break;
      case 'lastAgmDate':
        updateData.lastAgmDate = normalizedData.compliance?.lastAgmDate
          ? new Date(normalizedData.compliance.lastAgmDate)
          : null;
        break;
      case 'lastArFiledDate':
        updateData.lastArFiledDate = normalizedData.compliance?.lastArFiledDate
          ? new Date(normalizedData.compliance.lastArFiledDate)
          : null;
        break;
      case 'accountsDueDate':
        updateData.accountsDueDate = normalizedData.compliance?.accountsDueDate
          ? new Date(normalizedData.compliance.accountsDueDate)
          : null;
        break;
      case 'financialYearEnd':
        updateData.financialYearEndDay = normalizedData.financialYear?.endDay;
        updateData.financialYearEndMonth = normalizedData.financialYear?.endMonth;
        break;
      case 'paidUpCapital':
      case 'issuedCapital':
        // Capital updates are handled together below
        break;
    }
  }

  // Handle capital updates if either paid up or issued capital changed
  const hasCapitalChanges = differences.some(d => d.field === 'paidUpCapital' || d.field === 'issuedCapital');
  if (hasCapitalChanges && normalizedData.shareCapital?.length) {
    const totalPaidUp = normalizedData.shareCapital
      .filter((c) => c.isPaidUp && !c.isTreasury)
      .reduce((sum, c) => sum + c.totalValue, 0);
    const totalIssued = normalizedData.shareCapital
      .filter((c) => !c.isTreasury)
      .reduce((sum, c) => sum + c.totalValue, 0);
    const primaryCurrency = normalizedData.shareCapital[0]?.currency || 'SGD';

    updateData.paidUpCapitalAmount = totalPaidUp;
    updateData.paidUpCapitalCurrency = primaryCurrency;
    updateData.issuedCapitalAmount = totalIssued;
    updateData.issuedCapitalCurrency = primaryCurrency;
  }

  // Perform the update in a transaction
  await prisma.$transaction(async (tx) => {
    // Update company with only changed fields
    if (Object.keys(updateData).length > 0) {
      await tx.company.update({
        where: { id: existingCompanyId },
        data: updateData,
      });
    }

    // Handle address update separately if needed
    if (differences.some(d => d.field === 'registeredAddress') && normalizedData.registeredAddress) {
      const addr = normalizedData.registeredAddress;

      // Mark previous addresses as not current
      await tx.companyAddress.updateMany({
        where: { companyId: existingCompanyId, addressType: 'REGISTERED_OFFICE', isCurrent: true },
        data: { isCurrent: false, effectiveTo: new Date() },
      });

      await tx.companyAddress.create({
        data: {
          companyId: existingCompanyId,
          addressType: 'REGISTERED_OFFICE',
          block: addr.block,
          streetName: addr.streetName,
          level: addr.level,
          unit: addr.unit,
          buildingName: addr.buildingName,
          postalCode: addr.postalCode,
          fullAddress: buildFullAddress(addr),
          effectiveFrom: addr.effectiveFrom ? new Date(addr.effectiveFrom) : null,
          isCurrent: true,
          sourceDocumentId: documentId,
        },
      });
    }

    // Process officer updates
    for (const officerDiff of officerDiffs) {
      if (officerDiff.type === 'added' && officerDiff.extractedData) {
        // Add new officer
        const extracted = officerDiff.extractedData;
        const nameParts = extracted.name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Find or create contact
        const { contact } = await findOrCreateContact(
          {
            contactType: 'INDIVIDUAL',
            firstName: normalizeName(firstName) || firstName,
            lastName: normalizeName(lastName) || lastName,
            identificationType: mapIdentificationType(extracted.identificationType) || undefined,
            identificationNumber: extracted.identificationNumber,
            nationality: extracted.nationality,
            fullAddress: extracted.address,
          },
          { tenantId, userId }
        );

        // Create officer record
        await tx.companyOfficer.create({
          data: {
            companyId: existingCompanyId,
            contactId: contact.id,
            role: mapOfficerRole(extracted.role),
            name: normalizeName(extracted.name) || extracted.name,
            identificationType: mapIdentificationType(extracted.identificationType),
            identificationNumber: extracted.identificationNumber,
            nationality: extracted.nationality,
            address: extracted.address,
            appointmentDate: extracted.appointmentDate ? new Date(extracted.appointmentDate) : null,
            isCurrent: true,
            sourceDocumentId: documentId,
          },
        });

        // Create company-contact relationship
        await createCompanyContactRelation(contact.id, existingCompanyId, extracted.role);
        officerChanges.added++;
      } else if (officerDiff.type === 'updated' && officerDiff.officerId && officerDiff.extractedData) {
        // Update existing officer
        const extracted = officerDiff.extractedData;
        await tx.companyOfficer.update({
          where: { id: officerDiff.officerId },
          data: {
            role: mapOfficerRole(extracted.role),
            nationality: extracted.nationality,
            address: extracted.address,
            sourceDocumentId: documentId,
          },
        });
        officerChanges.updated++;
      } else if (officerDiff.type === 'potentially_ceased' && officerDiff.officerId) {
        // Handle potentially ceased officers based on user actions
        const action = officerActions?.find(a => a.officerId === officerDiff.officerId);
        if (action) {
          if (action.action === 'cease') {
            await tx.companyOfficer.update({
              where: { id: officerDiff.officerId },
              data: {
                cessationDate: action.cessationDate ? new Date(action.cessationDate) : new Date(),
                isCurrent: false,
              },
            });
            officerChanges.ceased++;
          } else if (action.action === 'follow_up') {
            // Mark for follow-up - no changes to database, just tracking
            officerChanges.followUp++;
          }
        }
        // If no action provided, leave the officer unchanged
      }
    }

    // Process shareholder updates
    for (const shareholderDiff of shareholderDiffs) {
      if (shareholderDiff.type === 'added' && shareholderDiff.extractedData) {
        // Add new shareholder
        const extracted = shareholderDiff.extractedData;
        const contactType = extracted.type === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL';

        let contactData;
        if (contactType === 'CORPORATE') {
          contactData = {
            contactType: 'CORPORATE' as const,
            corporateName: normalizeCompanyName(extracted.name) || extracted.name,
            corporateUen: extracted.identificationNumber,
            fullAddress: extracted.address,
          };
        } else {
          const nameParts = extracted.name.split(' ');
          contactData = {
            contactType: 'INDIVIDUAL' as const,
            firstName: normalizeName(nameParts[0]) || nameParts[0],
            lastName: normalizeName(nameParts.slice(1).join(' ')) || undefined,
            identificationType: mapIdentificationType(extracted.identificationType) || undefined,
            identificationNumber: extracted.identificationNumber,
            nationality: extracted.nationality,
            fullAddress: extracted.address,
          };
        }

        const { contact } = await findOrCreateContact(contactData, { tenantId, userId });

        await tx.companyShareholder.create({
          data: {
            companyId: existingCompanyId,
            contactId: contact.id,
            name: contactType === 'CORPORATE'
              ? normalizeCompanyName(extracted.name) || extracted.name
              : normalizeName(extracted.name) || extracted.name,
            shareholderType: contactType,
            identificationType: mapIdentificationType(extracted.identificationType),
            identificationNumber: extracted.identificationNumber,
            nationality: extracted.nationality,
            placeOfOrigin: extracted.placeOfOrigin,
            address: extracted.address,
            shareClass: extracted.shareClass || 'ORDINARY',
            numberOfShares: extracted.numberOfShares,
            percentageHeld: extracted.percentageHeld,
            currency: extracted.currency || 'SGD',
            isCurrent: true,
            sourceDocumentId: documentId,
          },
        });

        await createCompanyContactRelation(contact.id, existingCompanyId, 'Shareholder');
        shareholderChanges.added++;
      } else if (shareholderDiff.type === 'updated' && shareholderDiff.shareholderId && shareholderDiff.extractedData) {
        // Update existing shareholder
        const extracted = shareholderDiff.extractedData;
        await tx.companyShareholder.update({
          where: { id: shareholderDiff.shareholderId },
          data: {
            shareClass: extracted.shareClass || 'ORDINARY',
            numberOfShares: extracted.numberOfShares,
            percentageHeld: extracted.percentageHeld,
            currency: extracted.currency,
            nationality: extracted.nationality,
            address: extracted.address,
            sourceDocumentId: documentId,
          },
        });
        shareholderChanges.updated++;
      } else if (shareholderDiff.type === 'removed' && shareholderDiff.shareholderId) {
        // Mark shareholder as not current
        await tx.companyShareholder.update({
          where: { id: shareholderDiff.shareholderId },
          data: {
            isCurrent: false,
          },
        });
        shareholderChanges.removed++;
      }
    }

    // Recalculate shareholder percentages if any changes were made
    if (shareholderChanges.added > 0 || shareholderChanges.updated > 0 || shareholderChanges.removed > 0) {
      const currentShareholders = await tx.companyShareholder.findMany({
        where: { companyId: existingCompanyId, isCurrent: true },
      });

      const totalShares = currentShareholders.reduce((sum, s) => sum + s.numberOfShares, 0);

      if (totalShares > 0) {
        for (const shareholder of currentShareholders) {
          const percentage = (shareholder.numberOfShares / totalShares) * 100;
          await tx.companyShareholder.update({
            where: { id: shareholder.id },
            data: { percentageHeld: Math.round(percentage * 100) / 100 },
          });
        }
      }
    }

    // Update document with company reference
    await tx.document.update({
      where: { id: documentId },
      data: {
        companyId: existingCompanyId,
        extractionStatus: 'COMPLETED',
        extractedAt: new Date(),
        extractedData: normalizedData as object,
      },
    });
  });

  // Create audit log with specific changed fields
  if (updatedFields.length > 0) {
    await createAuditLog({
      tenantId,
      userId,
      companyId: existingCompanyId,
      action: 'UPDATE',
      entityType: 'Company',
      entityId: existingCompanyId,
      entityName: normalizedData.entityDetails.name,
      summary: `Updated company from BizFile: ${updatedFields.join(', ')}`,
      changeSource: 'BIZFILE_UPLOAD',
      metadata: {
        documentId,
        uen: normalizedData.entityDetails.uen,
        updatedFields,
        changes: differences.map(d => ({
          field: d.label,
          from: d.oldValue,
          to: d.newValue,
        })),
      },
    });
  }

  // Create audit logs for officer changes
  if (officerChanges.added > 0 || officerChanges.updated > 0 || officerChanges.ceased > 0) {
    const officerSummaryParts = [];
    if (officerChanges.added > 0) officerSummaryParts.push(`${officerChanges.added} added`);
    if (officerChanges.updated > 0) officerSummaryParts.push(`${officerChanges.updated} updated`);
    if (officerChanges.ceased > 0) officerSummaryParts.push(`${officerChanges.ceased} ceased`);

    await createAuditLog({
      tenantId,
      userId,
      companyId: existingCompanyId,
      action: 'UPDATE',
      entityType: 'CompanyOfficer',
      entityId: existingCompanyId,
      entityName: normalizedData.entityDetails.name,
      summary: `Updated officers from BizFile: ${officerSummaryParts.join(', ')}`,
      changeSource: 'BIZFILE_UPLOAD',
      metadata: {
        documentId,
        ...officerChanges,
      },
    });
  }

  // Create audit logs for shareholder changes
  if (shareholderChanges.added > 0 || shareholderChanges.updated > 0 || shareholderChanges.removed > 0) {
    const shareholderSummaryParts = [];
    if (shareholderChanges.added > 0) shareholderSummaryParts.push(`${shareholderChanges.added} added`);
    if (shareholderChanges.updated > 0) shareholderSummaryParts.push(`${shareholderChanges.updated} updated`);
    if (shareholderChanges.removed > 0) shareholderSummaryParts.push(`${shareholderChanges.removed} removed`);

    await createAuditLog({
      tenantId,
      userId,
      companyId: existingCompanyId,
      action: 'UPDATE',
      entityType: 'CompanyShareholder',
      entityId: existingCompanyId,
      entityName: normalizedData.entityDetails.name,
      summary: `Updated shareholders from BizFile: ${shareholderSummaryParts.join(', ')}`,
      changeSource: 'BIZFILE_UPLOAD',
      metadata: {
        documentId,
        ...shareholderChanges,
      },
    });
  }

  return { companyId: existingCompanyId, created: false, updatedFields, officerChanges, shareholderChanges };
}

export async function processBizFileExtraction(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string
): Promise<{ companyId: string; created: boolean }> {
  // Normalize all text fields before processing
  const normalizedData = normalizeExtractedData(extractedData);
  const { entityDetails } = normalizedData;

  // Check if company exists within tenant
  let company = await prisma.company.findFirst({
    where: { tenantId, uen: entityDetails.uen },
  });

  const isNewCompany = !company;

  // Create or update company in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Upsert company
    company = await tx.company.upsert({
      where: { tenantId_uen: { tenantId, uen: entityDetails.uen } },
      create: {
        tenantId,
        uen: entityDetails.uen,
        name: entityDetails.name,
        formerName: entityDetails.formerName,
        dateOfNameChange: entityDetails.dateOfNameChange
          ? new Date(entityDetails.dateOfNameChange)
          : null,
        entityType: mapEntityType(entityDetails.entityType),
        status: mapCompanyStatus(entityDetails.status),
        statusDate: entityDetails.statusDate
          ? new Date(entityDetails.statusDate)
          : null,
        incorporationDate: entityDetails.incorporationDate
          ? new Date(entityDetails.incorporationDate)
          : null,
        registrationDate: entityDetails.registrationDate
          ? new Date(entityDetails.registrationDate)
          : null,
        dateOfAddress: normalizedData.registeredAddress?.effectiveFrom
          ? new Date(normalizedData.registeredAddress.effectiveFrom)
          : null,
        primarySsicCode: normalizedData.ssicActivities?.primary?.code,
        primarySsicDescription: normalizedData.ssicActivities?.primary?.description,
        secondarySsicCode: normalizedData.ssicActivities?.secondary?.code,
        secondarySsicDescription: normalizedData.ssicActivities?.secondary?.description,
        financialYearEndDay: normalizedData.financialYear?.endDay,
        financialYearEndMonth: normalizedData.financialYear?.endMonth,
        fyeAsAtLastAr: normalizedData.compliance?.fyeAsAtLastAr
          ? new Date(normalizedData.compliance.fyeAsAtLastAr)
          : null,
        homeCurrency: normalizedData.homeCurrency || 'SGD',
        lastAgmDate: normalizedData.compliance?.lastAgmDate
          ? new Date(normalizedData.compliance.lastAgmDate)
          : null,
        lastArFiledDate: normalizedData.compliance?.lastArFiledDate
          ? new Date(normalizedData.compliance.lastArFiledDate)
          : null,
        accountsDueDate: normalizedData.compliance?.accountsDueDate
          ? new Date(normalizedData.compliance.accountsDueDate)
          : null,
        hasCharges: (normalizedData.charges?.length || 0) > 0,
      },
      update: {
        name: entityDetails.name,
        formerName: entityDetails.formerName,
        dateOfNameChange: entityDetails.dateOfNameChange
          ? new Date(entityDetails.dateOfNameChange)
          : undefined,
        entityType: mapEntityType(entityDetails.entityType),
        status: mapCompanyStatus(entityDetails.status),
        statusDate: entityDetails.statusDate
          ? new Date(entityDetails.statusDate)
          : undefined,
        incorporationDate: entityDetails.incorporationDate
          ? new Date(entityDetails.incorporationDate)
          : undefined,
        dateOfAddress: normalizedData.registeredAddress?.effectiveFrom
          ? new Date(normalizedData.registeredAddress.effectiveFrom)
          : undefined,
        primarySsicCode: normalizedData.ssicActivities?.primary?.code,
        primarySsicDescription: normalizedData.ssicActivities?.primary?.description,
        secondarySsicCode: normalizedData.ssicActivities?.secondary?.code,
        secondarySsicDescription: normalizedData.ssicActivities?.secondary?.description,
        financialYearEndDay: normalizedData.financialYear?.endDay,
        financialYearEndMonth: normalizedData.financialYear?.endMonth,
        fyeAsAtLastAr: normalizedData.compliance?.fyeAsAtLastAr
          ? new Date(normalizedData.compliance.fyeAsAtLastAr)
          : undefined,
        homeCurrency: normalizedData.homeCurrency || undefined,
        lastAgmDate: normalizedData.compliance?.lastAgmDate
          ? new Date(normalizedData.compliance.lastAgmDate)
          : undefined,
        lastArFiledDate: normalizedData.compliance?.lastArFiledDate
          ? new Date(normalizedData.compliance.lastArFiledDate)
          : undefined,
        accountsDueDate: normalizedData.compliance?.accountsDueDate
          ? new Date(normalizedData.compliance.accountsDueDate)
          : undefined,
        hasCharges: (normalizedData.charges?.length || 0) > 0,
      },
    });

    // Update document with company reference
    await tx.document.update({
      where: { id: documentId },
      data: {
        companyId: company.id,
        extractionStatus: 'COMPLETED',
        extractedAt: new Date(),
        extractedData: normalizedData as object,
      },
    });

    // Process former names
    if (normalizedData.entityDetails.formerNames?.length) {
      for (const formerName of normalizedData.entityDetails.formerNames) {
        await tx.companyFormerName.upsert({
          where: {
            id: `${company.id}-${formerName.name}-${formerName.effectiveFrom}`,
          },
          create: {
            id: `${company.id}-${formerName.name}-${formerName.effectiveFrom}`,
            companyId: company.id,
            formerName: formerName.name,
            effectiveFrom: new Date(formerName.effectiveFrom),
            effectiveTo: formerName.effectiveTo ? new Date(formerName.effectiveTo) : null,
            sourceDocumentId: documentId,
          },
          update: {
            effectiveTo: formerName.effectiveTo ? new Date(formerName.effectiveTo) : null,
          },
        });
      }
    }

    // Process registered address
    if (normalizedData.registeredAddress) {
      const addr = normalizedData.registeredAddress;
      // Mark previous addresses as not current
      await tx.companyAddress.updateMany({
        where: { companyId: company.id, addressType: 'REGISTERED_OFFICE', isCurrent: true },
        data: { isCurrent: false, effectiveTo: new Date() },
      });

      await tx.companyAddress.create({
        data: {
          companyId: company.id,
          addressType: 'REGISTERED_OFFICE',
          block: addr.block,
          streetName: addr.streetName,
          level: addr.level,
          unit: addr.unit,
          buildingName: addr.buildingName,
          postalCode: addr.postalCode,
          fullAddress: buildFullAddress(addr),
          effectiveFrom: addr.effectiveFrom ? new Date(addr.effectiveFrom) : null,
          isCurrent: true,
          sourceDocumentId: documentId,
        },
      });
    }

    // Process mailing address
    if (normalizedData.mailingAddress) {
      const addr = normalizedData.mailingAddress;
      await tx.companyAddress.updateMany({
        where: { companyId: company.id, addressType: 'MAILING', isCurrent: true },
        data: { isCurrent: false, effectiveTo: new Date() },
      });

      await tx.companyAddress.create({
        data: {
          companyId: company.id,
          addressType: 'MAILING',
          block: addr.block,
          streetName: addr.streetName,
          level: addr.level,
          unit: addr.unit,
          buildingName: addr.buildingName,
          postalCode: addr.postalCode,
          fullAddress: buildFullAddress(addr),
          isCurrent: true,
          sourceDocumentId: documentId,
        },
      });
    }

    // Process share capital
    if (normalizedData.shareCapital?.length) {
      for (const capital of normalizedData.shareCapital) {
        await tx.shareCapital.create({
          data: {
            companyId: company.id,
            shareClass: capital.shareClass,
            currency: capital.currency,
            numberOfShares: capital.numberOfShares,
            parValue: capital.parValue,
            totalValue: capital.totalValue,
            isPaidUp: capital.isPaidUp,
            isTreasury: capital.isTreasury || false,
            effectiveDate: new Date(),
            sourceDocumentId: documentId,
          },
        });
      }

      // Calculate paid up capital (shares marked as paid up, excluding treasury)
      const totalPaidUp = normalizedData.shareCapital
        .filter((c) => c.isPaidUp && !c.isTreasury)
        .reduce((sum, c) => sum + c.totalValue, 0);

      // Calculate issued capital (all shares excluding treasury)
      const totalIssued = normalizedData.shareCapital
        .filter((c) => !c.isTreasury)
        .reduce((sum, c) => sum + c.totalValue, 0);

      // Get primary currency from share capital (default to SGD)
      const primaryCurrency = normalizedData.shareCapital[0]?.currency || 'SGD';

      await tx.company.update({
        where: { id: company.id },
        data: {
          paidUpCapitalAmount: totalPaidUp,
          paidUpCapitalCurrency: primaryCurrency,
          issuedCapitalAmount: totalIssued,
          issuedCapitalCurrency: primaryCurrency,
        },
      });
    }

    // Process treasury shares if present
    if (normalizedData.treasuryShares && normalizedData.treasuryShares.numberOfShares > 0) {
      await tx.shareCapital.create({
        data: {
          companyId: company.id,
          shareClass: 'TREASURY',
          currency: normalizedData.treasuryShares.currency || 'SGD',
          numberOfShares: normalizedData.treasuryShares.numberOfShares,
          totalValue: 0, // Treasury shares don't contribute to capital value
          isPaidUp: false,
          isTreasury: true,
          effectiveDate: new Date(),
          sourceDocumentId: documentId,
        },
      });
    }

    // Process officers, shareholders, and charges within the same transaction
    // for data consistency - if any fail, the entire operation is rolled back

    // Process officers
    if (normalizedData.officers?.length) {
      for (const officer of normalizedData.officers) {
        const isCurrent = !officer.cessationDate;

        // Parse name for individual
        const nameParts = officer.name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ');

        // Find or create contact (using transaction)
        const { contact } = await findOrCreateContact(
          {
            contactType: 'INDIVIDUAL',
            firstName,
            lastName,
            identificationType: mapIdentificationType(officer.identificationType) || undefined,
            identificationNumber: officer.identificationNumber,
            nationality: officer.nationality,
            fullAddress: officer.address,
          },
          { tenantId, userId, tx: tx as PrismaTransactionClient }
        );

        // Create officer record
        await tx.companyOfficer.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            role: mapOfficerRole(officer.role),
            name: officer.name,
            identificationType: mapIdentificationType(officer.identificationType),
            identificationNumber: officer.identificationNumber,
            nationality: officer.nationality,
            address: officer.address,
            appointmentDate: officer.appointmentDate ? new Date(officer.appointmentDate) : null,
            cessationDate: officer.cessationDate ? new Date(officer.cessationDate) : null,
            isCurrent,
            sourceDocumentId: documentId,
          },
        });

        // Link contact to company via general relationship
        if (isCurrent) {
          await createCompanyContactRelation(contact.id, company.id, officer.role, false, tx as PrismaTransactionClient);
        }
      }
    }

    // Process shareholders
    if (normalizedData.shareholders?.length) {
      for (const shareholder of normalizedData.shareholders) {
        const contactType = mapContactType(shareholder.type);

        let contactData;
        if (contactType === 'CORPORATE') {
          contactData = {
            contactType: 'CORPORATE' as const,
            corporateName: shareholder.name,
            corporateUen: shareholder.identificationNumber,
            fullAddress: shareholder.address,
          };
        } else {
          const nameParts = shareholder.name.split(' ');
          contactData = {
            contactType: 'INDIVIDUAL' as const,
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(' ') || undefined,
            identificationType: mapIdentificationType(shareholder.identificationType) || undefined,
            identificationNumber: shareholder.identificationNumber,
            nationality: shareholder.nationality,
            fullAddress: shareholder.address,
          };
        }

        const { contact } = await findOrCreateContact(contactData, { tenantId, userId, tx: tx as PrismaTransactionClient });

        await tx.companyShareholder.create({
          data: {
            companyId: company.id,
            contactId: contact.id,
            name: shareholder.name,
            shareholderType: contactType,
            identificationType: mapIdentificationType(shareholder.identificationType),
            identificationNumber: shareholder.identificationNumber,
            nationality: shareholder.nationality,
            placeOfOrigin: shareholder.placeOfOrigin,
            address: shareholder.address,
            shareClass: shareholder.shareClass,
            numberOfShares: shareholder.numberOfShares,
            percentageHeld: shareholder.percentageHeld,
            currency: shareholder.currency || 'SGD',
            isCurrent: true,
            sourceDocumentId: documentId,
          },
        });

        await createCompanyContactRelation(contact.id, company.id, 'Shareholder', false, tx as PrismaTransactionClient);
      }
    }

    // Process charges (without creating contacts - charges are typically banks/financial institutions)
    if (normalizedData.charges?.length) {
      for (const charge of normalizedData.charges) {
        await tx.companyCharge.create({
          data: {
            companyId: company.id,
            // Don't link to contact - chargeHolderId intentionally left null
            chargeNumber: charge.chargeNumber,
            chargeType: charge.chargeType,
            description: charge.description,
            chargeHolderName: charge.chargeHolderName,
            amountSecured: charge.amountSecured,
            amountSecuredText: charge.amountSecuredText,
            currency: charge.currency || 'SGD',
            registrationDate: charge.registrationDate ? new Date(charge.registrationDate) : null,
            dischargeDate: charge.dischargeDate ? new Date(charge.dischargeDate) : null,
            isFullyDischarged: !!charge.dischargeDate,
            sourceDocumentId: documentId,
          },
        });
      }
    }

    return company;
  });

  // Create audit log - MUST include tenantId for proper scoping
  const actionVerb = isNewCompany ? 'Created' : 'Updated';
  await createAuditLog({
    tenantId,
    userId,
    companyId: result.id,
    action: isNewCompany ? 'CREATE' : 'UPDATE',
    entityType: 'Company',
    entityId: result.id,
    entityName: entityDetails.name,
    summary: `${actionVerb} company "${entityDetails.name}" (UEN: ${entityDetails.uen}) from BizFile extraction`,
    changeSource: 'BIZFILE_UPLOAD',
    metadata: {
      documentId,
      uen: entityDetails.uen,
      extractedFields: Object.keys(normalizedData),
    },
  });

  return { companyId: result.id, created: isNewCompany };
}
