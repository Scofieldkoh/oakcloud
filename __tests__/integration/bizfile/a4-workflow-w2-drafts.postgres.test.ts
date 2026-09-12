// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  deleteEditorDrafts,
  getLatestEditorDraft,
  saveSequencedEditorDraft,
} from '@/services/document-draft-workflow.service';

const connectionString = process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

suite('A4 WORKFLOW W2 draft sequencing on disposable PostgreSQL', () => {
  let tenantId = '';
  let userId = '';
  let documentId = '';

  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (
      url.protocol !== 'postgresql:'
      || url.hostname !== '127.0.0.1'
      || url.port !== '55439'
      || url.pathname !== '/business_assistant_test'
      || url.username !== 'assistant_test'
    ) {
      throw new Error(
        'A4 W2 PostgreSQL tests require the dedicated disposable database on 127.0.0.1:55439.',
      );
    }
    await prisma.$connect();
  }, 15_000);

  beforeEach(async () => {
    const suffix = randomBytes(6).toString('hex');
    const workspace = await prisma.workspace.create({
      data: {
        name: `A4 W2 ${suffix}`,
        slug: `a4-w2-${suffix}`,
      },
      select: { id: true },
    });
    tenantId = workspace.id;

    const user = await prisma.user.create({
      data: {
        email: `a4-w2-${suffix}@example.invalid`,
        passwordHash: 'synthetic-test-only',
        firstName: 'A4',
        lastName: 'W2',
        tenantId,
      },
      select: { id: true },
    });
    userId = user.id;

    const document = await prisma.generatedDocument.create({
      data: {
        tenantId,
        title: `Synthetic W2 ${suffix}`,
        content: '<p>base</p>',
        contentJson: { version: 1 },
        status: 'DRAFT',
        createdById: userId,
      },
      select: { id: true },
    });
    documentId = document.id;
  });

  afterEach(async () => {
    if (!tenantId) return;
    await prisma.documentDraft.deleteMany({ where: { documentId } });
    await prisma.generatedDocument.deleteMany({ where: { id: documentId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.workspace.deleteMany({ where: { id: tenantId } });
    tenantId = '';
    userId = '';
    documentId = '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const draftInput = (
    content: string,
    localSnapshotRevision: number,
    writerInstanceId = 'writer-a',
    baseRevision = 0,
  ) => ({
    documentId,
    content,
    contentJson: { version: 1, marker: content },
    baseRevision,
    metadata: {
      editorSessionKey: `generated-document:${documentId}`,
      writerInstanceId,
      localSnapshotRevision,
    },
  });

  it('serializes overlapping saves so the highest local snapshot wins', async () => {
    const [first, second] = await Promise.all([
      saveSequencedEditorDraft(draftInput('<p>revision 1</p>', 1), { tenantId, userId }),
      saveSequencedEditorDraft(draftInput('<p>revision 2</p>', 2), { tenantId, userId }),
    ]);

    expect(first.baseRevision).toBe(0);
    expect(second.baseRevision).toBe(0);
    const latest = await getLatestEditorDraft(documentId, userId, tenantId);
    expect(latest?.content).toBe('<p>revision 2</p>');
    expect(latest?.localSnapshotRevision).toBe(2);
    expect(await prisma.documentDraft.count({ where: { documentId, userId } })).toBe(1);
  });

  it('rejects a draft write whose canonical base revision is stale', async () => {
    await saveSequencedEditorDraft(
      draftInput('<p>revision 1</p>', 1),
      { tenantId, userId },
    );
    await prisma.generatedDocument.update({
      where: { id: documentId },
      data: { revision: { increment: 1 } },
    });

    await expect(saveSequencedEditorDraft(
      draftInput('<p>stale</p>', 2, 'writer-a', 0),
      { tenantId, userId },
    )).rejects.toThrow('This document changed since you opened it. Reload or reconcile before saving.');
    const latest = await getLatestEditorDraft(documentId, userId, tenantId);
    expect(latest?.content).toBe('<p>revision 1</p>');
  });

  it('deletes only a draft covered by the acknowledged writer snapshot', async () => {
    await saveSequencedEditorDraft(
      draftInput('<p>revision 4</p>', 4),
      { tenantId, userId },
    );

    expect(await deleteEditorDrafts({
      documentId,
      userId,
      tenantId,
      sessionKey: `generated-document:${documentId}`,
      writerInstanceId: 'writer-a',
      throughLocalSnapshotRevision: 3,
    })).toBe(0);
    expect(await prisma.documentDraft.count({ where: { documentId, userId } })).toBe(1);

    expect(await deleteEditorDrafts({
      documentId,
      userId,
      tenantId,
      sessionKey: `generated-document:${documentId}`,
      writerInstanceId: 'writer-a',
      throughLocalSnapshotRevision: 4,
    })).toBe(1);
    expect(await prisma.documentDraft.count({ where: { documentId, userId } })).toBe(0);
  });

  it('lets a fresh writer instance supersede an older tab even when its local revision restarts', async () => {
    await saveSequencedEditorDraft(
      draftInput('<p>old tab</p>', 9, 'writer-old'),
      { tenantId, userId },
    );
    const replacement = await saveSequencedEditorDraft(
      draftInput('<p>fresh reload</p>', 1, 'writer-fresh'),
      { tenantId, userId },
    );

    expect(replacement.ignoredAsStale).not.toBe(true);
    expect(replacement.content).toBe('<p>fresh reload</p>');
    expect(replacement.writerInstanceId).toBe('writer-fresh');
    expect(replacement.localSnapshotRevision).toBe(1);
  });

  it('refuses draft persistence once the canonical document is finalized', async () => {
    await prisma.generatedDocument.update({
      where: { id: documentId },
      data: { status: 'FINALIZED' },
    });

    await expect(saveSequencedEditorDraft(
      draftInput('<p>must not persist</p>', 1),
      { tenantId, userId },
    )).rejects.toThrow(/not editable/i);
    expect(await prisma.documentDraft.count({ where: { documentId, userId } })).toBe(0);
  });
});
