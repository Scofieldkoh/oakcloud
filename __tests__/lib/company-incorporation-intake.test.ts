import { describe, expect, it } from 'vitest';
import {
  decimalUnits,
  formatDecimalUnits,
  parseDecimalString,
} from '@/lib/forms/decimal-string';
import { evaluateCompanyIncorporationAnswers } from '@/lib/forms/company-incorporation-profile';
import {
  ACRA_GUIDANCE_LINKS,
  INCORPORATION_KEYS as K,
  SG_COMPANY_INCORPORATION_GUIDANCE,
  buildSgCompanyIncorporationFields,
  buildSgCompanyIncorporationSettings,
} from '@/lib/form-templates/sg-company-incorporation';
import { parseFormTemplateBinding, preserveFormTemplateBinding } from '@/lib/form-templates';
import { parseFormCompletionSettings, parseFormNotificationSettings } from '@/lib/form-utils';
import { evaluateIncorporationReadiness, INCORPORATION_CHECKLIST_AREAS, emptyIncorporationReview } from '@/lib/forms/company-incorporation-review';
import { parseNameCheckResultValue } from '@/lib/forms/name-check-result';
import { saveFormFieldsSchema } from '@/lib/validations/form-builder';

const TODAY = '2026-09-29';

function validAnswers(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [K.contactName]: 'Tan Mei Ling',
    [K.contactEmail]: 'mei@example.com',
    [K.companyEmail]: 'hello@harbourlane.sg',
    [K.companyType]: 'private_limited',
    [K.proposedName]: 'Harbour Lane Pte. Ltd.',
    [K.primarySsic]: '62011',
    [K.businessDescription]: 'Software development for logistics firms',
    [K.partyKind]: ['individual', 'individual'],
    [K.partyName]: ['Tan Mei Ling', 'Lim Wei Jie'],
    [K.partyRoles]: [['shareholder', 'director'], ['shareholder']],
    [K.ownershipPercent]: ['60', '40'],
    [K.partyResident]: [['yes'], []],
    [K.capitalAmount]: '1000',
    [K.capitalCurrency]: 'SGD',
    [K.shareCount]: '1000',
    [K.capitalFullyPaid]: 'yes',
    [K.officeChoice]: 'firm_service',
    [K.firstFye]: '2027-06-30',
    [K.rulesPreference]: 'acra_model',
    ...overrides,
  };
}

const availableCheck = {
  name: 'Harbour Lane Pte. Ltd.',
  available: true,
  assessment: 'AVAILABLE' as const,
  checkedAt: '2026-09-29T00:00:00.000Z',
  dataAsOf: '2026-09-28',
  records: [],
  reasonCodes: [],
};

const nameChecks = { [K.proposedName]: availableCheck };

function errors(answers: Record<string, unknown>, options = {}) {
  return evaluateCompanyIncorporationAnswers(answers, { today: TODAY, nameChecks, ...options })
    .issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code);
}

describe('decimal strings', () => {
  it('sums percentages exactly without floating point drift', () => {
    const total = ['33.333333', '33.333333', '33.333334']
      .map((value) => parseDecimalString(value) as bigint)
      .reduce((sum, value) => sum + value, BigInt(0));
    expect(total).toBe(decimalUnits(100));
    expect(formatDecimalUnits(parseDecimalString('0.1')! + parseDecimalString('0.2')!)).toBe('0.3');
  });

  it('rejects signs, exponents and excess precision', () => {
    expect(parseDecimalString('-5')).toBeNull();
    expect(parseDecimalString('1e3')).toBeNull();
    expect(parseDecimalString('1.0000001')).toBeNull();
    expect(parseDecimalString('1,000.50')).toBe(parseDecimalString('1000.5'));
  });
});

