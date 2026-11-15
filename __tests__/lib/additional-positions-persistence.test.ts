import { describe, expect, it } from 'vitest';
import type { FormField } from '@/generated/prisma';
import { sanitizePublicAnswers as sanitizeDraftAnswers } from '@/services/form-draft.service';
import { sanitizePublicAnswers as sanitizeSubmissionAnswers } from '@/services/form-submission/validation';
import { formatResponseFieldValue } from '@/lib/form-response-display';
import { formatReviewValue } from '@/components/forms/public-form-review';

const fields = [
  { key: 'people_section', type: 'PAGE_BREAK', inputType: 'repeat_start' },
  { key: 'person_additional_positions', type: 'SHORT_TEXT', inputType: 'position_list',
    label: 'Additional positions' },
  { key: 'people_end', type: 'PAGE_BREAK', inputType: 'repeat_end' },
] as FormField[];
const sample = [
  [{ role: 'CEO', date: '2026-01-02' }, { role: 'Director', date: '2025-01-01' }],
  [],
  [{ role: 'CFO', date: '' }],
];

describe('additional position values in both form persistence paths', () => {
  it('persists structured positions by person instead of stringifying each object', () => {
    const answers = { person_additional_positions: sample };
    expect(sanitizeDraftAnswers(fields, answers, new Set()).person_additional_positions).toEqual(sample);
    expect(sanitizeSubmissionAnswers(fields, answers, new Set()).person_additional_positions).toEqual(sample);
  });

  it('rejects structurally invalid roles and dates in draft and final submission', () => {
    const bad = { person_additional_positions: [[{ role: '', date: '' }]] };
    expect(() => sanitizeDraftAnswers(fields, bad, new Set())).toThrow('role for position 4');
    expect(() => sanitizeSubmissionAnswers(fields, bad, new Set())).toThrow('role for position 4');
  });

  it('formats additional positions in review and response display', () => {
    const field = fields[1];
    expect(formatResponseFieldValue(field, sample[0])).toContain('Position 4: CEO');
    expect(formatReviewValue(field as never, sample[0], new Map())).toContain('Position 5: Director');
  });

  it('renders selected director IDs as names for staff and PDF output', () => {
    const answers = {
      person_name: ['Alice', 'Bob'], person_kind: ['Individual', 'Individual'],
      person_record_id: ['person:a', 'person:b'],
      person_role_1: ['Director', 'Director'],
      person_role_2: ['', ''], person_role_3: ['', ''],
      reelection_directors: ['person:a'],
    };
    expect(formatResponseFieldValue({ type: 'MULTIPLE_CHOICE', key: 'reelection_directors' },
      answers.reelection_directors, answers)).toBe('Alice');
    expect(formatReviewValue({ type: 'MULTIPLE_CHOICE', key: 'reelection_directors' } as never,
      answers.reelection_directors, new Map(), answers)).toBe('Alice');
  });
});
