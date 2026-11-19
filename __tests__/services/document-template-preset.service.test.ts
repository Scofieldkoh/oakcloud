// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAKDOC_MIME_TYPE } from '@/lib/document-editor/oakdoc-template';
import { ConflictError, NotFoundError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), audit: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit }));
vi.mock('@/services/oakdoc-migration.service', () => ({ resolveTemplateIdsForNewRun: mocks.resolve }));

import { createDocumentTemplatePreset, updateDocumentTemplatePreset } from '@/services/document-template-preset.service';

const id = '33333333-3333-4333-8333-333333333333';
const a = '55555555-5555-4555-8555-555555555555';
const b = '66666666-6666-4666-8666-666666666666';
const params = { tenantId: 'workspace-a', userId: 'user-a' };

// No database connection, setup, or cleanup: exercise the real service with an
// in-memory conditional-write boundary. PostgreSQL locking still needs its gate.
function database() {
  const row = {
    id, tenantId: params.tenantId, name: 'Pack', normalizedName: 'pack', version: 1,
    createdAt: new Date('2026-11-19T00:00:00Z'), updatedAt: new Date('2026-11-19T00:00:00Z'),
    items: [{ templateId: a, displayOrder: 0 }],
  };
  const tx = {
    documentTemplatePreset: {
      findFirst: vi.fn(async ({ where }) => where.id === id && where.tenantId === row.tenantId ? structuredClone(row) : null),
      create: vi.fn(async () => structuredClone(row)),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.id !== row.id || where.tenantId !== row.tenantId || (where.version !== undefined && where.version !== row.version)) return { count: 0 };
        row.version += data.version?.increment ?? 0;
        if (data.name !== undefined) row.name = data.name;
        return { count: 1 };
      }),
    },
    documentTemplate: {
      findMany: vi.fn(async () => [a, b].map((templateId) => ({
        id: templateId,
        contentJson: { oakDoc: { schemaVersion: 1, storageKey: 'test.docx', fileName: 'test.docx', fileSize: 1, sha256: '0'.repeat(64), mimeType: OAKDOC_MIME_TYPE, fieldTags: [] } },
      }))),
    },
    documentTemplatePresetItem: {
      deleteMany: vi.fn(async () => { row.items = []; }),
      createMany: vi.fn(async ({ data }) => { row.items = data.map(({ templateId, displayOrder }: { templateId: string; displayOrder: number }) => ({ templateId, displayOrder })); }),
    },
  };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  return { row, tx };
}

describe('document template preset mutation boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns only an id on create without hydrating any template contents', async () => {
    const { tx } = database();
    expect(await createDocumentTemplatePreset({ name: 'Pack', templateIds: [a] }, params)).toEqual({ id });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(tx.documentTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, contentJson: true } }));
  });

  it('advances the version on every success even when the timestamp and name are unchanged', async () => {
    const { row, tx } = database();
    for (const expectedVersion of [1, 2]) {
      expect(await updateDocumentTemplatePreset(id, { name: 'Pack', expectedVersion }, params)).toEqual({ id });
      expect(row.version).toBe(expectedVersion + 1);
    }
    expect(tx.documentTemplatePreset.updateMany).toHaveBeenLastCalledWith({
      where: { id, tenantId: params.tenantId, version: 2 },
      data: { name: 'Pack', normalizedName: 'pack', updatedById: params.userId, version: { increment: 1 } },
    });
    expect(row.updatedAt.toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('allows only one competing writer, with no member replacement or audit from the loser', async () => {
    const { row, tx } = database();
    // Hold both reads until both writers have read the same before-selection.
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let readers = 0;
    tx.documentTemplatePreset.findFirst.mockImplementation(async () => {
      const snapshot = structuredClone(row);
      if (++readers === 2) release();
      await barrier;
      return snapshot;
    });
    const selections = [[a, a], [b]];
    const results = await Promise.allSettled(selections.map((templateIds) => updateDocumentTemplatePreset(id, { templateIds, expectedVersion: 1 }, params)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ConflictError);
    const winner = results.findIndex((result) => result.status === 'fulfilled');
    expect(row.items.map((item) => item.templateId)).toEqual(selections[winner]);
    expect(row.version).toBe(2);
    expect(tx.documentTemplatePresetItem.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.documentTemplatePresetItem.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      changes: { templateIds: { old: [a], new: selections[winner] } },
    }), tx);
    const writeOrder = tx.documentTemplatePreset.updateMany.mock.invocationCallOrder[0];
    expect(writeOrder).toBeLessThan(tx.documentTemplatePresetItem.deleteMany.mock.invocationCallOrder[0]);
    expect(writeOrder).toBeLessThan(mocks.audit.mock.invocationCallOrder[0]);
  });

  it('rejects a stale writer before it can change members or audit history', async () => {
    const { row, tx } = database();
    row.version = 2;
    await expect(updateDocumentTemplatePreset(id, { templateIds: [b], expectedVersion: 1 }, params)).rejects.toBeInstanceOf(ConflictError);
    expect(row.items.map((item) => item.templateId)).toEqual([a]);
    expect(row.version).toBe(2);
    expect(tx.documentTemplatePresetItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.documentTemplatePresetItem.createMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([id, '77777777-7777-4777-8777-777777777777'])('does not distinguish a foreign preset from a missing one (%s)', async (presetId) => {
    const { tx } = database();
    await expect(updateDocumentTemplatePreset(presetId, { name: 'Hijacked', expectedVersion: 1 }, { ...params, tenantId: 'workspace-b' })).rejects.toEqual(new NotFoundError('Template preset not found'));
    expect(tx.documentTemplatePreset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: presetId, tenantId: 'workspace-b' } }));
    expect(tx.documentTemplatePreset.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
