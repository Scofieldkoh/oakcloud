import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const FIRST_CONTENT = '<p>Q2 concurrent writer A</p>';
const SECOND_CONTENT = '<p>Q2 concurrent writer B</p>';
const FRESH_CONTENT = '<p>Q2 fresh revision</p>';
const DRAFT_CONTENT = '<p>Q2 recovered draft</p>';

describePostgres('A4 editor Q2 persistence / concurrency acceptance', () => {
  let prisma: Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
  let updateGeneratedDocument: typeof import('@/services/document-generator.service')['updateGeneratedDocument'];
  let saveDraft: typeof import('@/services/document-generator.service')['saveDraft'];
  let getLatestDraft: typeof import('@/services/document-generator.service')['getLatestDraft'];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const prismaModule = await import('@/lib/prisma');
    prisma = prismaModule.getPrisma();
    ({ updateGeneratedDocument, saveDraft, getLatestDraft } = await import(
      '@/services/document-generator.service'
    ));
  });

  afterEach(async () => {
    for (const tenantId of tenantIds.splice(0)) {
      await prisma.documentGenerationBatchItem.deleteMany({ where: { tenantId } });
      await prisma.documentGenerationBatch.deleteMany({ where: { tenantId } });
      await prisma.documentDraft.deleteMany({ where: { document: { tenantId } } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.generatedDocument.deleteMany({ where: { tenantId } });
      await prisma.documentTemplate.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.workspace.delete({ where: { id: tenantId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedFixture() {
    const suffix = randomUUID();
    const workspace = await prisma.workspace.create({
      data: { name: `Q2 persistence ${suffix}`, slug: `q2-persistence-${suffix}` },
    });
    tenantIds.push(workspace.id);
    const user = await prisma.user.create({
      data: {
        tenantId: workspace.id,
        email: `q2-persistence-${suffix}@example.test`,
        passwordHash: 'synthetic-test-only',
        firstName: 'Q2',
        lastName: 'Verify',
      },
    });
    const template = await prisma.documentTemplate.create({
      data: {
        tenantId: workspace.id,
        name: `Q2 template ${suffix}`,
        content: '<p>Q2 template</p>',
        createdById: user.id,
      },
    });
    const document = await prisma.generatedDocument.create({
      data: {
        tenantId: workspace.id,
        templateId: template.id,
        templateVersion: template.version,
        title: 'Q2 concurrency document',
        content: '<p>Q2 base revision</p>',
        status: 'DRAFT',
        createdById: user.id,
      },
    });
    return {
      actor: { tenantId: workspace.id, userId: user.id },
      document,
    };
  }

  it('admits exactly one same-revision writer, preserves typed JSON distinctions, and fails stale writes closed', async () => {
    const { actor, document } = await seedFixture();
    const typedContentJson = {
      a4Editor: { schemaVersion: 1 },
      q2: {
        approved: false,
        count: 0,
        empty: '',
        date: '2026-09-13',
        currency: '1234.5000',
        notes: 'line one\nline two',
      },
    };

    const outcomes = await Promise.allSettled([
      updateGeneratedDocument(
        {
          id: document.id,
          expectedRevision: 0,
          content: FIRST_CONTENT,
          contentJson: typedContentJson,
        },
        actor,
      ),
      updateGeneratedDocument(
        {
          id: document.id,
          expectedRevision: 0,
          content: SECOND_CONTENT,
          contentJson: typedContentJson,
        },
        actor,
      ),
    ]);

    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof updateGeneratedDocument>>> =>
        outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value.revision).toBe(1);

    const afterRace = await prisma.generatedDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect([FIRST_CONTENT, SECOND_CONTENT]).toContain(afterRace.content);
    expect(afterRace.content).not.toContain('Q2 concurrent writer A</p><p>Q2 concurrent writer B');
    const stored = afterRace.contentJson as Record<string, unknown>;
    const q2 = stored.q2 as Record<string, unknown>;
    expect(q2.approved).toBe(false);
    expect(q2.count).toBe(0);
    expect(q2.empty).toBe('');
    expect(q2.currency).toBe('1234.5000');
    expect(q2.notes).toBe('line one\nline two');
    expect(Object.prototype.hasOwnProperty.call(q2, 'absent')).toBe(false);

    await expect(
      updateGeneratedDocument(
        { id: document.id, expectedRevision: 0, content: '<p>Q2 stale overwrite</p>' },
        actor,
      ),
    ).rejects.toThrow();

    const fresh = await updateGeneratedDocument(
      { id: document.id, expectedRevision: 1, content: FRESH_CONTENT },
      actor,
    );
    expect(fresh.revision).toBe(2);

    await expect(
      updateGeneratedDocument(
        { id: document.id, expectedRevision: 1, content: '<p>Q2 duplicate stale retry</p>' },
        actor,
      ),
    ).rejects.toThrow();

    const afterStaleRetry = await prisma.generatedDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(afterStaleRetry.content).toBe(FRESH_CONTENT);
  });

  it('keeps draft recovery revision-aware and isolates tenant/read-only failure paths from later state', async () => {
    const { actor, document } = await seedFixture();

    const saved = await updateGeneratedDocument(
      { id: document.id, expectedRevision: 0, content: FRESH_CONTENT },
      actor,
    );
    expect(saved.revision).toBe(1);

    await saveDraft(
      {
        documentId: document.id,
        baseRevision: 1,
        content: DRAFT_CONTENT,
        contentJson: { q2: { recovery: true, approved: false, count: 0 } },
      },
      actor,
    );
    const draft = await getLatestDraft(document.id, actor.userId);
    expect(draft).toMatchObject({
      content: DRAFT_CONTENT,
      baseRevision: 1,
    });
    expect(draft?.contentJson).toEqual({ q2: { recovery: true, approved: false, count: 0 } });

    await expect(
      updateGeneratedDocument(
        { id: document.id, expectedRevision: 1, content: '<p>Wrong tenant</p>' },
        { tenantId: `${actor.tenantId}-wrong`, userId: actor.userId },
      ),
    ).rejects.toThrow();

    let reopened = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(reopened.content).toBe(FRESH_CONTENT);

    await prisma.generatedDocument.update({
      where: { id: document.id },
      data: { status: 'FINALIZED', finalizedAt: new Date(), finalizedById: actor.userId },
    });
    await expect(
      updateGeneratedDocument(
        { id: document.id, expectedRevision: 1, content: '<p>Forbidden finalized edit</p>' },
        actor,
      ),
    ).rejects.toThrow();

    reopened = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(reopened.status).toBe('FINALIZED');
    expect(reopened.content).toBe(FRESH_CONTENT);
    expect(reopened.content).not.toContain('Wrong tenant');
    expect(reopened.content).not.toContain('Forbidden finalized edit');
  });
});
