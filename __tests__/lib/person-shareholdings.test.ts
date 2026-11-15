import { describe, expect, it } from 'vitest';
import type { FormField } from '@/generated/prisma';
import {
  formatPersonShareholdings, personShareholdingError,
  readPersonShareholdings, sanitizePersonShareholdings,
} from '@/lib/forms/person-shareholdings';
import { sanitizePublicAnswers } from '@/services/form-submission/validation';

const field = {
  key: 'person_shareholding', label: 'Shareholdings by class',
  type: 'SHORT_TEXT', inputType: 'shareholding_list',
} as FormField;
const repeatFields = [
  { key: 'people_section', type: 'PAGE_BREAK', inputType: 'repeat_start' },
  field,
  { key: 'people_end', type: 'PAGE_BREAK', inputType: 'repeat_end' },
] as FormField[];

describe('structured person shareholdings', () => {
  it('preserves multiple classes per person and keeps repeated people aligned', () => {
    const rows = [
      [{ shareClass: 'ORDINARY', shares: '100' }, { shareClass: 'PREFERENCE', shares: '00012' }],
      [],
      [{ shareClass: 'NON-VOTING', shares: '500' }],
    ];
    const sanitized = sanitizePublicAnswers(repeatFields, { person_shareholding: rows }, new Set());
    expect(sanitized.person_shareholding).toEqual([
      [{ shareClass: 'ORDINARY', shares: '100' }, { shareClass: 'PREFERENCE', shares: '12' }],
      [],
      [{ shareClass: 'NON-VOTING', shares: '500' }],
    ]);
    expect(formatPersonShareholdings(rows[0])).toBe('ORDINARY: 100 shares\nPREFERENCE: 00012 shares');
  });

  it('rejects a flat list of holdings in a person-repeat field instead of silently misaligning rows', () => {
    expect(() => sanitizePublicAnswers(repeatFields, {
      person_shareholding: [{ shareClass: 'ORDINARY', shares: '100' }],
    }, new Set())).toThrow('share-class and quantity rows');
  });

  it('allows an empty list for non-shareholders, and preserves very large integer quantities', () => {
    expect(sanitizePersonShareholdings([])).toEqual([]);
    expect(sanitizePersonShareholdings([{ shareClass: 'ORDINARY', shares: '12345678901234567890' }]))
      .toEqual([{ shareClass: 'ORDINARY', shares: '12345678901234567890' }]);
  });

  it.each([
    [[{ shareClass: '', shares: '10' }], 'Select a share class'],
    [[{ shareClass: 'ORDINARY', shares: '0' }], 'positive whole number'],
    [[{ shareClass: 'ORDINARY', shares: '-10' }], 'positive whole number'],
    [[{ shareClass: 'ORDINARY', shares: '10.5' }], 'positive whole number'],
    [[{ shareClass: 'ORDINARY', shares: '10' }, { shareClass: 'ordinary', shares: '5' }], 'repeated'],
  ])('rejects malformed shareholdings %j', (rows, message) => {
    expect(personShareholdingError(rows)).toContain(message);
    expect(() => sanitizePublicAnswers(repeatFields, { person_shareholding: [rows] }, new Set())).toThrow(message);
  });

  it('rejects arbitrarily large numbers of class rows', () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({ shareClass: String(index), shares: '1' }));
    expect(personShareholdingError(rows)).toContain('Maximum');
    expect(() => sanitizePersonShareholdings(rows)).toThrow('Maximum');
  });

  it('rejects arbitrary object payloads and keeps legacy free-text responses displayable', () => {
    expect(personShareholdingError({ shareClass: 'ORDINARY', shares: '10' })).not.toBeNull();
    expect(() => sanitizePublicAnswers(repeatFields, { person_shareholding: [{ invalid: true }] }, new Set())).toThrow();
    expect(formatPersonShareholdings('ORDINARY: 80 shares')).toBe('ORDINARY: 80 shares');
    expect(readPersonShareholdings('ORDINARY: 80 shares')).toEqual([]);
  });
});
