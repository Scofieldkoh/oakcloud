import { describe, expect, it, vi } from 'vitest';
import {
  classifyDeadlineChange,
  getServiceWorkspaceFlags,
  reconcileClientServiceDeadlines,
} from '@/services/schedule-reconciliation';
import type {
  StoredDeadline,
  EvaluatedDeadlineForDiff,
} from '@/services/schedule-reconciliation';
import type { DateOnly } from '@/services/service-schedule';

describe('schedule reconciliation workspace settings', () => {
  it('returns default enabled workspace flags when settings are empty', () => {
    const flags = getServiceWorkspaceFlags({});
    expect(flags.workspaceEnabled).toBe(true);
    expect(flags.deadlineWritesEnabled).toBe(false);
  });

  it('reads explicit workspace settings correctly', () => {
    const flags = getServiceWorkspaceFlags({
      servicesWorkspace: {
        enabled: false,
        deadlineWritesEnabled: true,
      },
    });
    expect(flags.workspaceEnabled).toBe(false);
    expect(flags.deadlineWritesEnabled).toBe(true);
  });

  it('respects DEADLINE_OCCURRENCE_WRITES_ENABLED env variable when setting is omitted', () => {
    const originalEnv = process.env.DEADLINE_OCCURRENCE_WRITES_ENABLED;
    try {
      process.env.DEADLINE_OCCURRENCE_WRITES_ENABLED = 'true';
      const flags = getServiceWorkspaceFlags({});
      expect(flags.deadlineWritesEnabled).toBe(true);
    } finally {
      process.env.DEADLINE_OCCURRENCE_WRITES_ENABLED = originalEnv;
    }
  });
});

describe('classifyDeadlineChange', () => {
  const today: DateOnly = '2026-08-18';
  const proposed: EvaluatedDeadlineForDiff = {
    milestoneKey: 'agm_due',
    scheduleEntryKey: 'entry_1',
    deadlineType: 'STATUTORY',
    dueDate: '2026-09-30',
    ruleVersionId: 'version-1',
    explanation: '6 months after FYE',
  };

  it('returns CREATE when no existing deadline exists', () => {
    const result = classifyDeadlineChange(null, proposed, today);
    expect(result).toEqual({ action: 'CREATE' });
  });

  it('returns PRESERVE with MANUAL_TRIGGER when origin is not RULE', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-30',
      operativeDueDate: '2026-09-30',
      dateOverridden: false,
      status: 'OPEN',
      origin: 'MANUAL_TRIGGER',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'PRESERVE', reason: 'MANUAL_TRIGGER' });
  });

  it('returns PRESERVE with HISTORICAL when operativeDueDate is before today', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-08-01',
      operativeDueDate: '2026-08-01',
      dateOverridden: false,
      status: 'OPEN',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'PRESERVE', reason: 'HISTORICAL' });
  });

  it('returns PRESERVE with COMPLETED when status is COMPLETED', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-30',
      operativeDueDate: '2026-09-30',
      dateOverridden: false,
      status: 'COMPLETED',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'PRESERVE', reason: 'COMPLETED' });
  });

  it('returns PRESERVE with WAIVED when status is WAIVED', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-30',
      operativeDueDate: '2026-09-30',
      dateOverridden: false,
      status: 'WAIVED',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'PRESERVE', reason: 'WAIVED' });
  });

  it('returns PRESERVE with CANCELLED when status is CANCELLED', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-30',
      operativeDueDate: '2026-09-30',
      dateOverridden: false,
      status: 'CANCELLED',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'PRESERVE', reason: 'CANCELLED' });
  });

  it('returns PRESERVE with OVERRIDDEN when dateOverridden is true', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-30',
      operativeDueDate: '2026-10-15',
      dateOverridden: true,
      status: 'OPEN',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'PRESERVE', reason: 'OVERRIDDEN' });
  });

  it('returns RECALCULATE when calculatedDueDate or ruleVersionId changes for open future rule deadline', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-15',
      operativeDueDate: '2026-09-15',
      dateOverridden: false,
      status: 'OPEN',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'RECALCULATE' });
  });

  it('returns NO_CHANGE when calculatedDueDate, operativeDueDate, and ruleVersion match', () => {
    const existing: StoredDeadline = {
      id: 'occ-1',
      cycleId: 'cycle-1',
      milestoneKey: 'agm_due',
      scheduleEntryKey: 'entry_1',
      deadlineType: 'STATUTORY',
      calculatedDueDate: '2026-09-30',
      operativeDueDate: '2026-09-30',
      dateOverridden: false,
      status: 'OPEN',
      origin: 'RULE',
      ruleVersionId: 'version-1',
    };
    const result = classifyDeadlineChange(existing, proposed, today);
    expect(result).toEqual({ action: 'NO_CHANGE' });
  });
});

