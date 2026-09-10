import { Prisma } from '@/generated/prisma';
import type { AssistantActor } from './conversation.service';
import { createLearningLifecycleMarker, decodeLearningActiveValue } from './learning-active-target';
import { learningTargetDefinition } from './learning-targets';

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Erase candidates derived from a confirmed memory when that source memory is
 * deleted. This runs inside the memory deletion transaction so source deletion
 * and descendant cleanup are atomic.
 */
export async function eraseLearningDerivedFromMemory(
  tx: Prisma.TransactionClient,
  actor: AssistantActor,
  memoryId: string,
): Promise<{ removedCandidates: number; deactivatedTargets: number }> {
  const changes = await tx.businessAssistantLearningChange.findMany({
    where: {
      tenantId: actor.tenantId,
      ownerId: actor.userId,
      AND: [
        { evidence: { path: ['source'], equals: 'CONFIRMED_MEMORY_FEEDBACK' } },
        { evidence: { path: ['memoryId'], equals: memoryId } },
      ],
    },
    select: { id: true, targetKey: true, baselineVersion: true, candidateVersion: true, state: true },
  });
  if (changes.length === 0) return { removedCandidates: 0, deactivatedTargets: 0 };

  const ids = changes.map((change) => change.id);
  const activeTargets = await tx.businessAssistantLearningActiveTarget.findMany({
    where: { tenantId: actor.tenantId, activeChangeId: { in: ids } },
  });
  let deactivatedTargets = 0;
  for (const target of activeTargets) {
    const definition = learningTargetDefinition(target.targetKey);
    if (!definition) throw new DerivedLearningCleanupError('ACTION_CONFLICT', 'A derived active learning target is no longer allowlisted.');
    const decoded = decodeLearningActiveValue(definition.targetKey, target.activeValue);
    if (!decoded) throw new DerivedLearningCleanupError('ACTION_CONFLICT', 'A derived active learning target is unreadable.');
    const marker = createLearningLifecycleMarker(definition, 'DEACTIVATED', {
      changeId: null,
      valueDigest: null,
    });
    const cas = await tx.businessAssistantLearningActiveTarget.updateMany({
      where: {
        id: target.id,
        tenantId: actor.tenantId,
        targetKey: definition.targetKey,
        activeChangeId: target.activeChangeId,
        activeVersion: target.activeVersion,
        revision: target.revision,
      },
      data: {
        activeValue: jsonInput(marker),
        previousVersion: null,
        previousValue: Prisma.JsonNull,
        activeChangeId: null,
        revision: { increment: 1 },
        updatedById: actor.userId,
      },
    });
    if (cas.count !== 1) throw new DerivedLearningCleanupError('ACTION_CONFLICT', 'A derived active target changed during source deletion.');
    deactivatedTargets += 1;
  }

  const scrubbed = await tx.businessAssistantLearningChange.updateMany({
    where: { tenantId: actor.tenantId, ownerId: actor.userId, id: { in: ids } },
    data: {
      candidateValue: Prisma.JsonNull,
      evidence: jsonInput({ redacted: true, source: 'SOURCE_MEMORY_DELETION' }),
      evaluation: Prisma.JsonNull,
      state: 'REJECTED',
      approvedById: null,
      approvedAt: null,
      promotedAt: null,
      rollbackTarget: null,
      expectedVersion: { increment: 1 },
    },
  });
  if (scrubbed.count !== changes.length) {
    throw new DerivedLearningCleanupError('ACTION_CONFLICT', 'Derived learning descendants changed during source deletion.');
  }
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'DELETE',
      entityType: 'BUSINESS_ASSISTANT_LEARNING_DERIVATION',
      entityId: memoryId,
      changeSource: 'MANUAL',
      summary: 'Erased learning candidates derived from a deleted preference memory',
      metadata: jsonInput({
        memoryId,
        removedCandidates: changes.map(({ id, targetKey, baselineVersion, candidateVersion, state }) => ({ id, targetKey, baselineVersion, candidateVersion, state })),
        deactivatedTargets,
      }),
      requestId: actor.requestId,
    },
  });
  return { removedCandidates: changes.length, deactivatedTargets };
}

export class DerivedLearningCleanupError extends Error {
  constructor(readonly code: 'ACTION_CONFLICT', message: string) {
    super(message);
    this.name = 'DerivedLearningCleanupError';
  }
}
