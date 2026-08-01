import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  generatedDocument: { findFirst: vi.fn() },
  company: { findMany: vi.fn() },
  companyContact: { findFirst: vi.fn() },
  serviceVariant: { findFirst: vi.fn() },
  templatePartial: { findMany: vi.fn() },
  serviceAgreementEntity: { create: vi.fn(), deleteMany: vi.fn() },
  serviceAgreementFeeLine: { create: vi.fn(), deleteMany: vi.fn() },
  serviceAgreementItemEntity: { create: vi.fn(), deleteMany: vi.fn() },
  serviceAgreementItem: {
    create: vi.fn(),
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  serviceAgreement: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
const companyAccessMock = vi.hoisted(() => ({ checkUserCompanyAccess: vi.fn() }));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);
vi.mock('@/services/user-company.service', () => companyAccessMock);

import {
  refreshServiceAgreementItemWording,
  getServiceAgreementDraftById,
  snapshotServiceVariant,
  upsertServiceAgreementDraft,
} from '@/services/service-agreement';

const tenantId = 'tenant-1';
const actor = { tenantId, userId: 'user-1' };

const currentSnapshot = {
  variantId: 'variant-1',
  variantVersion: 2,
  familyName: 'Corporate Services',
  variantName: 'Corporate Secretarial',
  serviceCadence: 'ANNUALLY' as const,
  customCadenceLabel: null,
  partialId: 'partial-1',
  partialVersion: 2,
  partialContent: '<p>Expanded wording</p>',
  placeholders: [{ key: 'service.fields.software', required: true }],
  dependencies: [
    {
      id: 'nested-1',
      name: 'nested-partial',
      version: 2,
      updatedAt: '2026-07-30T00:00:00.000Z',
    },
  ],
};

