import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS,
  evaluateCondition,
  isProgressStopInfoBlock,
  parseFormDraftSettings,
  writeFormDraftSettings,
} from '@/lib/form-utils';

describe('form-utils draft settings', () => {
  it('returns defaults when draft settings are absent', () => {
    expect(parseFormDraftSettings(null)).toEqual({
      enabled: false,
      autoDeleteDays: DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS,
    });
  });

  it('parses persisted draft settings', () => {
    expect(parseFormDraftSettings({
      drafts: {
        enabled: true,
        autoDeleteDays: 30,
      },
    })).toEqual({
      enabled: true,
      autoDeleteDays: 30,
    });
  });

  it('clamps invalid auto-delete values when parsing', () => {
    expect(parseFormDraftSettings({
      drafts: {
        enabled: true,
        autoDeleteDays: 0,
      },
    })).toEqual({
      enabled: true,
      autoDeleteDays: 1,
    });
  });

  it('writes draft settings while preserving existing settings', () => {
    expect(writeFormDraftSettings(
      {
        notifications: {
          completionRecipientEmails: ['ops@example.com'],
        },
      },
      {
        enabled: true,
        autoDeleteDays: 21,
      }
    )).toEqual({
      notifications: {
        completionRecipientEmails: ['ops@example.com'],
      },
      drafts: {
        enabled: true,
        autoDeleteDays: 21,
      },
    });
  });
});

describe('form-utils condition evaluation', () => {
  it('supports legacy single field conditions', () => {
    expect(evaluateCondition(
      { fieldKey: 'status', operator: 'equals', value: 'approved' },
      { status: 'approved' }
    )).toBe(true);
  });

  it('requires every rule for grouped AND conditions', () => {
    const condition = {
      logic: 'and',
      rules: [
        { fieldKey: 'status', operator: 'equals', value: 'approved' },
        { fieldKey: 'notes', operator: 'not_empty' },
      ],
    };

    expect(evaluateCondition(condition, { status: 'approved', notes: 'ready' })).toBe(true);
    expect(evaluateCondition(condition, { status: 'approved', notes: '' })).toBe(false);
  });

  it('allows any matching rule for grouped OR conditions', () => {
    const condition = {
      logic: 'or',
      rules: [
        { fieldKey: 'status', operator: 'equals', value: 'approved' },
        { fieldKey: 'status', operator: 'equals', value: 'pending' },
      ],
    };

    expect(evaluateCondition(condition, { status: 'pending' })).toBe(true);
    expect(evaluateCondition(condition, { status: 'rejected' })).toBe(false);
  });
});

describe('form-utils progress stop info blocks', () => {
  it('detects paragraph information blocks configured to stop progress', () => {
    expect(isProgressStopInfoBlock({
      type: 'PARAGRAPH',
      validation: { infoStopsProgress: true },
    })).toBe(true);
  });

  it('ignores non-paragraph fields and inactive settings', () => {
    expect(isProgressStopInfoBlock({
      type: 'SHORT_TEXT',
      validation: { infoStopsProgress: true },
    })).toBe(false);
    expect(isProgressStopInfoBlock({
      type: 'PARAGRAPH',
      validation: { infoStopsProgress: false },
    })).toBe(false);
  });
});
