import { describe, expect, it } from 'vitest';
import type { PublicFormField } from '@/lib/form-utils';
import { resolveRestoredRepeatSectionCounts } from '@/app/(public)/forms/f/[slug]/_lib/field-config';

// The actual form field IDs are database-generated UUIDs, not template keys.
const fields = [
  { id: 'db-capital-start', key: 'share_capital_section', type: 'PAGE_BREAK', inputType: 'repeat_start',
    validation: { repeatMinItems: 1, repeatMaxItems: 50 } },
  { id: 'db-capital-class', key: 'capital_class', type: 'DROPDOWN' },
  { id: 'db-capital-shares', key: 'capital_shares', type: 'SHORT_TEXT' },
  { id: 'db-capital-end', key: 'capital_end', type: 'PAGE_BREAK', inputType: 'repeat_end' },
  { id: 'db-people-start', key: 'people_section', type: 'PAGE_BREAK', inputType: 'repeat_start',
    validation: { repeatMinItems: 1, repeatMaxItems: 50 } },
  { id: 'db-people-id', key: 'person_record_id', type: 'HIDDEN' },
  { id: 'db-people-name', key: 'person_name', type: 'SHORT_TEXT' },
  { id: 'db-people-holdings', key: 'person_shareholding', type: 'SHORT_TEXT', inputType: 'shareholding_list' },
  { id: 'db-people-end', key: 'people_end', type: 'PAGE_BREAK', inputType: 'repeat_end' },
] as unknown as PublicFormField[];

const sample = {
  capital_class: ['ORDINARY'],
  capital_shares: ['10000'],
  person_record_id: ['person:officer', 'person:member', 'person:company'],
  person_name: ['Tan Wei Jie', 'Member A', 'Corporate Shareholder'],
  person_shareholding: [
    [],
    [{ shareClass: 'ORDINARY', shares: '7000' }],
    [{ shareClass: 'ORDINARY', shares: '3000' }],
  ],
};

describe('restore public form repeat counts', () => {
  it('maps Annual Return staff-prefill counts from template keys to database IDs', () => {
    const count = resolveRestoredRepeatSectionCounts(fields, sample, {
      share_capital_section: 1, people_section: 3,
    });
    expect(count).toEqual({ 'db-capital-start': 1, 'db-people-start': 3 });
    expect(count.people_section).toBeUndefined();
  });

  it('shows every person from saved answers even if repeat metadata says one', () => {
    expect(resolveRestoredRepeatSectionCounts(fields, sample, { people_section: 1 })['db-people-start'])
      .toBe(3);
    expect(resolveRestoredRepeatSectionCounts(fields, sample, {})['db-people-start'])
      .toBe(3);
    expect(resolveRestoredRepeatSectionCounts(fields, sample, null)['db-people-start'])
      .toBe(3);
  });

  it('supports existing public drafts whose counts already use field IDs', () => {
    expect(resolveRestoredRepeatSectionCounts(fields, {
      ...sample,
      person_record_id: sample.person_record_id.slice(0, 1),
      person_name: sample.person_name.slice(0, 1),
      person_shareholding: sample.person_shareholding.slice(0, 1),
    }, { 'db-people-start': 2 })['db-people-start']).toBe(2);
  });

  it('does not create removed rows again when counts and answer arrays are shortened', () => {
    const one = {
      ...sample,
      person_record_id: sample.person_record_id.slice(0, 1),
      person_name: sample.person_name.slice(0, 1),
      person_shareholding: sample.person_shareholding.slice(0, 1),
    };
    expect(resolveRestoredRepeatSectionCounts(fields, one, { people_section: 1 })['db-people-start'])
      .toBe(1);
  });

  it('respects configured repeat maximums and minimums', () => {
    const restrictive = fields.map(f => f.key === 'people_section'
      ? { ...f, validation: { repeatMinItems: 2, repeatMaxItems: 4 } }
      : f) as PublicFormField[];
    expect(resolveRestoredRepeatSectionCounts(restrictive, {
      ...sample,
      person_name: Array.from({ length: 51 }, (_, i) => String(i)),
    }, { people_section: 100 })['db-people-start']).toBe(4);
    expect(resolveRestoredRepeatSectionCounts(restrictive, {}, {})['db-people-start']).toBe(2);
  });
});
