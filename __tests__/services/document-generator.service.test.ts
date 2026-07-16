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
    documentTemplate: {
      findFirst: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
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

vi.mock('@/lib/encryption', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import {
  createDocumentFromTemplate,
  finalizeDocument,
  renderTemplateForGeneration,
  searchGeneratedDocuments,
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

describe('Document generator service', () => {
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

  it('merges server-validated selected parties into the rendered context while preserving legacy contacts', async () => {
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
      id: 'contact-1',
      fullName: 'Selected Contact',
    }));
    expect(result.context.contacts).toEqual([
      expect.objectContaining({ id: 'contact-1', fullName: 'Selected Contact' }),
      expect.objectContaining({ id: 'legacy-1', fullName: 'Legacy Contact' }),
    ]);
    expect(result.context.custom?.contacts).toEqual(result.context.contacts);
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
