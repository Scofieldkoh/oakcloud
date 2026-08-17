import { z } from 'zod';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_DATE_OFFSET = 3660;
const MAX_APPLICABILITY_LEAVES = 50;
const MAX_APPLICABILITY_DEPTH = 5;

function isRealGregorianDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  // Date.UTC treats years 0-99 as 1900-1999. Setting the full year after
  // construction keeps validation Gregorian and independent of the host zone.
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (year <= 99) candidate.setUTCFullYear(year);
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export const dateOnlySchema = z.string().refine(isRealGregorianDate, {
  message: 'Expected a real Gregorian date in YYYY-MM-DD format',
});

const keySchema = z.string().trim().regex(KEY_PATTERN, {
  message: 'Keys must start with a lowercase letter and contain only lowercase letters, numbers, or hyphens',
});

// Parameter and milestone references are stable identifiers too, but the
// published starter rules use camelCase (for example monthsAfterFye). Schedule
// entry keys remain the stricter lowercase kebab-case form above.
const referenceKeySchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/, {
  message: 'Reference keys must start with a letter and contain only letters, numbers, or hyphens',
});

const companyDateFieldSchema = z.enum([
  'financialYearEnd',
  'nextAgmDueDate',
  'nextArDueDate',
  'accountsDueDate',
  'incorporationDate',
]);

export const companyDateSourceFieldSchema = companyDateFieldSchema;

const companyFieldSchema = z.enum([
  'financialYearEnd',
  'nextAgmDueDate',
  'nextArDueDate',
  'accountsDueDate',
  'incorporationDate',
  'registrationDate',
  'entityType',
  'status',
  'isGstRegistered',
  'isRegisteredCharity',
  'isIPC',
  'hasCharges',
  'currentOfficerCount',
  'currentShareholderCount',
  'annualReceiptsOrExpenditure',
  'primarySsicCode',
  'secondarySsicCode',
  'uen',
  'name',
]);

/** Typed, whitelisted date sources. Unknown Company fields are rejected. */
export const dateSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('COMPANY_FIELD'), field: companyDateFieldSchema }).strict(),
  z.object({ kind: z.literal('CYCLE_START') }).strict(),
  z.object({ kind: z.literal('CYCLE_END') }).strict(),
  z.object({ kind: z.literal('PARAMETER'), key: referenceKeySchema }).strict(),
  z.object({ kind: z.literal('SCHEDULE_ENTRY'), key: keySchema }).strict(),
  z.object({ kind: z.literal('MILESTONE'), key: referenceKeySchema }).strict(),
]);

const dateOffsetSchema = z.number().int().min(-MAX_DATE_OFFSET).max(MAX_DATE_OFFSET);
const dateUnitSchema = z.enum(['CALENDAR_DAY', 'BUSINESS_DAY']);
const businessDayAdjustmentSchema = z.enum(['NONE', 'PREVIOUS', 'NEXT']);

const relativeToSourceSchema = z.object({
  kind: z.literal('RELATIVE_TO_SOURCE'),
  source: dateSourceSchema,
  offset: dateOffsetSchema,
  unit: dateUnitSchema,
}).strict();

export const scheduleEntryExpressionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DAY_OF_MONTH'), day: z.number().int().min(1).max(31) }).strict(),
  z.object({ kind: z.literal('BUSINESS_DAY_FROM_START'), ordinal: z.number().int().min(1).max(31) }).strict(),
  z.object({ kind: z.literal('BUSINESS_DAY_FROM_END'), ordinal: z.number().int().min(1).max(31) }).strict(),
  relativeToSourceSchema,
]);

