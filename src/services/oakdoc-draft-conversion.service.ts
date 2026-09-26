import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { storage, StorageKeys } from '@/lib/storage';
import { ensureA4ServerDomGlobals } from '@/lib/document-editor/a4-server-dom';
import { buildOakDocFromHtml } from '@/lib/document-editor/oakdoc-html-import';
import { inspectOakDocPackage } from '@/lib/document-editor/oakdoc-package-policy';
import {
  OAKDOC_GENERATED_CONTENT,
  mergeGeneratedOakDocMetadata,
  readGeneratedDocumentEngineState,
  type GeneratedOakDocAssetMetadata,
} from '@/lib/document-editor/document-engine';
import {
  claimGeneratedDocumentRevision,
  readGeneratedDocumentRevision,
} from '@/lib/document-editor/generated-document-revision';
import { OAKDOC_MIME_TYPE } from '@/lib/document-editor/oakdoc-template';
import type { TenantAwareParams } from '@/lib/types';
import {
  A4_DRAFT_CONVERSION_METHOD,
  isPendingA4DraftConversion,
  readA4DraftConversionMetadata,
  type A4DraftConversionMetadata,
} from '@/lib/document-editor/oakdoc-draft-conversion';

export {
  A4_DRAFT_CONVERSION_METHOD,
  isPendingA4DraftConversion,
  readA4DraftConversionMetadata,
  type A4DraftConversionMetadata,
};

/**
 * P8 (D04): turn one A4 draft into a new OakDoc draft for review.
 *
 * The original is never modified. The copy records where it came from
 * (document, revision, content hash), the conversion method and every
 * diagnostic. It stays PENDING_REVIEW until someone accepts it, and error
 * diagnostics must be acknowledged one by one before it can be accepted.
 * Nothing here runs in bulk: each call converts one document on request.
 */

const log = createLogger('oakdoc-draft-conversion');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function convertedTitle(title: string): string {
  const suffix = ' (OakDoc)';
  return `${title.slice(0, 300 - suffix.length)}${suffix}`;
}

function safeDocxName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  return `${base || 'document'}.docx`;
}

