import { describe, expect, it } from 'vitest';
import { addIsoDateMonths } from '@/lib/forms/relative-date';
import { createEditableFormRevisionSettings, parseFormTemplateBinding } from '@/lib/form-templates';
import { evaluateCondition } from '@/lib/form-utils';
import {
  ARD_COMPANY_TYPES, buildSgAnnualReturnDeclarationFields,
  buildSgAnnualReturnDeclarationSettings,
  SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY,
} from '@/lib/form-templates/sg-annual-return-declaration';
import { fieldValidationSchema, saveFormFieldsSchema } from '@/lib/validations/form-builder';
import { getDateValidationRange } from '@/app/(public)/forms/f/[slug]/_lib/validation';

const fields = buildSgAnnualReturnDeclarationFields();
const visible = (key: string, answers: Record<string, unknown>): boolean => {
  const field = fields.find((entry) => entry.key === key);
  if (!field) throw new Error('Missing field: ' + key);
  return evaluateCondition(field.condition, answers, { fields: fields.map((item) => ({ key: item.key || '', condition: item.condition })) });
};
const base = (type: string, extras: Record<string, unknown> = {}) => ({
  company_type: type,
  company_status: 'Active',
  company_solvency: 'Solvent',
  dormant_co_check1: 'No',
  dormant_co_check2: 'No',
  exemption_check_fs_circulation: 'No',
  agm_member_request: 'No',
  agm_options: 'No',
  ...extras,
});

describe('published guided-form revisions', () => {
  it('keeps the template binding while unlocking only an editable copy', () => {
    const liveSettings = {
      template: { key: 'sg_annual_return_declaration', version: 3,
        installedAt: '2026-11-01T00:00:00Z', lockedAt: '2026-11-08T00:00:00Z',
        definitionHash: 'def123' },
      drafts: { enabled: true },
    };
    const draft = createEditableFormRevisionSettings(
      liveSettings, 'form-old', 'annual-return-declaration', '2026-11-14T10:00:00Z',
    );
    expect(parseFormTemplateBinding(draft)).toMatchObject({
      key: 'sg_annual_return_declaration', version: 3, lockedAt: null, definitionHash: null,
    });
    expect(draft.revision).toEqual({
      sourceFormId: 'form-old', sourceSlug: 'annual-return-declaration',
      createdAt: '2026-11-14T10:00:00Z',
    });
    expect(liveSettings.template.lockedAt).toBe('2026-11-08T00:00:00Z');
    expect(draft.drafts).toEqual({ enabled: true });
  });
});