export const dateOperationSchema = z.discriminatedUnion('kind', [
  relativeToSourceSchema,
  z.object({
    kind: z.literal('ADD'),
    source: dateSourceSchema.optional(),
    offset: dateOffsetSchema,
    unit: dateUnitSchema,
  }).strict(),
  z.object({ kind: z.literal('ADD_CALENDAR_DAYS'), amount: dateOffsetSchema }).strict(),
  z.object({ kind: z.literal('ADD_BUSINESS_DAYS'), amount: dateOffsetSchema }).strict(),
  z.object({ kind: z.literal('ADD_MONTHS'), amount: dateOffsetSchema }).strict(),
  z.object({ kind: z.literal('ADJUST_BUSINESS_DAY'), adjustment: businessDayAdjustmentSchema }).strict(),
]);

// Milestones and schedule entries intentionally use the same constrained
// expression language. This keeps billing and deadline consumers on one DSL.
export const milestoneExpressionSchema = scheduleEntryExpressionSchema;
export const dateExpressionSchema = milestoneExpressionSchema;

export const scheduleEntrySchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(100),
  expression: scheduleEntryExpressionSchema,
  businessDayAdjustment: businessDayAdjustmentSchema,
}).strict();

export const scheduleEntriesSchema = z.array(scheduleEntrySchema).max(31, 'A schedule can contain at most 31 entries').superRefine((entries, ctx) => {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    if (seen.has(entry.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'key'],
        message: 'Schedule entry keys must be unique',
      });
    }
    seen.add(entry.key);
  }
});

const standardRecurrenceSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY']),
  interval: z.number().int().min(1).max(120).optional(),
}).strict();

const oneTimeRecurrenceSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('ONE_TIME'),
}).strict();

const customRecurrenceSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('CUSTOM'),
  interval: z.number().int().min(1).max(120),
  unit: z.literal('MONTH'),
}).strict();

export const recurrenceSchema = z.union([
  standardRecurrenceSchema,
  oneTimeRecurrenceSchema,
  customRecurrenceSchema,
]);

export const ruleRecurrenceSchema = recurrenceSchema;
export const recurrenceDefinitionSchema = recurrenceSchema;

const scalarSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
const comparisonValueSchema = z.union([z.string(), z.number().finite()]);

export const applicabilityPredicateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('FIELD_EQUALS'), field: companyFieldSchema, value: scalarSchema }).strict(),
  z.object({ kind: z.literal('FIELD_NOT_EQUALS'), field: companyFieldSchema, value: scalarSchema }).strict(),
  z.object({ kind: z.literal('FIELD_IN'), field: companyFieldSchema, values: z.array(scalarSchema).min(1).max(MAX_APPLICABILITY_LEAVES) }).strict(),
  z.object({ kind: z.literal('FIELD_NOT_IN'), field: companyFieldSchema, values: z.array(scalarSchema).min(1).max(MAX_APPLICABILITY_LEAVES) }).strict(),
  z.object({ kind: z.literal('FIELD_TRUE'), field: companyFieldSchema }).strict(),
  z.object({ kind: z.literal('FIELD_FALSE'), field: companyFieldSchema }).strict(),
  z.object({ kind: z.literal('FIELD_PRESENT'), field: companyFieldSchema }).strict(),
  z.object({ kind: z.literal('FIELD_MISSING'), field: companyFieldSchema }).strict(),
  z.object({
    kind: z.literal('FIELD_COMPARE'),
    field: companyFieldSchema,
    operator: z.enum(['GT', 'GTE', 'LT', 'LTE']),
    value: comparisonValueSchema,
  }).strict(),
]);

type ApplicabilityNode = z.infer<typeof applicabilityPredicateSchema> | {
  kind: 'ALL' | 'ANY';
  conditions: ApplicabilityNode[];
};

const applicabilityNodeSchema: z.ZodType<ApplicabilityNode> = z.lazy(() => z.union([
  applicabilityPredicateSchema,
  z.object({
    kind: z.enum(['ALL', 'ANY']),
    conditions: z.array(applicabilityNodeSchema).max(MAX_APPLICABILITY_LEAVES),
  }).strict(),
]));

