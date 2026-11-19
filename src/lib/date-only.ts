/**
 * Calendar dates without a time zone (a date of birth).
 *
 * A date of birth is stored as midnight UTC of its calendar date and read back through the UTC
 * getters, so it never moves a day with the server's or the browser's time zone. Sentroweb is sent
 * the same `YYYY-MM-DD`. Use these helpers for every read and write of such a date instead of
 * `new Date(...)` with a local-time format or `getDate()`.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The oldest date of birth accepted (also keeps typos such as year 0020 out). */
export const MAX_AGE_YEARS = 150;

/**
 * Midnight UTC of a strict `YYYY-MM-DD` calendar date, or null when the text is not exactly that
 * or is not a real date (`2023-02-29`, `1980-13-01`, `1980-1-1`).
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls an impossible day over to the next month: reject anything that moved.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** `YYYY-MM-DD` of the UTC calendar date, or null for a missing or invalid date. */
export function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * The UTC calendar date of a date-of-birth input: a `YYYY-MM-DD` as typed, or (older callers) a full
 * ISO date-time, whose UTC calendar date is taken. Null when it is neither.
 */
export function normalizeDateOfBirthInput(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (DATE_ONLY.test(text)) return parseDateOnly(text) ? text : null;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
  // Date() quietly rolls 1980-02-30 over to 1980-03-01: the written date must be a real one first.
  if (!parseDateOnly(text.slice(0, 10))) return null;
  return toDateOnlyString(text);
}

/**
 * Is this `YYYY-MM-DD` a believable date of birth: a real date, not after `now` (UTC calendar day),
 * and not more than 150 years back.
 */
export function isPlausibleDateOfBirth(value: string | null | undefined, now: Date = new Date()): boolean {
  const date = parseDateOnly(value);
  if (!date) return false;
  const today = parseDateOnly(toDateOnlyString(now));
  if (!today || date.getTime() > today.getTime()) return false;
  const oldest = new Date(Date.UTC(today.getUTCFullYear() - MAX_AGE_YEARS, today.getUTCMonth(), today.getUTCDate()));
  return date.getTime() >= oldest.getTime();
}

/** A strict, plausible `YYYY-MM-DD` for a date of birth, or null (missing, malformed, future or too old). */
export function plausibleDateOfBirth(value: string | null | undefined, now: Date = new Date()): string | null {
  const normalised = normalizeDateOfBirthInput(value);
  return normalised && isPlausibleDateOfBirth(normalised, now) ? normalised : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `1 Jan 1980` from the UTC calendar date: the same text in every time zone. */
export function formatDateOnlyDisplay(value: Date | string | null | undefined): string {
  const iso = toDateOnlyString(value);
  const date = iso ? parseDateOnly(iso) : null;
  if (!date) return '';
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
