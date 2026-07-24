import type {
  Prisma,
  TaskStageActionType,
  TaskStageOutcomeType,
  TaskStageStatus,
} from '@/generated/prisma';

export interface TaskMutationActor {
  userId?: string;
}

export interface ChecklistDefinition {
  label: string;
  position: number;
}

export interface StageActionConfig {
  checklistItems?: ChecklistDefinition[];
  [key: string]: unknown;
}

export interface StageActionBlocker {
  code: string;
  message: string;
}

export interface StageActionLaunch {
  href: string | null;
  context: Record<string, string>;
}

export interface StageOutcomeReference {
  type: TaskStageOutcomeType;
  companyId?: string | null;
  generatedDocumentId?: string | null;
  esigningEnvelopeId?: string | null;
}

export interface StageActionRecord {
  id: string;
  tenantId: string;
  taskId: string;
  actionType: TaskStageActionType;
  actionConfig: Prisma.JsonValue | null;
  status: TaskStageStatus;
  task?: {
    companyId?: string | null;
  };
  outcome?: StageOutcomeReference | null;
}

export interface StageActionAdapterContext {
  tenantId: string;
  stage: StageActionRecord;
}

export interface ResolvedStageOutcome {
  type: TaskStageOutcomeType;
  entity:
    | { kind: 'company'; id: string; name: string }
    | { kind: 'generatedDocument'; id: string; title: string; status: string }
    | {
      kind: 'esigningEnvelope';
      id: string;
      title: string;
      status: string;
      requiredSignatures: number;
      completedSignatures: number;
    };
}

export interface StageActionAdapter {
  actionType: TaskStageActionType;
  defaultIcon: string;
  parseConfig(value: unknown): StageActionConfig;
  blockers(context: StageActionAdapterContext): StageActionBlocker[];
  launch(context: StageActionAdapterContext): StageActionLaunch;
  outcomeSummary(outcome: ResolvedStageOutcome | null): string | null;
  deriveStatus(outcome: ResolvedStageOutcome | null): TaskStageStatus;
}
