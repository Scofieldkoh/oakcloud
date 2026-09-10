import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { acquireBusinessOperationBarrier } from '@/lib/business-operation-backup-barrier';
import { resolveFreshActor } from '@/lib/fresh-authorization';
import { businessAssistantLearningActionSchema } from '@/lib/validations/business-assistant';
import { canonicalizeJson, sha256, type JsonValue } from './contracts';
import { assertAssistantAdministrativeAccess } from './policy.service';
import type { AssistantActor } from './conversation.service';
import {
  learningTargetDefinition,
  resolveLearningTarget,
  type LearningTargetDefinition,
} from './learning-targets';
import {
  evaluateLearningCandidateBehavior,
  hasTrustedHeldOutEvaluation,
} from './learning-behavioral-evaluator';
import { learningPromotionReleaseGate } from './learning-release-gate';

const TARGET_KEY = /^[a-z][a-z0-9_.-]{1,199}$/;
const VERSION = /^v?[0-9]+(?:\.[0-9]+){0,2}$/;
const MAX_EVIDENCE_BYTES = 64_000;
const LEARNING_ADMIN_FORBIDDEN_MESSAGE = 'Only a workspace administrator can change tenant learning configuration.';
const LEARNING_WORKSPACE_PAUSED_MESSAGE = 'The workspace is restoring and cannot accept new assistant work.';

async function assertLearningAdministrator(actor: AssistantActor): Promise<void> {
  const decision = await assertAssistantAdministrativeAccess(actor.userId, actor.tenantId);
  if (!decision.isAdmin) throw new LearningServiceError('FORBIDDEN', LEARNING_ADMIN_FORBIDDEN_MESSAGE);
}

