import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  OAKDOC_MIME_TYPE,
  readOakDocTemplateMetadata,
} from '@/lib/document-editor/oakdoc-template';
import {
  OAKDOC_GENERATED_CONTENT,
  mergeGeneratedOakDocMetadata,
  readGeneratedOakDocAssetMetadata,
  type GeneratedOakDocAssetMetadata,
} from '@/lib/document-editor/document-engine';
import {
  inspectOakDocConditions,
  resolveOakDocConditions,
} from '@/lib/document-editor/oakdoc-conditions';
import {
  inspectOakDocFields,
  pruneDeletedOakDocFields,
  resolveOakDocFields,
} from '@/lib/document-editor/oakdoc-fields';
import {
  resolveOakDocRepeaters,
} from '@/lib/document-editor/oakdoc-repeaters';
import {
  buildOakDocResolutionValues,
  type OakDocCompanyDetail,
} from '@/lib/document-editor/oakdoc-context';
import {
  claimGeneratedDocumentRevision,
} from '@/lib/document-editor/generated-document-revision';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { storage, StorageKeys } from '@/lib/storage';
import type { TenantAwareParams } from '@/lib/types';
import type { TaskLaunchContext } from '@/services/tasks/types';
import { getCompanyById } from '@/services/company.service';
import { downloadOakDocTemplate } from '@/services/oakdoc-template.service';

