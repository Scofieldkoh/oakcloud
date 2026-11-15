import { describe, expect, it } from 'vitest';
import {
  PEOPLE_CARD_VARIANT_CLASSES,
  getPeopleCardVariantClass,
  shouldShowLongDropdownSelection,
} from '@/lib/forms/annual-return-form-display';

describe('Annual Return public form presentation', () => {
  it('never duplicates the selected SSIC label below its dropdown', () => {
    const longLabel = '62011 - Development of software and applications (except games and cybersecurity)';
    expect(shouldShowLongDropdownSelection('record_primary_activity', longLabel)).toBe(false);
    expect(shouldShowLongDropdownSelection('record_secondary_activity', longLabel)).toBe(false);
    expect(shouldShowLongDropdownSelection('some_other_dropdown', longLabel)).toBe(true);
    expect(shouldShowLongDropdownSelection('some_other_dropdown', 'Short')).toBe(false);
    expect(shouldShowLongDropdownSelection('some_other_dropdown', null)).toBe(false);
  });

  it('gives adjacent people different gentle card colours and cycles for long lists', () => {
    expect(PEOPLE_CARD_VARIANT_CLASSES).toHaveLength(3);
    expect(getPeopleCardVariantClass(0)).not.toBe(getPeopleCardVariantClass(1));
    expect(getPeopleCardVariantClass(1)).not.toBe(getPeopleCardVariantClass(2));
    expect(getPeopleCardVariantClass(3)).toBe(getPeopleCardVariantClass(0));
    expect(getPeopleCardVariantClass(49)).toBe(getPeopleCardVariantClass(1));
    for (const className of PEOPLE_CARD_VARIANT_CLASSES) {
      expect(className).not.toContain('border-l-');
      expect(className).not.toContain('dark:border-l-');
      expect(className).toContain('dark:');
      expect(className).toContain('bg-');
    }
  });
});
