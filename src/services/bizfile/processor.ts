/**
 * BizFile Processor Service
 *
 * Handles processing BizFile extraction results and applying them to the database.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { normalizeName, normalizeCompanyName } from '@/lib/utils';
import { findOrCreateContact, createCompanyContactRelation, type PrismaTransactionClient } from '../contact.service';
import type {
  ExtractedBizFileData,
  OfficerAction,
  SelectiveProcessingResult,
  ProcessingResult,
} from './types';
import { mapEntityType, mapCompanyStatus, mapOfficerRole, mapContactType, mapIdentificationType } from './types';
import { normalizeExtractedData, buildFullAddress } from './normalizer';
import { generateBizFileDiff } from './diff';
import { prepareDocumentPages } from '../document-processing.service';
import { generateApprovedDocumentFilename, buildApprovedStorageKey, getFileExtension } from '@/lib/storage/filename';
import { storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('bizfile-processor');

// ============================================================================
// Selective Processing (Update existing company with changed fields only)
// ============================================================================

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
): Promise<SelectiveProcessingResult> {
  // Normalize all text fields before processing
  const normalizedData = normalizeExtractedData(extractedData);

  // Generate diff to determine what needs updating
  const diffResult = await generateBizFileDiff(existingCompanyId, normalizedData, tenantId);
  const { differences, officerDiffs, shareholderDiffs } = diffResult;

  // Initialize change counters
  const officerChanges = { added: 0, updated: 0, ceased: 0, followUp: 0 };
  const shareholderChanges = { added: 0, updated: 0, removed: 0 };

  if (!diffResult.hasDifferences) {
    // No changes needed, just update document reference and create ProcessingDocument/Revision
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId },
        data: {
          companyId: existingCompanyId,
          extractionStatus: 'COMPLETED',
          extractedAt: new Date(),
          extractedData: normalizedData as object,
        },
      });

      // Create ProcessingDocument and DocumentRevision if they don't exist
      const existingProcessingDoc = await tx.processingDocument.findUnique({
        where: { documentId },
      });

      if (!existingProcessingDoc) {
        // Create ProcessingDocument for this BizFile
        const processingDoc = await tx.processingDocument.create({
          data: {
            documentId,
            isContainer: true,
            pipelineStatus: 'EXTRACTION_DONE',
            processingPriority: 'NORMAL',
            uploadSource: 'WEB',
          },
        });

        // Create DocumentRevision with BizFile metadata
        const revision = await tx.documentRevision.create({
          data: {
            processingDocumentId: processingDoc.id,
            revisionNumber: 1,
            revisionType: 'EXTRACTION',
            status: 'APPROVED',
            reason: 'BizFile extraction auto-approved',
            documentCategory: 'CORPORATE_SECRETARIAL',
            documentSubCategory: 'BIZFILE',
            vendorName: 'Accounting and Corporate Regulatory Authority',
            documentNumber: normalizedData.documentMetadata?.receiptNo || null,
            documentDate: normalizedData.documentMetadata?.receiptDate
              ? new Date(normalizedData.documentMetadata.receiptDate)
              : null,
            currency: 'SGD',
            totalAmount: 0,
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date(),
          },
        });

        // Link revision to processing document
        await tx.processingDocument.update({
          where: { id: processingDoc.id },
          data: { currentRevisionId: revision.id },
        });
      }
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
  if (hasCapitalChanges) {
    // Use directly extracted capital if available, otherwise calculate from share capital
    if (normalizedData.paidUpCapital?.amount !== undefined) {
      updateData.paidUpCapitalAmount = normalizedData.paidUpCapital.amount;
      updateData.paidUpCapitalCurrency = normalizedData.paidUpCapital.currency || 'SGD';
    } else if (normalizedData.shareCapital?.length) {
      const totalPaidUp = normalizedData.shareCapital
        .filter((c) => c.isPaidUp && !c.isTreasury)
        .reduce((sum, c) => sum + c.totalValue, 0);
      updateData.paidUpCapitalAmount = totalPaidUp;
      updateData.paidUpCapitalCurrency = normalizedData.shareCapital[0]?.currency || 'SGD';
    }

    if (normalizedData.issuedCapital?.amount !== undefined) {
      updateData.issuedCapitalAmount = normalizedData.issuedCapital.amount;
      updateData.issuedCapitalCurrency = normalizedData.issuedCapital.currency || 'SGD';
    } else if (normalizedData.shareCapital?.length) {
      const totalIssued = normalizedData.shareCapital
        .filter((c) => !c.isTreasury)
        .reduce((sum, c) => sum + c.totalValue, 0);
      updateData.issuedCapitalAmount = totalIssued;
      updateData.issuedCapitalCurrency = normalizedData.shareCapital[0]?.currency || 'SGD';
    }
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

    // Create ProcessingDocument and DocumentRevision if they don't exist
    const existingProcessingDoc = await tx.processingDocument.findUnique({
      where: { documentId },
    });

    if (!existingProcessingDoc) {
      // Create ProcessingDocument for this BizFile
      const processingDoc = await tx.processingDocument.create({
        data: {
          documentId,
          isContainer: true,
          pipelineStatus: 'EXTRACTION_DONE',
          processingPriority: 'NORMAL',
          uploadSource: 'WEB',
        },
      });

      // Create DocumentRevision with BizFile metadata
      const revision = await tx.documentRevision.create({
        data: {
          processingDocumentId: processingDoc.id,
          revisionNumber: 1,
          revisionType: 'EXTRACTION',
          status: 'APPROVED',
          reason: 'BizFile extraction auto-approved',
          documentCategory: 'CORPORATE_SECRETARIAL',
          documentSubCategory: 'BIZFILE',
          vendorName: 'Accounting and Corporate Regulatory Authority',
          documentNumber: normalizedData.documentMetadata?.receiptNo || null,
          documentDate: normalizedData.documentMetadata?.receiptDate
            ? new Date(normalizedData.documentMetadata.receiptDate)
            : null,
          currency: 'SGD',
          totalAmount: 0,
          createdById: userId,
          approvedById: userId,
          approvedAt: new Date(),
        },
      });

      // Link revision to processing document
      await tx.processingDocument.update({
        where: { id: processingDoc.id },
        data: { currentRevisionId: revision.id },
      });
    }
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

// ============================================================================
// Full Processing (Create or fully update company)
// ============================================================================

/**
 * Process BizFile extraction - creates or updates company with all extracted data
 */
