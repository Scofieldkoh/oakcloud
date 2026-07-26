import {
  Prisma,
  TaskStageActionType,
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
import { lockTaskForUpdate } from './locking';
import type { ResolvedStageOutcome } from './types';

const stageDetailInclude = {
  task: {
    select: {
      id: true,
      status: true,
      companyId: true,
      deletedAt: true,
    },
  },
  assignee: true,
  outcome: true,
  checklistItems: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.TaskStageInclude;

function hasLinkedOutcomeEntity(outcome: {
  companyId?: string | null;
  generatedDocumentId?: string | null;
  esigningEnvelopeId?: string | null;
}) {
  return Boolean(
    outcome.companyId
    || outcome.generatedDocumentId
    || outcome.esigningEnvelopeId,
  );
}

export async function getTaskStageDetail(
  tenantId: string,
  taskId: string,
  stageId: string,
) {
  let stage = await prisma.taskStage.findFirst({
    where: {
      id: stageId,
      taskId,
      tenantId,
      task: { deletedAt: null },
    },
    include: stageDetailInclude,
  });
  if (!stage) throw new NotFoundError('Task stage not found');

  const recovered = !stage.outcome
    ? await recoverTaskStageOutcomeFromDurableContext(tenantId, stage)
    : false;
  if (stage.outcome || recovered) {
    await reconcileTaskStageOutcome(tenantId, stage.id);
    stage = await prisma.taskStage.findFirst({
      where: {
        id: stageId,
        taskId,
        tenantId,
        task: { deletedAt: null },
      },
      include: stageDetailInclude,
    });
    if (!stage) throw new NotFoundError('Task stage not found');
  }

  const adapter = getStageActionAdapter(stage.actionType);
  const adapterContext = { tenantId, stage };
  let resolvedOutcome: ResolvedStageOutcome | null = null;
  let outcomeUnavailable = false;

  if (stage.outcome) {
    if (!hasLinkedOutcomeEntity(stage.outcome)) {
      outcomeUnavailable = true;
    } else {
      const parsed = taskStageOutcomeSchema.parse({
        type: stage.outcome.type,
        companyId: stage.outcome.companyId,
        generatedDocumentId: stage.outcome.generatedDocumentId,
        esigningEnvelopeId: stage.outcome.esigningEnvelopeId,
      });
      try {
        resolvedOutcome = await resolveAuthoritativeOutcome(prisma, tenantId, parsed);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        outcomeUnavailable = true;
      }
    }
  }

  return {
    ...stage,
    ...(outcomeUnavailable ? { status: TaskStageStatus.FAILED } : {}),
    blockers: adapter.blockers(adapterContext),
    launch: adapter.launch(adapterContext),
    outcomeSummary: adapter.outcomeSummary(resolvedOutcome),
  };
}

export async function recoverTaskStageOutcomeFromDurableContext(
  tenantId: string,
  stage: {
    id: string;
    taskId: string;
    actionType: TaskStageActionType;
  },
) {
  const contextFilter = {
    path: ['taskStageId'],
    equals: stage.id,
  } as const;
  const metadataContextFilter = {
    path: ['taskIntegrationContext', 'taskStageId'],
    equals: stage.id,
  } as const;

  if (stage.actionType === TaskStageActionType.COMPANY_PROFILE) {
    const company = await prisma.company.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        taskIntegrationContext: contextFilter,
      },
      select: { id: true },
    });
    if (!company) return false;
    await linkTaskStageOutcome(tenantId, stage.id, {
      type: TaskStageOutcomeType.COMPANY,
      companyId: company.id,
    });
    return true;
  }
  if (stage.actionType === TaskStageActionType.DOCUMENT_GENERATION) {
    const document = await prisma.generatedDocument.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        metadata: metadataContextFilter,
      },
      select: { id: true },
    });
    if (!document) return false;
    await linkTaskStageOutcome(tenantId, stage.id, {
      type: TaskStageOutcomeType.GENERATED_DOCUMENT,
      generatedDocumentId: document.id,
    });
    return true;
  }
  if (stage.actionType === TaskStageActionType.ESIGNING) {
    const envelope = await prisma.esigningEnvelope.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        metadata: metadataContextFilter,
      },
      select: { id: true },
    });
    if (!envelope) return false;
    await linkTaskStageOutcome(tenantId, stage.id, {
      type: TaskStageOutcomeType.ESIGNING_ENVELOPE,
      esigningEnvelopeId: envelope.id,
    });
    return true;
  }
  return false;
}

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

