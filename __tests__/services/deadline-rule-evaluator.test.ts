import { describe, expect, it } from 'vitest';
import { DeadlineApiError, ErrorCodes, ValidationError } from '@/lib/errors';
import {
  evaluateApplicability,
  evaluateDeadlineRule,
  type RuleDateExpression,
  type ApplicabilityResult,
  type DeadlineRuleEvaluationInput,
} from '@/services/service-schedule';
import type {
  ApplicabilityDefinition,
  BusinessCalendarSnapshot,
  DateOnly,
  MilestoneDefinition,
  ScheduleEntry,
} from '@/services/service-schedule';

const calendar: BusinessCalendarSnapshot = {
  id: 'sg-calendar',
  timeZone: 'Asia/Singapore',
  revision: 1,
  holidays: new Set<DateOnly>(['2026-08-10', '2026-08-31']),
  weekendDays: new Set([0, 6]),
};

const applicable: ApplicabilityDefinition = {
  schemaVersion: 1,
  kind: 'ALL',
  conditions: [],
};

function milestone(
  key: string,
  expression: RuleDateExpression | Partial<MilestoneDefinition>,
  overrides: Partial<MilestoneDefinition> = {},
): MilestoneDefinition {
  const supplied = typeof expression === 'object' && expression !== null && 'expression' in expression
    ? expression as Partial<MilestoneDefinition>
    : { expression };
  return {
    key,
    name: key,
    description: null,
    type: 'CLIENT',
    generationMode: 'ONCE_PER_CYCLE',
    expression: supplied.expression as MilestoneDefinition['expression'],
    businessDayAdjustment: 'NONE',
    displayOrder: 0,
    isActive: true,
    ...supplied,
    ...overrides,
  } as MilestoneDefinition;
}

function entry(
  key: string,
  expression: ScheduleEntry['expression'],
  businessDayAdjustment: ScheduleEntry['businessDayAdjustment'] = 'NONE',
): ScheduleEntry {
  return { key, label: key, expression, businessDayAdjustment };
}

function input(overrides: Partial<DeadlineRuleEvaluationInput> = {}): DeadlineRuleEvaluationInput {
  return {
    ruleId: 'rule-1',
    ruleVersionId: 'version-1',
    recurrence: { schemaVersion: 1, kind: 'MONTHLY', interval: 1 },
    applicability: applicable,
    parameters: {},
    scheduleEntries: [],
    milestones: [milestone('due', { kind: 'DAY_OF_MONTH', day: 15 })],
    company: {},
    period: { key: '2026-08', start: '2026-08-01', end: '2026-08-31' },
    calendar,
    ...overrides,
  };
}

function missingInput(error: unknown): boolean {
  return error instanceof DeadlineApiError && error.code === ErrorCodes.MISSING_RULE_INPUT;
}

function expectMissingInput(call: () => unknown): void {
  try {
    call();
    throw new Error('Expected a typed missing-input error');
  } catch (error) {
    expect(missingInput(error)).toBe(true);
  }
}

