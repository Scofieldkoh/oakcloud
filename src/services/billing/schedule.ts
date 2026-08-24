import { ValidationError } from '@/lib/errors';
import { billingScheduleConfigSchema } from '@/lib/validations/billing';
import {
  addBusinessDays,
  addCalendarDays,
  addMonthsClamped,
  adjustBusinessDay,
  businessDayFromEnd,
  businessDayFromStart,
  compareDateOnly,
  dayOfMonth,
  formatDateOnly,
  parseDateOnly,
} from '@/services/service-schedule';
import type { DateOnly, DateSource, ScheduleEntry } from '@/services/service-schedule';
import type {
  BillingCadence,
  BillingScheduleConfigV1,
  BillingScheduleConversion,
  BillingScheduleEvaluationInput,
  EvaluatedBillingOccurrence,
  LegacyBillingScheduleInput,
} from './types';

const CADENCE_INTERVALS: Record<Exclude<BillingScheduleConfigV1['cadence'], 'ONE_TIME' | 'CUSTOM'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUALLY: 6,
  ANNUALLY: 12,
};

function asDateOnly(value: Date | string): DateOnly {
  if (value instanceof Date) return formatDateOnly(value);
  parseDateOnly(value as DateOnly);
  return value as DateOnly;
}

type CanonicalBillingScheduleInput = {
  billingFrequency: BillingCadence | string;
  billingStartDate?: DateOnly | Date | string | null;
  customFrequencyLabel?: string | null;
  scheduleConfig?: unknown;
};

/**
 * Resolve a fee's structured schedule once, preserving legacy compatibility
 * fields as the canonical cadence/start-date contract. Callers that persist a
 * CONFIGURED fee must request materialization so empty schedules cannot enter
 * the rolling evaluator.
 */
export function canonicalizeBillingSchedule(
  input: CanonicalBillingScheduleInput,
  options: { requireMaterializable?: boolean } = {},
): BillingScheduleConfigV1 | null {
  const legacyStartDate = input.billingStartDate === undefined
    ? undefined
    : input.billingStartDate === null
      ? null
      : asDateOnly(input.billingStartDate);
  let config: BillingScheduleConfigV1 | null;

  if (input.scheduleConfig !== undefined && input.scheduleConfig !== null) {
    config = billingScheduleConfigSchema.parse(input.scheduleConfig) as BillingScheduleConfigV1;
    if (config.cadence !== input.billingFrequency) {
      throw new ValidationError('Structured billing cadence must match billing frequency');
    }
    if (legacyStartDate !== undefined && legacyStartDate !== config.startDate) {
      throw new ValidationError('Structured billing start date must match billing start date');
    }
  } else {
    config = convertLegacyBillingSchedule({
      billingFrequency: input.billingFrequency as never,
      billingStartDate: input.billingStartDate ?? null,
      customFrequencyLabel: input.customFrequencyLabel ?? null,
    }).config;
  }

  if (options.requireMaterializable && (!config?.startDate || config.scheduleEntries.length === 0)) {
    throw new ValidationError('Configured billing requires a valid start date and at least one schedule entry');
  }
  return config;
}

function assertNonEmpty(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
}

function intervalMonths(config: BillingScheduleConfigV1): number {
  if (config.cadence === 'ONE_TIME') return 0;
  if (config.cadence === 'CUSTOM') {
    if (!config.customInterval) throw new ValidationError('A custom billing schedule requires a structured month interval');
    return config.customInterval.count;
  }
  return CADENCE_INTERVALS[config.cadence];
}

function monthStart(value: DateOnly): DateOnly {
  return `${value.slice(0, 7)}-01` as DateOnly;
}

function periodKey(start: DateOnly, cadence: BillingScheduleConfigV1['cadence'], interval: number, oneTimeStart?: DateOnly): string {
  const year = start.slice(0, 4);
  const month = Number(start.slice(5, 7));
  switch (cadence) {
    case 'MONTHLY': return start.slice(0, 7);
    case 'QUARTERLY': return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case 'SEMI_ANNUALLY': return `${year}-H${month <= 6 ? 1 : 2}`;
    case 'ANNUALLY': return year;
    case 'CUSTOM': return `${start.slice(0, 7)}+${interval}M`;
    case 'ONE_TIME': return `ONE_TIME:${oneTimeStart ?? start}`;
    default: throw new ValidationError('Unsupported billing cadence');
  }
}

function sourceDate(
  source: DateSource,
  periodStart: DateOnly,
  periodEnd: DateOnly,
): DateOnly {
  switch (source.kind) {
    case 'CYCLE_START': return periodStart;
    case 'CYCLE_END': return periodEnd;
    // CURRENT_SCHEDULE_ENTRY is only meaningful to a dependent milestone in
    // the shared evaluator. For a fee entry it is the cycle anchor.
    case 'CURRENT_SCHEDULE_ENTRY': return periodStart;
    default: throw new ValidationError(`Billing schedule source ${source.kind} is not available in a schedule entry`);
  }
}

function resolveEntryDate(
  entry: ScheduleEntry,
  periodStart: DateOnly,
  periodEnd: DateOnly,
  calendar: BillingScheduleEvaluationInput['calendar'],
): { calculated: DateOnly; operative: DateOnly } {
  const expression = entry.expression;
  let calculated: DateOnly;
  switch (expression.kind) {
    case 'DAY_OF_MONTH':
      calculated = dayOfMonth(periodStart, expression.day);
      break;
    case 'BUSINESS_DAY_FROM_START':
      calculated = businessDayFromStart(periodStart, periodEnd, expression.ordinal, calendar);
      break;
    case 'BUSINESS_DAY_FROM_END':
      calculated = businessDayFromEnd(periodStart, periodEnd, expression.ordinal, calendar);
      break;
    case 'RELATIVE_TO_SOURCE': {
      const source = sourceDate(expression.source, periodStart, periodEnd);
      if (typeof expression.offset !== 'number') {
        throw new ValidationError('Billing schedule integer parameters require a resolved value');
      }
      calculated = expression.unit === 'BUSINESS_DAY'
        ? addBusinessDays(source, expression.offset, calendar)
        : addCalendarDays(source, expression.offset);
      break;
    }
    default: throw new ValidationError('Unsupported billing schedule expression');
  }
  return {
    calculated,
    operative: adjustBusinessDay(calculated, entry.businessDayAdjustment, calendar),
  };
}

