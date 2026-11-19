// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDateOnlyDisplay,
  isPlausibleDateOfBirth,
  normalizeDateOfBirthInput,
  parseDateOnly,
  plausibleDateOfBirth,
  toDateOnlyString,
} from '@/lib/date-only';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('parseDateOnly', () => {
  it('is midnight UTC of the calendar date', () => {
    expect(parseDateOnly('1980-01-01')?.toISOString()).toBe('1980-01-01T00:00:00.000Z');
    expect(parseDateOnly(' 2024-02-29 ')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it.each([
    '2023-02-29',
    '1980-13-01',
    '1980-00-10',
    '1980-04-31',
    '1980-1-1',
    '01-01-1980',
    '1980/01/01',
    '1980-01-01T00:00:00Z',
    '',
    '   ',
    'tomorrow',
  ])('rejects %j', (value) => {
    expect(parseDateOnly(value)).toBeNull();
  });

  it('rejects non-text', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly(19800101 as unknown as string)).toBeNull();
  });
});

describe('time zone regression', () => {
  const zones = ['Asia/Singapore', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC'];

  it.each(zones)('1980-01-01 round-trips unchanged under TZ=%s', (zone) => {
    process.env.TZ = zone;
    const stored = parseDateOnly('1980-01-01') as Date;
    expect(stored.toISOString()).toBe('1980-01-01T00:00:00.000Z');
    expect(toDateOnlyString(stored)).toBe('1980-01-01');
    expect(toDateOnlyString(stored.toISOString())).toBe('1980-01-01');
    expect(formatDateOnlyDisplay(stored)).toBe('1 Jan 1980');
    // The trap this module avoids: local getters move the day in a western zone.
    if (zone === 'America/Los_Angeles' || zone === 'Pacific/Pago_Pago') expect(stored.getDate()).toBe(31);
  });

  it.each(zones)('a legacy ISO date-time keeps its UTC calendar date under TZ=%s', (zone) => {
    process.env.TZ = zone;
    expect(normalizeDateOfBirthInput('1980-01-01T00:00:00.000Z')).toBe('1980-01-01');
    expect(normalizeDateOfBirthInput('1980-12-31T23:59:59.999Z')).toBe('1980-12-31');
  });
});

describe('normalizeDateOfBirthInput', () => {
  it('takes YYYY-MM-DD as typed and an ISO date-time as its UTC calendar date', () => {
    expect(normalizeDateOfBirthInput('1980-01-01')).toBe('1980-01-01');
    expect(normalizeDateOfBirthInput('1980-01-01T02:00:00+08:00')).toBe('1979-12-31');
  });

  it.each(['', '  ', '1980-02-30', '1980-02-30T00:00:00Z', 'nope', '1980-01-01 10:00', '1980-01-01T'])(
    'gives null for %j',
    (value) => {
      expect(normalizeDateOfBirthInput(value)).toBeNull();
    },
  );
});

describe('plausible date of birth', () => {
  const now = new Date('2026-11-19T10:00:00Z');

  it('accepts a real past date, including today', () => {
    expect(isPlausibleDateOfBirth('1980-01-01', now)).toBe(true);
    expect(isPlausibleDateOfBirth('2026-11-19', now)).toBe(true);
    expect(isPlausibleDateOfBirth('1876-11-19', now)).toBe(true); // exactly 150 years
  });

  it.each(['2026-11-20', '2999-01-01', '1876-11-18', '1850-01-01', '2023-02-29', 'x'])('rejects %j', (value) => {
    expect(isPlausibleDateOfBirth(value, now)).toBe(false);
  });

  it('plausibleDateOfBirth returns the normalised date or null', () => {
    expect(plausibleDateOfBirth('1980-01-01T00:00:00.000Z', now)).toBe('1980-01-01');
    expect(plausibleDateOfBirth('2999-01-01', now)).toBeNull();
    expect(plausibleDateOfBirth(null, now)).toBeNull();
    expect(plausibleDateOfBirth('', now)).toBeNull();
  });
});

describe('toDateOnlyString', () => {
  it('gives null for missing or invalid dates', () => {
    expect(toDateOnlyString(null)).toBeNull();
    expect(toDateOnlyString(undefined)).toBeNull();
    expect(toDateOnlyString('')).toBeNull();
    expect(toDateOnlyString(new Date('invalid'))).toBeNull();
    expect(toDateOnlyString('garbage')).toBeNull();
  });
});

describe('formatDateOnlyDisplay', () => {
  it('reads the same everywhere and is empty for nothing', () => {
    expect(formatDateOnlyDisplay('1980-01-05T00:00:00.000Z')).toBe('5 Jan 1980');
    expect(formatDateOnlyDisplay(new Date('1999-12-31T00:00:00Z'))).toBe('31 Dec 1999');
    expect(formatDateOnlyDisplay(null)).toBe('');
  });
});
