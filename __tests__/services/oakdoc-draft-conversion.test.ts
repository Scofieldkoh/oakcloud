// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  generatedDocument: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  esigningEnvelopeDocument: { findFirst: vi.fn() },
  taskStageOutcome: { findMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const objects = vi.hoisted(() => new Map<string, Buffer>());
const storageMock = vi.hoisted(() => ({
  upload: vi.fn(async (key: string, body: Buffer) => { objects.set(key, Buffer.from(body)); }),
  delete: vi.fn(async (key: string) => { objects.delete(key); }),
}));
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  storage: storageMock,
}));

const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => auditMock);

const revisionMock = vi.hoisted(() => ({
  claimGeneratedDocumentRevision: vi.fn(),
  readGeneratedDocumentRevision: vi.fn(),
}));
vi.mock('@/lib/document-editor/generated-document-revision', () => revisionMock);

const taskMock = vi.hoisted(() => ({ safelyReconcileGeneratedDocumentTaskOutcomes: vi.fn(async () => undefined) }));
vi.mock('@/services/tasks/integration.service', () => taskMock);

import {
  convertA4DraftToOakDoc,
  readA4DraftConversionMetadata,
  reviewA4DraftConversion,
} from '@/services/oakdoc-draft-conversion.service';
import { readGeneratedOakDocAssetMetadata } from '@/lib/document-editor/document-engine';
import { ConflictError, ValidationError } from '@/lib/errors';

const tenantId = 'tenant-1';
const actor = { tenantId, userId: 'user-1' };
const sourceHtml = '<h1>Engagement letter</h1><p>Edited by hand: fees are <strong>S$1,200</strong>.</p>';

type Row = Record<string, any>;
let rows: Map<string, Row>;
let revisions: Map<string, number>;

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function seedSource(overrides: Row = {}): Row {
  const source = {
    id: 'a4-1',
    tenantId,
    title: 'Engagement letter',
    status: 'DRAFT',
    finalizedAt: null,
    signedAt: null,
    deletedAt: null,
    companyId: 'company-1',
    templateId: 'template-a4',
    templateVersion: 2,
    sharePointRelativeFolderPathSnapshot: null,
    useLetterhead: true,
    placeholderData: { 'company.name': 'Acme' },
    content: sourceHtml,
    contentJson: null,
    metadata: { selectedParties: { directorId: 'director-1' } },
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
  rows.set(source.id, source);
  revisions.set(source.id, 5);
  return source;
}

function matchesWhere(row: Row, where: Row): boolean {
  if (where.id && row.id !== where.id) return false;
  if (where.tenantId && row.tenantId !== where.tenantId) return false;
  if ('deletedAt' in where && where.deletedAt === null && row.deletedAt) return false;
  if (where.metadata?.path) {
    const [outer, inner] = where.metadata.path;
    if (row.metadata?.[outer]?.[inner] !== where.metadata.equals) return false;
  }
  return true;
}

beforeEach(() => {
  vi.clearAllMocks();
  objects.clear();
  rows = new Map();
  revisions = new Map();
  prismaMock.generatedDocument.findFirst.mockImplementation(async ({ where }: Row) => {
    const found = Array.from(rows.values()).filter((row) => matchesWhere(row, where));
    return found.at(-1) ?? null;
  });
  prismaMock.generatedDocument.create.mockImplementation(async ({ data }: Row) => {
    const row = { deletedAt: null, createdAt: new Date(), ...data };
    rows.set(row.id, row);
    revisions.set(row.id, 0);
    return row;
  });
  prismaMock.generatedDocument.update.mockImplementation(async ({ where, data }: Row) => {
    const row = { ...rows.get(where.id)!, ...data };
    rows.set(row.id, row);
    return row;
  });
  prismaMock.esigningEnvelopeDocument.findFirst.mockResolvedValue(null);
  prismaMock.taskStageOutcome.findMany.mockResolvedValue([]);
  prismaMock.taskStageOutcome.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.$queryRaw.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work(prismaMock));
  revisionMock.readGeneratedDocumentRevision.mockImplementation(
    async (_client: unknown, id: string) => revisions.get(id) ?? 0,
  );
  revisionMock.claimGeneratedDocumentRevision.mockImplementation(async (_tx: unknown, input: Row) => {
    const current = revisions.get(input.id) ?? 0;
    if (input.expectedRevision !== current) throw new ConflictError('stale');
    revisions.set(input.id, current + 1);
    return { revision: current + 1 };
  });
});

