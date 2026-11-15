import { describe, expect, it } from 'vitest';
import { protectPrefillAnswers } from '@/lib/forms/prefill-changes';

const baseline = {
  prefill_source: 'company_record', position_record_policy: 'verification_only',
  record_as_at: 'From our records as at 2026-11-15',
  capital_record_id: ['capital-1'], capital_class: ['ORDINARY'],
  capital_shares: ['10000'], capital_currency: ['SGD'],
  capital_amount: ['1'], capital_paid_up: ['0'],
  person_record_id: ['person:a', 'person:b'],
  person_kind: ['Individual', 'Corporate'],
  person_name: ['Director', 'Shareholder Pte Ltd'],
  person_role_1: ['Director', ''], person_role_date_1: ['2025-01-01', ''],
  person_role_2: ['Secretary', ''], person_role_date_2: ['2025-02-01', ''],
  person_role_3: ['', ''], person_role_date_3: ['', ''],
  person_additional_positions: [[{ role: 'CEO', date: '2025-03-01' }], []],
  person_shareholding: [
    [{ shareClass: 'ORDINARY', shares: '10' }],
    [{ shareClass: 'ORDINARY', shares: '9990' }],
  ],
  person_role_remove_1: ['', ''], person_role_remove_2: ['', ''], person_role_remove_3: ['', ''],
};
const current = (): Record<string, unknown> => structuredClone(baseline);

describe('Annual Return v8 verification-only source records', () => {
  it('accepts unchanged capital, appointments and shareholdings', () => {
    expect(protectPrefillAnswers(current(), baseline).person_shareholding).toEqual(baseline.person_shareholding);
  });

  it('still allows corrections to non-locked personal particulars', () => {
    const answer = current();
    answer.person_name = ['Director Corrected', 'Shareholder Pte Ltd'];
    answer.person_id_number = ['S1234567A', ''];
    const protectedAnswer = protectPrefillAnswers(answer, baseline);
    expect(protectedAnswer.person_name).toEqual(answer.person_name);
    expect(protectedAnswer.person_id_number).toEqual(answer.person_id_number);
  });

  it('blocks changes to recorded roles, dates, extra roles and shareholdings', () => {
    const role = current();
    role.person_role_1 = ['CEO', ''];
    expect(() => protectPrefillAnswers(role, baseline)).toThrow('verification-only');

    const date = current();
    date.person_role_date_2 = ['2026-05-01', ''];
    expect(() => protectPrefillAnswers(date, baseline)).toThrow('verification-only');

    const extra = current();
    extra.person_additional_positions = [[{ role: 'CEO', date: '2025-05-05' }], []];
    expect(() => protectPrefillAnswers(extra, baseline)).toThrow('verification-only');

    const shares = current();
    shares.person_shareholding = [[], [{ shareClass: 'ORDINARY', shares: '10000' }]];
    expect(() => protectPrefillAnswers(shares, baseline)).toThrow('verification-only');

    const forgedRemoval = current();
    forgedRemoval.person_role_remove_1 = ['Yes', ''];
    expect(() => protectPrefillAnswers(forgedRemoval, baseline)).toThrow('removal requests');
  });

  it('blocks changes to share capital class, count, currency and money amounts', () => {
    for (const [key, changed] of [
      ['capital_class', ['PREFERENCE']], ['capital_shares', ['9999']],
      ['capital_currency', ['USD']], ['capital_amount', ['99']],
      ['capital_paid_up', ['1']],
    ] as Array<[string, string[]]>) {
      const answer = current();
      answer[key] = changed;
      expect(() => protectPrefillAnswers(answer, baseline)).toThrow('verification-only');
    }
    const inserted = current();
    inserted.capital_record_id = ['capital-1', ''];
    inserted.capital_class = ['ORDINARY', 'PREFERENCE'];
    expect(() => protectPrefillAnswers(inserted, baseline)).toThrow('verification-only');
    const removed = current();
    removed.capital_record_id = [];
    expect(() => protectPrefillAnswers(removed, baseline)).toThrow('verification-only');
  });

  it('does not permit new people to supply invented role or shareholding rows', () => {
    const answer = current();
    answer.person_record_id = ['person:a', 'person:b', ''];
    answer.person_name = ['Director', 'Shareholder Pte Ltd', 'New person'];
    answer.person_role_1 = ['Director', '', 'CEO'];
    expect(() => protectPrefillAnswers(answer, baseline)).toThrow('verification-only');
    answer.person_role_1 = ['Director', '', ''];
    answer.person_shareholding = [...baseline.person_shareholding, [{ shareClass: 'ORDINARY', shares: '1' }]];
    expect(() => protectPrefillAnswers(answer, baseline)).toThrow('verification-only');
  });
});
