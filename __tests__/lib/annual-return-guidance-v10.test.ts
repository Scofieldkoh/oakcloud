import { describe, expect, it } from 'vitest';
import { buildSgAnnualReturnDeclarationFields, SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION } from '@/lib/form-templates/sg-annual-return-declaration';
import { getAnnualReturnAgendaLabel, getPeopleCardVariantClass } from '@/lib/forms/annual-return-form-display';
import { evaluateCondition, parseChoiceOptions } from '@/lib/form-utils';
import { getDefaultMultipleChoiceValue, getDefaultSingleChoiceValue } from '@/app/(public)/forms/f/[slug]/_lib/choices';
import { saveFormFieldsSchema } from '@/lib/validations/form-builder';

const fields = buildSgAnnualReturnDeclarationFields();
const byKey = (key: string) => {
  const field = fields.find((item) => item.key === key);
  if (!field) throw new Error('Missing field ' + key);
  return field;
};
const agmAnswers = (venue: string) => ({
  company_type: 'Public Company Limited by Shares',
  company_status: 'Active',
  proposed_agm_venue: venue,
});
const visible = (key: string, answers: Record<string, unknown>) =>
  evaluateCondition(byKey(key).condition, answers, {
    fields: fields.map(({ key, condition }) => ({ key: key || '', condition })),
  });

describe('Annual Return v10 respondent guidance', () => {
  it('has valid fields, separate financial statement and AGM FAQs, and links to ACRA concepts', () => {
    expect(SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION).toBe(12);
    expect(saveFormFieldsSchema.safeParse({ fields }).success).toBe(true);
    const financial = byKey('financial_statements_faq');
    const agm = byKey('agm_faq');
    expect(financial).toMatchObject({ type: 'PARAGRAPH', inputType: 'info_faq', layoutWidth: 100 });
    expect(agm).toMatchObject({ type: 'PARAGRAPH', inputType: 'info_faq', layoutWidth: 100 });
    const texts = (field: typeof financial) => (field.options || []).map((v) =>
      typeof v === 'object' && v ? String(v.bodyHtml || '') : '').join(' ');
    expect(texts(financial)).toMatch(/S\$10 million/);
    expect(texts(financial)).toMatch(/two immediately preceding financial years/);
    expect(texts(financial)).toMatch(/S\$500,000/);
    expect(texts(financial)).toMatch(/group/);
    expect(texts(agm)).toMatch(/directors/);
    expect(texts(agm)).toMatch(/written|financial statements/i);
  });

  it('defaults to Yes but does not make short notice mandatory', () => {
    const consent = byKey('short_notice_consent');
    expect(getDefaultSingleChoiceValue(consent as Parameters<typeof getDefaultSingleChoiceValue>[0])).toBe('Yes');
    expect(consent.validation).toMatchObject({ tooltipEnabled: true });
    expect(consent.helpText).toMatch(/actually agreed/);
  });

  it('defines selectable venue options and the matching registered-address or custom field', () => {
    expect(parseChoiceOptions(byKey('proposed_agm_venue').options).map((v) => v.value)).toEqual([
      'Company registered address', 'Zoom', 'Teams', 'Google Meet', 'Slack', 'Others',
    ]);
    const registered = byKey('agm_venue_registered_address');
    expect(registered.layoutWidth).toBe(100);
    expect(registered.validation).toMatchObject({ infoInlineCard: true });
    expect(visible('agm_venue_registered_address', agmAnswers('Company registered address'))).toBe(true);
    expect(visible('proposed_agm_venue_other', agmAnswers('Company registered address'))).toBe(false);
    expect(visible('agm_venue_registered_address', agmAnswers('Others'))).toBe(false);
    expect(visible('proposed_agm_venue_other', agmAnswers('Others'))).toBe(true);
    expect(byKey('proposed_agm_venue_other').isRequired).toBe(true);
    expect(byKey('proposed_agm_venue_other').layoutWidth).toBe(100);
    expect(visible('proposed_agm_venue_other', agmAnswers('Zoom'))).toBe(false);
  });

  it('defaults to the exact two requested AGM agenda items, with dynamic labels', () => {
    const field = byKey('agm_agenda');
    const defaults = getDefaultMultipleChoiceValue(field as Parameters<typeof getDefaultMultipleChoiceValue>[0]);
    expect(defaults).toEqual([
      'Receive and adopt the Financial Statement',
      'Re-election of directors',
    ]);
    expect(getAnnualReturnAgendaLabel(defaults)).toBe('Matters to be included in AGM agenda (Current: Default)');
    expect(getAnnualReturnAgendaLabel([...defaults].reverse())).toMatch(/Current: Default/);
    expect(getAnnualReturnAgendaLabel(['Receive and adopt the Financial Statement'])).toMatch(/Current: Custom/);
    expect(getAnnualReturnAgendaLabel([...defaults, 'Dividends'])).toMatch(/Current: Custom/);
    expect(getAnnualReturnAgendaLabel([])).toMatch(/Current: Custom/);
  });

  it('keeps a stronger alternate colour for each people card', () => {
    expect(getPeopleCardVariantClass(0)).toContain('bg-teal-100');
    expect(getPeopleCardVariantClass(1)).toContain('bg-sky-100');
    expect(getPeopleCardVariantClass(2)).toContain('bg-violet-100');
  });
});
