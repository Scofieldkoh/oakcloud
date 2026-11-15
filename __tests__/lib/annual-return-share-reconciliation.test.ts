import { describe, expect, it } from 'vitest';
import { getAnnualReturnShareReconciliation, validateAnnualReturnSharesOnSubmission } from '@/lib/forms/annual-return-share-reconciliation';

const shares = (values: Partial<Record<string, unknown>> = {}) => ({
  prefill_source: 'company_record',
  company_type: 'Exempt Private Company Limited by Shares',
  capital_class: ['ORDINARY', 'PREFERENCE'],
  capital_shares: ['100', '30'],
  person_shareholding: [
    [{ shareClass: 'ordinary', shares: '40' }, { shareClass: 'PREFERENCE', shares: '20' }],
    [{ shareClass: 'ORDINARY', shares: '60' }],
    [{ shareClass: 'preference', shares: '10' }],
    [],
  ],
  ...values,
});

describe('Annual Return exact share totals', () => {
  it('sums individual and corporate shareholders separately by class, irrespective of order/case', () => {
    const result = getAnnualReturnShareReconciliation(shares())!;
    expect(result.valid).toBe(true);
    expect(result.rows).toEqual([
      { shareClass: 'ORDINARY', issued: '100', held: '100', difference: '0', matches: true },
      { shareClass: 'PREFERENCE', issued: '30', held: '30', difference: '0', matches: true },
    ]);
    expect(() => validateAnnualReturnSharesOnSubmission(shares())).not.toThrow();
  });

  it('shows shortages and excess quantities by class and blocks final submission', () => {
    const answers = shares({ person_shareholding: [
      [{ shareClass: 'ORDINARY', shares: '10' }],
      [{ shareClass: 'ORDINARY', shares: '99' }],
      [{ shareClass: 'PREFERENCE', shares: '3' }],
    ] });
    const result = getAnnualReturnShareReconciliation(answers)!;
    expect(result.valid).toBe(false);
    expect(result.rows.find((r) => r.shareClass === 'ORDINARY')).toEqual({
      shareClass: 'ORDINARY', issued: '100', held: '109', difference: '-9', matches: false,
    });
    expect(result.issues.join(' ')).toContain('excess of 9');
    expect(result.issues.join(' ')).toContain('short by 27');
    expect(() => validateAnnualReturnSharesOnSubmission(answers)).toThrow('Shareholding reconciliation failed');
  });

  it('flags missing or unissued share classes, invalid quantities and duplicate people rows', () => {
    const result = getAnnualReturnShareReconciliation(shares({
      person_shareholding: [[{ shareClass: 'NEW CLASS', shares: '2' }]],
    }))!;
    expect(result.rows.find((r) => r.shareClass === 'NEW CLASS')).toMatchObject({
      issued: '0', held: '2', matches: false,
    });
    expect(result.issues.some((issue) => issue.includes('NEW CLASS'))).toBe(true);
    expect(getAnnualReturnShareReconciliation(shares({
      capital_shares: ['100.5', '-30'],
    }))?.valid).toBe(false);
    expect(getAnnualReturnShareReconciliation(shares({
      person_shareholding: [[
        { shareClass: 'ordinary', shares: '1' },
        { shareClass: 'ORDINARY', shares: '2' },
      ]],
    }))?.issues.join(' ')).toContain('unique share class');
  });

  it('uses BigInt and does not lose precision for very large share counts', () => {
    const enormous = '12345678901234567890';
    const result = getAnnualReturnShareReconciliation(shares({
      capital_class: ['ORDINARY'], capital_shares: [enormous],
      person_shareholding: [
        [{ shareClass: 'ORDINARY', shares: '12345678901234567889' }],
        [{ shareClass: 'ORDINARY', shares: '1' }],
      ],
    }))!;
    expect(result.valid).toBe(true);
    expect(result.rows[0].issued).toBe(enormous);
  });

  it('does not enforce share capital for non-prefilled forms or companies limited by guarantee', () => {
    expect(getAnnualReturnShareReconciliation(shares({ prefill_source: undefined }))).toBeNull();
    expect(getAnnualReturnShareReconciliation(shares({
      company_type: 'Public Company Limited by Guarantee',
    }))).toBeNull();
  });
});
