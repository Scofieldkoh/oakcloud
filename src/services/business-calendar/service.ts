import { computeChanges, createAuditLog } from '@/lib/audit';
import {
  ConflictError,
  DeadlineApiError,
  ErrorCodes,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import {
  BUSINESS_CALENDAR_JURISDICTION,
  BUSINESS_CALENDAR_TIME_ZONE,
  businessCalendarInputSchema,
  type BusinessCalendarInput,
  type NormalizedBusinessCalendarInput,
  type BusinessCalendarUpdateInput,
} from '@/lib/validations/business-calendar';
import { currentDateInSingapore, formatDateOnly, parseDateOnly } from '@/services/service-schedule/date-only';
import { evaluateDeadlineRule } from '@/services/service-schedule/evaluator';
import { hashConfiguration } from '@/services/service-schedule/hash';
import { enqueueScheduleReconciliation } from '@/services/schedule-reconciliation';
import type {
  BusinessCalendarSnapshot,
  CompanyRuleSource,
  DateOnly,
  EvaluatedDeadline,
} from '@/services/service-schedule';

const MAX_IMPACT_SAMPLES = 100;

type CalendarDb = typeof prisma | {
  businessCalendar: typeof prisma.businessCalendar;
  businessHoliday: typeof prisma.businessHoliday;
  serviceCycle: typeof prisma.serviceCycle;
  deadlineOccurrence: typeof prisma.deadlineOccurrence;
  clientServiceDeadlineRule: typeof prisma.clientServiceDeadlineRule;
};

type HolidayRecord = {
  id?: string;
  tenantId: string;
  calendarId: string;
  date: Date | string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type CalendarRecord = {
  id: string;
  tenantId: string;
  name: string;
  jurisdictionCode: string;
  timeZone: string;
  weekendDays: number[];
  revision: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  holidays?: HolidayRecord[];
};

type CanonicalCalendarInput = Omit<NormalizedBusinessCalendarInput, 'holidays'> & {
  holidays: Array<{
    date: DateOnly;
    name: string;
    description: string | null;
  }>;
};

type CalendarHolidayDto = {
  id?: string;
  date: DateOnly;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type BusinessCalendarDto = {
  id: string;
  name: string;
  jurisdictionCode: string;
  timeZone: string;
  weekendDays: number[];
  revision: number;
  isActive: boolean;
  archivedAt: string | null;
  holidays: CalendarHolidayDto[];
};

export type BusinessCalendarListDto = {
  calendars: BusinessCalendarDto[];
  total: number;
};

export type BusinessCalendarImpactSample = {
  deadlineId: string;
  oldDate: DateOnly;
  newDate: DateOnly;
};

export type BusinessCalendarImpact = {
  calendarId: string;
  expectedRevision: number;
  proposedHash: string;
  previewFingerprint: string;
  counts: {
    recalculated: number;
    preserved: number;
    warnings: number;
  };
  samples: BusinessCalendarImpactSample[];
};

export type BusinessCalendarImpactOptions = {
  /** Injectable civil-date clock for deterministic preview/update tests. */
  now?: () => DateOnly;
};

type ImpactDecision = {
  deadlineId: string;
  oldDate: DateOnly;
  newDate: DateOnly;
  action: 'RECALCULATE' | 'PRESERVE' | 'WARN';
  reason: string;
};

type ImpactOccurrence = {
  id: string;
  tenantId: string;
  cycleId: string;
  calculatedDueDate: Date | string;
  operativeDueDate: Date | string;
  dateOverridden?: boolean;
  status?: string;
  origin?: string;
  milestoneKey?: string;
  scheduleEntryKey?: string;
  cycle?: {
    id?: string;
    tenantId: string;
    businessCalendarId?: string | null;
    clientServiceId?: string;
    ruleId?: string;
    ruleVersionId?: string;
    periodKey?: string;
    periodStart?: Date | string;
    periodEnd?: Date | string;
    companyId?: string;
  } | null;
};

type ImpactCycle = {
  id: string;
  tenantId: string;
  clientServiceId: string;
  ruleId: string;
  ruleVersionId: string;
  companyId: string;
  periodKey: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  origin?: string;
};

type RuleContext = {
  clientServiceId: string;
  ruleId: string;
  clientService?: {
    tenantId: string;
    companyId: string;
    company?: Record<string, unknown> | null;
  } | null;
  rule?: {
    tenantId: string;
    currentVersion?: {
      id: string;
      recurrence: unknown;
      applicability: unknown;
      milestoneTemplates?: Array<{
        milestoneKey: string;
        name: string;
        description: string | null;
        type: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
        generationMode: 'ONCE_PER_CYCLE' | 'ONCE_PER_SCHEDULE_ENTRY';
        dateExpression: unknown;
        businessDayAdjustment: 'NONE' | 'PREVIOUS' | 'NEXT';
        displayOrder: number;
        isActive: boolean;
      }>;
    } | null;
  } | null;
  parameterValues?: unknown;
  scheduleEntries?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPrismaCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function toDateOnly(value: Date | string): DateOnly {
  if (typeof value === 'string') {
    parseDateOnly(value as DateOnly);
    return value as DateOnly;
  }
  return formatDateOnly(value);
}

function toArchivedAt(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function makeReadonlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values);
  const throwMutation = () => {
    throw new TypeError('Business calendar snapshots are immutable');
  };
  Object.defineProperties(set, {
    add: { value: throwMutation, configurable: false, writable: false },
    clear: { value: throwMutation, configurable: false, writable: false },
    delete: { value: throwMutation, configurable: false, writable: false },
  });
  return Object.freeze(set);
}

function assertSingaporeCalendar(record: Pick<CalendarRecord, 'jurisdictionCode' | 'timeZone'>): void {
  if (record.jurisdictionCode !== BUSINESS_CALENDAR_JURISDICTION) {
    throw new ValidationError(`Unsupported business calendar jurisdiction: ${record.jurisdictionCode}`);
  }
  if (record.timeZone !== BUSINESS_CALENDAR_TIME_ZONE) {
    throw new ValidationError(`Unsupported business calendar time zone: ${record.timeZone}`);
  }
}

function assertCalendarRecordShape(record: CalendarRecord): void {
  if (!Number.isSafeInteger(record.revision) || record.revision < 1) {
    throw new ValidationError('Business calendar revision must be a positive integer');
  }
  if (!Array.isArray(record.weekendDays)
    || record.weekendDays.length < 1
    || record.weekendDays.length > 6
    || record.weekendDays.some((day) => !Number.isSafeInteger(day) || day < 0 || day > 6)
    || new Set(record.weekendDays).size !== record.weekendDays.length) {
    throw new ValidationError('Business calendar weekend days are invalid');
  }
  for (const holiday of record.holidays ?? []) {
    toDateOnly(holiday.date);
  }
}

function calendarInclude(tenantId: string, calendarId?: string, activeOnly = false) {
  return {
    holidays: {
      where: {
        tenantId,
        ...(calendarId ? { calendarId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: [{ date: 'asc' as const }, { id: 'asc' as const }],
    },
  };
}

async function findCalendarRecord(
  db: CalendarDb,
  id: string,
  tenantId: string,
  options: { activeOnly?: boolean } = {},
): Promise<CalendarRecord> {
  const where = {
    id,
    tenantId,
    ...(options.activeOnly ? { isActive: true, archivedAt: null } : {}),
  };
  const record = await db.businessCalendar.findFirst({
    where,
    include: calendarInclude(tenantId, id, options.activeOnly),
  });
  if (!record) throw new NotFoundError('Business calendar not found');
  const normalized = record as unknown as CalendarRecord;
  assertSingaporeCalendar(normalized);
  assertCalendarRecordShape(normalized);
  return normalized;
}

function toCalendarHolidayDto(holiday: HolidayRecord): CalendarHolidayDto {
  return {
    ...(holiday.id ? { id: holiday.id } : {}),
    date: toDateOnly(holiday.date),
    name: holiday.name,
    description: holiday.description ?? null,
    isActive: holiday.isActive,
  };
}

function toCalendarDto(record: CalendarRecord, fallbackHolidays: HolidayRecord[] = []): BusinessCalendarDto {
  assertSingaporeCalendar(record);
  assertCalendarRecordShape(record);
  const holidays = (record.holidays ?? fallbackHolidays)
    .map(toCalendarHolidayDto)
    .sort((left, right) => left.date.localeCompare(right.date) || String(left.id ?? '').localeCompare(String(right.id ?? '')));
  return {
    id: record.id,
    name: record.name,
    jurisdictionCode: record.jurisdictionCode,
    timeZone: record.timeZone,
    weekendDays: [...new Set(record.weekendDays)].sort((left, right) => left - right),
    revision: record.revision,
    isActive: record.isActive,
    archivedAt: toArchivedAt(record.archivedAt),
    holidays,
  };
}

function toSnapshot(record: CalendarRecord): BusinessCalendarSnapshot {
  assertSingaporeCalendar(record);
  const weekendDays = [...new Set(record.weekendDays)].sort((left, right) => left - right);
  const holidays = (record.holidays ?? [])
    .filter((holiday) => holiday.isActive)
    .map((holiday) => toDateOnly(holiday.date))
    .sort();
  return {
    id: record.id,
    timeZone: record.timeZone,
    revision: record.revision,
    weekendDays: makeReadonlySet(weekendDays),
    holidays: makeReadonlySet(holidays),
  };
}

function normalizeCalendarInput(input: BusinessCalendarInput | Record<string, unknown>): CanonicalCalendarInput {
  const parsed = businessCalendarInputSchema.parse(input);
  return {
    ...parsed,
    holidays: parsed.holidays.map((holiday) => ({
      ...holiday,
      date: holiday.date as DateOnly,
    })),
  };
}

function normalizedHolidayRows(calendarId: string, tenantId: string, input: CanonicalCalendarInput): HolidayRecord[] {
  return input.holidays.map((holiday) => ({
    tenantId,
    calendarId,
    date: parseDateOnly(holiday.date),
    name: holiday.name,
    description: holiday.description,
    isActive: true,
  }));
}

function buildProposedSnapshot(
  current: CalendarRecord,
  input: CanonicalCalendarInput,
): BusinessCalendarSnapshot {
  return {
    id: current.id,
    timeZone: input.timeZone,
    revision: current.revision + 1,
    weekendDays: makeReadonlySet(input.weekendDays),
    holidays: makeReadonlySet(input.holidays.map((holiday) => holiday.date)),
  };
}

function buildProposedHash(
  current: CalendarRecord,
  input: CanonicalCalendarInput,
): string {
  return hashConfiguration({
    calendarId: current.id,
    expectedRevision: current.revision,
    proposedRevision: current.revision + 1,
    name: input.name,
    jurisdictionCode: input.jurisdictionCode,
    timeZone: input.timeZone,
    weekendDays: input.weekendDays,
    holidays: input.holidays,
    isActive: input.isActive,
  });
}

function parseCompanyDateField(value: unknown): unknown {
  if (value instanceof Date) return toDateOnly(value);
  return value;
}

function normalizeCompanySource(company: Record<string, unknown> | null | undefined): CompanyRuleSource {
  if (!company) return {};
  const source: Record<string, unknown> = {};
  const supported = [
    'isGstRegistered', 'isRegisteredCharity', 'isIPC', 'hasCharges',
    'currentOfficerCount', 'currentShareholderCount', 'annualReceiptsOrExpenditure',
    'nextAgmDueDate', 'nextArDueDate', 'accountsDueDate', 'incorporationDate',
    'registrationDate', 'entityType', 'status', 'primarySsicCode', 'secondarySsicCode',
    'uen', 'name', 'financialYearEnd',
  ];
  for (const field of supported) {
    if (company[field] !== undefined && company[field] !== null) {
      source[field] = parseCompanyDateField(company[field]);
    }
  }
  // Company stores FYE as month/day rather than a full date in the current
  // schema. Do not guess a year; the evaluator will report missing input.
  return source as CompanyRuleSource;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function cycleKey(clientServiceId: string, ruleId: string): string {
  return `${clientServiceId}:${ruleId}`;
}

function evaluatorInputFor(
  cycle: ImpactCycle,
  context: RuleContext,
  calendar: BusinessCalendarSnapshot,
): Parameters<typeof evaluateDeadlineRule>[0] | null {
  const version = context.rule?.currentVersion;
  if (!version || !context.clientService) return null;
  const periodStart = toDateOnly(cycle.periodStart);
  const periodEnd = toDateOnly(cycle.periodEnd);
  return {
    ruleId: cycle.ruleId,
    ruleVersionId: version.id,
    recurrence: version.recurrence as Parameters<typeof evaluateDeadlineRule>[0]['recurrence'],
    applicability: version.applicability as Parameters<typeof evaluateDeadlineRule>[0]['applicability'],
    parameters: normalizeJsonObject(context.parameterValues),
    scheduleEntries: Array.isArray(context.scheduleEntries) ? context.scheduleEntries as Parameters<typeof evaluateDeadlineRule>[0]['scheduleEntries'] : [],
    milestones: (version.milestoneTemplates ?? []).map((milestone) => ({
      key: milestone.milestoneKey,
      name: milestone.name,
      description: milestone.description,
      type: milestone.type,
      generationMode: milestone.generationMode,
      expression: milestone.dateExpression as never,
      businessDayAdjustment: milestone.businessDayAdjustment,
      displayOrder: milestone.displayOrder,
      isActive: milestone.isActive,
    })),
    company: normalizeCompanySource(context.clientService.company),
    period: { key: cycle.periodKey, start: periodStart, end: periodEnd },
    calendar,
  };
}

async function loadImpactData(db: CalendarDb, calendarId: string, tenantId: string): Promise<{
  occurrences: ImpactOccurrence[];
  cycles: ImpactCycle[];
  contexts: RuleContext[];
}> {
  // The production Prisma client always exposes these delegates. Keeping the
  // guard makes the pure CRUD contract usable with a narrow persistence test
  // double while still making the real preview query complete.
  if (!db.deadlineOccurrence || !db.serviceCycle || !db.clientServiceDeadlineRule
    || typeof db.deadlineOccurrence.findMany !== 'function'
    || typeof db.serviceCycle.findMany !== 'function'
    || typeof db.clientServiceDeadlineRule.findMany !== 'function') {
    return { occurrences: [], cycles: [], contexts: [] };
  }
  const [occurrences, cycles, contexts] = await Promise.all([
    db.deadlineOccurrence.findMany({
      where: {
        tenantId,
        cycle: { tenantId, businessCalendarId: calendarId },
      },
      select: {
        id: true,
        tenantId: true,
        cycleId: true,
        milestoneKey: true,
        scheduleEntryKey: true,
        calculatedDueDate: true,
        operativeDueDate: true,
        dateOverridden: true,
        status: true,
        origin: true,
        cycle: {
          select: {
            id: true,
            tenantId: true,
            businessCalendarId: true,
            clientServiceId: true,
            ruleId: true,
            ruleVersionId: true,
            periodKey: true,
            periodStart: true,
            periodEnd: true,
            companyId: true,
            origin: true,
          },
        },
      },
      orderBy: [{ id: 'asc' }],
    }),
    db.serviceCycle.findMany({
      where: { tenantId, businessCalendarId: calendarId },
      select: {
        id: true,
        tenantId: true,
        clientServiceId: true,
        ruleId: true,
        ruleVersionId: true,
        companyId: true,
        periodKey: true,
        periodStart: true,
        periodEnd: true,
        origin: true,
      },
      orderBy: [{ id: 'asc' }],
    }),
    db.clientServiceDeadlineRule.findMany({
      where: {
        tenantId,
        enabled: true,
        clientService: { tenantId, deletedAt: null },
        rule: { tenantId, isActive: true },
      },
      select: {
        tenantId: true,
        clientServiceId: true,
        ruleId: true,
        parameterValues: true,
        scheduleEntries: true,
        clientService: {
          select: {
            tenantId: true,
            companyId: true,
            company: {
              select: {
                tenantId: true,
                isGstRegistered: true,
                isRegisteredCharity: true,
                isIPC: true,
                hasCharges: true,
                currentOfficerCount: true,
                currentShareholderCount: true,
                annualReceiptsOrExpenditure: true,
                nextAgmDueDate: true,
                nextArDueDate: true,
                accountsDueDate: true,
                incorporationDate: true,
                registrationDate: true,
                entityType: true,
                status: true,
                primarySsicCode: true,
                secondarySsicCode: true,
                uen: true,
                name: true,
              },
            },
          },
        },
        rule: {
          select: {
            tenantId: true,
            currentVersion: {
              select: {
                id: true,
                recurrence: true,
                applicability: true,
                milestoneTemplates: {
                  where: { tenantId },
                  orderBy: [{ displayOrder: 'asc' }, { milestoneKey: 'asc' }],
                  select: {
                    milestoneKey: true,
                    name: true,
                    description: true,
                    type: true,
                    generationMode: true,
                    dateExpression: true,
                    businessDayAdjustment: true,
                    displayOrder: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ clientServiceId: 'asc' }, { ruleId: 'asc' }],
    }),
  ]);
  return {
    occurrences: occurrences as unknown as ImpactOccurrence[],
    cycles: cycles as unknown as ImpactCycle[],
    contexts: contexts as unknown as RuleContext[],
  };
}

function dateForOccurrence(occurrence: ImpactOccurrence): DateOnly {
  return toDateOnly(occurrence.operativeDueDate);
}

async function computeImpact(
  db: CalendarDb,
  current: CalendarRecord,
  input: CanonicalCalendarInput,
  tenantId: string,
  now?: () => DateOnly,
): Promise<BusinessCalendarImpact> {
  const today = now ? now() : currentDateInSingapore();
  const proposedCalendar = buildProposedSnapshot(current, input);
  const proposedHash = buildProposedHash(current, input);
  const data = await loadImpactData(db, current.id, tenantId);
  const cycleById = new Map<string, ImpactCycle>();
  for (const cycle of data.cycles) cycleById.set(cycle.id, cycle);
  for (const occurrence of data.occurrences) {
    if (occurrence.cycle && !cycleById.has(occurrence.cycleId)) {
      cycleById.set(occurrence.cycleId, occurrence.cycle as ImpactCycle);
    }
  }
  const contextByKey = new Map<string, RuleContext>();
  for (const context of data.contexts) contextByKey.set(cycleKey(context.clientServiceId, context.ruleId), context);

  const decisions: ImpactDecision[] = [];
  const counts = { recalculated: 0, preserved: 0, warnings: 0 };
  const evaluatedByCycle = new Map<string, Map<string, EvaluatedDeadline>>();
  const evaluationWarnings = new Map<string, string>();
  const evaluatedInputs: Array<{ cycleId: string; evaluationHash: string; sourceSnapshot: Record<string, unknown> }> = [];

  for (const cycle of cycleById.values()) {
    // Manual-trigger cycles and their evaluator state are immutable history.
    // They remain in the occurrence decision scope, but never enter the rule
    // evaluator or its hashes/warnings.
    if (cycle.origin !== 'RULE') continue;
    const context = contextByKey.get(cycleKey(cycle.clientServiceId, cycle.ruleId));
    if (!context) {
      evaluationWarnings.set(cycle.id, 'Rule evaluator context is missing');
      continue;
    }
    const evaluatorInput = evaluatorInputFor(cycle, context, proposedCalendar);
    if (!evaluatorInput) {
      evaluationWarnings.set(cycle.id, 'Rule evaluator input cannot be built');
      continue;
    }
    try {
      const result = evaluateDeadlineRule(evaluatorInput);
      evaluatedByCycle.set(cycle.id, new Map(Object.entries(result.byKey)));
      evaluatedInputs.push({
        cycleId: cycle.id,
        evaluationHash: result.evaluationHash,
        sourceSnapshot: result.sourceSnapshot,
      });
      if (result.applicability.state !== 'APPLICABLE') {
        evaluationWarnings.set(cycle.id, result.applicability.reason ?? 'Rule is not applicable');
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unable to evaluate deadline rule';
      evaluationWarnings.set(cycle.id, reason);
    }
  }
  // Warnings describe failed/non-applicable evaluator cycles, not occurrence
  // rows. This keeps an empty failed cycle visible and prevents one failure
  // from being multiplied by the number of materialized occurrences.
  counts.warnings = evaluationWarnings.size;

  for (const occurrence of data.occurrences) {
    const oldDate = dateForOccurrence(occurrence);
    const cycle = cycleById.get(occurrence.cycleId);
    const evaluated = cycle ? evaluatedByCycle.get(cycle.id) : undefined;
    const key = `${occurrence.milestoneKey ?? ''}:${occurrence.scheduleEntryKey ?? ''}`;
    const next = evaluated?.get(key);
    const warning = cycle ? evaluationWarnings.get(cycle.id) : undefined;
    // Lifecycle, origin, overrides, and historical dates are immutable before
    // evaluator status is considered. A warning must never rewrite one of
    // these rows as WARN.
    if (occurrence.status !== undefined && occurrence.status !== 'OPEN') {
      counts.preserved += 1;
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate: oldDate, action: 'PRESERVE', reason: 'Stored lifecycle state is immutable for calendar updates' });
      continue;
    }
    if ((occurrence.origin !== undefined && occurrence.origin !== 'RULE')
      || (cycle?.origin !== undefined && cycle.origin !== 'RULE')) {
      counts.preserved += 1;
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate: oldDate, action: 'PRESERVE', reason: 'Manual occurrence is immutable for calendar updates' });
      continue;
    }
    if (occurrence.dateOverridden) {
      counts.preserved += 1;
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate: oldDate, action: 'PRESERVE', reason: 'Occurrence has a manual date override' });
      continue;
    }
    if (oldDate < today) {
      counts.preserved += 1;
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate: oldDate, action: 'PRESERVE', reason: 'Occurrence date is historical' });
      continue;
    }
    if (warning) {
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate: oldDate, action: 'WARN', reason: warning });
      continue;
    }
    if (!next) {
      counts.preserved += 1;
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate: oldDate, action: 'PRESERVE', reason: !next ? 'No changed evaluated date' : 'Occurrence is immutable for this update' });
      continue;
    }
    const newDate = next.calculatedDueDate;
    if (newDate === oldDate) {
      counts.preserved += 1;
      decisions.push({ deadlineId: occurrence.id, oldDate, newDate, action: 'PRESERVE', reason: 'Evaluated date is unchanged' });
      continue;
    }
    counts.recalculated += 1;
    decisions.push({ deadlineId: occurrence.id, oldDate, newDate, action: 'RECALCULATE', reason: 'Business calendar changed the evaluated due date' });
  }

  decisions.sort((left, right) => left.deadlineId.localeCompare(right.deadlineId));
  evaluatedInputs.sort((left, right) => left.cycleId.localeCompare(right.cycleId));
  const relevantInputs = decisions.map((decision) => ({
    deadlineId: decision.deadlineId,
    action: decision.action,
    oldDate: decision.oldDate,
    newDate: decision.newDate,
    reason: decision.reason,
  }));
  const previewFingerprint = hashConfiguration({
    calendarId: current.id,
    expectedRevision: current.revision,
    proposedHash,
    today,
    counts,
    relevantInputs,
    evaluatedInputs,
    evaluationWarnings: [...evaluationWarnings.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cycleId, reason]) => ({ cycleId, reason })),
  });
  return {
    calendarId: current.id,
    expectedRevision: current.revision,
    proposedHash,
    previewFingerprint,
    counts,
    samples: decisions.slice(0, MAX_IMPACT_SAMPLES).map(({ deadlineId, oldDate, newDate }) => ({ deadlineId, oldDate, newDate })),
  };
}

