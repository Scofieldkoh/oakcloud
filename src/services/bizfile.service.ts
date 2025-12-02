import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { findOrCreateContact, linkContactToCompany } from './contact.service';
import type { EntityType, CompanyStatus, OfficerRole, ContactType, IdentificationType } from '@prisma/client';

// Lazy load OpenAI to reduce initial bundle size
let openaiInstance: import('openai').default | null = null;

async function getOpenAI() {
  if (!openaiInstance) {
    const OpenAI = (await import('openai')).default;
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

// Type definitions for extracted BizFile data
export interface ExtractedBizFileData {
  entityDetails: {
    uen: string;
    name: string;
    formerNames?: Array<{ name: string; effectiveFrom: string; effectiveTo?: string }>;
    entityType: string;
    status: string;
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
    effectiveFrom?: string;
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
  }>;
  shareholders?: Array<{
    name: string;
    type: 'INDIVIDUAL' | 'CORPORATE';
    identificationType?: string;
    identificationNumber?: string;
    nationality?: string;
    address?: string;
    shareClass: string;
    numberOfShares: number;
    percentageHeld?: number;
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
  };
  compliance?: {
    lastAgmDate?: string;
    lastArFiledDate?: string;
    accountsDueDate?: string;
  };
  charges?: Array<{
    chargeNumber?: string;
    chargeType?: string;
    description?: string;
    chargeHolderName: string;
    amountSecured?: number;
    currency?: string;
    registrationDate?: string;
    dischargeDate?: string;
  }>;
}

const EXTRACTION_PROMPT = `You are a document extraction specialist. Extract all relevant information from this Singapore ACRA BizFile PDF document.

Return a JSON object with the following structure (include only fields that have data):

{
  "entityDetails": {
    "uen": "string - Unique Entity Number",
    "name": "string - Current company name",
    "formerNames": [{ "name": "string", "effectiveFrom": "YYYY-MM-DD", "effectiveTo": "YYYY-MM-DD" }],
    "entityType": "PRIVATE_LIMITED | PUBLIC_LIMITED | SOLE_PROPRIETORSHIP | PARTNERSHIP | LIMITED_PARTNERSHIP | LIMITED_LIABILITY_PARTNERSHIP | FOREIGN_COMPANY | VARIABLE_CAPITAL_COMPANY | OTHER",
    "status": "LIVE | STRUCK_OFF | WINDING_UP | DISSOLVED | IN_LIQUIDATION | IN_RECEIVERSHIP | AMALGAMATED | CONVERTED | OTHER",
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
    "effectiveFrom": "YYYY-MM-DD"
  },
  "mailingAddress": { ... same as registeredAddress },
  "shareCapital": [{
    "shareClass": "ORDINARY | PREFERENCE | etc",
    "currency": "SGD",
    "numberOfShares": number,
    "parValue": number,
    "totalValue": number,
    "isPaidUp": boolean
  }],
  "shareholders": [{
    "name": "string",
    "type": "INDIVIDUAL | CORPORATE",
    "identificationType": "NRIC | FIN | PASSPORT | UEN | OTHER",
    "identificationNumber": "string",
    "nationality": "string",
    "address": "string",
    "shareClass": "ORDINARY",
    "numberOfShares": number,
    "percentageHeld": number
  }],
  "officers": [{
    "name": "string",
    "role": "DIRECTOR | ALTERNATE_DIRECTOR | SECRETARY | CEO | CFO | AUDITOR | LIQUIDATOR | RECEIVER | JUDICIAL_MANAGER",
    "designation": "string",
    "identificationType": "NRIC | FIN | PASSPORT",
    "identificationNumber": "string",
    "nationality": "string",
    "address": "string",
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
  "compliance": {
    "lastAgmDate": "YYYY-MM-DD",
    "lastArFiledDate": "YYYY-MM-DD",
    "accountsDueDate": "YYYY-MM-DD"
  },
  "charges": [{
    "chargeNumber": "string",
    "chargeType": "string",
    "description": "string",
    "chargeHolderName": "string",
    "amountSecured": number,
    "currency": "SGD",
    "registrationDate": "YYYY-MM-DD",
    "dischargeDate": "YYYY-MM-DD or null if not discharged"
  }]
}

Important:
- Parse all dates in YYYY-MM-DD format
- Include all officers (current and ceased)
- Include all shareholders
- Extract share capital structure completely
- Mark cessation dates as null for current officers
- Include both primary and secondary SSIC codes if available
- Extract any charges/encumbrances registered against the company

Respond ONLY with valid JSON, no markdown or explanation.`;

export async function extractBizFileData(
  pdfText: string
): Promise<ExtractedBizFileData> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const openai = await getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: `Extract data from this BizFile document:\n\n${pdfText}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI extraction');
  }

  return JSON.parse(content) as ExtractedBizFileData;
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
        entityType: mapEntityType(entityDetails.entityType),
        status: mapCompanyStatus(entityDetails.status),
        incorporationDate: entityDetails.incorporationDate
          ? new Date(entityDetails.incorporationDate)
          : null,
        registrationDate: entityDetails.registrationDate
          ? new Date(entityDetails.registrationDate)
          : null,
        primarySsicCode: extractedData.ssicActivities?.primary?.code,
        primarySsicDescription: extractedData.ssicActivities?.primary?.description,
        secondarySsicCode: extractedData.ssicActivities?.secondary?.code,
        secondarySsicDescription: extractedData.ssicActivities?.secondary?.description,
        financialYearEndDay: extractedData.financialYear?.endDay,
        financialYearEndMonth: extractedData.financialYear?.endMonth,
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
        entityType: mapEntityType(entityDetails.entityType),
        status: mapCompanyStatus(entityDetails.status),
        incorporationDate: entityDetails.incorporationDate
          ? new Date(entityDetails.incorporationDate)
          : undefined,
        primarySsicCode: extractedData.ssicActivities?.primary?.code,
        primarySsicDescription: extractedData.ssicActivities?.primary?.description,
        secondarySsicCode: extractedData.ssicActivities?.secondary?.code,
        secondarySsicDescription: extractedData.ssicActivities?.secondary?.description,
        financialYearEndDay: extractedData.financialYear?.endDay,
        financialYearEndMonth: extractedData.financialYear?.endMonth,
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
            effectiveDate: new Date(),
            sourceDocumentId: documentId,
          },
        });
      }

      // Update company paid up capital
      const totalPaidUp = extractedData.shareCapital
        .filter((c) => c.isPaidUp)
        .reduce((sum, c) => sum + c.totalValue, 0);

      await tx.company.update({
        where: { id: company.id },
        data: { paidUpCapitalAmount: totalPaidUp },
      });
    }

    return company;
  });

  // Process officers (outside transaction for contact creation)
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
          address: shareholder.address,
          shareClass: shareholder.shareClass,
          numberOfShares: shareholder.numberOfShares,
          percentageHeld: shareholder.percentageHeld,
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

  // Create audit log
  await createAuditLog({
    userId,
    companyId: result.id,
    action: isNewCompany ? 'CREATE' : 'UPDATE',
    entityType: 'Company',
    entityId: result.id,
    changeSource: 'BIZFILE_UPLOAD',
    metadata: {
      documentId,
      uen: entityDetails.uen,
      extractedFields: Object.keys(extractedData),
    },
  });

  return { companyId: result.id, created: isNewCompany };
}