function monthDifference(from: DateOnly, to: DateOnly): number {
  return ((Number(to.slice(0, 4)) * 12) + Number(to.slice(5, 7)))
    - ((Number(from.slice(0, 4)) * 12) + Number(from.slice(5, 7)));
}

/** Convert a legacy fee-line frequency without inventing missing dates. */
export function convertLegacyBillingSchedule(input: LegacyBillingScheduleInput): BillingScheduleConversion {
  const frequency = input.billingFrequency;
  if (!['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'CUSTOM'].includes(frequency)) {
    return { config: null, issueType: 'INVALID_BILLING_FREQUENCY' };
  }
  if (frequency === 'CUSTOM') return { config: null, issueType: 'INVALID_CUSTOM_SCHEDULE' };

  const startDate = input.billingStartDate === null ? null : asDateOnly(input.billingStartDate);
  const count = frequency === 'ONE_TIME' ? null : CADENCE_INTERVALS[frequency];
  const scheduleEntries: ScheduleEntry[] = startDate === null ? [] : [{
    key: 'default',
    label: 'Billing date',
    expression: { kind: 'DAY_OF_MONTH', day: Number(startDate.slice(8, 10)) },
    businessDayAdjustment: 'NONE',
  }];
  return {
    config: {
      schemaVersion: 1,
      cadence: frequency,
      startDate,
      customInterval: count === null ? null : { unit: 'MONTH', count },
      scheduleEntries,
    },
    issueType: startDate === null ? 'MISSING_START_DATE' : null,
  };
}

/** Evaluate one fee-line schedule with the shared date-only/business-day engine. */
export function evaluateBillingSchedule(input: BillingScheduleEvaluationInput): EvaluatedBillingOccurrence[] {
  const config = billingScheduleConfigSchema.parse(input.config) as BillingScheduleConfigV1;
  const from = asDateOnly(input.from);
  const to = asDateOnly(input.to);
  if (compareDateOnly(from, to) > 0) throw new ValidationError('Billing evaluation range must not end before it starts');
  assertNonEmpty(input.feeLine.id, 'feeLine.id');
  assertNonEmpty(input.feeLine.amount, 'feeLine.amount');
  assertNonEmpty(input.feeLine.currency, 'feeLine.currency');
  assertNonEmpty(input.generationKey, 'generationKey');
  if (!config.startDate || config.scheduleEntries.length === 0) return [];

  const interval = intervalMonths(config);
  const sortedEntries = [...config.scheduleEntries].sort((left, right) => left.key.localeCompare(right.key));
  // A one-time schedule may still contain multiple stable entries.  Each
  // entry is materialized once for the one-time period; the schedule-entry
  // key is part of the occurrence identity and must not be silently dropped.
  const entries = sortedEntries;
  if (entries.length === 0) return [];

  const startMonth = monthStart(config.startDate);
  const cadenceInterval = Math.max(interval, 1);
  const firstOffset = config.cadence === 'ONE_TIME'
    ? 0
    : Math.max(0, Math.floor(monthDifference(startMonth, monthStart(from)) / cadenceInterval) - 1);
  let cursor = addMonthsClamped(startMonth, firstOffset * Math.max(interval, 1));
  const periodsThroughEnd = Math.floor(monthDifference(startMonth, monthStart(to)) / cadenceInterval);
  const lastCursor = addMonthsClamped(
    startMonth,
    Math.max(0, periodsThroughEnd + 1) * cadenceInterval,
  );
  const occurrences: EvaluatedBillingOccurrence[] = [];
  const maxPeriods = 10_000;
  for (let index = 0; index < maxPeriods && compareDateOnly(cursor, lastCursor) <= 0; index += 1) {
    const nextStart = config.cadence === 'ONE_TIME' ? addMonthsClamped(cursor, 1) : addMonthsClamped(cursor, interval);
    const cycleEnd = addCalendarDays(nextStart, -1);
    const billingPeriodKey = periodKey(cursor, config.cadence, interval, config.startDate);
    for (const entry of entries) {
      const resolvedDate = resolveEntryDate(entry, cursor, cycleEnd, input.calendar);
      const { calculated: calculatedExpectedDate, operative: operativeExpectedDate } = resolvedDate;
      if (compareDateOnly(calculatedExpectedDate, config.startDate) < 0
        || compareDateOnly(operativeExpectedDate, config.startDate) < 0) continue;
      if (compareDateOnly(operativeExpectedDate, from) < 0 || compareDateOnly(operativeExpectedDate, to) > 0) continue;
      occurrences.push({
        feeLineId: input.feeLine.id,
        billingPeriodKey,
        scheduleEntryKey: entry.key,
        generationKey: input.generationKey,
        calculatedExpectedDate,
        operativeExpectedDate,
        amount: input.feeLine.amount,
        currency: input.feeLine.currency,
        periodStart: cursor,
        periodEnd: cycleEnd,
      });
    }
    if (config.cadence === 'ONE_TIME') break;
    cursor = nextStart;
  }
  return occurrences;
}