describe('service agreement draft persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.serviceAgreement.findFirst.mockResolvedValue(null);
    companyAccessMock.checkUserCompanyAccess.mockResolvedValue(true);
  });

  it('pins expanded nested partials while retaining service placeholders', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue({
      id: 'variant-1',
      version: 2,
      name: 'Corporate Secretarial',
      serviceCadence: 'ANNUALLY',
      customCadenceLabel: null,
      family: { name: 'Corporate Services' },
      sowPartial: {
        id: 'partial-1',
        name: 'corporate-secretarial',
        version: 2,
        content: '<h2>{{> nested-partial}}</h2>{{service.fields.software}}',
        placeholders: [{ key: 'service.fields.software', required: true }],
      },
    });
    prismaMock.templatePartial.findMany.mockResolvedValue([
      {
        id: 'nested-1',
        name: 'nested-partial',
        version: 2,
        content: 'Nested wording',
        updatedAt: new Date('2026-07-30T00:00:00.000Z'),
      },
    ]);

    const snapshot = await snapshotServiceVariant('variant-1', tenantId);

    expect(snapshot.partialContent).toBe(
      '<h2>Nested wording</h2>{{service.fields.software}}',
    );
    expect(snapshot.dependencies).toEqual(currentSnapshot.dependencies);
  });

  it('merges required service placeholders declared by nested partials', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue({
      id: 'variant-1',
      version: 2,
      name: 'Corporate Secretarial',
      serviceCadence: 'ANNUALLY',
      customCadenceLabel: null,
      family: { name: 'Corporate Services' },
      sowPartial: {
        id: 'partial-1',
        name: 'corporate-secretarial',
        version: 2,
        content: '<h2>{{> nested-partial}}</h2>',
        placeholders: [],
      },
    });
    prismaMock.templatePartial.findMany.mockResolvedValue([
      {
        id: 'nested-1',
        name: 'nested-partial',
        version: 2,
        content: '{{service.fields.software}}',
        placeholders: [
          {
            key: 'service.fields.software',
            label: 'Accounting software',
            type: 'text',
            required: true,
          },
        ],
        updatedAt: new Date('2026-07-30T00:00:00.000Z'),
      },
    ]);

    const snapshot = await snapshotServiceVariant('variant-1', tenantId);

    expect(snapshot.placeholders).toEqual([
      expect.objectContaining({
        key: 'service.fields.software',
        required: true,
      }),
    ]);
  });

  it('updates a persisted item in place when its variant changes', async () => {
    const companyId = '11111111-1111-4111-8111-111111111111';
    const contactId = '22222222-2222-4222-8222-222222222222';
    const documentId = '33333333-3333-4333-8333-333333333333';
    const agreementId = '44444444-4444-4444-8444-444444444444';
    const itemId = '55555555-5555-4555-8555-555555555555';
    const oldVariantId = '66666666-6666-4666-8666-666666666666';
    const newVariantId = '77777777-7777-4777-8777-777777777777';
    const entityId = '88888888-8888-4888-8888-888888888888';
    const now = new Date('2026-07-30T00:00:00.000Z');

    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: documentId });
    prismaMock.company.findMany.mockResolvedValue([
      { id: companyId, name: 'Alpha Pte. Ltd.', uen: '11111111A' },
    ]);
    companyAccessMock.checkUserCompanyAccess.mockResolvedValue(true);
    prismaMock.companyContact.findFirst.mockResolvedValue({
      relationship: 'Director',
      contact: {
        id: contactId,
        fullName: 'Alex Tan',
        contactDetails: [],
      },
    });
    prismaMock.serviceAgreement.findUnique
      .mockResolvedValueOnce({
        id: agreementId,
        status: 'DRAFT',
        items: [{ id: itemId, serviceVariantId: oldVariantId }],
        entities: [{ id: entityId, companyId }],
      })
      .mockResolvedValueOnce({
        id: agreementId,
        generatedDocumentId: documentId,
        primaryCompanyId: companyId,
        authorizedContactId: contactId,
        authorizedRepresentativeSnapshot: {
          id: contactId,
          name: 'Alex Tan',
          role: 'Director',
          email: null,
          phone: null,
        },
        agreementDate: now,
        effectiveDate: now,
        termMonths: 12,
        status: 'DRAFT',
        entities: [
          {
            id: entityId,
            companyId,
            nameSnapshot: 'Alpha Pte. Ltd.',
            uenSnapshot: '11111111A',
            displayOrder: 0,
          },
        ],
        items: [],
        createdAt: now,
        updatedAt: now,
      });
    prismaMock.serviceAgreement.upsert.mockResolvedValue({ id: agreementId });
    prismaMock.serviceAgreementEntity.create.mockResolvedValue({ id: entityId });
    prismaMock.serviceVariant.findFirst.mockResolvedValue({
      id: newVariantId,
      version: 3,
      name: 'Updated Service',
      serviceCadence: 'MONTHLY',
      customCadenceLabel: null,
      family: { name: 'Accounting' },
      sowPartial: {
        id: '99999999-9999-4999-8999-999999999999',
        name: 'updated-service',
        version: 4,
        content: '<p>Updated wording</p>',
        placeholders: [],
      },
    });
    prismaMock.templatePartial.findMany.mockResolvedValue([]);
    prismaMock.serviceAgreementItem.create.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    prismaMock.serviceAgreementItem.update.mockResolvedValue({ id: itemId });

    await upsertServiceAgreementDraft(
      documentId,
      {
        primaryCompanyId: companyId,
        authorizedContactId: contactId,
        entityIds: [companyId],
        agreementDate: '2026-07-30',
        effectiveDate: '2026-07-30',
        termMonths: 12,
        items: [
          {
            id: itemId,
            clientKey: 'item-1',
            variantId: newVariantId,
            entityIds: [companyId],
            startDate: '2026-07-30',
            endDate: null,
            fieldValues: {},
            displayOrder: 0,
            feeLines: [
              {
                clientKey: 'fee-1',
                companyId,
                description: 'Monthly fee',
                amount: '100.00',
                currency: 'SGD',
                billingFrequency: 'MONTHLY',
                displayOrder: 0,
              },
            ],
          },
        ],
      },
      actor,
    );

    expect(prismaMock.serviceAgreementItem.create).not.toHaveBeenCalled();
    expect(prismaMock.serviceAgreementItem.update).toHaveBeenCalledWith({
      where: { id: itemId },
      data: expect.objectContaining({
        serviceVariantId: newVariantId,
        variantVersion: 3,
        partialVersion: 4,
      }),
    });
  });

  it('preserves the pinned representative when the unchanged source contact was deleted', async () => {
    const companyId = '11111111-1111-4111-8111-111111111111';
    const contactId = '22222222-2222-4222-8222-222222222222';
    const documentId = '33333333-3333-4333-8333-333333333333';
    const agreementId = '44444444-4444-4444-8444-444444444444';
    const itemId = '55555555-5555-4555-8555-555555555555';
    const variantId = '66666666-6666-4666-8666-666666666666';
    const entityId = '77777777-7777-4777-8777-777777777777';
    const now = new Date('2026-07-30T00:00:00.000Z');
    const pinnedRepresentative = {
      id: contactId,
      name: 'Pinned Representative',
      role: 'Director',
      email: 'pinned@example.com',
      phone: '+65 6000 0000',
    };

    prismaMock.generatedDocument.findFirst.mockResolvedValue({ id: documentId });
    prismaMock.company.findMany.mockResolvedValue([
      { id: companyId, name: 'Alpha Pte. Ltd.', uen: '11111111A' },
    ]);
    prismaMock.serviceAgreement.findUnique
      .mockResolvedValueOnce({
        id: agreementId,
        status: 'DRAFT',
        primaryCompanyId: companyId,
        authorizedContactId: null,
        authorizedRepresentativeSnapshot: pinnedRepresentative,
        items: [{
          id: itemId,
          serviceVariantId: variantId,
          partialPlaceholdersSnapshot: [],
        }],
        entities: [{ id: entityId, companyId }],
      })
      .mockResolvedValueOnce({
        id: agreementId,
        generatedDocumentId: documentId,
        primaryCompanyId: companyId,
        authorizedContactId: null,
        authorizedRepresentativeSnapshot: pinnedRepresentative,
        agreementDate: now,
        effectiveDate: now,
        termMonths: 12,
        status: 'DRAFT',
        entities: [{
          id: entityId,
          companyId,
          nameSnapshot: 'Alpha Pte. Ltd.',
          uenSnapshot: '11111111A',
          displayOrder: 0,
        }],
        items: [],
        createdAt: now,
        updatedAt: now,
      });
    prismaMock.serviceAgreement.upsert.mockResolvedValue({ id: agreementId });
    prismaMock.serviceAgreementEntity.create.mockResolvedValue({ id: entityId });
    prismaMock.serviceAgreementItem.update.mockResolvedValue({ id: itemId });

    const saved = await upsertServiceAgreementDraft(
      documentId,
      {
        primaryCompanyId: companyId,
        authorizedContactId: contactId,
        entityIds: [companyId],
        agreementDate: '2026-07-30',
        effectiveDate: '2026-07-30',
        termMonths: 12,
        items: [{
          id: itemId,
          clientKey: itemId,
          variantId,
          entityIds: [companyId],
          startDate: '2026-07-30',
          endDate: null,
          fieldValues: {},
          displayOrder: 0,
          feeLines: [{
            clientKey: 'fee-1',
            companyId,
            description: 'Annual fee',
            amount: '500.00',
            currency: 'SGD',
            billingFrequency: 'ANNUALLY',
            displayOrder: 0,
          }],
        }],
      },
      actor,
    );

    expect(prismaMock.companyContact.findFirst).not.toHaveBeenCalled();
    expect(saved.authorizedRepresentativeSnapshot).toEqual(pinnedRepresentative);
    expect(prismaMock.serviceAgreement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ authorizedContactId: null }),
    }));
  });

  it('rechecks access to every agreement entity when a draft is read', async () => {
    const now = new Date('2026-07-30T00:00:00.000Z');
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({
      id: 'agreement-1',
      generatedDocumentId: 'document-1',
      primaryCompanyId: 'company-1',
      authorizedContactId: 'contact-1',
      authorizedRepresentativeSnapshot: {
        id: 'contact-1',
        name: 'Alex Tan',
        role: 'Director',
        email: null,
        phone: null,
      },
      agreementDate: now,
      effectiveDate: now,
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
      createdAt: now,
      updatedAt: now,
    });
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'company-1', name: 'Alpha Pte. Ltd.', uen: '11111111A' },
    ]);
    companyAccessMock.checkUserCompanyAccess.mockResolvedValue(false);

    await expect(getServiceAgreementDraftById(
      'agreement-1',
      actor,
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refreshes only pinned wording fields and preserves structured entered data', async () => {
    prismaMock.serviceAgreementItem.findFirst.mockResolvedValue({
      id: 'item-1',
      tenantId,
      serviceVariantId: 'variant-1',
      variantVersion: 1,
      partialVersion: 1,
      agreement: { status: 'DRAFT' },
    });
    prismaMock.serviceVariant.findFirst.mockResolvedValue({
      id: 'variant-1',
      version: currentSnapshot.variantVersion,
      name: currentSnapshot.variantName,
      serviceCadence: currentSnapshot.serviceCadence,
      customCadenceLabel: null,
      family: { name: currentSnapshot.familyName },
      sowPartial: {
        id: currentSnapshot.partialId,
        name: 'corporate-secretarial',
        version: currentSnapshot.partialVersion,
        content: currentSnapshot.partialContent,
        placeholders: currentSnapshot.placeholders,
      },
    });
    prismaMock.templatePartial.findMany.mockResolvedValue([]);
    prismaMock.serviceAgreementItem.update.mockResolvedValue({
      id: 'item-1',
      ...currentSnapshot,
      serviceVariantId: 'variant-1',
      familyNameSnapshot: currentSnapshot.familyName,
      variantNameSnapshot: currentSnapshot.variantName,
      sowPartialId: currentSnapshot.partialId,
      partialContentSnapshot: currentSnapshot.partialContent,
      partialPlaceholdersSnapshot: currentSnapshot.placeholders,
      partialDependencySnapshot: [],
      startDate: new Date('2026-07-30'),
      endDate: null,
      fieldValues: { software: 'Xero' },
      displayOrder: 0,
      entityLinks: [],
      feeLines: [],
      serviceVariant: { version: 2, sowPartial: { version: 2 } },
    });

    await refreshServiceAgreementItemWording(
      'item-1',
      { expectedVariantVersion: 1, expectedPartialVersion: 1 },
      actor,
    );

    expect(prismaMock.serviceAgreementItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          fieldValues: expect.anything(),
          startDate: expect.anything(),
        }),
      }),
    );
  });

  it('rejects refresh when the caller versions are stale', async () => {
    prismaMock.serviceAgreementItem.findFirst.mockResolvedValue({
      id: 'item-1',
      tenantId,
      serviceVariantId: 'variant-1',
      variantVersion: 2,
      partialVersion: 3,
      agreement: { status: 'DRAFT' },
    });

    await expect(
      refreshServiceAgreementItemWording(
        'item-1',
        { expectedVariantVersion: 1, expectedPartialVersion: 3 },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
