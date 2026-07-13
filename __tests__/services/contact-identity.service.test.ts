import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  $executeRaw: vi.fn(),
  contact: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contactDetail: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  company: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  contactDuplicateDecision: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    contact: { findMany: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/services/contact-detail.service', () => ({ createContactDetail: vi.fn() }));

import { createAuditLog } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { createContactDetail } from '@/services/contact-detail.service';
import { createContact } from '@/services/contact.service';
import {
  previewContactIdentity,
  resolveOrCreateContact,
} from '@/services/contact-identity.service';
import type { ContactIdentityCandidate } from '@/types/contact-identity';

const params = { tenantId: 'tenant-1', userId: 'user-1' };

function candidate(
  overrides: Partial<ContactIdentityCandidate> = {},
): ContactIdentityCandidate {
  return {
    source: 'MANUAL',
    contactType: 'INDIVIDUAL',
    firstName: '王小明',
    ...overrides,
  };
}

function existingContact(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date('2020-01-01T00:00:00.000Z');
  return {
    id: 'contact-1',
    tenantId: 'tenant-1',
    contactType: 'INDIVIDUAL',
    firstName: '王小明',
    lastName: null,
    fullName: '王小明',
    canonicalName: '王小明',
    alias: null,
    identificationType: null,
    identificationNumber: null,
    nationality: null,
    dateOfBirth: null,
    corporateName: null,
    corporateUen: null,
    fullAddress: null,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    _count: {
      companyRelations: 0,
      officerPositions: 0,
      shareholdings: 0,
      contactDetails: 0,
    },
    contactDetails: [],
    ...overrides,
  };
}

describe('contact identity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.contact.findMany.mockResolvedValue([]);
    tx.contact.findFirst.mockResolvedValue(null);
    tx.contactDetail.findMany.mockResolvedValue([]);
    tx.contact.create.mockImplementation(async ({ data }) =>
      existingContact({ id: 'created-contact', ...data }),
    );
    tx.contact.update.mockImplementation(async ({ data }) =>
      existingContact({ ...data }),
    );
  });

  it('previews active contacts only within the requested tenant', async () => {
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      existingContact(),
    ] as never);

    const match = await previewContactIdentity(candidate(), 'tenant-1');

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', contactType: 'INDIVIDUAL', deletedAt: null, isActive: true },
      }),
    );
    expect(match).toMatchObject({ contactId: 'contact-1', automatic: true });
  });

  it('reuses and enriches an exact Chinese name-only contact', async () => {
    tx.contact.findMany.mockResolvedValue([existingContact()]);

    const result = await resolveOrCreateContact(
      candidate({ identificationType: 'NRIC', identificationNumber: 'S1234567A' }),
      { action: 'AUTO' },
      params,
    );

    expect(result.outcome).toBe('REUSED_NAME');
    expect(tx.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1' },
        data: expect.objectContaining({
          identificationType: 'NRIC',
          identificationNumber: 'S1234567A',
        }),
      }),
    );
  });

  it('prioritizes an identifier match over a name match', async () => {
    tx.contact.findMany.mockResolvedValue([
      existingContact({ id: 'name-match' }),
      existingContact({
        id: 'id-match',
        firstName: 'Different',
        fullName: 'Different',
        canonicalName: 'different',
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
      }),
    ]);

    const result = await resolveOrCreateContact(
      candidate({ identificationType: 'NRIC', identificationNumber: 'S 123-4567 A' }),
      { action: 'AUTO' },
      params,
    );

    expect(result.outcome).toBe('REUSED_IDENTIFIER');
    expect(result.contact.id).toBe('id-match');
  });

  it('blocks automatic reuse when exact names have conflicting strong identifiers', async () => {
    tx.contact.findMany.mockResolvedValue([
      existingContact({ identificationType: 'NRIC', identificationNumber: 'S7654321A' }),
    ]);

    const result = await resolveOrCreateContact(
      candidate({ identificationType: 'NRIC', identificationNumber: 'S1234567A' }),
      { action: 'AUTO' },
      params,
    );

    expect(result.outcome).toBe('CREATED');
    expect(result.conflicts).toEqual([
      expect.objectContaining({ field: 'identificationNumber' }),
    ]);
    expect(tx.contact.update).not.toHaveBeenCalled();
  });

  it('requires a reason and records an explicit separate decision after creation', async () => {
    tx.contact.findMany.mockResolvedValue([existingContact()]);

    await expect(
      resolveOrCreateContact(candidate(), { action: 'CREATE_SEPARATE', reason: '  ' }, params),
    ).rejects.toThrow('reason');

    const result = await resolveOrCreateContact(
      candidate(),
      { action: 'CREATE_SEPARATE', reason: 'Different person confirmed by reviewer' },
      params,
    );

    expect(result.outcome).toBe('CREATED_SEPARATE');
    expect(tx.contactDuplicateDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        leftContactId: 'contact-1',
        rightContactId: 'created-contact',
        decision: 'CREATE_SEPARATE',
        reason: 'Different person confirmed by reviewer',
        decidedById: 'user-1',
      }),
    });
    expect(tx.contactDuplicateDecision.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.contact.create.mock.invocationCallOrder.at(-1)!,
    );
  });

  it('fills empty fields without overwriting conflicting non-empty values', async () => {
    tx.contact.findMany.mockResolvedValue([
      existingContact({
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
        nationality: '',
        fullAddress: 'Existing address',
      }),
    ]);

    const result = await resolveOrCreateContact(
      candidate({
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
        nationality: 'Singaporean',
        fullAddress: 'Incoming address',
      }),
      { action: 'AUTO' },
      params,
    );

    expect(tx.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nationality: 'Singaporean' } }),
    );
    expect(result.enrichedFields).toEqual(['nationality']);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ field: 'fullAddress', existingValue: 'Existing address' }),
    ]);
  });

  it('creates only distinct normalized contact details through the same transaction', async () => {
    tx.contact.findMany.mockResolvedValue([
      existingContact({
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
        contactDetails: [{ detailType: 'EMAIL', value: 'person@example.com', companyId: null }],
      }),
    ]);

    await resolveOrCreateContact(
      candidate({
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
        contactDetails: [
          { detailType: 'EMAIL', value: ' Person@Example.COM ' },
          { detailType: 'PHONE', value: '+65 8123 4567' },
          { detailType: 'PHONE', value: '+65-8123-4567' },
        ],
      }),
      { action: 'AUTO' },
      params,
    );

    expect(createContactDetail).toHaveBeenCalledTimes(1);
    expect(createContactDetail).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: 'contact-1', detailType: 'PHONE' }),
      { ...params, tx },
    );
  });

  it('acquires canonical and usable identifier locks in sorted order before requerying', async () => {
    tx.contact.findMany.mockResolvedValue([]);

    await resolveOrCreateContact(
      candidate({
        identificationType: 'NRIC',
        identificationNumber: 'S 123-4567 A',
        corporateUen: '2024-00001-A',
      }),
      { action: 'AUTO' },
      params,
    );

    const lockKeys = tx.$executeRaw.mock.calls.map(([query]) => query.values[0]);
    expect(lockKeys).toEqual([...lockKeys].sort());
    expect(lockKeys).toEqual(
      expect.arrayContaining([
        'contact-identity:tenant-1:INDIVIDUAL:name:王小明',
        'contact-identity:tenant-1:INDIVIDUAL:id:NRIC:S1234567A',
        'contact-identity:tenant-1:INDIVIDUAL:uen:202400001A',
      ]),
    );
    expect(tx.contact.findMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.$executeRaw.mock.invocationCallOrder.at(-1)!,
    );
  });

  it('writes contact audit records through the same transaction', async () => {
    await resolveOrCreateContact(candidate(), { action: 'AUTO' }, params);

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'Contact', entityId: 'created-contact' }),
      tx,
    );
  });

  it('does not lock on or enrich from a low-confidence identifier', async () => {
    tx.contact.findMany.mockResolvedValue([existingContact()]);

    const result = await resolveOrCreateContact(
      candidate({
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
        confidence: { identificationNumber: 0.5 },
      }),
      { action: 'AUTO' },
      params,
    );

    const lockKeys = tx.$executeRaw.mock.calls.map(([query]) => query.values[0]);
    expect(lockKeys.some((key) => key.includes(':id:'))).toBe(false);
    expect(tx.contact.update).not.toHaveBeenCalled();
    expect(result.enrichedFields).toEqual([]);
  });

  it('keeps legacy direct creation canonical-name writes consistent', async () => {
    vi.mocked(prisma.contact.create).mockResolvedValue(
      existingContact({ id: 'legacy-created' }) as never,
    );

    await createContact(
      { contactType: 'INDIVIDUAL', firstName: 'Ｗａｎｇ', lastName: ' 小明 ' },
      params,
    );

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ canonicalName: 'wang小明' }),
    });
  });
});
