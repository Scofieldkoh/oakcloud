import {
  TaskStageActionType,
  TaskStageOutcomeType,
} from '@/generated/prisma';
import { NotFoundError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  getTaskStageDetail,
  linkTaskStageOutcome,
  reconcileTaskStageOutcome,
} from './stage.service';
import type { TaskLaunchContext } from './types';

const log = createLogger('tasks:integration');

export const taskLaunchContextSchema = z.object({
  taskId: z.string().uuid(),
  taskStageId: z.string().uuid(),
  returnTo: z.string().trim().min(1).max(2_000).optional(),
}).strict();

export function parseTaskLaunchContext(value: unknown): TaskLaunchContext | undefined {
  return value === undefined || value === null
    ? undefined
    : taskLaunchContextSchema.parse(value);
}

interface LinkTaskOutcomeInput {
  tenantId: string;
  context: TaskLaunchContext;
  authoritativeId: string;
  userId?: string;
}

export async function preflightTaskLaunchContext(
  tenantId: string,
  context: TaskLaunchContext,
  expectedAction: TaskStageActionType,
) {
  const stage = await getTaskStageDetail(
    tenantId,
    context.taskId,
    context.taskStageId,
  );
  if (stage.actionType !== expectedAction) {
    throw new Error(`Task stage action must be ${expectedAction}`);
  }
  return stage;
}

async function linkAuthoritativeOutcome(
  input: LinkTaskOutcomeInput,
  outcome:
    | { type: typeof TaskStageOutcomeType.COMPANY; companyId: string }
    | {
      type: typeof TaskStageOutcomeType.GENERATED_DOCUMENT;
      generatedDocumentId: string;
    }
    | {
      type: typeof TaskStageOutcomeType.ESIGNING_ENVELOPE;
      esigningEnvelopeId: string;
    },
) {
  await getTaskStageDetail(
    input.tenantId,
    input.context.taskId,
    input.context.taskStageId,
  );
  return linkTaskStageOutcome(
    input.tenantId,
    input.context.taskStageId,
    outcome,
    input.userId,
  );
}

export function linkCompanyTaskOutcome(input: LinkTaskOutcomeInput) {
  return linkAuthoritativeOutcome(input, {
    type: TaskStageOutcomeType.COMPANY,
    companyId: input.authoritativeId,
  });
}

export function linkGeneratedDocumentTaskOutcome(input: LinkTaskOutcomeInput) {
  return linkAuthoritativeOutcome(input, {
    type: TaskStageOutcomeType.GENERATED_DOCUMENT,
    generatedDocumentId: input.authoritativeId,
  });
}

export function linkEsigningEnvelopeTaskOutcome(input: LinkTaskOutcomeInput) {
  return linkAuthoritativeOutcome(input, {
    type: TaskStageOutcomeType.ESIGNING_ENVELOPE,
    esigningEnvelopeId: input.authoritativeId,
  });
}

async function safelyRunTaskCallback(
  label: string,
  callback: () => Promise<unknown>,
) {
  try {
    await callback();
  } catch (error) {
    log.warn(`Task integration callback failed after ${label}`, { error });
  }
}

export function safelyLinkCompanyTaskOutcome(input: LinkTaskOutcomeInput) {
  return safelyRunTaskCallback(
    'company mutation',
    () => linkCompanyTaskOutcome(input),
  );
}

export function safelyLinkGeneratedDocumentTaskOutcome(input: LinkTaskOutcomeInput) {
  return safelyRunTaskCallback(
    'generated document mutation',
    () => linkGeneratedDocumentTaskOutcome(input),
  );
}

export function safelyLinkEsigningEnvelopeTaskOutcome(input: LinkTaskOutcomeInput) {
  return safelyRunTaskCallback(
    'e-signing envelope mutation',
    () => linkEsigningEnvelopeTaskOutcome(input),
  );
}

async function reconcileLinkedOutcomes(
  tenantId: string,
  where:
    | { companyId: string }
    | { generatedDocumentId: string }
    | { esigningEnvelopeId: string },
  userId?: string,
) {
  const outcomes = await prisma.taskStageOutcome.findMany({
    where: { tenantId, ...where },
    select: { taskStageId: true },
  });
  await Promise.all(
    outcomes.map(({ taskStageId }) => (
      reconcileTaskStageOutcome(tenantId, taskStageId, userId)
    )),
  );
}

export function reconcileCompanyTaskOutcomes(
  tenantId: string,
  companyId: string,
  userId?: string,
) {
  return reconcileLinkedOutcomes(tenantId, { companyId }, userId);
}

export function reconcileGeneratedDocumentTaskOutcomes(
  tenantId: string,
  generatedDocumentId: string,
  userId?: string,
) {
  return reconcileLinkedOutcomes(
    tenantId,
    { generatedDocumentId },
    userId,
  );
}

