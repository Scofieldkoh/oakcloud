import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { ConflictError, ValidationError } from '@/lib/errors';
import { canonicalJson } from '@/lib/document-generation-fingerprint';
import {
  getDocumentTemplateEngineState,
  readGeneratedDocumentEngineState,
} from '@/lib/document-editor/document-engine';
import { readGeneratedDocumentRevisions } from '@/lib/document-editor/generated-document-revision';
import {
  getOakDocMigrationInventory,
  setOakDocMigrationPreference,
} from '@/services/oakdoc-migration.service';
import {
  A4_DRAFT_CONVERSION_METHOD,
  convertA4DraftToOakDoc,
  readA4DraftConversionMetadata,
} from '@/services/oakdoc-draft-conversion.service';
import type { OakDocMigrationInventoryStatus } from '@/lib/document-editor/oakdoc-migration';

/**
 * M2 rollout inventory and the explicit, manifest-bound apply step for A4
 * draft conversion (D04). Reports carry IDs, revisions, hashes and
 * dispositions only, never document contents or titles.
 */

export type A4DocumentDisposition =
  /** Unfinalized A4 draft that can be converted now. */
  | 'CONVERT'
  /** A converted copy exists and waits for review. */
  | 'CONVERTED_PENDING_REVIEW'
  /** A converted copy has been accepted. */
  | 'CONVERTED_ACCEPTED'
  /** Finalized, archived or signed: stays as a read-only historical record. */
  | 'HISTORICAL'
  /** Linked to e-signing: never converted. */
  | 'BLOCKED_IN_SIGNING'
  /** Part of a generation batch or a Service Agreement, which stay bound to it. */
  | 'BLOCKED_RELATION';

export interface A4DocumentInventoryItem {
  documentId: string;
  revision: number;
  status: string;
  disposition: A4DocumentDisposition;
  contentSha256: string;
  targetDocumentId?: string;
}

export interface A4DraftConversionManifestItem {
  documentId: string;
  revision: number;
  contentSha256: string;
}

