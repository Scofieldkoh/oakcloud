import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import {
  normalizePlaceholderKey,
  normalizeStoredPlaceholders,
  storageFormatToCustomPlaceholders,
  mergeTemplateAndPartialPlaceholders,
} from '@/lib/template-analysis';
import {
  canonicalPlaceholderType,
  masterFieldId,
} from '@/lib/document-generation-master-fields';
import {
  normalizeStoredFieldDefinitionInput,
  resolveTopLevelCustomValues,
  isWorkflowFieldValuePresent,
} from '@/lib/document-editor/template-field-workflow';
import { loadStoredFieldRegistry } from '@/lib/template-field-registry';
import {
  createPreviewFingerprint,
  createReviewedFingerprint,
} from '@/lib/document-generation-fingerprint';
import {
  resolveDocumentGenerationTitle,
  selectDocumentGenerationTitleDate,
} from '@/lib/document-generation-title';
import { claimGeneratedDocumentRevision } from '@/lib/document-editor/generated-document-revision';
import { renderTemplateForWorkflow } from '@/services/document-workflow-renderer.service';
import type {
  BatchItemMutationInput,
  DocumentGenerationBatchDto,
} from '@/types/document-generation-batch';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type { TenantAwareParams } from '@/lib/types';
import {
  loadMasterCatalogueForTemplateIds,
  loadBatchForService,
  revisionConflict,
} from './lifecycle.service';
import {
  mapBatchToDto,
  parseBatchItemConfiguration,
} from './mapper';
import {
  batchInclude,
  type BatchItemWithRelations,
  type BatchWithRelations,
} from './types';

export interface EvaluatedPreview {
  content: string;
  fingerprint: string;
  blockingErrors: string[];
  effectiveCustomData: Record<string, unknown>;
  resolvedTitle: string;
  rendered: Awaited<ReturnType<typeof renderTemplateForWorkflow>>;
}

async function templateCustomFields(
  templateId: string,
  tenantId: string,
): Promise<{
  fields: CustomPlaceholderDefinition[];
  ownFields: CustomPlaceholderDefinition[];
  storedDefinitions: Readonly<Record<string, unknown>>[];
  titleDateFieldKey: string | null;
}> {
  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, tenantId, deletedAt: null },
    select: { id: true, content: true, placeholders: true, contentJson: true },
  });
  if (!template) throw new NotFoundError('Template not found');
  const partials = await prisma.templatePartial.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      displayName: true,
      content: true,
      placeholders: true,
      version: true,
    },
  });
  const storedDefinitions = normalizeStoredFieldDefinitionInput(template.placeholders);
  const ownFields = storageFormatToCustomPlaceholders(
    normalizeStoredPlaceholders(template.placeholders),
    { scope: { kind: 'template', id: template.id } },
  ).filter((field) => !field.sourcePartial);
  const fields = mergeTemplateAndPartialPlaceholders({
    templatePlaceholders: ownFields,
    templateContent: template.content,
    partials,
  });
  const contentJson = template.contentJson;
  const titleDateFieldKey = contentJson
    && typeof contentJson === 'object'
    && !Array.isArray(contentJson)
    && typeof (contentJson as Record<string, unknown>).documentTitleDateFieldKey === 'string'
    ? (contentJson as Record<string, string>).documentTitleDateFieldKey
    : null;
  return { fields, ownFields, storedDefinitions, titleDateFieldKey };
}

function typedBatchCustomData(input: {
  templateId: string;
  storedDefinitions: readonly Readonly<Record<string, unknown>>[];
  ownFields: readonly CustomPlaceholderDefinition[];
  masterValues: Readonly<Record<string, string>>;
  overrides: Readonly<Record<string, string>>;
  itemValues: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const scope = { kind: 'template' as const, id: input.templateId };
  const registry = loadStoredFieldRegistry({ scope, definitions: input.storedDefinitions });
  const overridesByIdentity: Record<string, unknown> = {};
  const mastersByIdentity: Record<string, unknown> = {};
  const ownByKey = new Map(input.ownFields.map((field) => [normalizePlaceholderKey(field.key), field]));

  for (const definition of registry.definitions) {
    if (typeof definition.original.sourcePartial === 'string') continue;
    const field = ownByKey.get(normalizePlaceholderKey(definition.key));
    if (!field) continue;
    const aggregateId = masterFieldId(
      normalizePlaceholderKey(field.key),
      canonicalPlaceholderType(field.type),
    );
    if (Object.prototype.hasOwnProperty.call(input.overrides, aggregateId)) {
      overridesByIdentity[definition.identity] = input.overrides[aggregateId];
    }
    if (Object.prototype.hasOwnProperty.call(input.masterValues, aggregateId)) {
      mastersByIdentity[definition.identity] = input.masterValues[aggregateId];
    }
  }

  return resolveTopLevelCustomValues({
    definitions: input.storedDefinitions,
    scope,
    itemValues: input.itemValues,
    documentOverrides: overridesByIdentity,
    sharedMasterValues: mastersByIdentity,
  });
}

function stringValues(values: Readonly<Record<string, unknown>>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') output[key] = value;
  }
  return output;
}

