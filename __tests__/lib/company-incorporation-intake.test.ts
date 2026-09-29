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
    [K.proposedName]: 'Harbour Lane Pte. Ltd.',
    [K.nameStatus]: 'not_reserved',
    [K.primarySsic]: '62011',
    [K.businessDescription]: 'Software development for logistics firms',
    [K.partyKind]: ['individual', 'individual'],
    [K.partyName]: ['Tan Mei Ling', 'Lim Wei Jie'],
    [K.partyRoles]: [['shareholder', 'director'], ['shareholder']],
    [K.ownershipPercent]: ['66.666667', '33.333333'],
    [K.ownershipUnsure]: [[], []],
    [K.capitalAmount]: '1000',
    [K.capitalCurrency]: 'SGD',
    [K.capitalPaidStatus]: 'fully_paid',
    [K.officeChoice]: 'firm_service',
    [K.secretaryChoice]: 'firm_to_arrange',
    [K.yearEndChoice]: 'select_date',
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

function errors(answers: Record<string, unknown>, options = {}) {
  return evaluateCompanyIncorporationAnswers(answers, { today: TODAY, nameCheck: availableCheck, ...options })
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
  it('accepts a complete intake with ownership totalling 100%', () => {
    const result = evaluateCompanyIncorporationAnswers(validAnswers(), { today: TODAY, nameCheck: availableCheck });
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.ownershipTotal).toBe('100');
    expect(result.ownershipFullyDecided).toBe(true);
    expect(result.parties.map((party) => party.name)).toEqual(['Tan Mei Ling', 'Lim Wei Jie']);
  });

  it('blocks a fully decided total that is not 100%', () => {
    expect(errors(validAnswers({ [K.ownershipPercent]: ['60', '30'] }))).toContain('ownership_total');
  });

  it('lets undecided shareholders through as needing information', () => {
    const result = evaluateCompanyIncorporationAnswers(validAnswers({
      [K.ownershipPercent]: ['60', ''],
      [K.ownershipUnsure]: [[], ['yes']],
    }), { today: TODAY, nameCheck: availableCheck });
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toContain('ownership_undecided');
    expect(result.ownershipFullyDecided).toBe(false);
  });

  it('rejects an organisation as a director', () => {
    expect(errors(validAnswers({ [K.partyKind]: ['organisation', 'individual'] }))).toContain('organisation_director');
  });

  it('requires a primary activity unless an exception with a reason is given', () => {
    expect(errors(validAnswers({ [K.primarySsic]: '' }))).toContain('ssic_primary_missing');
    expect(errors(validAnswers({ [K.primarySsic]: '', [K.primarySsicException]: 'no_suitable_code' }))).toContain('ssic_exception_reason_missing');
    expect(errors(validAnswers({
      [K.primarySsic]: '',
      [K.primarySsicException]: 'no_suitable_code',
      [K.primarySsicExceptionReason]: 'Specialised marine research',
    }))).toEqual([]);
  });

  it('checks SSIC codes against the catalogue and rejects a duplicate secondary', () => {
    const ssicCodes = new Set(['62011', '62021']);
    expect(errors(validAnswers({ [K.primarySsic]: '99999' }), { ssicCodes })).toContain('ssic_primary_unknown');
    expect(errors(validAnswers({ [K.secondarySsic]: '62011' }), { ssicCodes })).toContain('ssic_secondary_duplicate');
    expect(errors(validAnswers({ [K.secondarySsic]: '62021' }), { ssicCodes })).toEqual([]);
  });

  it('rejects forged option values from a direct API call', () => {
    expect(errors(validAnswers({ [K.officeChoice]: 'somewhere_else' }))).toContain('invalid_option');
    expect(errors(validAnswers({ [K.partyRoles]: [['shareholder', 'ceo'], ['shareholder']] }))).toContain('invalid_option');
  });

  it('flags a name that has not been checked for staff without blocking', () => {
    const result = evaluateCompanyIncorporationAnswers(validAnswers(), { today: TODAY, nameCheck: null });
    expect(result.issues.find((issue) => issue.code === 'name_not_checked')?.severity).toBe('staff_review');
  });

  it('validates office hours, paid-up capital and the first FYE', () => {
    expect(errors(validAnswers({
      [K.officeChoice]: 'own_address',
      [K.officePostalCode]: '12345',
      [K.officeOpenTime]: { time: '09:00' },
      [K.officeCloseTime]: { time: '11:00' },
    }))).toEqual(expect.arrayContaining(['office_postal_code_invalid', 'office_hours_too_short']));
    expect(errors(validAnswers({ [K.capitalPaidStatus]: 'partially_paid', [K.capitalPaidAmount]: '2000' }))).toContain('paid_exceeds_capital');
    expect(errors(validAnswers({ [K.firstFye]: '2027-02-30' }))).toContain('fye_invalid');
    const far = evaluateCompanyIncorporationAnswers(validAnswers({ [K.firstFye]: '2028-06-30' }), { today: TODAY, nameCheck: availableCheck });
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

  it('asks for no identity documents, signatures or declarations', () => {
    expect(fields.some((field) => field.type === 'FILE_UPLOAD' && field.key !== K.customConstitution && field.key !== K.existingShareSchedule)).toBe(false);
    expect(fields.some((field) => field.type === 'SIGNATURE')).toBe(false);
    expect(fields.some((field) => /passport|nric|date of birth/i.test(field.label ?? ''))).toBe(false);
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