export interface OakDocRolloutInventory {
  tenantId: string;
  templates: {
    total: number;
    byStatus: Partial<Record<OakDocMigrationInventoryStatus, number>>;
    items: Array<{
      status: OakDocMigrationInventoryStatus;
      legacyTemplateId: string | null;
      oakDocTemplateId: string | null;
      warnings: string[];
    }>;
  };
  documents: {
    total: number;
    byDisposition: Partial<Record<A4DocumentDisposition, number>>;
    items: A4DocumentInventoryItem[];
  };
  unfinishedBatchItemsOnA4Templates: number;
  draftConversionManifest: {
    method: string;
    hash: string;
    items: A4DraftConversionManifestItem[];
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function countBy<T extends string>(values: T[]): Partial<Record<T, number>> {
  const counts: Partial<Record<T, number>> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function draftConversionManifestHash(
  tenantId: string,
  items: A4DraftConversionManifestItem[],
): string {
  return sha256(canonicalJson({ tenantId, method: A4_DRAFT_CONVERSION_METHOD, items }));
}

async function inventoryA4Documents(tenantId: string): Promise<A4DocumentInventoryItem[]> {
  const documents = await prisma.generatedDocument.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      status: true,
      finalizedAt: true,
      signedAt: true,
      content: true,
      metadata: true,
      serviceAgreement: { select: { id: true } },
      batchItem: { select: { id: true } },
      _count: { select: { esigningEnvelopeDocuments: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const targets = new Map<string, { id: string; status: string }>();
  for (const document of documents) {
    const conversion = readA4DraftConversionMetadata(document.metadata);
    if (conversion) {
      targets.set(conversion.sourceDocumentId, { id: document.id, status: conversion.status });
    }
  }

  const a4 = documents.filter(
    (document) => readGeneratedDocumentEngineState(document.metadata) === 'A4',
  );
  const revisions = await readGeneratedDocumentRevisions(
    prisma,
    a4.map((document) => document.id),
    tenantId,
  );

  return a4.map((document) => {
    const target = targets.get(document.id);
    let disposition: A4DocumentDisposition;
    if (document.status !== 'DRAFT' || document.finalizedAt || document.signedAt) {
      disposition = 'HISTORICAL';
    } else if (document._count.esigningEnvelopeDocuments > 0) {
      disposition = 'BLOCKED_IN_SIGNING';
    } else if (target) {
      disposition = target.status === 'ACCEPTED' ? 'CONVERTED_ACCEPTED' : 'CONVERTED_PENDING_REVIEW';
    } else if (document.serviceAgreement || document.batchItem) {
      // Task outcomes move to the copy when it is accepted; batches and
      // agreements stay bound to the document they created.
      disposition = 'BLOCKED_RELATION';
    } else {
      disposition = 'CONVERT';
    }
    return {
      documentId: document.id,
      revision: revisions.get(document.id) ?? 0,
      status: document.status,
      disposition,
      contentSha256: sha256(document.content),
      ...(target ? { targetDocumentId: target.id } : {}),
    };
  });
}

/** Read-only inventory for one workspace. Makes no writes. */
export async function buildOakDocRolloutInventory(tenantId: string): Promise<OakDocRolloutInventory> {
  const [templates, documents, unfinishedBatchItems] = await Promise.all([
    getOakDocMigrationInventory(tenantId),
    inventoryA4Documents(tenantId),
    prisma.documentGenerationBatchItem.findMany({
      where: {
        tenantId,
        batch: { status: { not: 'COMPLETED' } },
      },
      select: { template: { select: { contentJson: true } } },
    }),
  ]);

  const manifestItems = documents
    .filter((item) => item.disposition === 'CONVERT')
    .map(({ documentId, revision, contentSha256 }) => ({ documentId, revision, contentSha256 }));

  return {
    tenantId,
    templates: {
      total: templates.length,
      byStatus: countBy(templates.map((item) => item.status)),
      items: templates.map((item) => ({
        status: item.status,
        legacyTemplateId: item.legacyTemplate?.id ?? null,
        oakDocTemplateId: item.oakDocTemplate?.id ?? null,
        warnings: item.warnings,
      })),
    },
    documents: {
      total: documents.length,
      byDisposition: countBy(documents.map((item) => item.disposition)),
      items: documents,
    },
    unfinishedBatchItemsOnA4Templates: unfinishedBatchItems.filter(
      (item) => getDocumentTemplateEngineState(item.template.contentJson) === 'A4',
    ).length,
    draftConversionManifest: {
      method: A4_DRAFT_CONVERSION_METHOD,
      hash: draftConversionManifestHash(tenantId, manifestItems),
      items: manifestItems,
    },
  };
}

export interface A4DraftConversionRunResult {
  manifestHash: string;
  results: Array<{
    documentId: string;
    outcome: 'created' | 'reused' | 'failed';
    targetDocumentId?: string;
    errorCount?: number;
    reason?: string;
  }>;
}

/**
 * Convert every draft in an approved manifest. The manifest is rebuilt and
 * must still hash to the approved value, so nothing converts that the
 * operator did not see in the dry run. Each item is independent and
 * idempotent: after a partial failure, a new dry run lists what is left.
 */
export async function applyA4DraftConversionManifest(input: {
  tenantId: string;
  userId: string;
  manifestHash: string;
}): Promise<A4DraftConversionRunResult> {
  await requireOperator(input.tenantId, input.userId);

  const inventory = await buildOakDocRolloutInventory(input.tenantId);
  const manifest = inventory.draftConversionManifest;
  if (manifest.hash !== input.manifestHash) {
    throw new ConflictError('The drafts changed since the dry run. Run the dry run again and approve the new manifest.', {
      reason: 'OAKDOC_MANIFEST_CHANGED',
      currentManifestHash: manifest.hash,
    });
  }

  const results: A4DraftConversionRunResult['results'] = [];
  for (const item of manifest.items) {
    try {
      const result = await convertA4DraftToOakDoc(
        { documentId: item.documentId, expectedRevision: item.revision },
        { tenantId: input.tenantId, userId: input.userId },
      );
      results.push({
        documentId: item.documentId,
        outcome: result.reused ? 'reused' : 'created',
        targetDocumentId: result.document.id,
        errorCount: result.conversion.diagnostics.filter((entry) => entry.severity === 'error').length,
      });
    } catch (error) {
      const details = (error as { details?: { reason?: unknown } }).details;
      results.push({
        documentId: item.documentId,
        outcome: 'failed',
        reason: typeof details?.reason === 'string' ? details.reason : 'CONVERSION_FAILED',
      });
    }
  }
  await journalRolloutRun({
    tenantId: input.tenantId,
    userId: input.userId,
    operation: 'DRAFT_CONVERSION',
    manifestHash: manifest.hash,
    results,
  });
  return { manifestHash: manifest.hash, results };
}

async function requireOperator(tenantId: string, userId: string): Promise<void> {
  const operator = await prisma.user.findFirst({
    where: { id: userId, tenantId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!operator) throw new ValidationError('The operator is not an active member of this workspace');
}

/**
 * Journal one apply run in the audit log: operator, manifest hash and every
 * item's outcome. Items are idempotent, so resuming after a failure is a new
 * dry run plus apply; the journal shows what each earlier run did.
 */
async function journalRolloutRun(input: {
  tenantId: string;
  userId: string;
  operation: 'DRAFT_CONVERSION' | 'TEMPLATE_CUTOVER' | 'TEMPLATE_ROLLBACK';
  manifestHash: string;
  results: Array<{ outcome: string }>;
  reason?: string;
}): Promise<void> {
  const outcomes = countBy(input.results.map((item) => item.outcome));
  await createAuditLog({
    tenantId: input.tenantId,
    userId: input.userId,
    action: 'UPDATE',
    entityType: 'OakDocRolloutRun',
    entityId: input.manifestHash,
    summary: `OakDoc rollout ${input.operation.toLowerCase().replace(/_/g, ' ')}: ${input.results.length} item(s)`,
    changeSource: 'SYSTEM',
    ...(input.reason ? { reason: input.reason } : {}),
    metadata: {
      operation: input.operation,
      manifestHash: input.manifestHash,
      outcomes,
      results: input.results,
    },
  });
}

export type OakDocCutoverDirection = 'OAKDOC' | 'LEGACY';

export interface OakDocTemplateCutoverItem {
  oakDocTemplateId: string;
  legacyTemplateId: string;
  expectedRevision: number;
}

export interface OakDocTemplateCutoverPlan {
  direction: OakDocCutoverDirection;
  hash: string;
  items: OakDocTemplateCutoverItem[];
}

/**
 * Pairs a workspace cutover would switch. Moving to Word covers validated
 * pairs still on A4; rollback covers pairs currently on Word. The hash binds
 * the apply step to exactly these templates at these revisions.
 */
export async function buildTemplateCutoverPlan(
  tenantId: string,
  direction: OakDocCutoverDirection,
): Promise<OakDocTemplateCutoverPlan> {
  const inventory = await getOakDocMigrationInventory(tenantId);
  const wanted = direction === 'OAKDOC' ? 'READY_FOR_SWITCHOVER' : 'OAKDOC_PRIMARY';
  const items = inventory
    .filter((item) => item.readiness === wanted && item.oakDocTemplate && item.legacyTemplate)
    .map((item) => ({
      oakDocTemplateId: item.oakDocTemplate!.id,
      legacyTemplateId: item.legacyTemplate!.id,
      expectedRevision: item.oakDocTemplate!.version,
    }))
    .sort((a, b) => a.oakDocTemplateId.localeCompare(b.oakDocTemplateId));
  return {
    direction,
    hash: sha256(canonicalJson({ tenantId, operation: 'template-cutover', direction, items })),
    items,
  };
}

export interface OakDocTemplateCutoverResult {
  direction: OakDocCutoverDirection;
  manifestHash: string;
  results: Array<{
    oakDocTemplateId: string;
    outcome: 'switched' | 'failed';
    revision?: number;
    reason?: string;
  }>;
}

/**
 * Switch every pair in an approved cutover plan to Word, or roll them back
 * to A4, through the audited per-template preference change (which re-checks
 * parity evidence and the expected revision). A changed plan is refused.
 */
export async function applyTemplateCutover(input: {
  tenantId: string;
  userId: string;
  direction: OakDocCutoverDirection;
  manifestHash: string;
  reason: string;
}): Promise<OakDocTemplateCutoverResult> {
  await requireOperator(input.tenantId, input.userId);
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError('A reason is required for a cutover or rollback');

  const plan = await buildTemplateCutoverPlan(input.tenantId, input.direction);
  if (plan.hash !== input.manifestHash) {
    throw new ConflictError('The templates changed since the dry run. Run the dry run again and approve the new plan.', {
      reason: 'OAKDOC_MANIFEST_CHANGED',
      currentManifestHash: plan.hash,
    });
  }

  const results: OakDocTemplateCutoverResult['results'] = [];
  for (const item of plan.items) {
    try {
      const updated = await setOakDocMigrationPreference({
        oakDocTemplateId: item.oakDocTemplateId,
        expectedRevision: item.expectedRevision,
        preference: input.direction,
        reason,
      }, { tenantId: input.tenantId, userId: input.userId });
      results.push({ oakDocTemplateId: item.oakDocTemplateId, outcome: 'switched', revision: updated.version });
    } catch (error) {
      const details = (error as { details?: { reason?: unknown } }).details;
      const reason = typeof details?.reason === 'string'
        ? details.reason
        : (error instanceof Error ? error.message : 'PREFERENCE_CHANGE_FAILED').slice(0, 300);
      results.push({ oakDocTemplateId: item.oakDocTemplateId, outcome: 'failed', reason });
    }
  }
  await journalRolloutRun({
    tenantId: input.tenantId,
    userId: input.userId,
    operation: input.direction === 'OAKDOC' ? 'TEMPLATE_CUTOVER' : 'TEMPLATE_ROLLBACK',
    manifestHash: plan.hash,
    results,
    reason,
  });
  return { direction: input.direction, manifestHash: plan.hash, results };
}
