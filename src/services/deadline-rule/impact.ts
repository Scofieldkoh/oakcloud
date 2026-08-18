import { z } from 'zod';
import { createAuditLog } from '@/lib/audit';
import {
  DeadlineApiError,
  ErrorCodes,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import type { TenantAwareParams } from '@/lib/types';
import { evaluateDeadlineRule, type DeadlineRuleEvaluationInput } from '@/services/service-schedule/evaluator';
import {
  currentDateInSingapore,
  formatDateOnly,
  parseDateOnly,
} from '@/services/service-schedule/date-only';
import { hashConfiguration } from '@/services/service-schedule/hash';
import type {
  BusinessCalendarSnapshot,
  CompanyRuleSource,
  DateOnly,
  EvaluatedDeadline,
} from '@/services/service-schedule';
import { enqueueScheduleReconciliation } from '@/services/schedule-reconciliation';
import type { DeadlineRuleDto } from './types';

const MAX_IMPACT_SAMPLES = 100;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

const identityFieldsSchema = z.object({
  expectedCurrentVersion: z.number().int().min(0).nullable(),
  expectedDraftRevision: z.number().int().min(1),
  draftConfigHash: z.string().regex(HASH_PATTERN),
}).strict();

// Route schemas require a canonical SHA-256 preview fingerprint. Service
// apply paths intentionally accept any non-empty fingerprint so an old or
// malformed client value still reaches the fresh-impact comparison and is
// reported as IMPACT_CHANGED rather than hiding the useful 409 summary.
const serviceApplyIdentitySchema = identityFieldsSchema.extend({
  previewFingerprint: z.string().trim().min(1),
}).strict();
const serviceArchiveInputSchema = serviceApplyIdentitySchema.extend({
  reason: z.string().trim().min(1).max(1000),
}).strict();

export const deadlineRuleImpactPreviewSchema = identityFieldsSchema;
export const deadlineRulePublishSchema = identityFieldsSchema.extend({
  previewFingerprint: z.string().regex(HASH_PATTERN),
}).strict();
export const deadlineRuleArchiveSchema = deadlineRulePublishSchema.extend({
  reason: z.string().trim().min(1).max(1000),
}).strict();

export type DeadlineRuleImpactInput = z.input<typeof deadlineRuleImpactPreviewSchema>;
export type DeadlineRulePublishInput = z.input<typeof deadlineRulePublishSchema>;
export type DeadlineRuleArchiveInput = z.input<typeof deadlineRuleArchiveSchema>;

export type DeadlineRuleImpactAction = 'CREATE' | 'RECALCULATE' | 'CANCEL' | 'PRESERVE' | 'WARN';

export type DeadlineRuleImpactSample = {
  clientServiceId: string;
  deadlineOccurrenceId: string | null;
  action: DeadlineRuleImpactAction;
  oldDate: DateOnly | null;
  newDate: DateOnly | null;
  reason: string;
};

export type DeadlineRuleImpactCounts = {
  created: number;
  recalculated: number;
  cancelled: number;
  preserved: number;
  inapplicable: number;
  missingInput: number;
  conflicts: number;
  warnings: number;
};

export type DeadlineRuleImpact = {
  ruleId: string;
  currentPublishedVersion: number | null;
  draftRevision: number;
  draftConfigHash: string;
  previewFingerprint: string;
  counts: DeadlineRuleImpactCounts;
  samples: DeadlineRuleImpactSample[];
};

export type DeadlineRuleImpactOptions = {
  /** Injectable Singapore civil date for deterministic tests and callers. */
  now?: () => DateOnly;
};

type QueryDelegate = {
  findFirst?: (args: unknown) => Promise<unknown>;
  findMany?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
};

type RawVersion = {
  id: string;
  ruleId?: string;
  version: number;
  state: string;
  schemaVersion?: number;
  recurrence?: unknown;
  applicability?: unknown;
  configHash: string;
  draftRevision: number;
  parameterDefinitions?: Array<Record<string, unknown>>;
  milestoneTemplates?: Array<Record<string, unknown>>;
};

type RawRule = {
  id: string;
  tenantId: string;
  code?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  archivedAt?: Date | null;
  archivedById?: string | null;
  archiveReason?: string | null;
  currentVersionId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  currentVersion?: RawVersion | null;
  draft?: RawVersion | null;
  versions?: RawVersion[];
  variantAssociations?: Array<Record<string, unknown>>;
};

type RawCycle = {
  id: string;
  tenantId: string;
  clientServiceId: string;
  ruleId: string;
  ruleVersionId?: string;
  companyId?: string;
  periodKey: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  origin?: string;
  businessCalendarId?: string | null;
  businessCalendarRevision?: number | null;
};

type RawOccurrence = {
  id: string;
  tenantId: string;
  companyId?: string;
  clientServiceId?: string;
  cycleId: string;
  ruleVersionId?: string;
  milestoneKey: string;
  scheduleEntryKey?: string;
  calculatedDueDate: Date | string;
  operativeDueDate: Date | string;
  dateOverridden?: boolean;
  status?: string;
  origin?: string;
  cycle?: RawCycle | null;
};

type RawContext = {
  tenantId: string;
  clientServiceId: string;
  ruleId: string;
  enabled?: boolean;
  parameterValues?: unknown;
  scheduleEntries?: unknown;
  clientService?: {
    tenantId: string;
    companyId: string;
    deletedAt?: Date | null;
    company?: Record<string, unknown> | null;
  } | null;
};

type ImpactDecision = DeadlineRuleImpactSample & {
  identity: string;
};

type DeadlineRuleApplyIdentity = DeadlineRuleImpactInput & {
  previewFingerprint: string;
};

type ImpactDb = unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function delegate(db: ImpactDb, name: string): QueryDelegate | null {
  if (!isRecord(db)) return null;
  const value = db[name];
  if (!isRecord(value)) return null;
  const result: QueryDelegate = {};
  if (typeof value.findFirst === 'function') result.findFirst = value.findFirst.bind(value) as QueryDelegate['findFirst'];
  if (typeof value.findMany === 'function') result.findMany = value.findMany.bind(value) as QueryDelegate['findMany'];
  if (typeof value.update === 'function') result.update = value.update.bind(value) as QueryDelegate['update'];
  return result;
}

async function findFirst(db: ImpactDb, name: string, args: unknown): Promise<unknown> {
  const operation = delegate(db, name)?.findFirst;
  return operation ? operation(args) : null;
}

async function findMany(db: ImpactDb, name: string, args: unknown): Promise<unknown[]> {
  const operation = delegate(db, name)?.findMany;
  const result = operation ? await operation(args) : [];
  return Array.isArray(result) ? result : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asDateOnly(value: Date | string): DateOnly {
  if (typeof value === 'string') {
    parseDateOnly(value as DateOnly);
    return value as DateOnly;
  }
  return formatDateOnly(value);
}

function safeDateOnly(value: unknown): DateOnly | null {
  try {
    if (typeof value === 'string') return asDateOnly(value);
    if (value instanceof Date) return asDateOnly(value);
  } catch {
    return null;
  }
  return null;
}

function normalizeCompanySource(value: unknown): CompanyRuleSource {
  const source = asRecord(value);
  const result: Record<string, unknown> = {};
  const dateFields = new Set([
    'financialYearEnd',
    'nextAgmDueDate',
    'nextArDueDate',
    'accountsDueDate',
    'incorporationDate',
    'registrationDate',
  ]);
  const supported = new Set([
    'isGstRegistered',
    'isRegisteredCharity',
    'isIPC',
    'hasCharges',
    'currentOfficerCount',
    'currentShareholderCount',
    'annualReceiptsOrExpenditure',
    ...dateFields,
    'entityType',
    'status',
    'primarySsicCode',
    'secondarySsicCode',
    'uen',
    'name',
  ]);
  for (const [key, raw] of Object.entries(source)) {
    if (!supported.has(key) || raw === null || raw === undefined) continue;
    if (dateFields.has(key)) {
      const date = safeDateOnly(raw);
      if (date) result[key] = date;
    } else if (typeof raw === 'boolean' || typeof raw === 'number' || typeof raw === 'string') {
      result[key] = raw;
    }
  }
  return result as CompanyRuleSource;
}

function defaultCalendar(id = 'default'): BusinessCalendarSnapshot {
  return {
    id,
    timeZone: 'Asia/Singapore',
    revision: 1,
    weekendDays: new Set([0, 6]),
    holidays: new Set(),
  };
}

async function loadCalendar(
  db: ImpactDb,
  tenantId: string,
  calendarId: string | null | undefined,
  cache: Map<string, BusinessCalendarSnapshot>,
): Promise<BusinessCalendarSnapshot> {
  const key = calendarId ?? 'active';
  const cached = cache.get(key);
  if (cached) return cached;
  const record = await findFirst(db, 'businessCalendar', {
    where: calendarId
      ? { id: calendarId, tenantId }
      : { tenantId, isActive: true, archivedAt: null },
    include: {
      holidays: {
        where: { tenantId, ...(calendarId ? { calendarId } : {}), isActive: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!isRecord(record)) {
    const fallback = defaultCalendar(calendarId ?? undefined);
    cache.set(key, fallback);
    return fallback;
  }
  const holidays = Array.isArray(record.holidays)
    ? record.holidays.map((holiday) => safeDateOnly(isRecord(holiday) ? holiday.date : undefined)).filter((value): value is DateOnly => value !== null)
    : [];
  const snapshot: BusinessCalendarSnapshot = {
    id: asString(record.id, calendarId ?? 'default'),
    timeZone: asString(record.timeZone, 'Asia/Singapore'),
    revision: typeof record.revision === 'number' ? record.revision : 1,
    weekendDays: new Set(Array.isArray(record.weekendDays) ? record.weekendDays.filter((day): day is number => typeof day === 'number') : [0, 6]),
    holidays: new Set(holidays),
  };
  cache.set(key, snapshot);
  return snapshot;
}

function versionFromRule(rule: RawRule): { current: RawVersion | null; draft: RawVersion } {
  const versions = Array.isArray(rule.versions) ? rule.versions : [];
  const current = rule.currentVersion
    ?? versions.filter((version) => version.state === 'PUBLISHED').sort((left, right) => right.version - left.version)[0]
    ?? null;
  const draft = rule.draft
    ?? versions.find((version) => version.state === 'DRAFT');
  if (!draft) throw new ValidationError('Deadline rule has no mutable draft');
  return { current, draft };
}

function milestoneInput(version: RawVersion): DeadlineRuleEvaluationInput['milestones'] {
  return (version.milestoneTemplates ?? []).map((milestone, index) => ({
    key: asString(milestone.milestoneKey),
    name: asString(milestone.name),
    description: typeof milestone.description === 'string' ? milestone.description : null,
    type: asString(milestone.type, 'CLIENT') as 'STATUTORY' | 'CLIENT' | 'INTERNAL',
    generationMode: asString(milestone.generationMode, 'ONCE_PER_CYCLE') as 'ONCE_PER_CYCLE' | 'ONCE_PER_SCHEDULE_ENTRY',
    expression: milestone.dateExpression as never,
    businessDayAdjustment: asString(milestone.businessDayAdjustment, 'NONE') as 'NONE' | 'PREVIOUS' | 'NEXT',
    displayOrder: typeof milestone.displayOrder === 'number' ? milestone.displayOrder : index,
    isActive: milestone.isActive !== false,
  }));
}

async function evaluatorInputFor(
  rule: RawRule,
  version: RawVersion,
  cycle: RawCycle,
  context: RawContext,
  calendar: BusinessCalendarSnapshot,
): Promise<DeadlineRuleEvaluationInput | null> {
  if (!context.clientService || context.clientService.tenantId !== rule.tenantId) return null;
  const periodStart = safeDateOnly(cycle.periodStart);
  const periodEnd = safeDateOnly(cycle.periodEnd);
  if (!periodStart || !periodEnd) return null;
  return {
    ruleId: rule.id,
    ruleVersionId: version.id,
    recurrence: version.recurrence as DeadlineRuleEvaluationInput['recurrence'],
    applicability: version.applicability as DeadlineRuleEvaluationInput['applicability'],
    parameters: asRecord(context.parameterValues),
    scheduleEntries: Array.isArray(context.scheduleEntries) ? context.scheduleEntries as DeadlineRuleEvaluationInput['scheduleEntries'] : [],
    milestones: milestoneInput(version),
    company: normalizeCompanySource(context.clientService.company),
    period: { key: cycle.periodKey, start: periodStart, end: periodEnd },
    calendar,
  };
}

async function loadRuleScope(db: ImpactDb, ruleId: string, tenantId: string): Promise<{
  rule: RawRule;
  current: RawVersion | null;
  draft: RawVersion;
  contexts: RawContext[];
  cycles: RawCycle[];
  occurrences: RawOccurrence[];
}> {
  const rawRule = await findFirst(db, 'deadlineRule', {
    where: { id: ruleId, tenantId },
    include: {
      currentVersion: { include: { parameterDefinitions: true, milestoneTemplates: true } },
      versions: { include: { parameterDefinitions: true, milestoneTemplates: true }, orderBy: { version: 'desc' } },
    },
  });
  if (!isRecord(rawRule) || asString(rawRule.id) !== ruleId || asString(rawRule.tenantId) !== tenantId) {
    throw new NotFoundError('Deadline rule not found');
  }
  const rule = rawRule as unknown as RawRule;
  const { current, draft } = versionFromRule(rule);
  const [contexts, cycles, occurrences] = await Promise.all([
    findMany(db, 'clientServiceDeadlineRule', {
      where: {
        tenantId,
        ruleId,
        enabled: true,
        clientService: { tenantId, deletedAt: null },
      },
      include: {
        clientService: {
          include: {
            company: true,
          },
        },
      },
      orderBy: [{ clientServiceId: 'asc' }, { id: 'asc' }],
    }),
    findMany(db, 'serviceCycle', {
      where: { tenantId, ruleId },
      orderBy: [{ clientServiceId: 'asc' }, { periodStart: 'asc' }, { id: 'asc' }],
    }),
    findMany(db, 'deadlineOccurrence', {
      where: { tenantId, cycle: { tenantId, ruleId } },
      orderBy: [{ cycleId: 'asc' }, { milestoneKey: 'asc' }, { scheduleEntryKey: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return {
    rule,
    current,
    draft,
    contexts: contexts as RawContext[],
    cycles: cycles as RawCycle[],
    occurrences: occurrences as RawOccurrence[],
  };
}

function occurrenceKey(clientServiceId: string, cycleId: string, milestoneKey: string, scheduleEntryKey: string): string {
  return `${clientServiceId}|${cycleId}|${milestoneKey}|${scheduleEntryKey}`;
}

function decisionIdentity(
  clientServiceId: string,
  cycleId: string,
  milestoneKey: string,
  scheduleEntryKey: string,
  deadlineOccurrenceId: string | null,
): string {
  return `${clientServiceId}|${cycleId}|${milestoneKey}|${scheduleEntryKey}|${deadlineOccurrenceId ?? ''}`;
}

function evaluatorMap(result: unknown): Map<string, EvaluatedDeadline> {
  if (!isRecord(result)) return new Map();
  const byKey = result.byKey;
  const values: EvaluatedDeadline[] = [];
  if (isRecord(byKey)) {
    for (const value of Object.values(byKey)) {
      if (isRecord(value) && typeof value.milestoneKey === 'string' && typeof value.calculatedDueDate === 'string') {
        values.push(value as unknown as EvaluatedDeadline);
      }
    }
  }
  if (values.length === 0 && Array.isArray(result.occurrences)) {
    for (const value of result.occurrences) {
      if (isRecord(value) && typeof value.milestoneKey === 'string' && typeof value.calculatedDueDate === 'string') {
        values.push(value as unknown as EvaluatedDeadline);
      }
    }
  }
  return new Map(values.map((value) => [`${value.milestoneKey}:${value.scheduleEntryKey ?? ''}`, value]));
}

function evaluatorApplicability(result: unknown): { state: string; reason: string | null } {
  if (!isRecord(result) || !isRecord(result.applicability)) return { state: 'APPLICABLE', reason: null };
  return {
    state: asString(result.applicability.state, 'APPLICABLE'),
    reason: typeof result.applicability.reason === 'string' ? result.applicability.reason : null,
  };
}

function errorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === 'string' ? error.code : null;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to evaluate deadline rule';
}

function validateDateClock(options?: DeadlineRuleImpactOptions): DateOnly {
  const date = options?.now ? options.now() : currentDateInSingapore();
  parseDateOnly(date);
  return date;
}

function currentVersionNumber(version: RawVersion | null): number | null {
  return version && Number.isSafeInteger(version.version) && version.version > 0 ? version.version : null;
}

function counts(): DeadlineRuleImpactCounts {
  return {
    created: 0,
    recalculated: 0,
    cancelled: 0,
    preserved: 0,
    inapplicable: 0,
    missingInput: 0,
    conflicts: 0,
    warnings: 0,
  };
}

async function computeImpact(
  db: ImpactDb,
  ruleId: string,
  tenantId: string,
  options?: DeadlineRuleImpactOptions,
): Promise<{ impact: DeadlineRuleImpact; scope: Awaited<ReturnType<typeof loadRuleScope>> }> {
  const scope = await loadRuleScope(db, ruleId, tenantId);
  const today = validateDateClock(options);
  const calendarCache = new Map<string, BusinessCalendarSnapshot>();
  const contextByClientService = new Map<string, RawContext>();
  for (const context of scope.contexts) {
    if (context.tenantId === tenantId && context.ruleId === ruleId) contextByClientService.set(context.clientServiceId, context);
  }

  const cyclesById = new Map<string, RawCycle>();
  for (const cycle of scope.cycles) {
    if (cycle.tenantId === tenantId && cycle.ruleId === ruleId) cyclesById.set(cycle.id, cycle);
  }
  for (const occurrence of scope.occurrences) {
    if (occurrence.tenantId !== tenantId) continue;
    const cycle = occurrence.cycle;
    if (cycle && !cyclesById.has(occurrence.cycleId)) cyclesById.set(occurrence.cycleId, cycle);
  }

  const decisions: ImpactDecision[] = [];
  const fullIdentityStates: Array<Record<string, unknown>> = [];
  const impactCounts = counts();
  const evaluatedByCycle = new Map<string, Map<string, EvaluatedDeadline>>();
  const evaluationStateByCycle = new Map<string, { status: 'OK' | 'INAPPLICABLE' | 'MISSING_INPUT' | 'WARNING'; reason: string | null; hash: string | null; snapshot: unknown }>();

  const ruleCycles = [...cyclesById.values()]
    .filter((cycle) => cycle.origin === undefined || cycle.origin === 'RULE')
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const cycle of ruleCycles) {
    const context = contextByClientService.get(cycle.clientServiceId);
    const calendar = await loadCalendar(db, tenantId, cycle.businessCalendarId, calendarCache);
    if (!context) {
      const reason = 'Rule evaluator context is missing';
      impactCounts.warnings += 1;
      evaluationStateByCycle.set(cycle.id, { status: 'WARNING', reason, hash: null, snapshot: null });
      const identity = `cycle|${cycle.clientServiceId}|${cycle.id}|warning`;
      decisions.push({ identity, clientServiceId: cycle.clientServiceId, deadlineOccurrenceId: null, action: 'WARN', oldDate: null, newDate: null, reason });
      fullIdentityStates.push({ identity, action: 'WARN', oldDate: null, newDate: null, reason });
      continue;
    }
    const input = await evaluatorInputFor(scope.rule, scope.draft, cycle, context, calendar);
    if (!input) {
      const reason = 'Rule evaluator input cannot be built';
      impactCounts.warnings += 1;
      evaluationStateByCycle.set(cycle.id, { status: 'WARNING', reason, hash: null, snapshot: null });
      const identity = `cycle|${cycle.clientServiceId}|${cycle.id}|warning`;
      decisions.push({ identity, clientServiceId: cycle.clientServiceId, deadlineOccurrenceId: null, action: 'WARN', oldDate: null, newDate: null, reason });
      fullIdentityStates.push({ identity, action: 'WARN', oldDate: null, newDate: null, reason });
      continue;
    }
    try {
      const evaluated = evaluateDeadlineRule(input);
      const applicability = evaluatorApplicability(evaluated);
      const state = applicability.state === 'NOT_APPLICABLE'
        ? 'INAPPLICABLE'
        : applicability.state === 'MISSING_INPUT' ? 'MISSING_INPUT' : 'OK';
      if (state === 'INAPPLICABLE') impactCounts.inapplicable += 1;
      if (state === 'MISSING_INPUT') impactCounts.missingInput += 1;
      const reason = applicability.reason;
      evaluationStateByCycle.set(cycle.id, {
        status: state,
        reason,
        hash: isRecord(evaluated) && typeof evaluated.evaluationHash === 'string' ? evaluated.evaluationHash : null,
        snapshot: isRecord(evaluated) ? evaluated.sourceSnapshot ?? null : null,
      });
      evaluatedByCycle.set(cycle.id, evaluatorMap(evaluated));
      if (state !== 'OK') {
        const identity = `cycle|${cycle.clientServiceId}|${cycle.id}|${state.toLowerCase()}`;
        decisions.push({ identity, clientServiceId: cycle.clientServiceId, deadlineOccurrenceId: null, action: 'WARN', oldDate: null, newDate: null, reason: reason ?? state });
        fullIdentityStates.push({ identity, action: 'WARN', oldDate: null, newDate: null, reason: reason ?? state });
      }
    } catch (error) {
      const code = errorCode(error);
      const reason = errorReason(error);
      const status = code === ErrorCodes.MISSING_RULE_INPUT ? 'MISSING_INPUT' : 'WARNING';
      if (status === 'MISSING_INPUT') impactCounts.missingInput += 1;
      else impactCounts.warnings += 1;
      evaluationStateByCycle.set(cycle.id, { status, reason, hash: null, snapshot: null });
      const identity = `cycle|${cycle.clientServiceId}|${cycle.id}|${status.toLowerCase()}`;
      decisions.push({ identity, clientServiceId: cycle.clientServiceId, deadlineOccurrenceId: null, action: 'WARN', oldDate: null, newDate: null, reason });
      fullIdentityStates.push({ identity, action: 'WARN', oldDate: null, newDate: null, reason });
    }
  }

  const existingByKey = new Map<string, RawOccurrence[]>();
  for (const occurrence of scope.occurrences) {
    if (occurrence.tenantId !== tenantId) continue;
    const cycle = cyclesById.get(occurrence.cycleId);
    if (!cycle || cycle.tenantId !== tenantId || cycle.ruleId !== ruleId) continue;
    const key = occurrenceKey(occurrence.clientServiceId ?? cycle.clientServiceId, occurrence.cycleId, occurrence.milestoneKey, occurrence.scheduleEntryKey ?? '');
    const rows = existingByKey.get(key) ?? [];
    rows.push(occurrence);
    existingByKey.set(key, rows);
  }

  for (const [key, rows] of existingByKey.entries()) {
    if (rows.length > 1) impactCounts.conflicts += rows.length - 1;
    const occurrence = rows[0]!;
    const cycle = cyclesById.get(occurrence.cycleId)!;
    const clientServiceId = occurrence.clientServiceId ?? cycle.clientServiceId;
    const oldDate = safeDateOnly(occurrence.operativeDueDate) ?? safeDateOnly(occurrence.calculatedDueDate);
    const oldCalculatedDate = safeDateOnly(occurrence.calculatedDueDate);
    if (!oldDate) continue;
    const identity = decisionIdentity(clientServiceId, occurrence.cycleId, occurrence.milestoneKey, occurrence.scheduleEntryKey ?? '', occurrence.id);
    const state = evaluationStateByCycle.get(cycle.id);
    const next = evaluatedByCycle.get(cycle.id)?.get(`${occurrence.milestoneKey}:${occurrence.scheduleEntryKey ?? ''}`);
    const proposedCalculatedDate = safeDateOnly(next?.calculatedDueDate);
    let action: DeadlineRuleImpactAction = 'PRESERVE';
    let newDate: DateOnly | null = oldDate;
    // Keep calculated-date drift visible in the full fingerprint even when
    // the operative date is protected by lifecycle, history, or override
    // semantics. Task 7 can then refresh the hidden calculated date without
    // changing the user's operative date.
    let newCalculatedDate: DateOnly | null = proposedCalculatedDate ?? oldCalculatedDate;
    let reason = 'Evaluated date is unchanged';
    if (occurrence.status !== undefined && occurrence.status !== 'OPEN') {
      reason = 'Stored lifecycle state is immutable';
    } else if ((occurrence.origin !== undefined && occurrence.origin !== 'RULE') || (cycle.origin !== undefined && cycle.origin !== 'RULE')) {
      reason = 'Manual occurrence is immutable';
    } else if (occurrence.dateOverridden) {
      reason = 'Occurrence has a manual date override';
    } else if (oldDate < today) {
      reason = 'Occurrence date is historical';
    } else if (state?.status === 'WARNING' || state?.status === 'MISSING_INPUT' || state?.status === 'INAPPLICABLE') {
      action = 'WARN';
      newDate = oldDate;
      reason = state.reason ?? 'Rule evaluation requires attention';
    } else if (!next) {
      action = 'CANCEL';
      newDate = null;
      newCalculatedDate = null;
      reason = 'Occurrence is no longer produced by the proposed rule';
    } else if (next.calculatedDueDate !== oldDate) {
      action = 'RECALCULATE';
      newDate = next.calculatedDueDate;
      newCalculatedDate = next.calculatedDueDate;
      reason = 'Evaluated due date changed';
    } else {
      newCalculatedDate = next.calculatedDueDate;
    }
    if (action === 'PRESERVE') impactCounts.preserved += 1;
    if (action === 'RECALCULATE') impactCounts.recalculated += 1;
    if (action === 'CANCEL') impactCounts.cancelled += 1;
    const decision = { identity, clientServiceId, deadlineOccurrenceId: occurrence.id, action, oldDate, newDate, reason };
    decisions.push(decision);
    fullIdentityStates.push({
      identity,
      clientServiceId,
      cycleId: occurrence.cycleId,
      milestoneKey: occurrence.milestoneKey,
      scheduleEntryKey: occurrence.scheduleEntryKey ?? '',
      deadlineOccurrenceId: occurrence.id,
      action,
      oldDate,
      newDate,
      oldCalculatedDate,
      newCalculatedDate,
      reason,
    });
    // A duplicate identity is independently represented in the fingerprint,
    // even though its first row determines the decision count.
    for (const duplicate of rows.slice(1)) {
      const duplicateIdentity = decisionIdentity(clientServiceId, duplicate.cycleId, duplicate.milestoneKey, duplicate.scheduleEntryKey ?? '', duplicate.id);
      fullIdentityStates.push({ identity: duplicateIdentity, action: 'WARN', oldDate: safeDateOnly(duplicate.operativeDueDate), newDate: null, reason: 'Duplicate occurrence identity' });
    }
    existingByKey.delete(key);
  }

  for (const cycle of ruleCycles) {
    const evaluated = evaluatedByCycle.get(cycle.id);
    if (!evaluated) continue;
    const context = contextByClientService.get(cycle.clientServiceId);
    if (!context) continue;
    for (const [key, next] of evaluated.entries()) {
      const [milestoneKey, scheduleEntryKey = ''] = key.split(':');
      if (scope.occurrences.some((occurrence) => {
        const occurrenceCycle = cyclesById.get(occurrence.cycleId);
        return occurrenceCycle?.id === cycle.id
          && (occurrence.clientServiceId ?? occurrenceCycle.clientServiceId) === cycle.clientServiceId
          && occurrence.milestoneKey === milestoneKey
          && (occurrence.scheduleEntryKey ?? '') === scheduleEntryKey;
      })) continue;
      const identity = decisionIdentity(cycle.clientServiceId, cycle.id, milestoneKey ?? '', scheduleEntryKey, null);
      const newDate = safeDateOnly(next.calculatedDueDate);
      if (!newDate) continue;
      impactCounts.created += 1;
      const decision = {
        identity,
        clientServiceId: cycle.clientServiceId,
        deadlineOccurrenceId: null,
        action: 'CREATE' as const,
        oldDate: null,
        newDate,
        reason: 'Occurrence is newly produced by the proposed rule',
      };
      decisions.push(decision);
      fullIdentityStates.push({
        identity,
        clientServiceId: cycle.clientServiceId,
        cycleId: cycle.id,
        milestoneKey,
        scheduleEntryKey,
        deadlineOccurrenceId: null,
        action: 'CREATE',
        oldDate: null,
        newDate,
        reason: decision.reason,
      });
    }
  }

  const sortedStates = fullIdentityStates.sort((left, right) => String(left.identity).localeCompare(String(right.identity)));
  const sortedEvaluations = [...evaluationStateByCycle.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cycleId, value]) => ({ cycleId, ...value }));
  const previewFingerprint = hashConfiguration({
    ruleId,
    tenantId,
    currentPublishedVersion: currentVersionNumber(scope.current),
    draftRevision: scope.draft.draftRevision,
    draftConfigHash: scope.draft.configHash,
    today,
    counts: impactCounts,
    states: sortedStates,
    evaluations: sortedEvaluations,
  });
  const samples = decisions
    .sort((left, right) => left.identity.localeCompare(right.identity))
    .slice(0, MAX_IMPACT_SAMPLES)
    .map(({ clientServiceId, deadlineOccurrenceId, action, oldDate, newDate, reason }) => ({
      clientServiceId,
      deadlineOccurrenceId,
      action,
      oldDate,
      newDate,
      reason,
    }));
  return {
    impact: {
      ruleId,
      currentPublishedVersion: currentVersionNumber(scope.current),
      draftRevision: scope.draft.draftRevision,
      draftConfigHash: scope.draft.configHash,
      previewFingerprint,
      counts: impactCounts,
      samples,
    },
    scope,
  };
}

function identityMatches(
  impact: DeadlineRuleImpact,
  input: Pick<DeadlineRuleImpactInput, 'expectedCurrentVersion' | 'expectedDraftRevision' | 'draftConfigHash'>,
): boolean {
  return impact.currentPublishedVersion === input.expectedCurrentVersion
    && impact.draftRevision === input.expectedDraftRevision
    && impact.draftConfigHash === input.draftConfigHash;
}

function staleImpact(impact: DeadlineRuleImpact): DeadlineApiError {
  return new DeadlineApiError(
    ErrorCodes.IMPACT_CHANGED,
    'Deadline rule impact preview is stale',
    409,
    { impact },
  );
}

function parseImpactInput(rawInput: DeadlineRuleImpactInput): DeadlineRuleImpactInput {
  return deadlineRuleImpactPreviewSchema.parse(rawInput);
}

function parseApplyIdentity(rawInput: DeadlineRulePublishInput): DeadlineRuleApplyIdentity {
  return serviceApplyIdentitySchema.parse(rawInput);
}

function parseArchiveInput(rawInput: DeadlineRuleArchiveInput): DeadlineRuleArchiveInput {
  return serviceArchiveInputSchema.parse(rawInput);
}

export async function previewDeadlineRuleImpact(
  ruleId: string,
  rawInput: DeadlineRuleImpactInput,
  actor: TenantAwareParams,
  options?: DeadlineRuleImpactOptions,
): Promise<DeadlineRuleImpact> {
  if (typeof ruleId !== 'string' || ruleId.trim().length === 0) throw new ValidationError('ruleId must be a non-empty string');
  const input = parseImpactInput(rawInput);
  const { impact } = await computeImpact(prisma, ruleId, actor.tenantId, options);
  if (!identityMatches(impact, input)) throw staleImpact(impact);
  return impact;
}

export async function publishDeadlineRule(
  ruleId: string,
  rawInput: DeadlineRulePublishInput,
  actor: TenantAwareParams,
  options?: DeadlineRuleImpactOptions,
): Promise<DeadlineRuleDto> {
  const input = parseApplyIdentity(rawInput);
  await runSerializableTransaction(prisma, async (tx) => {
    const { impact, scope } = await computeImpact(tx, ruleId, actor.tenantId, options);
    if (!identityMatches(impact, input) || input.previewFingerprint !== impact.previewFingerprint) {
      throw staleImpact(impact);
    }
    const version = Math.max(0, ...(scope.rule.versions ?? []).map((row) => row.version)) + 1;
    const versionDelegate = delegate(tx, 'deadlineRuleVersion');
    if (!versionDelegate?.update) throw new ValidationError('Deadline rule version persistence is unavailable');
    await versionDelegate.update({
      where: { id: scope.draft.id },
      data: {
        version,
        state: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: actor.userId,
      },
    });
    const ruleDelegate = delegate(tx, 'deadlineRule');
    if (!ruleDelegate?.update) throw new ValidationError('Deadline rule persistence is unavailable');
    await ruleDelegate.update({
      where: { id: ruleId, tenantId: actor.tenantId },
      data: { currentVersionId: scope.draft.id, updatedById: actor.userId, isActive: true, archivedAt: null },
    });
    await createAuditLog({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'UPDATE',
      changeSource: 'API',
      entityType: 'DeadlineRule',
      entityId: ruleId,
      entityName: scope.rule.name,
      summary: `Published deadline rule "${scope.rule.name ?? ruleId}" version ${version}`,
      changes: {
        currentVersion: { old: scope.current?.version ?? null, new: version },
        draftRevision: { old: scope.draft.draftRevision, new: scope.draft.draftRevision },
        configHash: { old: scope.draft.configHash, new: scope.draft.configHash },
      },
      metadata: {
        ruleId,
        version,
        previewFingerprint: impact.previewFingerprint,
        counts: impact.counts,
      },
    }, tx);
    await enqueueScheduleReconciliation(tx, {
      tenantId: actor.tenantId,
      scopeType: 'RULE',
      scopeId: ruleId,
      triggerType: 'RULE_PUBLISHED',
      correlationId: `rule:${ruleId}:published:${version}`,
      requestedById: actor.userId,
    });
  });
  return getPublishedRule(ruleId, actor);
}

export async function archiveDeadlineRule(
  ruleId: string,
  rawInput: DeadlineRuleArchiveInput,
  actor: TenantAwareParams,
  options?: DeadlineRuleImpactOptions,
): Promise<DeadlineRuleDto> {
  const input = parseArchiveInput(rawInput);
  await runSerializableTransaction(prisma, async (tx) => {
    const { impact, scope } = await computeImpact(tx, ruleId, actor.tenantId, options);
    if (!identityMatches(impact, input) || input.previewFingerprint !== impact.previewFingerprint) {
      throw staleImpact(impact);
    }
    const ruleDelegate = delegate(tx, 'deadlineRule');
    if (!ruleDelegate?.update) throw new ValidationError('Deadline rule persistence is unavailable');
    const archivedAt = new Date();
    await ruleDelegate.update({
      where: { id: ruleId, tenantId: actor.tenantId },
      data: {
        isActive: false,
        archivedAt,
        archivedById: actor.userId,
        archiveReason: input.reason,
        updatedById: actor.userId,
      },
    });
    await createAuditLog({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: 'UPDATE',
      changeSource: 'API',
      entityType: 'DeadlineRule',
      entityId: ruleId,
      entityName: scope.rule.name,
      summary: `Archived deadline rule "${scope.rule.name ?? ruleId}"`,
      reason: input.reason,
      changes: {
        isActive: { old: scope.rule.isActive ?? true, new: false },
        archivedAt: { old: scope.rule.archivedAt ?? null, new: archivedAt.toISOString() },
        archiveReason: { old: scope.rule.archiveReason ?? null, new: input.reason },
      },
      metadata: { ruleId, previewFingerprint: impact.previewFingerprint, counts: impact.counts },
    }, tx);
    await enqueueScheduleReconciliation(tx, {
      tenantId: actor.tenantId,
      scopeType: 'RULE',
      scopeId: ruleId,
      triggerType: 'RULE_ARCHIVED',
      correlationId: `rule:${ruleId}:archived:${scope.draft.draftRevision}`,
      requestedById: actor.userId,
    });
  });
  return getPublishedRule(ruleId, actor);
}

async function getPublishedRule(ruleId: string, actor: TenantAwareParams): Promise<DeadlineRuleDto> {
  const rule = await findFirst(prisma, 'deadlineRule', {
    where: { id: ruleId, tenantId: actor.tenantId },
    include: {
      versions: { include: { parameterDefinitions: true, milestoneTemplates: true }, orderBy: { version: 'desc' } },
      currentVersion: { include: { parameterDefinitions: true, milestoneTemplates: true } },
      variantAssociations: { where: { archivedAt: null }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!isRecord(rule)) throw new NotFoundError('Deadline rule not found');
  // Keep the DTO shape aligned with the existing rule service without making
  // publication depend on a second write or a mutable version update.
  const versions = Array.isArray(rule.versions) ? rule.versions : [];
  const toVersion = (version: unknown): Record<string, unknown> | null => {
    if (!isRecord(version)) return null;
    return {
      id: version.id,
      ruleId: version.ruleId ?? ruleId,
      version: version.version,
      state: version.state,
      schemaVersion: version.schemaVersion,
      recurrence: version.recurrence,
      applicability: version.applicability,
      configHash: version.configHash,
      draftRevision: version.draftRevision,
      publishedAt: version.publishedAt ?? null,
      publishedById: version.publishedById ?? null,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      parameters: Array.isArray(version.parameterDefinitions) ? version.parameterDefinitions.map((parameter) => ({
        id: parameter.id,
        key: parameter.key,
        label: parameter.label,
        description: parameter.helpText ?? null,
        type: parameter.type,
        required: parameter.isRequired,
        defaultValue: parameter.defaultValue ?? null,
        validation: parameter.validation ?? null,
        helpText: parameter.helpText ?? null,
        displayOrder: parameter.displayOrder ?? 0,
      })) : [],
      milestones: Array.isArray(version.milestoneTemplates) ? version.milestoneTemplates.map((milestone) => ({
        id: milestone.id,
        key: milestone.milestoneKey,
        name: milestone.name,
        description: milestone.description ?? null,
        type: milestone.type,
        generationMode: milestone.generationMode,
        expression: milestone.dateExpression,
        businessDayAdjustment: milestone.businessDayAdjustment,
        displayOrder: milestone.displayOrder ?? 0,
        isActive: milestone.isActive !== false,
      })) : [],
    };
  };
  const dto = {
    id: rule.id,
    tenantId: rule.tenantId,
    code: rule.code,
    name: rule.name,
    description: rule.description ?? null,
    isActive: rule.isActive !== false,
    archivedAt: rule.archivedAt ?? null,
    archivedById: rule.archivedById ?? null,
    archiveReason: rule.archiveReason ?? null,
    currentVersionId: rule.currentVersionId ?? null,
    currentVersion: toVersion(rule.currentVersion),
    draft: versions.map(toVersion).find((version) => version?.state === 'DRAFT') ?? null,
    versions: versions.map(toVersion).filter((version): version is Record<string, unknown> => version !== null),
    variantAssociations: Array.isArray(rule.variantAssociations) ? rule.variantAssociations : [],
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
  return dto as unknown as DeadlineRuleDto;
}