function sha256(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function safeDocxName(value: string): string {
  const base = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'OakDoc';
  return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`;
}

function toOakDocCompanyDetail(value: unknown): OakDocCompanyDetail {
  // Prisma Dates and Decimal values are serialized to stable string forms.
  // OakDoc's resolver deliberately accepts date strings and numeric strings.
  return JSON.parse(JSON.stringify(value)) as OakDocCompanyDetail;
}

function taskMetadata(
  task?: TaskLaunchContext,
): Record<string, unknown> | undefined {
  if (!task) return undefined;
  return {
    taskId: task.taskId,
    taskStageId: task.taskStageId,
    ...(task.returnTo ? { returnTo: task.returnTo } : {}),
  };
}

export interface OakDocGenerationInput {
  templateId: string;
  companyId: string;
  selectedDirectorId?: string;
  selectedShareholderId?: string;
  resolutionDate?: Date | string;
  generatedBy?: string;
}

export interface OakDocGenerationResult {
  bytes: Buffer;
  values: Record<string, string>;
  template: {
    id: string;
    name: string;
    version: number;
    sha256: string;
    fileName: string;
  };
  metadata: Omit<
    GeneratedOakDocAssetMetadata,
    'storageKey' | 'fileName' | 'fileSize' | 'sha256' | 'generatedAt'
  >;
}

/**
 * Resolve one OakDoc master entirely in memory.
 *
 * The immutable template asset is downloaded, copied into Uint8Array transforms,
 * and never written back to the template storage key.
 */
export async function generateOakDocBytes(
  input: OakDocGenerationInput,
  params: Pick<TenantAwareParams, 'tenantId'>,
): Promise<OakDocGenerationResult> {
  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: input.templateId,
      tenantId: params.tenantId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      version: true,
      contentJson: true,
    },
  });
  if (!template) throw new NotFoundError('OakDoc template not found');

  const templateMetadata = readOakDocTemplateMetadata(template.contentJson);
  if (!templateMetadata) {
    throw new ValidationError('The selected template is not an OakDoc template');
  }

  const company = await getCompanyById(input.companyId, params.tenantId);
  if (!company) throw new NotFoundError('Company not found');

  const { buffer: masterBuffer, metadata: downloadedMetadata } =
    await downloadOakDocTemplate(template.id, params.tenantId);
  const masterBytes = new Uint8Array(masterBuffer);
  const knownTags = new Set(downloadedMetadata.fieldTags);

  const fieldSummary = inspectOakDocFields(masterBytes);
  const conditionSummary = inspectOakDocConditions(masterBytes);
  const resolutionTags = Array.from(new Set([
    ...downloadedMetadata.fieldTags,
    ...fieldSummary.tags,
    ...conditionSummary.fieldTags,
  ]));
  const values = buildOakDocResolutionValues({
    company: toOakDocCompanyDetail(company),
    fieldTags: resolutionTags,
    selectedDirectorId: input.selectedDirectorId,
    selectedShareholderId: input.selectedShareholderId,
    resolution: { date: input.resolutionDate },
    generatedBy: input.generatedBy,
  });

  const cleaned = pruneDeletedOakDocFields(masterBytes, knownTags);
  const conditioned = resolveOakDocConditions({
    docxBytes: cleaned.bytes,
    values,
    allowedFields: new Set(resolutionTags),
  });
  if (conditioned.unresolvedFields.length > 0) {
    throw new ValidationError(
      `Conditional fields are unavailable: ${conditioned.unresolvedFields.join(', ')}`,
      { fields: conditioned.unresolvedFields },
    );
  }

  const repeated = resolveOakDocRepeaters({
    docxBytes: conditioned.bytes,
    company: toOakDocCompanyDetail(company),
  });
  const resolved = resolveOakDocFields(repeated.bytes, values);
  const bytes = Buffer.from(resolved.bytes);

  return {
    bytes,
    values,
    template: {
      id: template.id,
      name: template.name,
      version: template.version,
      sha256: templateMetadata.sha256,
      fileName: templateMetadata.fileName,
    },
    metadata: {
      schemaVersion: 1,
      mimeType: OAKDOC_MIME_TYPE,
      templateId: template.id,
      templateVersion: template.version,
      templateSha256: templateMetadata.sha256,
      fieldsUpdated: resolved.updated,
      unresolvedTags: resolved.unresolvedTags,
      conditionsResolved: conditioned.resolved,
      conditionsKept: conditioned.kept,
      conditionsRemoved: conditioned.removed,
      repeatersResolved: repeated.repeatersResolved,
      repeaterItemsCreated: repeated.itemsCreated,
    },
  };
}

export interface MaterializeOakDocInput extends OakDocGenerationInput {
  generatedDocumentId: string;
  expectedRevision: number;
  expectedBatchItemId?: string;
  title: string;
  contactIds?: string[];
}

/**
 * Persist a resolved OakDoc into the ordinary GeneratedDocument lifecycle.
 *
 * The generated DOCX is uploaded to a generated-document key. Database update
 * uses the same revision claim as A4 documents; an uploaded orphan is deleted
 * when the claim/update fails.
 */
export async function materializeOakDocGeneratedDocument(
  input: MaterializeOakDocInput,
  params: TenantAwareParams,
  taskIntegrationContext?: TaskLaunchContext,
) {
  const existing = await prisma.generatedDocument.findFirst({
    where: {
      id: input.generatedDocumentId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
  });
  if (!existing) throw new NotFoundError('Document draft not found');
  if (existing.status !== 'DRAFT') {
    throw new ValidationError('Only draft documents can be generated');
  }

  if (input.expectedBatchItemId) {
    const item = await prisma.documentGenerationBatchItem.findFirst({
      where: {
        id: input.expectedBatchItemId,
        tenantId: params.tenantId,
        generatedDocumentId: input.generatedDocumentId,
        templateId: input.templateId,
      },
      select: { id: true },
    });
    if (!item) throw new NotFoundError('Batch item not found');
  }

  const generation = await generateOakDocBytes(input, params);
  const assetId = randomUUID();
  const storageKey = StorageKeys.oakDocGeneratedAsset(
    params.tenantId,
    input.generatedDocumentId,
    assetId,
  );
  const fileName = safeDocxName(input.title);
  const generatedAt = new Date().toISOString();
  const digest = sha256(generation.bytes);

  await storage.upload(storageKey, generation.bytes, {
    contentType: OAKDOC_MIME_TYPE,
    metadata: {
      tenantId: params.tenantId,
      generatedDocumentId: input.generatedDocumentId,
      templateId: generation.template.id,
      templateVersion: String(generation.template.version),
      templateSha256: generation.template.sha256,
      sha256: digest,
      generatedBy: params.userId,
    },
  });

  const assetMetadata: GeneratedOakDocAssetMetadata = {
    ...generation.metadata,
    storageKey,
    fileName,
    fileSize: generation.bytes.byteLength,
    sha256: digest,
    generatedAt,
  };
  const selectedParties = {
    ...(input.selectedDirectorId ? { directorId: input.selectedDirectorId } : {}),
    ...(input.selectedShareholderId ? { shareholderId: input.selectedShareholderId } : {}),
    ...(input.contactIds?.length ? { contactIds: input.contactIds } : {}),
  };

  try {
    const document = await prisma.$transaction(async (tx) => {
      const claim = await claimGeneratedDocumentRevision(tx, {
        id: input.generatedDocumentId,
        tenantId: params.tenantId,
        expectedRevision: input.expectedRevision,
        allowedStatuses: ['DRAFT'],
      });
      const updated = await tx.generatedDocument.update({
        where: { id: input.generatedDocumentId },
        data: {
          template: { connect: { id: generation.template.id } },
          templateVersion: generation.template.version,
          company: { connect: { id: input.companyId } },
          title: input.title,
          content: OAKDOC_GENERATED_CONTENT,
          contentJson: {
            documentEngine: 'OAKDOC',
            schemaVersion: 1,
          } as Prisma.InputJsonValue,
          status: 'DRAFT',
          useLetterhead: false,
          placeholderData: generation.values as Prisma.InputJsonValue,
          metadata: mergeGeneratedOakDocMetadata(
            existing.metadata,
            assetMetadata,
            selectedParties,
            taskMetadata(taskIntegrationContext),
          ) as Prisma.InputJsonValue,
        },
      });
      return { ...updated, revision: claim.revision };
    });

    const previousAsset = readGeneratedOakDocAssetMetadata(existing.metadata);
    if (
      previousAsset
      && previousAsset.storageKey !== storageKey
      && previousAsset.storageKey.startsWith(
        `${params.tenantId}/generated-documents/${input.generatedDocumentId}/oakdoc/`,
      )
    ) {
      await storage.delete(previousAsset.storageKey).catch(() => undefined);
    }

    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      companyId: input.companyId,
      action: 'DOCUMENT_GENERATED',
      entityType: 'GeneratedDocument',
      entityId: document.id,
      entityName: document.title,
      summary: `Generated OakDoc document "${document.title}" from template "${generation.template.name}"`,
      changeSource: 'MANUAL',
      metadata: {
        documentEngine: 'OAKDOC',
        templateId: generation.template.id,
        templateVersion: generation.template.version,
        templateSha256: generation.template.sha256,
        generatedAssetSha256: digest,
        revision: document.revision,
        selectedParties,
      },
    });

    return document;
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function downloadGeneratedOakDoc(
  documentId: string,
  tenantId: string,
): Promise<{ buffer: Buffer; metadata: GeneratedOakDocAssetMetadata }> {
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
    select: { metadata: true },
  });
  if (!document) throw new NotFoundError('Document not found');

  const metadata = readGeneratedOakDocAssetMetadata(document.metadata);
  if (!metadata) throw new ValidationError('This generated document is not an OakDoc document');
  const requiredPrefix = `${tenantId}/generated-documents/${documentId}/oakdoc/`;
  if (!metadata.storageKey.startsWith(requiredPrefix)) {
    throw new ValidationError('Generated OakDoc storage scope is invalid');
  }

  const buffer = await storage.download(metadata.storageKey);
  if (sha256(buffer) !== metadata.sha256) {
    throw new ValidationError('Generated OakDoc asset integrity check failed');
  }
  return { buffer, metadata };
}
