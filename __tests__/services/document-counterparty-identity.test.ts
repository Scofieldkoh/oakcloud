import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrCreateVendorContact: vi.fn(), getOrCreateCustomerContact: vi.fn(),
  resolveVendor: vi.fn(), resolveCustomer: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    documentRevision: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    processingDocument: { findUnique: vi.fn(), update: vi.fn() },
    documentExtraction: { findUnique: vi.fn() },
    document: { update: vi.fn() },
    company: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/storage', () => ({
  storage: { exists: vi.fn(), move: vi.fn() },
  generateApprovedDocumentFilename: vi.fn(() => 'approved.pdf'),
  getFileExtension: vi.fn(() => 'pdf'),
  buildApprovedStorageKey: vi.fn(() => 'approved.pdf'),
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
vi.mock('@/services/vendor-resolution.service', () => ({
  getOrCreateVendorContact: mocks.getOrCreateVendorContact,
  learnVendorAlias: vi.fn(), resolveVendor: mocks.resolveVendor,
}));
vi.mock('@/services/customer-resolution.service', () => ({
  getOrCreateCustomerContact: mocks.getOrCreateCustomerContact,
  learnCustomerAlias: vi.fn(), resolveCustomer: mocks.resolveCustomer,
}));

import {
  buildDocumentVaultContactCandidate,
  normalizeCounterpartyIdentityDraft,
  approveRevision,
} from '@/services/document-revision.service';
import { mapCounterpartyIdentityDraft } from '@/services/document-extraction.service';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/client';

describe('Document Vault counterparty identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.documentRevision.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.documentRevision.update).mockResolvedValue({} as never);
    vi.mocked(prisma.processingDocument.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });
  it('maps structured extraction values, confidence, and evidence', () => {
    const draft = mapCounterpartyIdentityDraft(
      {
        counterpartyIdentificationType: { value: 'UEN', confidence: 0.97 },
        counterpartyIdentificationNumber: { value: '202012345A', confidence: 0.98 },
        counterpartyAddress: { value: '1 Raffles Place', confidence: 0.92 },
        counterpartyEmail: { value: 'accounts@example.sg', confidence: 0.95 },
        counterpartyPhone: { value: '+65 6123 4567', confidence: 0.91 },
      },
      [{ pageNumber: 1, storageKey: null, imageFingerprint: 'page-fingerprint' }]
    );

    expect(draft).toEqual({
      identificationType: 'UEN',
      identificationNumber: '202012345A',
      fullAddress: '1 Raffles Place',
      email: 'accounts@example.sg',
      phone: '+65 6123 4567',
      confidence: {
        identificationNumber: 0.98,
        fullAddress: 0.92,
        email: 0.95,
        phone: 0.91,
      },
    });
  });

  it('validates reviewer corrections and preserves explicit corrected values', () => {
    expect(normalizeCounterpartyIdentityDraft({
      identificationType: 'UEN',
      identificationNumber: ' 202099999Z ',
      fullAddress: ' 10 Anson Road ',
      email: ' billing@example.sg ',
      phone: ' +65 6999 0000 ',
      confidence: { identificationNumber: 1, fullAddress: 1, email: 1, phone: 1 },
    })).toEqual({
      identificationType: 'UEN',
      identificationNumber: '202099999Z',
      fullAddress: '10 Anson Road',
      email: 'billing@example.sg',
      phone: '+65 6999 0000',
      confidence: { identificationNumber: 1, fullAddress: 1, email: 1, phone: 1 },
    });
  });

  it('only makes identifiers deterministic at confidence 0.90 or above', () => {
    const low = buildDocumentVaultContactCandidate('Acme Pte Ltd', {
      identificationType: 'UEN', identificationNumber: '202012345A', fullAddress: '1 Raffles Place',
      confidence: { identificationNumber: 0.89, fullAddress: 0.95 },
    }, 'revision-low', 'company-1');
    const threshold = buildDocumentVaultContactCandidate('Acme Pte Ltd', {
      identificationType: 'UEN', identificationNumber: '202012345A',
      confidence: { identificationNumber: 0.9 },
    }, 'revision-threshold', 'company-1');

    expect(low).toEqual(expect.objectContaining({ corporateUen: '202012345A' }));
    expect(low.confidence?.corporateUen).toBe(0.89);
    expect(threshold.confidence?.corporateUen).toBe(0.9);
  });

  it('preserves non-UEN identifiers and all available contact details', () => {
    const candidate = buildDocumentVaultContactCandidate('Example Trading', {
      identificationType: 'OTHER', identificationNumber: 'REG-123',
      email: 'ops@example.sg', phone: '+65 6000 0000', confidence: { identificationNumber: 0.96 },
    }, 'revision-1', 'company-1');

    expect(candidate).toEqual(expect.objectContaining({
      source: 'DOCUMENT_VAULT', sourceRecordId: 'revision-1', corporateName: 'Example Trading',
      identificationType: 'OTHER', identificationNumber: 'REG-123',
      contactDetails: expect.arrayContaining([
        expect.objectContaining({ detailType: 'EMAIL', value: 'ops@example.sg', companyId: 'company-1' }),
        expect.objectContaining({ detailType: 'PHONE', value: '+65 6000 0000', companyId: 'company-1' }),
      ]),
    }));
  });

  it.each([
    ['ACCOUNTS_PAYABLE', mocks.getOrCreateVendorContact, 'vendor'],
    ['ACCOUNTS_RECEIVABLE', mocks.getOrCreateCustomerContact, 'customer'],
  ] as const)('passes corrected identity into %s contact resolution only on approval', async (category, resolver, side) => {
    const revision = {
      id: `revision-${side}`, processingDocumentId: 'processing-1', status: 'DRAFT',
      documentCategory: category, documentSubCategory: null, vendorName: '王氏企业', vendorId: null,
      customerName: category === 'ACCOUNTS_RECEIVABLE' ? '王氏企业' : null, customerId: null,
      counterpartyIdentity: {
        identificationType: 'UEN', identificationNumber: '202012345A', fullAddress: '1 Raffles Place',
        email: 'accounts@example.sg', confidence: { identificationNumber: 0.98, fullAddress: 0.92, email: 0.95 },
      },
      extractionId: null, validationIssues: { issues: [] }, currency: 'SGD', totalAmount: new Decimal(100),
      homeCurrency: 'SGD', homeExchangeRate: new Decimal(1), homeExchangeRateSource: null,
      exchangeRateDate: null, homeEquivalent: new Decimal(100), documentDate: null, documentNumber: null,
      items: [],
    };
    vi.mocked(prisma.documentRevision.findUnique).mockResolvedValue(revision as never);
    vi.mocked(prisma.processingDocument.findUnique).mockResolvedValue({
      document: { id: 'document-1', tenantId: 'tenant-1', companyId: 'company-1', fileName: 'invoice.pdf', storageKey: null },
    } as never);
    resolver.mockResolvedValue(side === 'vendor'
      ? { vendorId: 'contact-1', vendorName: '王氏企业', confidence: 1, strategy: 'CONTACT' }
      : { customerId: 'contact-1', customerName: '王氏企业', confidence: 1, strategy: 'CONTACT' });

    expect(resolver).not.toHaveBeenCalled();
    await approveRevision(revision.id, { userId: 'user-1' });

    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', companyId: 'company-1', createdById: 'user-1', sourceRecordId: revision.id,
      counterpartyIdentity: expect.objectContaining({ identificationNumber: '202012345A', fullAddress: '1 Raffles Place' }),
    }));
  });
});
