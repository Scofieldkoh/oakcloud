import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateCondition } from '@/lib/form-utils';
import {
  filterAvailableChoiceOptions,
  getUnavailableChoiceOptionError,
} from '@/lib/forms/choice-validation';
import { buildSgAnnualReturnDeclarationFields } from '@/lib/form-templates/sg-annual-return-declaration';
import { fieldConditionRuleSchema } from '@/lib/validations/form-builder';

const PENDING = 'Not yet, but they will be sent within five months';
const fields = buildSgAnnualReturnDeclarationFields();
const circulation = fields.find((field) => field.key === 'exemption_check_fs_circulation')!;
const options = (circulation.options ?? []) as Array<{ label: string; value: string; condition?: unknown }>;
const offered = (answers: Record<string, unknown>) =>
  filterAvailableChoiceOptions(options, answers, undefined).map((option) => option.value);
const shown = (key: string, answers: Record<string, unknown>) =>
  evaluateCondition(fields.find((field) => field.key === key)!.condition, answers);

// Financial year ended 30 Jun 2026, so the five months end on 30 Nov 2026.
const base = {
  company_type: 'Private Company Limited by Shares',
  company_status: 'Active',
  financial_year_end: '2026-06-30',
};

describe('date condition operators', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 26, 12));
  });
  afterEach(() => vi.useRealTimers());

  const rule = (operator: string, extra: Record<string, unknown>) => ({ fieldKey: 'fye', operator, ...extra });

  it('compares a shifted date with another field, clamping to month end', () => {
    const answers = { fye: '2026-09-30', done: '2027-02-28' };
    const fiveMonths = { offsetMonths: 5, compareFieldKey: 'done' };
    expect(evaluateCondition(rule('date_on_or_after', fiveMonths), answers)).toBe(true);
    expect(evaluateCondition(rule('date_before', fiveMonths), answers)).toBe(false);
    expect(evaluateCondition(rule('date_before', fiveMonths), { ...answers, done: '2027-03-01' })).toBe(true);
  });

  it('compares with today and with a fixed date', () => {
    expect(evaluateCondition(rule('date_before', { offsetMonths: 5, value: 'today' }), { fye: '2026-06-25' })).toBe(true);
    expect(evaluateCondition(rule('date_on_or_after', { offsetMonths: 5, value: 'today' }), { fye: '2026-06-26' })).toBe(true);
    expect(evaluateCondition(rule('date_after', { value: '2026-01-01' }), { fye: '2026-06-30' })).toBe(true);
    expect(evaluateCondition(rule('date_after', { offsetDays: -1, value: '2026-06-30' }), { fye: '2026-06-30' })).toBe(false);
  });

  it('never matches when either date is missing or invalid', () => {
    for (const operator of ['date_before', 'date_on_or_before', 'date_after', 'date_on_or_after']) {
      expect(evaluateCondition(rule(operator, { compareFieldKey: 'done' }), { fye: '2026-06-30' })).toBe(false);
      expect(evaluateCondition(rule(operator, { value: 'today' }), { fye: 'not a date' })).toBe(false);
    }
  });

  it('requires a comparison target and keeps offsets to date operators', () => {
    expect(fieldConditionRuleSchema.safeParse(rule('date_before', {})).success).toBe(false);
    expect(fieldConditionRuleSchema.safeParse(rule('date_before', { value: 'soon' })).success).toBe(false);
    expect(fieldConditionRuleSchema.safeParse(rule('date_before', { value: 'today', offsetMonths: 5 })).success).toBe(true);
    expect(fieldConditionRuleSchema.safeParse(rule('equals', { value: 'x', offsetMonths: 5 })).success).toBe(false);
  });
});

describe('Annual Return circulation answers follow the five-month deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 26, 12));
  });
  afterEach(() => vi.useRealTimers());

  it('does not offer "Not yet" when the statements will be ready after the five months', () => {
    const answers = { ...base, fs_ready: 'No', date_fs_ds: '2026-12-04' };
    expect(offered(answers)).toEqual(['No']);
    expect(shown('fs_circulation_late_completion_msg', answers)).toBe(true);
  });

  it('offers "Not yet" when the statements will be ready within the five months', () => {
    const answers = { ...base, fs_ready: 'No', date_fs_ds: '2026-11-30' };
    expect(offered(answers)).toEqual([PENDING, 'No']);
    expect(shown('fs_circulation_late_completion_msg', answers)).toBe(false);
  });

  it('offers "Yes" only when the statements are ready', () => {
    expect(offered({ ...base, fs_ready: 'Yes' })).toEqual(['Yes', PENDING, 'No']);
    expect(offered({ ...base, fs_ready: 'No' })).not.toContain('Yes');
  });

  it('does not offer "Not yet" once the five months have passed', () => {
    const answers = { ...base, financial_year_end: '2026-06-25', fs_ready: 'Yes' };
    expect(offered(answers)).toEqual(['Yes', 'No']);
    expect(shown('fs_circulation_period_ended_msg', answers)).toBe(true);
    expect(shown('fs_circulation_period_ended_msg', { ...answers, exemption_check_fs_circulation: 'Yes' })).toBe(false);
  });

  it('keeps a stale "Not yet" answer visible and rejects it', () => {
    const answers = { ...base, fs_ready: 'No', date_fs_ds: '2026-12-04', exemption_check_fs_circulation: PENDING };
    expect(filterAvailableChoiceOptions(options, answers, PENDING).map((option) => option.value)).toContain(PENDING);
    const field = { type: circulation.type, key: circulation.key!, label: circulation.label, options: circulation.options };
    expect(getUnavailableChoiceOptionError(field, PENDING, answers)).toMatch(/is not available/);
    expect(getUnavailableChoiceOptionError(field, 'No', answers)).toBeNull();
  });
});
