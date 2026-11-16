import { describe, expect, it } from 'vitest';
import {
  PEOPLE_CARD_VARIANT_CLASSES,
  ANNUAL_RETURN_READ_ONLY_FIELD_CLASSES,
  formatRecordedCapitalAmount,
  formatRecordedShareQuantity,
  getPeopleCardVariantClass,
  orderRecordedPositionFields,
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
  it('pairs positions 1–3 with their appointment dates even in older stored v7 field order', () => {
    const fields = [
      'person_name', 'person_role_1', 'person_role_2', 'person_role_3',
      'person_role_date_1', 'person_role_date_2', 'person_role_date_3',
      'person_additional_positions', 'person_shareholding',
    ].map((key) => ({ key, value: 'existing' }));
    expect(orderRecordedPositionFields(fields).map((field) => field.key)).toEqual([
      'person_name',
      'person_role_1', 'person_role_date_1',
      'person_role_2', 'person_role_date_2',
      'person_role_3', 'person_role_date_3',
      'person_additional_positions', 'person_shareholding',
    ]);
    expect(orderRecordedPositionFields(fields)[1]).toBe(fields[1]);
  });

  it('formats shares with thousands separators without losing integer precision', () => {
    expect(formatRecordedShareQuantity('10000')).toBe('10,000');
    expect(formatRecordedShareQuantity('12345678901234567890')).toBe('12,345,678,901,234,567,890');
    expect(formatRecordedShareQuantity('00050')).toBe('50');
    expect(formatRecordedShareQuantity(123456)).toBe('123,456');
    expect(formatRecordedShareQuantity('')).toBe('');
    expect(formatRecordedShareQuantity('not a number')).toBe('not a number');
    expect(formatRecordedShareQuantity('10.25')).toBe('10.25');
  });

  it('formats issued and paid-up amounts with thousands separators and exact decimals', () => {
    expect(formatRecordedCapitalAmount('10000')).toBe('10,000');
    expect(formatRecordedCapitalAmount('10000.50')).toBe('10,000.50');
    expect(formatRecordedCapitalAmount('1234567.000')).toBe('1,234,567.000');
    expect(formatRecordedCapitalAmount('000050.30')).toBe('50.30');
    expect(formatRecordedCapitalAmount('0')).toBe('0');
    expect(formatRecordedCapitalAmount('0.00')).toBe('0.00');
    expect(formatRecordedCapitalAmount('12345678901234567890.123456')).toBe('12,345,678,901,234,567,890.123456');
    expect(formatRecordedCapitalAmount(10000.5)).toBe('10,000.5');
    expect(formatRecordedCapitalAmount('')).toBe('');
    expect(formatRecordedCapitalAmount('not a number')).toBe('not a number');
  });

  it('uses a noticeably darker grey for verification-only fields', () => {
    expect(ANNUAL_RETURN_READ_ONLY_FIELD_CLASSES).toContain('bg-[#D9DFDE]');
    expect(ANNUAL_RETURN_READ_ONLY_FIELD_CLASSES).toContain('dark:bg-');
  });

});