describe('company incorporation profile', () => {
  it('accepts a complete intake and works out each shareholder’s shares', () => {
    const result = evaluateCompanyIncorporationAnswers(validAnswers(), { today: TODAY, nameChecks });
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.ownershipTotal).toBe('100');
    expect(result.parties.map((party) => [party.name, party.shares, party.resident])).toEqual([
      ['Tan Mei Ling', '600', true],
      ['Lim Wei Jie', '400', false],
    ]);
  });

  it('blocks shareholdings that do not add up to exactly 100%', () => {
    expect(errors(validAnswers({ [K.ownershipPercent]: ['60', '30'] }))).toContain('ownership_total');
    expect(errors(validAnswers({ [K.ownershipPercent]: ['60', ''] }))).toContain('ownership_invalid');
  });

  it('requires at least one individual director and one shareholder', () => {
    expect(errors(validAnswers({ [K.partyRoles]: [['shareholder'], ['shareholder']] }))).toContain('no_director');
    expect(errors(validAnswers({
      [K.partyRoles]: [['director'], ['director']],
      [K.ownershipPercent]: ['', ''],
    }))).toContain('no_shareholder');
    expect(errors(validAnswers({ [K.partyName]: [], [K.partyKind]: [], [K.partyRoles]: [], [K.ownershipPercent]: [] }))).toContain('no_parties');
  });

  it('counts a managing director as a director and accepts the other officer roles', () => {
    expect(errors(validAnswers({ [K.partyRoles]: [['shareholder', 'managing_director', 'ceo'], ['shareholder', 'secretary']] }))).toEqual([]);
  });

  it('lets a company be a shareholder only', () => {
    expect(errors(validAnswers({
      [K.partyKind]: ['individual', 'organisation'],
      [K.partyRoles]: [['shareholder', 'director'], ['shareholder', 'director']],
    }))).toContain('organisation_officer');
    expect(errors(validAnswers({ [K.partyKind]: ['individual', 'organisation'] }))).toEqual([]);
  });

  it('requires a Singapore-resident director unless our nominee director service is ticked', () => {
    const noResident = validAnswers({ [K.partyResident]: [[], []] });
    expect(errors(noResident)).toContain('no_resident_director');
    expect(errors({ ...noResident, [K.nomineeDirectorService]: ['yes'] })).toEqual([]);
  });

  it('asks who a nominee acts for', () => {
    expect(errors(validAnswers({ [K.partyNomineeShareholder]: [[], ['yes']] }))).toContain('nominator_missing');
    expect(errors(validAnswers({ [K.partyNomineeShareholder]: [[], ['yes']], [K.partyNominator]: ['', 'Chen Holdings'] }))).toEqual([]);
  });

  it('stops a secretary who is also the only director', () => {
    expect(errors(validAnswers({ [K.partyRoles]: [['shareholder', 'director', 'secretary'], ['shareholder']] }))).toContain('secretary_sole_director');
  });

  it('checks the name ending against the company type, including alternative names', () => {
    expect(errors(validAnswers({ [K.proposedName]: 'Harbour Lane' }))).toContain('name_suffix');
    expect(errors(validAnswers({ [K.alternativeName1]: 'Harbour Lane Private Limited' }))).toEqual([]);
    expect(errors(validAnswers({ [K.alternativeName1]: 'Harbour Lane Holdings' }))).toContain('name_suffix');
    expect(errors(validAnswers({ [K.companyType]: 'public_limited' }))).toContain('name_suffix');
    expect(errors(validAnswers({ [K.companyType]: 'public_limited', [K.proposedName]: 'Harbour Lane Limited' }))).toEqual([]);
    expect(errors(validAnswers({ [K.alternativeName2]: 'harbour lane pte. ltd.' }))).toContain('name_repeated');
  });

  it('flags unchecked alternative names for staff without blocking', () => {
    const result = evaluateCompanyIncorporationAnswers(validAnswers({ [K.alternativeName1]: 'Quayside Pte. Ltd.' }), { today: TODAY, nameChecks });
    expect(result.issues.find((issue) => issue.fieldKey === K.alternativeName1)).toMatchObject({ code: 'name_not_checked', severity: 'staff_review' });
  });

  it('blocks a number of shares that would split a shareholding', () => {
    expect(errors(validAnswers({ [K.ownershipPercent]: ['66.666667', '33.333333'] }))).toContain('share_count_fractional');
    expect(errors(validAnswers({ [K.shareCount]: '0' }))).toContain('share_count_invalid');
    expect(errors(validAnswers({ [K.shareCount]: '10' }))).toEqual([]);
  });

  it('requires a primary activity and checks SSIC codes against the catalogue', () => {
    const ssicCodes = new Set(['62011', '62021']);
    expect(errors(validAnswers({ [K.primarySsic]: '' }))).toContain('ssic_primary_missing');
    expect(errors(validAnswers({ [K.primarySsic]: '99999' }), { ssicCodes })).toContain('ssic_primary_unknown');
    expect(errors(validAnswers({ [K.secondarySsic]: '62011' }), { ssicCodes })).toContain('ssic_secondary_duplicate');
    expect(errors(validAnswers({ [K.secondarySsic]: '62021' }), { ssicCodes })).toEqual([]);
  });

  it('rejects forged option values from a direct API call', () => {
    expect(errors(validAnswers({ [K.officeChoice]: 'somewhere_else' }))).toContain('invalid_option');
    expect(errors(validAnswers({ [K.partyRoles]: [['shareholder', 'director', 'coo'], ['shareholder']] }))).toContain('invalid_option');
  });

  it('validates the postal code, paid-up amount and first FYE', () => {
    expect(errors(validAnswers({ [K.officeChoice]: 'own_address', [K.officePostalCode]: '12345' }))).toContain('office_postal_code_invalid');
    expect(errors(validAnswers({ [K.capitalFullyPaid]: 'no', [K.capitalPaidAmount]: '2000' }))).toContain('paid_not_partial');
    expect(errors(validAnswers({ [K.capitalFullyPaid]: 'no', [K.capitalPaidAmount]: '100' }))).toEqual([]);
    expect(errors(validAnswers({ [K.firstFye]: '2027-02-30' }))).toContain('fye_invalid');
    const far = evaluateCompanyIncorporationAnswers(validAnswers({ [K.firstFye]: '2028-06-30' }), { today: TODAY, nameChecks });
    expect(far.issues.find((issue) => issue.code === 'fye_over_18_months')?.severity).toBe('staff_review');
  });
});

