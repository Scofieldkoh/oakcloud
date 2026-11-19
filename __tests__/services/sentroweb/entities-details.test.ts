// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { parseDateOnly } from '@/lib/date-only';
import { agreedCountry, formatDateOfBirth, searchDetailsFor, sentrowebGenderOf } from '@/services/sentroweb/entities';

describe('formatDateOfBirth', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  it('formats a stored date as YYYY-MM-DD', () => {
    expect(formatDateOfBirth(new Date('1980-02-29T00:00:00Z'), now)).toBe('1980-02-29');
  });
  it.each([[null], [undefined], [new Date('invalid')], [new Date('1899-12-31T00:00:00Z')], [new Date('2026-11-20T00:00:00Z')]])(
    'gives null for a missing or implausible date (%s)',
    (value) => {
      expect(formatDateOfBirth(value as Date | null | undefined, now)).toBeNull();
    },
  );
});

describe('formatDateOfBirth reads what Contacts stores', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
  it.each(['Asia/Singapore', 'America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'])(
    'a date saved as 1980-01-01 is sent as 1980-01-01 under TZ=%s',
    (zone) => {
      process.env.TZ = zone;
      const saved = parseDateOnly('1980-01-01');
      expect(formatDateOfBirth(saved, new Date('2026-11-19T00:00:00Z'))).toBe('1980-01-01');
    },
  );
});

describe('agreedCountry', () => {
  it('maps one or several agreeing nationalities', () => {
    expect(agreedCountry(['Singaporean'])).toBe('Singapore');
    expect(agreedCountry(['Singaporean', 'SG', null, 'Singapore'])).toBe('Singapore');
  });
  it('is null when nothing is stated, when they disagree, or when any stated one cannot be mapped', () => {
    expect(agreedCountry([])).toBeNull();
    expect(agreedCountry([null, '  '])).toBeNull();
    expect(agreedCountry(['Singaporean', 'Malaysian'])).toBeNull();
    expect(agreedCountry(['Singaporean', 'Atlantean'])).toBeNull();
    expect(agreedCountry(['Dominican'])).toBeNull();
  });
});

describe('searchDetailsFor', () => {
  it('reports the date as yes/no and the gender when one is held', () => {
    expect(searchDetailsFor({ country: 'Singapore', dateOfBirth: '1980-01-01', gender: 'MALE' })).toEqual({
      country: 'Singapore',
      dateOfBirth: true,
      gender: 'MALE',
    });
    expect(searchDetailsFor({ country: null, dateOfBirth: null, gender: null })).toEqual({
      country: null,
      dateOfBirth: false,
      gender: null,
    });
  });
});

describe('sentrowebGenderOf', () => {
  it('passes MALE and FEMALE, and nothing else (Sentroweb has two boxes only)', () => {
    expect(sentrowebGenderOf('MALE')).toBe('MALE');
    expect(sentrowebGenderOf('FEMALE')).toBe('FEMALE');
    for (const value of ['OTHER', 'male', '', null, undefined]) expect(sentrowebGenderOf(value as string | null | undefined)).toBeNull();
  });
});