async function findConversionTarget(sourceDocumentId: string, tenantId: string) {
  return prisma.generatedDocument.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      metadata: { path: ['oakDocMigration', 'sourceDocumentId'], equals: sourceDocumentId },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function assertNoOpenSigning(documentId: string, tenantId: string): Promise<void> {
  const signing = await prisma.esigningEnvelopeDocument.findFirst({
    where: {
      tenantId,
      generatedDocumentId: documentId,
      envelope: { status: { in: ['DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED'] } },
    },
    select: { id: true },
  });
  if (signing) {
    throw new ValidationError('Documents in e-signing cannot be converted', {
      reason: 'OAKDOC_CONVERSION_SOURCE_IN_SIGNING',
    });
  }
}

export interface A4DraftConversionResult {
  document: Awaited<ReturnType<typeof prisma.generatedDocument.create>>;
  conversion: A4DraftConversionMetadata;
  reused: boolean;
}

/**
 * Convert one A4 draft into a new OakDoc draft. Retrying returns the copy
 * already made from the same source revision instead of creating another.
 */
export async function convertA4DraftToOakDoc(
  input: { documentId: string; expectedRevision: number },
  params: TenantAwareParams,
): Promise<A4DraftConversionResult> {
  const source = await prisma.generatedDocument.findFirst({
    where: { id: input.documentId, tenantId: params.tenantId, deletedAt: null },
  });
  if (!source) throw new NotFoundError('Document not found');
  if (readGeneratedDocumentEngineState(source.metadata) !== 'A4') {
    throw new ValidationError('Only A4 documents can be converted to OakDoc', {
      reason: 'OAKDOC_CONVERSION_SOURCE_NOT_A4',
    });
  }
  if (source.status !== 'DRAFT' || source.finalizedAt || source.signedAt) {
    throw new ValidationError('Only unfinalized drafts can be converted; finalized and signed documents stay as they are', {
      reason: 'OAKDOC_CONVERSION_SOURCE_NOT_DRAFT',
    });
  }
  await assertNoOpenSigning(source.id, params.tenantId);

  const sourceRevision = await readGeneratedDocumentRevision(prisma, source.id, params.tenantId);
  if (sourceRevision !== input.expectedRevision) {
    throw new ConflictError('The document changed. Reload it and try again.', {
      reason: 'OAKDOC_CONVERSION_SOURCE_CHANGED',
      currentRevision: sourceRevision,
    });
  }
  const sourceContentSha256 = sha256(source.content);

  const existing = await findConversionTarget(source.id, params.tenantId);
  if (existing) {
    const conversion = readA4DraftConversionMetadata(existing.metadata);
    if (
      conversion
      && conversion.sourceRevision === sourceRevision
      && conversion.sourceContentSha256 === sourceContentSha256
    ) {
      return { document: existing, conversion, reused: true };
    }
    throw new ConflictError('An OakDoc copy from an earlier version of this draft already exists. Reject it before converting again.', {
      reason: 'OAKDOC_CONVERSION_TARGET_EXISTS',
      targetDocumentId: existing.id,
    });
  }

  ensureA4ServerDomGlobals();
  const { bytes, diagnostics } = buildOakDocFromHtml(source.content);
  inspectOakDocPackage(bytes, 'draft');
  const buffer = Buffer.from(bytes);

  const id = randomUUID();
  const title = convertedTitle(source.title);
  const storageKey = StorageKeys.oakDocGeneratedAsset(params.tenantId, id, randomUUID());
  const convertedAt = new Date().toISOString();
  const assetSha256 = sha256(bytes);
  await storage.upload(storageKey, buffer, {
    contentType: OAKDOC_MIME_TYPE,
    metadata: {
      tenantId: params.tenantId,
      generatedDocumentId: id,
      sha256: assetSha256,
      generatedBy: params.userId,
      convertedFrom: source.id,
    },
  });

  // A converted copy has no OakDoc template. The asset identity points at
  // the A4 source definition (its template, or the draft itself) and its
  // content hash, so provenance stays checkable.
  const asset: GeneratedOakDocAssetMetadata = {
    schemaVersion: 1,
    storageKey,
    fileName: safeDocxName(title),
    fileSize: buffer.byteLength,
    sha256: assetSha256,
    mimeType: OAKDOC_MIME_TYPE,
    templateId: source.templateId ?? source.id,
    templateVersion: source.templateVersion ?? 1,
    templateSha256: sourceContentSha256,
    generatedAt: convertedAt,
    fieldsUpdated: 0,
    unresolvedTags: [],
    conditionsResolved: 0,
    conditionsKept: 0,
    conditionsRemoved: 0,
    repeatersResolved: 0,
    repeaterItemsCreated: 0,
  };
  const conversion: A4DraftConversionMetadata = {
    schemaVersion: 1,
    kind: 'A4_DRAFT_CONVERSION',
    method: A4_DRAFT_CONVERSION_METHOD,
    sourceDocumentId: source.id,
    sourceRevision,
    sourceContentSha256,
    diagnostics,
    status: 'PENDING_REVIEW',
    convertedAt,
    convertedById: params.userId,
  };
  const sourceMetadata = isRecord(source.metadata) ? source.metadata : {};
  const metadata = {
    ...mergeGeneratedOakDocMetadata(
      {},
      asset,
      isRecord(sourceMetadata.selectedParties) ? sourceMetadata.selectedParties : {},
    ),
    oakDocMigration: conversion,
  };

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Serialize conversions of the same source so a retry cannot race.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`oakdoc-conversion:${source.id}`}, 0))`);
      const current = await tx.generatedDocument.findFirst({
        where: { id: source.id, tenantId: params.tenantId, deletedAt: null },
        select: { content: true, status: true },
      });
      const currentRevision = await readGeneratedDocumentRevision(tx, source.id, params.tenantId);
      if (
        !current
        || current.status !== 'DRAFT'
        || currentRevision !== sourceRevision
        || sha256(current.content) !== sourceContentSha256
      ) {
        throw new ConflictError('The draft was edited while it was being converted. Try again.', {
          reason: 'OAKDOC_CONVERSION_SOURCE_CHANGED',
        });
      }
      const duplicate = await tx.generatedDocument.findFirst({
        where: {
          tenantId: params.tenantId,
          deletedAt: null,
          metadata: { path: ['oakDocMigration', 'sourceDocumentId'], equals: source.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError('This draft is already being converted.', {
          reason: 'OAKDOC_CONVERSION_TARGET_EXISTS',
          targetDocumentId: duplicate.id,
        });
      }
      return tx.generatedDocument.create({
        data: {
          id,
          tenantId: params.tenantId,
          templateId: source.templateId,
          templateVersion: source.templateVersion,
          sharePointRelativeFolderPathSnapshot: source.sharePointRelativeFolderPathSnapshot,
          companyId: source.companyId,
          title,
          content: OAKDOC_GENERATED_CONTENT,
          contentJson: { documentEngine: 'OAKDOC', schemaVersion: 1 } as Prisma.InputJsonValue,
          status: 'DRAFT',
          useLetterhead: source.useLetterhead,
          placeholderData: source.placeholderData ?? undefined,
          metadata: metadata as unknown as Prisma.InputJsonValue,
          createdById: params.userId,
        },
      });
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: created.companyId ?? undefined,
    action: 'DOCUMENT_CLONED',
    entityType: 'GeneratedDocument',
    entityId: created.id,
    entityName: created.title,
    summary: `Converted A4 draft "${source.title}" to an OakDoc copy for review`,
    changeSource: 'MANUAL',
    metadata: {
      documentEngine: 'OAKDOC',
      conversionMethod: A4_DRAFT_CONVERSION_METHOD,
      sourceDocumentId: source.id,
      sourceRevision,
      sourceContentSha256,
      errorCount: diagnostics.filter((entry) => entry.severity === 'error').length,
      warningCount: diagnostics.filter((entry) => entry.severity === 'warning').length,
    },
  }).catch((error) => log.warn('Conversion audit failed', {
    error: error instanceof Error ? error.message : String(error),
  }));

  return { document: created, conversion, reused: false };
}

/**
 * Accept or reject a converted copy. Accepting needs every error diagnostic
 * acknowledged (the reviewer has repaired it in the copy) and an original
 * that has not changed since the copy was made. Rejecting removes the copy;
 * the original is untouched either way.
 */
export async function reviewA4DraftConversion(
  input: {
    documentId: string;
    expectedRevision: number;
    decision: 'accept' | 'reject';
    acknowledgedCodes?: string[];
  },
  params: TenantAwareParams,
) {
  const target = await prisma.generatedDocument.findFirst({
    where: { id: input.documentId, tenantId: params.tenantId, deletedAt: null },
  });
  if (!target) throw new NotFoundError('Document not found');
  const conversion = readA4DraftConversionMetadata(target.metadata);
  if (!conversion) {
    throw new ValidationError('This document is not a converted A4 draft', {
      reason: 'OAKDOC_CONVERSION_NOT_FOUND',
    });
  }
  if (conversion.status !== 'PENDING_REVIEW') {
    throw new ConflictError('This conversion has already been reviewed', {
      reason: 'OAKDOC_CONVERSION_ALREADY_REVIEWED',
    });
  }

  const acknowledgedCodes = Array.from(new Set(input.acknowledgedCodes ?? [])).sort();
  if (input.decision === 'accept') {
    const outstanding = Array.from(new Set(
      conversion.diagnostics
        .filter((entry) => entry.severity === 'error')
        .map((entry) => entry.code),
    )).filter((code) => !acknowledgedCodes.includes(code));
    if (outstanding.length > 0) {
      throw new ValidationError('Fix and confirm each conversion problem before accepting the copy', {
        reason: 'OAKDOC_CONVERSION_UNACKNOWLEDGED_ERRORS',
        codes: outstanding,
      });
    }
    const source = await prisma.generatedDocument.findFirst({
      where: { id: conversion.sourceDocumentId, tenantId: params.tenantId },
      select: { content: true, deletedAt: true },
    });
    if (source && !source.deletedAt) {
      const sourceRevision = await readGeneratedDocumentRevision(
        prisma,
        conversion.sourceDocumentId,
        params.tenantId,
      );
      if (
        sourceRevision !== conversion.sourceRevision
        || sha256(source.content) !== conversion.sourceContentSha256
      ) {
        throw new ConflictError('The original draft changed after this copy was made. Reject the copy and convert again.', {
          reason: 'OAKDOC_CONVERSION_SOURCE_CHANGED',
        });
      }
    }
  }

  const reviewedAt = new Date().toISOString();
  const reviewed: A4DraftConversionMetadata = {
    ...conversion,
    status: 'ACCEPTED',
    reviewedAt,
    reviewedById: params.userId,
    acknowledgedCodes,
  };
  const updated = await prisma.$transaction(async (tx) => {
    const claim = await claimGeneratedDocumentRevision(tx, {
      id: target.id,
      tenantId: params.tenantId,
      expectedRevision: input.expectedRevision,
      allowedStatuses: ['DRAFT'],
    });
    const document = input.decision === 'accept'
      ? await tx.generatedDocument.update({
          where: { id: target.id },
          data: {
            metadata: {
              ...(isRecord(target.metadata) ? target.metadata : {}),
              oakDocMigration: reviewed,
            } as unknown as Prisma.InputJsonValue,
          },
        })
      : await tx.generatedDocument.update({
          where: { id: target.id },
          data: { deletedAt: new Date() },
        });
    return { ...document, revision: claim.revision };
  });

  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: target.companyId ?? undefined,
    action: input.decision === 'accept' ? 'UPDATE' : 'DELETE',
    entityType: 'GeneratedDocument',
    entityId: target.id,
    entityName: target.title,
    summary: input.decision === 'accept'
      ? `Accepted the OakDoc copy of an A4 draft "${target.title}"`
      : `Rejected the OakDoc copy of an A4 draft "${target.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      documentEngine: 'OAKDOC',
      sourceDocumentId: conversion.sourceDocumentId,
      decision: input.decision,
      acknowledgedCodes,
    },
  }).catch((error) => log.warn('Conversion review audit failed', {
    error: error instanceof Error ? error.message : String(error),
  }));

  return {
    document: updated,
    decision: input.decision,
    conversion: input.decision === 'accept' ? reviewed : null,
  };
}
