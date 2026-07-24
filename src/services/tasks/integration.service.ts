import {
  TaskStageActionType,
  TaskStageOutcomeType,
} from '@/generated/prisma';
import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  getTaskStageDetail,
  linkTaskStageOutcome,
  reconcileTaskStageOutcome,
} from './stage.service';
import type { TaskLaunchContext } from './types';

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

async function reconcileLinkedOutcomes(
  tenantId: string,
  where:
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
