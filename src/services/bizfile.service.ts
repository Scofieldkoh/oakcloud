import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { normalizeName, normalizeCompanyName, normalizeAddress } from '@/lib/utils';
import { findOrCreateContact, createCompanyContactRelation } from './contact.service';
import { callAI, getBestAvailableModel, getModelConfig } from '@/lib/ai';
import type { AIModel, AIImageInput } from '@/lib/ai';
import type { EntityType, CompanyStatus, OfficerRole, ContactType, IdentificationType } from '@prisma/client';

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
    designation?: string;
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
    "designation": "string",
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
    console.error('[BizFile] Failed to parse AI response:', content.substring(0, 500));
    console.error('[BizFile] Cleaned content:', cleanedContent.substring(0, 500));
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
 * @param fileInput - The base64-encoded file with MIME type
 * @param options - Optional extraction options including model selection and additional context
 * @returns Extracted data with model metadata
 */
export async function extractBizFileWithVision(
  fileInput: BizFileVisionInput,
  options?: BizFileExtractionOptions
): Promise<BizFileExtractionResult> {
  // Determine which model to use
  const modelId = options?.modelId || getBestAvailableModel();

  if (!modelId) {
    throw new Error(
      'No AI provider configured. Please set at least one API key: ' +
        'OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY'
    );
  }

  const modelConfig = getModelConfig(modelId);

  console.log(`[BizFile] Using AI vision model: ${modelConfig.name} (${modelConfig.provider})`);
  console.log(`[BizFile] File type: ${fileInput.mimeType}, size: ${Math.round(fileInput.base64.length * 0.75 / 1024)}KB`);

  // Prepare the image input for the AI
  const images: AIImageInput[] = [
    {
      base64: fileInput.base64,
      mimeType: fileInput.mimeType,
    },
  ];

  // Build user prompt with optional context
  const userPrompt = buildUserPrompt(options?.additionalContext);

  // Call the AI service with vision
  const response = await callAI({
    model: modelId,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userPrompt,
    images,
    jsonMode: true,
    temperature: 0.1,
  });

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
 * @param options - Optional extraction options including model selection
 * @returns Extracted data with model metadata
 */
export async function extractBizFileData(
  pdfText: string,
  options?: BizFileExtractionOptions
): Promise<BizFileExtractionResult> {
  // Determine which model to use
  const modelId = options?.modelId || getBestAvailableModel();

  if (!modelId) {
    throw new Error(
      'No AI provider configured. Please set at least one API key: ' +
        'OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY'
    );
  }

  const modelConfig = getModelConfig(modelId);

  console.log(`[BizFile] Using AI model (text mode): ${modelConfig.name} (${modelConfig.provider})`);

  // Build user prompt with optional context
  const basePrompt = buildUserPrompt(options?.additionalContext);
  const userPrompt = `${basePrompt}\n\nDocument text content:\n\n${pdfText}`;

  // Call the AI service
  const response = await callAI({
    model: modelId,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    temperature: 0.1,
  });

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
function normalizeExtractedData(data: ExtractedBizFileData): ExtractedBizFileData {
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
 * Generate a diff between existing company data and extracted BizFile data
 * Only returns fields that have actual differences
 */
export async function generateBizFileDiff(
  existingCompanyId: string,
  extractedData: ExtractedBizFileData,
  tenantId: string
): Promise<{ hasDifferences: boolean; differences: BizFileDiffEntry[]; existingCompany: { name: string; uen: string } }> {
  const company = await prisma.company.findFirst({
    where: { id: existingCompanyId, tenantId },
    include: {
      addresses: { where: { isCurrent: true } },
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

  return {
    hasDifferences: differences.length > 0,
    differences,
    existingCompany: { name: company.name, uen: company.uen },
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
  existingCompanyId: string
): Promise<{ companyId: string; created: boolean; updatedFields: string[] }> {
  // Normalize all text fields before processing
  const normalizedData = normalizeExtractedData(extractedData);

  // Generate diff to determine what needs updating
  const { differences } = await generateBizFileDiff(existingCompanyId, normalizedData, tenantId);

  if (differences.length === 0) {
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

    return { companyId: existingCompanyId, created: false, updatedFields: [] };
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

  return { companyId: existingCompanyId, created: false, updatedFields };
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

    return company;
  });

  // Process officers, shareholders, and charges
  // Note: These are processed outside the main transaction because contact
  // creation uses upsert with unique constraints. If any of these fail,
  // the company is already created but related data may be incomplete.
  // TODO: Consider refactoring to use a single transaction for data consistency.
  try {
    // Process officers
    if (normalizedData.officers?.length) {
      for (const officer of normalizedData.officers) {
      const isCurrent = !officer.cessationDate;

      // Parse name for individual
      const nameParts = officer.name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      // Find or create contact
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
        { tenantId, userId }
      );

      // Create officer record
      await prisma.companyOfficer.create({
        data: {
          companyId: result.id,
          contactId: contact.id,
          role: mapOfficerRole(officer.role),
          designation: officer.designation,
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
        await createCompanyContactRelation(contact.id, result.id, officer.role);
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

      const { contact } = await findOrCreateContact(contactData, { tenantId, userId });

      await prisma.companyShareholder.create({
        data: {
          companyId: result.id,
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

      await createCompanyContactRelation(contact.id, result.id, 'Shareholder');
    }
  }

  // Process charges (without creating contacts - charges are typically banks/financial institutions)
  if (normalizedData.charges?.length) {
    for (const charge of normalizedData.charges) {
      await prisma.companyCharge.create({
        data: {
          companyId: result.id,
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
  } catch (error) {
    // Log error but don't fail the entire extraction
    // The company is already created, so we can't rollback
    console.error('[BizFile] Error processing officers/shareholders/charges:', error);
    // Continue to create audit log even if some data failed
  }

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
