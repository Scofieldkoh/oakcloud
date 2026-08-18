import type {
  DeadlineSearch,
  ResetDeadlineDateOverrideInput,
  UpdateDeadlineOccurrenceInput,
} from '@/lib/validations/deadline';

export type {
  DeadlineSearch,
  ResetDeadlineDateOverrideInput,
  UpdateDeadlineOccurrenceInput,
};

export type DeadlineTiming = 'UPCOMING' | 'DUE' | 'OVERDUE';

export interface DeadlineScope {
  tenantId: string;
  /** Undefined means all companies in the tenant; [] means no access. */
  companyIds?: string[];
}

export interface DeadlineActor {
  tenantId: string;
  userId: string;
}

export interface DeadlineCompanyDto {
  id: string;
  name: string;
  displayAlias: string | null;
  displayLabel: string;
  uen?: string | null;
}

export interface DeadlineFamilyDto {
  id: string | null;
  name: string;
  displayColor: string | null;
}

export interface DeadlineServiceDto {
  id: string;
  name: string;
  familyName: string;
  variantId: string | null;
  variantName: string | null;
}

export interface DeadlineCycleDto {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
}

export interface DeadlineOccurrenceDto {
  id: string;
  tenantId: string;
  companyId: string;
  clientServiceId: string;
  cycleId: string;
  ruleVersionId: string;
  milestoneKey: string;
  scheduleEntryKey: string;
  deadlineType: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
  calculatedDueDate: string;
  operativeDueDate: string;
  dueDate: string;
  dateOverridden: boolean;
  dateOverride: string | null;
  dateOverrideReason: string | null;
  dateOverriddenById: string | null;
  dateOverriddenAt: string | null;
  status: 'OPEN' | 'COMPLETED' | 'WAIVED' | 'CANCELLED';
  timingState: DeadlineTiming | null;
  completedAt: string | null;
  completedById: string | null;
  waivedAt: string | null;
  waivedById: string | null;
  waiverReason: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  origin: 'RULE' | 'MANUAL_TRIGGER';
  createdAt: string;
  updatedAt: string;
  company: DeadlineCompanyDto;
  family: DeadlineFamilyDto;
  service: DeadlineServiceDto;
  cycle: DeadlineCycleDto | null;
}

export interface DeadlineTableResult {
  mode: 'TABLE';
  items: DeadlineOccurrenceDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DeadlineCalendarResult {
  mode: 'CALENDAR';
  items: DeadlineOccurrenceDto[];
  truncated: boolean;
  warning?: string;
}

export type DeadlineListResult = DeadlineTableResult | DeadlineCalendarResult;

export interface DeadlineDb {
  deadlineOccurrence: {
    findMany: (args: unknown) => Promise<unknown[]>;
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<unknown | null>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  $transaction?: <T>(callback: (tx: DeadlineDb) => Promise<T>) => Promise<T>;
}

export interface ListDeadlinesOptions {
  /** Injectable Singapore date for deterministic service and route tests. */
  today?: `${number}-${number}-${number}`;
}