describe('evaluateApplicability', () => {
  it('marks XBRL inapplicable to an exempt private company', () => {
    expect(evaluateApplicability({
      kind: 'FIELD_NOT_IN', field: 'entityType', values: ['EXEMPTED_PRIVATE_LIMITED'],
    }, { entityType: 'EXEMPTED_PRIVATE_LIMITED' })).toEqual({
      state: 'NOT_APPLICABLE',
      reason: expect.stringContaining('entityType'),
    });
  });

  it('supports every field-compatible predicate and ALL/ANY semantics', () => {
    const definition: ApplicabilityDefinition = {
      schemaVersion: 1,
      kind: 'ALL',
      conditions: [
        { kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_COMPANY' },
        { kind: 'FIELD_NOT_EQUALS', field: 'status', value: 'STRUCK_OFF' },
        { kind: 'FIELD_IN', field: 'currentOfficerCount', values: [2, 3] },
        { kind: 'FIELD_NOT_IN', field: 'currentShareholderCount', values: [0] },
        { kind: 'FIELD_TRUE', field: 'isGstRegistered' },
        { kind: 'FIELD_FALSE', field: 'isRegisteredCharity' },
        { kind: 'FIELD_PRESENT', field: 'nextAgmDueDate' },
        { kind: 'FIELD_COMPARE', field: 'currentOfficerCount', operator: 'GTE', value: 2 },
        { kind: 'FIELD_COMPARE', field: 'nextAgmDueDate', operator: 'GT', value: '2026-01-01' },
        {
          kind: 'ANY',
          conditions: [
            { kind: 'FIELD_EQUALS', field: 'primarySsicCode', value: '62010' },
            { kind: 'FIELD_EQUALS', field: 'secondarySsicCode', value: '62010' },
          ],
        },
      ],
    };

    expect(evaluateApplicability(definition, {
      entityType: 'PRIVATE_COMPANY',
      status: 'LIVE',
      currentOfficerCount: 2,
      currentShareholderCount: 1,
      isGstRegistered: true,
      isRegisteredCharity: false,
      nextAgmDueDate: '2027-05-31',
      primarySsicCode: '62010',
    })).toEqual({ state: 'APPLICABLE', reason: null });
  });

  it('propagates missing required values deterministically while presence predicates evaluate absence', () => {
    const result = evaluateApplicability({
      schemaVersion: 1,
      kind: 'ALL',
      conditions: [
        { kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_COMPANY' },
        { kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_COMPANY' },
      ],
    }, {});

    expect(result).toEqual({
      state: 'MISSING_INPUT',
      reason: expect.stringContaining('entityType'),
      missingFields: ['entityType'],
    });
    expect(evaluateApplicability({ kind: 'FIELD_MISSING', field: 'accountsDueDate' }, {}))
      .toEqual({ state: 'APPLICABLE', reason: null });
    expect(evaluateApplicability({ kind: 'FIELD_PRESENT', field: 'accountsDueDate' }, {}))
      .toMatchObject({ state: 'NOT_APPLICABLE' });
  });

  it('uses three-state ANY semantics when no branch is applicable', () => {
    const result = evaluateApplicability({
      schemaVersion: 1,
      kind: 'ANY',
      conditions: [
        { kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_COMPANY' },
        { kind: 'FIELD_EQUALS', field: 'status', value: 'LIVE' },
      ],
    }, { entityType: 'PUBLIC_COMPANY' });

    expect(result.state).toBe('MISSING_INPUT');
    expect((result as Extract<ApplicabilityResult, { state: 'MISSING_INPUT' }>).missingFields)
      .toEqual(['status']);
  });

  it('defensively rejects typed definitions beyond depth and leaf bounds', () => {
    let nested: Record<string, unknown> = { kind: 'ALL', conditions: [] };
    for (let index = 0; index < 6; index += 1) nested = { kind: 'ALL', conditions: [nested] };
    expect(() => evaluateApplicability(nested as never, {})).toThrow(ValidationError);

    expect(() => evaluateApplicability({
      schemaVersion: 1,
      kind: 'ALL',
      conditions: Array.from({ length: 51 }, () => ({ kind: 'FIELD_PRESENT', field: 'entityType' })),
    } as never, {})).toThrow(ValidationError);
  });
});

describe('evaluateDeadlineRule', () => {
  it('uses a stored AGM due date before its fallback expression', () => {
    const result = evaluateDeadlineRule(input({
      company: { nextAgmDueDate: '2027-05-31', financialYearEnd: '2026-12-31' },
      milestones: [milestone('agm-due', {
        kind: 'RELATIVE_TO_SOURCE',
        source: { kind: 'COMPANY_FIELD', field: 'nextAgmDueDate' },
        offset: 0,
        unit: 'CALENDAR_DAY',
      })],
    }));

    expect(result.occurrences[0]).toMatchObject({
      calculatedDueDate: '2027-05-31',
      explanation: expect.arrayContaining([expect.stringContaining('Company.nextAgmDueDate')]),
    });
  });

  it.each(['PAYROLL', 'ACCOUNTING'])('evaluates four repeatable entries for %s', (familyCode) => {
    const scheduleEntries = [1, 8, 15, 22].map((day) => entry(`run-${day}`, {
      kind: 'DAY_OF_MONTH', day,
    }));
    const result = evaluateDeadlineRule(input({
      ruleId: familyCode,
      scheduleEntries,
      milestones: [milestone('service-run', {
        generationMode: 'ONCE_PER_SCHEDULE_ENTRY',
        expression: {
          kind: 'RELATIVE_TO_SOURCE',
          source: { kind: 'SCHEDULE_ENTRY', key: 'run-1' },
          offset: 0,
          unit: 'CALENDAR_DAY',
        },
      })],
    }));

    expect(result.occurrences.filter((item) => item.milestoneKey === 'service-run')).toHaveLength(4);
    expect(Object.keys(result.byKey)).toEqual([
      'service-run:run-1', 'service-run:run-8', 'service-run:run-15', 'service-run:run-22',
    ]);
  });

  it('evaluates a client deadline three business days before a schedule anchor', () => {
    const result = evaluateDeadlineRule(input({
      scheduleEntries: [entry('salary-payout', { kind: 'DAY_OF_MONTH', day: 28 })],
      milestones: [milestone('funding-deadline', {
        generationMode: 'ONCE_PER_SCHEDULE_ENTRY',
        expression: {
          kind: 'RELATIVE_TO_SOURCE',
          source: { kind: 'SCHEDULE_ENTRY', key: 'salary-payout' },
          offset: -3,
          unit: 'BUSINESS_DAY',
        },
      })],
    }));

    expect(result.byKey['funding-deadline:salary-payout']?.calculatedDueDate).toBe('2026-08-25');
  });

  it('evaluates schedule-entry dependencies before milestone expressions', () => {
    const result = evaluateDeadlineRule(input({
      scheduleEntries: [
        entry('salary-payout', { kind: 'DAY_OF_MONTH', day: 28 }),
        entry('funding-anchor', {
          kind: 'RELATIVE_TO_SOURCE',
          source: { kind: 'SCHEDULE_ENTRY', key: 'salary-payout' },
          offset: -3,
          unit: 'CALENDAR_DAY',
        }),
      ],
      milestones: [milestone('funding-deadline', {
        generationMode: 'ONCE_PER_SCHEDULE_ENTRY',
        expression: {
          kind: 'RELATIVE_TO_SOURCE',
          source: { kind: 'SCHEDULE_ENTRY', key: 'funding-anchor' },
          offset: 0,
          unit: 'CALENDAR_DAY',
        },
      })],
    }));

    expect(result.byKey['funding-deadline:funding-anchor']?.calculatedDueDate).toBe('2026-08-25');
  });

  it('applies offsets before the final business-day adjustment', () => {
    const result = evaluateDeadlineRule(input({
      scheduleEntries: [entry('weekend-anchor', { kind: 'DAY_OF_MONTH', day: 8 })],
      milestones: [milestone('adjusted', {
        generationMode: 'ONCE_PER_SCHEDULE_ENTRY',
        businessDayAdjustment: 'NEXT',
        expression: {
          kind: 'RELATIVE_TO_SOURCE',
          source: { kind: 'SCHEDULE_ENTRY', key: 'weekend-anchor' },
          offset: 0,
          unit: 'CALENDAR_DAY',
        },
      })],
    }));

    expect(result.byKey['adjusted:weekend-anchor']?.calculatedDueDate).toBe('2026-08-11');
  });

  it('supports all Task 2 date operations with deterministic cycle defaults', () => {
    const result = evaluateDeadlineRule(input({
      period: { key: '2026-01', start: '2026-01-31', end: '2026-02-28' },
      milestones: [
        milestone('months', { kind: 'ADD_MONTHS', amount: 1 }),
        milestone('calendar', { kind: 'ADD_CALENDAR_DAYS', amount: 2 }),
        milestone('business', { kind: 'ADD_BUSINESS_DAYS', amount: 1 }),
        milestone('added', { kind: 'ADD', offset: -1, unit: 'CALENDAR_DAY' }),
        milestone('adjust', { kind: 'ADJUST_BUSINESS_DAY', adjustment: 'NEXT' }),
      ] as never,
    }));

    expect(result.byKey['months:']?.calculatedDueDate).toBe('2026-02-28');
    expect(result.byKey['calendar:']?.calculatedDueDate).toBe('2026-02-02');
    expect(result.byKey['business:']?.calculatedDueDate).toBe('2026-02-02');
    expect(result.byKey['added:']?.calculatedDueDate).toBe('2026-01-30');
    expect(result.byKey['adjust:']?.calculatedDueDate).toBe('2026-02-02');
  });

  it('rejects circular, missing, ambiguous, self, and duplicate dependencies deterministically', () => {
    expect(() => evaluateDeadlineRule(input({
      milestones: [
        milestone('a', { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'MILESTONE', key: 'b' }, offset: 0, unit: 'CALENDAR_DAY' }),
        milestone('b', { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'MILESTONE', key: 'a' }, offset: 0, unit: 'CALENDAR_DAY' }),
      ] as never,
    }))).toThrow(/circular/i);

    expect(() => evaluateDeadlineRule(input({
      milestones: [milestone('a', { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'SCHEDULE_ENTRY', key: 'missing' }, offset: 0, unit: 'CALENDAR_DAY' })] as never,
    }))).toThrow(/missing/i);

    expect(() => evaluateDeadlineRule(input({
      milestones: [
        milestone('cycle', {
          expression: {
            kind: 'RELATIVE_TO_SOURCE',
            source: { kind: 'MILESTONE', key: 'per-entry' },
            offset: 0,
            unit: 'CALENDAR_DAY',
          },
        }),
        milestone('per-entry', {
          generationMode: 'ONCE_PER_SCHEDULE_ENTRY',
          expression: { kind: 'DAY_OF_MONTH', day: 1 },
        }),
      ] as never,
    }))).toThrow(/ambiguous/i);

    expect(() => evaluateDeadlineRule(input({
      milestones: [milestone('self', { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'MILESTONE', key: 'self' }, offset: 0, unit: 'CALENDAR_DAY' })] as never,
    }))).toThrow(/self|circular/i);

    expect(() => evaluateDeadlineRule(input({
      milestones: [
        milestone('duplicate', { kind: 'DAY_OF_MONTH', day: 1 }),
        milestone('duplicate', { kind: 'DAY_OF_MONTH', day: 2 }),
      ],
    }))).toThrow(/duplicate/i);
  });

  it('returns no occurrences for inapplicable or missing-applicability rules', () => {
    const notApplicable = evaluateDeadlineRule(input({
      applicability: {
        schemaVersion: 1,
        kind: 'ALL',
        conditions: [{ kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_COMPANY' }],
      },
      company: { entityType: 'PUBLIC_COMPANY' },
    }));
    expect(notApplicable.applicability.state).toBe('NOT_APPLICABLE');
    expect(notApplicable.occurrences).toEqual([]);

    const missing = evaluateDeadlineRule(input({
      applicability: {
        schemaVersion: 1,
        kind: 'ALL',
        conditions: [{ kind: 'FIELD_EQUALS', field: 'entityType', value: 'PRIVATE_COMPANY' }],
      },
    }));
    expect(missing.applicability.state).toBe('MISSING_INPUT');
    expect(missing.occurrences).toEqual([]);
  });

  it('uses typed missing-input errors for required date sources', () => {
    expect(() => evaluateDeadlineRule(input({
      parameters: {},
      milestones: [milestone('parameter', {
        kind: 'RELATIVE_TO_SOURCE',
        source: { kind: 'PARAMETER', key: 'daysAfter' },
        offset: 0,
        unit: 'CALENDAR_DAY',
      })],
    })));

    expectMissingInput(() => evaluateDeadlineRule(input({
      scheduleEntries: [],
      milestones: [milestone('schedule', {
        kind: 'RELATIVE_TO_SOURCE',
        source: { kind: 'SCHEDULE_ENTRY', key: 'missing' },
        offset: 0,
        unit: 'CALENDAR_DAY',
      })],
    })));
  });

  it('rejects malformed duplicate schedules and unsupported source types with typed errors', () => {
    expect(() => evaluateDeadlineRule(input({
      scheduleEntries: [
        entry('same', { kind: 'DAY_OF_MONTH', day: 1 }),
        entry('same', { kind: 'DAY_OF_MONTH', day: 2 }),
      ],
    }))).toThrow(DeadlineApiError);

    expect(() => evaluateDeadlineRule(input({
      milestones: [milestone('bad', {
        expression: { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'UNKNOWN' } as never, offset: 0, unit: 'CALENDAR_DAY' },
      })],
    }))).toThrow(ValidationError);
  });

  it('returns a JSON-safe consumed-input snapshot and a stable relevant-input hash', () => {
    const first = evaluateDeadlineRule(input({
      parameters: { answer: '2026-08-15', unused: 'ignored' },
      scheduleEntries: [entry('anchor', { kind: 'DAY_OF_MONTH', day: 15 })],
      milestones: [milestone('due', {
        expression: { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'PARAMETER', key: 'answer' }, offset: 0, unit: 'CALENDAR_DAY' },
      })],
    }));
    const reordered = evaluateDeadlineRule({
      ...input({
        parameters: { unused: 'ignored', answer: '2026-08-15' },
        scheduleEntries: [entry('anchor', { kind: 'DAY_OF_MONTH', day: 15 })],
        milestones: [milestone('due', {
          expression: { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'PARAMETER', key: 'answer' }, offset: 0, unit: 'CALENDAR_DAY' },
        })],
      }),
    });

    expect(first.evaluationHash).toBe(reordered.evaluationHash);
    expect(JSON.stringify(first.sourceSnapshot)).not.toContain('Set');
    expect(first.sourceSnapshot).toEqual(expect.objectContaining({
      ruleId: 'rule-1',
      ruleVersionId: 'version-1',
      calendar: expect.objectContaining({ id: 'sg-calendar', revision: 1 }),
      company: {},
      parameters: expect.objectContaining({ answer: '2026-08-15' }),
    }));

    const changed = evaluateDeadlineRule(input({
      parameters: { answer: '2026-08-16' },
      scheduleEntries: [entry('anchor', { kind: 'DAY_OF_MONTH', day: 15 })],
      milestones: [milestone('due', {
        expression: { kind: 'RELATIVE_TO_SOURCE', source: { kind: 'PARAMETER', key: 'answer' }, offset: 0, unit: 'CALENDAR_DAY' },
      })],
    }));
    expect(changed.evaluationHash).not.toBe(first.evaluationHash);
  });
});
