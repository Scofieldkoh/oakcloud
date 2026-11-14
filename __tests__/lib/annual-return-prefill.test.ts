import { describe, expect, it } from 'vitest';
import type { FormField } from '@/generated/prisma';
import type { CompanyWithRelations } from '@/services/company.service';
import { AR_RECORD_SECTIONS, buildAnnualReturnPrefill } from '@/lib/forms/annual-return-prefill';
import {
  getPrefillChanges, getPrefillFieldState, protectPrefillAnswers,
  undoRemovedPrefillRow, valuesDifferFromPrefill,
} from '@/lib/forms/prefill-changes';
import { sanitizePublicAnswers } from '@/services/form-submission/validation';
import { pruneHiddenConditionalAnswers } from '@/lib/form-utils';
import { buildSgAnnualReturnDeclarationFields } from '@/lib/form-templates/sg-annual-return-declaration';

function company(overrides: Record<string, unknown> = {}): CompanyWithRelations {
  return {
    id: 'c1', tenantId: 't1', name: 'Rocket Pte Ltd', uen: '202612345A',
    entityType: 'PRIVATE_LIMITED', status: 'LIVE', aggregateRevision: 15,
    primarySsicCode: '62011', primarySsicDescription: 'Development of software',
    secondarySsicCode: null, secondarySsicDescription: null,
    financialYearEndDay: 31, financialYearEndMonth: 3,
    fyeAsAtLastAr: new Date('2025-03-31T00:00:00.000Z'),
    addresses: [
      { id: 'a1', addressType: 'REGISTERED_OFFICE', fullAddress: '1 Shenton Way, Singapore', isCurrent: true },
      { id: 'a2', addressType: 'MAILING', fullAddress: '2 Other Street', isCurrent: true },
    ],
    officers: [
      { id: 'o1', role: 'DIRECTOR', name: 'Alice', identificationNumber: 'S1234567A', nationality: 'Singaporean', isCurrent: true, appointmentDate: new Date('2020-01-01'), address: '10 Main Street' },
      { id: 'o2', role: 'CEO', name: 'Bob', identificationNumber: 'S7654321B', isCurrent: true, appointmentDate: new Date('2021-02-01') },
      { id: 'o3', role: 'SECRETARY', name: 'Former', isCurrent: false },
    ],
    auditor: { name: 'Auditor LLP', address: '55 Queensway', appointmentDate: new Date('2022-07-31') },
    shareholders: [
      { id: 's1', name: 'Alice', identificationNumber: 'S1234567A', address: '10 Main Street', shareClass: 'ORDINARY', numberOfShares: 80, isCurrent: true, percentageHeld: null },
      { id: 's2', name: 'Old Member', numberOfShares: 20, isCurrent: false, percentageHeld: null },
    ],
    shareCapital: [{ id: 'k1', shareClass: 'ORDINARY', currency: 'SGD', numberOfShares: 100, totalValue: '100.00', isPaidUp: true }],
    ...overrides,
  } as unknown as CompanyWithRelations;
}

describe('Annual Return company snapshot mapping', () => {
  it('maps company identity, year end, full officer IDs, auditor, capital and current shareholders only', () => {
    const { answers, repeatSectionCounts } = buildAnnualReturnPrefill(company(), new Date('2026-11-14'));
    expect(answers).toMatchObject({
      prefill_source: 'company_record', company_name: 'Rocket Pte Ltd',
      company_uen: '202612345A', company_type: 'Private Company Limited by Shares',
      financial_year_end: '2026-03-31', record_registered_office: '1 Shenton Way, Singapore',
      record_entity_status: 'Live', record_secondary_activity: '', ceo_exists: 'Yes',
    });
    expect(answers.officer_record_id).toEqual(['o1', 'o2', 'auditor:c1']);
    expect(answers.officer_role).toEqual(['Director', 'CEO', 'Auditor']);
    expect(answers.officer_id_number).toEqual(['S1234567A', 'S7654321B', '']);
    expect(answers.capital_record_id).toEqual(['k1']);
    expect(answers.capital_paid_up).toEqual(['100.00']);
    expect(answers.shareholder_record_id).toEqual(['s1']);
    expect(answers.shareholder_id_number).toEqual(['S1234567A']);
    expect(repeatSectionCounts).toMatchObject({ officers_section: 3, share_capital_section: 1, shareholders_section: 1 });
  });
  it('rejects unsupported entity type', () => {
    expect(() => buildAnnualReturnPrefill(company({ entityType: 'SOLE_PROPRIETORSHIP' }))).toThrow('Only Singapore companies');
  });
  it('suggests a recent completed year-end if no prior AR year-end exists', () => {
    const { answers } = buildAnnualReturnPrefill(company({ fyeAsAtLastAr: null }), new Date('2026-02-01'));
    expect(answers.financial_year_end).toBe('2025-03-31');
  });
  it('does not include ceased officers or former shareholders', () => {
    const { answers } = buildAnnualReturnPrefill(company());
    expect(JSON.stringify(answers)).not.toContain('Former');
    expect(JSON.stringify(answers)).not.toContain('Old Member');
  });
});

