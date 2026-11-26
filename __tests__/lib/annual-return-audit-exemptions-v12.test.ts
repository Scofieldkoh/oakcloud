import { describe, expect, it } from 'vitest';
import type { FormField } from '@/generated/prisma';
import {
  buildSgAnnualReturnDeclarationFields,
  SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION,
} from '@/lib/form-templates/sg-annual-return-declaration';
import { getMinSelectedChoicesError } from '@/lib/forms/choice-validation';
import { evaluateCondition } from '@/lib/form-utils';
import { saveFormFieldsSchema } from '@/lib/validations/form-builder';
import { validateRequiredPublicAnswers } from '@/services/form-submission/validation';

const fields = buildSgAnnualReturnDeclarationFields();
const exemptionKeys = new Set([
  'fs_small_company_thresholds',
  'fs_small_company_in_group',
  'fs_small_group_thresholds',
  'fs_small_group_declaration',
  'fs_dormant_audit_since',
]);
const exemptionFields = fields.filter((field) => exemptionKeys.has(field.key || '')) as unknown as FormField[];
const byKey = (key: string) => {
  const field = fields.find((item) => item.key === key);
  if (!field) throw new Error('Missing ' + key);
  return field;
};
const allChoices = (key: string) => (byKey(key).options || []).map((option) => typeof option === 'string'
  ? option : option.value || option.label);
const smallAnswers = {
  fs_audit_status: 'Not audited (small company exemption)',
  company_type: 'Private Company Limited by Shares',
  company_status: 'Active',
  fs_small_company_thresholds: allChoices('fs_small_company_thresholds').slice(0, 2),
  fs_small_company_in_group: 'No',
};
const dormantAnswers = {
  fs_audit_status: 'Not audited (dormant company exemption)',
  company_status: 'Dormant',
  fs_dormant_audit_since: 'The end of the previous financial year',
};
const required = (answers: Record<string, unknown>) =>
  validateRequiredPublicAnswers(exemptionFields, answers, new Set());

describe('Annual Return v12 simplified audit exemption requirements', () => {
  it('preserves the remaining eligibility checks and uses template v12', () => {
    expect(SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION).toBe(13);
    expect(saveFormFieldsSchema.safeParse({ fields }).success).toBe(true);
    expect(byKey('fs_small_company_thresholds').validation).toMatchObject({ minSelectedOptions: 2 });
    expect(byKey('fs_small_group_thresholds').validation).toMatchObject({ minSelectedOptions: 2 });
    expect(byKey('fs_small_group_declaration').validation).toMatchObject({ minSelectedOptions: 1 });
  });

  it('requires 2 of 3 actual company criteria without requiring any particular one', () => {
    const criteria = allChoices('fs_small_company_thresholds');
    expect(criteria).toHaveLength(3);
    required(smallAnswers);
    required({ ...smallAnswers, fs_small_company_thresholds: [criteria[0], criteria[2]] });
    required({ ...smallAnswers, fs_small_company_thresholds: [criteria[1], criteria[2]] });
    expect(() => required({ ...smallAnswers, fs_small_company_thresholds: [criteria[0]] }))
      .toThrow(/at least 2 conditions/);
    expect(() => required({ ...smallAnswers, fs_small_company_thresholds: [criteria[0], criteria[0]] }))
      .toThrow(/at least 2 conditions/);
    expect(() => required({ ...smallAnswers, fs_small_company_thresholds: [criteria[0], 'Made up test'] }))
      .toThrow(/at least 2 conditions/);
  });

  it('removes both additional declaration checklists without weakening the remaining thresholds', () => {
    const keys = new Set(fields.map((field) => field.key));
    expect(keys.has('fs_small_company_declarations')).toBe(false);
    expect(keys.has('fs_dormant_audit_declarations')).toBe(false);

    required(smallAnswers);
    required(dormantAnswers);
    expect(() => required({ ...smallAnswers, fs_small_company_thresholds: [] }))
      .toThrow(/at least 2 conditions/);
  });

  it('requires a separate whole-group two-out-of-three test when group membership is Yes', () => {
    const groupCriteria = allChoices('fs_small_group_thresholds');
    expect(groupCriteria).toHaveLength(3);
    expect(() => required({ ...smallAnswers, fs_small_company_in_group: 'Yes' }))
      .toThrow(/at least 2 conditions/);
    expect(() => required({
      ...smallAnswers, fs_small_company_in_group: 'Yes',
      fs_small_group_thresholds: groupCriteria.slice(0, 2),
    })).toThrow(/at least 1 condition/);
    required({
      ...smallAnswers, fs_small_company_in_group: 'Yes',
      fs_small_group_thresholds: groupCriteria.slice(0, 2),
      fs_small_group_declaration: allChoices('fs_small_group_declaration'),
    });
    required(smallAnswers); // No group: the extra checklist is not required.
  });

  it('requires only the dormancy start point on the dormant audit exemption route', () => {
    required(dormantAnswers);
    expect(() => required({ ...dormantAnswers, fs_dormant_audit_since: '' }))
      .toThrow(/dormant since which point/i);
  });

  it('hides other exemption tests when Audited is selected, and does not enforce hidden answers', () => {
    const audited = {
      ...smallAnswers, fs_audit_status: 'Audited',
      fs_small_company_thresholds: [],
      fs_small_company_in_group: undefined,
    };
    required(audited);
    for (const field of exemptionFields) {
      expect(evaluateCondition(field.condition as Parameters<typeof evaluateCondition>[0], audited, { fields: exemptionFields }))
        .toBe(false);
    }
    const selected = { ...smallAnswers };
    expect(evaluateCondition(byKey('fs_small_company_thresholds').condition, selected)).toBe(true);
    expect(evaluateCondition(byKey('fs_dormant_audit_since').condition, selected)).toBe(false);
  });

  it('counts only distinct configured choices, including nested-answer object representation', () => {
    const field = byKey('fs_small_company_thresholds');
    const [revenue, assets] = allChoices('fs_small_company_thresholds');
    expect(getMinSelectedChoicesError(field, [revenue])).toMatch(/at least 2 conditions/);
    expect(getMinSelectedChoicesError(field, [revenue, revenue])).toMatch(/at least 2 conditions/);
    expect(getMinSelectedChoicesError(field, [revenue, 'irrelevant'])).toMatch(/at least 2 conditions/);
    expect(getMinSelectedChoicesError(field, [revenue, { value: assets }])).toBeNull();
  });
});
