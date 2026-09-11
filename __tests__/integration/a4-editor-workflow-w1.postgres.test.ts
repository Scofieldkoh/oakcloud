import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const describePostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describePostgres('A4 editor WORKFLOW W1 PostgreSQL concurrency', () => {
  let prisma: Awaited<ReturnType<typeof import('@/lib/prisma')['getPrisma']>>;
  let createDocumentTemplate: typeof import('@/services/document-template.service')['createDocumentTemplate'];
  let updateDocumentTemplate: typeof import('@/services/document-template.service')['updateDocumentTemplate'];
  let getDocumentTemplateById: typeof import('@/services/document-template.service')['getDocumentTemplateById'];
  let createTemplatePartial: typeof import('@/services/template-partial.service')['createTemplatePartial'];
  let updateTemplatePartial: typeof import('@/services/template-partial.service')['updateTemplatePartial'];
  let updateGeneratedDocument: typeof import('@/services/document-generator.service')['updateGeneratedDocument'];
  let archiveDocument: typeof import('@/services/document-generator.service')['archiveDocument'];
  let bulkDeleteGeneratedDocuments: typeof import('@/services/document-generator.service')['bulkDeleteGeneratedDocuments'];
  let saveDraft: typeof import('@/services/document-generator.service')['saveDraft'];
  let getLatestDraft: typeof import('@/services/document-generator.service')['getLatestDraft'];
  let createDocumentTemplateSchema: typeof import('@/lib/validations/document-template')['createDocumentTemplateSchema'];
  let updateDocumentTemplateSchema: typeof import('@/lib/validations/document-template')['updateDocumentTemplateSchema'];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const prismaModule = await import('@/lib/prisma');
    prisma = prismaModule.getPrisma();
    ({
      createDocumentTemplate,
      updateDocumentTemplate,
      getDocumentTemplateById,
    } = await import('@/services/document-template.service'));
    ({ createTemplatePartial, updateTemplatePartial } = await import('@/services/template-partial.service'));
    ({
      updateGeneratedDocument,
      archiveDocument,
      bulkDeleteGeneratedDocuments,
      saveDraft,
      getLatestDraft,
    } = await import('@/services/document-generator.service'));
    ({
      createDocumentTemplateSchema,
      updateDocumentTemplateSchema,
    } = await import('@/lib/validations/document-template'));
  });

  afterEach(async () => {
    for (const tenantId of tenantIds.splice(0)) {
      await prisma.documentDraft.deleteMany({ where: { document: { tenantId } } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.generatedDocument.deleteMany({ where: { tenantId } });
      await prisma.templatePartial.deleteMany({ where: { tenantId } });
      await prisma.documentTemplate.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.workspace.delete({ where: { id: tenantId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedTenant(label: string) {
    const suffix = randomUUID();
    const workspace = await prisma.workspace.create({
      data: { name: `${label} ${suffix}`, slug: `w1-${label.toLowerCase()}-${suffix}` },
    });
    tenantIds.push(workspace.id);
    const user = await prisma.user.create({
      data: {
        tenantId: workspace.id,
        email: `w1-${label.toLowerCase()}-${suffix}@example.test`,
        passwordHash: 'synthetic-test-only',
        firstName: 'W1',
        lastName: label,
      },
    });
    return { tenantId: workspace.id, userId: user.id };
  }

  async function seedGeneratedDocument(actor: { tenantId: string; userId: string }, title: string) {
    return prisma.generatedDocument.create({
      data: {
        tenantId: actor.tenantId,
        title,
        content: '<p>base</p>',
        status: 'DRAFT',
        createdById: actor.userId,
      },
    });
  }

  it('lets exactly one of two clients commit the same template revision', async () => {
    const actor = await seedTenant('TemplateCAS');
    const template = await createDocumentTemplate(
      createDocumentTemplateSchema.parse({
        name: 'Synthetic CAS template',
        content: '<p>base</p>',
        placeholders: [],
      }),
      actor,
    );

    const attempts = await Promise.allSettled([
      updateDocumentTemplate({ id: template.id, expectedRevision: template.version, content: '<p>client-a</p>' }, actor),
      updateDocumentTemplate({ id: template.id, expectedRevision: template.version, content: '<p>client-b</p>' }, actor),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });

    const stored = await prisma.documentTemplate.findUniqueOrThrow({ where: { id: template.id } });
    expect(stored.version).toBe(template.version + 1);
    expect(['<p>client-a</p>', '<p>client-b</p>']).toContain(stored.content);
  });

  it('preserves F1 field metadata through API schema, persistence and GET service read-back', async () => {
    const actor = await seedTenant('Fields');
    const field = {
      id: 'synthetic-field-1',
      key: 'custom.note',
      label: 'Note',
      type: 'future-preserve-only-type',
      source: 'custom',
      category: 'custom',
      path: 'custom.note',
      defaultValue: 0,
      format: { future: true },
      options: [{ value: 'A', meta: { order: 1 } }],
      linkedTo: 'includeNote',
      sourcePartial: 'synthetic-partial',
      futureMetadata: { nested: ['keep', false, 0] },
    };
    const template = await createDocumentTemplate(
      createDocumentTemplateSchema.parse({
        name: 'Synthetic lossless fields',
        content: '<p>{{custom.note}}</p>',
        placeholders: [field],
      }),
      actor,
    );
    const persisted = template.placeholders as unknown as Array<Record<string, unknown>>;
    expect(persisted[0]).toEqual(field);
    expect(Object.prototype.hasOwnProperty.call(persisted[0], 'required')).toBe(false);

    const acknowledged = await updateDocumentTemplate(
      updateDocumentTemplateSchema.parse({
        id: template.id,
        expectedRevision: template.version,
        placeholders: persisted,
      }),
      actor,
    );
    expect(acknowledged.version).toBe(template.version + 1);
    expect((acknowledged.placeholders as unknown as Array<Record<string, unknown>>)[0]).toEqual(field);

    const reloaded = await getDocumentTemplateById(template.id, actor.tenantId);
    expect(reloaded?.version).toBe(acknowledged.version);
    expect((reloaded?.placeholders as unknown as Array<Record<string, unknown>>)[0]).toEqual(field);
  });

  it('rejects a stale partial revision without changing the accepted value', async () => {
    const actor = await seedTenant('PartialCAS');
    const partial = await createTemplatePartial({
      name: 'synthetic-partial',
      displayName: 'Synthetic partial',
      content: '<p>base</p>',
      placeholders: [],
    }, actor);

    const accepted = await updateTemplatePartial({
      id: partial.id,
      expectedRevision: partial.version,
      content: '<p>accepted</p>',
    }, actor);
    await expect(updateTemplatePartial({
      id: partial.id,
      expectedRevision: partial.version,
      content: '<p>stale</p>',
    }, actor)).rejects.toMatchObject({ statusCode: 409 });

    const stored = await prisma.templatePartial.findUniqueOrThrow({ where: { id: partial.id } });
    expect(stored.version).toBe(accepted.version);
    expect(stored.content).toBe('<p>accepted</p>');
  });

  it('increments GeneratedDocument revision atomically and rejects the losing stale client', async () => {
    const actor = await seedTenant('DocumentCAS');
    const document = await seedGeneratedDocument(actor, 'Synthetic document CAS');

    const attempts = await Promise.allSettled([
      updateGeneratedDocument({ id: document.id, expectedRevision: 0, content: '<p>client-a</p>' }, actor),
      updateGeneratedDocument({ id: document.id, expectedRevision: 0, content: '<p>client-b</p>' }, actor),
    ]);
    const fulfilled = attempts.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof updateGeneratedDocument>>> => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.revision).toBe(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });

    const stored = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.revision).toBe(1);
    expect(['<p>client-a</p>', '<p>client-b</p>']).toContain(stored.content);
  });

  it('keeps lifecycle CAS revision-scoped and rejects an older canonical revision', async () => {
    const actor = await seedTenant('Lifecycle');
    const document = await seedGeneratedDocument(actor, 'Synthetic lifecycle');
    const edited = await updateGeneratedDocument({
      id: document.id,
      expectedRevision: 0,
      content: '<p>edited</p>',
    }, actor);
    const archived = await archiveDocument(document.id, actor, 'synthetic test', edited.revision);
    expect(archived.revision).toBe(2);

    await expect(updateGeneratedDocument({
      id: document.id,
      expectedRevision: edited.revision,
      title: 'stale title',
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    const stored = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.revision).toBe(2);
    expect(stored.status).toBe('ARCHIVED');
    expect(stored.title).toBe('Synthetic lifecycle');
  });

  it('isolates per-item bulk stale failures and does not mutate the stale document', async () => {
    const actor = await seedTenant('BulkCAS');
    const stale = await seedGeneratedDocument(actor, 'Synthetic stale');
    const current = await seedGeneratedDocument(actor, 'Synthetic current');
    await updateGeneratedDocument({ id: stale.id, expectedRevision: 0, title: 'newer stale target' }, actor);

    const result = await bulkDeleteGeneratedDocuments(
      [stale.id, current.id],
      actor,
      'synthetic bulk test',
      { [stale.id]: 0, [current.id]: 0 },
    );
    expect(result.deleted).toBe(1);
    expect(result.failed).toEqual([
      expect.objectContaining({ id: stale.id, code: 'VERSION_CONFLICT' }),
    ]);

    const [staleAfter, currentAfter] = await Promise.all([
      prisma.generatedDocument.findUniqueOrThrow({ where: { id: stale.id } }),
      prisma.generatedDocument.findUniqueOrThrow({ where: { id: current.id } }),
    ]);
    expect(staleAfter.deletedAt).toBeNull();
    expect(staleAfter.revision).toBe(1);
    expect(currentAfter.deletedAt).not.toBeNull();
    expect(currentAfter.revision).toBe(1);
  });

  it('does not let another tenant or a stale draft base mutate the target', async () => {
    const actor = await seedTenant('TenantA');
    const other = await seedTenant('TenantB');
    const document = await seedGeneratedDocument(actor, 'Synthetic tenant scoped');

    await expect(updateGeneratedDocument({
      id: document.id,
      expectedRevision: 0,
      content: '<p>wrong tenant</p>',
    }, other)).rejects.toMatchObject({ statusCode: 404 });
    await saveDraft({
      documentId: document.id,
      baseRevision: 0,
      content: '<p>draft-at-zero</p>',
    }, actor);
    const updated = await updateGeneratedDocument({
      id: document.id,
      expectedRevision: 0,
      content: '<p>canonical-one</p>',
    }, actor);
    expect(updated.revision).toBe(1);

    await expect(saveDraft({
      documentId: document.id,
      baseRevision: 0,
      content: '<p>stale-draft</p>',
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    const draft = await getLatestDraft(document.id, actor.userId);
    expect(draft).toMatchObject({ content: '<p>draft-at-zero</p>', baseRevision: 0 });
    const stored = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.content).toBe('<p>canonical-one</p>');
    expect(stored.revision).toBe(1);
  });
});
