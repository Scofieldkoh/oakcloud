import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { ensureA4ServerDomGlobals } from '@/lib/document-editor/a4-server-dom';
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
  OAKDOC_CONDITION_TAG_PREFIX,
  inspectOakDocConditions,
  resolveOakDocConditions,
} from '@/lib/document-editor/oakdoc-conditions';
import {
  inspectOakDocFields,
  pruneDeletedOakDocFields,
  resolveOakDocFields,
} from '@/lib/document-editor/oakdoc-fields';
import {
  buildOakDocResolutionValues,
  type OakDocAgreementContext,
  type OakDocCompanyDetail,
} from '@/lib/document-editor/oakdoc-context';
import {
  claimGeneratedDocumentRevision,
  readGeneratedDocumentRevision,
} from '@/lib/document-editor/generated-document-revision';
import {
  resolveOakDocRepeaters,
  OAKDOC_REPEATER_OUTER_TAGS,
  inspectOakDocRepeaters,
} from '@/lib/document-editor/oakdoc-repeaters';
import { OAKDOC_SIGNATURE_TAGS } from '@/lib/document-editor/oakdoc-signatures';
import {
  diagnoseOakDocTags,
  oakDocFieldContext,
  type OakDocFieldContext,
} from '@/lib/document-editor/oakdoc-field-registry';
import { resolveDocumentPartySelections } from '@/services/document-party.service';
import type { OakDocDiagnostic } from '@/types/oakdoc';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  OAKDOC_ERROR_REASONS,
  type OakDocSaveReceipt,
  type OakDocSnapshotIdentity,
} from '@/types/oakdoc';
import { storage, StorageKeys } from '@/lib/storage';
import { inspectOakDocPackage } from '@/lib/document-editor/oakdoc-package-policy';
import type { TenantAwareParams } from '@/lib/types';
import type { TaskLaunchContext } from '@/services/tasks/types';
import { getCompanyById } from '@/services/company.service';
import { downloadOakDocTemplate } from '@/services/oakdoc-template.service';

const log = createLogger('oakdoc-generation');

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
  /** Resolved through the canonical party service (must be linked to the company). */
  selectedContactId?: string;
  agreement?: OakDocAgreementContext;
  resolutionDate?: Date | string;
  generatedBy?: string;
}

const CONTEXT_LABELS: Partial<Record<OakDocFieldContext, string>> = {
  selectedDirector: 'a selected director',
  selectedShareholder: 'a selected shareholder',
  selectedContact: 'a selected contact',
  agreement: 'agreement details',
  resolution: 'a resolution date',
};

/**
 * Structured generation diagnostics: unsupported controls, and fields whose
 * required context was not supplied (distinct from a supplied-but-empty
 * value, which resolves to an empty field).
 */
