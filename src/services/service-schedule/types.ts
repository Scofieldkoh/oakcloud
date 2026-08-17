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

export type BooleanCompanyField =
  | 'isGstRegistered'
  | 'isRegisteredCharity'
  | 'isIPC'
  | 'hasCharges';

export type NumericCompanyField =
  | 'currentOfficerCount'
  | 'currentShareholderCount'
  | 'annualReceiptsOrExpenditure';

export type DateCompanyField =
  | 'financialYearEnd'
  | 'nextAgmDueDate'
  | 'nextArDueDate'
  | 'accountsDueDate'
  | 'incorporationDate'
  | 'registrationDate';

export type StringCompanyField =
  | 'entityType'
  | 'status'
  | 'primarySsicCode'
  | 'secondarySsicCode'
  | 'uen'
  | 'name';

export type CompanyField = BooleanCompanyField | NumericCompanyField | DateCompanyField | StringCompanyField;

/** The runtime predicate schema's field-to-value compatibility map. */
export type CompanyFieldValueMap = {
  [Field in BooleanCompanyField]: boolean;
} & {
  [Field in NumericCompanyField]: number;
} & {
  [Field in DateCompanyField]: string;
} & {
  [Field in StringCompanyField]: string;
};

export type CompanyFieldValue = CompanyFieldValueMap[CompanyField];
export type CompanyRuleSource = Partial<CompanyFieldValueMap>;

type EqualityApplicabilityPredicate<Kind extends 'FIELD_EQUALS' | 'FIELD_NOT_EQUALS'> = {
  [Field in CompanyField]: {
    kind: Kind;
    field: Field;
    value: CompanyFieldValueMap[Field];
  };
}[CompanyField];

type ListApplicabilityPredicate<Kind extends 'FIELD_IN' | 'FIELD_NOT_IN'> = {
  [Field in CompanyField]: {
    kind: Kind;
    field: Field;
    values: Array<CompanyFieldValueMap[Field]>;
  };
}[CompanyField];

type BooleanApplicabilityPredicate<Kind extends 'FIELD_TRUE' | 'FIELD_FALSE'> = {
  [Field in BooleanCompanyField]: {
    kind: Kind;
    field: Field;
  };
}[BooleanCompanyField];

type PresenceApplicabilityPredicate<Kind extends 'FIELD_PRESENT' | 'FIELD_MISSING'> = {
  kind: Kind;
  field: CompanyField;
};

export type ComparisonOperator = 'GT' | 'GTE' | 'LT' | 'LTE';

type CompareApplicabilityPredicate = {
  [Field in NumericCompanyField]: {
    kind: 'FIELD_COMPARE';
    field: Field;
    operator: ComparisonOperator;
    value: number;
  };
}[NumericCompanyField] | {
  [Field in DateCompanyField]: {
    kind: 'FIELD_COMPARE';
    field: Field;
    operator: ComparisonOperator;
    value: string;
  };
}[DateCompanyField];

export type ApplicabilityPredicate =
  | EqualityApplicabilityPredicate<'FIELD_EQUALS'>
  | EqualityApplicabilityPredicate<'FIELD_NOT_EQUALS'>
  | ListApplicabilityPredicate<'FIELD_IN'>
  | ListApplicabilityPredicate<'FIELD_NOT_IN'>
  | BooleanApplicabilityPredicate<'FIELD_TRUE'>
  | BooleanApplicabilityPredicate<'FIELD_FALSE'>
  | PresenceApplicabilityPredicate<'FIELD_PRESENT'>
  | PresenceApplicabilityPredicate<'FIELD_MISSING'>
  | CompareApplicabilityPredicate;

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
