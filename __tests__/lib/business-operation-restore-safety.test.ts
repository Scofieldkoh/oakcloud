import { describe, expect, it } from 'vitest';
import { assertBusinessOperationRestoreSafety } from '@/lib/business-operation-backup-barrier';

describe('business operation restore safety', () => {
  it('allows a snapshot when no newer operation receipt exists', () => {
    expect(() => assertBusinessOperationRestoreSafety('2026-09-06T00:00:00.000Z', null)).not.toThrow();
  });

  it('does not reject historical workspaces that have no operation receipts', () => {
    expect(() => assertBusinessOperationRestoreSafety(undefined, null)).not.toThrow();
  });

  it('blocks a legacy backup that could erase a committed operation', () => {
    expect(() => assertBusinessOperationRestoreSafety(undefined, { id: 'receipt' }))
      .toThrow('no business-operation cutoff');
  });

  it('blocks rollback across a proven business commit', () => {
    expect(() => assertBusinessOperationRestoreSafety('2026-09-06T00:00:00.000Z', { id: 'receipt' }))
      .toThrow('predates a committed business operation');
  });
});