describe('company incorporation template', () => {
  const fields = buildSgCompanyIncorporationFields({ firmName: 'Oaktree', ssicPresetId: '00000000-0000-4000-8000-000000000001' });

  it('compiles through the form builder schema with unique keys', () => {
    const parsed = saveFormFieldsSchema.parse({ fields });
    const keys = parsed.fields.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of Object.values(K)) {
      expect(keys).toContain(key);
    }
    expect(parsed.fields.filter((field) => field.type === 'PAGE_BREAK' && !field.inputType?.startsWith('repeat')).length).toBe(3);
  });

  it('publishes every ACRA guidance link on its field', () => {
    const text = fields.map((field) => `${field.subtext ?? ''} ${field.helpText ?? ''}`).join(' ');
    for (const item of SG_COMPANY_INCORPORATION_GUIDANCE) {
      for (const entry of item.links) {
        expect(text).toContain(entry.url);
      }
    }
    for (const url of Object.values(ACRA_GUIDANCE_LINKS)) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('keeps side-by-side fields the same height by moving help into tooltips', () => {
    const inputs = fields.filter((field) => !['PAGE_BREAK', 'PARAGRAPH', 'HTML'].includes(field.type));
    expect(inputs.filter((field) => (field.layoutWidth ?? 100) < 100 && field.subtext).map((field) => field.key)).toEqual([]);
  });

  it('offers no "not sure" or "pending" style options', () => {
    const labels = fields.flatMap((field) => (field.options ?? []).map((option) => (typeof option === 'string' ? option : String(option.label))));
    expect(labels.filter((label) => /not (sure|finali[sz]ed)|pending|need advice|being prepared|arrangement/i.test(label))).toEqual([]);
  });

  it('asks for no identity documents, signatures or declarations', () => {
    expect(fields.some((field) => field.type === 'FILE_UPLOAD' && field.key !== K.customConstitution)).toBe(false);
    expect(fields.some((field) => field.type === 'SIGNATURE')).toBe(false);
    expect(fields.some((field) => /passport number|nric number|date of birth/i.test(field.label ?? ''))).toBe(false);
  });

  it('uses link-only notifications and a review step', () => {
    const settings = buildSgCompanyIncorporationSettings({ firmName: 'Oaktree' });
    expect(parseFormNotificationSettings(settings).attachmentMode).toBe('link_only');
    expect(parseFormCompletionSettings(settings).reviewStep).toBe(true);
  });
});

describe('template binding', () => {
  const binding = { key: 'sg_company_incorporation', version: 1, installedAt: '2026-09-29T00:00:00.000Z', definitionHash: null, lockedAt: null };

  it('keeps the stored binding when the builder saves settings', () => {
    const next = preserveFormTemplateBinding({ hideLogo: true, template: { key: 'forged', version: 9 } }, { template: binding });
    expect(parseFormTemplateBinding(next)).toEqual(binding);
    expect(next?.hideLogo).toBe(true);
  });

  it('never lets a client add a binding', () => {
    const next = preserveFormTemplateBinding({ template: binding }, {});
    expect(next?.template).toBeUndefined();
  });
});

describe('name check results', () => {
  it('derives an assessment for results stored before assessments existed', () => {
    expect(parseNameCheckResultValue({ name: 'A', available: true, checkedAt: 'x', records: [] })?.assessment).toBe('AVAILABLE');
    expect(parseNameCheckResultValue({ name: 'A', available: false, checkedAt: 'x', records: [] })?.assessment).not.toBe('AVAILABLE');
  });
});

describe('incorporation readiness', () => {
  it('is never ready from intake answers alone', () => {
    const readiness = evaluateIncorporationReadiness({ review: emptyIncorporationReview(), linkStatus: {} });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.length).toBeGreaterThanOrEqual(INCORPORATION_CHECKLIST_AREAS.length);
  });

  it('is ready once every area is confirmed and each person has a verified, complete KYC link', () => {
    const decisions = Object.fromEntries(INCORPORATION_CHECKLIST_AREAS.map((area) => [
      area.key,
      { state: 'satisfied' as const, note: null, decidedBy: null, decidedAt: TODAY },
    ]));
    const subject = { subjectId: 's1', origin: 'staff' as const, partyRowId: null, kind: 'organisation' as const, name: 'Holdco Ltd', roles: ['controller'], createdAt: TODAY, createdBy: null };
    const link = {
      sourceKind: 'manual' as const,
      sourceId: null,
      sourceFormId: null,
      sourceLabel: 'SharePoint',
      sourceVersion: null,
      manualLocation: 'SharePoint',
      coverage: { registration: true, registered_address: true, authority: true, ownership_chain: true },
      reviewState: 'verified' as const,
      notes: null,
      reviewedBy: null,
      reviewedAt: TODAY,
    };
    const review = { ...emptyIncorporationReview(), subjects: [subject], decisions, kycLinks: { s1: link } };
    expect(evaluateIncorporationReadiness({ review, linkStatus: { s1: { stale: false, staleReason: null } } })).toEqual({ ready: true, blockers: [] });
    expect(evaluateIncorporationReadiness({ review, linkStatus: { s1: { stale: true, staleReason: 'changed since it was reviewed' } } }).ready).toBe(false);
    const partial = { ...review, kycLinks: { s1: { ...link, coverage: { registration: true } } } };
    expect(evaluateIncorporationReadiness({ review: partial, linkStatus: {} }).ready).toBe(false);
  });
});
