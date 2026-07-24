import {
  TaskStageActionType,
  TaskStageOutcomeType,
  TaskStageStatus,
  type TaskStageActionType as TaskStageActionTypeValue,
} from '@/generated/prisma';
import { ValidationError } from '@/lib/errors';
import { z } from 'zod';
import type {
  ResolvedStageOutcome,
  StageActionAdapter,
  StageActionAdapterContext,
  StageActionBlocker,
  StageActionConfig,
  StageActionLaunch,
} from './types';

const checklistSchema = z.array(z.object({
  label: z.string().trim().min(1).max(300),
  position: z.number().int().nonnegative(),
})).optional();

const baseConfigSchema = z.object({
  checklistItems: checklistSchema,
}).passthrough();

function parseConfig(value: unknown): StageActionConfig {
  return baseConfigSchema.parse(value ?? {});
}

function launch(
  href: string | null,
  context: StageActionAdapterContext,
): StageActionLaunch {
  return {
    href,
    context: {
      taskId: context.stage.taskId,
      taskStageId: context.stage.id,
    },
  };
}

function noBlockers(): StageActionBlocker[] {
  return [];
}

const manualAdapter: StageActionAdapter = {
  actionType: TaskStageActionType.MANUAL,
  defaultIcon: 'CircleCheckBig',
  parseConfig,
  blockers: noBlockers,
  launch: (context) => launch(null, context),
  outcomeSummary: () => null,
  deriveStatus: () => TaskStageStatus.NOT_STARTED,
};

const companyAdapter: StageActionAdapter = {
  actionType: TaskStageActionType.COMPANY_PROFILE,
  defaultIcon: 'Building2',
  parseConfig,
  blockers: (context) => (
    context.stage.task?.companyId
      ? []
      : [{ code: 'COMPANY_REQUIRED', message: 'Link a company to continue' }]
  ),
  launch: (context) => launch(
    context.stage.task?.companyId
      ? `/companies/${context.stage.task.companyId}`
      : '/companies/new',
    context,
  ),
  outcomeSummary: (outcome) => (
    outcome?.entity.kind === 'company'
      ? `Linked company: ${outcome.entity.name}`
      : null
  ),
  deriveStatus: (outcome) => (
    outcome?.entity.kind === 'company'
      ? TaskStageStatus.COMPLETED
      : TaskStageStatus.NOT_STARTED
  ),
};

const documentAdapter: StageActionAdapter = {
  actionType: TaskStageActionType.DOCUMENT_GENERATION,
  defaultIcon: 'FileText',
  parseConfig,
  blockers: noBlockers,
  launch: (context) => launch('/document-generation', context),
  outcomeSummary: (outcome) => (
    outcome?.entity.kind === 'generatedDocument'
      ? `${outcome.entity.title} (${outcome.entity.status})`
      : null
  ),
  deriveStatus: (outcome) => {
    if (outcome?.entity.kind !== 'generatedDocument') {
      return TaskStageStatus.NOT_STARTED;
    }
    return outcome.entity.status === 'FINALIZED'
      ? TaskStageStatus.COMPLETED
      : TaskStageStatus.IN_PROGRESS;
  },
};

const esigningAdapter: StageActionAdapter = {
  actionType: TaskStageActionType.ESIGNING,
  defaultIcon: 'PenLine',
  parseConfig,
  blockers: noBlockers,
  launch: (context) => launch('/esigning', context),
  outcomeSummary: (outcome) => (
    outcome?.entity.kind === 'esigningEnvelope'
      ? `${outcome.entity.title}: ${outcome.entity.completedSignatures}/${outcome.entity.requiredSignatures} signed`
      : null
  ),
  deriveStatus: (outcome) => {
    if (outcome?.entity.kind !== 'esigningEnvelope') {
      return TaskStageStatus.NOT_STARTED;
    }
    if (['DECLINED', 'EXPIRED', 'VOIDED', 'CANCELLED'].includes(outcome.entity.status)) {
      return TaskStageStatus.FAILED;
    }
    if (
      outcome.entity.status === 'COMPLETED'
      && outcome.entity.requiredSignatures > 0
      && outcome.entity.completedSignatures >= outcome.entity.requiredSignatures
    ) {
      return TaskStageStatus.COMPLETED;
    }
    return TaskStageStatus.IN_PROGRESS;
  },
};

export const stageActionRegistry: Readonly<Record<TaskStageActionTypeValue, StageActionAdapter>> = {
  MANUAL: manualAdapter,
  COMPANY_PROFILE: companyAdapter,
  DOCUMENT_GENERATION: documentAdapter,
  ESIGNING: esigningAdapter,
};

export function getStageActionAdapter(actionType: TaskStageActionTypeValue): StageActionAdapter {
  const adapter = stageActionRegistry[actionType];
  if (!adapter) {
    throw new ValidationError(`Unsupported task stage action: ${actionType}`);
  }
  return adapter;
}

const expectedOutcomeType: Partial<Record<TaskStageActionTypeValue, string>> = {
  COMPANY_PROFILE: TaskStageOutcomeType.COMPANY,
  DOCUMENT_GENERATION: TaskStageOutcomeType.GENERATED_DOCUMENT,
  ESIGNING: TaskStageOutcomeType.ESIGNING_ENVELOPE,
};

export function assertOutcomeMatchesAction(
  actionType: TaskStageActionTypeValue,
  outcomeType: string,
) {
  const expected = expectedOutcomeType[actionType];
  if (!expected || expected !== outcomeType) {
    throw new ValidationError(
      `Outcome type ${outcomeType} does not match ${actionType} stage action`,
    );
  }
}

export function resolveStageActionOutcome(
  actionType: TaskStageActionTypeValue,
  outcome: ResolvedStageOutcome | null,
) {
  if (outcome) {
    assertOutcomeMatchesAction(actionType, outcome.type);
  }
  const adapter = getStageActionAdapter(actionType);
  return {
    status: adapter.deriveStatus(outcome),
    summary: adapter.outcomeSummary(outcome),
  };
}
