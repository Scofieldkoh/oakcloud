import { Prisma } from '@/generated/prisma';
import { assertBusinessOperationRestoreSafety } from '@/lib/business-operation-backup-barrier';

/** Receipts and assistant history survive an overwrite restore. Inserts from a
 * disaster-recovery backup use skipDuplicates, preserving newer tombstones. */
export function preserveBusinessAssistantHistory(delegate: string): boolean {
  return delegate.startsWith('businessAssistant') || delegate.startsWith('bizFileOperation');
}

export async function assertAssistantRestoreSafety(
  db: Pick<Prisma.TransactionClient, 'bizFileOperationReceipt'>,
  tenantId: string,
  snapshotCutoff: string | undefined,
): Promise<void> {
  const laterReceipt = await db.bizFileOperationReceipt.findFirst({
    where: {
      tenantId,
      status: 'COMMITTED',
      ...(snapshotCutoff ? { committedAt: { gte: new Date(snapshotCutoff) } } : {}),
    },
    select: { id: true },
    orderBy: { committedAt: 'asc' },
  });
  assertBusinessOperationRestoreSafety(snapshotCutoff, laterReceipt);
}

/** Run while the exclusive workspace barrier is held. Restored claims are never
 * executable authority; unknown writes retain their operation id for reconcile. */
export async function invalidateRestoredAssistantDispatch(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  const now = new Date();
  await tx.businessAssistantCapacitySlot.updateMany({
    where: { tenantId },
    data: { tenantId: null, userId: null, runItemId: null, stage: null, claimToken: null,
      leaseExpiresAt: null, heartbeatAt: null, claimGeneration: { increment: 1 } },
  });
  await tx.businessAssistantMessage.updateMany({
    where: { tenantId, status: { in: ['ACCEPTED', 'PROCESSING'] } },
    data: { status: 'FAILED', claimToken: null, leaseExpiresAt: null, claimGeneration: { increment: 1 } },
  });
  await tx.businessAssistantProposal.updateMany({
    where: { tenantId, status: { in: ['ACTIVE', 'CONFIRMED'] } },
    data: { status: 'EXPIRED', expiresAt: now },
  });
  await tx.businessAssistantRunItem.updateMany({
    where: { tenantId, executionOutcome: 'NOT_STARTED', lifecycleState: { notIn: ['EXECUTING', 'RECOVERING'] } },
    data: { lifecycleState: 'EXPIRED', dispositionReason: 'RESTORED_APPROVAL_EXPIRED',
      claimToken: null, leaseExpiresAt: null, claimGeneration: { increment: 1 } },
  });
  await tx.businessAssistantRunItem.updateMany({
    where: { tenantId, OR: [
      { executionOutcome: 'OUTCOME_UNKNOWN' },
      { executionOutcome: 'NOT_STARTED', lifecycleState: { in: ['EXECUTING', 'RECOVERING'] } },
    ] },
    data: { lifecycleState: 'RECOVERING', executionOutcome: 'OUTCOME_UNKNOWN', activeStage: 'EXECUTION',
      claimToken: null, leaseExpiresAt: null, claimGeneration: { increment: 1 }, availableAt: now },
  });
  await tx.businessAssistantRunItem.updateMany({
    where: { tenantId, executionOutcome: 'COMMITTED' },
    data: { claimToken: null, leaseExpiresAt: null, claimGeneration: { increment: 1 } },
  });
  await tx.businessAssistantRun.updateMany({
    where: { tenantId, status: { in: ['DRAFT', 'PREPARING', 'WAITING_CONFIRMATION', 'READY'] } },
    data: { status: 'EXPIRED', activeProposalId: null, completedAt: now },
  });
}
