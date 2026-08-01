/** Bizfile processing orchestration. Company persistence lives in company-sync.ts. */
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { createCompanyContactRelation, type PrismaTransactionClient } from '../contact.service';
import { previewContactIdentity, resolveOrCreateContact } from '../contact-identity.service';
import type { ContactIdentityCandidate, ContactResolutionDecision } from '@/types/contact-identity';
import type {
  ExtractedBizFileData,
  OfficerAction,
  SelectiveProcessingResult,
  ProcessingResult,
} from './types';
import { mapIdentificationType } from './types';
import { normalizeExtractedData } from './normalizer';
import { syncCompanyFromBizfileInTransaction } from './company-sync';
import { prepareDocumentPages } from '../document-processing.service';
import {
  generateApprovedDocumentFilename,
  buildApprovedStorageKey,
  getFileExtension,
} from '@/lib/storage/filename';
import { storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import type { TaskLaunchContext } from '@/services/tasks/types';

const log = createLogger('bizfile-processor');

type Officer = NonNullable<ExtractedBizFileData['officers']>[number];
type Shareholder = NonNullable<ExtractedBizFileData['shareholders']>[number];

function splitIndividualName(name: string): { firstName: string; lastName?: string } {
  const [firstName = '', ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ');
  return { firstName, ...(lastName ? { lastName } : {}) };
}

function officerIdentityCandidate(officer: Officer, sourceRecordId: string): ContactIdentityCandidate {
  return {
    source: 'BIZFILE',
    sourceRecordId,
    contactType: 'INDIVIDUAL',
    ...splitIndividualName(officer.name),
    identificationType: mapIdentificationType(officer.identificationType) || undefined,
    identificationNumber: officer.identificationNumber,
    nationality: officer.nationality,
    fullAddress: officer.address,
  };
}

function shareholderIdentityCandidate(
  shareholder: Shareholder,
  sourceRecordId: string,
): ContactIdentityCandidate {
  if (shareholder.type === 'CORPORATE') {
    return {
      source: 'BIZFILE',
      sourceRecordId,
      contactType: 'CORPORATE',
      corporateName: shareholder.name,
      corporateUen: shareholder.identificationNumber,
      fullAddress: shareholder.address,
    };
  }
  return {
    source: 'BIZFILE',
    sourceRecordId,
    contactType: 'INDIVIDUAL',
    ...splitIndividualName(shareholder.name),
    identificationType: mapIdentificationType(shareholder.identificationType) || undefined,
    identificationNumber: shareholder.identificationNumber,
    nationality: shareholder.nationality,
    fullAddress: shareholder.address,
  };
}

function reviewedDecision(
  decision: Officer['contactResolution'] | Shareholder['contactResolution'],
): ContactResolutionDecision {
  return decision ?? { action: 'AUTO' };
}

async function resolveBizfileContact(
  record: Officer | Shareholder,
  kind: 'officer' | 'shareholder',
  sourceIndex: number,
  context: { tenantId: string; userId: string; tx: PrismaTransactionClient },
  autoCreatedContactIds: Set<string>,
): Promise<string> {
  const sourceRecordId = `${kind === 'officer' ? 'officers' : 'shareholders'}.${sourceIndex}`;
  const candidate = kind === 'officer'
    ? officerIdentityCandidate(record as Officer, sourceRecordId)
    : shareholderIdentityCandidate(record as Shareholder, sourceRecordId);
  const decision = record.contactResolution;

  if (!decision) {
    const match = await previewContactIdentity(candidate, context.tenantId, context.tx);
    if (match && !autoCreatedContactIds.has(match.contactId)) {
      throw new Error(`Review the contact match for ${sourceRecordId} before continuing`);
    }
  }

  const result = await resolveOrCreateContact(candidate, reviewedDecision(decision), context);
  if (!decision && result.outcome === 'CREATED') autoCreatedContactIds.add(result.contact.id);
  return result.contact.id;
}

function durableTaskContext(taskContext?: TaskLaunchContext) {
  if (!taskContext) return undefined;
  return {
    taskId: taskContext.taskId,
    taskStageId: taskContext.taskStageId,
    ...(taskContext.returnTo ? { returnTo: taskContext.returnTo } : {}),
  };
}

async function persistTaskRecovery(
  tx: PrismaTransactionClient,
  companyId: string,
  tenantId: string,
  taskContext?: TaskLaunchContext,
) {
  if (!taskContext) return;
  await tx.company.update({
    where: { id: companyId },
    data: { taskIntegrationContext: durableTaskContext(taskContext) },
  });
  await tx.taskCompanyRecoveryContext.upsert({
    where: { tenantId_taskStageId: { tenantId, taskStageId: taskContext.taskStageId } },
    create: {
      tenantId,
      companyId,
      taskId: taskContext.taskId,
      taskStageId: taskContext.taskStageId,
      returnTo: taskContext.returnTo,
    },
    update: {
      companyId,
      taskId: taskContext.taskId,
      returnTo: taskContext.returnTo,
    },
  });
}

async function persistDocumentApproval(
  tx: PrismaTransactionClient,
  args: {
    documentId: string;
    companyId: string;
    tenantId: string;
    userId: string;
    data: ExtractedBizFileData;
  },
): Promise<string> {
  await tx.document.update({
    where: { id: args.documentId },
    data: {
      companyId: args.companyId,
      extractionStatus: 'COMPLETED',
      extractedAt: new Date(),
      extractedData: args.data as object,
    },
  });

  let processing = await tx.processingDocument.findUnique({
    where: { documentId: args.documentId },
    select: { id: true },
  });
  if (!processing) {
    processing = await tx.processingDocument.create({
      data: {
        documentId: args.documentId,
        tenantId: args.tenantId,
        isContainer: true,
        pipelineStatus: 'EXTRACTION_DONE',
        processingPriority: 'NORMAL',
        uploadSource: 'WEB',
      },
      select: { id: true },
    });
    const revision = await tx.documentRevision.create({
      data: {
        processingDocumentId: processing.id,
        revisionNumber: 1,
        revisionType: 'EXTRACTION',
        status: 'APPROVED',
        reason: 'BizFile extraction auto-approved',
        documentCategory: 'CORPORATE_SECRETARIAL',
        documentSubCategory: 'BIZFILE',
        vendorName: 'Accounting and Corporate Regulatory Authority',
        documentNumber: args.data.documentMetadata?.receiptNo || null,
        documentDate: args.data.documentMetadata?.receiptDate
          ? new Date(args.data.documentMetadata.receiptDate)
          : null,
        currency: 'SGD',
        totalAmount: 0,
        createdById: args.userId,
        approvedById: args.userId,
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.processingDocument.update({
      where: { id: processing.id },
      data: { currentRevisionId: revision.id },
    });
  }
  return processing.id;
}

async function applyReviewedData(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string,
  existingCompanyId?: string,
  officerActions?: OfficerAction[],
  taskIntegrationContext?: TaskLaunchContext,
) {
  const normalizedData = normalizeExtractedData(extractedData);
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as PrismaTransactionClient;
    const autoCreatedContactIds = new Set<string>();
    const synced = await syncCompanyFromBizfileInTransaction({
      data: normalizedData,
      documentId,
      tenantId,
      userId,
      existingCompanyId,
      officerActions,
    }, tx, {
      resolveContact: async (record, kind, index, companyId) => {
        const contactId = await resolveBizfileContact(
          record,
          kind,
          index,
          { tenantId, userId, tx },
          autoCreatedContactIds,
        );
        await createCompanyContactRelation(
          contactId,
          companyId,
          kind === 'officer' ? (record as Officer).role : 'Shareholder',
          false,
          tx,
        );
        return contactId;
      },
    });
    await persistTaskRecovery(tx, synced.companyId, tenantId, taskIntegrationContext);
    const processingDocumentId = await persistDocumentApproval(tx, {
      documentId,
      companyId: synced.companyId,
      tenantId,
      userId,
      data: normalizedData,
    });
    return { ...synced, processingDocumentId, normalizedData };
  });
}

export async function processBizFileExtractionSelective(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string,
  existingCompanyId: string,
  officerActions?: OfficerAction[],
  taskIntegrationContext?: TaskLaunchContext,
): Promise<SelectiveProcessingResult> {
  const result = await applyReviewedData(
    documentId,
    extractedData,
    userId,
    tenantId,
    existingCompanyId,
    officerActions,
    taskIntegrationContext,
  );
  return {
    companyId: result.companyId,
    created: false,
    updatedFields: result.changedSections,
    officerChanges: {
      added: extractedData.officers?.length ?? 0,
      updated: 0,
      ceased: officerActions?.filter((action) => action.action === 'cease').length ?? 0,
      followUp: officerActions?.filter((action) => action.action === 'follow_up').length ?? 0,
    },
    shareholderChanges: {
      added: extractedData.shareholders?.length ?? 0,
      updated: 0,
      removed: 0,
    },
  };
}

async function moveAndRenameDocument(
  documentId: string,
  companyId: string,
  tenantId: string,
  data: ExtractedBizFileData,
  storageKey?: string,
): Promise<string | undefined> {
  let activeStorageKey = storageKey;
  if (activeStorageKey?.includes('/pending/')) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { fileName: true },
    });
    if (document) {
      const extension = document.fileName.match(/\.[^.]+$/)?.[0] || '';
      const nextKey = `${tenantId}/companies/${companyId}/documents/${documentId}/original${extension}`;
      try {
        await storage.move(activeStorageKey, nextKey);
        await prisma.document.update({ where: { id: documentId }, data: { storageKey: nextKey } });
        activeStorageKey = nextKey;
      } catch (error) {
        log.error(`Failed to move BizFile from ${activeStorageKey} to ${nextKey}:`, error);
      }
    }
  }

  if (!activeStorageKey) return activeStorageKey;
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { fileName: true, storageKey: true },
    });
    if (!document?.storageKey) return activeStorageKey;
    const extension = getFileExtension(document.fileName || document.storageKey);
    const fileName = generateApprovedDocumentFilename({
      documentSubCategory: 'BIZFILE',
      documentDate: data.documentMetadata?.receiptDate
        ? new Date(data.documentMetadata.receiptDate)
        : null,
      contactName: 'Accounting and Corporate Regulatory Authority',
      documentNumber: data.documentMetadata?.receiptNo || null,
      currency: 'SGD',
      totalAmount: 0,
      originalExtension: extension,
    });
    const nextKey = buildApprovedStorageKey(document.storageKey, fileName);
    if (nextKey === document.storageKey) return activeStorageKey;
    if (await storage.exists(document.storageKey)) {
      await storage.move(document.storageKey, nextKey);
      await prisma.document.update({
        where: { id: documentId },
        data: { fileName, storageKey: nextKey },
      });
      return nextKey;
    }
    await prisma.document.update({ where: { id: documentId }, data: { fileName } });
  } catch (error) {
    log.error(`Failed to rename BizFile document: ${error}`);
  }
  return activeStorageKey;
}