describe('reconcileClientServiceDeadlines', () => {
  it('preserves manual, historical, completed, waived, cancelled, and overridden deadlines', async () => {
    const today: DateOnly = '2026-08-18';
    const horizonEnd: DateOnly = '2027-08-18';

    const dbMock = {
      clientService: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cs-1',
          tenantId: 'tenant-1',
          companyId: 'company-1',
          deletedAt: null,
          status: 'ACTIVE',
          company: {
            id: 'company-1',
            tenantId: 'tenant-1',
            uen: '202400001A',
            name: 'Example Pte Ltd',
            entityType: 'PRIVATE_LIMITED',
            status: 'LIVE',
            financialYearEndDay: 31,
            financialYearEndMonth: 12,
          },
          deadlineRules: [],
        }),
      },
      serviceCycle: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'cycle-1',
            tenantId: 'tenant-1',
            clientServiceId: 'cs-1',
            ruleId: 'rule-1',
            periodKey: '2026',
            generationKey: 'rolling-v1',
            origin: 'RULE',
            occurrences: [
              {
                id: 'occ-manual',
                cycleId: 'cycle-1',
                milestoneKey: 'm1',
                scheduleEntryKey: 'e1',
                deadlineType: 'STATUTORY',
                calculatedDueDate: new Date('2026-09-30T00:00:00.000Z'),
                operativeDueDate: new Date('2026-09-30T00:00:00.000Z'),
                dateOverridden: false,
                status: 'OPEN',
                origin: 'MANUAL_TRIGGER',
                ruleVersionId: 'v1',
              },
              {
                id: 'occ-hist',
                cycleId: 'cycle-1',
                milestoneKey: 'm2',
                scheduleEntryKey: 'e2',
                deadlineType: 'STATUTORY',
                calculatedDueDate: new Date('2026-07-01T00:00:00.000Z'),
                operativeDueDate: new Date('2026-07-01T00:00:00.000Z'),
                dateOverridden: false,
                status: 'OPEN',
                origin: 'RULE',
                ruleVersionId: 'v1',
              },
              {
                id: 'occ-comp',
                cycleId: 'cycle-1',
                milestoneKey: 'm3',
                scheduleEntryKey: 'e3',
                deadlineType: 'STATUTORY',
                calculatedDueDate: new Date('2026-09-30T00:00:00.000Z'),
                operativeDueDate: new Date('2026-09-30T00:00:00.000Z'),
                dateOverridden: false,
                status: 'COMPLETED',
                origin: 'RULE',
                ruleVersionId: 'v1',
              },
              {
                id: 'occ-waived',
                cycleId: 'cycle-1',
                milestoneKey: 'm4',
                scheduleEntryKey: 'e4',
                deadlineType: 'STATUTORY',
                calculatedDueDate: new Date('2026-09-30T00:00:00.000Z'),
                operativeDueDate: new Date('2026-09-30T00:00:00.000Z'),
                dateOverridden: false,
                status: 'WAIVED',
                origin: 'RULE',
                ruleVersionId: 'v1',
              },
              {
                id: 'occ-cancelled',
                cycleId: 'cycle-1',
                milestoneKey: 'm5',
                scheduleEntryKey: 'e5',
                deadlineType: 'STATUTORY',
                calculatedDueDate: new Date('2026-09-30T00:00:00.000Z'),
                operativeDueDate: new Date('2026-09-30T00:00:00.000Z'),
                dateOverridden: false,
                status: 'CANCELLED',
                origin: 'RULE',
                ruleVersionId: 'v1',
              },
              {
                id: 'occ-overridden',
                cycleId: 'cycle-1',
                milestoneKey: 'm6',
                scheduleEntryKey: 'e6',
                deadlineType: 'STATUTORY',
                calculatedDueDate: new Date('2026-09-30T00:00:00.000Z'),
                operativeDueDate: new Date('2026-10-15T00:00:00.000Z'),
                dateOverridden: true,
                status: 'OPEN',
                origin: 'RULE',
                ruleVersionId: 'v1',
              },
            ],
          },
        ]),
      },
      businessCalendar: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      deadlineOccurrence: {
        update: vi.fn(),
        create: vi.fn(),
      },
    };

    const result = await reconcileClientServiceDeadlines(
      {
        tenantId: 'tenant-1',
        clientServiceId: 'cs-1',
        today,
        horizonEnd,
        writeMode: 'OBSERVE',
        reconciliationRequestId: 'req-1',
      },
      dbMock as never,
    );

    expect(result.preservedByReason).toMatchObject({
      MANUAL_TRIGGER: 1,
      HISTORICAL: 1,
      COMPLETED: 1,
      WAIVED: 1,
      CANCELLED: 1,
      OVERRIDDEN: 1,
    });
  });

  function reconciliationRule(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rule-1',
      name: 'AGM due date',
      isActive: true,
      currentVersion: {
        id: 'version-1',
        recurrence: { schemaVersion: 1, kind: 'ONE_TIME' },
        applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
        configHash: 'config-1',
        parameterDefinitions: [],
        milestoneTemplates: [{
          milestoneKey: 'agm-due',
          name: 'AGM due',
          description: null,
          type: 'STATUTORY',
          generationMode: 'ONCE_PER_CYCLE',
          dateExpression: { kind: 'SOURCE', source: { kind: 'COMPANY_FIELD', field: 'nextAgmDueDate' } },
          businessDayAdjustment: 'NONE',
          displayOrder: 0,
          isActive: true,
        }],
      },
      ...overrides,
    };
  }

  function reconciliationDb(existingCycles: unknown[] = [], rule = reconciliationRule()) {
    const cycle = {
      id: 'cycle-1',
      tenantId: 'tenant-1',
      clientServiceId: 'cs-1',
      ruleId: 'rule-1',
      periodKey: 'ONE_TIME',
      generationKey: 'rolling-v1',
      origin: 'RULE',
      occurrences: [],
    };
    return {
      clientService: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cs-1',
          tenantId: 'tenant-1',
          companyId: 'company-1',
          deletedAt: null,
          status: 'ACTIVE',
          company: {
            id: 'company-1',
            tenantId: 'tenant-1',
            nextAgmDueDate: new Date('2026-09-30T00:00:00.000Z'),
            financialYearEndDay: 31,
            financialYearEndMonth: 12,
          },
          deadlineRules: [{
            id: 'client-rule-1',
            enabled: true,
            parameterValues: {},
            scheduleEntries: [],
            rule,
          }],
        }),
        deadlineRules: { findMany: vi.fn() },
      },
      serviceCycle: {
        findMany: vi.fn().mockResolvedValue(existingCycles),
        upsert: vi.fn().mockResolvedValue(cycle),
        update: vi.fn().mockResolvedValue(cycle),
      },
      businessCalendar: { findFirst: vi.fn().mockResolvedValue(null) },
      clientServiceDeadlineRule: { update: vi.fn().mockResolvedValue({}) },
      deadlineOccurrence: {
        upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
          id: 'occ-created',
          ...create,
        })),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it('evaluates occurrences, creates stable cycles, and snapshots explanations in APPLY mode', async () => {
    const dbMock = reconciliationDb();
    const result = await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1',
      clientServiceId: 'cs-1',
      today: '2026-08-18',
      horizonEnd: '2027-08-18',
      writeMode: 'APPLY',
      reconciliationRequestId: 'req-1',
    }, dbMock as never);

    expect(result.counts.created).toBe(1);
    expect(dbMock.serviceCycle.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId_clientServiceId_ruleId_periodKey_generationKey_origin: expect.objectContaining({
          tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1', generationKey: 'rolling-v1', origin: 'RULE',
        }),
      }),
      create: expect.objectContaining({ sourceSnapshot: expect.anything() }),
    }));
    expect(dbMock.deadlineOccurrence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId_cycleId_milestoneKey_scheduleEntryKey: expect.objectContaining({
          tenantId: 'tenant-1', cycleId: 'cycle-1', milestoneKey: 'agm-due', scheduleEntryKey: '',
        }),
      }),
      create: expect.objectContaining({
        milestoneKey: 'agm-due',
        calculatedDueDate: new Date('2026-09-30T00:00:00.000Z'),
        operativeDueDate: new Date('2026-09-30T00:00:00.000Z'),
      }),
      update: {},
    }));
  });

  it('uses the stored FYE source when materializing a no-cycle annual plan', async () => {
    const dbMock = reconciliationDb([], reconciliationRule({
      currentVersion: {
        id: 'version-1',
        recurrence: { schemaVersion: 1, kind: 'ANNUALLY', interval: 1 },
        applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
        configHash: 'config-1',
        parameterDefinitions: [],
        milestoneTemplates: [{
          milestoneKey: 'fye',
          name: 'Financial year end',
          description: null,
          type: 'STATUTORY',
          generationMode: 'ONCE_PER_CYCLE',
          dateExpression: { kind: 'SOURCE', source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' } },
          businessDayAdjustment: 'NONE',
          displayOrder: 0,
          isActive: true,
        }],
      },
    }));

    const result = await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', today: '2026-08-18', horizonEnd: '2027-08-18',
      writeMode: 'APPLY', reconciliationRequestId: 'req-fye',
    }, dbMock as never);

    expect(result.counts.created).toBeGreaterThan(0);
    expect(dbMock.deadlineOccurrence.upsert.mock.calls
      .map((call) => call[0].create.calculatedDueDate.toISOString()))
      .toContain('2026-12-31T00:00:00.000Z');
  });

  it('updates only calculated date and explanation snapshot for overridden occurrences', async () => {
    const existingOccurrence = {
      id: 'occ-overridden', cycleId: 'cycle-1', milestoneKey: 'agm-due', scheduleEntryKey: '',
      deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-08-31T00:00:00.000Z'),
      operativeDueDate: new Date('2026-10-15T00:00:00.000Z'), dateOverridden: true, status: 'OPEN',
      origin: 'RULE', ruleVersionId: 'old-version',
    };
    const dbMock = reconciliationDb([{
      id: 'cycle-1', tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1',
      periodKey: 'ONE_TIME:2026-08-18', generationKey: 'rolling-v1', origin: 'RULE', occurrences: [existingOccurrence],
    }]);

    const result = await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', today: '2026-08-18', horizonEnd: '2027-08-18',
      writeMode: 'APPLY', reconciliationRequestId: 'req-1',
    }, dbMock as never);

    expect(result.preservedByReason.OVERRIDDEN).toBe(1);
    expect(dbMock.deadlineOccurrence.update).toHaveBeenCalledWith({
      where: { id: 'occ-overridden' },
      data: { calculatedDueDate: new Date('2026-09-30T00:00:00.000Z') },
    });
    expect(dbMock.serviceCycle.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'cycle-1' },
      data: expect.objectContaining({ sourceSnapshot: expect.anything() }),
    }));
  });

  it('cancels only eligible future open rule occurrences removed from evaluation', async () => {
    const existingOccurrence = {
      id: 'occ-removed', cycleId: 'cycle-1', milestoneKey: 'old-milestone', scheduleEntryKey: '',
      deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-09-01T00:00:00.000Z'),
      operativeDueDate: new Date('2026-09-01T00:00:00.000Z'), dateOverridden: false, status: 'OPEN',
      origin: 'RULE', ruleVersionId: 'version-1',
    };
    const dbMock = reconciliationDb([{
      id: 'cycle-1', tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1',
      periodKey: 'ONE_TIME:2026-08-18', generationKey: 'rolling-v1', origin: 'RULE', occurrences: [existingOccurrence],
    }], reconciliationRule({ currentVersion: {
      id: 'version-1', recurrence: { schemaVersion: 1, kind: 'ONE_TIME' },
      applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] }, configHash: 'config-1',
      parameterDefinitions: [], milestoneTemplates: [],
    } }));

    const result = await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', today: '2026-08-18', horizonEnd: '2027-08-18',
      writeMode: 'APPLY', reconciliationRequestId: 'req-1',
    }, dbMock as never);

    expect(result.counts.cancelled).toBe(1);
    expect(dbMock.deadlineOccurrence.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'occ-removed' },
      data: expect.objectContaining({ status: 'CANCELLED', cancellationReason: expect.any(String) }),
    }));
  });

  it('applies archive mode by cancelling only eligible target-rule occurrences', async () => {
    const dbMock = reconciliationDb([
      {
        id: 'cycle-archive', tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1',
        periodKey: '2026', generationKey: 'rolling-v1', origin: 'RULE', occurrences: [
          {
            id: 'occ-archive-open', cycleId: 'cycle-archive', milestoneKey: 'open', scheduleEntryKey: '',
            deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-09-01T00:00:00.000Z'),
            operativeDueDate: new Date('2026-09-01T00:00:00.000Z'), dateOverridden: false, status: 'OPEN', origin: 'RULE', ruleVersionId: 'version-1',
          },
          {
            id: 'occ-archive-manual', cycleId: 'cycle-archive', milestoneKey: 'manual', scheduleEntryKey: '',
            deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-09-02T00:00:00.000Z'),
            operativeDueDate: new Date('2026-09-02T00:00:00.000Z'), dateOverridden: false, status: 'OPEN', origin: 'MANUAL_TRIGGER', ruleVersionId: 'version-1',
          },
          {
            id: 'occ-archive-completed', cycleId: 'cycle-archive', milestoneKey: 'completed', scheduleEntryKey: '',
            deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-09-03T00:00:00.000Z'),
            operativeDueDate: new Date('2026-09-03T00:00:00.000Z'), dateOverridden: false, status: 'COMPLETED', origin: 'RULE', ruleVersionId: 'version-1',
          },
          {
            id: 'occ-archive-history', cycleId: 'cycle-archive', milestoneKey: 'history', scheduleEntryKey: '',
            deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-07-03T00:00:00.000Z'),
            operativeDueDate: new Date('2026-07-03T00:00:00.000Z'), dateOverridden: false, status: 'OPEN', origin: 'RULE', ruleVersionId: 'version-1',
          },
        ],
      },
    ], reconciliationRule({ isActive: false, archivedAt: new Date('2026-08-18T00:00:00.000Z') }));

    const result = await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1', operation: 'ARCHIVE',
      today: '2026-08-18', horizonEnd: '2027-08-18', writeMode: 'APPLY', reconciliationRequestId: 'req-archive',
    }, dbMock as never);

    expect(result.counts).toMatchObject({ cancelled: 1, preserved: 3, created: 0, recalculated: 0 });
    expect(dbMock.serviceCycle.upsert).not.toHaveBeenCalled();
    expect(dbMock.deadlineOccurrence.upsert).not.toHaveBeenCalled();
    expect(dbMock.deadlineOccurrence.update).toHaveBeenCalledTimes(1);
    expect(dbMock.deadlineOccurrence.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'occ-archive-open' },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
  });

  it('does not cancel another rule during a rule-scoped publish cleanup', async () => {
    const dbMock = reconciliationDb([{
      id: 'cycle-other', tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-2',
      periodKey: 'OTHER', generationKey: 'rolling-v1', origin: 'RULE', occurrences: [{
        id: 'occ-other', cycleId: 'cycle-other', milestoneKey: 'other', scheduleEntryKey: '',
        deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-09-01T00:00:00.000Z'),
        operativeDueDate: new Date('2026-09-01T00:00:00.000Z'), dateOverridden: false, status: 'OPEN',
        origin: 'RULE', ruleVersionId: 'version-2',
      }],
    }]);

    await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1', operation: 'PUBLISH',
      today: '2026-08-18', horizonEnd: '2027-08-18', writeMode: 'APPLY', reconciliationRequestId: 'req-publish-scope',
    }, dbMock as never);

    expect(dbMock.deadlineOccurrence.update).not.toHaveBeenCalled();
  });

  it('does not cancel another rule during a rule-scoped archive cleanup', async () => {
    const dbMock = reconciliationDb([{
      id: 'cycle-other', tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-2',
      periodKey: 'OTHER', generationKey: 'rolling-v1', origin: 'RULE', occurrences: [{
        id: 'occ-other', cycleId: 'cycle-other', milestoneKey: 'other', scheduleEntryKey: '',
        deadlineType: 'STATUTORY', calculatedDueDate: new Date('2026-09-01T00:00:00.000Z'),
        operativeDueDate: new Date('2026-09-01T00:00:00.000Z'), dateOverridden: false, status: 'OPEN',
        origin: 'RULE', ruleVersionId: 'version-2',
      }],
    }], reconciliationRule({ isActive: false, archivedAt: new Date('2026-08-18T00:00:00.000Z') }));

    await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', ruleId: 'rule-1', operation: 'ARCHIVE',
      today: '2026-08-18', horizonEnd: '2027-08-18', writeMode: 'APPLY', reconciliationRequestId: 'req-archive-scope',
    }, dbMock as never);

    expect(dbMock.deadlineOccurrence.update).not.toHaveBeenCalled();
  });

  it('returns a structured permanent warning for production evaluator missing input', async () => {
    const dbMock = reconciliationDb([], reconciliationRule({
      currentVersion: {
        id: 'version-1', recurrence: { schemaVersion: 1, kind: 'ONE_TIME' },
        applicability: {
          schemaVersion: 1, kind: 'ALL',
          conditions: [{ kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_LIMITED' }],
        }, configHash: 'config-1', parameterDefinitions: [], milestoneTemplates: [],
      },
    }));

    const result = await reconcileClientServiceDeadlines({
      tenantId: 'tenant-1', clientServiceId: 'cs-1', today: '2026-08-18', horizonEnd: '2027-08-18',
      writeMode: 'APPLY', reconciliationRequestId: 'req-missing-input',
    }, dbMock as never);

    expect(result.warnings).toEqual([expect.objectContaining({
      code: 'MISSING_INPUT', ruleId: 'rule-1', permanent: true, missingFields: ['entityType'],
    })]);
  });
});
