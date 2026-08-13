import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    generatedDocument: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    serviceAgreement: {
      delete: vi.fn(),
    },
    documentTemplate: {
      findFirst: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
  computeChanges: vi.fn(),
}));

vi.mock('@/lib/placeholder-resolver', () => ({
  resolvePlaceholders: vi.fn(),
  prepareCompanyContext: vi.fn(),
  extractPartialReferences: vi.fn(() => []),
}));

vi.mock('@/services/template-partial.service', () => ({
  getPartialsUsedInTemplate: vi.fn(),
}));

vi.mock('@/services/company.service', () => ({
  getCompanyById: vi.fn(),
}));

vi.mock('@/services/document-party.service', () => ({
  getDocumentPartyOptions: vi.fn(),
  resolveDocumentPartySelections: vi.fn(),
}));

const serviceAgreementMock = vi.hoisted(() => ({
  getServiceAgreementDraft: vi.fn(),
  getServiceAgreementDraftById: vi.fn(),
}));

vi.mock('@/services/service-agreement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/service-agreement')>()),
  ...serviceAgreementMock,
}));

vi.mock('@/lib/encryption', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock('@/services/tasks/integration.service', () => ({
  safelyReconcileGeneratedDocumentTaskOutcomes: vi.fn(),
}));

vi.mock('@/services/tasks/esigning-preparation.service', () => ({
  assertGeneratedDocumentCanBeUnfinalized: vi.fn(),
  queueTaskEsigningPreparationsForGeneratedDocument: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import {
  createDocumentFromTemplate,
  finalizeDocument,
  renderTemplateForGeneration,
  searchGeneratedDocuments,
  unfinalizeDocument,
} from '@/services/document-generator.service';
import { extractPartialReferences, resolvePlaceholders } from '@/lib/placeholder-resolver';
import { getPartialsUsedInTemplate } from '@/services/template-partial.service';
import { createAuditLog } from '@/lib/audit';
import { prepareCompanyContext } from '@/lib/placeholder-resolver';
import { getCompanyById } from '@/services/company.service';
import {
  getDocumentPartyOptions,
  resolveDocumentPartySelections,
} from '@/services/document-party.service';
import {
  assertGeneratedDocumentCanBeUnfinalized,
  queueTaskEsigningPreparationsForGeneratedDocument,
} from '@/services/tasks/esigning-preparation.service';

describe('Document generator service', () => {
  const activeSessionMetadata = (templateId: string) => ({
    generationSession: {
      version: 2,
      currentStep: 0,
      templateId,
      companyId: null,
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      title: '',
      customData: {},
      useLetterhead: true,
      previewContent: null,
      editedContent: null,
      editedContentJson: null,
      serviceAgreementId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.generatedDocument.findMany).mockResolvedValue([]);
    vi.mocked(prisma.generatedDocument.count).mockResolvedValue(0);
    vi.mocked(prisma.generatedDocument.update).mockResolvedValue({
      id: 'doc-1',
      title: 'Updated document',
      companyId: null,
    } as never);
    vi.mocked(getPartialsUsedInTemplate).mockResolvedValue([]);
    vi.mocked(resolvePlaceholders).mockReturnValue({
      resolved: '<p>Resolved template content</p>',
      missing: [],
      missingPartials: [],
    });
    vi.mocked(prisma.contact.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    serviceAgreementMock.getServiceAgreementDraft.mockResolvedValue(null);
    serviceAgreementMock.getServiceAgreementDraftById.mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(prisma));
    vi.mocked(getDocumentPartyOptions).mockResolvedValue({
      directors: [],
      shareholders: [],
      contacts: [],
    });
    vi.mocked(resolveDocumentPartySelections).mockResolvedValue({});
  });

  it('requires a workspace id for generated document search', async () => {
    await expect(
      searchGeneratedDocuments(
        {
          page: 1,
          limit: 20,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
        ''
      )
    ).rejects.toThrow('Tenant ID is required for generated documents search');

    expect(prisma.generatedDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.generatedDocument.count).not.toHaveBeenCalled();
  });

  it('applies the workspace filter to list and count queries', async () => {
    await searchGeneratedDocuments(
      {
        query: 'minutes',
        page: 2,
        limit: 10,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      'workspace-1'
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'workspace-1',
          deletedAt: null,
          OR: expect.any(Array),
        }),
        skip: 10,
        take: 10,
      })
    );
    expect(prisma.generatedDocument.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'workspace-1',
        deletedAt: null,
      }),
    });
  });

  it('excludes incomplete batch children from document search', async () => {
    await searchGeneratedDocuments(
      {
        page: 1,
        limit: 20,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      'workspace-1',
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ batchItem: null }, { batchItem: { status: 'GENERATED' } }] },
          ]),
        }),
      }),
    );
    expect(prisma.generatedDocument.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { OR: [{ batchItem: null }, { batchItem: { status: 'GENERATED' } }] },
        ]),
      }),
    });
  });

  it('applies title, created-by and updated date filters to generated document search', async () => {
    await searchGeneratedDocuments(
      {
        page: 1,
        limit: 20,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
        title: 'minutes',
        createdBy: 'sam',
        updatedFrom: '2026-08-01',
        updatedTo: '2026-08-07',
      },
      'workspace-1'
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'workspace-1',
          deletedAt: null,
          title: { contains: 'minutes', mode: 'insensitive' },
          createdBy: {
            OR: [
              { firstName: { contains: 'sam', mode: 'insensitive' } },
              { lastName: { contains: 'sam', mode: 'insensitive' } },
            ],
          },
          updatedAt: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        }),
      })
    );
  });

  it('sorts generated documents by related company and creator fields', async () => {
    await searchGeneratedDocuments(
      {
        page: 1,
        limit: 20,
        sortBy: 'companyName',
        sortOrder: 'asc',
      },
      'workspace-1'
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { company: { name: 'asc' } },
      })
    );

    await searchGeneratedDocuments(
      {
        page: 1,
        limit: 20,
        sortBy: 'createdByName',
        sortOrder: 'desc',
      },
      'workspace-1'
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: { createdBy: { firstName: 'desc' } },
      })
    );

    await searchGeneratedDocuments(
      {
        page: 1,
        limit: 20,
        sortBy: 'templateName',
        sortOrder: 'asc',
      },
      'workspace-1'
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: { template: { name: 'asc' } },
      })
    );
  });

  it('creates template-generated documents as editable drafts', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>{{company.name}}</p>',
      contentJson: null,
      version: 3,
      isActive: true,
    } as never);
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({
      id: 'doc-1',
      status: 'DRAFT',
    } as never);

    const document = await createDocumentFromTemplate(
      {
        templateId: 'template-1',
        title: 'Generated resolution',
        customData: {},
        useLetterhead: true,
      },
      { tenantId: 'workspace-1', userId: 'user-1' }
    );

    expect(document.status).toBe('DRAFT');
    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT' }),
      })
    );
  });

  it('converts an active generation session without creating a duplicate', async () => {
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const templateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: templateId,
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Resolution</p>',
      contentJson: null,
      version: 3,
      isActive: true,
    } as never);
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: draftId,
      tenantId: 'workspace-1',
      status: 'DRAFT',
      deletedAt: null,
      metadata: {
        generationSession: {
          version: 1,
          currentStep: 4,
          templateId,
          companyId: null,
          contactIds: [],
          selectedDirectorId: null,
          selectedShareholderId: null,
          selectedContactId: null,
          title: 'Final title',
          customData: {},
          useLetterhead: true,
          previewContent: '<p>Resolved template content</p>',
          editedContent: null,
          editedContentJson: null,
        },
      },
    } as never);
    vi.mocked(prisma.generatedDocument.update).mockResolvedValue({
      id: draftId,
      title: 'Final title',
      status: 'DRAFT',
    } as never);

    const result = await createDocumentFromTemplate({
      draftId,
      templateId,
      title: 'Final title',
      useLetterhead: true,
    }, { tenantId: 'workspace-1', userId: 'user-1' });

    expect(result.id).toBe(draftId);
    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
    expect(prisma.generatedDocument.update).toHaveBeenCalledWith({
      where: { id: draftId },
      data: expect.objectContaining({
        templateId,
        title: 'Final title',
        content: '<p>Resolved template content</p>',
        status: 'DRAFT',
        metadata: expect.not.objectContaining({
          generationSession: expect.anything(),
        }),
      }),
    });
  });

  it('requires confirmation before a standard generation discards an attached agreement', async () => {
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const templateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: templateId,
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Resolution</p>',
      contentJson: null,
      version: 1,
      isActive: true,
      compositionType: 'STANDARD',
    } as never);
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: draftId,
      tenantId: 'workspace-1',
      status: 'DRAFT',
      deletedAt: null,
      metadata: activeSessionMetadata(templateId),
    } as never);
    serviceAgreementMock.getServiceAgreementDraft.mockResolvedValue({
      id: 'agreement-1',
      status: 'DRAFT',
    } as never);

    await expect(createDocumentFromTemplate({
      draftId,
      templateId,
      title: 'Resolution',
    }, { tenantId: 'workspace-1', userId: 'user-1' })).rejects.toThrow(
      'Discard the attached Service Agreement before switching templates',
    );

    expect(prisma.generatedDocument.update).not.toHaveBeenCalled();
    expect(prisma.serviceAgreement.delete).not.toHaveBeenCalled();
  });

  it('atomically discards an attached draft agreement during confirmed standard generation', async () => {
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const templateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: templateId,
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Resolution</p>',
      contentJson: null,
      version: 1,
      isActive: true,
      compositionType: 'STANDARD',
    } as never);
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: draftId,
      tenantId: 'workspace-1',
      status: 'DRAFT',
      deletedAt: null,
      metadata: activeSessionMetadata(templateId),
    } as never);
    serviceAgreementMock.getServiceAgreementDraft.mockResolvedValue({
      id: 'agreement-1',
      status: 'DRAFT',
    } as never);

    await createDocumentFromTemplate({
      draftId,
      templateId,
      title: 'Resolution',
      discardServiceAgreement: true,
    }, { tenantId: 'workspace-1', userId: 'user-1' });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.serviceAgreement.delete).toHaveBeenCalledWith({
      where: { id: 'agreement-1' },
    });
    expect(prisma.generatedDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: draftId },
    }));
  });

  it('never discards an attached non-draft agreement during generation', async () => {
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const templateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: templateId,
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Resolution</p>',
      contentJson: null,
      version: 1,
      isActive: true,
      compositionType: 'STANDARD',
    } as never);
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: draftId,
      tenantId: 'workspace-1',
      status: 'DRAFT',
      deletedAt: null,
      metadata: activeSessionMetadata(templateId),
    } as never);
    serviceAgreementMock.getServiceAgreementDraft.mockResolvedValue({
      id: 'agreement-1',
      status: 'EFFECTIVE',
    } as never);

    await expect(createDocumentFromTemplate({
      draftId,
      templateId,
      title: 'Resolution',
      discardServiceAgreement: true,
    }, { tenantId: 'workspace-1', userId: 'user-1' })).rejects.toThrow(
      'Only draft Service Agreements can be discarded',
    );

    expect(prisma.serviceAgreement.delete).not.toHaveBeenCalled();
  });

  it('leaves a saved generation session untouched when rendering fails', async () => {
    const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const templateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: templateId,
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Resolution</p>',
      contentJson: null,
      version: 3,
      isActive: true,
    } as never);
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: draftId,
      tenantId: 'workspace-1',
      status: 'DRAFT',
      deletedAt: null,
      metadata: {
        generationSession: {
          version: 1,
          currentStep: 4,
          templateId,
          companyId: null,
          contactIds: [],
          selectedDirectorId: null,
          selectedShareholderId: null,
          selectedContactId: null,
          title: 'Final title',
          customData: {},
          useLetterhead: true,
          previewContent: null,
          editedContent: null,
          editedContentJson: null,
        },
      },
    } as never);
    vi.mocked(resolvePlaceholders).mockImplementationOnce(() => {
      throw new Error('Render failed');
    });

    await expect(createDocumentFromTemplate({
      draftId,
      templateId,
      title: 'Final title',
    }, { tenantId: 'workspace-1', userId: 'user-1' })).rejects.toThrow('Render failed');

    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
    expect(prisma.generatedDocument.update).not.toHaveBeenCalled();
  });

  it('persists user-edited preview content when supplied', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Original {{custom.value}}</p>',
      contentJson: { type: 'doc', content: [] },
      version: 1,
      isActive: true,
    } as never);
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({
      id: 'doc-1',
    } as never);

    await createDocumentFromTemplate(
      {
        templateId: 'template-1',
        title: 'Edited document',
        customData: { value: 'value' },
        useLetterhead: false,
        editedContent: '<p>User edited content</p>',
        editedContentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      { tenantId: 'workspace-1', userId: 'user-1' }
    );

    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '<p>User edited content</p>',
          contentJson: { type: 'doc', content: [{ type: 'paragraph' }] },
        }),
      })
    );
  });

  it('copies template layout metadata when no edited JSON override is supplied', async () => {
    const contentJson = {
      version: 1,
      customKey: true,
      layout: {
        version: 1,
        fontFamily: 'Georgia, serif',
        fontSize: '14pt',
        lineHeight: 1.8,
        paragraphSpacing: '8px',
        marginsMm: { top: 10, right: 15, bottom: 20, left: 25 },
      },
    };
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Resolution',
      content: '<p>Original</p>',
      contentJson,
      version: 1,
      isActive: true,
    } as never);
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({ id: 'doc-1' } as never);

    await createDocumentFromTemplate(
      { templateId: 'template-1', title: 'Generated document', customData: {} },
      { tenantId: 'workspace-1', userId: 'user-1' },
    );

    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contentJson }),
      }),
    );
    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentJson: expect.objectContaining({
            layout: expect.objectContaining({
              fontFamily: 'Georgia, serif',
              fontSize: '14pt',
            }),
          }),
        }),
      }),
    );
  });

  it('does not finalize documents with unresolved placeholders or partials', async () => {
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: 'doc-1',
      tenantId: 'workspace-1',
      title: 'Incomplete document',
      status: 'DRAFT',
      deletedAt: null,
      metadata: {
        missingPlaceholders: ['company.name'],
        missingPartials: ['signing-block'],
      },
    } as never);

    await expect(
      finalizeDocument('doc-1', { tenantId: 'workspace-1', userId: 'user-1' })
    ).rejects.toThrow('Cannot finalize document with unresolved placeholders or partials');

    expect(prisma.generatedDocument.update).not.toHaveBeenCalled();
  });

  it('queues background E-signing preparation after finalization', async () => {
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: 'doc-1',
      tenantId: 'workspace-1',
      title: 'Final contract',
      status: 'DRAFT',
      deletedAt: null,
      metadata: null,
    } as never);
    vi.mocked(prisma.generatedDocument.update).mockResolvedValue({
      id: 'doc-1',
      title: 'Final contract',
      companyId: null,
      status: 'FINALIZED',
    } as never);

    await finalizeDocument('doc-1', {
      tenantId: 'workspace-1',
      userId: 'user-1',
    });

    expect(queueTaskEsigningPreparationsForGeneratedDocument)
      .toHaveBeenCalledWith('workspace-1', 'doc-1', 'user-1');
  });

  it('blocks unfinalization for a non-draft prepared envelope and queues detach otherwise', async () => {
    vi.mocked(prisma.generatedDocument.findFirst).mockResolvedValue({
      id: 'doc-1',
      tenantId: 'workspace-1',
      title: 'Final contract',
      status: 'FINALIZED',
      deletedAt: null,
      metadata: null,
    } as never);
    vi.mocked(prisma.generatedDocument.update).mockResolvedValue({
      id: 'doc-1',
      title: 'Final contract',
      companyId: null,
      status: 'DRAFT',
    } as never);
    vi.mocked(assertGeneratedDocumentCanBeUnfinalized)
      .mockRejectedValueOnce(new Error(
        'Void the active E-signing envelope before unfinalizing this document',
      ));

    await expect(unfinalizeDocument(
      'doc-1',
      { tenantId: 'workspace-1', userId: 'user-1' },
      'Needs changes',
    )).rejects.toThrow('Void the active E-signing envelope');
    expect(prisma.generatedDocument.update).not.toHaveBeenCalled();

    vi.mocked(assertGeneratedDocumentCanBeUnfinalized).mockResolvedValue(undefined);
    await unfinalizeDocument(
      'doc-1',
      { tenantId: 'workspace-1', userId: 'user-1' },
      'Needs changes',
    );
    expect(queueTaskEsigningPreparationsForGeneratedDocument)
      .toHaveBeenCalledWith('workspace-1', 'doc-1', 'user-1');
  });

  it('renders templates through one shared path with contacts, sections, and unresolved data', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Resolution',
      category: 'RESOLUTION',
      content: '<h1>{{contact.fullName}}</h1><p>{{> signing-block}}</p>',
      contentJson: null,
      version: 1,
      isActive: true,
    } as never);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      {
        id: 'contact-1',
        firstName: 'Jane',
        lastName: 'Tan',
        fullName: 'Jane Tan',
        contactType: 'CLIENT',
        fullAddress: '1 Example Road',
        nationality: 'Singaporean',
        identificationNumber: 'S1234567A',
        contactDetails: [{ detailType: 'EMAIL', value: 'jane@example.com' }],
      },
    ] as never);
    vi.mocked(getPartialsUsedInTemplate).mockResolvedValue([
      { name: 'signing-block', content: '<p>{{missing.value}}</p>' },
    ] as never);
    vi.mocked(extractPartialReferences).mockReturnValue(['signing-block']);
    vi.mocked(resolvePlaceholders).mockReturnValue({
      resolved: '<h1>Jane Tan</h1><p><span class="placeholder-missing">[missing.value]</span></p>',
      missing: ['missing.value'],
      missingPartials: [],
    });

    const result = await renderTemplateForGeneration({
      templateId: 'template-1',
      tenantId: 'workspace-1',
      contactIds: ['contact-1'],
      customData: {},
      mode: 'preview',
    });

    expect(resolvePlaceholders).toHaveBeenCalledWith(
      '<h1>{{contact.fullName}}</h1><p>{{> signing-block}}</p>',
      expect.objectContaining({
        contact: expect.objectContaining({ fullName: 'Jane Tan' }),
        contacts: [expect.objectContaining({ fullName: 'Jane Tan' })],
      }),
      expect.objectContaining({
        missingPlaceholder: 'highlight',
        partialsMap: new Map([['signing-block', '<p>{{missing.value}}</p>']]),
      })
    );
    expect(result.content).toContain('id="section-0"');
    expect(result.sections).toEqual([
      expect.objectContaining({ id: 'section-0', title: 'Jane Tan', level: 1 }),
    ]);
    expect(result.missingPlaceholders).toEqual(['missing.value']);
    expect(result.contextSummary).toEqual({
      hasCompany: false,
      hasContacts: true,
      hasCustomData: false,
    });
    expect(result.blockingErrors).toContain('Unresolved placeholders: missing.value');
  });

  it('renders unsaved template content through the shared path', async () => {
    vi.mocked(extractPartialReferences).mockReturnValue([]);
    vi.mocked(resolvePlaceholders).mockReturnValue({
      resolved: '<h1>Preview Draft</h1>',
      missing: [],
      missingPartials: [],
    });

    const result = await renderTemplateForGeneration({
      tenantId: 'workspace-1',
      templateContent: '<h1>{{custom.title}}</h1>',
      templateName: 'Editor draft',
      customData: { title: 'Preview Draft' },
      mode: 'test',
    });

    expect(prisma.documentTemplate.findFirst).not.toHaveBeenCalled();
    expect(resolvePlaceholders).toHaveBeenCalledWith(
      '<h1>{{custom.title}}</h1>',
      expect.objectContaining({
        custom: expect.objectContaining({ title: 'Preview Draft' }),
      }),
      expect.objectContaining({ missingPlaceholder: 'highlight' })
    );
    expect(result.template).toEqual({
      id: 'ad-hoc',
      name: 'Editor draft',
      category: 'OTHER',
      version: 1,
    });
    expect(result.content).toContain('Preview Draft');
  });

  it.each([
    ['selectedDirector.name', 'selectedDirectorId', 'Select a director for this template.'],
    ['selectedShareholder.name', 'selectedShareholderId', 'Select a shareholder for this template.'],
    ['selectedContact.name', 'selectedContactId', 'Select a company contact for this template.'],
  ])('rejects preview when %s is referenced without %s', async (placeholder, _idField, message) => {
    await expect(renderTemplateForGeneration({
      tenantId: 'workspace-1',
      companyId: 'company-1',
      templateContent: `<p>{{${placeholder}}}</p>`,
      contextOverride: {
        company: { id: 'company-1', name: 'Example Pte. Ltd.', uen: '202600001A' },
      },
      mode: 'preview',
    })).rejects.toThrow(message);
  });

  it('rejects preview when a nested partial introduces an omitted singular selection', async () => {
    vi.mocked(extractPartialReferences).mockReturnValue(['party-block']);
    vi.mocked(getPartialsUsedInTemplate).mockResolvedValue([
      { name: 'party-block', content: '<p>{{selectedDirector.name}}</p>' },
    ] as never);

    await expect(renderTemplateForGeneration({
      tenantId: 'workspace-1',
      templateContent: '<div>{{> party-block}}</div>',
      mode: 'preview',
    })).rejects.toThrow('Select a director for this template.');
  });

  it.each([
    ['selectedDirector.name', 'Select a director for this template.'],
    ['selectedShareholder.name', 'Select a shareholder for this template.'],
    ['selectedContact.name', 'Select a company contact for this template.'],
  ])('does not persist final generation when %s lacks its required selection', async (placeholder, message) => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Party letter',
      category: 'OTHER',
      content: `<p>{{${placeholder}}}</p>`,
      contentJson: null,
      version: 1,
      isActive: true,
    } as never);
    vi.mocked(getCompanyById).mockResolvedValue({ id: 'company-1', name: 'Example' } as never);
    vi.mocked(prepareCompanyContext).mockReturnValue({
      company: { id: 'company-1', name: 'Example', uen: '202600001A' },
      custom: {},
      system: { currentDate: new Date('2026-07-17') },
    });
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({
      id: 'unexpected-document',
      title: 'Party letter',
    } as never);

    await expect(createDocumentFromTemplate(
      { templateId: 'template-1', companyId: 'company-1', title: 'Party letter' },
      { tenantId: 'workspace-1', userId: 'user-1' },
    )).rejects.toThrow(message);
    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
  });

  it('keeps server-validated selected parties independent from legacy override contacts', async () => {
    const selectedContact = {
      id: 'contact-1',
      contactId: 'contact-1',
      name: 'Selected Contact',
      detail: 'Secretary',
      contactType: 'INDIVIDUAL',
      email: 'selected@example.com',
      phone: '+65 6000 0000',
      address: { letter: '10 Main Street', full: '10 Main Street' },
    };
    const selections = {
      selectedDirector: { ...selectedContact, id: 'officer-1', name: 'Director One' },
      selectedShareholder: { ...selectedContact, id: 'shareholder-1', name: 'Shareholder One' },
      selectedContact,
    };
    vi.mocked(resolveDocumentPartySelections).mockResolvedValue(selections);

    const result = await renderTemplateForGeneration({
      tenantId: 'workspace-1',
      companyId: 'company-1',
      templateContent: '<p>{{selectedContact.name}}</p>',
      contextOverride: {
        company: { id: 'company-1', name: 'Example Pte. Ltd.', uen: '202600001A' },
        contacts: [{ id: 'legacy-1', fullName: 'Legacy Contact', contactType: 'INDIVIDUAL' }],
      },
      selectedDirectorId: 'officer-1',
      selectedShareholderId: 'shareholder-1',
      selectedContactId: 'contact-1',
    });

    expect(resolveDocumentPartySelections).toHaveBeenCalledWith({
      companyId: 'company-1',
      tenantId: 'workspace-1',
      selectedDirectorId: 'officer-1',
      selectedShareholderId: 'shareholder-1',
      selectedContactId: 'contact-1',
    });
    expect(result.context).toEqual(expect.objectContaining(selections));
    expect(result.context.contact).toEqual(expect.objectContaining({
      id: 'legacy-1',
      fullName: 'Legacy Contact',
    }));
    expect(result.context.contacts).toEqual([
      expect.objectContaining({ id: 'legacy-1', fullName: 'Legacy Contact' }),
    ]);
    expect(result.context.custom?.contacts).toEqual(result.context.contacts);
  });

  it('keeps selectedContactId independent when legacy contactIds are also supplied', async () => {
    vi.mocked(resolveDocumentPartySelections).mockResolvedValue({
      selectedContact: {
        id: 'contact-1',
        contactId: 'contact-1',
        name: 'Selected Contact',
        detail: 'Secretary',
        contactType: 'INDIVIDUAL',
        email: 'selected@example.com',
        phone: '+65 6000 0000',
        address: { letter: '10 Main Street', full: '10 Main Street' },
      },
    });
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      {
        id: 'contact-1',
        firstName: 'Selected',
        lastName: 'Contact',
        fullName: 'Selected Contact',
        contactType: 'INDIVIDUAL',
        fullAddress: '10 Main Street',
        nationality: null,
        identificationNumber: null,
        contactDetails: [],
      },
      {
        id: 'contact-2',
        firstName: 'Legacy',
        lastName: 'Contact',
        fullName: 'Legacy Contact',
        contactType: 'INDIVIDUAL',
        fullAddress: '20 Side Street',
        nationality: null,
        identificationNumber: null,
        contactDetails: [],
      },
    ] as never);

    const result = await renderTemplateForGeneration({
      tenantId: 'workspace-1',
      companyId: 'company-1',
      templateContent: '<p>{{contact.fullName}}</p>',
      contextOverride: {
        company: { id: 'company-1', name: 'Example Pte. Ltd.', uen: '202600001A' },
      },
      contactIds: ['contact-1', 'contact-2'],
      selectedContactId: 'contact-1',
    });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ['contact-1', 'contact-2'] },
        tenantId: 'workspace-1',
        deletedAt: null,
      },
    }));
    expect(result.context.contacts?.map((contact) => contact.id)).toEqual([
      'contact-1',
      'contact-2',
    ]);
    expect(result.context.selectedContact?.id).toBe('contact-1');
    expect(result.context.contact).toBe(result.context.contacts?.[0]);
    expect(result.context.custom?.contacts).toBe(result.context.contacts);
  });

  it('renders Service Agreement representative placeholders from the saved snapshot', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Service Agreement',
      category: 'CONTRACT',
      content: [
        '<p>{{selectedContact.name}} {{selectedContact.detail}} ',
        '{{selectedContact.email}} {{selectedContact.phone}}</p>',
        '{{@agreement.serviceSections}}',
        '{{@agreement.feeTable}}',
        '{{@agreement.entityAppendix}}',
      ].join(''),
      version: 1,
      isActive: true,
      compositionType: 'SERVICE_AGREEMENT',
      placeholders: [],
    } as never);
    serviceAgreementMock.getServiceAgreementDraftById.mockResolvedValue({
      id: 'agreement-1',
      generatedDocumentId: 'document-1',
      primaryCompanyId: 'company-1',
      authorizedContactId: 'deleted-contact',
      authorizedRepresentativeSnapshot: {
        id: 'deleted-contact',
        name: 'Pinned Name',
        role: 'Director',
        email: 'pinned@example.com',
        phone: '+65 6123 4567',
      },
      agreementDate: '2026-07-30',
      effectiveDate: '2026-08-01',
      termMonths: 12,
      status: 'DRAFT',
      entities: [{
        id: 'entity-1',
        companyId: 'company-1',
        nameSnapshot: 'Alpha Pte. Ltd.',
        uenSnapshot: '11111111A',
        displayOrder: 0,
      }],
      items: [],
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    });

    const result = await renderTemplateForGeneration({
      tenantId: 'workspace-1',
      userId: 'user-1',
      companyId: 'company-1',
      templateId: 'template-1',
      serviceAgreementId: 'agreement-1',
      generatedDocumentId: 'document-1',
      // The wizard retains this historical ID, even after the contact has
      // been removed. The saved representative snapshot must remain usable.
      selectedContactId: 'deleted-contact',
      contextOverride: {
        company: { id: 'company-1', name: 'Alpha Pte. Ltd.', uen: '11111111A' },
      },
    });

    expect(resolveDocumentPartySelections).not.toHaveBeenCalled();
    expect(result.context.selectedContact).toEqual(expect.objectContaining({
      id: 'deleted-contact',
      name: 'Pinned Name',
      detail: 'Director',
      email: 'pinned@example.com',
      phone: '+65 6123 4567',
    }));
  });

  it('renders Service Agreement representative email/phone as blank when the snapshot omits them', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Service Agreement',
      category: 'CONTRACT',
      content: [
        '<p>{{selectedContact.name}} {{selectedContact.detail}} ',
        '{{selectedContact.email}} {{selectedContact.phone}}</p>',
        '{{@agreement.serviceSections}}',
        '{{@agreement.feeTable}}',
        '{{@agreement.entityAppendix}}',
      ].join(''),
      version: 1,
      isActive: true,
      compositionType: 'SERVICE_AGREEMENT',
      placeholders: [],
    } as never);
    serviceAgreementMock.getServiceAgreementDraftById.mockResolvedValue({
      id: 'agreement-1',
      generatedDocumentId: 'document-1',
      primaryCompanyId: 'company-1',
      authorizedContactId: 'contact-1',
      authorizedRepresentativeSnapshot: {
        id: 'contact-1',
        name: 'Pinned Name',
        role: 'Director',
        email: null,
        phone: null,
      },
      agreementDate: '2026-07-30',
      effectiveDate: '2026-08-01',
      termMonths: 12,
      status: 'DRAFT',
      entities: [{
        id: 'entity-1',
        companyId: 'company-1',
        nameSnapshot: 'Alpha Pte. Ltd.',
        uenSnapshot: '11111111A',
        displayOrder: 0,
      }],
      items: [],
      createdAt: '2026-07-30T00:00:00.000Z',
      updatedAt: '2026-07-30T00:00:00.000Z',
    });

    const result = await renderTemplateForGeneration({
      tenantId: 'workspace-1',
      userId: 'user-1',
      companyId: 'company-1',
      templateId: 'template-1',
      serviceAgreementId: 'agreement-1',
      generatedDocumentId: 'document-1',
      selectedContactId: 'contact-1',
      contextOverride: {
        company: { id: 'company-1', name: 'Alpha Pte. Ltd.', uen: '11111111A' },
      },
    });

    expect(result.context.selectedContact).toEqual(expect.objectContaining({
      id: 'contact-1',
      name: 'Pinned Name',
      detail: 'Director',
      email: '',
      phone: '',
    }));
  });

  it('refuses to persist a generated document with blocking diagnostics', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Broken template',
      category: 'OTHER',
      content: '<p>{{missing.value}}</p>',
      contentJson: null,
      version: 1,
      isActive: true,
      compositionType: 'STANDARD',
      placeholders: [],
    } as never);
    vi.mocked(resolvePlaceholders).mockReturnValue({
      resolved: '<p>{{missing.value}}</p>',
      missing: ['missing.value'],
      missingPartials: [],
    });

    await expect(createDocumentFromTemplate(
      { templateId: 'template-1', title: 'Blocked document' },
      { tenantId: 'workspace-1', userId: 'user-1' },
    )).rejects.toThrow('Unresolved placeholders: missing.value');

    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
  });

  it('uses the authenticated creator name and persists selected party metadata', async () => {
    vi.mocked(prisma.documentTemplate.findFirst).mockResolvedValue({
      id: 'template-1',
      tenantId: 'workspace-1',
      name: 'Resolution',
      category: 'RESOLUTION',
      content: '<p>{{system.preparerName}}</p>',
      contentJson: null,
      version: 1,
      isActive: true,
    } as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      firstName: 'Alice',
      lastName: 'Tan',
    } as never);
    vi.mocked(getCompanyById).mockResolvedValue({ id: 'company-1', name: 'Example' } as never);
    vi.mocked(prepareCompanyContext).mockReturnValue({
      company: { id: 'company-1', name: 'Example', uen: '202600001A' },
      custom: {},
      system: { currentDate: new Date('2026-07-16') },
    });
    vi.mocked(resolveDocumentPartySelections).mockResolvedValue({});
    vi.mocked(prisma.generatedDocument.create).mockResolvedValue({
      id: 'doc-1',
      title: 'Generated resolution',
    } as never);

    await createDocumentFromTemplate(
      {
        templateId: 'template-1',
        companyId: 'company-1',
        title: 'Generated resolution',
        selectedDirectorId: 'officer-1',
        selectedShareholderId: 'shareholder-1',
        selectedContactId: 'contact-1',
      },
      { tenantId: 'workspace-1', userId: 'user-1' },
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-1', tenantId: 'workspace-1' },
      select: { firstName: true, lastName: true },
    });
    expect(resolvePlaceholders).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        system: expect.objectContaining({
          preparerName: 'Alice Tan',
          generatedBy: 'Alice Tan',
        }),
      }),
      expect.any(Object),
    );
    const selectedParties = {
      directorId: 'officer-1',
      shareholderId: 'shareholder-1',
      contactId: 'contact-1',
    };
    expect(prisma.generatedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ selectedParties }),
        }),
      }),
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectedParties }),
      }),
    );
  });
});