export function diagnoseOakDocGeneration(input: {
  usedTags: readonly string[];
  provided: ReadonlySet<OakDocFieldContext>;
}): OakDocDiagnostic[] {
  const diagnostics = diagnoseOakDocTags(input.usedTags, 'render');
  const missing = new Map<OakDocFieldContext, string[]>();
  for (const tag of new Set(input.usedTags)) {
    const context = oakDocFieldContext(tag);
    if (!context || !CONTEXT_LABELS[context] || input.provided.has(context)) continue;
    missing.set(context, [...(missing.get(context) ?? []), tag]);
  }
  for (const [context, tags] of missing) {
    diagnostics.push({
      code: 'OAKDOC_CONTEXT_MISSING',
      severity: 'error',
      stage: 'render',
      message: `This template needs ${CONTEXT_LABELS[context]} (${tags.sort().join(', ')}).`,
      controlTag: tags[0],
    });
  }
  return diagnostics;
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
  diagnostics: OakDocDiagnostic[];
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
  // OakDoc's DOCX transforms use standard DOM XML APIs in both browser and
  // server runtimes. Install the shared JSDOM-backed globals explicitly here
  // so preview/generation never depends on an A4 code path running first.
  ensureA4ServerDomGlobals();

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

  const selectedContact = input.selectedContactId
    ? (await resolveDocumentPartySelections({
        companyId: input.companyId,
        tenantId: params.tenantId,
        selectedContactId: input.selectedContactId,
      })).selectedContact
    : undefined;
  const companyDetail = toOakDocCompanyDetail(company);
  const provided = new Set<OakDocFieldContext>(['company', 'system']);
  if (companyDetail.officers?.some((officer) => officer.id === input.selectedDirectorId)) {
    provided.add('selectedDirector');
  }
  if (companyDetail.shareholders?.some((holder) => holder.id === input.selectedShareholderId)) {
    provided.add('selectedShareholder');
  }
  if (selectedContact) provided.add('selectedContact');
  if (input.agreement) provided.add('agreement');
  if (input.resolutionDate) provided.add('resolution');
  const diagnostics = diagnoseOakDocGeneration({
    usedTags: [...fieldSummary.tags, ...conditionSummary.fieldTags],
    provided,
  });

  const values = buildOakDocResolutionValues({
    company: companyDetail,
    fieldTags: resolutionTags,
    selectedDirectorId: input.selectedDirectorId,
    selectedShareholderId: input.selectedShareholderId,
    selectedContact,
    agreement: input.agreement,
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
    company: companyDetail,
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
    diagnostics,
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

  let document;
  try {
    document = await prisma.$transaction(async (tx) => {
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
  } catch (error) {
    // Pre-commit failure: the new upload is unreferenced and safe to remove.
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  const previousAsset = readGeneratedOakDocAssetMetadata(existing.metadata);
  await afterCommit('delete superseded generated asset', () => deleteSupersededAsset(
    previousAsset?.storageKey,
    storageKey,
    `${params.tenantId}/generated-documents/${input.generatedDocumentId}/oakdoc/`,
  ));
  await afterCommit('audit generated materialization', () => createAuditLog({
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
  }));

  return document;
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


function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function selectedPartiesOf(metadata: unknown): Record<string, unknown> {
  return readRecord(readRecord(metadata).selectedParties);
}

/**
 * Work that runs after the database commit (old-asset cleanup, audit). A
 * failure here must never delete the committed asset or turn a committed save
 * into an error response, so it is logged and swallowed.
 */
async function afterCommit(label: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    log.warn(`OakDoc post-commit step failed: ${label}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteSupersededAsset(
  previousKey: string | undefined,
  nextKey: string,
  requiredPrefix: string,
): Promise<void> {
  if (!previousKey || previousKey === nextKey || !previousKey.startsWith(requiredPrefix)) return;
  await storage.delete(previousKey);
}

export interface SaveGeneratedOakDocInput {
  documentId: string;
  expectedRevision: number;
  bytes: Uint8Array;
  /** Client operation identity; a retried operation returns the same receipt. */
  operationId?: string;
  snapshot?: OakDocSnapshotIdentity;
}

export async function saveGeneratedOakDocDocument(
  input: SaveGeneratedOakDocInput,
  params: TenantAwareParams,
): Promise<OakDocSaveReceipt & { updatedAt: string }> {
  inspectOakDocPackage(input.bytes, 'draft');
  const operationId = input.operationId ?? randomUUID();

  const existing = await prisma.generatedDocument.findFirst({
    where: {
      id: input.documentId,
      tenantId: params.tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      metadata: true,
      updatedAt: true,
    },
  });
  if (!existing) throw new NotFoundError('Document not found');

  const currentAsset = readGeneratedOakDocAssetMetadata(existing.metadata);
  if (!currentAsset) {
    throw new ValidationError('This generated document is not an OakDoc document');
  }
  const digest = sha256(input.bytes);

  // Ambiguous-response retry: the same operation already committed these bytes.
  if (input.operationId && currentAsset.lastOperationId === input.operationId) {
    if (currentAsset.sha256 !== digest) {
      throw new ConflictError('This save operation was already used for different content', {
        reason: OAKDOC_ERROR_REASONS.STALE_REVISION,
      });
    }
    const revision = await readGeneratedDocumentRevision(prisma, existing.id, params.tenantId);
    return {
      ...input.snapshot,
      operationId,
      revision,
      assetSha256: digest,
      updatedAt: existing.updatedAt.toISOString(),
    };
  }

  if (existing.status !== 'DRAFT') {
    throw new ValidationError('Unlock the document before editing its DOCX');
  }

  const requiredPrefix = `${params.tenantId}/generated-documents/${input.documentId}/oakdoc/`;
  if (!currentAsset.storageKey.startsWith(requiredPrefix)) {
    throw new ValidationError('Generated OakDoc storage scope is invalid');
  }

  const savedAt = new Date().toISOString();
  const storageKey = StorageKeys.oakDocGeneratedAsset(
    params.tenantId,
    input.documentId,
    randomUUID(),
  );

  await storage.upload(storageKey, Buffer.from(input.bytes), {
    contentType: OAKDOC_MIME_TYPE,
    metadata: {
      tenantId: params.tenantId,
      generatedDocumentId: input.documentId,
      templateId: currentAsset.templateId,
      templateVersion: String(currentAsset.templateVersion),
      templateSha256: currentAsset.templateSha256,
      sha256: digest,
      generatedBy: params.userId,
      edited: 'true',
    },
  });

  const nextAsset: GeneratedOakDocAssetMetadata = {
    ...currentAsset,
    storageKey,
    fileSize: input.bytes.byteLength,
    sha256: digest,
    generatedAt: savedAt,
    lastOperationId: operationId,
  };

  let result: { revision: number; updatedAt: Date };
  try {
    result = await prisma.$transaction(async (tx) => {
      const claim = await claimGeneratedDocumentRevision(tx, {
        id: input.documentId,
        tenantId: params.tenantId,
        expectedRevision: input.expectedRevision,
        allowedStatuses: ['DRAFT'],
      });
      // A batch preview under review must be saved through the batch route,
      // which also checks batch revision and preview freshness.
      const batchItem = await tx.documentGenerationBatchItem.findFirst({
        where: { generatedDocumentId: input.documentId, tenantId: params.tenantId },
        select: { status: true },
      });
      if (batchItem && batchItem.status !== 'GENERATED') {
        throw new ConflictError('Save this draft from its generation batch review', {
          reason: OAKDOC_ERROR_REASONS.STALE_REVISION,
          batchReview: true,
        });
      }
      const updated = await tx.generatedDocument.update({
        where: { id: input.documentId },
        data: {
          content: OAKDOC_GENERATED_CONTENT,
          contentJson: {
            documentEngine: 'OAKDOC',
            schemaVersion: 1,
          } as Prisma.InputJsonValue,
          metadata: mergeGeneratedOakDocMetadata(
            existing.metadata,
            nextAsset,
            selectedPartiesOf(existing.metadata),
          ) as Prisma.InputJsonValue,
        },
        select: { updatedAt: true },
      });
      return {
        revision: claim.revision,
        updatedAt: updated.updatedAt,
      };
    });
  } catch (error) {
    // Pre-commit failure: the new upload is unreferenced and safe to remove.
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  await afterCommit('delete superseded generated asset', () => (
    deleteSupersededAsset(currentAsset.storageKey, storageKey, requiredPrefix)
  ));
  await afterCommit('audit generated save', () => createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: existing.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'GeneratedDocument',
    entityId: existing.id,
    entityName: existing.title,
    summary: `Saved edited OakDoc document "${existing.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      documentEngine: 'OAKDOC',
      generatedAssetSha256: digest,
      revision: result.revision,
      operationId,
    },
  }));

  return {
    ...input.snapshot,
    operationId,
    revision: result.revision,
    assetSha256: digest,
    updatedAt: result.updatedAt.toISOString(),
  };
}

export interface OakDocFinalizationCheck {
  ready: boolean;
  unresolvedFields: string[];
  unresolvedConditions: number;
  unresolvedRepeaters: number;
}

/**
 * Validate the actual reviewed bytes (not template output or old top-level
 * arrays) before a native document is finalized or used for activation.
 */
export async function checkGeneratedOakDocFinalization(
  documentId: string,
  tenantId: string,
): Promise<OakDocFinalizationCheck> {
  ensureA4ServerDomGlobals();
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
    select: { placeholderData: true },
  });
  if (!document) throw new NotFoundError('Document not found');
  const { buffer } = await downloadGeneratedOakDoc(documentId, tenantId);
  const bytes = new Uint8Array(buffer);
  inspectOakDocPackage(bytes, 'draft');

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(readRecord(document.placeholderData))) {
    if (typeof value === 'string') values[key] = value;
  }
  const unresolvedFields = resolveOakDocFields(bytes, values).unresolvedTags
    .filter((tag) => !OAKDOC_SIGNATURE_TAGS.has(tag))
    .filter((tag) => !OAKDOC_REPEATER_OUTER_TAGS.has(tag))
    .filter((tag) => !tag.startsWith(OAKDOC_CONDITION_TAG_PREFIX));
  const unresolvedConditions = inspectOakDocConditions(bytes).count;
  const unresolvedRepeaters = inspectOakDocRepeaters(bytes).count;

  return {
    ready: unresolvedFields.length === 0 && unresolvedConditions === 0 && unresolvedRepeaters === 0,
    unresolvedFields,
    unresolvedConditions,
    unresolvedRepeaters,
  };
}

