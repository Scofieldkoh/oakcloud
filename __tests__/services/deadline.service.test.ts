import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '@/lib/errors';

const prismaMock = vi.hoisted(() => ({
  deadlineOccurrence: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import {
  deriveDeadlineTiming,
  listDeadlines,
  resetDeadlineDateOverride,
  updateDeadlineOccurrence,
} from '@/services/deadline';

const actor = { tenantId: 'tenant-1', userId: 'user-1' };
const occurrence = {
  id: 'deadline-1',
  tenantId: actor.tenantId,
  companyId: 'company-1',
  clientServiceId: 'service-1',
  cycleId: 'cycle-1',
  ruleVersionId: 'version-1',
  milestoneKey: 'annual-return',
  scheduleEntryKey: '',
  deadlineType: 'STATUTORY' as const,
  calculatedDueDate: new Date('2026-08-18T00:00:00.000Z'),
  operativeDueDate: new Date('2026-08-18T00:00:00.000Z'),
  dateOverridden: false,
  dateOverride: null,
  dateOverrideReason: null,
  dateOverriddenById: null,
  dateOverriddenAt: null,
  status: 'OPEN' as const,
  completedAt: null,
  completedById: null,
  waivedAt: null,
  waivedById: null,
  waiverReason: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
  origin: 'RULE' as const,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-10T00:00:00.000Z'),
  company: { id: 'company-1', name: 'Example Pte. Ltd.', displayAlias: null },
  clientService: { id: 'service-1', serviceName: 'Annual Return', familyName: 'Corporate' },
  cycle: { id: 'cycle-1', periodKey: '2026', periodStart: new Date('2026-01-01T00:00:00.000Z'), periodEnd: new Date('2026-12-31T00:00:00.000Z') },
};

const search = {
  from: '2026-08-01',
  to: '2026-08-31',
  mode: 'TABLE' as const,
  types: ['STATUTORY', 'CLIENT', 'INTERNAL'] as const,
  familyIds: [],
  companyIds: [],
  statuses: [],
  timing: [],
  openOnly: true,
  page: 1,
  limit: 50,
  sortBy: 'dueDate' as const,
  sortOrder: 'asc' as const,
};

describe('deadline service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.deadlineOccurrence.findMany.mockResolvedValue([occurrence]);
    prismaMock.deadlineOccurrence.count.mockResolvedValue(1);
    prismaMock.deadlineOccurrence.findFirst.mockResolvedValue(occurrence);
    prismaMock.deadlineOccurrence.updateMany.mockResolvedValue({ count: 1 });
    auditMock.createAuditLog.mockResolvedValue(undefined);
  });

  it.each([
    ['2026-08-18', 'UPCOMING'],
    ['2026-08-17', 'DUE'],
    ['2026-08-16', 'OVERDUE'],
  ] as const)('derives %s as %s', (dueDate, timingState) => {
    expect(deriveDeadlineTiming('OPEN', dueDate, '2026-08-17')).toBe(timingState);
  });

  it('does not derive timing for a non-open occurrence', () => {
    expect(deriveDeadlineTiming('COMPLETED', '2026-08-16', '2026-08-17')).toBeNull();
  });

  it('rejects edits to a cancelled occurrence', async () => {
    prismaMock.deadlineOccurrence.findFirst.mockResolvedValue({ ...occurrence, status: 'CANCELLED' });

    await expect(updateDeadlineOccurrence('deadline-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      status: 'OPEN',
      reason: 'Reopen for correction',
    }, actor)).rejects.toMatchObject({ code: ErrorCodes.OCCURRENCE_IMMUTABLE });
    expect(prismaMock.deadlineOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it('uses tenant and accessible-company predicates inside the occurrence query', async () => {
    await listDeadlines(search, { ...actor, companyIds: ['company-1'] });

    expect(prismaMock.deadlineOccurrence.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: actor.tenantId,
        companyId: { in: ['company-1'] },
        operativeDueDate: { gte: new Date('2026-08-01T00:00:00.000Z'), lte: new Date('2026-08-31T00:00:00.000Z') },
      }),
    }));
  });

  it('returns no rows when every deadline type is deselected', async () => {
    const result = await listDeadlines({ ...search, types: [] }, actor);

    expect(result).toMatchObject({ mode: 'TABLE', items: [], total: 0, totalPages: 0 });
    expect(prismaMock.deadlineOccurrence.findMany).not.toHaveBeenCalled();
    expect(prismaMock.deadlineOccurrence.count).not.toHaveBeenCalled();
  });

  it('rejects direct transitions between completed and waived', async () => {
    prismaMock.deadlineOccurrence.findFirst.mockResolvedValue({ ...occurrence, status: 'COMPLETED' });

    await expect(updateDeadlineOccurrence('deadline-1', {
      expectedUpdatedAt: occurrence.updatedAt.toISOString(),
      status: 'WAIVED',
      reason: 'Incorrect lifecycle action',
    }, actor)).rejects.toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
    expect(prismaMock.deadlineOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it('limits calendar results to 5,000 occurrences and reports truncation', async () => {
    prismaMock.deadlineOccurrence.findMany.mockResolvedValue(
      Array.from({ length: 5001 }, (_, index) => ({ ...occurrence, id: `deadline-${index}` })),
    );

    const result = await listDeadlines({ ...search, mode: 'CALENDAR' }, actor);

    expect(result).toMatchObject({ mode: 'CALENDAR', truncated: true, warning: expect.any(String) });
    expect(result.items).toHaveLength(5000);
    expect(prismaMock.deadlineOccurrence.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5001 }));
  });

  it('resets an override to the calculated due date with an optimistic timestamp', async () => {
    const overridden = {
      ...occurrence,
      dateOverridden: true,
      dateOverride: new Date('2026-08-20T00:00:00.000Z'),
      dateOverrideReason: 'Temporary client request',
      dateOverriddenById: actor.userId,
      dateOverriddenAt: new Date('2026-08-10T00:00:00.000Z'),
      operativeDueDate: new Date('2026-08-20T00:00:00.000Z'),
    };
    prismaMock.deadlineOccurrence.findFirst.mockResolvedValue(overridden);

    await resetDeadlineDateOverride('deadline-1', {
      expectedUpdatedAt: overridden.updatedAt.toISOString(),
      reason: 'Use rule-calculated due date',
    }, actor);

    expect(prismaMock.deadlineOccurrence.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'deadline-1', tenantId: actor.tenantId, status: { not: 'CANCELLED' } }),
      data: expect.objectContaining({
        operativeDueDate: overridden.calculatedDueDate,
        dateOverridden: false,
        dateOverride: null,
        dateOverrideReason: null,
      }),
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalled();
  });
});