export async function processBizFileExtraction(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string,
  storageKey?: string,
  mimeType?: string
): Promise<ProcessingResult> {
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
        // Calculate totalValue if not provided (numberOfShares * parValue, or use 0 as fallback)
        const totalValue = capital.totalValue ?? (capital.parValue ? capital.numberOfShares * capital.parValue : 0);
        await tx.shareCapital.create({
          data: {
            companyId: company.id,
            shareClass: capital.shareClass,
            currency: capital.currency,
            numberOfShares: capital.numberOfShares,
            parValue: capital.parValue,
            totalValue,
            isPaidUp: capital.isPaidUp,
            isTreasury: capital.isTreasury || false,
            effectiveDate: new Date(),
            sourceDocumentId: documentId,
          },
        });
      }

      // Use directly extracted capital if available, otherwise calculate from share capital
      let totalPaidUp: number;
      let totalIssued: number;
      let primaryCurrency: string;

      if (normalizedData.paidUpCapital?.amount !== undefined) {
        // Use directly extracted paid-up capital from bizfile
        totalPaidUp = normalizedData.paidUpCapital.amount;
        primaryCurrency = normalizedData.paidUpCapital.currency || 'SGD';
      } else {
        // Fallback: Calculate from share capital (legacy behavior)
        totalPaidUp = normalizedData.shareCapital
          .filter((c) => c.isPaidUp && !c.isTreasury)
          .reduce((sum, c) => sum + c.totalValue, 0);
        primaryCurrency = normalizedData.shareCapital[0]?.currency || 'SGD';
      }

      if (normalizedData.issuedCapital?.amount !== undefined) {
        // Use directly extracted issued capital from bizfile
        totalIssued = normalizedData.issuedCapital.amount;
      } else {
        // Fallback: Calculate from share capital (legacy behavior)
        totalIssued = normalizedData.shareCapital
          .filter((c) => !c.isTreasury)
          .reduce((sum, c) => sum + c.totalValue, 0);
      }

      await tx.company.update({
        where: { id: company.id },
        data: {
          paidUpCapitalAmount: totalPaidUp,
          paidUpCapitalCurrency: primaryCurrency,
          issuedCapitalAmount: totalIssued,
          issuedCapitalCurrency: normalizedData.issuedCapital?.currency || primaryCurrency,
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

    // Create ProcessingDocument for this BizFile
    const processingDoc = await tx.processingDocument.create({
      data: {
        documentId,
        isContainer: true,
        pipelineStatus: 'EXTRACTION_DONE',
        processingPriority: 'NORMAL',
        uploadSource: 'WEB',
      },
    });

    // Create DocumentRevision with BizFile metadata
    const revision = await tx.documentRevision.create({
      data: {
        processingDocumentId: processingDoc.id,
        revisionNumber: 1,
        revisionType: 'EXTRACTION',
        status: 'APPROVED',
        reason: 'BizFile extraction auto-approved',
        documentCategory: 'CORPORATE_SECRETARIAL',
        documentSubCategory: 'BIZFILE',
        vendorName: 'Accounting and Corporate Regulatory Authority',
        documentNumber: normalizedData.documentMetadata?.receiptNo || null,
        documentDate: normalizedData.documentMetadata?.receiptDate
          ? new Date(normalizedData.documentMetadata.receiptDate)
          : null,
        currency: 'SGD',
        totalAmount: 0,
        createdById: userId,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    // Link revision to processing document
    await tx.processingDocument.update({
      where: { id: processingDoc.id },
      data: { currentRevisionId: revision.id },
    });

    return { company, processingDocId: processingDoc.id };
  });

  // Prepare document pages for the page sidebar (outside transaction)
  if (storageKey && mimeType) {
    await prepareDocumentPages(result.processingDocId, storageKey, mimeType);
  }

  // Rename document file to standardized format (outside transaction)
  if (storageKey) {
    try {
      // Get the document record to get current filename
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        select: { fileName: true, storageKey: true },
      });

      if (document?.storageKey) {
        const extension = getFileExtension(document.fileName || document.storageKey);
        const newFilename = generateApprovedDocumentFilename({
          documentSubCategory: 'BIZFILE',
          documentDate: normalizedData.documentMetadata?.receiptDate
            ? new Date(normalizedData.documentMetadata.receiptDate)
            : null,
          contactName: 'Accounting and Corporate Regulatory Authority',
          documentNumber: normalizedData.documentMetadata?.receiptNo || null,
          currency: 'SGD',
          totalAmount: 0,
          originalExtension: extension,
        });

        const newStorageKey = buildApprovedStorageKey(document.storageKey, newFilename);

        if (newStorageKey !== document.storageKey) {
          const fileExists = await storage.exists(document.storageKey);

          if (fileExists) {
            await storage.move(document.storageKey, newStorageKey);
            await prisma.document.update({
              where: { id: documentId },
              data: {
                fileName: newFilename,
                storageKey: newStorageKey,
              },
            });
            log.info(`Renamed BizFile document to: ${newFilename}`);
          } else {
            // File doesn't exist, still update filename for display
            await prisma.document.update({
              where: { id: documentId },
              data: { fileName: newFilename },
            });
          }
        }
      }
    } catch (error) {
      // Log error but don't fail the extraction
      log.error(`Failed to rename BizFile document: ${error}`);
    }
  }

  // Create audit log - MUST include tenantId for proper scoping
  const actionVerb = isNewCompany ? 'Created' : 'Updated';
  await createAuditLog({
    tenantId,
    userId,
    companyId: result.company.id,
    action: isNewCompany ? 'CREATE' : 'UPDATE',
    entityType: 'Company',
    entityId: result.company.id,
    entityName: entityDetails.name,
    summary: `${actionVerb} company "${entityDetails.name}" (UEN: ${entityDetails.uen}) from BizFile extraction`,
    changeSource: 'BIZFILE_UPLOAD',
    metadata: {
      documentId,
      uen: entityDetails.uen,
      extractedFields: Object.keys(normalizedData),
    },
  });

  return { companyId: result.company.id, created: isNewCompany };
}
