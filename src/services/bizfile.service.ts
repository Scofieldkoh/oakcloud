import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { findOrCreateContact, linkContactToCompany } from './contact.service';
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
  return parts.join(' ');
}

export async function processBizFileExtraction(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string
): Promise<{ companyId: string; created: boolean }> {
  const { entityDetails } = extractedData;

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
        dateOfAddress: extractedData.registeredAddress?.effectiveFrom
          ? new Date(extractedData.registeredAddress.effectiveFrom)
          : null,
        primarySsicCode: extractedData.ssicActivities?.primary?.code,
        primarySsicDescription: extractedData.ssicActivities?.primary?.description,
        secondarySsicCode: extractedData.ssicActivities?.secondary?.code,
        secondarySsicDescription: extractedData.ssicActivities?.secondary?.description,
        financialYearEndDay: extractedData.financialYear?.endDay,
        financialYearEndMonth: extractedData.financialYear?.endMonth,
        fyeAsAtLastAr: extractedData.compliance?.fyeAsAtLastAr
          ? new Date(extractedData.compliance.fyeAsAtLastAr)
          : null,
        homeCurrency: extractedData.homeCurrency || 'SGD',
        lastAgmDate: extractedData.compliance?.lastAgmDate
          ? new Date(extractedData.compliance.lastAgmDate)
          : null,
        lastArFiledDate: extractedData.compliance?.lastArFiledDate
          ? new Date(extractedData.compliance.lastArFiledDate)
          : null,
        accountsDueDate: extractedData.compliance?.accountsDueDate
          ? new Date(extractedData.compliance.accountsDueDate)
          : null,
        hasCharges: (extractedData.charges?.length || 0) > 0,
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
        dateOfAddress: extractedData.registeredAddress?.effectiveFrom
          ? new Date(extractedData.registeredAddress.effectiveFrom)
          : undefined,
        primarySsicCode: extractedData.ssicActivities?.primary?.code,
        primarySsicDescription: extractedData.ssicActivities?.primary?.description,
        secondarySsicCode: extractedData.ssicActivities?.secondary?.code,
        secondarySsicDescription: extractedData.ssicActivities?.secondary?.description,
        financialYearEndDay: extractedData.financialYear?.endDay,
        financialYearEndMonth: extractedData.financialYear?.endMonth,
        fyeAsAtLastAr: extractedData.compliance?.fyeAsAtLastAr
          ? new Date(extractedData.compliance.fyeAsAtLastAr)
          : undefined,
        homeCurrency: extractedData.homeCurrency || undefined,
        lastAgmDate: extractedData.compliance?.lastAgmDate
          ? new Date(extractedData.compliance.lastAgmDate)
          : undefined,
        lastArFiledDate: extractedData.compliance?.lastArFiledDate
          ? new Date(extractedData.compliance.lastArFiledDate)
          : undefined,
        accountsDueDate: extractedData.compliance?.accountsDueDate
          ? new Date(extractedData.compliance.accountsDueDate)
          : undefined,
        hasCharges: (extractedData.charges?.length || 0) > 0,
      },
    });

    // Update document with company reference
    await tx.document.update({
      where: { id: documentId },
      data: {
        companyId: company.id,
        extractionStatus: 'COMPLETED',
        extractedAt: new Date(),
        extractedData: extractedData as object,
      },
    });

    // Process former names
    if (extractedData.entityDetails.formerNames?.length) {
      for (const formerName of extractedData.entityDetails.formerNames) {
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
    if (extractedData.registeredAddress) {
      const addr = extractedData.registeredAddress;
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
    if (extractedData.mailingAddress) {
      const addr = extractedData.mailingAddress;
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
    if (extractedData.shareCapital?.length) {
      for (const capital of extractedData.shareCapital) {
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

      // Update company paid up capital
      const totalPaidUp = extractedData.shareCapital
        .filter((c) => c.isPaidUp && !c.isTreasury)
        .reduce((sum, c) => sum + c.totalValue, 0);

      await tx.company.update({
        where: { id: company.id },
        data: { paidUpCapitalAmount: totalPaidUp },
      });
    }

    // Process treasury shares if present
    if (extractedData.treasuryShares && extractedData.treasuryShares.numberOfShares > 0) {
      await tx.shareCapital.create({
        data: {
          companyId: company.id,
          shareClass: 'TREASURY',
          currency: extractedData.treasuryShares.currency || 'SGD',
          numberOfShares: extractedData.treasuryShares.numberOfShares,
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
    if (extractedData.officers?.length) {
      for (const officer of extractedData.officers) {
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
          addressLine1: officer.address,
          country: 'SINGAPORE',
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

      // Link contact to company
      if (isCurrent) {
        await linkContactToCompany(contact.id, result.id, officer.role);
      }
    }
  }

  // Process shareholders
  if (extractedData.shareholders?.length) {
    for (const shareholder of extractedData.shareholders) {
      const contactType = mapContactType(shareholder.type);

      let contactData;
      if (contactType === 'CORPORATE') {
        contactData = {
          contactType: 'CORPORATE' as const,
          corporateName: shareholder.name,
          corporateUen: shareholder.identificationNumber,
          addressLine1: shareholder.address,
          country: 'SINGAPORE',
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
          addressLine1: shareholder.address,
          country: 'SINGAPORE',
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

      await linkContactToCompany(contact.id, result.id, 'Shareholder');
    }
  }

  // Process charges
  if (extractedData.charges?.length) {
    for (const charge of extractedData.charges) {
      // Find or create charge holder contact
      const { contact: chargeHolder } = await findOrCreateContact(
        {
          contactType: 'CORPORATE',
          corporateName: charge.chargeHolderName,
          country: 'SINGAPORE',
        },
        { tenantId, userId }
      );

      await prisma.companyCharge.create({
        data: {
          companyId: result.id,
          chargeHolderId: chargeHolder.id,
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

        await linkContactToCompany(chargeHolder.id, result.id, 'Charge Holder');
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
      extractedFields: Object.keys(extractedData),
    },
  });

  return { companyId: result.id, created: isNewCompany };
}