describe('Annual Return Declaration guided template', () => {
  it('has a valid schema, stable unique keys, and known condition references', () => {
    expect(saveFormFieldsSchema.safeParse({ fields }).success).toBe(true);
    expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    const keys = new Set(fields.map((field) => field.key));
    const check = (condition: unknown): void => {
      if (!condition || typeof condition !== 'object') return;
      if ('fieldKey' in condition && typeof condition.fieldKey === 'string') {
        expect(keys.has(condition.fieldKey)).toBe(true);
      }
      if ('rules' in condition && Array.isArray(condition.rules)) {
        condition.rules.forEach(check);
      }
    };
    fields.forEach((field) => {
      check(field.condition);
      if (Array.isArray(field.options)) field.options.forEach((option) => {
        if (option && typeof option === 'object' && 'condition' in option) check(option.condition);
      });
    });
    expect(SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY).toBe('sg_annual_return_declaration');
  });

  it('splits the declaration into page-specific sections and groups share capital before people', () => {
    const pageKeys = fields.filter((field) =>
      field.type === 'PAGE_BREAK' && field.inputType !== 'repeat_start' && field.inputType !== 'repeat_end'
    ).map((field) => field.key);
    expect(pageKeys).toEqual([
      'page_company_records', 'page_financial_statements', 'page_agm',
      'page_director_statement', 'page_declaration',
    ]);
    const capitalIndex = fields.findIndex((field) => field.key === 'share_capital_section');
    const peopleIndex = fields.findIndex((field) => field.key === 'people_section');
    expect(capitalIndex).toBeLessThan(peopleIndex);
    const recordFields = fields.filter((field) => field.key?.startsWith('person_role_'));
    expect(recordFields).toHaveLength(6);
    const peopleRepeat = fields.find((field) => field.key === 'people_section');
    expect(peopleRepeat?.validation).toMatchObject({ repeatCompactCards: true, repeatMinItems: 1 });
  });

  it('uses the SSIC, nationality and ISO currency presets when configured', () => {
    const ssic = '12345678-1234-4234-8234-123456789abc';
    const nationality = '33333333-3333-4333-8333-333333333333';
    const currency = '44444444-4444-4444-8444-444444444444';
    const prefilled = buildSgAnnualReturnDeclarationFields({
      ssicPresetId: ssic, nationalityPresetId: nationality, currencyPresetId: currency,
    });
    expect(prefilled.find((field) => field.key === 'record_primary_activity')?.optionPresetId).toBe(ssic);
    expect(prefilled.find((field) => field.key === 'record_secondary_activity')?.optionPresetId).toBe(ssic);
    expect(prefilled.find((field) => field.key === 'person_nationality')?.optionPresetId).toBe(nationality);
    expect(prefilled.find((field) => field.key === 'capital_currency')?.optionPresetId).toBe(currency);
  });

  it('uses dropdowns for bounded values and compact widths for short answers', () => {
    const byKey = (key: string) => fields.find((field) => field.key === key)!;
    for (const key of [
      'company_type', 'company_status', 'company_solvency', 'record_entity_status', 'record_primary_activity',
      'person_role_1', 'person_kind', 'person_nationality', 'capital_class',
      'capital_currency', 'fs_audit_status', 'ceo_source',
    ]) expect(byKey(key).type).toBe('DROPDOWN');
    expect(byKey('capital_class').validation).toMatchObject({ allowCustomOption: true });
    expect(byKey('capital_currency').layoutWidth).toBe(33);
    expect(byKey('capital_shares').layoutWidth).toBe(50);
    expect(byKey('person_role_date_1').layoutWidth).toBe(33);
    expect(byKey('financial_year_end').layoutWidth).toBe(33);
    expect(byKey('sign_date').layoutWidth).toBe(33);
    expect(byKey('agm_time').inputType).toBe('time_timezone');
    expect(byKey('person_address').layoutWidth).toBe(100);
  });

  it('offers CEO selection only when no listed person holds that role', () => {
    const data = base(ARD_COMPANY_TYPES.private, { prefill_source: 'company_record', ceo_role_listed: 'No', ceo_exists: 'Yes' });
    expect(visible('ceo_exists', data)).toBe(true);
    expect(visible('ceo_source', data)).toBe(true);
    const newPerson = { ...data, ceo_source: 'New individual' };
    expect(visible('ceo_new_kyccdd', newPerson)).toBe(true);
    expect(visible('ceo_kyccdd_ack', newPerson)).toBe(true);
    expect(fields.find((field) => field.key === 'ceo_new_name')).toBeUndefined();
    expect(fields.find((field) => field.key === 'ceo_new_appointment_date')).toBeUndefined();
    const existing = { ...data, ceo_source: 'Existing listed officer' };
    expect(visible('ceo_existing_person', existing)).toBe(true);
    expect(visible('ceo_kyccdd_ack', existing)).toBe(false);
    const known = { ...data, ceo_role_listed: 'Yes' };
    expect(visible('ceo_exists', known)).toBe(false);
    expect(visible('ceo_already_recorded', known)).toBe(true);
  });

  it('does not offer written dispensation of an AGM anywhere', () => {
    const content = JSON.stringify(fields).toLowerCase();
    expect(content).not.toContain('dispense');
    expect(content).not.toContain('dispensation');
    expect(fields.map((field) => field.key)).not.toContain('agm_dispense');
  });

  it.each([ARD_COMPANY_TYPES.publicShares, ARD_COMPANY_TYPES.publicGuarantee])(
    'requires AGM and excludes circulation exemption for %s', (type) => {
      const a = base(type, { exemption_check_fs_circulation: 'Yes' });
      expect(visible('label_agm_msg', a)).toBe(true);
      expect(visible('exemption_check_fs_circulation', a)).toBe(false);
      expect(visible('agm_date', a)).toBe(true);
      expect(visible('resolution_matters', a)).toBe(false);
    });

  it('requires AGM for a private company without circulation', () => {
    const a = base(ARD_COMPANY_TYPES.private);
    expect(visible('label_agm_msg', a)).toBe(true);
    expect(visible('agm_date', a)).toBe(true);
  });

  it.each(['Yes', 'Not yet, but they will be sent within five months'])(
    'allows private-company circulation route %s', (circulation) => {
      const a = base(ARD_COMPANY_TYPES.private, {
        exemption_check_fs_circulation: circulation,
      });
      expect(visible('agm_member_request', a)).toBe(true);
      expect(visible('agm_options', a)).toBe(true);
      expect(visible('agm_date', a)).toBe(false);
      expect(visible('resolution_matters', a)).toBe(true);
      const requested = { ...a, agm_member_request: 'Yes' };
      expect(visible('agm_date', requested)).toBe(true);
      expect(visible('resolution_matters', requested)).toBe(false);
      const voluntary = { ...a, agm_options: 'Yes' };
      expect(visible('agm_date', voluntary)).toBe(true);
      expect(visible('resolution_matters', voluntary)).toBe(false);
    });

  it('allows dormant relevant private company to omit AGM and financial statements', () => {
    const a = base(ARD_COMPANY_TYPES.exemptPrivate, {
      company_status: 'Dormant', dormant_co_check1: 'Yes', dormant_co_check2: 'Yes',
    });
    expect(visible('fs_not_required_msg', a)).toBe(true);
    expect(visible('fs_ready', a)).toBe(false);
    expect(visible('resolution_matters', a)).toBe(true);
    expect(visible('dormant_confirm', a)).toBe(true);
  });

  it('allows a dormant but non-exempt private company to use circulation instead', () => {
    const a = base(ARD_COMPANY_TYPES.private, {
      company_status: 'Dormant', dormant_co_check1: 'No', dormant_co_check2: 'Yes',
      exemption_check_fs_circulation: 'Yes',
    });
    expect(visible('fs_ready', a)).toBe(true);
    expect(visible('agm_date', a)).toBe(false);
    expect(visible('resolution_matters', a)).toBe(true);
  });

  it('distinguishes solvent EPC preparation from filing', () => {
    const solvent = base(ARD_COMPANY_TYPES.exemptPrivate);
    expect(visible('fs_prepare_only_msg', solvent)).toBe(true);
    expect(visible('fs_ready', solvent)).toBe(true);
    expect(visible('label_fs_ds', solvent)).toBe(false);
    const insolvent = { ...solvent, company_solvency: 'Insolvent' };
    expect(visible('label_fs_ds', insolvent)).toBe(true);
    expect(visible('fs_prepare_only_msg', insolvent)).toBe(false);
    expect(visible('label_fs_ds', base(ARD_COMPANY_TYPES.private))).toBe(true);
  });

  it('asks signed date only when statements are ready', () => {
    const a = base(ARD_COMPANY_TYPES.private, { fs_ready: 'Yes' });
    expect(visible('date_of_financial_statement', a)).toBe(true);
    expect(visible('date_fs_ds', a)).toBe(false);
    expect(visible('attachment_fs_ds', a)).toBe(true);
    const pending = { ...a, fs_ready: 'No' };
    expect(visible('date_of_financial_statement', pending)).toBe(false);
    expect(visible('date_fs_ds', pending)).toBe(true);
  });

  it('asks 2026 particulars and CEO questions, with limited guarantee member count', () => {
    const ordinary = base(ARD_COMPANY_TYPES.private, { ceo_exists: 'Yes', particulars_accurate: 'No' });
    expect(visible('ceo_exists', ordinary)).toBe(true);
    expect(visible('ceo_manual_kyccdd', ordinary)).toBe(true);
    expect(fields.find((field) => field.key === 'ceo_details')).toBeUndefined();
    expect(visible('particulars_accurate', ordinary)).toBe(true);
    expect(visible('particulars_changes', ordinary)).toBe(true);
    expect(visible('guarantee_member_count', ordinary)).toBe(false);
    expect(visible('guarantee_member_count', base(ARD_COMPANY_TYPES.publicGuarantee))).toBe(true);
  });

  it('uses calendar-month bounds from the financial year end', () => {
    const field = fields.find((entry) => entry.key === 'date_fs_circulation')!;
    for (const [fye, expected] of [
      ['2025-09-30', '2026-02-28'],
      ['2023-09-30', '2024-02-29'],
      ['2026-08-31', '2027-01-31'],
      ['2026-03-31', '2026-08-31'],
    ]) {
      expect(getDateValidationRange({ ...field, validation: { ...field.validation, maxDate: undefined } } as Parameters<typeof getDateValidationRange>[0], {
        financial_year_end: fye,
        date_of_financial_statement: fye,
      }).maxDate).toBe(expected);
    }
    expect(buildSgAnnualReturnDeclarationSettings().drafts).toEqual({ enabled: true, autoDeleteDays: 30 });
  });
});

describe('calendar-month offset support', () => {
  it.each([
    ['2025-09-30', 5, '2026-02-28'],
    ['2023-09-30', 5, '2024-02-29'],
    ['2026-08-31', 5, '2027-01-31'],
    ['2026-03-31', 5, '2026-08-31'],
    ['2024-03-31', -1, '2024-02-29'],
  ])('clamps %s plus %i months to %s', (date, months, expected) => {
    expect(addIsoDateMonths(date, months)).toBe(expected);
  });
  it('validates month offset bounds and requires a source field', () => {
    expect(fieldValidationSchema.safeParse({ maxDateOffsetMonths: 5 }).success).toBe(false);
    expect(fieldValidationSchema.safeParse({ maxDateOffsetMonths: 121, maxDateFieldKey: 'fye' }).success).toBe(false);
    expect(fieldValidationSchema.safeParse({ maxDateOffsetMonths: 5, maxDateFieldKey: 'fye' }).success).toBe(true);
  });
});
