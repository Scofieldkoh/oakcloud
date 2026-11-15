import { describe, expect, it } from 'vitest';
import { additionalPositionsError, formatAdditionalPositions, sanitizeAdditionalPositions } from '@/lib/forms/additional-positions';
import { getDirectorReelectionOptions, isReelectionMatterSelected, personHasRole } from '@/lib/forms/annual-return-directors';
import { protectPrefillAnswers } from '@/lib/forms/prefill-changes';

const base = {
  prefill_source: 'company_record', person_name: ['A', 'B', 'C', 'Company Ltd'],
  person_kind: ['Individual', 'Individual', 'Individual', 'Corporate'],
  person_record_id: ['person:a', 'person:b', 'person:c', 'person:corp'],
  person_role_1: ['Director', 'Secretary', 'CFO', 'Director'],
  person_role_2: ['', '', '', ''],
  person_role_3: ['', '', '', ''],
  person_additional_positions: [
    [{ role: 'Secretary', date: '2020-01-01' }, { role: 'CEO', date: '2022-01-01' }],
    [{ role: 'Managing Director', date: '2021-01-02' }],
    [{ role: 'Auditor', date: '2020-01-01' }],
    [],
  ],
};

describe('Annual Return v5 structured positions and director choices', () => {
  it('preserves position 4, 5, 6 and beyond with appointment dates', () => {
    const rows = [
      { role: 'Secretary', date: '2020-01-01' },
      { role: 'CEO', date: '2021-02-02' },
      { role: 'Auditor', date: '2022-03-03' },
      { role: 'CFO', date: '2023-04-04' },
    ];
    expect(sanitizeAdditionalPositions(rows)).toEqual(rows);
    expect(formatAdditionalPositions(rows)).toContain('Position 7: CFO (2023-04-04)');
    expect(additionalPositionsError([{ role: '', date: '' }])).toContain('position 4');
    expect(additionalPositionsError([{ role: 'CEO', date: '2026-02-31' }])).toContain('valid appointment date');
  });

  it('marks CEO and all individuals with director roles, including positions beyond third', () => {
    expect(personHasRole(base, 0, 'CEO')).toBe(true);
    expect(getDirectorReelectionOptions(base)).toEqual([
      { value: 'person:a', label: 'A' }, { value: 'person:b', label: 'B' },
    ]);
    expect(getDirectorReelectionOptions({
      ...base, person_record_id: ['person:a', '', 'person:c', 'person:corp'],
    })[1].value).toBe('new-person:1');
  });

  it('recognises re-election in both AGM and written-resolution selections', () => {
    expect(isReelectionMatterSelected({ resolution_matters: ['Re-election of directors'] })).toBe(true);
    expect(isReelectionMatterSelected({ agm_agenda: [{ value: 'Re-election of directors' }] })).toBe(true);
    expect(isReelectionMatterSelected({ resolution_matters: [] })).toBe(false);
  });

  it('does not trust forged or stale director checkbox IDs', () => {
    const source = { ...base, record_as_at: 'now' };
    const current = { ...source, reelection_directors: ['person:a', 'person:b'] };
    expect(protectPrefillAnswers(current, source).ceo_role_listed).toBe('Yes');
    expect(() => protectPrefillAnswers({ ...current, reelection_directors: ['person:fake'] }, source))
      .toThrow('Invalid director re-election selection');
    expect(() => protectPrefillAnswers({ ...current, reelection_directors: ['person:a', 'person:a'] }, source))
      .toThrow('Invalid director re-election selection');
  });
});
