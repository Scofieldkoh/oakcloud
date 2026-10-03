import { describe, expect, it } from 'vitest';
import {
  buildOakDocCustomFieldValues,
  formatOakDocCustomFieldValue,
  isOakDocCustomFieldTag,
  mergeOakDocPartialCustomFields,
  oakDocCustomContactFields,
  oakDocCustomFieldKeyFromLabel,
  oakDocCustomFieldTypes,
  readOakDocCustomFields,
  readOakDocPartialCustomFields,
  writeOakDocCustomFields,
} from '@/lib/document-editor/oakdoc-custom-fields';

describe('OakDoc custom fields', () => {
  it('recognises custom field tags', () => {
    expect(isOakDocCustomFieldTag('custom.fee_amount')).toBe(true);
    expect(isOakDocCustomFieldTag('custom.')).toBe(false);
    expect(isOakDocCustomFieldTag('custom.2fee')).toBe(false);
    expect(isOakDocCustomFieldTag('custom.fee.amount')).toBe(false);
    expect(isOakDocCustomFieldTag('custom.secretary.identificationNumber')).toBe(true);
    expect(isOakDocCustomFieldTag('custom.secretary.address.full')).toBe(true);
    expect(isOakDocCustomFieldTag('company.name')).toBe(false);
  });

  it('makes a unique key from a label', () => {
    expect(oakDocCustomFieldKeyFromLabel('Fee amount (S$)', new Set())).toBe('fee_amount_s');
    expect(oakDocCustomFieldKeyFromLabel('Fee amount', new Set(['fee_amount']))).toBe('fee_amount_2');
    expect(oakDocCustomFieldKeyFromLabel('2026 AGM date', new Set())).toBe('field_2026_agm_date');
    expect(oakDocCustomFieldKeyFromLabel('***', new Set())).toBe('field');
  });

  it('reads custom fields, including dropdowns, and skips everything else', () => {
    const stored = [
      { key: 'custom.fee', label: 'Fee', type: 'currency', source: 'custom', required: true },
      { key: 'custom.basis', label: 'Basis', type: 'text', options: ['Annual', ' Monthly ', 'Annual'] },
      { key: 'company.name', label: 'Company', type: 'text', source: 'company' },
      { key: 'custom.notes', label: 'Notes', type: 'textarea', oakDocPartialId: 'p1' },
    ];
    expect(readOakDocCustomFields(stored)).toEqual([
      { key: 'fee', label: 'Fee', type: 'currency', required: true },
      { key: 'basis', label: 'Basis', type: 'dropdown', required: false, options: ['Annual', 'Monthly'] },
    ]);
    expect(readOakDocPartialCustomFields(stored)).toEqual([
      { key: 'notes', label: 'Notes', type: 'textarea', required: false, partialId: 'p1' },
    ]);
  });

  it('replaces only its own custom fields and keeps stored identity and other definitions', () => {
    const stored = [
      { id: 'keep-id', key: 'custom.fee', label: 'Fee', type: 'currency', source: 'custom', extra: 1 },
      { key: 'custom.old', label: 'Old', type: 'text', source: 'custom' },
      { key: 'company.name', label: 'Company', type: 'text', source: 'company' },
      { key: 'custom.notes', label: 'Notes', type: 'text', oakDocPartialId: 'p1' },
    ];
    const written = writeOakDocCustomFields(stored, [
      { key: 'fee', label: 'Annual fee', type: 'currency', required: true },
      { key: 'basis', label: 'Basis', type: 'dropdown', required: false, options: ['Annual', 'Monthly'] },
    ]);
    expect(written).toEqual([
      {
        id: 'keep-id',
        key: 'custom.fee',
        path: 'custom.fee',
        label: 'Annual fee',
        type: 'currency',
        source: 'custom',
        category: 'custom',
        required: true,
        extra: 1,
      },
      {
        key: 'custom.basis',
        path: 'custom.basis',
        label: 'Basis',
        type: 'text',
        source: 'custom',
        category: 'custom',
        required: false,
        options: ['Annual', 'Monthly'],
      },
      { key: 'company.name', label: 'Company', type: 'text', source: 'company' },
      { key: 'custom.notes', label: 'Notes', type: 'text', oakDocPartialId: 'p1' },
    ]);
  });

  it('copies custom fields of inserted partials, letting the template win', () => {
    const merged = mergeOakDocPartialCustomFields(
      [
        { key: 'custom.fee', label: 'Fee', type: 'currency', source: 'custom' },
        { key: 'custom.stale', label: 'Stale', type: 'text', oakDocPartialId: 'gone' },
      ],
      [
        { id: 'p1', placeholders: [
          { key: 'custom.fee', label: 'Partial fee', type: 'text', source: 'custom' },
          { key: 'custom.meeting_date', label: 'Meeting date', type: 'date', source: 'custom', required: true },
        ] },
      ],
    );
    expect(merged.map((definition) => [definition.key, definition.oakDocPartialId])).toEqual([
      ['custom.fee', undefined],
      ['custom.meeting_date', 'p1'],
    ]);
    expect(oakDocCustomFieldTypes(merged)).toEqual({ fee: 'currency', meeting_date: 'date' });
  });

  it('formats values by type', () => {
    expect(formatOakDocCustomFieldValue('2026-10-01', 'date')).toBe('1 Oct 2026');
    expect(formatOakDocCustomFieldValue('1234567.5', 'currency')).toBe('1,234,567.50');
    expect(formatOakDocCustomFieldValue('-1200', 'number')).toBe('-1,200');
    expect(formatOakDocCustomFieldValue('about 5', 'number')).toBe('about 5');
    expect(formatOakDocCustomFieldValue(true, 'boolean')).toBe('Yes');
    expect(formatOakDocCustomFieldValue('', 'text')).toBe('');
    expect(formatOakDocCustomFieldValue(undefined, 'text')).toBe('');
  });

  it('builds the values and dates for custom field controls', () => {
    expect(buildOakDocCustomFieldValues({
      tags: ['custom.fee', 'custom.meeting_date', 'custom.missing', 'company.name'],
      data: { fee: '2500', meeting_date: '2026-11-03' },
      types: { fee: 'currency', meeting_date: 'date' },
    })).toEqual({
      values: {
        'custom.fee': '2,500.00',
        'custom.meeting_date': '3 Nov 2026',
        'custom.missing': '',
      },
      dates: { 'custom.meeting_date': '2026-11-03' },
    });
  });

  it('stores a Contact field with its shortlist and reads it back', () => {
    const stored = writeOakDocCustomFields([], [{
      key: 'secretary',
      label: 'Secretary',
      type: 'contact',
      required: true,
      contacts: [{ id: 'c-1', name: 'Tan Wei Jie' }, { id: 'c-2', name: 'Lim Mei Ling' }],
    }]);

    expect(stored[0]).toMatchObject({
      key: 'custom.secretary',
      type: 'text',
      fieldKind: 'contact',
      options: [{ value: 'c-1', label: 'Tan Wei Jie' }, { value: 'c-2', label: 'Lim Mei Ling' }],
    });
    expect(readOakDocCustomFields(stored)).toEqual([{
      key: 'secretary',
      label: 'Secretary',
      type: 'contact',
      required: true,
      contacts: [{ id: 'c-1', name: 'Tan Wei Jie' }, { id: 'c-2', name: 'Lim Mei Ling' }],
    }]);
    expect(oakDocCustomContactFields(stored)).toEqual({ secretary: ['c-1', 'c-2'] });
    expect(oakDocCustomFieldTypes(stored)).toEqual({ secretary: 'text' });
  });

  it('prints the chosen contact for a Contact field and its details', () => {
    expect(buildOakDocCustomFieldValues({
      tags: ['custom.secretary', 'custom.secretary.identificationNumber', 'custom.secretary.address.full', 'custom.other'],
      data: { secretary: 'c-2', other: 'c-1' },
      types: { secretary: 'text', other: 'text' },
      contacts: {
        secretary: { name: 'Lim Mei Ling', identificationNumber: 'S7654321B', address: { full: '1 Raffles Place' } },
        other: undefined,
      },
    }).values).toEqual({
      'custom.secretary': 'Lim Mei Ling',
      'custom.secretary.identificationNumber': 'S7654321B',
      'custom.secretary.address.full': '1 Raffles Place',
      'custom.other': '',
    });
  });
});
