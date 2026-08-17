import { DeadlineApiError, ErrorCodes, ValidationError } from '@/lib/errors';
import {
  collectApplicabilityFields,
  evaluateApplicability,
  type ApplicabilityInput,
  type ApplicabilityResult,
} from './applicability';
import {
  addBusinessDays,
  adjustBusinessDay,
  businessDayFromEnd,
  businessDayFromStart,
  isBusinessDay,
} from './business-days';
import {
  addCalendarDays,
  addMonthsClamped,
  compareDateOnly,
  dayOfMonth,
  parseDateOnly,
} from './date-only';
import { hashConfiguration } from './hash';
import type {
  BusinessCalendarSnapshot,
  CompanyField,
  CompanyRuleSource,
  DateOperation,
  DateOnly,
  DateSource,
  MilestoneDefinition,
  RuleRecurrenceDefinition,
  ScheduleEntry,
  ScheduleEntryExpression,
} from './types';

/** A date expression accepts the four schedule primitives plus every Task 2 operation. */
export type RuleDateExpression = ScheduleEntryExpression | DateOperation;

/** MilestoneDefinition widened for the evaluator's date-operation contract. */
export type EvaluatorMilestoneDefinition = Omit<MilestoneDefinition, 'expression'> & {
  expression: RuleDateExpression;
};

export type DeadlineRuleEvaluationInput = {
  ruleId: string;
  ruleVersionId: string;
  recurrence: RuleRecurrenceDefinition;
  applicability: ApplicabilityInput;
  parameters: Record<string, unknown>;
  scheduleEntries: ScheduleEntry[];
  milestones: EvaluatorMilestoneDefinition[];
  company: CompanyRuleSource;
  period: { key: string; start: DateOnly; end: DateOnly };
  calendar: BusinessCalendarSnapshot;
};

export type EvaluatedDeadline = {
  milestoneKey: string;
  scheduleEntryKey: string;
  type: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
  calculatedDueDate: DateOnly;
  explanation: string[];
};

export type DeadlineRuleEvaluationResult = {
  applicability: ApplicabilityResult;
  occurrences: EvaluatedDeadline[];
  byKey: Record<string, EvaluatedDeadline>;
  sourceSnapshot: Record<string, unknown>;
  evaluationHash: string;
};

type NodeKind = 'SCHEDULE_ENTRY' | 'MILESTONE';
type EvaluationNode = {
  id: string;
  kind: NodeKind;
  key: string;
  order: number;
  milestone?: EvaluatorMilestoneDefinition;
};

type DateResolution = {
  date: DateOnly;
  explanation: string[];
};

type EvaluationContext = {
  nodeId: string;
  scheduleEntryKey: string;
};

type SourceTracker = {
  company: Set<CompanyField>;
  parameters: Set<string>;
  scheduleEntries: Set<string>;
  milestones: Set<string>;
  provenance: Array<{ source: string; value: string | null }>;
};

