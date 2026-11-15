import { describe, expect, it } from 'vitest';
import {
  formatOriginalPrefillValue,
  getPrefillChanges,
  getPrefillFieldState,
  protectPrefillAnswers,
} from '@/lib/forms/prefill-changes';
import { sanitizePublicAnswers as sanitizeSubmission } from '@/services/form-submission/validation';
import { sanitizePublicAnswers as sanitizeDraft } from '@/services/form-draft.service';
import type { FormField } from '@/generated/prisma';

const baseline = {
  prefill_source: 'company_record', position_record_policy: 'read_only_with_removal',
  person_record_id: ['person:a'],
  person_name: ['Alice'], person_kind: ['Individual'],
  person_role_1: ['CEO'], person_role_date_1: ['2025-01-01'],
  person_role_2: ['Director'], person_role_date_2: ['2025-02-01'],
  person_role_3: [''], person_role_date_3: [''],
  person_additional_positions: [[{ role: 'CFO', date: '2025-03-01' }]],
  person_shareholding: [[{ shareClass: 'ORDINARY', shares: '100' }, { shareClass: 'PREFERENCE', shares: '10' }]],
};
const current = () => structuredClone(baseline) as Record<string, unknown>;

describe('Annual Return prefill immutability and edit indicators', () => {
  it('shows original share class and quantity instead of [object Object]', () => {
    expect(formatOriginalPrefillValue('person_shareholding', baseline.person_shareholding[0]))
      .toBe('ORDINARY: 100 shares\nPREFERENCE: 10 shares');
  });

  it('clears the edited status when holdings are restored to their original amounts', () => {
    const answers = current();
    const edited = [[{ shareClass: 'ORDINARY', shares: '101' }, { shareClass: 'PREFERENCE', shares: '10' }]];
    answers.person_shareholding = edited;
    expect(getPrefillFieldState('person_shareholding', edited[0], baseline, answers, 0).edited).toBe(true);
    expect(getPrefillChanges(baseline, answers).fields.some((item) => item.key === 'person_shareholding')).toBe(true);

    const restored = [[{ shareClass: 'preference', shares: '010' }, { shareClass: 'ordinary', shares: '0100' }]];
    answers.person_shareholding = restored;
    expect(getPrefillFieldState('person_shareholding', restored[0], baseline, answers, 0).edited).toBe(false);
    expect(getPrefillChanges(baseline, answers).fields.some((item) => item.key === 'person_shareholding')).toBe(false);
  });

  it('allows To remove for each prefilled appointment without changing its source role or date', () => {
    const answers = current();
    answers.person_role_remove_1 = ['Yes'];
    answers.person_role_remove_2 = [''];
    answers.person_additional_positions = [[{ role: 'CFO', date: '2025-03-01', toRemove: true }]];
    const protectedAnswers = protectPrefillAnswers(answers, baseline);
    expect(protectedAnswers.person_role_remove_1).toEqual(['Yes']);
    expect(getPrefillChanges(baseline, protectedAnswers).fields.some((change) => change.key === 'person_role_remove_1')).toBe(true);
    expect(getPrefillChanges(baseline, protectedAnswers).fields.some((change) => change.key === 'person_additional_positions')).toBe(true);
  });

  it('rejects changed recorded appointment roles/dates, deletion, and forged removal flags', () => {
    const a = current(); a.person_role_1 = ['Secretary'];
    expect(() => protectPrefillAnswers(a, baseline)).toThrow('Recorded appointments cannot be edited');
    const b = current(); b.person_role_date_2 = ['2025-03-05'];
    expect(() => protectPrefillAnswers(b, baseline)).toThrow('Recorded appointments cannot be edited');
    const c = current(); c.person_additional_positions = [[]];
    expect(() => protectPrefillAnswers(c, baseline)).toThrow('Recorded additional appointments');
    const d = current(); d.person_role_remove_3 = ['Yes'];
    expect(() => protectPrefillAnswers(d, baseline)).toThrow('Cannot remove a position');
    const e = current(); e.person_role_remove_1 = ['No'];
    expect(() => protectPrefillAnswers(e, baseline)).toThrow('Invalid appointment removal');
  });

  it('persists To remove in both drafts and final submissions', () => {
    const fields = [
      { key: 'people_section', type: 'PAGE_BREAK', inputType: 'repeat_start' },
      { key: 'person_role_remove_1', type: 'HIDDEN' },
      { key: 'person_additional_positions', type: 'SHORT_TEXT', inputType: 'position_list' },
      { key: 'people_end', type: 'PAGE_BREAK', inputType: 'repeat_end' },
    ] as FormField[];
    const answers = {
      person_role_remove_1: ['Yes'],
      person_additional_positions: [[{ role: 'CFO', date: '2025-03-01', toRemove: true }]],
    };
    for (const sanitizer of [sanitizeDraft, sanitizeSubmission]) {
      const cleaned = sanitizer(fields, answers, new Set());
      expect(cleaned.person_role_remove_1).toEqual(['Yes']);
      expect(cleaned.person_additional_positions).toEqual(answers.person_additional_positions);
    }
  });
});
