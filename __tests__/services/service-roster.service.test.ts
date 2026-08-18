import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientService: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

import {
  listServiceRoster,
  type ServiceRosterScope,
} from '@/services/service-roster';
import type { ServiceRosterSearch } from '@/lib/validations/service-roster';

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const familyId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';

const search: ServiceRosterSearch = {
  query: undefined,
  companyId: undefined,
  familyIds: [],
  variantId: undefined,
  statuses: ['ACTIVE'],
  archived: false,
  applicability: undefined,
  sortBy: 'company',
  sortOrder: 'asc',
  page: 1,
  limit: 20,
};

const scope: ServiceRosterScope = {
  tenantId,
  companyIds: [companyId],
};

function rosterRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'service-1',
    tenantId,
    companyId,
    source: 'MANUAL',
    serviceVariantId: variantId,
    familyName: 'Corporate Services',
    serviceName: 'Annual Return Filing',
    status: 'ACTIVE',
    serviceCadence: 'ANNUALLY',
    customCadenceLabel: null,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    fieldValues: {},
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    company: {
      id: companyId,
      tenantId,
      name: 'Oaktree Accounting & Corporate Solution Pte. Ltd.',
      displayAlias: null,
      uen: '202600001A',
      deletedAt: null,
    },
    serviceVariant: {
      id: variantId,
      tenantId,
      familyId,
      code: 'AR',
      name: 'Annual Return Filing',
      serviceCadence: 'ANNUALLY',
      customCadenceLabel: null,
      version: 2,
      deletedAt: null,
      family: {
        id: familyId,
        tenantId,
        name: 'Corporate Services',
        displayColor: '#2F6F5E',
        deletedAt: null,
      },
    },
    deadlineRules: [
      {
        id: 'client-rule-1',
        enabled: true,
        applicabilityState: 'APPLICABLE',
        applicabilityReason: null,
        rule: { id: 'rule-1', code: 'AR', name: 'Annual Return' },
      },
    ],
    deadlineOccurrences: [
      {
        id: 'deadline-1',
        tenantId,
        companyId,
        clientServiceId: 'service-1',
        milestoneKey: 'filing',
        scheduleEntryKey: '',
        deadlineType: 'STATUTORY',
        calculatedDueDate: new Date('2026-09-01T00:00:00.000Z'),
        operativeDueDate: new Date('2026-09-01T00:00:00.000Z'),
        status: 'OPEN',
        origin: 'RULE',
      },
    ],
    ...overrides,
  };
}

describe('service roster service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([rosterRecord()]);
    mocks.count.mockResolvedValue(1);
  });

  it('places tenant and accessible company IDs in the client-service predicate', async () => {
    await listServiceRoster(search, scope);

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        companyId: { in: [companyId] },
      }),
    }));
    expect(mocks.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        companyId: { in: [companyId] },
      }),
    }));
  });

  it('scopes the nested open-deadline relation and orders it deterministically', async () => {
    await listServiceRoster(search, scope);

    const call = mocks.findMany.mock.calls[0]![0] as {
      include: { deadlineOccurrences: { where: Record<string, unknown>; orderBy: unknown; take: number } };
    };
    expect(call.include.deadlineOccurrences.where).toEqual(expect.objectContaining({
      tenantId,
      companyId: { in: [companyId] },
      status: 'OPEN',
    }));
    expect(call.include.deadlineOccurrences.orderBy).toEqual([
      { operativeDueDate: 'asc' },
      { id: 'asc' },
    ]);
    expect(call.include.deadlineOccurrences.take).toBe(1);
  });

  it('returns alias fallback, family color, snapshots, next deadline, and warning state', async () => {
    const result = await listServiceRoster(search, { tenantId, allCompaniesAccess: true });

    expect(result.items[0]).toMatchObject({
      company: {
        name: 'Oaktree Accounting & Corporate Solution Pte. Ltd.',
        displayLabel: 'OACS',
      },
      family: { displayColor: '#2F6F5E' },
      variant: { id: variantId, name: 'Annual Return Filing', version: 2 },
      service: { source: 'MANUAL', status: 'ACTIVE', cadence: 'ANNUALLY' },
      nextDeadline: { operativeDueDate: '2026-09-01', status: 'OPEN' },
      applicability: { state: 'APPLICABLE', hasWarning: false },
      ruleWarning: { state: 'APPLICABLE', hasWarning: false },
    });
  });

  it('aggregates missing applicability as a warning without hiding not-applicable rules', async () => {
    mocks.findMany.mockResolvedValue([rosterRecord({
      deadlineRules: [
        { id: 'rule-1', enabled: true, applicabilityState: 'NOT_APPLICABLE', applicabilityReason: 'Private company', rule: null },
        { id: 'rule-2', enabled: true, applicabilityState: 'MISSING_INPUT', applicabilityReason: 'Missing FYE', rule: null },
      ],
      deadlineOccurrences: [],
    })]);

    const result = await listServiceRoster(search, scope);

    expect(result.items[0]).toMatchObject({
      applicability: { state: 'MISSING_INPUT', hasWarning: true, missingInputCount: 1, notApplicableCount: 1 },
      ruleWarning: { state: 'MISSING_INPUT', hasWarning: true, reasons: ['Missing FYE'] },
      nextDeadline: null,
    });
  });

  it('returns an empty page without querying when access scope is empty', async () => {
    const result = await listServiceRoster({ ...search, page: 3, limit: 10 }, { tenantId, companyIds: [] });

    expect(result).toEqual({ items: [], total: 0, page: 3, limit: 10, totalPages: 0 });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