const DATE_SOURCE_FIELDS = new Set([
  'financialYearEnd',
  'nextAgmDueDate',
  'nextArDueDate',
  'accountsDueDate',
  'incorporationDate',
]);
const DATE_OPERATIONS = new Set([
  'RELATIVE_TO_SOURCE',
  'ADD',
  'ADD_CALENDAR_DAYS',
  'ADD_BUSINESS_DAYS',
  'ADD_MONTHS',
  'ADJUST_BUSINESS_DAY',
]);
const SCHEDULE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const REFERENCE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
const EXPRESSION_KINDS = new Set([
  'DAY_OF_MONTH',
  'BUSINESS_DAY_FROM_START',
  'BUSINESS_DAY_FROM_END',
  ...DATE_OPERATIONS,
]);
const OWN = Object.prototype.hasOwnProperty;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`, { name, value });
  }
  return value;
}

function safeInteger(value: unknown, name: string, min?: number, max?: number): number {
  if (!Number.isSafeInteger(value)) throw new ValidationError(`${name} must be a safe integer`, { name, value });
  if (min !== undefined && (value as number) < min) throw new ValidationError(`${name} is below the allowed minimum`, { name, value, min });
  if (max !== undefined && (value as number) > max) throw new ValidationError(`${name} is above the allowed maximum`, { name, value, max });
  return value as number;
}

function missingInput(message: string, details?: unknown): DeadlineApiError {
  return new DeadlineApiError(ErrorCodes.MISSING_RULE_INPUT, message, 422, details);
}

function duplicateSchedule(message: string, details?: unknown): DeadlineApiError {
  return new DeadlineApiError(ErrorCodes.DUPLICATE_SCHEDULE_ENTRY, message, 422, details);
}

function assertDatePeriod(period: DeadlineRuleEvaluationInput['period']): void {
  if (!isRecord(period)) throw new ValidationError('Evaluation period must be an object');
  requiredString(period.key, 'period.key');
  parseDateOnly(period.start);
  parseDateOnly(period.end);
  if (compareDateOnly(period.start, period.end) > 0) {
    throw new ValidationError('Evaluation period start must be on or before period end', { period });
  }
}

function validateRecurrence(recurrence: RuleRecurrenceDefinition): void {
  if (!isRecord(recurrence) || recurrence.schemaVersion !== 1 || typeof recurrence.kind !== 'string') {
    throw new ValidationError('A version-1 recurrence definition is required');
  }
  if (recurrence.kind === 'ONE_TIME') return;
  if (recurrence.kind === 'CUSTOM') {
    safeInteger(recurrence.interval, 'recurrence.interval', 1, 120);
    if (recurrence.unit !== 'MONTH') throw new ValidationError('Custom recurrence unit must be MONTH');
    return;
  }
  if (!['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY'].includes(recurrence.kind)) {
    throw new ValidationError(`Unsupported recurrence kind ${recurrence.kind}`);
  }
  if (recurrence.interval !== undefined) safeInteger(recurrence.interval, 'recurrence.interval', 1, 120);
}

function validateCalendar(calendar: BusinessCalendarSnapshot, start: DateOnly): void {
  // The Task 2 function is the canonical calendar validator. Calling it once
  // here keeps malformed typed objects from being accepted when no date
  // expression happens to use a business-day operation.
  isBusinessDay(start, calendar);
}

function assertDateSource(source: unknown, path: string): DateSource {
  if (!isRecord(source) || typeof source.kind !== 'string') {
    throw new ValidationError(`${path} must be a supported date source`, { path, source });
  }
  switch (source.kind) {
    case 'COMPANY_FIELD':
      if (typeof source.field !== 'string' || !DATE_SOURCE_FIELDS.has(source.field)) {
        throw new ValidationError(`${path}.field is not a supported Company date field`, { path, source });
      }
      if (Object.keys(source).some((key) => key !== 'kind' && key !== 'field')) {
        throw new ValidationError(`${path} contains unknown fields`, { path, source });
      }
      return {
        kind: 'COMPANY_FIELD',
        field: source.field as Extract<DateSource, { kind: 'COMPANY_FIELD' }>['field'],
      };
    case 'CYCLE_START':
    case 'CYCLE_END':
      if (Object.keys(source).some((key) => key !== 'kind')) throw new ValidationError(`${path} contains unknown fields`, { path });
      return { kind: source.kind };
    case 'PARAMETER':
    case 'SCHEDULE_ENTRY':
    case 'MILESTONE':
      {
        const key = requiredString(source.key, `${path}.key`);
        if (!REFERENCE_KEY_PATTERN.test(key)) {
          throw new ValidationError(`${path}.key is malformed`, { path, source });
        }
        if (source.kind === 'SCHEDULE_ENTRY' && !SCHEDULE_KEY_PATTERN.test(key)) {
          throw new ValidationError(`${path}.key is not a valid schedule entry key`, { path, source });
        }
        if (Object.keys(source).some((property) => property !== 'kind' && property !== 'key')) {
          throw new ValidationError(`${path} contains unknown fields`, { path, source });
        }
        return { kind: source.kind, key } as DateSource;
      }
    default:
      throw new ValidationError(`${path} uses unsupported source type ${source.kind}`, { path, source });
  }
}

function assertAdjustment(value: unknown, path: string): 'NONE' | 'PREVIOUS' | 'NEXT' {
  if (value !== 'NONE' && value !== 'PREVIOUS' && value !== 'NEXT') {
    throw new ValidationError(`${path} must be NONE, PREVIOUS, or NEXT`, { path, value });
  }
  return value;
}

function assertExpression(expression: unknown, path: string, allowOperations = true): RuleDateExpression {
  if (!isRecord(expression) || typeof expression.kind !== 'string' || !EXPRESSION_KINDS.has(expression.kind)) {
    throw new ValidationError(`${path} uses an unsupported date expression`, { path, expression });
  }
  if (!allowOperations && ['ADD', 'ADD_CALENDAR_DAYS', 'ADD_BUSINESS_DAYS', 'ADD_MONTHS', 'ADJUST_BUSINESS_DAY'].includes(expression.kind)) {
    throw new ValidationError(`${path} uses an operation that is not valid for a schedule entry`, { path, expression });
  }
  switch (expression.kind) {
    case 'DAY_OF_MONTH':
      if (Object.keys(expression).some((key) => key !== 'kind' && key !== 'day')) throw new ValidationError(`${path} contains unknown fields`, { path });
      safeInteger(expression.day, `${path}.day`, 1, 31);
      return expression as unknown as RuleDateExpression;
    case 'BUSINESS_DAY_FROM_START':
    case 'BUSINESS_DAY_FROM_END':
      if (Object.keys(expression).some((key) => key !== 'kind' && key !== 'ordinal')) throw new ValidationError(`${path} contains unknown fields`, { path });
      safeInteger(expression.ordinal, `${path}.ordinal`, 1, 31);
      return expression as unknown as RuleDateExpression;
    case 'RELATIVE_TO_SOURCE':
      if (Object.keys(expression).some((key) => !['kind', 'source', 'offset', 'unit'].includes(key))) throw new ValidationError(`${path} contains unknown fields`, { path });
      assertDateSource(expression.source, `${path}.source`);
      safeInteger(expression.offset, `${path}.offset`, -3660, 3660);
      if (expression.unit !== 'CALENDAR_DAY' && expression.unit !== 'BUSINESS_DAY') {
        throw new ValidationError(`${path}.unit must be CALENDAR_DAY or BUSINESS_DAY`);
      }
      return expression as unknown as RuleDateExpression;
    case 'ADD':
      if (Object.keys(expression).some((key) => !['kind', 'source', 'offset', 'unit'].includes(key))) throw new ValidationError(`${path} contains unknown fields`, { path });
      if (expression.source !== undefined) assertDateSource(expression.source, `${path}.source`);
      safeInteger(expression.offset, `${path}.offset`, -3660, 3660);
      if (expression.unit !== 'CALENDAR_DAY' && expression.unit !== 'BUSINESS_DAY') {
        throw new ValidationError(`${path}.unit must be CALENDAR_DAY or BUSINESS_DAY`);
      }
      return expression as unknown as RuleDateExpression;
    case 'ADD_CALENDAR_DAYS':
    case 'ADD_BUSINESS_DAYS':
      if (Object.keys(expression).some((key) => key !== 'kind' && key !== 'amount')) throw new ValidationError(`${path} contains unknown fields`, { path });
      safeInteger(expression.amount, `${path}.amount`, -3660, 3660);
      return expression as unknown as RuleDateExpression;
    case 'ADD_MONTHS':
      if (Object.keys(expression).some((key) => key !== 'kind' && key !== 'amount')) throw new ValidationError(`${path} contains unknown fields`, { path });
      safeInteger(expression.amount, `${path}.amount`, -3660, 3660);
      return expression as unknown as RuleDateExpression;
    case 'ADJUST_BUSINESS_DAY':
      if (Object.keys(expression).some((key) => key !== 'kind' && key !== 'adjustment')) throw new ValidationError(`${path} contains unknown fields`, { path });
      assertAdjustment(expression.adjustment, `${path}.adjustment`);
      return expression as unknown as RuleDateExpression;
    default:
      throw new ValidationError(`${path} uses an unsupported date expression`, { path, expression });
  }
}

function validateScheduleEntries(entries: ScheduleEntry[]): Map<string, ScheduleEntry> {
  if (!Array.isArray(entries)) throw new ValidationError('scheduleEntries must be an array');
  if (entries.length > 31) {
    throw new DeadlineApiError(ErrorCodes.SCHEDULE_LIMIT_EXCEEDED, 'A schedule can contain at most 31 entries', 422, { count: entries.length });
  }
  const byKey = new Map<string, ScheduleEntry>();
  entries.forEach((entry, index) => {
    if (!isRecord(entry)) throw new ValidationError(`scheduleEntries[${index}] must be an object`);
    const key = requiredString(entry.key, `scheduleEntries[${index}].key`);
    if (!SCHEDULE_KEY_PATTERN.test(key)) {
      throw new ValidationError(`scheduleEntries[${index}].key is malformed`, { key });
    }
    if (byKey.has(key)) throw duplicateSchedule(`Duplicate schedule entry key ${key}`, { key });
    requiredString(entry.label, `scheduleEntries[${index}].label`);
    assertExpression(entry.expression, `scheduleEntries[${index}].expression`, false);
    assertAdjustment(entry.businessDayAdjustment, `scheduleEntries[${index}].businessDayAdjustment`);
    byKey.set(key, entry);
  });
  return byKey;
}

function validateMilestones(milestones: EvaluatorMilestoneDefinition[]): Map<string, EvaluatorMilestoneDefinition> {
  if (!Array.isArray(milestones)) throw new ValidationError('milestones must be an array');
  const byKey = new Map<string, EvaluatorMilestoneDefinition>();
  milestones.forEach((milestone, index) => {
    if (!isRecord(milestone)) throw new ValidationError(`milestones[${index}] must be an object`);
    const key = requiredString(milestone.key, `milestones[${index}].key`);
    if (!REFERENCE_KEY_PATTERN.test(key)) {
      throw new ValidationError(`milestones[${index}].key is malformed`, { key });
    }
    if (byKey.has(key)) throw new ValidationError(`Duplicate milestone key ${key}`, { key });
    requiredString(milestone.name, `milestones[${index}].name`);
    if (!['STATUTORY', 'CLIENT', 'INTERNAL'].includes(milestone.type)) {
      throw new ValidationError(`milestones[${index}].type is unsupported`);
    }
    if (milestone.generationMode !== 'ONCE_PER_CYCLE' && milestone.generationMode !== 'ONCE_PER_SCHEDULE_ENTRY') {
      throw new ValidationError(`milestones[${index}].generationMode is unsupported`);
    }
    if (typeof milestone.isActive !== 'boolean') throw new ValidationError(`milestones[${index}].isActive must be boolean`);
    safeInteger(milestone.displayOrder, `milestones[${index}].displayOrder`, 0);
    assertExpression(milestone.expression, `milestones[${index}].expression`);
    assertAdjustment(milestone.businessDayAdjustment, `milestones[${index}].businessDayAdjustment`);
    byKey.set(key, milestone);
  });
  return byKey;
}

function sourceFromExpression(expression: RuleDateExpression): DateSource | null {
  if (expression.kind === 'RELATIVE_TO_SOURCE') return expression.source;
  if (expression.kind === 'ADD' && expression.source) return expression.source;
  return null;
}

function sourceDependencyId(source: DateSource, current: EvaluationNode, scheduleEntries: Map<string, ScheduleEntry>, milestones: Map<string, EvaluatorMilestoneDefinition>): string | null {
  if (source.kind === 'SCHEDULE_ENTRY') {
    if (!scheduleEntries.has(source.key)) throw missingInput(`Schedule entry source ${source.key} is missing`, { source });
    if (current.kind === 'SCHEDULE_ENTRY' && current.key === source.key) {
      throw new ValidationError(`Schedule entry ${current.key} has a self dependency`, { source });
    }
    return `schedule:${source.key}`;
  }
  if (source.kind === 'MILESTONE') {
    const target = milestones.get(source.key);
    if (!target) throw missingInput(`Milestone source ${source.key} is missing`, { source });
    if (current.kind === 'MILESTONE' && current.key === source.key) {
      throw new ValidationError(`Milestone ${current.key} has a self dependency`, { source });
    }
    if (target.generationMode === 'ONCE_PER_SCHEDULE_ENTRY' && current.kind === 'SCHEDULE_ENTRY') {
      throw new ValidationError(`Schedule entry ${current.key} has an ambiguous per-entry milestone source ${source.key}`);
    }
    if (target.generationMode === 'ONCE_PER_SCHEDULE_ENTRY' && current.kind === 'MILESTONE'
      && current.milestone?.generationMode !== 'ONCE_PER_SCHEDULE_ENTRY') {
      throw new ValidationError(`Cycle milestone ${current.key} has an ambiguous per-entry milestone source ${source.key}`);
    }
    return `milestone:${source.key}`;
  }
  return null;
}

function buildEvaluationGraph(
  scheduleEntries: Map<string, ScheduleEntry>,
  milestones: Map<string, EvaluatorMilestoneDefinition>,
): { nodes: EvaluationNode[]; dependencies: Map<string, string[]> } {
  const nodes: EvaluationNode[] = [];
  let order = 0;
  for (const [key] of scheduleEntries) nodes.push({ id: `schedule:${key}`, kind: 'SCHEDULE_ENTRY', key, order: order += 1 });
  for (const [key, milestone] of milestones) nodes.push({ id: `milestone:${key}`, kind: 'MILESTONE', key, milestone, order: order += 1 });

  const dependencies = new Map<string, string[]>();
  for (const node of nodes) {
    const definition = node.kind === 'SCHEDULE_ENTRY' ? scheduleEntries.get(node.key)! : node.milestone!;
    const expression = assertExpression(definition.expression, `${node.id}.expression`, node.kind !== 'SCHEDULE_ENTRY');
    const source = sourceFromExpression(expression);
    const dependency = source ? sourceDependencyId(source, node, scheduleEntries, milestones) : null;
    dependencies.set(node.id, dependency ? [dependency] : []);
  }

  const colors = new Map<string, 'WHITE' | 'GRAY' | 'BLACK'>();
  const path: string[] = [];
  const sortedNodes = [...nodes].sort((left, right) => left.order - right.order);
  const topological: EvaluationNode[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visit = (node: EvaluationNode): void => {
    const color = colors.get(node.id) ?? 'WHITE';
    if (color === 'BLACK') return;
    if (color === 'GRAY') {
      const start = path.indexOf(node.id);
      const cycle = [...path.slice(start), node.id].join(' -> ');
      throw new ValidationError(`Circular schedule dependency: ${cycle}`);
    }
    colors.set(node.id, 'GRAY');
    path.push(node.id);
    for (const dependencyId of dependencies.get(node.id) ?? []) visit(byId.get(dependencyId)!);
    path.pop();
    colors.set(node.id, 'BLACK');
    topological.push(node);
  };
  for (const node of sortedNodes) visit(node);
  return { nodes: topological, dependencies };
}

function hasCompanyValue(company: CompanyRuleSource, field: CompanyField): boolean {
  return OWN.call(company, field) && company[field] !== undefined && company[field] !== null;
}

function sourceName(source: DateSource): string {
  switch (source.kind) {
    case 'COMPANY_FIELD': return `Company.${source.field}`;
    case 'CYCLE_START': return 'Cycle.start';
    case 'CYCLE_END': return 'Cycle.end';
    case 'PARAMETER': return `Parameter.${source.key}`;
    case 'SCHEDULE_ENTRY': return `ScheduleEntry.${source.key}`;
    case 'MILESTONE': return `Milestone.${source.key}`;
  }
}

function markProvenance(tracker: SourceTracker, source: string, value: string | null): void {
  if (!tracker.provenance.some((item) => item.source === source && item.value === value)) {
    tracker.provenance.push({ source, value });
  }
}

function resolveSource(
  source: DateSource,
  context: EvaluationContext,
  input: DeadlineRuleEvaluationInput,
  scheduleDates: Map<string, DateResolution>,
  milestoneDates: Map<string, Map<string, DateResolution>>,
  tracker: SourceTracker,
): DateResolution {
  switch (source.kind) {
    case 'COMPANY_FIELD': {
      tracker.company.add(source.field as CompanyField);
      const value = input.company[source.field];
      if (!hasCompanyValue(input.company, source.field)) {
        markProvenance(tracker, sourceName(source), null);
        throw missingInput(`${sourceName(source)} is required`, { source });
      }
      if (typeof value !== 'string') throw new ValidationError(`${sourceName(source)} must be a DateOnly string`, { source });
      parseDateOnly(value as DateOnly);
      markProvenance(tracker, sourceName(source), value);
      return { date: value as DateOnly, explanation: [`Source ${sourceName(source)} = ${value}`] };
    }
    case 'CYCLE_START':
      markProvenance(tracker, sourceName(source), input.period.start);
      return { date: input.period.start, explanation: [`Source ${sourceName(source)} = ${input.period.start}`] };
    case 'CYCLE_END':
      markProvenance(tracker, sourceName(source), input.period.end);
      return { date: input.period.end, explanation: [`Source ${sourceName(source)} = ${input.period.end}`] };
    case 'PARAMETER': {
      tracker.parameters.add(source.key);
      const value = input.parameters[source.key];
      if (value === undefined || value === null) {
        markProvenance(tracker, sourceName(source), null);
        throw missingInput(`${sourceName(source)} is required`, { source });
      }
      if (typeof value !== 'string') throw new ValidationError(`${sourceName(source)} must be a DateOnly string`, { source });
      parseDateOnly(value as DateOnly);
      markProvenance(tracker, sourceName(source), value);
      return { date: value as DateOnly, explanation: [`Source ${sourceName(source)} = ${value}`] };
    }
    case 'SCHEDULE_ENTRY': {
      tracker.scheduleEntries.add(source.key);
      const resolution = scheduleDates.get(source.key);
      if (!resolution) {
        markProvenance(tracker, sourceName(source), null);
        throw missingInput(`${sourceName(source)} is required`, { source });
      }
      markProvenance(tracker, sourceName(source), resolution.date);
      return {
        date: resolution.date,
        explanation: [`Source ${sourceName(source)} = ${resolution.date}`, ...resolution.explanation],
      };
    }
    case 'MILESTONE': {
      tracker.milestones.add(source.key);
      const values = milestoneDates.get(source.key);
      if (!values) {
        markProvenance(tracker, sourceName(source), null);
        throw missingInput(`${sourceName(source)} is required`, { source });
      }
      const resolution = values.get(context.scheduleEntryKey) ?? values.get('');
      if (!resolution) {
        markProvenance(tracker, sourceName(source), null);
        throw missingInput(`${sourceName(source)} has no value for schedule entry ${context.scheduleEntryKey || '(cycle)'}`, { source });
      }
      markProvenance(tracker, sourceName(source), resolution.date);
      return {
        date: resolution.date,
        explanation: [`Source ${sourceName(source)} = ${resolution.date}`, ...resolution.explanation],
      };
    }
    default:
      throw new ValidationError(`Unsupported date source ${(source as { kind: string }).kind}`);
  }
}

function applyOffset(
  resolution: DateResolution,
  amount: number,
  unit: 'CALENDAR_DAY' | 'BUSINESS_DAY',
  calendar: BusinessCalendarSnapshot,
): DateResolution {
  if (unit === 'CALENDAR_DAY') {
    return {
      date: addCalendarDays(resolution.date, amount),
      explanation: [...resolution.explanation, `Applied ${amount} calendar day${Math.abs(amount) === 1 ? '' : 's'}`],
    };
  }
  return {
    date: addBusinessDays(resolution.date, amount, calendar),
    explanation: [...resolution.explanation, `Applied ${amount} business day${Math.abs(amount) === 1 ? '' : 's'}`],
  };
}

function evaluateExpression(
  expression: RuleDateExpression,
  context: EvaluationContext,
  input: DeadlineRuleEvaluationInput,
  scheduleDates: Map<string, DateResolution>,
  milestoneDates: Map<string, Map<string, DateResolution>>,
  tracker: SourceTracker,
): DateResolution {
  switch (expression.kind) {
    case 'DAY_OF_MONTH': {
      const date = dayOfMonth(input.period.start, expression.day);
      return { date, explanation: [`Period month ${input.period.start.slice(0, 7)} day ${expression.day} = ${date}`] };
    }
    case 'BUSINESS_DAY_FROM_START': {
      const date = businessDayFromStart(input.period.start, input.period.end, expression.ordinal, input.calendar);
      return { date, explanation: [`Business day ${expression.ordinal} from period start = ${date}`] };
    }
    case 'BUSINESS_DAY_FROM_END': {
      const date = businessDayFromEnd(input.period.start, input.period.end, expression.ordinal, input.calendar);
      return { date, explanation: [`Business day ${expression.ordinal} from period end = ${date}`] };
    }
    case 'RELATIVE_TO_SOURCE': {
      const source = assertDateSource(expression.source, 'expression.source');
      return applyOffset(
        resolveSource(source, context, input, scheduleDates, milestoneDates, tracker),
        expression.offset,
        expression.unit,
        input.calendar,
      );
    }
    case 'ADD': {
      const base = expression.source
        ? resolveSource(assertDateSource(expression.source, 'expression.source'), context, input, scheduleDates, milestoneDates, tracker)
        : { date: input.period.start, explanation: [`Default source Cycle.start = ${input.period.start}`] };
      return applyOffset(base, expression.offset, expression.unit, input.calendar);
    }
    case 'ADD_CALENDAR_DAYS':
      return {
        date: addCalendarDays(input.period.start, expression.amount),
        explanation: [`Default source Cycle.start = ${input.period.start}`, `Applied ${expression.amount} calendar day${Math.abs(expression.amount) === 1 ? '' : 's'}`],
      };
    case 'ADD_BUSINESS_DAYS':
      return {
        date: addBusinessDays(input.period.start, expression.amount, input.calendar),
        explanation: [`Default source Cycle.start = ${input.period.start}`, `Applied ${expression.amount} business day${Math.abs(expression.amount) === 1 ? '' : 's'}`],
      };
    case 'ADD_MONTHS':
      return {
        date: addMonthsClamped(input.period.start, expression.amount),
        explanation: [`Default source Cycle.start = ${input.period.start}`, `Applied ${expression.amount} month${Math.abs(expression.amount) === 1 ? '' : 's'}`],
      };
    case 'ADJUST_BUSINESS_DAY':
      return {
        date: adjustBusinessDay(input.period.start, expression.adjustment, input.calendar),
        explanation: [`Default source Cycle.start = ${input.period.start}`, `Applied ${expression.adjustment} business-day adjustment`],
      };
    default:
      throw new ValidationError(`Unsupported date expression ${(expression as { kind: string }).kind}`);
  }
}

function withFinalAdjustment(
  resolution: DateResolution,
  adjustment: 'NONE' | 'PREVIOUS' | 'NEXT',
  calendar: BusinessCalendarSnapshot,
): DateResolution {
  if (adjustment === 'NONE') return resolution;
  const adjusted = adjustBusinessDay(resolution.date, adjustment, calendar);
  return {
    date: adjusted,
    explanation: [...resolution.explanation, `Applied final ${adjustment} business-day adjustment to ${resolution.date} = ${adjusted}`],
  };
}

function jsonSafe(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValidationError(`${path} contains a non-finite number`);
    return value;
  }
  if (typeof value === 'undefined') return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set) return [...value].map((item) => jsonSafe(item, path)).sort((left, right) => String(left).localeCompare(String(right)));
  if (value instanceof Map) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of [...value.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))) {
      result[String(key)] = jsonSafe(entry, `${path}.${String(key)}`);
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((item, index) => jsonSafe(item, `${path}[${index}]`));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = jsonSafe(value[key], `${path}.${key}`);
    return result;
  }
  throw new ValidationError(`${path} contains a non-JSON value`);
}

function buildSnapshot(
  input: DeadlineRuleEvaluationInput,
  applicability: ApplicabilityResult,
  tracker: SourceTracker,
): Record<string, unknown> {
  const company: Record<string, unknown> = {};
  for (const field of [...tracker.company].sort()) {
    if (hasCompanyValue(input.company, field)) company[field] = jsonSafe(input.company[field], `company.${field}`);
  }
  const parameters: Record<string, unknown> = {};
  for (const key of [...tracker.parameters].sort()) {
    if (input.parameters[key] !== undefined) parameters[key] = jsonSafe(input.parameters[key], `parameters.${key}`);
  }
  const calendar = {
    id: input.calendar.id,
    timeZone: input.calendar.timeZone,
    revision: input.calendar.revision,
    weekendDays: [...input.calendar.weekendDays].sort((left, right) => left - right),
    holidays: [...input.calendar.holidays].sort(),
  };
  return jsonSafe({
    ruleId: input.ruleId,
    ruleVersionId: input.ruleVersionId,
    recurrence: input.recurrence,
    applicability: {
      definition: input.applicability,
      result: applicability,
    },
    period: input.period,
    company,
    parameters,
    scheduleEntries: input.scheduleEntries,
    milestones: input.milestones,
    calendar,
    provenance: tracker.provenance,
  }, 'sourceSnapshot') as Record<string, unknown>;
}

function resultWithNoOccurrences(
  input: DeadlineRuleEvaluationInput,
  applicability: ApplicabilityResult,
): DeadlineRuleEvaluationResult {
  const tracker: SourceTracker = {
    company: new Set(collectApplicabilityFields(input.applicability)),
    parameters: new Set(),
    scheduleEntries: new Set(),
    milestones: new Set(),
    provenance: [],
  };
  for (const field of tracker.company) {
    markProvenance(tracker, `Company.${field}`, hasCompanyValue(input.company, field) ? String(input.company[field]) : null);
  }
  const sourceSnapshot = buildSnapshot(input, applicability, tracker);
  return {
    applicability,
    occurrences: [],
    byKey: {},
    sourceSnapshot,
    evaluationHash: hashConfiguration(sourceSnapshot),
  };
}

/**
 * Evaluate one validated rule version for one period. The evaluator is pure:
 * all persistence, reconciliation, and materialisation happen in later
 * services and receive this serializable result.
 */
export function evaluateDeadlineRule(input: DeadlineRuleEvaluationInput): DeadlineRuleEvaluationResult {
  if (!isRecord(input)) throw new ValidationError('Deadline rule evaluation input must be an object');
  requiredString(input.ruleId, 'ruleId');
  requiredString(input.ruleVersionId, 'ruleVersionId');
  validateRecurrence(input.recurrence);
  assertDatePeriod(input.period);
  if (!isRecord(input.company)) throw new ValidationError('company must be an object');
  if (!isRecord(input.parameters)) throw new ValidationError('parameters must be an object');
  validateCalendar(input.calendar, input.period.start);

  const applicability = evaluateApplicability(input.applicability, input.company);
  if (applicability.state !== 'APPLICABLE') return resultWithNoOccurrences(input, applicability);

  const scheduleEntries = validateScheduleEntries(input.scheduleEntries);
  const milestones = validateMilestones(input.milestones);
  const graph = buildEvaluationGraph(scheduleEntries, milestones);
  const scheduleDates = new Map<string, DateResolution>();
  const milestoneDates = new Map<string, Map<string, DateResolution>>();
  const tracker: SourceTracker = {
    company: new Set(collectApplicabilityFields(input.applicability)),
    parameters: new Set(),
    scheduleEntries: new Set(),
    milestones: new Set(),
    provenance: [],
  };

  for (const node of graph.nodes) {
    if (node.kind === 'SCHEDULE_ENTRY') {
      const definition = scheduleEntries.get(node.key)!;
      const raw = evaluateExpression(
        assertExpression(definition.expression, `${node.id}.expression`),
        { nodeId: node.id, scheduleEntryKey: node.key },
        input,
        scheduleDates,
        milestoneDates,
        tracker,
      );
      const resolved = withFinalAdjustment(raw, definition.businessDayAdjustment, input.calendar);
      scheduleDates.set(node.key, resolved);
      tracker.scheduleEntries.add(node.key);
      markProvenance(tracker, `ScheduleEntry.${node.key}`, resolved.date);
    } else {
      const definition = node.milestone!;
      const keys = definition.generationMode === 'ONCE_PER_SCHEDULE_ENTRY'
        ? [...scheduleEntries.keys()]
        : [''];
      const values = new Map<string, DateResolution>();
      for (const scheduleEntryKey of keys) {
        const raw = evaluateExpression(
          assertExpression(definition.expression, `${node.id}.expression`),
          { nodeId: node.id, scheduleEntryKey },
          input,
          scheduleDates,
          milestoneDates,
          tracker,
        );
        values.set(scheduleEntryKey, withFinalAdjustment(raw, definition.businessDayAdjustment, input.calendar));
      }
      milestoneDates.set(node.key, values);
    }
  }

  const orderedMilestones = [...input.milestones]
    .map((definition, index) => ({ definition, index }))
    .filter(({ definition }) => definition.isActive)
    .sort((left, right) => left.definition.displayOrder - right.definition.displayOrder || left.index - right.index);
  const occurrences: EvaluatedDeadline[] = [];
  const byKey: Record<string, EvaluatedDeadline> = {};
  for (const { definition } of orderedMilestones) {
    const scheduleKeys = definition.generationMode === 'ONCE_PER_SCHEDULE_ENTRY' ? [...scheduleEntries.keys()] : [''];
    const values = milestoneDates.get(definition.key);
    if (!values) throw missingInput(`Milestone ${definition.key} did not produce a value`, { milestoneKey: definition.key });
    for (const scheduleEntryKey of scheduleKeys) {
      const resolution = values.get(scheduleEntryKey);
      if (!resolution) throw missingInput(`Milestone ${definition.key} has no value for schedule entry ${scheduleEntryKey}`, { milestoneKey: definition.key, scheduleEntryKey });
      const key = `${definition.key}:${scheduleEntryKey}`;
      if (byKey[key]) throw new ValidationError(`Duplicate occurrence key ${key}`, { key });
      const occurrence: EvaluatedDeadline = {
        milestoneKey: definition.key,
        scheduleEntryKey,
        type: definition.type,
        calculatedDueDate: resolution.date,
        explanation: [...resolution.explanation],
      };
      occurrences.push(occurrence);
      byKey[key] = occurrence;
    }
  }

  const finalApplicability: ApplicabilityResult = { state: 'APPLICABLE', reason: null };
  const sourceSnapshot = buildSnapshot(input, finalApplicability, tracker);
  return {
    applicability: finalApplicability,
    occurrences,
    byKey,
    sourceSnapshot,
    evaluationHash: hashConfiguration(sourceSnapshot),
  };
}
