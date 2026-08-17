import { ValidationError } from '@/lib/errors';
import { addCalendarDays, compareDateOnly, parseDateOnly } from './date-only';
import type { BusinessCalendarSnapshot, BusinessDayAdjustment, DateOnly } from './types';

const MAX_PERIOD_DAYS = 3660;
const MAX_SEARCH_DAYS = 100_000;

function validateCalendar(calendar: BusinessCalendarSnapshot): void {
  if (!calendar || typeof calendar !== 'object') {
    throw new ValidationError('A business calendar snapshot is required');
  }
  if (typeof calendar.id !== 'string' || calendar.id.trim().length === 0) {
    throw new ValidationError('Business calendar id is required');
  }
  if (typeof calendar.timeZone !== 'string' || calendar.timeZone.trim().length === 0) {
    throw new ValidationError('Business calendar time zone is required');
  }
  if (!Number.isSafeInteger(calendar.revision) || calendar.revision < 1) {
    throw new ValidationError('Business calendar revision must be a positive integer');
  }
  if (!calendar.weekendDays || typeof calendar.weekendDays.has !== 'function' || typeof calendar.weekendDays[Symbol.iterator] !== 'function') {
    throw new ValidationError('Business calendar weekend days must be a Set');
  }
  const weekendDays = [...calendar.weekendDays];
  if (weekendDays.length < 1 || weekendDays.length > 6) {
    throw new ValidationError('Business calendar must define between 1 and 6 weekend days');
  }
  if (weekendDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ValidationError('Business calendar weekend days must be integers from 0 through 6');
  }
  if (!calendar.holidays || typeof calendar.holidays.has !== 'function' || typeof calendar.holidays[Symbol.iterator] !== 'function') {
    throw new ValidationError('Business calendar holidays must be a Set');
  }
  for (const holiday of calendar.holidays) parseDateOnly(holiday);
}

function assertDateRange(periodStart: DateOnly, periodEnd: DateOnly): { start: Date; end: Date } {
  const start = parseDateOnly(periodStart);
  const end = parseDateOnly(periodEnd);
  if (compareDateOnly(periodStart, periodEnd) > 0) {
    throw new ValidationError('Business-day period start must be on or before period end', { periodStart, periodEnd });
  }
  const span = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  if (span > MAX_PERIOD_DAYS) {
    throw new ValidationError(`Business-day periods cannot exceed ${MAX_PERIOD_DAYS} days`, { periodStart, periodEnd });
  }
  return { start, end };
}

function assertOrdinal(ordinal: number): void {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new ValidationError('Business-day ordinal must be a positive integer', { ordinal });
  }
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new ValidationError('Business-day amount must be a safe integer', { amount });
  }
  if (Math.abs(amount) > MAX_SEARCH_DAYS) {
    throw new ValidationError(`Business-day movement cannot exceed ${MAX_SEARCH_DAYS} days`, { amount });
  }
}

function searchForBusinessDay(
  value: DateOnly,
  direction: 1 | -1,
  calendar: BusinessCalendarSnapshot,
): DateOnly {
  let candidate = value;
  for (let steps = 0; steps < MAX_SEARCH_DAYS; steps += 1) {
    candidate = addCalendarDays(candidate, direction);
    if (isBusinessDay(candidate, calendar)) return candidate;
  }
  throw new ValidationError('Unable to find a business day within the deterministic search bound', {
    value,
    direction,
  });
}

export function isBusinessDay(value: DateOnly, calendar: BusinessCalendarSnapshot): boolean {
  validateCalendar(calendar);
  const parsed = parseDateOnly(value);
  return !calendar.weekendDays.has(parsed.getUTCDay()) && !calendar.holidays.has(value);
}

export function addBusinessDays(value: DateOnly, amount: number, calendar: BusinessCalendarSnapshot): DateOnly {
  validateCalendar(calendar);
  parseDateOnly(value);
  assertAmount(amount);
  if (amount === 0) return value;

  const direction: 1 | -1 = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);
  let candidate = value;
  let steps = 0;
  while (remaining > 0) {
    if (steps >= MAX_SEARCH_DAYS) {
      throw new ValidationError('Unable to resolve business-day movement within the deterministic search bound', {
        value,
        amount,
      });
    }
    candidate = addCalendarDays(candidate, direction);
    steps += 1;
    if (isBusinessDay(candidate, calendar)) remaining -= 1;
  }
  return candidate;
}

export function businessDayFromStart(
  periodStart: DateOnly,
  periodEnd: DateOnly,
  ordinal: number,
  calendar: BusinessCalendarSnapshot,
): DateOnly {
  validateCalendar(calendar);
  assertOrdinal(ordinal);
  assertDateRange(periodStart, periodEnd);

  let candidate = periodStart;
  let found = 0;
  const span = Math.floor((parseDateOnly(periodEnd).getTime() - parseDateOnly(periodStart).getTime()) / 86_400_000);
  for (let offset = 0; offset <= span; offset += 1) {
    if (isBusinessDay(candidate, calendar)) {
      found += 1;
      if (found === ordinal) return candidate;
    }
    if (offset < span) candidate = addCalendarDays(candidate, 1);
  }
  throw new ValidationError(`Business-day ordinal ${ordinal} cannot be resolved within the requested period`, {
    ordinal,
    periodStart,
    periodEnd,
    direction: 'START',
  });
}

export function businessDayFromEnd(
  periodStart: DateOnly,
  periodEnd: DateOnly,
  ordinal: number,
  calendar: BusinessCalendarSnapshot,
): DateOnly {
  validateCalendar(calendar);
  assertOrdinal(ordinal);
  assertDateRange(periodStart, periodEnd);

  let candidate = periodEnd;
  let found = 0;
  const span = Math.floor((parseDateOnly(periodEnd).getTime() - parseDateOnly(periodStart).getTime()) / 86_400_000);
  for (let offset = 0; offset <= span; offset += 1) {
    if (isBusinessDay(candidate, calendar)) {
      found += 1;
      if (found === ordinal) return candidate;
    }
    if (offset < span) candidate = addCalendarDays(candidate, -1);
  }
  throw new ValidationError(`Business-day ordinal ${ordinal} cannot be resolved within the requested period`, {
    ordinal,
    periodStart,
    periodEnd,
    direction: 'END',
  });
}

export function adjustBusinessDay(
  value: DateOnly,
  adjustment: BusinessDayAdjustment,
  calendar: BusinessCalendarSnapshot,
): DateOnly {
  validateCalendar(calendar);
  parseDateOnly(value);
  if (adjustment === 'NONE') return value;
  if (adjustment !== 'PREVIOUS' && adjustment !== 'NEXT') {
    throw new ValidationError('Unknown business-day adjustment', { adjustment });
  }
  if (isBusinessDay(value, calendar)) return value;
  return searchForBusinessDay(value, adjustment === 'NEXT' ? 1 : -1, calendar);
}

export { MAX_PERIOD_DAYS, MAX_SEARCH_DAYS };
