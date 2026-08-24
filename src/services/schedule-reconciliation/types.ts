import type { Prisma } from '@/generated/prisma';
import type { DateOnly } from '@/services/service-schedule';
import type { BillingReconciliationResult } from '@/services/billing';

export type ScheduleReconciliationScopeType =
  | 'TENANT'
  | 'COMPANY'
  | 'CLIENT_SERVICE'
  | 'RULE'
  | 'BUSINESS_CALENDAR';

export type EnqueueScheduleReconciliationInput = {
  tenantId: string;
  scopeType: ScheduleReconciliationScopeType;
  scopeId: string;
  triggerType: string;
  correlationId: string;
  requestedById: string | null;
  notBefore?: Date;
};

export type ScheduleReconciliationRequestRef = {
  id: string;
  dedupeKey: string;
};

export type ScheduleReconciliationDb = Pick<
  Prisma.TransactionClient,
  'serviceScheduleReconciliationRequest'
>;

export type PreserveReason =
  | 'MANUAL_TRIGGER'
  | 'HISTORICAL'
  | 'COMPLETED'
  | 'WAIVED'
  | 'CANCELLED'
  | 'OVERRIDDEN';

export type DeadlineReconciliationAction =
  | 'CREATE'
  | 'RECALCULATE'
  | 'CANCEL'
  | 'PRESERVE'
  | 'NO_CHANGE';

export type DeadlineReconciliationPreservedCounts = {
  MANUAL_TRIGGER: number;
  HISTORICAL: number;
  COMPLETED: number;
  WAIVED: number;
  CANCELLED: number;
  OVERRIDDEN: number;
};

export type DeadlineReconciliationCounts = {
  created: number;
  recalculated: number;
  cancelled: number;
  preserved: number;
  noChange: number;
};

export type DeadlineReconciliationOperation = 'PUBLISH' | 'ARCHIVE';

export type DeadlineReconciliationWarning = {
  code: string;
  message: string;
  ruleId?: string;
  ruleVersionId?: string;
  missingFields?: string[];
  permanent?: boolean;
};

export type DeadlineReconciliationResult = {
  tenantId: string;
  clientServiceId: string;
  reconciliationRequestId: string;
  writeMode: 'OBSERVE' | 'APPLY';
  counts: DeadlineReconciliationCounts;
  preservedByReason: DeadlineReconciliationPreservedCounts;
  warnings: DeadlineReconciliationWarning[];
};

export type ServiceScheduleReconciliationSummary = {
  deadlines: DeadlineReconciliationResult;
  billing: BillingReconciliationResult;
};

export type ReconcileClientServiceDeadlinesInput = {
  tenantId: string;
  clientServiceId: string;
  ruleId?: string;
  operation?: DeadlineReconciliationOperation;
  today: DateOnly;
  horizonEnd: DateOnly;
  writeMode: 'OBSERVE' | 'APPLY';
  reconciliationRequestId: string;
  assertLease?: () => Promise<void>;
};

export type StoredDeadline = {
  id: string;
  cycleId: string;
  milestoneKey: string;
  scheduleEntryKey: string;
  deadlineType: string;
  calculatedDueDate: DateOnly;
  operativeDueDate: DateOnly;
  dateOverridden: boolean;
  status: string;
  origin: string;
  ruleVersionId: string;
};

export type EvaluatedDeadlineForDiff = {
  milestoneKey: string;
  scheduleEntryKey: string;
  deadlineType: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
  dueDate: DateOnly;
  ruleVersionId: string;
  explanation?: string | string[];
};

export type ClassifyDeadlineChangeResult =
  | { action: 'CREATE' }
  | { action: 'RECALCULATE' }
  | { action: 'NO_CHANGE' }
  | { action: 'PRESERVE'; reason: PreserveReason };
