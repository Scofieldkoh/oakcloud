import {
  Prisma,
  TaskStageOutcomeType,
  TaskStageStatus,
  type TaskStageStatus as TaskStageStatusValue,
} from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import {
  taskStageChecklistUpdateSchema,
  taskStageMetadataSchema,
  taskStageOutcomeSchema,
  taskStageSkipSchema,
  type TaskStageOutcomeInput,
} from '@/lib/validations/task';
import {
  assertOutcomeMatchesAction,
  getStageActionAdapter,
  resolveStageActionOutcome,
} from './action-registry';
import { deriveTaskStatus } from './status';
import type { ResolvedStageOutcome } from './types';

async function requireStage(
  tx: Prisma.TransactionClient,
  tenantId: string,
  stageId: string,
) {
  const stage = await tx.taskStage.findFirst({
    where: {
      id: stageId,
      tenantId,
      task: { deletedAt: null },
    },
    include: {
      task: { select: { id: true, status: true, companyId: true, deletedAt: true } },
      outcome: true,
      checklistItems: { orderBy: { position: 'asc' } },
    },
  });
  if (!stage) throw new NotFoundError('Task stage not found');
  return stage;
}

async function updateParentTaskStatus(
  tx: Prisma.TransactionClient,
  tenantId: string,
  taskId: string,
  currentStatus: Parameters<typeof deriveTaskStatus>[1],
) {
  const stages = await tx.taskStage.findMany({
    where: { tenantId, taskId },
    select: { status: true },
  });
  const status = deriveTaskStatus(stages, currentStatus);
  await tx.task.update({
    where: { id: taskId },
    data: { status },
  });
  return status;
}

async function auditStageMutation(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    userId?: string;
    stageId: string;
    companyId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
    reason?: string;
  },
) {
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    companyId: params.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'TaskStage',
    entityId: params.stageId,
    summary: params.summary,
    metadata: params.metadata,
    reason: params.reason,
  }, tx);
}

