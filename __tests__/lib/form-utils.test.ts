import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORM_DRAFT_AUTO_DELETE_DAYS,
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
