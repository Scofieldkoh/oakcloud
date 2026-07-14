import { describe, expect, it } from 'vitest';
import { assertContactMergeRestoreSafety } from '@/services/backup.service';

describe('contact merge backup restore safety', () => {
  it('allows a backup with no later immutable merge ledger entry', () => {
    expect(() => assertContactMergeRestoreSafety('2026-07-14T10:00:00.000Z', null)).not.toThrow();
  });

  it('rejects a pre-merge backup with an actionable non-resurrection error', () => {
    expect(() => assertContactMergeRestoreSafety('2026-07-14T09:00:00.000Z', {
      id: 'merge-ledger-1',
      approvedAt: new Date('2026-07-14T10:00:00.000Z'),
    })).toThrow(/choose a backup created after the latest contact merge.*resurrecting/i);
  });
});
