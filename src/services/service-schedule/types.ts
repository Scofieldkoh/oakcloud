/**
 * Public, serializable contracts for service schedule evaluation.
 *
 * DateOnly deliberately remains a string at the boundary. Runtime callers
 * must use the date-only parser before doing arithmetic; the template literal
 * only documents the wire format to TypeScript consumers.
 */
export type DateOnly = `${number}-${number}-${number}`;

export type BusinessDayAdjustment = 'NONE' | 'PREVIOUS' | 'NEXT';

export type DateSource =
  | {
      kind: 'COMPANY_FIELD';
      field:
        | 'financialYearEnd'
        | 'nextAgmDueDate'
        | 'nextArDueDate'
        | 'accountsDueDate'
        | 'incorporationDate';
    }
  | { kind: 'CYCLE_START' | 'CYCLE_END' }
  | { kind: 'PARAMETER'; key: string }
  | { kind: 'SCHEDULE_ENTRY'; key: string }
  | { kind: 'MILESTONE'; key: string };

export type ScheduleEntryExpression =
  | { kind: 'DAY_OF_MONTH'; day: number }
  | { kind: 'BUSINESS_DAY_FROM_START'; ordinal: number }
  | { kind: 'BUSINESS_DAY_FROM_END'; ordinal: number }
  | {
      kind: 'RELATIVE_TO_SOURCE';
      source: DateSource;
      offset: number;
      unit: 'CALENDAR_DAY' | 'BUSINESS_DAY';
    };

export type ScheduleEntry = {
  key: string;
  label: string;
  expression: ScheduleEntryExpression;
  businessDayAdjustment: BusinessDayAdjustment;
};

export type MilestoneExpression = ScheduleEntryExpression;
export type DateExpression = ScheduleEntryExpression;

export type DateOperation =
  | {
      kind: 'RELATIVE_TO_SOURCE';
      source: DateSource;
      offset: number;
      unit: 'CALENDAR_DAY' | 'BUSINESS_DAY';
    }
  | {
      kind: 'ADD';
      source?: DateSource;
      offset: number;
      unit: 'CALENDAR_DAY' | 'BUSINESS_DAY';
    }
  | { kind: 'ADD_CALENDAR_DAYS'; amount: number }
  | { kind: 'ADD_BUSINESS_DAYS'; amount: number }
  | { kind: 'ADD_MONTHS'; amount: number }
  | { kind: 'ADJUST_BUSINESS_DAY'; adjustment: BusinessDayAdjustment };

export type RuleRecurrenceDefinition =
  | { schemaVersion: 1; kind: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY'; interval?: number }
  | { schemaVersion: 1; kind: 'ONE_TIME' }
  | { schemaVersion: 1; kind: 'CUSTOM'; interval: number; unit: 'MONTH' };

export type RuleRecurrence = RuleRecurrenceDefinition;

export type MilestoneDefinition = {
  key: string;
  name: string;
  description: string | null;
  type: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
  generationMode: 'ONCE_PER_CYCLE' | 'ONCE_PER_SCHEDULE_ENTRY';
  expression: ScheduleEntryExpression;
  businessDayAdjustment: BusinessDayAdjustment;
  displayOrder: number;
  isActive: boolean;
};

export type CompanyField =
  | 'financialYearEnd'
  | 'nextAgmDueDate'
  | 'nextArDueDate'
  | 'accountsDueDate'
  | 'incorporationDate'
  | 'registrationDate'
  | 'entityType'
  | 'status'
  | 'isGstRegistered'
  | 'isRegisteredCharity'
  | 'isIPC'
  | 'hasCharges'
  | 'currentOfficerCount'
  | 'currentShareholderCount'
  | 'annualReceiptsOrExpenditure'
  | 'primarySsicCode'
  | 'secondarySsicCode'
  | 'uen'
  | 'name';

export type CompanyRuleSource = Partial<Record<CompanyField, unknown>>;

export type ApplicabilityPredicate =
  | { kind: 'FIELD_EQUALS'; field: CompanyField; value: string | number | boolean }
  | { kind: 'FIELD_NOT_EQUALS'; field: CompanyField; value: string | number | boolean }
  | { kind: 'FIELD_IN'; field: CompanyField; values: Array<string | number | boolean> }
  | { kind: 'FIELD_NOT_IN'; field: CompanyField; values: Array<string | number | boolean> }
  | { kind: 'FIELD_TRUE'; field: CompanyField }
  | { kind: 'FIELD_FALSE'; field: CompanyField }
  | { kind: 'FIELD_PRESENT'; field: CompanyField }
  | { kind: 'FIELD_MISSING'; field: CompanyField }
  | {
      kind: 'FIELD_COMPARE';
      field: CompanyField;
      operator: 'GT' | 'GTE' | 'LT' | 'LTE';
      value: string | number;
    };

export type ApplicabilityGroup = {
  kind: 'ALL' | 'ANY';
  conditions: Array<ApplicabilityPredicate | ApplicabilityGroup>;
};

export type ApplicabilityDefinition = ApplicabilityGroup & { schemaVersion: 1 };

export type DeadlineParameterDefinition = {
  key: string;
  label: string;
  description?: string | null;
  type: 'STRING' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'ENUM';
  required: boolean;
  options?: string[];
};

export type BusinessCalendarSnapshot = {
  id: string;
  timeZone: string;
  weekendDays: ReadonlySet<number>;
  holidays: ReadonlySet<DateOnly>;
  revision: number;
};
