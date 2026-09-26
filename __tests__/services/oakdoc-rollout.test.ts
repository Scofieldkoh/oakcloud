// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  generatedDocument: { findMany: vi.fn() },
  documentGenerationBatchItem: { findMany: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/document-editor/generated-document-revision', () => ({
  readGeneratedDocumentRevisions: vi.fn(async (_client: unknown, ids: string[]) => new Map(ids.map((id) => [id, 3]))),
}));
vi.mock('@/services/oakdoc-migration.service', () => ({
  getOakDocMigrationInventory: vi.fn(async () => [
    { status: 'UNMAPPED_LEGACY', legacyTemplate: { id: 'a4-template' }, oakDocTemplate: null, warnings: [] },
  ]),
}));
const convertA4DraftToOakDoc = vi.hoisted(() => vi.fn());
vi.mock('@/services/oakdoc-draft-conversion.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/oakdoc-draft-conversion.service')>()),
  convertA4DraftToOakDoc,
}));

import {
  applyA4DraftConversionManifest,
  buildOakDocRolloutInventory,
} from '@/services/oakdoc-rollout.service';

const tenantId = 'tenant-1';
const oakDocMetadata = {
  documentEngine: 'OAKDOC',
  oakDocGenerated: {
    schemaVersion: 1,
    storageKey: 'k',
    fileName: 'a.docx',
    fileSize: 1,
    sha256: 'a'.repeat(64),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    templateId: 't',
    templateVersion: 1,
    templateSha256: 'b'.repeat(64),
    generatedAt: '2026-09-26T00:00:00.000Z',
    fieldsUpdated: 0,
    unresolvedTags: [],
    conditionsResolved: 0,
    conditionsKept: 0,
    conditionsRemoved: 0,
    repeatersResolved: 0,
    repeaterItemsCreated: 0,
  },
};

function doc(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'DRAFT',
    finalizedAt: null,
    signedAt: null,
    content: `<p>${id}</p>`,
    metadata: null,
    serviceAgreement: null,
    batchItem: null,
    _count: { taskStageOutcomes: 0, esigningEnvelopeDocuments: 0 },
    ...overrides,
  };
}

let documents: ReturnType<typeof doc>[];

beforeEach(() => {
  vi.clearAllMocks();
  documents = [
    doc('draft-free'),
    doc('draft-final', { status: 'FINALIZED', finalizedAt: new Date() }),
    doc('draft-signing', { _count: { taskStageOutcomes: 0, esigningEnvelopeDocuments: 1 } }),
    doc('draft-task', { _count: { taskStageOutcomes: 1, esigningEnvelopeDocuments: 0 } }),
    doc('draft-converted'),
    doc('copy-1', {
      metadata: {
        ...oakDocMetadata,
        oakDocMigration: {
          schemaVersion: 1,
          kind: 'A4_DRAFT_CONVERSION',
          sourceDocumentId: 'draft-converted',
          sourceRevision: 3,
          sourceContentSha256: 'c'.repeat(64),
          diagnostics: [],
          status: 'PENDING_REVIEW',
        },
      },
    }),
  ];
  prismaMock.generatedDocument.findMany.mockImplementation(async () => documents);
  prismaMock.documentGenerationBatchItem.findMany.mockResolvedValue([
    { template: { contentJson: null } },
    { template: { contentJson: { oakDoc: { schemaVersion: 1 } } } },
  ]);
  prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });
});

describe('OakDoc rollout inventory', () => {
  it('gives every A4 document a disposition and lists only convertible drafts in the manifest', async () => {
    const inventory = await buildOakDocRolloutInventory(tenantId);

    const dispositions = Object.fromEntries(
      inventory.documents.items.map((item) => [item.documentId, item.disposition]),
    );
    expect(dispositions).toEqual({
      'draft-free': 'CONVERT',
      'draft-final': 'HISTORICAL',
      'draft-signing': 'BLOCKED_IN_SIGNING',
      'draft-task': 'BLOCKED_RELATION',
      'draft-converted': 'CONVERTED_PENDING_REVIEW',
    });
    expect(inventory.documents.items.find((item) => item.documentId === 'draft-converted')?.targetDocumentId)
      .toBe('copy-1');
    expect(inventory.draftConversionManifest.items).toEqual([{
      documentId: 'draft-free',
      revision: 3,
      contentSha256: createHash('sha256').update('<p>draft-free</p>').digest('hex'),
    }]);
    expect(inventory.draftConversionManifest.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(inventory.templates.byStatus).toEqual({ UNMAPPED_LEGACY: 1 });
    expect(inventory.unfinishedBatchItemsOnA4Templates).toBe(1);
    expect(JSON.stringify(inventory)).not.toContain('<p>');
  });

  it('applies only the manifest the operator approved', async () => {
    const { draftConversionManifest } = await buildOakDocRolloutInventory(tenantId);
    convertA4DraftToOakDoc.mockResolvedValue({
      document: { id: 'copy-2' },
      reused: false,
      conversion: { diagnostics: [{ severity: 'error' }] },
    });

    const run = await applyA4DraftConversionManifest({
      tenantId,
      userId: 'user-1',
      manifestHash: draftConversionManifest.hash,
    });
    expect(convertA4DraftToOakDoc).toHaveBeenCalledWith(
      { documentId: 'draft-free', expectedRevision: 3 },
      { tenantId, userId: 'user-1' },
    );
    expect(run.results).toEqual([
      { documentId: 'draft-free', outcome: 'created', targetDocumentId: 'copy-2', errorCount: 1 },
    ]);
  });

  it('refuses a stale manifest and an unknown operator without converting anything', async () => {
    const { draftConversionManifest } = await buildOakDocRolloutInventory(tenantId);
    documents[0] = doc('draft-free', { content: '<p>edited since the dry run</p>' });

    await expect(applyA4DraftConversionManifest({
      tenantId,
      userId: 'user-1',
      manifestHash: draftConversionManifest.hash,
    })).rejects.toMatchObject({ details: { reason: 'OAKDOC_MANIFEST_CHANGED' } });

    prismaMock.user.findFirst.mockResolvedValue(null);
    await expect(applyA4DraftConversionManifest({ tenantId, userId: 'user-x', manifestHash: 'a'.repeat(64) }))
      .rejects.toThrow('operator');
    expect(convertA4DraftToOakDoc).not.toHaveBeenCalled();
  });

  it('reports a per-item failure and keeps going', async () => {
    documents.push(doc('draft-free-2'));
    const { draftConversionManifest } = await buildOakDocRolloutInventory(tenantId);
    convertA4DraftToOakDoc
      .mockRejectedValueOnce(Object.assign(new Error('changed'), { details: { reason: 'OAKDOC_CONVERSION_SOURCE_CHANGED' } }))
      .mockResolvedValueOnce({ document: { id: 'copy-3' }, reused: true, conversion: { diagnostics: [] } });

    const run = await applyA4DraftConversionManifest({
      tenantId,
      userId: 'user-1',
      manifestHash: draftConversionManifest.hash,
    });
    expect(run.results.map((item) => item.outcome)).toEqual(['failed', 'reused']);
    expect(run.results[0].reason).toBe('OAKDOC_CONVERSION_SOURCE_CHANGED');
  });
});
