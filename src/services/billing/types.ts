import type {
  BusinessCalendarSnapshot,
  DateOnly,
  ScheduleEntry,
} from '@/services/service-schedule';

export type BillingCadence = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'ONE_TIME' | 'CUSTOM';

export type BillingScheduleConfigV1 = {
  schemaVersion: 1;
  cadence: BillingCadence;
  startDate: DateOnly | null;
  customInterval: { unit: 'MONTH'; count: number } | null;
  scheduleEntries: ScheduleEntry[];
};

export type BillingScheduleIssueType =
  | 'MISSING_START_DATE'
  | 'INVALID_CUSTOM_SCHEDULE'
  | 'INVALID_BILLING_FREQUENCY';

export type LegacyBillingFrequency = BillingCadence;

export type LegacyBillingScheduleInput = {
  billingFrequency: LegacyBillingFrequency;
  billingStartDate: DateOnly | Date | string | null;
  customFrequencyLabel: string | null;
};

export type BillingScheduleConversion = {
  config: BillingScheduleConfigV1 | null;
  issueType: BillingScheduleIssueType | null;
};

export type EvaluatedBillingOccurrence = {
  feeLineId: string;
  billingPeriodKey: string;
  scheduleEntryKey: string;
  generationKey: string;
  calculatedExpectedDate: DateOnly;
  operativeExpectedDate: DateOnly;
  amount: string;
  currency: string;
  periodStart: DateOnly;
  periodEnd: DateOnly;
};

export type BillingScheduleEvaluationInput = {
  config: BillingScheduleConfigV1;
  feeLine: { id: string; amount: string; currency: string };
  calendar: BusinessCalendarSnapshot;
  from: DateOnly;
  to: DateOnly;
  generationKey: string;
};

export type BillingReconciliationWarning = {
  code: string;
  message: string;
  feeLineId?: string;
  permanent?: boolean;
};

export type BillingReconciliationPreservedCounts = {
  MANUAL_TRIGGER: number;
  HISTORICAL: number;
  BILLED: number;
  WAIVED: number;
  CANCELLED: number;
  OVERRIDDEN: number;
};

export type BillingReconciliationResult = {
  clientServiceId: string;
  created: number;
  recalculated: number;
  cancelled: number;
  preserved: number;
  preservedByReason: BillingReconciliationPreservedCounts;
  warnings: BillingReconciliationWarning[];
};

export type ReconcileClientServiceBillingInput = {
  tenantId: string;
  clientServiceId: string;
  today: DateOnly;
  horizonEnd: DateOnly;
  writeMode: 'OBSERVE' | 'APPLY';
  reconciliationRequestId: string;
  /** Optional human actor; automatic APPLY cancellations retain request provenance. */
  cancellationActorId?: string | null;
  assertLease?: () => Promise<void>;
};
