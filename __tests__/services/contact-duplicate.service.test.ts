import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findMany: vi.fn(),
  queryRaw: vi.fn(),
  decisionFindMany: vi.fn(),
  decisionUpsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    contact: { groupBy: mocks.groupBy, findMany: mocks.findMany },
    contactDuplicateDecision: {
      findMany: mocks.decisionFindMany,
      upsert: mocks.decisionUpsert,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  listContactDuplicateGroups,
  rejectContactDuplicatePair,
} from '@/services/contact-duplicate.service';

const createdAt = new Date('2020-01-01T00:00:00.000Z');

function duplicateContact(id: string, fullName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tenantId: 'tenant-1',
    contactType: 'INDIVIDUAL',
    firstName: fullName,
    lastName: null,
    fullName,
    canonicalName: fullName.trim(),
    alias: null,
    identificationType: null,
    identificationNumber: null,
    nationality: null,
    dateOfBirth: null,
    corporateName: null,
    corporateUen: null,
    fullAddress: null,
    createdAt,
    updatedAt: createdAt,
    contactDetails: [],
    companyRelations: [],
    _count: {
      companyRelations: 0,
      officerPositions: 0,
      shareholdings: 0,
      chargeHoldings: 0,
      contactDetails: 0,
      noteTabs: 0,
      workflow_communication_log_entries: 0,
      workflow_milestones: 0,
    },
    ...overrides,
  };
}

function exactGroups(names: string[] = [], identifiers: Array<Record<string, unknown>> = [], uens: string[] = []) {
  mocks.groupBy.mockImplementation(async ({ by }: { by: string[] }) => {
    if (by.includes('canonicalName')) return names.map((canonicalName) => ({
      contactType: 'INDIVIDUAL', canonicalName, _count: { _all: 2 },
    }));
    if (by.includes('identificationNumber')) return identifiers;
    return uens.map((corporateUen) => ({ corporateUen, _count: { _all: 2 } }));
  });
}

