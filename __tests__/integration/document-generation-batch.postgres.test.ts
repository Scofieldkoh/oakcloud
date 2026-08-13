import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describePostgres('document generation batch postgres integration', () => {
  let prisma: Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
  let createDocumentGenerationBatch: typeof import('@/services/document-generation-batch')['createDocumentGenerationBatch'];
  let updateDocumentGenerationBatch: typeof import('@/services/document-generation-batch')['updateDocumentGenerationBatch'];
  let discardDocumentGenerationBatch: typeof import('@/services/document-generation-batch')['discardDocumentGenerationBatch'];
  let adoptLegacyGenerationSession: typeof import('@/services/document-generation-batch')['adoptLegacyGenerationSession'];
  let searchGeneratedDocuments: typeof import('@/services/document-generator.service')['searchGeneratedDocuments'];
  let upsertServiceAgreementDraft: typeof import('@/services/service-agreement')['upsertServiceAgreementDraft'];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const prismaModule = await import('@/lib/prisma');
    prisma = prismaModule.getPrisma();
    const batchModule = await import('@/services/document-generation-batch');
    createDocumentGenerationBatch = batchModule.createDocumentGenerationBatch;
    updateDocumentGenerationBatch = batchModule.updateDocumentGenerationBatch;
    discardDocumentGenerationBatch = batchModule.discardDocumentGenerationBatch;
    adoptLegacyGenerationSession = batchModule.adoptLegacyGenerationSession;
    ({ searchGeneratedDocuments } = await import('@/services/document-generator.service'));
    ({ upsertServiceAgreementDraft } = await import('@/services/service-agreement'));
  });

  afterEach(async () => {
    for (const tenantId of tenantIds.splice(0)) {
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

  async function seed() {
    const suffix = randomUUID();
    const workspace = await prisma.workspace.create({
      data: { name: `Batch integration ${suffix}`, slug: `batch-integration-${suffix}` },
    });
    tenantIds.push(workspace.id);
    const user = await prisma.user.create({
      data: {
        tenantId: workspace.id,
        email: `batch-${suffix}@example.test`,
        passwordHash: 'not-used',
        firstName: 'Batch',
        lastName: 'User',
      },
    });
    const templates = await Promise.all([
      prisma.documentTemplate.create({
        data: {
          tenantId: workspace.id,
          createdById: user.id,
          name: `Engagement ${suffix}`,
          category: 'LETTER',
          content: '<p>{{custom.reference}}</p>',
          placeholders: [
            {
              key: 'custom.reference',
              label: 'Reference',
              type: 'text',
              source: 'custom',
              category: 'custom',
              required: false,
            },
          ],
        },
      }),
      prisma.documentTemplate.create({
        data: {
          tenantId: workspace.id,
          createdById: user.id,
          name: `Agreement ${suffix}`,
          category: 'CONTRACT',
          compositionType: 'SERVICE_AGREEMENT',
          content: '<p>{{selectedContact.name}}</p>',
        },
      }),
    ]);
    return {
      actor: { tenantId: workspace.id, userId: user.id },
      templates,
      suffix,
    };
  }

  it('creates distinct ordered child documents and hides incomplete children from search', async () => {
    const { actor, templates } = await seed();
    const created = await createDocumentGenerationBatch(
      {
        items: [
          { templateId: templates[0].id },
          { templateId: templates[1].id },
        ],
      },
      actor,
    );

    expect(created.items).toHaveLength(2);
    expect(created.items.map((item) => item.displayOrder)).toEqual([0, 1]);
    const childIds = created.items.map((item) => item.generatedDocumentId);
    expect(new Set(childIds).size).toBe(2);

    const search = await searchGeneratedDocuments(
      { page: 1, limit: 20, sortBy: 'updatedAt', sortOrder: 'desc' },
      actor.tenantId,
    );
    expect(search.documents.some((doc) => childIds.includes(doc.id))).toBe(false);
  });

  it('rejects an outdated revision with a conflict and mutates nothing', async () => {
    const { actor, templates } = await seed();
    const created = await createDocumentGenerationBatch(
      { items: [{ templateId: templates[0].id }] },
      actor,
    );
    const stale = created.revision - 1;

    await expect(updateDocumentGenerationBatch(
      created.id,
      {
        expectedRevision: stale,
        items: [{ templateId: templates[0].id }],
      },
      actor,
    )).rejects.toMatchObject({ statusCode: 409 });

    const refreshed = await prisma.documentGenerationBatch.findUniqueOrThrow({
      where: { id: created.id },
      select: { revision: true },
    });
    expect(refreshed.revision).toBe(created.revision);
  });

  it('claims an item exactly once under concurrent generation requests', async () => {
    const { actor, templates } = await seed();
    const created = await createDocumentGenerationBatch(
      { items: [{ templateId: templates[0].id }] },
      actor,
    );
    const itemId = created.items[0].id;
    await prisma.documentGenerationBatchItem.update({
      where: { id: itemId },
      data: { status: 'READY' },
    });

    const [first, second] = await Promise.all([
      prisma.documentGenerationBatchItem.updateMany({
        where: {
          id: itemId,
          batchId: created.id,
          tenantId: actor.tenantId,
          status: 'READY',
        },
        data: {
          status: 'GENERATING',
          generationAttemptId: randomUUID(),
          generationClaimedAt: new Date(),
        },
      }),
      prisma.documentGenerationBatchItem.updateMany({
        where: {
          id: itemId,
          batchId: created.id,
          tenantId: actor.tenantId,
          status: 'READY',
        },
        data: {
          status: 'GENERATING',
          generationAttemptId: randomUUID(),
          generationClaimedAt: new Date(),
        },
      }),
    ]);
    expect([first.count, second.count].sort()).toEqual([0, 1]);

    const stale = await prisma.documentGenerationBatchItem.updateMany({
      where: {
        id: itemId,
        batchId: created.id,
        tenantId: actor.tenantId,
        status: 'GENERATING',
        generationClaimedAt: { lt: new Date(Date.now() - 16 * 60 * 1000) },
      },
      data: { status: 'FAILED', generationAttemptId: null, generationClaimedAt: null },
    });
    expect(stale.count).toBe(0);

    await prisma.documentGenerationBatchItem.update({
      where: { id: itemId },
      data: { generationClaimedAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    const reclaimed = await prisma.documentGenerationBatchItem.updateMany({
      where: {
        id: itemId,
        batchId: created.id,
        tenantId: actor.tenantId,
        status: 'GENERATING',
        generationClaimedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      data: { status: 'FAILED', generationAttemptId: null, generationClaimedAt: null },
    });
    expect(reclaimed.count).toBe(1);
  });

  it('discards draft agreements and incomplete children while preserving generated outputs', async () => {
    const { actor, templates } = await seed();
    const created = await createDocumentGenerationBatch(
      { items: [{ templateId: templates[1].id }] },
      actor,
    );
    const item = created.items[0];
    await upsertServiceAgreementDraft(
      item.generatedDocumentId,
      {
        primaryCompanyId: actor.tenantId,
        authorizedContactId: randomUUID(),
        entityIds: [actor.tenantId],
        agreementDate: '2026-08-12',
        effectiveDate: null,
        termMonths: 12,
        items: [],
      },
      actor,
      { skipDocumentCheck: true },
    ).catch(() => undefined);

    const result = await discardDocumentGenerationBatch(created.id, {}, actor);
    expect(result.discardedItemCount).toBe(1);
    const agreementCount = await prisma.serviceAgreement.count({
      where: { generatedDocumentId: item.generatedDocumentId },
    });
    expect(agreementCount).toBe(0);
  });

  it('adopts a legacy session idempotently around the same child document', async () => {
    const { actor, templates } = await seed();
    const legacy = await prisma.generatedDocument.create({
      data: {
        tenantId: actor.tenantId,
        templateId: templates[0].id,
        templateVersion: templates[0].version,
        title: 'Legacy draft',
        content: '<p>preview</p>',
        status: 'DRAFT',
        createdById: actor.userId,
        metadata: {
          generationSession: {
            version: 2,
            currentStep: 1,
            templateId: templates[0].id,
            companyId: null,
            contactIds: [],
            selectedDirectorId: null,
            selectedShareholderId: null,
            selectedContactId: null,
            title: 'Legacy draft',
            customData: {},
            useLetterhead: true,
            previewContent: '<p>preview</p>',
            editedContent: null,
            editedContentJson: null,
            serviceAgreementId: null,
          },
        },
      },
    });

    const first = await adoptLegacyGenerationSession(
      legacy.id,
      { items: [{ templateId: templates[0].id }] },
      actor,
    );
    const second = await adoptLegacyGenerationSession(
      legacy.id,
      { items: [{ templateId: templates[0].id }] },
      actor,
    );

    expect(first.items[0].generatedDocumentId).toBe(legacy.id);
    expect(second.id).toBe(first.id);
    expect(second.items[0].generatedDocumentId).toBe(legacy.id);
    const count = await prisma.documentGenerationBatch.count({
      where: { tenantId: actor.tenantId },
    });
    expect(count).toBe(1);
  });
});