async function assertLearningAdministratorInTransaction(actor: AssistantActor, tx: Prisma.TransactionClient): Promise<void> {
  await acquireBusinessOperationBarrier(tx, actor.tenantId, 'shared');
  const freshActor = await resolveFreshActor({ userId: actor.userId, workspaceId: actor.tenantId }, tx);
  const isAdmin = Boolean(freshActor && (freshActor.isWorkspaceAdmin || freshActor.isSuperAdmin || freshActor.internalRole === 'ADMIN'));
  if (!isAdmin) throw new LearningServiceError('FORBIDDEN', LEARNING_ADMIN_FORBIDDEN_MESSAGE);
  const backups = await tx.workspaceBackup.findMany({
    where: { tenantId: actor.tenantId, status: { in: ['RESTORING', 'COMPLETED'] } },
    select: { status: true, errorDetails: true },
  });
  const paused = backups.some((backup) => {
    if (backup.status === 'RESTORING') return true;
    const details = backup.errorDetails;
    return Boolean(details && typeof details === 'object' && !Array.isArray(details)
      && (details as Record<string, unknown>).businessAssistantDispatchPaused === true);
  });
  if (paused) throw new LearningServiceError('FORBIDDEN', LEARNING_WORKSPACE_PAUSED_MESSAGE);
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function boundedJson(value: unknown, field: string): JsonValue {
  let canonical: JsonValue;
  try {
    canonical = canonicalizeJson(value);
  } catch {
    throw new LearningServiceError('VALIDATION_FAILED', `${field} must contain JSON data.`);
  }
  if (Buffer.byteLength(JSON.stringify(canonical), 'utf8') > MAX_EVIDENCE_BYTES) {
    throw new LearningServiceError('VALIDATION_FAILED', `${field} is too large.`);
  }
  return canonical;
}

function candidateValueFromInput(definition: LearningTargetDefinition, candidateValue: unknown, evidence: unknown): JsonValue {
  const supplied = candidateValue !== undefined
    ? candidateValue
    : evidence && typeof evidence === 'object' && !Array.isArray(evidence)
      ? (evidence as Record<string, unknown>).candidateValue
      : undefined;
  if (supplied === undefined) throw new LearningServiceError('VALIDATION_FAILED', 'A bounded candidate value is required for this target.');
  const parsed = definition.valueSchema.safeParse(supplied);
  if (!parsed.success) throw new LearningServiceError('VALIDATION_FAILED', 'The candidate value is not allowed for this target.');
  return canonicalizeJson(parsed.data);
}

export interface LearningChangeDto {
  id: string;
  targetKey: string;
  targetKind: string;
  risk: string;
  baselineVersion: string;
  candidateVersion: string;
  candidateValue: Prisma.JsonValue | null;
  evidence: Prisma.JsonValue;
  evaluation: Prisma.JsonValue | null;
  state: string;
  expectedVersion: number;
  rollbackTarget: string | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: readonly ('EVALUATE' | 'APPROVE' | 'PROMOTE' | 'ROLLBACK' | 'REJECT')[];
}

export async function listLearningChanges(actor: AssistantActor): Promise<LearningChangeDto[]> {
  await assertLearningAdministrator(actor);
  const rows = await prisma.businessAssistantLearningChange.findMany({
    where: { tenantId: actor.tenantId, ownerId: actor.userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
  });
  return rows.map(toLearningDto);
}

export async function createLearningCandidate(actor: AssistantActor, input: {
  targetKey: string;
  targetKind?: 'PREFERENCE' | 'PROMPT_PROFILE';
  risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  baselineVersion: string;
  candidateVersion: string;
  candidateValue?: unknown;
  evidence: unknown;
}): Promise<LearningChangeDto> {
  await assertLearningAdministrator(actor);
  if (!TARGET_KEY.test(input.targetKey) || !VERSION.test(input.baselineVersion) || !VERSION.test(input.candidateVersion)) {
    throw new LearningServiceError('VALIDATION_FAILED', 'The learning target or version is invalid.');
  }
  const resolved = resolveLearningTarget(input.targetKey);
  if (!resolved) throw new LearningServiceError('VALIDATION_FAILED', 'The learning target is not allowlisted.');
  const definition = resolved.definition;
  if (input.targetKind && input.targetKind !== definition.targetKind) {
    throw new LearningServiceError('VALIDATION_FAILED', 'The learning target kind does not match its allowlisted definition.');
  }
  const evidence = boundedJson(input.evidence, 'Learning evidence');
  const candidateValue = candidateValueFromInput(definition, input.candidateValue, evidence);
  const change = await runSerializableTransaction(prisma, async (tx) => {
    await assertLearningAdministratorInTransaction(actor, tx);
    const existingTarget = await tx.businessAssistantLearningActiveTarget.findUnique({
      where: { tenantId_targetKey: { tenantId: actor.tenantId, targetKey: definition.targetKey } },
      select: { activeVersion: true },
    });
    const effectiveBaseline = existingTarget?.activeVersion ?? definition.defaultVersion;
    if (effectiveBaseline !== input.baselineVersion) {
      throw new LearningServiceError('ACTION_CONFLICT', 'The baseline version is stale; refresh the active target first.');
    }
    return tx.businessAssistantLearningChange.create({
      data: {
        tenantId: actor.tenantId,
        ownerId: actor.userId,
        targetKey: definition.targetKey,
        targetKind: definition.targetKind,
        risk: input.risk ?? 'LOW',
        baselineVersion: input.baselineVersion,
        candidateVersion: input.candidateVersion,
        candidateValue: jsonInput(candidateValue),
        evidence: jsonInput(evidence),
        expectedVersion: 1,
        state: 'CANDIDATE',
      },
    });
  });
  return toLearningDto(change);
}

/** Return active bounded configuration for one explicitly registered target. */
export async function getActiveLearningConfiguration(
  tenantId: string,
  targetKey: string,
): Promise<{ version: string; value: Prisma.JsonValue } | null> {
  const definition = learningTargetDefinition(targetKey);
  if (!definition) return null;
  const target = await prisma.businessAssistantLearningActiveTarget.findUnique({
    where: { tenantId_targetKey: { tenantId, targetKey: definition.targetKey } },
    select: { activeVersion: true, activeValue: true },
  });
  if (!target) return { version: definition.defaultVersion, value: definition.defaultValue as Prisma.JsonValue };
  const parsed = definition.valueSchema.safeParse(target.activeValue);
  if (!parsed.success) return { version: definition.defaultVersion, value: definition.defaultValue as Prisma.JsonValue };
  return { version: target.activeVersion, value: canonicalizeJson(parsed.data) as Prisma.JsonValue };
}

function evaluationAllowsApproval(change: {
  targetKey: string;
  targetKind: string;
  baselineVersion: string;
  candidateVersion: string;
  candidateValue: Prisma.JsonValue | null;
  evaluation: Prisma.JsonValue | null;
}): boolean {
  return hasTrustedHeldOutEvaluation(change);
}

export async function applyLearningAction(actor: AssistantActor, changeId: string, rawAction: unknown): Promise<LearningChangeDto> {
  const parsed = businessAssistantLearningActionSchema.safeParse(rawAction);
  if (!parsed.success) throw new LearningServiceError('VALIDATION_FAILED', 'The learning action is invalid.');
  const action = parsed.data;
  await assertLearningAdministrator(actor);
  const bodyHash = sha256({ changeId, action });
  const actionKind = `LEARNING_${action.action}` as 'LEARNING_EVALUATE' | 'LEARNING_APPROVE' | 'LEARNING_PROMOTE' | 'LEARNING_ROLLBACK' | 'LEARNING_REJECT';
  const updated = await runSerializableTransaction(prisma, async (tx) => {
    await assertLearningAdministratorInTransaction(actor, tx);
    const duplicate = await tx.businessAssistantActionRequest.findFirst({
      where: { tenantId: actor.tenantId, ownerId: actor.userId, actionKind, clientRequestId: action.clientRequestId },
      select: { bodyHash: true },
    });
    if (duplicate) {
      if (duplicate.bodyHash !== bodyHash) throw new LearningServiceError('ACTION_CONFLICT', 'This action request ID was already used with different content.');
      const current = await tx.businessAssistantLearningChange.findFirst({ where: { id: changeId, tenantId: actor.tenantId, ownerId: actor.userId } });
      if (!current) throw new LearningServiceError('NOT_FOUND', 'The learning change is unavailable.');
      return current;
    }
    const current = await tx.businessAssistantLearningChange.findFirst({ where: { id: changeId, tenantId: actor.tenantId, ownerId: actor.userId } });
    if (!current) throw new LearningServiceError('NOT_FOUND', 'The learning change is unavailable.');
    if (current.expectedVersion !== action.expectedVersion) {
      throw new LearningServiceError('ACTION_CONFLICT', 'The learning change changed; refresh before applying this action.');
    }

    let state = current.state;
    let evaluation = current.evaluation as Prisma.InputJsonValue | null;
    let approvedById = current.approvedById;
    let approvedAt = current.approvedAt;

    if (action.action === 'EVALUATE') {
      if (!['CANDIDATE', 'EVALUATED'].includes(current.state)) throw new LearningServiceError('ACTION_CONFLICT', 'Only a candidate can be evaluated.');
      evaluation = jsonInput(evaluateLearningCandidateBehavior(current));
      state = 'EVALUATED';
    } else if (action.action === 'APPROVE') {
      if (current.state !== 'EVALUATED' || !evaluationAllowsApproval(current)) {
        throw new LearningServiceError('ACTION_CONFLICT', 'Approval requires the current server-owned held-out behavioral evaluation to pass.');
      }
      state = 'APPROVED';
      approvedById = actor.userId;
      approvedAt = new Date();
    } else if (action.action === 'PROMOTE') {
      const gate = learningPromotionReleaseGate();
      throw new LearningServiceError('ACTION_CONFLICT', `Learning promotion remains gated: ${gate.reason}`);
    } else if (action.action === 'ROLLBACK') {
      if (current.state !== 'PROMOTED' || !current.rollbackTarget) throw new LearningServiceError('ACTION_CONFLICT', 'Only a promoted change with a rollback target can be rolled back.');
      const definition = learningTargetDefinition(current.targetKey);
      if (!definition) throw new LearningServiceError('ACTION_CONFLICT', 'The active learning target is no longer allowlisted.');
      const target = await tx.businessAssistantLearningActiveTarget.findUnique({
        where: { tenantId_targetKey: { tenantId: actor.tenantId, targetKey: definition.targetKey } },
      });
      if (!target || target.activeChangeId !== current.id || target.activeVersion !== current.candidateVersion) {
        throw new LearningServiceError('ACTION_CONFLICT', 'The active target has changed; this rollback is stale.');
      }
      await tx.businessAssistantLearningActiveTarget.update({
        where: { id: target.id },
        data: {
          activeVersion: target.previousVersion ?? current.rollbackTarget,
          activeValue: target.previousValue ?? Prisma.JsonNull,
          previousVersion: target.activeVersion,
          previousValue: target.activeValue ?? Prisma.JsonNull,
          activeChangeId: null,
          revision: { increment: 1 },
          updatedById: actor.userId,
        },
      });
      state = 'ROLLED_BACK';
    } else {
      if (['PROMOTED', 'ROLLED_BACK'].includes(current.state)) {
        throw new LearningServiceError('ACTION_CONFLICT', 'A promoted change must be rolled back or superseded through its versioned target.');
      }
      state = 'REJECTED';
    }

    const result = await tx.businessAssistantLearningChange.update({
      where: { id: changeId },
      data: {
        state,
        evaluation: evaluation === null ? Prisma.JsonNull : evaluation,
        approvedById,
        approvedAt,
        expectedVersion: { increment: 1 },
      },
    });
    await tx.businessAssistantActionRequest.create({
      data: {
        tenantId: actor.tenantId,
        ownerId: actor.userId,
        actionKind,
        clientRequestId: action.clientRequestId,
        bodyHash,
        status: 'APPLIED',
        response: jsonInput({ changeId, expectedVersion: result.expectedVersion }),
      },
    });
    return result;
  });
  return toLearningDto(updated);
}

function toLearningDto(change: {
  id: string;
  targetKey: string;
  targetKind: string;
  risk: string;
  baselineVersion: string;
  candidateVersion: string;
  candidateValue: Prisma.JsonValue | null;
  evidence: Prisma.JsonValue;
  evaluation: Prisma.JsonValue | null;
  state: string;
  expectedVersion: number;
  rollbackTarget: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LearningChangeDto {
  const trustedEvaluation = evaluationAllowsApproval(change);
  const gate = learningPromotionReleaseGate();
  const allowedActions = change.state === 'CANDIDATE'
    ? ['EVALUATE', 'REJECT'] as const
    : change.state === 'EVALUATED'
      ? trustedEvaluation ? ['EVALUATE', 'APPROVE', 'REJECT'] as const : ['EVALUATE', 'REJECT'] as const
      : change.state === 'APPROVED'
        ? gate.enabled ? ['PROMOTE', 'REJECT'] as const : ['REJECT'] as const
        : change.state === 'PROMOTED'
          ? ['ROLLBACK'] as const
          : [] as const;
  return {
    id: change.id,
    targetKey: resolveLearningTarget(change.targetKey)?.canonicalKey ?? change.targetKey,
    targetKind: change.targetKind,
    risk: change.risk,
    baselineVersion: change.baselineVersion,
    candidateVersion: change.candidateVersion,
    candidateValue: change.candidateValue,
    evidence: change.evidence,
    evaluation: change.evaluation,
    state: change.state,
    expectedVersion: change.expectedVersion,
    rollbackTarget: change.rollbackTarget,
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString(),
    allowedActions,
  };
}

export class LearningServiceError extends Error {
  constructor(readonly code: 'VALIDATION_FAILED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ACTION_CONFLICT', message: string) {
    super(message);
    this.name = 'LearningServiceError';
  }
}
