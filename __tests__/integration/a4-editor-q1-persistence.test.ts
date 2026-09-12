import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_A4_EDITOR_CAPABILITIES,
  SERVER_A4_EDITOR_CAPABILITIES,
  assertA4EditorReaderFormatLevel,
  assertA4EditorWriterFormatLevel,
} from '@/lib/document-editor/a4-editor-capabilities';
import {
  detectA4StoredFormatLevel,
  readA4StoredDocument,
} from '@/lib/document-editor/a4-editor-format';

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const SOFT_PAGINATION_MARKERS = [
  'data-a4-flow-id',
  'data-flow-id',
  'data-flow-continuation-item',
  'data-page-index',
  'data-page-number',
  'data-measurement',
  'data-oversized',
];

const A_CONTENT = [
  '<p>Q1-A-START</p>',
  '<ol start="5" class="list-alpha list-bold-numbers">',
  '<li><p>Q1-A-FIFTH</p><ol><li><p>Q1-A-NESTED</p></li></ol></li>',
  '<li><p>Q1-A-SIXTH</p></li>',
  '</ol>',
  '<ol start="8"><li><p>Q1-A-CONTINUE</p></li></ol>',
  '<ol start="1"><li><p>Q1-A-RESTART</p></li></ol>',
  '<p>Q1-A-END</p>',
].join('');

const B_CONTENT = [
  '<p>Q1-B-START</p>',
  '<ul><li><p>Q1-B-ONLY</p></li></ul>',
  '<p>Q1-B-END</p>',
].join('');

function expectNoSoftPaginationMetadata(value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const marker of SOFT_PAGINATION_MARKERS) expect(serialized).not.toContain(marker);
}

