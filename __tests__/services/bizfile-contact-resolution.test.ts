import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  companyFindFirst: vi.fn(),
  resolveOrCreateContact: vi.fn(),
  previewContactIdentity: vi.fn(),
  createCompanyContactRelation: vi.fn(),
  generateBizFileDiff: vi.fn(),
  createAuditLog: vi.fn(),
}));

const tx = {
  company: { upsert: vi.fn(), update: vi.fn() },
  document: { update: vi.fn() },
  companyOfficer: { create: vi.fn(), update: vi.fn() },
  companyShareholder: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  processingDocument: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  documentRevision: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: mocks.companyFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/services/contact-identity.service', () => ({
  resolveOrCreateContact: mocks.resolveOrCreateContact,
  previewContactIdentity: mocks.previewContactIdentity,
}));
vi.mock('@/services/contact.service', () => ({
  createCompanyContactRelation: mocks.createCompanyContactRelation,
}));
vi.mock('@/services/bizfile/diff', () => ({ generateBizFileDiff: mocks.generateBizFileDiff }));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock('@/services/document-processing.service', () => ({ prepareDocumentPages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ storage: {} }));

const officer = {
  name: '王小明', role: 'DIRECTOR', identificationType: 'NRIC',
  identificationNumber: 'S1234567A', nationality: 'Singaporean', address: '1 Main Street',
  contactResolution: { action: 'REUSE' as const, contactId: 'contact-existing' },
};
const shareholder = {
  name: 'Acme Holdings Pte. Ltd.', type: 'CORPORATE' as const,
  identificationType: 'UEN', identificationNumber: '202400001A', address: '2 Main Street',
  shareClass: 'ORDINARY', numberOfShares: 100,
  contactResolution: { action: 'CREATE_SEPARATE' as const, reason: 'Different legal entity in BizFile' },
};
const extractedData = {
  entityDetails: { uen: '202600001A', name: 'Example Pte. Ltd.', entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
  officers: [officer], shareholders: [shareholder],
};

describe('BizFile contact identity resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.companyFindFirst.mockResolvedValue(null);
    mocks.previewContactIdentity.mockResolvedValue(null);
    tx.company.upsert.mockResolvedValue({ id: 'company-1' });
    tx.processingDocument.create.mockResolvedValue({ id: 'processing-1' });
    tx.documentRevision.create.mockResolvedValue({ id: 'revision-1' });
    tx.processingDocument.findUnique.mockResolvedValue({ id: 'processing-existing' });
    tx.companyShareholder.findMany.mockResolvedValue([]);
    mocks.resolveOrCreateContact
      .mockResolvedValueOnce({ contact: { id: 'contact-existing' } })
      .mockResolvedValueOnce({ contact: { id: 'contact-new-corporate' } });
  });

  it('captures all available identity fields and decisions in the full new-company transaction', async () => {
    const { processBizFileExtraction } = await import('@/services/bizfile/processor');
    await processBizFileExtraction('doc-1', extractedData, 'user-1', 'tenant-1');

    expect(mocks.resolveOrCreateContact).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        source: 'BIZFILE', sourceRecordId: 'officers.0', contactType: 'INDIVIDUAL',
        firstName: '王小明', identificationType: 'NRIC', identificationNumber: 'S1234567A',
        nationality: 'Singaporean', fullAddress: '1 Main Street',
      }),
      { action: 'REUSE', contactId: 'contact-existing' },
      expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1', tx }),
    );
    expect(mocks.resolveOrCreateContact).toHaveBeenNthCalledWith(2,
      expect.objectContaining({
        source: 'BIZFILE', sourceRecordId: 'shareholders.0', contactType: 'CORPORATE',
        corporateName: 'Acme Holdings Pte. Ltd.', corporateUen: '202400001A', fullAddress: '2 Main Street',
      }),
      shareholder.contactResolution,
      expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1', tx }),
    );
  });

  it('uses the same resolver and transaction for added records in an existing company', async () => {
    mocks.generateBizFileDiff.mockResolvedValue({
      hasDifferences: true, differences: [],
      officerDiffs: [{ type: 'added', sourceRecordId: 'officers.0', extractedData: officer }],
      shareholderDiffs: [{ type: 'added', sourceRecordId: 'shareholders.0', extractedData: shareholder }],
    });
    const { processBizFileExtractionSelective } = await import('@/services/bizfile/processor');
    await processBizFileExtractionSelective('doc-1', extractedData, 'user-1', 'tenant-1', 'company-1');

    expect(mocks.resolveOrCreateContact).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ source: 'BIZFILE', sourceRecordId: 'officers.0', identificationNumber: 'S1234567A' }),
      officer.contactResolution,
      expect.objectContaining({ tenantId: 'tenant-1', tx }),
    );
    expect(mocks.resolveOrCreateContact).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ source: 'BIZFILE', sourceRecordId: 'shareholders.0', corporateUen: '202400001A' }),
      shareholder.contactResolution,
      expect.objectContaining({ tenantId: 'tenant-1', tx }),
    );
  });

  it('uses diff-provided source paths for duplicate existing-company rows', async () => {
    const duplicate = { ...officer, contactResolution: { action: 'REUSE' as const, contactId: 'contact-second' } };
    mocks.generateBizFileDiff.mockResolvedValue({
      hasDifferences: true, differences: [], shareholderDiffs: [],
      officerDiffs: [
        { type: 'added', sourceRecordId: 'officers.0', extractedData: officer },
        { type: 'added', sourceRecordId: 'officers.1', extractedData: duplicate },
      ],
    });
    mocks.resolveOrCreateContact
      .mockResolvedValueOnce({ contact: { id: 'contact-existing' } })
      .mockResolvedValueOnce({ contact: { id: 'contact-second' } });
    const { processBizFileExtractionSelective } = await import('@/services/bizfile/processor');
    await processBizFileExtractionSelective('doc-1', {
      ...extractedData, officers: [officer, duplicate], shareholders: [],
    }, 'user-1', 'tenant-1', 'company-1');

    expect(mocks.resolveOrCreateContact.mock.calls.map(([candidate]) => candidate.sourceRecordId))
      .toEqual(['officers.0', 'officers.1']);
    expect(tx.companyOfficer.create).toHaveBeenCalledTimes(2);
  });

  it('requires a per-record decision when a current review match exists', async () => {
    mocks.previewContactIdentity.mockResolvedValue({
      contactId: 'contact-existing', score: 1, automatic: true,
      blockedByIdentifierConflict: false, reasons: ['EXACT_CANONICAL_NAME'], conflicts: [],
    });
    const undecided = {
      ...extractedData,
      officers: [{ ...officer, contactResolution: undefined }],
      shareholders: [],
    };
    const { processBizFileExtraction } = await import('@/services/bizfile/processor');

    await expect(processBizFileExtraction('doc-1', undecided, 'user-1', 'tenant-1'))
      .rejects.toThrow('Review the contact match for officers.0 before continuing');
    expect(mocks.resolveOrCreateContact).not.toHaveBeenCalled();
    expect(tx.companyOfficer.create).not.toHaveBeenCalled();
  });

  it('reuses a contact created earlier in the same BizFile transaction without requiring an impossible review', async () => {
    const samePersonShareholder = {
      name: officer.name,
      type: 'INDIVIDUAL' as const,
      identificationType: officer.identificationType,
      identificationNumber: officer.identificationNumber,
      nationality: officer.nationality,
      address: officer.address,
      shareClass: 'ORDINARY',
      numberOfShares: 100,
    };
    mocks.previewContactIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        contactId: 'contact-created-in-import', score: 1, automatic: true,
        blockedByIdentifierConflict: false, reasons: ['IDENTIFIER'], conflicts: [],
      });
    mocks.resolveOrCreateContact
      .mockReset()
      .mockResolvedValueOnce({ contact: { id: 'contact-created-in-import' }, outcome: 'CREATED' })
      .mockResolvedValueOnce({ contact: { id: 'contact-created-in-import' }, outcome: 'REUSED_IDENTIFIER' });
    const undecidedDuplicate = {
      ...extractedData,
      officers: [{ ...officer, contactResolution: undefined }],
      shareholders: [samePersonShareholder],
    };
    const { processBizFileExtraction } = await import('@/services/bizfile/processor');

    await expect(processBizFileExtraction('doc-1', undecidedDuplicate, 'user-1', 'tenant-1'))
      .resolves.toEqual(expect.objectContaining({ companyId: 'company-1' }));
    expect(mocks.resolveOrCreateContact).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sourceRecordId: 'shareholders.0' }),
      { action: 'AUTO' },
      expect.objectContaining({ tenantId: 'tenant-1', tx }),
    );
    expect(tx.companyShareholder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contactId: 'contact-created-in-import' }),
    }));
  });
});
