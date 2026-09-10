import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma';
import { assertAssistantRestoreSafety, invalidateRestoredAssistantDispatch, preserveBusinessAssistantHistory } from '@/services/business-assistant-backup.service';

describe('Business Assistant backup lifecycle', () => {
  it('rejects a snapshot older than a committed receipt', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'receipt-committed' });
    await expect(assertAssistantRestoreSafety({ bizFileOperationReceipt: { findFirst } } as never, 'workspace-1', '2026-09-06T00:00:00.000Z')).rejects.toThrow(/predates a committed/);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      tenantId: 'workspace-1', status: 'COMMITTED', committedAt: { gte: new Date('2026-09-06T00:00:00.000Z') },
    } }));
  });

  it('allows legacy backups only when no committed operation exists', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(assertAssistantRestoreSafety({ bizFileOperationReceipt: { findFirst } } as never, 'workspace-1', undefined)).resolves.toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'workspace-1', status: 'COMMITTED' } }));
  });

  it('preserves tombstones, approvals, and canonical evidence during overwrite', () => {
    expect(preserveBusinessAssistantHistory('businessAssistantMemory')).toBe(true);
    expect(preserveBusinessAssistantHistory('businessAssistantApproval')).toBe(true);
    expect(preserveBusinessAssistantHistory('bizFileOperationEvidence')).toBe(true);
    expect(preserveBusinessAssistantHistory('company')).toBe(false);
  });

  it('invalidates old claims and approvals while keeping uncertain writes on reconciliation', async () => {
    const calls: Array<{ delegate: string; where: unknown; data: unknown }> = [];
    const tx = new Proxy({}, { get: (_target, delegate) => ({ updateMany: vi.fn(async (input) => { calls.push({ delegate: String(delegate), ...input }); return { count: 1 }; }) }) });
    await invalidateRestoredAssistantDispatch(tx as Prisma.TransactionClient, 'workspace-1');
    const itemCalls = calls.filter((call) => call.delegate === 'businessAssistantRunItem');
    expect(itemCalls).toHaveLength(3);
    expect(itemCalls[1]).toMatchObject({ where: { tenantId: 'workspace-1' }, data: { executionOutcome: 'OUTCOME_UNKNOWN', lifecycleState: 'RECOVERING', activeStage: 'EXECUTION', claimToken: null } });
    expect(itemCalls[2]).toMatchObject({ where: { executionOutcome: 'COMMITTED' }, data: { claimToken: null } });
    expect(itemCalls[2].data).not.toHaveProperty('executionOutcome');
    expect(calls.find((call) => call.delegate === 'businessAssistantProposal')).toMatchObject({ data: { status: 'EXPIRED' } });
    expect(calls.some((call) => call.delegate === 'businessAssistantApproval')).toBe(false);
  });
});