export async function updateTaskStageMetadata(
  tenantId: string,
  stageId: string,
  input: { notes?: string | null; assigneeId?: string | null },
  userId?: string,
) {
  const parsed = taskStageMetadataSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const stage = await requireStage(tx, tenantId, stageId);
    if (parsed.assigneeId) {
      const assignee = await tx.user.findFirst({
        where: {
          id: parsed.assigneeId,
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      if (!assignee) throw new NotFoundError('Stage assignee not found');
    }
    const updated = await tx.taskStage.update({
      where: { id: stage.id },
      data: parsed,
    });
    await auditStageMutation(tx, {
      tenantId,
      userId,
      stageId: stage.id,
      companyId: stage.task.companyId,
      summary: `Updated task stage "${stage.name}"`,
    });
    return updated;
  });
}

export async function updateTaskStageChecklistItem(
  tenantId: string,
  checklistItemId: string,
  input: { isCompleted: boolean },
  userId?: string,
) {
  const parsed = taskStageChecklistUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const item = await tx.taskStageChecklistItem.findFirst({
      where: {
        id: checklistItemId,
        tenantId,
        taskStage: { task: { deletedAt: null } },
      },
      include: {
        taskStage: {
          include: {
            task: { select: { companyId: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundError('Task stage checklist item not found');
    const updated = await tx.taskStageChecklistItem.update({
      where: { id: item.id },
      data: {
        isCompleted: parsed.isCompleted,
        completedAt: parsed.isCompleted ? new Date() : null,
      },
    });
    await auditStageMutation(tx, {
      tenantId,
      userId,
      stageId: item.taskStageId,
      companyId: item.taskStage.task.companyId,
      summary: `${parsed.isCompleted ? 'Completed' : 'Reopened'} checklist item "${item.label}"`,
      metadata: { checklistItemId: item.id, isCompleted: parsed.isCompleted },
    });
    return updated;
  });
}

async function setStageStatus(
  tenantId: string,
  stageId: string,
  status: TaskStageStatusValue,
  userId?: string,
  reason?: string,
) {
  return prisma.$transaction(async (tx) => {
    const stage = await requireStage(tx, tenantId, stageId);
    if (status === TaskStageStatus.SKIPPED && stage.isRequired) {
      throw new ValidationError('Required task stages cannot be skipped');
    }
    const now = new Date();
    const updated = await tx.taskStage.update({
      where: { id: stage.id },
      data: {
        status,
        ...(status === TaskStageStatus.SKIPPED ? { skipReason: reason } : {}),
        ...(status === TaskStageStatus.COMPLETED
          ? { startedAt: stage.startedAt ?? now, completedAt: now, skipReason: null }
          : {}),
        ...(status === TaskStageStatus.NOT_STARTED
          ? { startedAt: null, completedAt: null, skipReason: null }
          : {}),
      },
    });
    const taskStatus = await updateParentTaskStatus(
      tx,
      tenantId,
      stage.taskId,
      stage.task.status,
    );
    await auditStageMutation(tx, {
      tenantId,
      userId,
      stageId: stage.id,
      companyId: stage.task.companyId,
      summary: `Changed task stage status to ${status}`,
      metadata: { previousStatus: stage.status, status, taskStatus },
      reason,
    });
    return updated;
  });
}

export const completeTaskStage = (
  tenantId: string,
  stageId: string,
  userId?: string,
) => setStageStatus(tenantId, stageId, TaskStageStatus.COMPLETED, userId);

export const reopenTaskStage = (
  tenantId: string,
  stageId: string,
  userId?: string,
) => setStageStatus(tenantId, stageId, TaskStageStatus.NOT_STARTED, userId);

export async function skipTaskStage(
  tenantId: string,
  stageId: string,
  reason: string,
  userId?: string,
) {
  const parsed = taskStageSkipSchema.parse({ reason });
  return setStageStatus(tenantId, stageId, TaskStageStatus.SKIPPED, userId, parsed.reason);
}

function outcomeEntityIds(parsed: ReturnType<typeof taskStageOutcomeSchema.parse>) {
  return {
    companyId: parsed.companyId ?? null,
    generatedDocumentId: parsed.generatedDocumentId ?? null,
    esigningEnvelopeId: parsed.esigningEnvelopeId ?? null,
  };
}

async function resolveAuthoritativeOutcome(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: ReturnType<typeof taskStageOutcomeSchema.parse>,
): Promise<ResolvedStageOutcome> {
  if (input.type === TaskStageOutcomeType.COMPANY && input.companyId) {
    const company = await tx.company.findFirst({
      where: { id: input.companyId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundError('Company not found');
    return {
      type: TaskStageOutcomeType.COMPANY,
      entity: { kind: 'company', ...company },
    };
  }

  if (
    input.type === TaskStageOutcomeType.GENERATED_DOCUMENT
    && input.generatedDocumentId
  ) {
    const document = await tx.generatedDocument.findFirst({
      where: { id: input.generatedDocumentId, tenantId, deletedAt: null },
      select: { id: true, title: true, status: true },
    });
    if (!document) throw new NotFoundError('Generated document not found');
    return {
      type: TaskStageOutcomeType.GENERATED_DOCUMENT,
      entity: { kind: 'generatedDocument', ...document },
    };
  }

  if (
    input.type === TaskStageOutcomeType.ESIGNING_ENVELOPE
    && input.esigningEnvelopeId
  ) {
    const envelope = await tx.esigningEnvelope.findFirst({
      where: { id: input.esigningEnvelopeId, tenantId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        recipients: {
          where: { type: 'SIGNER' },
          select: { status: true },
        },
      },
    });
    if (!envelope) throw new NotFoundError('E-signing envelope not found');
    const recipients = envelope.recipients ?? [];
    return {
      type: TaskStageOutcomeType.ESIGNING_ENVELOPE,
      entity: {
        kind: 'esigningEnvelope',
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        requiredSignatures: recipients.length,
        completedSignatures: recipients.filter((recipient) => recipient.status === 'SIGNED').length,
      },
    };
  }

  throw new ValidationError('Outcome type and linked entity do not match');
}

export async function linkTaskStageOutcome(
  tenantId: string,
  stageId: string,
  input: TaskStageOutcomeInput,
  userId?: string,
) {
  const parsed = taskStageOutcomeSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const stage = await requireStage(tx, tenantId, stageId);
    assertOutcomeMatchesAction(stage.actionType, parsed.type);
    const authoritative = await resolveAuthoritativeOutcome(tx, tenantId, parsed);
    const resolution = resolveStageActionOutcome(stage.actionType, authoritative);
    const ids = outcomeEntityIds(parsed);
    const outcome = await tx.taskStageOutcome.upsert({
      where: { taskStageId: stage.id },
      create: {
        tenantId,
        taskStageId: stage.id,
        type: parsed.type,
        ...ids,
      },
      update: {
        type: parsed.type,
        ...ids,
      },
    });
    const now = new Date();
    await tx.taskStage.update({
      where: { id: stage.id },
      data: {
        status: resolution.status,
        startedAt: stage.startedAt ?? now,
        completedAt: resolution.status === TaskStageStatus.COMPLETED ? now : null,
      },
    });
    const taskStatus = await updateParentTaskStatus(
      tx,
      tenantId,
      stage.taskId,
      stage.task.status,
    );
    await auditStageMutation(tx, {
      tenantId,
      userId,
      stageId: stage.id,
      companyId: stage.task.companyId,
      summary: resolution.summary ?? `Linked ${parsed.type} outcome`,
      metadata: { outcomeId: outcome.id, outcomeType: parsed.type, taskStatus },
    });
    return { outcome, status: resolution.status, summary: resolution.summary, taskStatus };
  });
}

export async function reconcileTaskStageOutcome(
  tenantId: string,
  stageId: string,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const stage = await requireStage(tx, tenantId, stageId);
    if (!stage.outcome) {
      const adapter = getStageActionAdapter(stage.actionType);
      const status = adapter.deriveStatus(null);
      await tx.taskStage.update({
        where: { id: stage.id },
        data: { status, completedAt: null },
      });
      const taskStatus = await updateParentTaskStatus(
        tx,
        tenantId,
        stage.taskId,
        stage.task.status,
      );
      await auditStageMutation(tx, {
        tenantId,
        userId,
        stageId: stage.id,
        companyId: stage.task.companyId,
        summary: 'Reconciled task stage without an outcome',
        metadata: { status, taskStatus },
      });
      return { status, summary: null, taskStatus };
    }

    const input = taskStageOutcomeSchema.parse({
      type: stage.outcome.type,
      companyId: stage.outcome.companyId,
      generatedDocumentId: stage.outcome.generatedDocumentId,
      esigningEnvelopeId: stage.outcome.esigningEnvelopeId,
    });
    assertOutcomeMatchesAction(stage.actionType, input.type);
    const authoritative = await resolveAuthoritativeOutcome(tx, tenantId, input);
    const resolution = resolveStageActionOutcome(stage.actionType, authoritative);
    await tx.taskStage.update({
      where: { id: stage.id },
      data: {
        status: resolution.status,
        completedAt: resolution.status === TaskStageStatus.COMPLETED ? new Date() : null,
      },
    });
    const taskStatus = await updateParentTaskStatus(
      tx,
      tenantId,
      stage.taskId,
      stage.task.status,
    );
    await auditStageMutation(tx, {
      tenantId,
      userId,
      stageId: stage.id,
      companyId: stage.task.companyId,
      summary: resolution.summary ?? 'Reconciled task stage outcome',
      metadata: { outcomeId: stage.outcome.id, status: resolution.status, taskStatus },
    });
    return { ...resolution, taskStatus };
  });
}