function checkApplicabilityBounds(node: ApplicabilityNode, depth: number, state: { leaves: number }): string | null {
  if (depth > MAX_APPLICABILITY_DEPTH) return `Applicability groups may be nested at most ${MAX_APPLICABILITY_DEPTH} levels`;
  if ('field' in node) {
    // FIELD_IN/FIELD_NOT_IN are one predicate each; their configured values
    // are operands, not additional leaf predicates.
    state.leaves += 1;
    return state.leaves > MAX_APPLICABILITY_LEAVES
      ? `Applicability definitions may contain at most ${MAX_APPLICABILITY_LEAVES} leaf predicates`
      : null;
  }
  for (const child of node.conditions) {
    const issue = checkApplicabilityBounds(child, depth + 1, state);
    if (issue) return issue;
  }
  return null;
}

const applicabilityGroupBaseSchema = z.object({
  kind: z.enum(['ALL', 'ANY']),
  conditions: z.array(applicabilityNodeSchema).max(MAX_APPLICABILITY_LEAVES),
}).strict();

export const applicabilityGroupSchema = applicabilityGroupBaseSchema.superRefine((value, ctx) => {
  const issue = checkApplicabilityBounds(value, 1, { leaves: 0 });
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
});

export const applicabilityDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(['ALL', 'ANY']),
  conditions: z.array(applicabilityNodeSchema).max(MAX_APPLICABILITY_LEAVES),
}).strict().superRefine((value, ctx) => {
  const issue = checkApplicabilityBounds(value, 1, { leaves: 0 });
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
});

export const deadlineParameterDefinitionSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  type: z.enum(['STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'ENUM']),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'ENUM' && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Enum parameters require at least one option' });
  }
  if (value.type !== 'ENUM' && value.options) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Options are only valid for enum parameters' });
  }
});

export const deadlineMilestoneSchema = z.object({
  key: keySchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable(),
  type: z.enum(['STATUTORY', 'CLIENT', 'INTERNAL']),
  generationMode: z.enum(['ONCE_PER_CYCLE', 'ONCE_PER_SCHEDULE_ENTRY']),
  expression: milestoneExpressionSchema,
  businessDayAdjustment: businessDayAdjustmentSchema,
  displayOrder: z.number().int().min(0),
  isActive: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.generationMode === 'ONCE_PER_SCHEDULE_ENTRY') {
    const source = value.expression.kind === 'RELATIVE_TO_SOURCE' ? value.expression.source : null;
    if (!source || source.kind !== 'SCHEDULE_ENTRY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expression'],
        message: 'ONCE_PER_SCHEDULE_ENTRY milestones require a schedule entry source',
      });
    }
  }
});

export const scheduleConfigSchema = z.object({
  schemaVersion: z.literal(1),
  entries: scheduleEntriesSchema,
}).strict();

export const versionedScheduleEntriesSchema = scheduleConfigSchema;
export const scheduleEntriesConfigSchema = scheduleConfigSchema;

export type DateOnlyInput = z.infer<typeof dateOnlySchema>;
export type DateSourceInput = z.infer<typeof dateSourceSchema>;
export type DateOperationInput = z.infer<typeof dateOperationSchema>;
export type ScheduleEntryExpressionInput = z.infer<typeof scheduleEntryExpressionSchema>;
export type ScheduleEntryInput = z.infer<typeof scheduleEntrySchema>;
export type ScheduleEntriesInput = z.infer<typeof scheduleEntriesSchema>;
export type RuleRecurrenceInput = z.infer<typeof recurrenceSchema>;
export type ApplicabilityPredicateInput = z.infer<typeof applicabilityPredicateSchema>;
export type ApplicabilityDefinitionInput = z.infer<typeof applicabilityDefinitionSchema>;
export type DeadlineParameterDefinitionInput = z.infer<typeof deadlineParameterDefinitionSchema>;
export type DeadlineMilestoneInput = z.infer<typeof deadlineMilestoneSchema>;

export {
  KEY_PATTERN,
  MAX_APPLICABILITY_DEPTH,
  MAX_APPLICABILITY_LEAVES,
  MAX_DATE_OFFSET,
};