export async function assertGeneratedOakDocReadyForFinalization(
  documentId: string,
  tenantId: string,
): Promise<void> {
  const check = await checkGeneratedOakDocFinalization(documentId, tenantId);
  if (check.ready) return;
  throw new ValidationError(
    'Resolve the remaining OakDoc fields, conditions and repeaters before finalizing',
    {
      reason: OAKDOC_ERROR_REASONS.UNRESOLVED_CONTROLS,
      fields: check.unresolvedFields,
      conditions: check.unresolvedConditions,
      repeaters: check.unresolvedRepeaters,
    },
  );
}

/** Metadata that belongs to the source record's lifecycle and is not cloned. */
const CLONE_RESET_METADATA_KEYS = [
  'oakDocReviewDraft',
  'oakDocPdfRendition',
  'oakDocValidation',
  'oakDocMigration',
  'taskIntegrationContext',
  'missingPlaceholders',
  'missingPartials',
  'circularPartials',
  'syntaxErrors',
  'unknownPlaceholders',
];

/**
 * Clone a native generated document into a new DRAFT that owns its own copy
 * of the verified DOCX bytes. Finalization, review, rendition, validation and
 * task authority are not inherited; source provenance is recorded instead.
 */
export async function cloneOakDocGeneratedDocument(
  input: { sourceId: string; title: string },
  params: TenantAwareParams,
) {
  const source = await prisma.generatedDocument.findFirst({
    where: { id: input.sourceId, tenantId: params.tenantId, deletedAt: null },
  });
  if (!source) throw new NotFoundError('Document not found');
  const { buffer, metadata: sourceAsset } = await downloadGeneratedOakDoc(source.id, params.tenantId);
  const sourceRevision = await readGeneratedDocumentRevision(prisma, source.id, params.tenantId);

  const id = randomUUID();
  const storageKey = StorageKeys.oakDocGeneratedAsset(params.tenantId, id, randomUUID());
  const clonedAt = new Date().toISOString();
  await storage.upload(storageKey, buffer, {
    contentType: OAKDOC_MIME_TYPE,
    metadata: {
      tenantId: params.tenantId,
      generatedDocumentId: id,
      templateId: sourceAsset.templateId,
      templateVersion: String(sourceAsset.templateVersion),
      templateSha256: sourceAsset.templateSha256,
      sha256: sourceAsset.sha256,
      generatedBy: params.userId,
      clonedFrom: source.id,
    },
  });

  const baseMetadata = { ...readRecord(source.metadata) };
  for (const key of CLONE_RESET_METADATA_KEYS) delete baseMetadata[key];
  const { lastOperationId: _lastOperationId, ...assetWithoutOperation } = sourceAsset;
  const metadata = {
    ...mergeGeneratedOakDocMetadata(
      baseMetadata,
      {
        ...assetWithoutOperation,
        storageKey,
        fileName: safeDocxName(input.title),
        generatedAt: clonedAt,
      },
      selectedPartiesOf(source.metadata),
    ),
    oakDocCloneSource: {
      documentId: source.id,
      revision: sourceRevision,
      sha256: sourceAsset.sha256,
      clonedAt,
    },
  };

  let created;
  try {
    created = await prisma.generatedDocument.create({
      data: {
        id,
        tenantId: params.tenantId,
        templateId: source.templateId,
        templateVersion: source.templateVersion,
        sharePointRelativeFolderPathSnapshot: source.sharePointRelativeFolderPathSnapshot,
        companyId: source.companyId,
        title: input.title,
        content: OAKDOC_GENERATED_CONTENT,
        contentJson: { documentEngine: 'OAKDOC', schemaVersion: 1 } as Prisma.InputJsonValue,
        status: 'DRAFT',
        useLetterhead: source.useLetterhead,
        placeholderData: source.placeholderData ?? undefined,
        metadata: metadata as Prisma.InputJsonValue,
        createdById: params.userId,
      },
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  await afterCommit('audit generated clone', () => createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: created.companyId ?? undefined,
    action: 'DOCUMENT_CLONED',
    entityType: 'GeneratedDocument',
    entityId: created.id,
    entityName: created.title,
    summary: `Cloned OakDoc document "${source.title}" as "${created.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      documentEngine: 'OAKDOC',
      sourceDocumentId: source.id,
      sourceRevision,
      sourceSha256: sourceAsset.sha256,
    },
  }));
  return created;
}
