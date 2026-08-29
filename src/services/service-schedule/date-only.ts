import { ValidationError } from '@/lib/errors';
import type { DateOnly } from './types';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_YEAR = 1;
const MAX_YEAR = 9999;
const MILLIS_PER_DAY = 86_400_000;

function invalidDateOnly(value: unknown): ValidationError {
  return new ValidationError('Expected a real Gregorian date in YYYY-MM-DD format', { value });
}

function createUtcDate(year: number, monthIndex: number, day: number): Date {
  const result = new Date(Date.UTC(year, monthIndex, day));
  // Date.UTC maps years 0-99 to 1900-1999. Restore the requested Gregorian
  // year so all arithmetic remains year-accurate and UTC-backed.
  if (year >= 0 && year <= 99) result.setUTCFullYear(year);
  return result;
}

function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError(`${name} must be a safe integer`, { [name]: value });
  }
}

function parseComponents(value: DateOnly): { year: number; month: number; day: number } {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) throw invalidDateOnly(value);
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31) {
    throw invalidDateOnly(value);
  }

  const candidate = createUtcDate(year, month - 1, day);
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw invalidDateOnly(value);
  }
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return createUtcDate(year, month, 0).getUTCDate();
}

/** Parse a validated DateOnly at UTC midnight. */
export function parseDateOnly(value: DateOnly): Date {
  const { year, month, day } = parseComponents(value);
  return createUtcDate(year, month - 1, day);
}

/** Format a Date using UTC getters; local timezone offsets cannot change it. */
export function formatDateOnly(value: Date): DateOnly {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw invalidDateOnly(value);
  }
  const year = value.getUTCFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) throw invalidDateOnly(value);
  const month = value.getUTCMonth() + 1;
  const day = value.getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as DateOnly;
}

/** Return the current civil date in Singapore using Intl date parts. */
export function currentDateInSingapore(now: Date = new Date()): DateOnly {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ValidationError('Current date must be valid');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return formatDateOnly(parseDateOnly(`${values.year}-${values.month}-${values.day}` as DateOnly));
}

export function addCalendarDays(value: DateOnly, amount: number): DateOnly {
  assertInteger(amount, 'amount');
  const result = parseDateOnly(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return formatDateOnly(result);
}

export function addMonthsClamped(value: DateOnly, amount: number): DateOnly {
  assertInteger(amount, 'amount');
  const { year, month, day } = parseComponents(value);
  const monthIndex = (year * 12) + (month - 1) + amount;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  if (targetYear < MIN_YEAR || targetYear > MAX_YEAR) {
    throw new ValidationError('Month arithmetic produced a date outside the supported range', { value, amount });
  }
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex + 1));
  return formatDateOnly(createUtcDate(targetYear, targetMonthIndex, targetDay));
}

/**
 * Rebuild a validated date with the same month/day in a different year,
 * clamping the day to the target year's calendar (leap-safe).
 */
export function dateOnlyWithYearClamped(value: DateOnly, year: number): DateOnly {
  assertInteger(year, 'year');
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new ValidationError('Year is outside the supported range', { value, year });
  }
  const { month, day } = parseComponents(value);
  const targetDay = Math.min(day, daysInMonth(year, month));
  return formatDateOnly(createUtcDate(year, month - 1, targetDay));
}

/**
 * Align an annual company landmark (month/day) to the first anniversary on
 * or after the period start. The source year is a data artifact; annual
 * rules treat the stored month/day as a recurring landmark.
 */
export function alignAnnualLandmarkToPeriod(
  sourceDate: DateOnly,
  periodStart: DateOnly,
): DateOnly {
  const candidate = dateOnlyWithYearClamped(sourceDate, Number(periodStart.slice(0, 4)));
  return compareDateOnly(candidate, periodStart) < 0
    ? addMonthsClamped(candidate, 12)
    : candidate;
}

export function dayOfMonth(periodMonth: DateOnly, day: number): DateOnly {
  assertInteger(day, 'day');
  if (day < 1 || day > 31) {
    throw new ValidationError('Day of month must be between 1 and 31', { day });
  }
  const { year, month } = parseComponents(periodMonth);
  return formatDateOnly(createUtcDate(year, month - 1, Math.min(day, daysInMonth(year, month))));
}

export function compareDateOnly(left: DateOnly, right: DateOnly): number {
  const leftTime = parseDateOnly(left).getTime();
  const rightTime = parseDateOnly(right).getTime();
  return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0;
}

export { MILLIS_PER_DAY };
