import {
  Prisma,
  TaskStageStatus,
  TaskStatus,
  type TaskStatus as TaskStatusValue,
} from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import {
  archiveTaskSchema,
  createTaskSchema,
  updateTaskMetadataSchema,
  type CreateTaskInput,
  type UpdateTaskMetadataInput,
} from '@/lib/validations/task';
import { deriveTaskStatus } from './status';
import { lockTaskForUpdate } from './locking';
import type { ChecklistDefinition } from './types';

const taskDetailInclude = {
  company: true,
  owner: true,
  pipelineVersion: { include: { pipeline: true } },
  stages: {
    orderBy: { position: 'asc' as const },
    include: {
      assignee: true,
      checklistItems: { orderBy: { position: 'asc' as const } },
      outcome: true,
    },
  },
} satisfies Prisma.TaskInclude;

export interface ListTasksOptions {
  includeDeleted?: boolean;
  status?: TaskStatusValue;
  companyId?: string;
  ownerId?: string;
}

export async function listTasks(tenantId: string, options: ListTasksOptions = {}) {
  return prisma.task.findMany({
    where: {
      tenantId,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
      ...(options.status ? { status: options.status } : {}),
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(options.ownerId ? { ownerId: options.ownerId } : {}),
    },
    include: taskDetailInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getTask(tenantId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId, deletedAt: null },
    include: taskDetailInclude,
  });
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  return task;
}

function checklistDefinitions(actionConfig: Prisma.JsonValue | null): ChecklistDefinition[] {
  if (!actionConfig || typeof actionConfig !== 'object' || Array.isArray(actionConfig)) {
    return [];
  }
  const definitions = actionConfig.checklistItems;
  if (!Array.isArray(definitions)) {
    return [];
  }
  return definitions.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!label) {
      return [];
    }
    return [{ label, position: typeof item.position === 'number' ? item.position : index }];
  });
}