async function requireStageTaskId(
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
    select: { taskId: true },
  });
  if (!stage) throw new NotFoundError('Task stage not found');
  return stage.taskId;
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
    await lockTaskForUpdate(tx, tenantId, stage.taskId);
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
    await lockTaskForUpdate(tx, tenantId, item.taskStage.taskId);
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
  manualOnly = false,
) {
  return prisma.$transaction(async (tx) => {
    const stage = await requireStage(tx, tenantId, stageId);
    const lockedTask = await lockTaskForUpdate(tx, tenantId, stage.taskId);
    if (manualOnly && stage.actionType !== TaskStageActionType.MANUAL) {
      throw new ValidationError('Only MANUAL task stages support manual completion or reopening');
    }
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
      lockedTask.status,
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
) => setStageStatus(
  tenantId,
  stageId,
  TaskStageStatus.COMPLETED,
  userId,
  undefined,
  true,
);

export const reopenTaskStage = (
  tenantId: string,
  stageId: string,
  userId?: string,
) => setStageStatus(
  tenantId,
  stageId,
  TaskStageStatus.NOT_STARTED,
  userId,
  undefined,
  true,
);

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
    const lockedTask = await lockTaskForUpdate(tx, tenantId, stage.taskId);
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
    if (
      parsed.type === TaskStageOutcomeType.COMPANY
      && parsed.companyId
      && stage.task.companyId !== parsed.companyId
    ) {
      await tx.task.update({
        where: { id: stage.taskId },
        data: { companyId: parsed.companyId },
      });
    }
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
      lockedTask.status,
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
    const taskId = await requireStageTaskId(tx, tenantId, stageId);
    const lockedTask = await lockTaskForUpdate(tx, tenantId, taskId);
    const stage = await requireStage(tx, tenantId, stageId);
    if (stage.taskId !== taskId) {
      throw new ValidationError('Task stage parent changed during reconciliation');
    }
    if (stage.actionType === TaskStageActionType.MANUAL) {
      return {
        status: stage.status,
        summary: null,
        taskStatus: lockedTask.status,
      };
    }
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
        lockedTask.status,
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
    const stageOutcome = stage.outcome;

    const failUnavailableOutcome = async () => {
      const status = TaskStageStatus.FAILED;
      await tx.taskStage.update({
        where: { id: stage.id },
        data: { status, completedAt: null },
      });
      const taskStatus = await updateParentTaskStatus(
        tx,
        tenantId,
        stage.taskId,
        lockedTask.status,
      );
      await auditStageMutation(tx, {
        tenantId,
        userId,
        stageId: stage.id,
        companyId: stage.task.companyId,
        summary: 'Linked task stage outcome is no longer available',
        metadata: { outcomeId: stageOutcome.id, status, taskStatus },
      });
      return {
        status,
        summary: 'Linked outcome is no longer available',
        taskStatus,
      };
    };

    if (!hasLinkedOutcomeEntity(stageOutcome)) {
      return failUnavailableOutcome();
    }

    const input = taskStageOutcomeSchema.parse({
      type: stageOutcome.type,
      companyId: stageOutcome.companyId,
      generatedDocumentId: stageOutcome.generatedDocumentId,
      esigningEnvelopeId: stageOutcome.esigningEnvelopeId,
    });
    assertOutcomeMatchesAction(stage.actionType, input.type);
    let authoritative: ResolvedStageOutcome;
    try {
      authoritative = await resolveAuthoritativeOutcome(tx, tenantId, input);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      return failUnavailableOutcome();
    }
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
      lockedTask.status,
    );
    await auditStageMutation(tx, {
      tenantId,
      userId,
      stageId: stage.id,
      companyId: stage.task.companyId,
      summary: resolution.summary ?? 'Reconciled task stage outcome',
      metadata: { outcomeId: stageOutcome.id, status: resolution.status, taskStatus },
    });
    return { ...resolution, taskStatus };
  });
}