describe('A4 draft conversion to an OakDoc copy', () => {
  it('creates a linked OakDoc draft for review and leaves the original untouched', async () => {
    const source = seedSource();
    const before = structuredClone(source);

    const result = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);

    expect(result.reused).toBe(false);
    expect(rows.get('a4-1')).toEqual(before);
    expect(prismaMock.generatedDocument.update).not.toHaveBeenCalled();

    const copy = result.document as Row;
    expect(copy.id).not.toBe('a4-1');
    expect(copy.title).toBe('Engagement letter (OakDoc)');
    expect(copy.status).toBe('DRAFT');
    expect(copy.companyId).toBe('company-1');
    expect(readGeneratedOakDocAssetMetadata(copy.metadata)).not.toBeNull();
    expect(copy.metadata.selectedParties).toEqual({ directorId: 'director-1' });
    expect(readA4DraftConversionMetadata(copy.metadata)).toMatchObject({
      kind: 'A4_DRAFT_CONVERSION',
      method: 'a4-html-import/1',
      sourceDocumentId: 'a4-1',
      sourceRevision: 5,
      sourceContentSha256: sha(sourceHtml),
      status: 'PENDING_REVIEW',
      diagnostics: [],
    });

    const asset = readGeneratedOakDocAssetMetadata(copy.metadata)!;
    const stored = objects.get(asset.storageKey)!;
    expect(asset.storageKey.startsWith(`${tenantId}/generated-documents/${copy.id}/oakdoc/`)).toBe(true);
    expect(createHash('sha256').update(stored).digest('hex')).toBe(asset.sha256);
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityId: copy.id,
      metadata: expect.objectContaining({ sourceDocumentId: 'a4-1', sourceRevision: 5 }),
    }));
  });

  it('returns the same copy on retry instead of creating a duplicate', async () => {
    seedSource();
    const first = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    const second = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);

    expect(second.reused).toBe(true);
    expect((second.document as Row).id).toBe((first.document as Row).id);
    expect(prismaMock.generatedDocument.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a new copy while an older unreviewed copy exists', async () => {
    seedSource();
    await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    rows.set('a4-1', { ...rows.get('a4-1')!, content: '<p>Changed</p>' });
    revisions.set('a4-1', 6);

    await expect(convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 6 }, actor))
      .rejects.toMatchObject({ details: { reason: 'OAKDOC_CONVERSION_TARGET_EXISTS' } });
  });

  it('only converts unfinalized A4 drafts that are not in e-signing', async () => {
    seedSource({ status: 'FINALIZED', finalizedAt: new Date() });
    await expect(convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor))
      .rejects.toMatchObject({ details: { reason: 'OAKDOC_CONVERSION_SOURCE_NOT_DRAFT' } });

    seedSource({ metadata: { documentEngine: 'OAKDOC' } });
    await expect(convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor))
      .rejects.toBeInstanceOf(ValidationError);

    seedSource();
    prismaMock.esigningEnvelopeDocument.findFirst.mockResolvedValueOnce({ id: 'envelope-doc-1' });
    await expect(convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor))
      .rejects.toMatchObject({ details: { reason: 'OAKDOC_CONVERSION_SOURCE_IN_SIGNING' } });
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('rejects a stale revision and a source edited during conversion', async () => {
    seedSource();
    await expect(convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 4 }, actor))
      .rejects.toMatchObject({ details: { reason: 'OAKDOC_CONVERSION_SOURCE_CHANGED' } });

    // The upload happens, then the source moves before the copy is saved.
    storageMock.upload.mockImplementationOnce(async (key: string, body: Buffer) => {
      objects.set(key, Buffer.from(body));
      revisions.set('a4-1', 6);
    });
    await expect(convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor))
      .rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.generatedDocument.create).not.toHaveBeenCalled();
    expect(objects.size).toBe(0);
  });

  it('records unsupported content and blocks acceptance until each error is confirmed', async () => {
    seedSource({ content: `${sourceHtml}<p><img src="x.png"></p><table><tr><td rowspan="2">A</td></tr></table>` });
    const { document } = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    const copy = document as Row;
    const errors = readA4DraftConversionMetadata(copy.metadata)!.diagnostics
      .filter((entry) => entry.severity === 'error')
      .map((entry) => entry.code);
    expect(errors).toEqual(expect.arrayContaining(['OAKDOC_IMPORT_IMAGE_DROPPED', 'OAKDOC_IMPORT_MERGED_CELLS']));

    await expect(reviewA4DraftConversion({
      documentId: copy.id,
      expectedRevision: 0,
      decision: 'accept',
      acknowledgedCodes: ['OAKDOC_IMPORT_IMAGE_DROPPED'],
    }, actor)).rejects.toMatchObject({
      details: { reason: 'OAKDOC_CONVERSION_UNACKNOWLEDGED_ERRORS', codes: ['OAKDOC_IMPORT_MERGED_CELLS'] },
    });

    const accepted = await reviewA4DraftConversion({
      documentId: copy.id,
      expectedRevision: 0,
      decision: 'accept',
      acknowledgedCodes: errors,
    }, actor);
    expect(accepted.conversion).toMatchObject({ status: 'ACCEPTED', reviewedById: 'user-1' });
    expect(readA4DraftConversionMetadata(rows.get(copy.id)!.metadata)?.status).toBe('ACCEPTED');
    expect(rows.get('a4-1')!.deletedAt).toBeNull();

    await expect(reviewA4DraftConversion({ documentId: copy.id, expectedRevision: 1, decision: 'accept' }, actor))
      .rejects.toMatchObject({ details: { reason: 'OAKDOC_CONVERSION_ALREADY_REVIEWED' } });
  });

  it('moves the original task outcome to the accepted copy so the task continues with it', async () => {
    const context = { taskId: 'task-1', taskStageId: 'stage-1' };
    seedSource({ metadata: { taskIntegrationContext: context } });
    const { document } = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    const copy = document as Row;
    prismaMock.taskStageOutcome.findMany.mockResolvedValue([{ id: 'outcome-1', taskStageId: 'stage-1' }]);

    await reviewA4DraftConversion({ documentId: copy.id, expectedRevision: 0, decision: 'accept' }, actor);

    expect(prismaMock.taskStageOutcome.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, generatedDocumentId: 'a4-1' },
    }));
    expect(prismaMock.taskStageOutcome.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['outcome-1'] } },
      data: { generatedDocumentId: copy.id },
    });
    const metadata = rows.get(copy.id)!.metadata;
    expect(metadata.taskIntegrationContext).toEqual(context);
    expect(readA4DraftConversionMetadata(metadata)?.transferredTaskStageIds).toEqual(['stage-1']);
    expect(taskMock.safelyReconcileGeneratedDocumentTaskOutcomes).toHaveBeenCalledWith(tenantId, copy.id, 'user-1');
    expect(rows.get('a4-1')!.metadata).toEqual({ taskIntegrationContext: context });
  });

  it('leaves task outcomes alone when a copy is rejected', async () => {
    seedSource();
    const { document } = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    await reviewA4DraftConversion({ documentId: (document as Row).id, expectedRevision: 0, decision: 'reject' }, actor);
    expect(prismaMock.taskStageOutcome.updateMany).not.toHaveBeenCalled();
  });

  it('will not accept a copy of an original that changed afterwards', async () => {
    seedSource();
    const { document } = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    revisions.set('a4-1', 6);

    await expect(reviewA4DraftConversion({
      documentId: (document as Row).id,
      expectedRevision: 0,
      decision: 'accept',
    }, actor)).rejects.toMatchObject({ details: { reason: 'OAKDOC_CONVERSION_SOURCE_CHANGED' } });
  });

  it('rejecting removes only the copy, so the draft can be converted again', async () => {
    seedSource();
    const { document } = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    const copyId = (document as Row).id;

    const rejected = await reviewA4DraftConversion({ documentId: copyId, expectedRevision: 0, decision: 'reject' }, actor);
    expect(rejected.decision).toBe('reject');
    expect(rows.get(copyId)!.deletedAt).toBeInstanceOf(Date);
    expect(rows.get('a4-1')!.deletedAt).toBeNull();

    const again = await convertA4DraftToOakDoc({ documentId: 'a4-1', expectedRevision: 5 }, actor);
    expect(again.reused).toBe(false);
    expect((again.document as Row).id).not.toBe(copyId);
  });
});
