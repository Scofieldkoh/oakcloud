import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  documentTemplate: { findFirst: vi.fn() },
  generatedDocument: { findFirst: vi.fn(), update: vi.fn() },
  documentGenerationBatchItem: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const storageMock = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  storage: storageMock,
}));

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));

const serverDomMock = vi.hoisted(() => ({ ensureA4ServerDomGlobals: vi.fn() }));
vi.mock('@/lib/document-editor/a4-server-dom', () => serverDomMock);

const companyMock = vi.hoisted(() => ({ getCompanyById: vi.fn() }));
vi.mock('@/services/company.service', () => companyMock);

const templateMock = vi.hoisted(() => ({ downloadOakDocTemplate: vi.fn() }));
vi.mock('@/services/oakdoc-template.service', () => templateMock);

const revisionMock = vi.hoisted(() => ({ claimGeneratedDocumentRevision: vi.fn() }));
vi.mock('@/lib/document-editor/generated-document-revision', () => revisionMock);

const fieldMock = vi.hoisted(() => ({
  inspectOakDocFields: vi.fn(),
  pruneDeletedOakDocFields: vi.fn(),
  resolveOakDocFields: vi.fn(),
}));
vi.mock('@/lib/document-editor/oakdoc-fields', () => fieldMock);

const conditionMock = vi.hoisted(() => ({
  inspectOakDocConditions: vi.fn(),
  resolveOakDocConditions: vi.fn(),
}));
vi.mock('@/lib/document-editor/oakdoc-conditions', () => conditionMock);

const repeaterMock = vi.hoisted(() => ({
  inspectOakDocRepeaters: vi.fn(),
  resolveOakDocRepeaters: vi.fn(),
}));
vi.mock('@/lib/document-editor/oakdoc-repeaters', () => repeaterMock);

import {
  generateOakDocBytes,
  materializeOakDocGeneratedDocument,
} from '@/services/oakdoc-generation.service';

const tenantId = 'tenant-1';
const userId = 'user-1';
const templateId = 'template-1';
const documentId = 'document-1';
const templateSha = 'a'.repeat(64);
const generatedSha = expect.stringMatching(/^[a-f0-9]{64}$/);

const templateMetadata = {
  oakDoc: {
    schemaVersion: 1,
    storageKey: `${tenantId}/templates/oakdoc/assets/master.docx`,
    fileName: 'Master.docx',
    fileSize: 6,
    sha256: templateSha,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fieldTags: ['company.name'],
  },
};

describe('OakDoc generation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn) => fn(prismaMock));
    prismaMock.documentTemplate.findFirst.mockResolvedValue({
      id: templateId,
      name: 'Board Resolution',
      version: 7,
      contentJson: templateMetadata,
    });
    companyMock.getCompanyById.mockResolvedValue({
      id: 'company-1',
      name: 'Acme Pte. Ltd.',
      uen: '202600001A',
      addresses: [],
      officers: [],
      shareholders: [],
    });
    templateMock.downloadOakDocTemplate.mockResolvedValue({
      buffer: Buffer.from('master'),
      metadata: templateMetadata.oakDoc,
    });
    fieldMock.inspectOakDocFields.mockReturnValue({
      count: 1,
      tags: ['company.name'],
    });
    conditionMock.inspectOakDocConditions.mockReturnValue({
      count: 0,
      fieldTags: [],
    });
    repeaterMock.inspectOakDocRepeaters.mockReturnValue({
      count: 0,
      tags: [],
    });
    fieldMock.pruneDeletedOakDocFields.mockImplementation((bytes) => ({
      bytes: new Uint8Array(bytes),
      removed: 0,
    }));
    conditionMock.resolveOakDocConditions.mockImplementation(({ docxBytes }) => ({
      bytes: new Uint8Array(docxBytes),
      resolved: 0,
      kept: 0,
      removed: 0,
      unresolvedFields: [],
    }));
    repeaterMock.resolveOakDocRepeaters.mockImplementation(({ docxBytes }) => ({
      bytes: new Uint8Array(docxBytes),
      repeatersResolved: 0,
      itemsCreated: 0,
      fieldsResolved: 0,
    }));
    fieldMock.resolveOakDocFields.mockReturnValue({
      bytes: new Uint8Array(Buffer.from('generated')),
      updated: 1,
      unresolvedTags: [],
    });
    prismaMock.generatedDocument.findFirst.mockResolvedValue({
      id: documentId,
      tenantId,
      status: 'DRAFT',
      metadata: {},
    });
    prismaMock.documentGenerationBatchItem.findFirst.mockResolvedValue({ id: 'item-1' });
    revisionMock.claimGeneratedDocumentRevision.mockResolvedValue({ revision: 4 });
    prismaMock.generatedDocument.update.mockResolvedValue({
      id: documentId,
      title: 'Generated Resolution',
      status: 'DRAFT',
    });
    storageMock.upload.mockResolvedValue({ key: 'generated-key' });
    storageMock.delete.mockResolvedValue(undefined);
  });

  it('resolves a copied master without mutating the downloaded template bytes', async () => {
    const master = Buffer.from('master');
    templateMock.downloadOakDocTemplate.mockResolvedValue({
      buffer: master,
      metadata: templateMetadata.oakDoc,
    });

    const result = await generateOakDocBytes({
      templateId,
      companyId: 'company-1',
      generatedBy: 'Ava Tan',
    }, { tenantId });

    expect(serverDomMock.ensureA4ServerDomGlobals).toHaveBeenCalledOnce();
    expect(master.toString()).toBe('master');
    expect(result.bytes.toString()).toBe('generated');
    expect(result.template).toMatchObject({
      id: templateId,
      version: 7,
      sha256: templateSha,
    });
    expect(result.values['company.name']).toBe('Acme Pte. Ltd.');
  });

  it('stores generated DOCX separately and persists template/version metadata', async () => {
    await materializeOakDocGeneratedDocument({
      templateId,
      generatedDocumentId: documentId,
      expectedRevision: 3,
      expectedBatchItemId: 'item-1',
      companyId: 'company-1',
      title: 'Generated Resolution',
      generatedBy: 'Ava Tan',
    }, { tenantId, userId });

    expect(storageMock.upload).toHaveBeenCalledTimes(1);
    const [storageKey, uploadedBytes] = storageMock.upload.mock.calls[0];
    expect(storageKey).toMatch(
      new RegExp(`^${tenantId}/generated-documents/${documentId}/oakdoc/.+\\.docx$`),
    );
    expect(storageKey).not.toContain('/templates/oakdoc/');
    expect(Buffer.from(uploadedBytes).toString()).toBe('generated');

    expect(prismaMock.generatedDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: documentId },
        data: expect.objectContaining({
          templateVersion: 7,
          status: 'DRAFT',
          metadata: expect.objectContaining({
            documentEngine: 'OAKDOC',
            oakDocGenerated: expect.objectContaining({
              templateId,
              templateVersion: 7,
              templateSha256: templateSha,
              sha256: generatedSha,
              storageKey,
            }),
          }),
        }),
      }),
    );
    expect(revisionMock.claimGeneratedDocumentRevision).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        id: documentId,
        tenantId,
        expectedRevision: 3,
        allowedStatuses: ['DRAFT'],
      }),
    );
  });
});
