import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    documentGenerationBatch: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    documentGenerationBatchItem: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    generatedDocument: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    documentTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    templatePartial: {
      findMany: vi.fn(),
    },
    company: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    serviceAgreement: {
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}));

const serviceAgreementMock = vi.hoisted(() => ({
  upsertServiceAgreementDraft: vi.fn(),
  getServiceAgreementDraft: vi.fn(),
}));

vi.mock('@/services/service-agreement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/service-agreement')>()),
  ...serviceAgreementMock,
}));

const sessionMock = vi.hoisted(() => ({
  readActiveGenerationSession: vi.fn(),
}));

vi.mock('@/lib/document-generation-session', () => sessionMock);

vi.mock('@/services/tasks/integration.service', () => ({
  linkFirstGeneratedDocumentTaskOutcomeForBatch: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import {
  adoptLegacyGenerationSession,
  createDocumentGenerationBatch,
  discardDocumentGenerationBatch,
  listDocumentGenerationBatches,
  updateDocumentGenerationBatch,
} from '@/services/document-generation-batch';
import { createAuditLog } from '@/lib/audit';
import { upsertServiceAgreementDraft } from '@/services/service-agreement';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const actor = { tenantId, userId };

const templateA = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId,
  name: 'Engagement Letter',
  description: null,
  category: 'LETTER',
  compositionType: 'STANDARD',
  content: '<p>{{custom.reference}}</p>',
  contentJson: null,
  placeholders: [],
  isActive: true,
  version: 2,
  createdById: userId,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};
const templateB = {
  ...templateA,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Service Agreement',
  compositionType: 'SERVICE_AGREEMENT',
};
const templateC = {
  ...templateA,
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'KYC Checklist',
};

function childDocument(id: string, title: string) {
  return {
    id,
    tenantId,
    title,
    content: '',
    contentJson: null,
    status: 'DRAFT',
    useLetterhead: true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    serviceAgreement: null,
  };
}

function defaultConfig(templateName: string) {
  return {
    version: 1 as const,
    title: `Untitled - ${templateName}`,
    contactIds: [],
    selectedDirectorId: null,
    selectedShareholderId: null,
    selectedContactId: null,
    itemValues: {},
    masterOverrides: {},
    useLetterhead: true,
    serviceAgreement: null,
  };
}

function batchItem(
  id: string,
  template: typeof templateA,
  displayOrder: number,
  overrides: Record<string, unknown> = {},
) {
  const child = childDocument(`child-${id}`, `Untitled - ${template.name}`);
  return {
    id,
    tenantId,
    batchId: 'batch-1',
    templateId: template.id,
    generatedDocumentId: child.id,
    templateVersion: template.version,
    displayOrder,
    status: 'NOT_STARTED',
    configuration: defaultConfig(template.name),
    previewContent: null,
    editedContent: null,
    editedContentJson: null,
    previewFingerprint: null,
    reviewedFingerprint: null,
    validationDiagnostics: null,
    lastError: null,
    generationAttemptId: null,
    generationClaimedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    template,
    generatedDocument: child,
    ...overrides,
  };
}

function batchWith(items: Array<ReturnType<typeof batchItem>>, overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    tenantId,
    primaryCompanyId: null,
    createdById: userId,
    activeItemId: items[0]?.id ?? null,
    currentStage: 0,
    revision: 0,
    status: 'DRAFT',
    masterFieldValues: {},
    taskContext: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    primaryCompany: null,
    createdBy: { id: userId, firstName: 'Ava', lastName: 'Tan' },
    items,
    activeItem: items[0] ?? null,
    ...overrides,
  };
}

describe('document generation batch lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(
      (callback) => callback(prisma as never) as never,
    );
    vi.mocked(prisma.templatePartial.findMany).mockResolvedValue([]);
    vi.mocked(prisma.generatedDocument.update).mockResolvedValue({ id: 'child' } as never);
    vi.mocked(prisma.documentGenerationBatch.update).mockResolvedValue({ id: 'batch-1' } as never);
  });

  it('creates one hidden generated-document child per ordered item', async () => {
    vi.mocked(prisma.documentTemplate.findMany).mockResolvedValue([templateA, templateB, templateC] as never);
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({ id: 'child' } as never);
    vi.mocked(prisma.documentGenerationBatchItem.create).mockImplementation((() =>
      Promise.resolve({ id: `item-${Math.random()}` }) as never) as never);
    const items = [
      batchItem('item-a', templateA, 0),
      batchItem('item-b', templateB, 1),
      batchItem('item-c', templateC, 2),
    ];
    vi.mocked(prisma.documentGenerationBatch.create).mockResolvedValue({
      id: 'batch-1',
      tenantId,
    } as never);
    vi.mocked(prisma.documentGenerationBatch.findFirstOrThrow)
      .mockResolvedValue(batchWith(items) as never);
    vi.mocked(prisma.documentGenerationBatch.update).mockResolvedValue({ id: 'batch-1' } as never);

    const result = await createDocumentGenerationBatch(
      {
        items: [
          { templateId: templateA.id },
          { templateId: templateB.id },
          { templateId: templateC.id },
        ],
      },
      actor,
    );

    expect(prisma.generatedDocument.create).toHaveBeenCalledTimes(3);
    expect(result.items.map((item) => item.displayOrder)).toEqual([0, 1, 2]);
    expect(prisma.documentGenerationBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activeItemId: expect.any(String) }) }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'DocumentGenerationBatch',
        summary: expect.stringContaining('3 documents'),
      }),
    );
  });

  it('lists only active draft and partial batches in tenant scope', async () => {
    const items = [batchItem('item-a', templateA, 0)];
    vi.mocked(prisma.documentGenerationBatch.findMany).mockResolvedValue([
      batchWith(items, { status: 'PARTIAL', updatedAt: new Date() }),
    ] as never);

    const result = await listDocumentGenerationBatches(actor);

    expect(prisma.documentGenerationBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ['DRAFT', 'PARTIAL'] },
        },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'batch-1',
      itemCount: 1,
      status: 'PARTIAL',
      counts: { NOT_STARTED: 1 },
    });
  });

  it('rejects stale revisions without mutating children', async () => {
    vi.mocked(prisma.documentGenerationBatch.findFirst).mockResolvedValue(
      batchWith([batchItem('item-a', templateA, 0)]) as never,
    );
    vi.mocked(prisma.documentGenerationBatch.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.documentGenerationBatch.findFirst)
      .mockResolvedValueOnce(batchWith([batchItem('item-a', templateA, 0)]) as never)
      .mockResolvedValueOnce({ revision: 4 } as never);

    await expect(
      updateDocumentGenerationBatch(
        'batch-1',
        {
          expectedRevision: 3,
          items: [{ templateId: templateA.id }],
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409, details: { currentRevision: 4 } });
    expect(prisma.documentGenerationBatchItem.update).not.toHaveBeenCalled();
  });

  it('preserves incomplete Service Agreement workspace state', async () => {
    const incomplete = {
      ...defaultConfig(templateB.name),
      serviceAgreement: {
        authorizedContactId: null,
        entityIds: [],
        agreementDate: '2026-08-12',
        effectiveDate: null,
        termMonths: 12,
        items: [],
      },
    };
    const item = batchItem('item-b', templateB, 0, {
      configuration: incomplete,
    });
    const batch = batchWith([item], { primaryCompanyId: null });
    vi.mocked(prisma.documentGenerationBatch.findFirst).mockResolvedValue(batch as never);
    vi.mocked(prisma.documentGenerationBatch.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.documentTemplate.findMany).mockResolvedValue([templateB] as never);
    vi.mocked(prisma.documentGenerationBatchItem.findMany).mockImplementation(
      ((args: { select?: unknown }) =>
        args.select
          ? Promise.resolve([{ status: 'NOT_STARTED' }])
          : Promise.resolve([item])) as never,
    );
    vi.mocked(prisma.documentGenerationBatch.update).mockResolvedValue(batch as never);

    const result = await updateDocumentGenerationBatch(
      'batch-1',
      {
        expectedRevision: 0,
        primaryCompanyId: null,
        items: [{ templateId: templateB.id, configuration: incomplete }],
      },
      actor,
    );

    expect(result.items[0].configuration.serviceAgreement?.items).toEqual([]);
    expect(upsertServiceAgreementDraft).not.toHaveBeenCalled();
  });

  it('rejects a primary company outside the workspace on update', async () => {
    const item = batchItem('item-a', templateA, 0);
    const batch = batchWith([item], { primaryCompanyId: null });
    vi.mocked(prisma.documentGenerationBatch.findFirst).mockResolvedValue(batch as never);
    vi.mocked(prisma.documentGenerationBatch.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.documentTemplate.findMany).mockResolvedValue([templateA] as never);
    vi.mocked(prisma.documentGenerationBatchItem.findMany).mockResolvedValue([item] as never);
    vi.mocked(prisma.company.findFirst).mockResolvedValue(null);

    await expect(
      updateDocumentGenerationBatch(
        'batch-1',
        {
          expectedRevision: 0,
          primaryCompanyId: 'foreign-company',
          items: [{ templateId: templateA.id }],
        },
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'The selected company is not available',
    });
    expect(prisma.documentGenerationBatchItem.update).not.toHaveBeenCalled();
  });

  it('stores the task launch context on a created batch and its children', async () => {
    vi.mocked(prisma.documentTemplate.findMany).mockResolvedValue([templateA] as never);
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({ id: 'child' } as never);
    vi.mocked(prisma.documentGenerationBatchItem.create).mockResolvedValue({ id: 'item-a' } as never);
    vi.mocked(prisma.documentGenerationBatch.create).mockResolvedValue({ id: 'batch-1', tenantId } as never);
    const items = [batchItem('item-a', templateA, 0)];
    vi.mocked(prisma.documentGenerationBatch.findFirstOrThrow)
      .mockResolvedValue(batchWith(items) as never);

    await createDocumentGenerationBatch(
      { items: [{ templateId: templateA.id }] },
      actor,
      { taskId: 'task-1', taskStageId: 'stage-1', returnTo: '/tasks' },
    );

    expect(prisma.documentGenerationBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskContext: { taskId: 'task-1', taskStageId: 'stage-1', returnTo: '/tasks' },
        }),
      }),
    );
    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            taskIntegrationContext: {
              taskId: 'task-1',
              taskStageId: 'stage-1',
              returnTo: '/tasks',
            },
          }),
        }),
      }),
    );
  });

  it('adopts the existing child and agreement instead of creating another output', async () => {
    const draftId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const draft = {
      id: draftId,
      tenantId,
      title: 'Legacy draft',
      content: '<p>preview</p>',
      metadata: { generationSession: { version: 2 } },
      status: 'DRAFT',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessionMock.readActiveGenerationSession.mockReturnValue({
      version: 2,
      currentStep: 2,
      templateId: templateA.id,
      companyId: null,
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      title: 'Legacy draft',
      customData: { reference: 'REF-1' },
      useLetterhead: true,
      previewContent: '<p>preview</p>',
      editedContent: null,
      editedContentJson: null,
      serviceAgreementId: null,
    });
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue(draft as never);
    vi.mocked(prisma.documentGenerationBatchItem.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue(templateA as never);
    vi.mocked(prisma.serviceAgreement.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.documentGenerationBatch.create).mockResolvedValue({ id: 'batch-1' } as never);
    vi.mocked(prisma.documentGenerationBatchItem.create).mockResolvedValue({
      id: 'item-a',
    } as never);
    const adopted = batchWith([batchItem('item-a', templateA, 0, {
      generatedDocumentId: draftId,
    })]);
    vi.mocked(prisma.documentGenerationBatch.findFirstOrThrow)
      .mockResolvedValue(adopted as never);
    vi.mocked(prisma.documentTemplate.findMany).mockResolvedValue([templateA] as never);

    const result = await adoptLegacyGenerationSession(
      draftId,
      { items: [{ templateId: templateA.id }] },
      actor,
    );

    expect(result.items[0].generatedDocumentId).toBe(draftId);
    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
    expect(prisma.generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.not.objectContaining({
            generationSession: expect.anything(),
          }),
        }),
      }),
    );
  });

  it('is idempotent when a legacy draft already owns a batch item', async () => {
    const draftId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    sessionMock.readActiveGenerationSession.mockReturnValue({
      version: 2,
      currentStep: 0,
      templateId: templateA.id,
      companyId: null,
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      title: 'Legacy draft',
      customData: {},
      useLetterhead: true,
      previewContent: null,
      editedContent: null,
      editedContentJson: null,
      serviceAgreementId: null,
    });
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: draftId,
      tenantId,
      status: 'DRAFT',
      deletedAt: null,
      metadata: {},
    } as never);
    vi.mocked(prisma.documentGenerationBatchItem.findUnique).mockResolvedValue({
      batchId: 'batch-1',
    } as never);
    vi.mocked(prisma.documentGenerationBatch.findFirst).mockResolvedValue(
      batchWith([batchItem('item-a', templateA, 0, { generatedDocumentId: draftId })]) as never,
    );
    vi.mocked(prisma.documentTemplate.findMany).mockResolvedValue([templateA] as never);

    const result = await adoptLegacyGenerationSession(
      draftId,
      { items: [{ templateId: templateA.id }] },
      actor,
    );

    expect(result.id).toBe('batch-1');
    expect(prisma.documentGenerationBatch.create).not.toHaveBeenCalled();
  });

  it('discards incomplete children but preserves generated outputs', async () => {
    const generated = batchItem('item-gen', templateA, 0, {
      status: 'GENERATED',
      generatedDocument: {
        ...childDocument('child-gen', 'Generated'),
        serviceAgreement: { id: 'agreement-gen', status: 'EFFECTIVE' },
      },
    });
    const draft = batchItem('item-draft', templateB, 1, {
      generatedDocument: {
        ...childDocument('child-draft', 'Draft'),
        serviceAgreement: { id: 'agreement-draft', status: 'DRAFT' },
      },
    });
    const batch = batchWith([generated, draft]);
    vi.mocked(prisma.documentGenerationBatch.findFirst).mockResolvedValue(batch as never);
    vi.mocked(prisma.documentGenerationBatch.update).mockResolvedValue({ id: 'batch-1' } as never);

    const result = await discardDocumentGenerationBatch('batch-1', {}, actor);

    expect(result).toEqual({ discardedItemCount: 1, preservedItemCount: 1 });
    expect(prisma.serviceAgreement.delete).toHaveBeenCalledWith({
      where: { id: 'agreement-draft' },
    });
    expect(prisma.serviceAgreement.delete).not.toHaveBeenCalledWith({
      where: { id: 'agreement-gen' },
    });
    expect(prisma.generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'child-item-draft' },
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });
});