describe('contact duplicate service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exactGroups();
    mocks.findMany.mockResolvedValue([]);
    mocks.queryRaw.mockResolvedValue([]);
    mocks.decisionFindMany.mockResolvedValue([]);
  });

  it('discovers exact canonical and deterministic identifier groups within the tenant', async () => {
    exactGroups(
      ['王小明'],
      [{ identificationType: 'NRIC', identificationNumber: 'S1234567A', _count: { _all: 2 } }],
    );
    mocks.findMany.mockResolvedValue([
      duplicateContact('c1', '王小明'),
      duplicateContact('c2', ' 王小明 ', { canonicalName: '王小明' }),
      duplicateContact('c3', 'Different One', { identificationType: 'NRIC', identificationNumber: 'S1234567A' }),
      duplicateContact('c4', 'Different Two', { identificationType: 'NRIC', identificationNumber: 'S1234567A' }),
    ]);

    const result = await listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 20 });

    expect(result.groups.map((group) => group.contactIds)).toEqual([
      ['c1', 'c2'],
      ['c3', 'c4'],
    ]);
    expect(mocks.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', deletedAt: null, isActive: true }),
      take: expect.any(Number),
    }));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-1', deletedAt: null, isActive: true }),
      take: expect.any(Number),
    }));
  });

  it('scores bounded pg_trgm candidates and keeps short CJK names exact-only', async () => {
    mocks.queryRaw.mockResolvedValue([
      { leftContactId: 'c1', rightContactId: 'c2' },
      { leftContactId: 'c3', rightContactId: 'c4' },
    ]);
    mocks.findMany.mockResolvedValue([
      duplicateContact('c1', 'Alexander Hamilton'),
      duplicateContact('c2', 'Alexander Hamilto'),
      duplicateContact('c3', '王明'),
      duplicateContact('c4', '王民'),
    ]);

    const result = await listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 20 });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ contactIds: ['c1', 'c2'], reasons: ['FUZZY_NAME'] });
    const query = (mocks.queryRaw.mock.calls[0][0] as { sql: string }).sql;
    expect(query).toContain('similarity');
    expect(query).toContain('0.3');
  });

  it('unions overlapping pairs stably, ranks the master, and paginates groups', async () => {
    exactGroups(['alpha', 'bravo']);
    mocks.queryRaw.mockResolvedValue([{ leftContactId: 'c2', rightContactId: 'c3' }]);
    mocks.findMany.mockResolvedValue([
      duplicateContact('c3', 'alpha', { canonicalName: 'alpha' }),
      duplicateContact('c1', 'alpha', { canonicalName: 'alpha' }),
      duplicateContact('c2', 'alpha', {
        canonicalName: 'alpha',
        identificationType: 'NRIC',
        identificationNumber: 'S1234567A',
      }),
      duplicateContact('d1', 'bravo', { canonicalName: 'bravo' }),
      duplicateContact('d2', 'bravo', { canonicalName: 'bravo' }),
    ]);

    const page = await listContactDuplicateGroups({ tenantId: 'tenant-1', page: 2, limit: 1 });

    expect(page).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(page.groups[0].contactIds).toEqual(['d1', 'd2']);
    const firstPage = await listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 1 });
    expect(firstPage.groups[0]).toMatchObject({
      contactIds: ['c1', 'c2', 'c3'],
      recommendedMasterId: 'c2',
    });
  });

  it('suppresses only rejections whose sorted pair fingerprints are still current', async () => {
    exactGroups(['王小明']);
    mocks.findMany.mockResolvedValue([
      duplicateContact('c1', '王小明'),
      duplicateContact('c2', '王小明'),
    ]);

    const initial = await listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 20 });
    const fingerprints = initial.groups[0].fingerprints;
    mocks.decisionFindMany.mockResolvedValue([{
      leftContactId: 'c1',
      rightContactId: 'c2',
      leftFingerprint: fingerprints.c1,
      rightFingerprint: fingerprints.c2,
    }]);
    await expect(listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 20 }))
      .resolves.toMatchObject({ groups: [], total: 0 });

    mocks.decisionFindMany.mockResolvedValue([{
      leftContactId: 'c1', rightContactId: 'c2', leftFingerprint: 'stale', rightFingerprint: fingerprints.c2,
    }]);
    await expect(listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 20 }))
      .resolves.toMatchObject({ total: 1 });
  });

  it('rejects a sorted tenant-scoped pair only when supplied fingerprints are current', async () => {
    const contacts = [duplicateContact('c2', '王小明'), duplicateContact('c1', '王小明')];
    mocks.findMany.mockResolvedValue(contacts);
    exactGroups(['王小明']);
    const discovered = await listContactDuplicateGroups({ tenantId: 'tenant-1', page: 1, limit: 20 });
    const fingerprints = discovered.groups[0].fingerprints;

    await rejectContactDuplicatePair({
      leftContactId: 'c2',
      rightContactId: 'c1',
      leftFingerprint: fingerprints.c2,
      rightFingerprint: fingerprints.c1,
      reason: 'Confirmed to be different people',
    }, { tenantId: 'tenant-1', userId: 'user-1' });

    expect(mocks.decisionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_leftContactId_rightContactId: {
        tenantId: 'tenant-1', leftContactId: 'c1', rightContactId: 'c2',
      } },
      create: expect.objectContaining({
        leftContactId: 'c1', rightContactId: 'c2', decidedById: 'user-1', decision: 'REJECTED',
      }),
    }));

    await expect(rejectContactDuplicatePair({
      leftContactId: 'c1', rightContactId: 'c2', leftFingerprint: 'stale', rightFingerprint: fingerprints.c2,
      reason: 'Confirmed to be different people',
    }, { tenantId: 'tenant-1', userId: 'user-1' })).rejects.toThrow('stale');
  });
});