describe('Generic prefilled-answer change tracking', () => {
  const { answers: baseline } = buildAnnualReturnPrefill(company());
  it('compares normalized whitespace and case, but not changed values', () => {
    expect(valuesDifferFromPrefill(' Hello   WORLD ', 'hello world')).toBe(false);
    expect(valuesDifferFromPrefill('', '')).toBe(false);
    expect(valuesDifferFromPrefill('100', '101')).toBe(true);
  });
  it('detects changed and restored scalar fields', () => {
    const changed = { ...baseline, company_name: 'Rocket Group Pte Ltd' };
    expect(getPrefillFieldState('company_name', changed.company_name, baseline, changed).edited).toBe(true);
    expect(getPrefillFieldState('company_name', 'Rocket Pte Ltd', baseline, baseline).edited).toBe(false);
  });
  it('matches changed repeat fields by ID after row order changes', () => {
    const reordered: Record<string, unknown> = {
      ...baseline,
      officer_record_id: ['o2', 'o1', 'auditor:c1'],
    };
    for (const fieldKey of AR_RECORD_SECTIONS[0].fields) {
      const values = baseline[fieldKey] as unknown[];
      reordered[fieldKey] = [values[1], values[0], values[2]];
    }
    expect(getPrefillFieldState('officer_name', 'Alice', baseline, reordered, 1).edited).toBe(false);
    expect(getPrefillChanges(baseline, reordered).fields).toEqual([]);
  });
  it('detects new rows with blank IDs and rejects forged IDs', () => {
    const newRows = {
      ...baseline, officer_name: [...(baseline.officer_name as string[]), 'New Director'],
      officer_record_id: baseline.officer_record_id,
    };
    const protectedAnswers = protectPrefillAnswers(newRows, baseline);
    expect(protectedAnswers.officer_record_id).toEqual(['o1', 'o2', 'auditor:c1', '']);
    expect(getPrefillChanges(baseline, protectedAnswers).addedRows).toMatchObject([
      { section: 'officers_section', label: 'New Director' },
    ]);
    expect(() => protectPrefillAnswers({ ...baseline, officer_record_id: ['forged'] }, baseline)).toThrow('Invalid record ID');
    expect(() => protectPrefillAnswers({ ...baseline, officer_record_id: ['o1', 'o1'] }, baseline)).toThrow('Invalid record ID');
  });
  it('tracks removed rows and can Undo the removal', () => {
    const removed = { ...baseline };
    for (const key of ['officer_record_id', 'officer_role', 'officer_name', 'officer_id_number', 'officer_nationality', 'officer_address', 'officer_appointment_date']) {
      removed[key] = (baseline[key] as unknown[]).slice(1);
    }
    expect(getPrefillChanges(baseline, removed).removedRows).toMatchObject([{ section: 'officers_section', recordId: 'o1', label: 'Alice' }]);
    const restored = undoRemovedPrefillRow(baseline, removed, 'officers_section', 'o1');
    expect((restored.officer_record_id as string[]).at(-1)).toBe('o1');
    expect(getPrefillChanges(baseline, restored).removedRows).toEqual([]);
  });
  it('restores the authoritative source marker and as-at text', () => {
    const input = { ...baseline, prefill_source: 'other', record_as_at: 'forged date' };
    const result = protectPrefillAnswers(input, baseline);
    expect(result.prefill_source).toBe('company_record');
    expect(result.record_as_at).toBe(baseline.record_as_at);
  });
  it('preserves hidden record IDs through sanitization and conditional pruning', () => {
    const draftFields = buildSgAnnualReturnDeclarationFields();
    const answerFields = draftFields.map((field) => ({
      ...field, id: field.key || '', key: field.key || '',
      inputType: field.inputType || null,
      options: field.options || null, validation: field.validation || null,
      condition: field.condition || null,
    })) as unknown as FormField[];
    const pruned = pruneHiddenConditionalAnswers(answerFields, baseline);
    const sanitized = sanitizePublicAnswers(answerFields, pruned, new Set());
    expect(sanitized.officer_record_id).toEqual(['o1', 'o2', 'auditor:c1']);
    expect(sanitized.shareholder_record_id).toEqual(['s1']);
  });
});