describePostgres('A4 editor Q1 persistence / compatibility acceptance', () => {
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

  async function seedQ1Fixture() {
    const suffix = randomUUID();
    const workspace = await prisma.workspace.create({
      data: { name: `Q1 persistence ${suffix}`, slug: `q1-persistence-${suffix}` },
    });
    tenantIds.push(workspace.id);
    const user = await prisma.user.create({
      data: {
        tenantId: workspace.id,
        email: `q1-persistence-${suffix}@example.test`,
        passwordHash: 'synthetic-test-only',
        firstName: 'Q1',
        lastName: 'Verify',
      },
    });
    const [templateA, templateB] = await Promise.all([
      prisma.documentTemplate.create({
        data: {
          tenantId: workspace.id,
          name: `Q1 template A ${suffix}`,
          content: A_CONTENT,
          createdById: user.id,
        },
      }),
      prisma.documentTemplate.create({
        data: {
          tenantId: workspace.id,
          name: `Q1 template B ${suffix}`,
          content: B_CONTENT,
          createdById: user.id,
        },
      }),
    ]);
    const [documentA, documentB] = await Promise.all([
      prisma.generatedDocument.create({
        data: {
          tenantId: workspace.id,
          templateId: templateA.id,
          templateVersion: templateA.version,
          title: 'Q1 document A',
          content: '<p>Q1-A-BASE</p>',
          status: 'DRAFT',
          createdById: user.id,
        },
      }),
      prisma.generatedDocument.create({
        data: {
          tenantId: workspace.id,
          templateId: templateB.id,
          templateVersion: templateB.version,
          title: 'Q1 document B',
          content: '<p>Q1-B-BASE</p>',
          status: 'DRAFT',
          createdById: user.id,
        },
      }),
    ]);
    return {
      actor: { tenantId: workspace.id, userId: user.id },
      templateA,
      templateB,
      documentA,
      documentB,
    };
  }

  it('Q1-10/Q1-11 saves and reopens A/B independently with canonical, draft, and server snapshots agreeing', async () => {
    const fixture = await seedQ1Fixture();
    const { actor, documentA, documentB } = fixture;
    const contentJsonA = {
      a4Editor: { schemaVersion: 1 },
      q1: { documentKey: 'A', layoutKey: 'layout-a' },
    };
    const contentJsonB = {
      a4Editor: { schemaVersion: 1 },
      q1: { documentKey: 'B', layoutKey: 'layout-b' },
    };

    await saveDraft(
      { documentId: documentA.id, baseRevision: 0, content: A_CONTENT, contentJson: contentJsonA },
      actor,
    );
    await saveDraft(
      { documentId: documentB.id, baseRevision: 0, content: B_CONTENT, contentJson: contentJsonB },
      actor,
    );

    const savedA = await updateGeneratedDocument(
      { id: documentA.id, expectedRevision: 0, content: A_CONTENT, contentJson: contentJsonA },
      actor,
    );
    const savedB = await updateGeneratedDocument(
      { id: documentB.id, expectedRevision: 0, content: B_CONTENT, contentJson: contentJsonB },
      actor,
    );
    expect(savedA.revision).toBe(1);
    expect(savedB.revision).toBe(1);

    const [reopenedA, reopenedB, draftA, draftB] = await Promise.all([
      prisma.generatedDocument.findUniqueOrThrow({ where: { id: documentA.id } }),
      prisma.generatedDocument.findUniqueOrThrow({ where: { id: documentB.id } }),
      getLatestDraft(documentA.id, actor.userId),
      getLatestDraft(documentB.id, actor.userId),
    ]);

    expect(reopenedA.content).toBe(A_CONTENT);
    expect(reopenedB.content).toBe(B_CONTENT);
    expect(reopenedA.content).not.toContain('Q1-B-');
    expect(reopenedB.content).not.toContain('Q1-A-');
    expect(reopenedA.contentJson).toEqual(contentJsonA);
    expect(reopenedB.contentJson).toEqual(contentJsonB);
    expect(draftA).toMatchObject({ content: A_CONTENT, baseRevision: 0 });
    expect(draftB).toMatchObject({ content: B_CONTENT, baseRevision: 0 });

    const readerA = readA4StoredDocument(reopenedA.content, reopenedA.contentJson);
    const readerB = readA4StoredDocument(reopenedB.content, reopenedB.contentJson);
    const canonicalA = JSON.stringify(readerA.canonical);
    const canonicalB = JSON.stringify(readerB.canonical);
    expect(readerA.canonical.blocks.length).toBeGreaterThan(0);
    expect(readerB.canonical.blocks.length).toBeGreaterThan(0);
    expect(canonicalA).toContain('Q1-A-START');
    expect(canonicalA).not.toContain('Q1-B-');
    expect(canonicalB).toContain('Q1-B-START');
    expect(canonicalB).not.toContain('Q1-A-');
    expect(readerA.formatLevel).toBe(1);
    expect(readerB.formatLevel).toBe(1);

    expectNoSoftPaginationMetadata(reopenedA.content);
    expectNoSoftPaginationMetadata(reopenedB.content);
    expectNoSoftPaginationMetadata(reopenedA.contentJson);
    expectNoSoftPaginationMetadata(reopenedB.contentJson);
  });

  it('Q1 batch proof keeps two item identities, layouts, edited snapshots, and generated documents isolated', async () => {
    const fixture = await seedQ1Fixture();
    const { actor, templateA, templateB, documentA, documentB } = fixture;
    const batch = await prisma.documentGenerationBatch.create({
      data: {
        tenantId: actor.tenantId,
        createdById: actor.userId,
        masterFieldValues: { q1: 'synthetic-two-item-batch' },
      },
    });

    await prisma.documentGenerationBatchItem.createMany({
      data: [
        {
          tenantId: actor.tenantId,
          batchId: batch.id,
          templateId: templateA.id,
          generatedDocumentId: documentA.id,
          templateVersion: templateA.version,
          displayOrder: 0,
          configuration: { documentKey: 'A', layout: { orientation: 'portrait', marginTopMm: 18 } },
          editedContent: A_CONTENT,
          editedContentJson: { a4Editor: { schemaVersion: 1 }, q1: { item: 'A' } },
        },
        {
          tenantId: actor.tenantId,
          batchId: batch.id,
          templateId: templateB.id,
          generatedDocumentId: documentB.id,
          templateVersion: templateB.version,
          displayOrder: 1,
          configuration: { documentKey: 'B', layout: { orientation: 'landscape', marginTopMm: 27 } },
          editedContent: B_CONTENT,
          editedContentJson: { a4Editor: { schemaVersion: 1 }, q1: { item: 'B' } },
        },
      ],
    });

    const reopened = await prisma.documentGenerationBatch.findUniqueOrThrow({
      where: { id: batch.id },
      include: {
        items: {
          orderBy: { displayOrder: 'asc' },
          include: { generatedDocument: true },
        },
      },
    });
    expect(reopened.items).toHaveLength(2);
    const [itemA, itemB] = reopened.items;
    expect(itemA.generatedDocumentId).toBe(documentA.id);
    expect(itemB.generatedDocumentId).toBe(documentB.id);
    expect(itemA.templateId).toBe(templateA.id);
    expect(itemB.templateId).toBe(templateB.id);
    expect(itemA.configuration).toEqual({ documentKey: 'A', layout: { orientation: 'portrait', marginTopMm: 18 } });
    expect(itemB.configuration).toEqual({ documentKey: 'B', layout: { orientation: 'landscape', marginTopMm: 27 } });
    expect(itemA.editedContent).toBe(A_CONTENT);
    expect(itemB.editedContent).toBe(B_CONTENT);
    expect(itemA.editedContent).not.toContain('Q1-B-');
    expect(itemB.editedContent).not.toContain('Q1-A-');
    expect(itemA.generatedDocument.title).toBe('Q1 document A');
    expect(itemB.generatedDocument.title).toBe('Q1 document B');
    expectNoSoftPaginationMetadata(itemA.editedContentJson);
    expectNoSoftPaginationMetadata(itemB.editedContentJson);
  });

  it('Q1 reader compatibility keeps level-1 old/new readable, level-2 new-readable, and level-2 writer frozen', () => {
    const legacy = '<p>Legacy Q1 document</p><div class="page-break" data-break-type="hard"></div><p>After</p>';
    const level2 = '<p>Level 2 before<span data-a4-break="page"></span>after</p>';

    expect(detectA4StoredFormatLevel(legacy)).toBe(1);
    expect(detectA4StoredFormatLevel(level2)).toBe(2);
    expect(() => assertA4EditorReaderFormatLevel(1, DEFAULT_A4_EDITOR_CAPABILITIES)).not.toThrow();
    expect(() => assertA4EditorReaderFormatLevel(1, SERVER_A4_EDITOR_CAPABILITIES)).not.toThrow();
    expect(() => assertA4EditorReaderFormatLevel(2, DEFAULT_A4_EDITOR_CAPABILITIES)).toThrow();
    expect(() => assertA4EditorReaderFormatLevel(2, SERVER_A4_EDITOR_CAPABILITIES)).not.toThrow();
    expect(() => assertA4EditorWriterFormatLevel(2, SERVER_A4_EDITOR_CAPABILITIES)).toThrow();

    const legacyRead = readA4StoredDocument(legacy);
    const level2Read = readA4StoredDocument(level2);
    expect(legacyRead.formatLevel).toBe(1);
    expect(level2Read.formatLevel).toBe(2);
    expect(level2Read.canonical.blocks.some((block) => block.kind === 'hard-break')).toBe(true);
  });
});