export async function buildBatchItemRenderInput(
  batch: BatchWithRelations,
  item: BatchItemWithRelations,
  params: TenantAwareParams,
  actorName: string,
): Promise<EvaluatedPreview> {
  const configuration = parseBatchItemConfiguration(item.configuration);
  const templateFieldConfig = await templateCustomFields(item.templateId, params.tenantId);
  const effectiveCustomData = typedBatchCustomData({
    templateId: item.templateId,
    storedDefinitions: templateFieldConfig.storedDefinitions,
    ownFields: templateFieldConfig.ownFields,
    masterValues: (batch.masterFieldValues ?? {}) as Record<string, string>,
    overrides: configuration.masterOverrides,
    itemValues: configuration.itemValues,
  });
  const agreement = item.generatedDocument?.serviceAgreement;
  const titleValues = stringValues(effectiveCustomData);
  const titleDate = selectDocumentGenerationTitleDate({
    values: titleValues,
    selectedFieldKey: item.template.compositionType === 'STANDARD'
      ? templateFieldConfig.titleDateFieldKey
      : null,
    serviceAgreementDate: configuration.serviceAgreement?.agreementDate
      ?? agreement?.agreementDate.toISOString().slice(0, 10),
  });
  const selectedTitleDateMissing = item.template.compositionType === 'STANDARD'
    && configuration.title.includes('{{date}}')
    && Boolean(templateFieldConfig.titleDateFieldKey)
    && !isWorkflowFieldValuePresent(
      effectiveCustomData[templateFieldConfig.titleDateFieldKey!],
    );
  const titleErrors = selectedTitleDateMissing
    ? ['The selected document title date is missing']
    : [];
  const resolvedTitle = resolveDocumentGenerationTitle({
    title: configuration.title,
    templateName: item.template.name,
    companyName: batch.primaryCompany?.name,
    date: titleDate,
  });
  const rendered = await renderTemplateForWorkflow({
    templateId: item.templateId,
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: batch.primaryCompanyId,
    contactIds: configuration.contactIds,
    selectedDirectorId: configuration.selectedDirectorId ?? undefined,
    selectedDirectorIds: configuration.selectedDirectorIds,
    selectedShareholderId: configuration.selectedShareholderId ?? undefined,
    selectedContactId: configuration.selectedContactId ?? undefined,
    customData: effectiveCustomData,
    generatedBy: actorName,
    mode: 'preview',
    serviceAgreementId: agreement?.id ?? undefined,
    generatedDocumentId: item.generatedDocumentId,
  });
  const fingerprint = createPreviewFingerprint({
    templateId: item.templateId,
    templateVersion: rendered.template.version,
    partials: rendered.dependencySnapshot.partials,
    serviceAgreement: rendered.dependencySnapshot.serviceAgreement,
    primaryCompanyId: batch.primaryCompanyId,
    contactIds: configuration.contactIds,
    selectedDirectorId: configuration.selectedDirectorId,
    selectedDirectorIds: configuration.selectedDirectorIds,
    selectedShareholderId: configuration.selectedShareholderId,
    selectedContactId: configuration.selectedContactId,
    effectiveCustomData,
    itemValues: configuration.itemValues,
    useLetterhead: configuration.useLetterhead,
    agreementData: configuration.serviceAgreement ?? undefined,
  });
  return {
    content: rendered.content,
    fingerprint,
    blockingErrors: [...rendered.blockingErrors, ...titleErrors],
    effectiveCustomData,
    resolvedTitle,
    rendered,
  };
}

function itemNotFound(itemId: string): NotFoundError {
  return new NotFoundError('Batch item not found', { itemId });
}

function evaluateDiagnostics(
  itemId: string,
  evaluated: EvaluatedPreview,
  reviewedFingerprint: string | null,
  currentFingerprint: string | null,
) {
  const errors = [...evaluated.blockingErrors];
  if (currentFingerprint && evaluated.fingerprint !== currentFingerprint) {
    errors.push('Preview inputs changed since the last render');
  }
  const awaitingReview = Boolean(evaluated.fingerprint) && !reviewedFingerprint;
  return {
    itemId,
    status: errors.length > 0
      ? ('NEEDS_INPUT' as const)
      : awaitingReview
        ? ('PREVIEWED' as const)
        : ('READY' as const),
    errors,
    fieldErrors: [],
  };
}