export async function listBusinessCalendars(params: TenantAwareParams): Promise<BusinessCalendarListDto> {
  const records = await prisma.businessCalendar.findMany({
    where: { tenantId: params.tenantId },
    include: calendarInclude(params.tenantId),
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
  });
  const calendars = (records as unknown as CalendarRecord[]).map((record) => toCalendarDto(record));
  return { calendars, total: calendars.length };
}

export async function getBusinessCalendar(id: string, params: TenantAwareParams): Promise<BusinessCalendarDto> {
  const record = await findCalendarRecord(prisma, id, params.tenantId);
  return toCalendarDto(record);
}

export async function getBusinessCalendarSnapshot(
  id: string,
  params: TenantAwareParams,
): Promise<BusinessCalendarSnapshot> {
  const record = await findCalendarRecord(prisma, id, params.tenantId, { activeOnly: true });
  return toSnapshot(record);
}

export async function createBusinessCalendar(
  input: BusinessCalendarInput,
  params: TenantAwareParams,
): Promise<BusinessCalendarDto> {
  const parsed = normalizeCalendarInput(input as Record<string, unknown>);
  const holidayRows = normalizedHolidayRows('', params.tenantId, parsed);
  try {
    return await runSerializableTransaction(prisma, async (tx) => {
      const created = await tx.businessCalendar.create({
        data: {
          tenantId: params.tenantId,
          name: parsed.name,
          jurisdictionCode: parsed.jurisdictionCode,
          timeZone: parsed.timeZone,
          weekendDays: parsed.weekendDays,
          revision: 1,
          isActive: parsed.isActive,
          archivedAt: parsed.isActive ? null : new Date(),
        },
      });
      const rows = holidayRows.map((row) => ({ ...row, calendarId: created.id }));
      if (rows.length > 0 && typeof tx.businessHoliday.createMany === 'function') {
        await tx.businessHoliday.createMany({ data: rows });
      }
      await createAuditLog({
        tenantId: params.tenantId,
        userId: params.userId,
        action: 'CREATE',
        entityType: 'BusinessCalendar',
        entityId: created.id,
        entityName: created.name,
        summary: `Created business calendar "${created.name}"`,
        changes: {
          revision: { old: null, new: 1 },
          holidays: { old: [], new: parsed.holidays },
        },
      }, tx);
      return toCalendarDto({
        ...(created as unknown as CalendarRecord),
        holidays: rows,
      });
    });
  } catch (error) {
    if (isPrismaCode(error, 'P2002')) throw new ConflictError('A business calendar with this name already exists');
    throw error;
  }
}