async function validateTaskRelations(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId?: string | null,
  ownerId?: string | null,
) {
  if (companyId) {
    const company = await tx.company.findFirst({
      where: { id: companyId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundError('Company not found');
  }
  if (ownerId) {
    const owner = await tx.user.findFirst({
      where: { id: ownerId, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!owner) throw new NotFoundError('Task owner not found');
  }
}

export async function createTask(
  tenantId: string,
  input: CreateTaskInput,
  userId?: string,
) {
  const parsed = createTaskSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const version = await tx.taskPipelineVersion.findFirst({
      where: {
        id: parsed.pipelineVersionId,
        tenantId,
        publishedAt: { not: null },
        pipeline: { deletedAt: null },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (!version) {
      throw new NotFoundError('Published task pipeline version not found');
    }

    await validateTaskRelations(tx, tenantId, parsed.companyId, parsed.ownerId);

    const task = await tx.task.create({
      data: {
        tenantId,
        pipelineVersionId: version.id,
        title: parsed.title,
        description: parsed.description ?? null,
        companyId: parsed.companyId ?? null,
        ownerId: parsed.ownerId ?? null,
        dueDate: parsed.dueDate ?? null,
        status: TaskStatus.NOT_STARTED,
        snapshotLockedAt: null,
      },
    });

    for (const pipelineStage of version.stages) {
      const stage = await tx.taskStage.create({
        data: {
          tenantId,
          taskId: task.id,
          name: pipelineStage.name,
          description: pipelineStage.description,
          position: pipelineStage.position,
          actionType: pipelineStage.actionType,
          icon: pipelineStage.icon,
          isRequired: pipelineStage.isRequired,
          actionConfig: pipelineStage.actionConfig ?? Prisma.JsonNull,
          status: TaskStageStatus.NOT_STARTED,
        },
      });
      const checklist = checklistDefinitions(pipelineStage.actionConfig);
      if (checklist.length > 0) {
        await tx.taskStageChecklistItem.createMany({
          data: checklist.map((item) => ({
            tenantId,
            taskStageId: stage.id,
            label: item.label,
            position: item.position,
          })),
        });
      }
    }

    const lockedTask = await tx.task.update({
      where: { id: task.id },
      data: { snapshotLockedAt: new Date() },
      include: taskDetailInclude,
    });

    await createAuditLog({
      tenantId,
      userId,
      companyId: parsed.companyId ?? undefined,
      action: 'CREATE',
      entityType: 'Task',
      entityId: task.id,
      entityName: task.title,
      summary: `Created task "${task.title}"`,
      metadata: {
        pipelineVersionId: version.id,
        stageCount: version.stages.length,
      },
    }, tx);

    return lockedTask;
  });
}

async function requireTask(
  tx: Prisma.TransactionClient,
  tenantId: string,
  taskId: string,
) {
  const task = await tx.task.findFirst({
    where: { id: taskId, tenantId, deletedAt: null },
    include: { stages: { select: { status: true } } },
  });
  if (!task) throw new NotFoundError('Task not found');
  return task;
}

export async function updateTaskMetadata(
  tenantId: string,
  taskId: string,
  input: UpdateTaskMetadataInput,
  userId?: string,
) {
  const parsed = updateTaskMetadataSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await requireTask(tx, tenantId, taskId);
    await validateTaskRelations(tx, tenantId, parsed.companyId, parsed.ownerId);
    const updated = await tx.task.update({
      where: { id: existing.id },
      data: parsed,
      include: taskDetailInclude,
    });
    await createAuditLog({
      tenantId,
      userId,
      companyId: updated.companyId ?? undefined,
      action: 'UPDATE',
      entityType: 'Task',
      entityId: existing.id,
      entityName: updated.title,
      summary: `Updated task "${updated.title}"`,
    }, tx);
    return updated;
  });
}

export async function archiveTask(
  tenantId: string,
  taskId: string,
  reason: string,
  userId?: string,
) {
  const parsed = archiveTaskSchema.parse({ reason });
  return prisma.$transaction(async (tx) => {
    const existing = await requireTask(tx, tenantId, taskId);
    const archived = await tx.task.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedReason: parsed.reason },
    });
    await createAuditLog({
      tenantId,
      userId,
      companyId: existing.companyId ?? undefined,
      action: 'DELETE',
      entityType: 'Task',
      entityId: existing.id,
      entityName: existing.title,
      reason: parsed.reason,
      summary: `Archived task "${existing.title}"`,
    }, tx);
    return archived;
  });
}

async function setTaskStatus(
  tenantId: string,
  taskId: string,
  status: TaskStatusValue | 'RESUME',
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await lockTaskForUpdate(tx, tenantId, taskId);
    if (status === TaskStatus.PAUSED) {
      if (
        existing.status === TaskStatus.PAUSED
        || existing.status === TaskStatus.COMPLETED
        || existing.status === TaskStatus.CANCELLED
      ) {
        throw new ValidationError(`Cannot pause a ${existing.status} task`);
      }
    } else if (status === TaskStatus.CANCELLED) {
      if (
        existing.status === TaskStatus.COMPLETED
        || existing.status === TaskStatus.CANCELLED
      ) {
        throw new ValidationError(`Cannot cancel a ${existing.status} task`);
      }
    } else if (existing.status !== TaskStatus.PAUSED) {
      throw new ValidationError('Only PAUSED tasks can be resumed');
    }

    const nextStatus = status === 'RESUME'
      ? deriveTaskStatus(await tx.taskStage.findMany({
        where: { tenantId, taskId: existing.id },
        select: { status: true },
      }))
      : status;
    const updated = await tx.task.update({
      where: { id: existing.id },
      data: { status: nextStatus },
      include: taskDetailInclude,
    });
    await createAuditLog({
      tenantId,
      userId,
      companyId: existing.companyId ?? undefined,
      action: 'UPDATE',
      entityType: 'Task',
      entityId: existing.id,
      entityName: existing.title,
      summary: `Changed task status to ${nextStatus}`,
      metadata: { previousStatus: existing.status, status: nextStatus },
    }, tx);
    return updated;
  });
}

export const pauseTask = (tenantId: string, taskId: string, userId?: string) => (
  setTaskStatus(tenantId, taskId, TaskStatus.PAUSED, userId)
);
export const resumeTask = (tenantId: string, taskId: string, userId?: string) => (
  setTaskStatus(tenantId, taskId, 'RESUME', userId)
);
export const cancelTask = (tenantId: string, taskId: string, userId?: string) => (
  setTaskStatus(tenantId, taskId, TaskStatus.CANCELLED, userId)
);
