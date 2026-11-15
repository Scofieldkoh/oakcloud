import { describe, expect, it } from 'vitest';
import { suggestFieldLayoutWidth, type BuilderField } from '@/components/forms/builder-utils';

function sample(key: string, type: BuilderField['type'], inputType: BuilderField['inputType'] = 'text') {
  return { key, label: key, type, inputType, options: [], validation: null };
}
describe('Form Builder compact width suggestions', () => {
  it('suggests narrow space for short values', () => {
    expect(suggestFieldLayoutWidth(sample('company_uen', 'SHORT_TEXT'))).toBe(33);
    expect(suggestFieldLayoutWidth(sample('financial_year_end', 'SHORT_TEXT', 'date'))).toBe(33);
    expect(suggestFieldLayoutWidth(sample('number_of_shares', 'SHORT_TEXT', 'number'))).toBe(33);
    expect(suggestFieldLayoutWidth(sample('capital_currency', 'DROPDOWN'))).toBe(33);
  });
  it('keeps long text and choice groups readable', () => {
    expect(suggestFieldLayoutWidth(sample('registered_office_address', 'LONG_TEXT'))).toBe(100);
    expect(suggestFieldLayoutWidth({
      ...sample('dormancy', 'SINGLE_CHOICE'),
      validation: { choiceInlineRight: true },
    })).toBe(100);
    expect(suggestFieldLayoutWidth(sample('agm_time', 'SHORT_TEXT', 'time_timezone'))).toBe(50);
  });
});