export function reconcileEsigningEnvelopeTaskOutcomes(
  tenantId: string,
  esigningEnvelopeId: string,
  userId?: string,
) {
  return reconcileLinkedOutcomes(
    tenantId,
    { esigningEnvelopeId },
    userId,
  );
}

export function safelyReconcileGeneratedDocumentTaskOutcomes(
  tenantId: string,
  generatedDocumentId: string,
  userId?: string,
) {
  return safelyRunTaskCallback(
    'generated document lifecycle change',
    () => reconcileGeneratedDocumentTaskOutcomes(
      tenantId,
      generatedDocumentId,
      userId,
    ),
  );
}

export function safelyReconcileCompanyTaskOutcomes(
  tenantId: string,
  companyId: string,
  userId?: string,
) {
  return safelyRunTaskCallback(
    'company lifecycle change',
    () => reconcileCompanyTaskOutcomes(tenantId, companyId, userId),
  );
}

export async function safelyCaptureCompanyTaskStageIds(
  tenantId: string,
  companyId: string,
) {
  try {
    const [outcomes, recoveries] = await Promise.all([
      prisma.taskStageOutcome.findMany({
        where: { tenantId, companyId },
        select: { taskStageId: true },
      }),
      prisma.taskCompanyRecoveryContext.findMany({
        where: { tenantId, companyId },
        select: { taskStageId: true },
      }),
    ]);
    return Array.from(new Set([
      ...outcomes.map(({ taskStageId }) => taskStageId),
      ...recoveries.map(({ taskStageId }) => taskStageId),
    ]));
  } catch (error) {
    log.warn('Failed to capture linked task stages before company deletion', {
      error,
    });
    return [];
  }
}

export function safelyReconcileEsigningEnvelopeTaskOutcomes(
  tenantId: string,
  esigningEnvelopeId: string,
  userId?: string,
) {
  return safelyRunTaskCallback(
    'e-signing envelope lifecycle change',
    () => reconcileEsigningEnvelopeTaskOutcomes(
      tenantId,
      esigningEnvelopeId,
      userId,
    ),
  );
}

export async function safelyCaptureEsigningTaskStageIds(
  tenantId: string,
  esigningEnvelopeId: string,
) {
  try {
    const outcomes = await prisma.taskStageOutcome.findMany({
      where: { tenantId, esigningEnvelopeId },
      select: { taskStageId: true },
    });
    return outcomes.map(({ taskStageId }) => taskStageId);
  } catch (error) {
    log.warn('Failed to capture linked task stages before e-signing deletion', {
      error,
    });
    return [];
  }
}

export function safelyReconcileTaskStageIds(
  tenantId: string,
  taskStageIds: string[],
  userId?: string,
) {
  return safelyRunTaskCallback(
    'authoritative record deletion',
    async () => {
      const stages = await prisma.taskStage.findMany({
        where: { tenantId, id: { in: taskStageIds } },
        select: { id: true, taskId: true },
      });
      await Promise.all(stages.map(({ id, taskId }) => (
        getTaskStageDetail(tenantId, taskId, id, userId)
      )));
    },
  );
}

export async function findPreferredEsigningDocument(
  tenantId: string,
  context: TaskLaunchContext,
) {
  const stage = await prisma.taskStage.findFirst({
    where: {
      id: context.taskStageId,
      taskId: context.taskId,
      tenantId,
      actionType: TaskStageActionType.ESIGNING,
      task: { deletedAt: null },
    },
    select: { id: true, position: true },
  });
  if (!stage) throw new NotFoundError('Task stage not found');

  const outcome = await prisma.taskStageOutcome.findFirst({
    where: {
      tenantId,
      taskStage: {
        taskId: context.taskId,
        position: { lt: stage.position },
        actionType: TaskStageActionType.DOCUMENT_GENERATION,
      },
      generatedDocument: {
        tenantId,
        status: 'FINALIZED',
        deletedAt: null,
      },
    },
    orderBy: { taskStage: { position: 'desc' } },
    select: {
      generatedDocument: {
        select: { id: true, title: true, companyId: true },
      },
    },
  });

  return outcome?.generatedDocument ?? null;
}

export async function resolveEsigningGeneratedDocument(
  tenantId: string,
  context: TaskLaunchContext,
  selectedGeneratedDocumentId?: string,
) {
  await preflightTaskLaunchContext(
    tenantId,
    context,
    TaskStageActionType.ESIGNING,
  );
  if (!selectedGeneratedDocumentId) {
    const preferred = await findPreferredEsigningDocument(tenantId, context);
    if (!preferred) {
      throw new NotFoundError('No eligible finalized document is available');
    }
    return preferred;
  }

  const selected = await prisma.generatedDocument.findFirst({
    where: {
      id: selectedGeneratedDocumentId,
      tenantId,
      status: 'FINALIZED',
      deletedAt: null,
    },
    select: { id: true, title: true, companyId: true },
  });
  if (!selected) {
    throw new NotFoundError('Selected generated document must be finalized and eligible');
  }
  return selected;
}