export async function previewDocumentGenerationBatchItem(
  batchId: string,
  itemId: string,
  input: BatchItemMutationInput,
  params: TenantAwareParams,
): Promise<DocumentGenerationBatchDto> {
  const batch = await prisma.$transaction(async (tx) => {
    const claimed = await tx.documentGenerationBatch.updateMany({
      where: {
        id: batchId,
        tenantId: params.tenantId,
        deletedAt: null,
        revision: input.expectedRevision,
      },
      data: { revision: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      throw await revisionConflict(batchId, params.tenantId);
    }
    const loaded = await loadBatchForService(batchId, params, tx);
    if (!loaded) throw new NotFoundError('Document generation batch not found');
    const item = loaded.items.find((entry) => entry.id === itemId);
    if (!item) throw itemNotFound(itemId);
    if (item.status === 'GENERATED') {
      throw new ValidationError('Generated documents cannot be previewed again');
    }

    const hasManualEdits = Boolean(
      (item.editedContent && item.editedContent !== item.previewContent)
      || item.editedContentJson,
    );
    if (hasManualEdits && !input.replaceEditedContent) {
      throw new ConflictError(
        'Refreshing the preview would replace manual edits',
        { requiresReplaceEditedContent: true },
      );
    }

    const creator = await tx.user.findFirst({
      where: { id: params.userId, tenantId: params.tenantId },
      select: { firstName: true, lastName: true },
    });
    const actorName = creator
      ? [creator.firstName, creator.lastName].filter(Boolean).join(' ').trim()
      : '';
    const evaluated = await buildBatchItemRenderInput(loaded, item, params, actorName);
    const diagnostics = evaluateDiagnostics(
      item.id,
      evaluated,
      null,
      item.previewFingerprint,
    );
    await tx.documentGenerationBatchItem.update({
      where: { id: item.id },
      data: {
        templateVersion: evaluated.rendered.template.version,
        previewContent: evaluated.content,
        previewFingerprint: evaluated.fingerprint,
        reviewedFingerprint: null,
        editedContent: null,
        editedContentJson: Prisma.DbNull,
        status: diagnostics.status,
        validationDiagnostics: diagnostics as never,
      },
    });
    await claimGeneratedDocumentRevision(tx, {
      id: item.generatedDocumentId,
      tenantId: params.tenantId,
      allowedStatuses: ['DRAFT'],
    });
    await tx.generatedDocument.update({
      where: { id: item.generatedDocumentId },
      data: { title: evaluated.resolvedTitle },
    });
    return tx.documentGenerationBatch.findFirstOrThrow({
      where: { id: batchId },
      include: batchInclude,
    });
  });
  const catalogue = await loadMasterCatalogueForTemplateIds(
    batch.items.map((entry) => entry.templateId),
    params.tenantId,
  );
  return mapBatchToDto(batch, catalogue);
}

export async function reviewDocumentGenerationBatchItem(
  batchId: string,
  itemId: string,
  input: { expectedRevision: number },
  params: TenantAwareParams,
): Promise<DocumentGenerationBatchDto> {
  const batch = await prisma.$transaction(async (tx) => {
    const claimed = await tx.documentGenerationBatch.updateMany({
      where: {
        id: batchId,
        tenantId: params.tenantId,
        deletedAt: null,
        revision: input.expectedRevision,
      },
      data: { revision: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      throw await revisionConflict(batchId, params.tenantId);
    }
    const loaded = await loadBatchForService(batchId, params, tx);
    if (!loaded) throw new NotFoundError('Document generation batch not found');
    const item = loaded.items.find((entry) => entry.id === itemId);
    if (!item) throw itemNotFound(itemId);
    if (item.status === 'GENERATED') {
      throw new ValidationError('Generated documents cannot be reviewed again');
    }
    if (!item.previewFingerprint || !item.previewContent) {
      throw new ValidationError('Preview the document before reviewing it');
    }

    const creator = await tx.user.findFirst({
      where: { id: params.userId, tenantId: params.tenantId },
      select: { firstName: true, lastName: true },
    });
    const actorName = creator
      ? [creator.firstName, creator.lastName].filter(Boolean).join(' ').trim()
      : '';
    const evaluated = await buildBatchItemRenderInput(loaded, item, params, actorName);
    if (evaluated.fingerprint !== item.previewFingerprint) {
      throw new ConflictError(
        'The preview is stale. Refresh it before review.',
        { stale: true },
      );
    }
    if (evaluated.blockingErrors.length > 0) {
      throw new ValidationError(
        evaluated.blockingErrors.join('; '),
        { blockingErrors: evaluated.blockingErrors },
      );
    }
    const reviewedFingerprint = createReviewedFingerprint({
      previewFingerprint: item.previewFingerprint,
      editedContent: item.editedContent ?? item.previewContent,
      editedContentJson: item.editedContentJson ?? null,
    });
    await tx.documentGenerationBatchItem.update({
      where: { id: item.id },
      data: {
        reviewedFingerprint,
        status: 'READY',
        validationDiagnostics: Prisma.DbNull,
      },
    });
    await claimGeneratedDocumentRevision(tx, {
      id: item.generatedDocumentId,
      tenantId: params.tenantId,
      allowedStatuses: ['DRAFT'],
    });
    await tx.generatedDocument.update({
      where: { id: item.generatedDocumentId },
      data: { title: evaluated.resolvedTitle },
    });
    return tx.documentGenerationBatch.findFirstOrThrow({
      where: { id: batchId },
      include: batchInclude,
    });
  });
  const catalogue = await loadMasterCatalogueForTemplateIds(
    batch.items.map((entry) => entry.templateId),
    params.tenantId,
  );
  return mapBatchToDto(batch, catalogue);
}
