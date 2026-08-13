import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import {
  normalizeStoredPlaceholders,
  storageFormatToCustomPlaceholders,
  mergeTemplateAndPartialPlaceholders,
} from '@/lib/template-analysis';
import {
  resolveEffectiveCustomData,
} from '@/lib/document-generation-master-fields';
import {
  createPreviewFingerprint,
  createReviewedFingerprint,
} from '@/lib/document-generation-fingerprint';
import {
  renderTemplateForGeneration,
} from '@/services/document-generator.service';
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
  effectiveCustomData: Record<string, string>;
  rendered: Awaited<ReturnType<typeof renderTemplateForGeneration>>;
}

async function templateCustomFields(
  templateId: string,
  tenantId: string,
): Promise<CustomPlaceholderDefinition[]> {
  const template = await prisma.documentTemplate.findFirst({
    where: { id: templateId, tenantId, deletedAt: null },
    select: { id: true, content: true, placeholders: true },
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
  return mergeTemplateAndPartialPlaceholders({
    templatePlaceholders: storageFormatToCustomPlaceholders(
      normalizeStoredPlaceholders(template.placeholders),
    ),
    templateContent: template.content,
    partials,
  });
}

export async function buildBatchItemRenderInput(
  batch: BatchWithRelations,
  item: BatchItemWithRelations,
  params: TenantAwareParams,
  actorName: string,
): Promise<EvaluatedPreview> {
  const configuration = parseBatchItemConfiguration(item.configuration);
  const templateFields = await templateCustomFields(item.templateId, params.tenantId);
  const effectiveCustomData = resolveEffectiveCustomData({
    templateFields,
    templateId: item.templateId,
    masterValues: (batch.masterFieldValues ?? {}) as Record<string, string>,
    overrides: configuration.masterOverrides,
    itemValues: configuration.itemValues,
  });
  const agreement = item.generatedDocument?.serviceAgreement;
  const rendered = await renderTemplateForGeneration({
    templateId: item.templateId,
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: batch.primaryCompanyId,
    contactIds: configuration.contactIds,
    selectedDirectorId: configuration.selectedDirectorId ?? undefined,
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
    blockingErrors: rendered.blockingErrors,
    effectiveCustomData,
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

// ============================================================================
// Preview
// ============================================================================

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
      item.editedContent && item.editedContent !== item.previewContent,
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
        editedContent: hasManualEdits && !input.replaceEditedContent
          ? item.editedContent
          : null,
        editedContentJson: Prisma.DbNull,
        status: diagnostics.status,
        validationDiagnostics: diagnostics as never,
      },
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

// ============================================================================
// Review
// ============================================================================

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