export async function processBizFileExtraction(
  documentId: string,
  extractedData: ExtractedBizFileData,
  userId: string,
  tenantId: string,
  storageKey?: string,
  mimeType?: string,
  taskIntegrationContext?: TaskLaunchContext,
): Promise<ProcessingResult> {
  const normalizedData = normalizeExtractedData(extractedData);
  const existing = await prisma.company.findFirst({
    where: { tenantId, uen: normalizedData.entityDetails.uen },
    select: { id: true },
  });
  const result = await applyReviewedData(
    documentId,
    normalizedData,
    userId,
    tenantId,
    existing?.id,
    undefined,
    taskIntegrationContext,
  );

  const activeStorageKey = await moveAndRenameDocument(
    documentId,
    result.companyId,
    tenantId,
    normalizedData,
    storageKey,
  );
  if (activeStorageKey && mimeType) {
    await prepareDocumentPages(result.processingDocumentId, activeStorageKey, mimeType);
  }

  await createAuditLog({
    tenantId,
    userId,
    companyId: result.companyId,
    action: result.created ? 'CREATE' : 'UPDATE',
    entityType: 'Company',
    entityId: result.companyId,
    entityName: normalizedData.entityDetails.name,
    summary: `${result.created ? 'Created' : 'Updated'} company "${normalizedData.entityDetails.name}" (UEN: ${normalizedData.entityDetails.uen}) from BizFile extraction`,
    changeSource: 'BIZFILE_UPLOAD',
    metadata: { documentId, extractedFields: Object.keys(normalizedData) },
  });

  return { companyId: result.companyId, created: result.created };
}
