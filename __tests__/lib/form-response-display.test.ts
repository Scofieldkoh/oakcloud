import { describe, expect, it } from 'vitest';
import {
  formatResponseFieldValue,
  isResponseAnswerField,
} from '@/lib/form-response-display';

describe('form response display helpers', () => {
  it('formats time plus timezone answers as readable text', () => {
    expect(
      formatResponseFieldValue(
        { type: 'SHORT_TEXT', inputType: 'time_timezone' },
        { time: '09:30', timezone: 'Asia/Singapore' }
      )
    ).toBe('09:30 Asia/Singapore');
  });

  it('resolves a dynamically selected officer ID into their name for staff and PDF output', () => {
    const field = {
      type: 'DROPDOWN',
      validation: { optionsFromRepeatFieldKey: 'person_name', optionsFromRepeatFieldIdKey: 'person_record_id' },
    };
    const answers = {
      person_name: ['Alice Smith', 'Bob Lee'],
      person_record_id: ['person:alice', 'person:bob'],
    };
    expect(formatResponseFieldValue(field, 'person:bob', answers)).toBe('Bob Lee');
    expect(formatResponseFieldValue(field, 'person:unknown', answers)).toBe('person:unknown');
    expect(formatResponseFieldValue(field, 'person:bob')).toBe('person:bob');
  });

  it('resolves a newly added person via their row index when the ID is blank', () => {
    const field = {
      type: 'DROPDOWN',
      validation: { optionsFromRepeatFieldKey: 'person_name', optionsFromRepeatFieldIdKey: 'person_record_id' },
    };
    const answers = {
      person_name: ['Alice Smith', 'New Officer'],
      person_record_id: ['person:alice', ''],
    };
    expect(formatResponseFieldValue(field, 'new-person:1', answers)).toBe('New Officer');
    expect(formatResponseFieldValue(field, 'new-person:2', answers)).toBe('new-person:2');
  });

  it('formats structured per-person holdings and previous free-text responses', () => {
    const field = { type: 'SHORT_TEXT', inputType: 'shareholding_list' };
    expect(formatResponseFieldValue(field, [
      { shareClass: 'ORDINARY', shares: '100' },
      { shareClass: 'PREFERENCE', shares: '20' },
    ])).toBe('ORDINARY: 100 shares\nPREFERENCE: 20 shares');
    expect(formatResponseFieldValue(field, 'ORDINARY: 100 shares')).toBe('ORDINARY: 100 shares');
    expect(formatResponseFieldValue(field, [])).toBeNull();
  });

  it('does not show information blocks as response answer fields', () => {
    expect(isResponseAnswerField({ type: 'PARAGRAPH' })).toBe(false);
    expect(isResponseAnswerField({ type: 'HTML' })).toBe(false);
    expect(isResponseAnswerField({ type: 'SHORT_TEXT' })).toBe(true);
  });
});