export async function previewBusinessCalendarImpact(
  id: string,
  input: BusinessCalendarInput,
  params: TenantAwareParams,
  options: BusinessCalendarImpactOptions = {},
): Promise<BusinessCalendarImpact> {
  const parsed = normalizeCalendarInput(input as Record<string, unknown>);
  const current = await findCalendarRecord(prisma, id, params.tenantId);
  return computeImpact(prisma, current, parsed, params.tenantId, options.now);
}

export async function updateBusinessCalendar(
  id: string,
  input: BusinessCalendarUpdateInput | (BusinessCalendarInput & {
    expectedRevision: number;
    proposedHash: string;
    previewFingerprint: string;
  }),
  params: TenantAwareParams,
  options: BusinessCalendarImpactOptions = {},
): Promise<BusinessCalendarDto> {
  const {
    expectedRevision,
    proposedHash,
    previewFingerprint,
    ...calendarInput
  } = input as BusinessCalendarUpdateInput & Record<string, unknown>;
  // Parse the calendar fields strictly here. Hash format is enforced by the
  // route schema; the service deliberately compares arbitrary stale previews
  // as IMPACT_CHANGED so callers cannot turn a stale confirmation into a
  // generic validation leak.
  const parsed = normalizeCalendarInput(calendarInput);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new ValidationError('expectedRevision must be a positive integer');
  }

  return runSerializableTransaction(prisma, async (tx) => {
    const current = await findCalendarRecord(tx, id, params.tenantId);
    if (current.revision !== expectedRevision) {
      throw new DeadlineApiError(
        ErrorCodes.VERSION_CONFLICT,
        'Business calendar revision is stale',
        409,
        { expectedRevision, currentRevision: current.revision },
      );
    }

    const impact = await computeImpact(tx, current, parsed, params.tenantId, options.now);
    if (proposedHash !== impact.proposedHash || previewFingerprint !== impact.previewFingerprint) {
      throw new DeadlineApiError(
        ErrorCodes.IMPACT_CHANGED,
        'Business calendar impact preview is stale',
        409,
        { impact },
      );
    }

    const updated = await tx.businessCalendar.update({
      where: { id, tenantId: params.tenantId, revision: expectedRevision },
      data: {
        name: parsed.name,
        jurisdictionCode: parsed.jurisdictionCode,
        timeZone: parsed.timeZone,
        weekendDays: parsed.weekendDays,
        isActive: parsed.isActive,
        archivedAt: parsed.isActive ? null : new Date(),
        revision: { increment: 1 },
      },
    });

    const existingHolidaysResult = typeof tx.businessHoliday.findMany === 'function'
      ? await tx.businessHoliday.findMany({
        where: { tenantId: params.tenantId, calendarId: id },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
      })
      : [];
    const existingHolidays = (existingHolidaysResult ?? []) as unknown as HolidayRecord[];
    const existingByDate = new Map(existingHolidays.map((holiday) => [toDateOnly(holiday.date), holiday]));
    const nextDates = parsed.holidays.map((holiday) => holiday.date);
    const persistedRows: HolidayRecord[] = [];
    for (const holiday of parsed.holidays) {
      const existing = existingByDate.get(holiday.date);
      if (existing?.id) {
        if (typeof tx.businessHoliday.update === 'function') await tx.businessHoliday.update({
          where: { id: existing.id, tenantId: params.tenantId },
          data: {
            tenantId: params.tenantId,
            calendarId: id,
            date: parseDateOnly(holiday.date),
            name: holiday.name,
            description: holiday.description,
            isActive: true,
          },
        });
        persistedRows.push({ ...existing, date: parseDateOnly(holiday.date), name: holiday.name, description: holiday.description, isActive: true });
      } else {
        const createdHoliday = typeof tx.businessHoliday.create === 'function'
          ? await tx.businessHoliday.create({
            data: {
              tenantId: params.tenantId,
              calendarId: id,
              date: parseDateOnly(holiday.date),
              name: holiday.name,
              description: holiday.description,
              isActive: true,
            },
          })
          : undefined;
        persistedRows.push((createdHoliday ?? {
          tenantId: params.tenantId,
          calendarId: id,
          date: parseDateOnly(holiday.date),
          name: holiday.name,
          description: holiday.description,
          isActive: true,
        }) as unknown as HolidayRecord);
      }
    }
    if (typeof tx.businessHoliday.updateMany === 'function') {
      await tx.businessHoliday.updateMany({
        where: {
          tenantId: params.tenantId,
          calendarId: id,
          isActive: true,
          ...(nextDates.length > 0 ? { date: { notIn: nextDates.map((date) => parseDateOnly(date)) } } : {}),
        },
        data: { isActive: false },
      });
    }

    const changes = computeChanges(
      current as unknown as Record<string, unknown>,
      {
        name: parsed.name,
        jurisdictionCode: parsed.jurisdictionCode,
        timeZone: parsed.timeZone,
        weekendDays: parsed.weekendDays,
        isActive: parsed.isActive,
        revision: current.revision + 1,
        holidays: parsed.holidays,
      },
      ['name', 'jurisdictionCode', 'timeZone', 'weekendDays', 'isActive', 'revision', 'holidays'],
    );
    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      action: 'UPDATE',
      entityType: 'BusinessCalendar',
      entityId: id,
      entityName: parsed.name,
      summary: `Updated business calendar "${parsed.name}"`,
      changes: changes ?? undefined,
    }, tx);

    await enqueueScheduleReconciliation(tx, {
      tenantId: params.tenantId,
      scopeType: 'BUSINESS_CALENDAR',
      scopeId: id,
      triggerType: 'BUSINESS_CALENDAR_CHANGED',
      correlationId: `business-calendar:${id}:revision:${current.revision + 1}`,
      requestedById: params.userId,
    });

    if (updated === null) {
      throw new DeadlineApiError(ErrorCodes.VERSION_CONFLICT, 'Business calendar revision is stale', 409);
    }
    return toCalendarDto({
      ...(updated as unknown as CalendarRecord),
      revision: current.revision + 1,
      holidays: persistedRows,
    });
  }).catch((error) => {
    if (isPrismaCode(error, 'P2025')) {
      throw new DeadlineApiError(ErrorCodes.VERSION_CONFLICT, 'Business calendar revision is stale', 409);
    }
    if (isPrismaCode(error, 'P2002')) {
      throw new ConflictError('A business calendar with this name already exists');
    }
    throw error;
  });
}
