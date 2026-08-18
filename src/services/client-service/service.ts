import { computeChanges, createAuditLog } from '@/lib/audit';
import { ConflictError, DeadlineApiError, ErrorCodes, NotFoundError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import { clientServiceDeadlineImpactSchema, clientServiceDeadlineRulesSchema, type ClientServiceDeadlineRuleInput, type ClientServiceDeadlineScheduleSnapshot, type SearchClientServicesInput, type UpdateClientServiceInput } from '@/lib/validations/client-service';
import { Prisma } from '@/generated/prisma';
import type { ClientServiceDto, CompanyServiceActivationDto } from './types';
import { clientServiceInclude, dateOnly, toClientServiceDto, type ClientServiceRecord } from './mapper';
import { summarizeClientServiceFees } from './fee-summary';
import { enqueueScheduleReconciliation } from '@/services/schedule-reconciliation';
import {
  addMonthsClamped,
  currentDateInSingapore,
  evaluateApplicability,
  evaluateDeadlineRule,
  hashConfiguration,
  normalizeCompanyRuleSource,
  dateOnlySchema,
  parseDateOnly,
  type DeadlineRuleEvaluationInput,
  type DateOnly,
  type BusinessCalendarSnapshot,
} from '@/services/service-schedule';
import { planRollingPeriods, ROLLING_HORIZON_MONTHS, ROLLING_PLAN_VERSION, classifyDeadlineChange, type EvaluatedDeadlineForDiff, type StoredDeadline } from '@/services/schedule-reconciliation';

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type ClientServiceDeadlineRuleRecord = {
  id: string;
  ruleId: string;
  enabled: boolean;
  parameterValues: unknown;
  parameterProvenance: unknown;
  scheduleEntries: unknown;
  lastEvaluatedVersionId: string | null;
  applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'MISSING_INPUT';
  applicabilityReason: string | null;
  configHash: string | null;
  updatedAt: Date;
};

type DeadlineParameterDefinitionRecord = {
  key: string;
  label: string;
  type: 'DATE' | 'INTEGER' | 'DECIMAL' | 'STRING' | 'BOOLEAN' | 'ENUM';
  isRequired: boolean;
  validation: unknown;
};

type DeadlineRuleAssociationRecord = {
  ruleId: string;
  enabledByDefault?: boolean;
  parameterDefaults?: unknown;
  scheduleDefaults?: unknown;
  rule?: {
    id: string;
    tenantId?: string;
    isActive?: boolean;
    archivedAt?: Date | null;
    currentVersionId?: string | null;
    currentVersion?: {
      id: string;
      state?: 'PUBLISHED' | 'DRAFT';
      version?: number;
      configHash?: string;
      recurrence?: unknown;
      applicability?: unknown;
      parameterDefinitions?: DeadlineParameterDefinitionRecord[];
      milestoneTemplates?: Array<Record<string, unknown>>;
    } | null;
  } | null;
};

type ClientRuleConfigValidation = {
  normalized: ClientServiceDeadlineRuleInput[];
  states: Array<{
    applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'MISSING_INPUT';
    applicabilityReason: string | null;
    configHash: string;
    versionId: string | null;
  }>;
  associations: DeadlineRuleAssociationRecord[];
};

export type ClientServiceAccessParams = TenantAwareParams & {
  /** Company IDs resolved from the caller's role scope. An empty list denies all companies. */
  accessibleCompanyIds?: string[];
  /** Workspace-wide access is represented separately so the SQL predicate remains explicit. */
  allCompaniesAccess?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parameterOptions(definition: DeadlineParameterDefinitionRecord): string[] | undefined {
  if (!isRecord(definition.validation) || !Array.isArray(definition.validation.options)) return undefined;
  return definition.validation.options.filter((option): option is string => typeof option === 'string');
}

function parameterValueMatches(definition: DeadlineParameterDefinitionRecord, value: unknown): boolean {
  switch (definition.type) {
    case 'DATE': return typeof value === 'string' && dateOnlySchema.safeParse(value).success;
    case 'INTEGER': return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
    case 'DECIMAL': return typeof value === 'number' && Number.isFinite(value);
    case 'STRING': return typeof value === 'string';
    case 'BOOLEAN': return typeof value === 'boolean';
    case 'ENUM': return typeof value === 'string' && (parameterOptions(definition) ?? []).includes(value);
    default: return false;
  }
}

function normalizedProvenance(
  values: Record<string, unknown>,
  provenance: Record<string, 'COMPANY' | 'CATALOG_DEFAULT' | 'CLIENT_OVERRIDE'>,
): Record<string, 'COMPANY' | 'CATALOG_DEFAULT' | 'CLIENT_OVERRIDE'> {
  return Object.fromEntries(Object.keys(values).map((key) => [key, provenance[key] ?? 'CLIENT_OVERRIDE'])) as Record<string, 'COMPANY' | 'CATALOG_DEFAULT' | 'CLIENT_OVERRIDE'>;
}

function configurationState(
  rule: DeadlineRuleAssociationRecord['rule'],
  values: Record<string, unknown>,
  provenance: Record<string, 'COMPANY' | 'CATALOG_DEFAULT' | 'CLIENT_OVERRIDE'>,
  company: unknown,
): { applicabilityState: 'APPLICABLE' | 'NOT_APPLICABLE' | 'MISSING_INPUT'; applicabilityReason: string | null } {
  const version = rule?.currentVersion;
  const definitions = version?.parameterDefinitions ?? [];
  const missing = definitions
    .filter((definition) => definition.isRequired && !hasOwn(values, definition.key) && provenance[definition.key] !== 'COMPANY')
    .map((definition) => definition.key);
  if (missing.length > 0) {
    return {
      applicabilityState: 'MISSING_INPUT',
      applicabilityReason: `Missing required parameter${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    };
  }

  const applicability = version?.applicability;
  if (!isRecord(applicability) || typeof applicability.kind !== 'string') {
    return { applicabilityState: 'APPLICABLE', applicabilityReason: null };
  }
  try {
    const result = evaluateApplicability(applicability as never, normalizeCompanyRuleSource(company));
    return {
      applicabilityState: result.state,
      applicabilityReason: result.reason,
    };
  } catch {
    return {
      applicabilityState: 'MISSING_INPUT',
      applicabilityReason: 'Applicability inputs require reconciliation',
    };
  }
}

/**
 * Validate client-owned rule values against the associated published rule.
 * This deliberately runs before replacing configuration rows so a malformed
 * request cannot leave a service with a partial rule set.
 */
export async function validateClientServiceDeadlineRules(
  db: Prisma.TransactionClient | typeof prisma,
  service: { tenantId: string; serviceVariantId: string; companyId: string },
  rawRules: ClientServiceDeadlineRuleInput[],
  company?: unknown,
): Promise<ClientRuleConfigValidation> {
  const rules = clientServiceDeadlineRulesSchema.parse(rawRules);
  if (rules.length === 0) return { normalized: [], states: [], associations: [] };

  const associationsDelegate = db.serviceVariantDeadlineRule;
  if (!associationsDelegate || typeof associationsDelegate.findMany !== 'function') {
    throw new ValidationError('Deadline rule associations are unavailable');
  }
  const rawAssociations = await associationsDelegate.findMany({
    where: {
      tenantId: service.tenantId,
      serviceVariantId: service.serviceVariantId,
      ruleId: { in: rules.map((rule) => rule.ruleId) },
      archivedAt: null,
    },
    include: {
      rule: {
        include: {
          currentVersion: {
            include: { parameterDefinitions: true, milestoneTemplates: true },
          },
        },
      },
    },
  });
  const associations = (Array.isArray(rawAssociations) ? rawAssociations : []) as DeadlineRuleAssociationRecord[];
  const byRuleId = new Map(associations.map((association) => [association.ruleId, association]));
  if (rules.some((rule) => !byRuleId.has(rule.ruleId))) {
    throw new NotFoundError('One or more deadline rules are not associated with this service variant');
  }

  const normalized: ClientServiceDeadlineRuleInput[] = [];
  const states: ClientRuleConfigValidation['states'] = [];
  for (const input of rules) {
    const association = byRuleId.get(input.ruleId);
    const rule = association?.rule;
    const version = rule?.currentVersion;
    if (!association || !rule || rule.isActive === false || rule.archivedAt || !version || !rule.currentVersionId || (version.state && version.state !== 'PUBLISHED')) {
      throw new ValidationError(`Deadline rule ${input.ruleId} must have a usable published version`);
    }
    const values = input.parameterValues as Record<string, unknown>;
    const provenance = normalizedProvenance(values, input.parameterProvenance);
    const definitions = version.parameterDefinitions ?? [];
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
    for (const [key, value] of Object.entries(values)) {
      const definition = byKey.get(key);
      if (!definition) throw new ValidationError(`Unknown parameter "${key}" for deadline rule ${input.ruleId}`);
      if (!parameterValueMatches(definition, value)) {
        throw new ValidationError(`Parameter "${key}" does not match its ${definition.type} definition`);
      }
      const source = provenance[key];
      if (source === 'CATALOG_DEFAULT') {
        const defaults = isRecord(association.parameterDefaults) ? association.parameterDefaults : {};
        if (!hasOwn(defaults, key) || hashConfiguration(defaults[key]) !== hashConfiguration(value)) {
          throw new ValidationError(`Parameter "${key}" marked CATALOG_DEFAULT does not match its catalog default`);
        }
      }
    }
    const nextConfig = {
      ruleId: input.ruleId,
      enabled: input.enabled,
      parameterValues: values as ClientServiceDeadlineRuleInput['parameterValues'],
      parameterProvenance: provenance,
      scheduleEntries: input.scheduleEntries,
    };
    normalized.push(nextConfig);
    const state = configurationState(rule, values, provenance, company);
    states.push({
      ...state,
      configHash: hashConfiguration({ versionId: version.id, ...nextConfig }),
      versionId: version.id,
    });
  }
  // Prisma does not guarantee relation-array ordering. Keep every downstream
  // consumer aligned to the caller's canonical rule order.
  const orderedAssociations = rules.map((input) => byRuleId.get(input.ruleId)!).filter(Boolean);
  return { normalized, states, associations: orderedAssociations };
}

function ruleConfigurationInput(value: ClientServiceDeadlineRuleRecord | undefined): ClientServiceDeadlineRuleInput | null {
  if (!value) return null;
  const parsed = clientServiceDeadlineRulesSchema.safeParse([{
    ruleId: value.ruleId,
    enabled: value.enabled,
    parameterValues: isRecord(value.parameterValues) ? value.parameterValues : {},
    parameterProvenance: isRecord(value.parameterProvenance) ? value.parameterProvenance : {},
    scheduleEntries: Array.isArray(value.scheduleEntries) ? value.scheduleEntries : [],
  }]);
  return parsed.success ? parsed.data[0] ?? null : null;
}

export function canonicalDeadlineRuleAudit(validation: ClientRuleConfigValidation | undefined) {
  return {
    rules: (validation?.normalized ?? []).slice(0, 100).map((rule, index) => {
      const association = validation?.associations[index];
      const version = association?.rule?.currentVersion;
      const state = validation?.states[index];
      return {
        ruleId: rule.ruleId,
        enabled: rule.enabled,
        parameterValues: rule.parameterValues,
        parameterProvenance: rule.parameterProvenance,
        scheduleEntries: rule.scheduleEntries,
        publishedVersionId: state?.versionId ?? version?.id ?? null,
        publishedConfigHash: version?.configHash ?? null,
        configHash: state?.configHash ?? null,
        applicabilityState: state?.applicabilityState ?? null,
        applicabilityReason: state?.applicabilityReason ?? null,
      };
    }),
  };
}

export async function persistClientServiceDeadlineRules(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    clientServiceId: string;
    userId?: string;
  },
  validation: ClientRuleConfigValidation,
): Promise<void> {
  if (!tx.clientServiceDeadlineRule) throw new ValidationError('Deadline rule configuration is unavailable');
  await tx.clientServiceDeadlineRule.deleteMany({
    where: { tenantId: input.tenantId, clientServiceId: input.clientServiceId },
  });
  if (validation.normalized.length === 0) return;
  await tx.clientServiceDeadlineRule.createMany({
    data: validation.normalized.map((rule, index) => ({
      tenantId: input.tenantId,
      clientServiceId: input.clientServiceId,
      ruleId: rule.ruleId,
      enabled: rule.enabled,
      parameterValues: rule.parameterValues as Prisma.InputJsonValue,
      parameterProvenance: rule.parameterProvenance as Prisma.InputJsonValue,
      scheduleEntries: rule.scheduleEntries as Prisma.InputJsonValue,
      lastEvaluatedVersionId: validation.states[index]?.versionId ?? null,
      applicabilityState: validation.states[index]?.applicabilityState ?? 'MISSING_INPUT',
      applicabilityReason: validation.states[index]?.applicabilityReason ?? null,
      configHash: validation.states[index]?.configHash ?? null,
      updatedById: input.userId ?? null,
    })),
  });
}

async function loadCompanyRuleSource(
  db: Prisma.TransactionClient | typeof prisma,
  tenantId: string,
  companyId: string,
): Promise<Record<string, unknown>> {
  const companyDelegate = (db as unknown as { company?: { findFirst?: (args: unknown) => Promise<unknown> } }).company;
  if (!companyDelegate?.findFirst) return {};
  const company = await companyDelegate.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
    select: {
      entityType: true,
      status: true,
      primarySsicCode: true,
      secondarySsicCode: true,
      uen: true,
      name: true,
      financialYearEndDay: true,
      financialYearEndMonth: true,
      incorporationDate: true,
      registrationDate: true,
      nextAgmDueDate: true,
      nextArDueDate: true,
      accountsDueDate: true,
      hasCharges: true,
      currentOfficerCount: true,
      currentShareholderCount: true,
      annualReceiptsOrExpenditure: true,
      isGstRegistered: true,
      isRegisteredCharity: true,
      isIPC: true,
    },
  });
  return isRecord(company) ? company : {};
}

async function requireService(id: string, params: ClientServiceAccessParams, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const companyScope = params.allCompaniesAccess
    ? { tenantId: params.tenantId, deletedAt: null }
    : params.accessibleCompanyIds !== undefined
      ? { tenantId: params.tenantId, deletedAt: null, id: { in: params.accessibleCompanyIds } }
      : undefined;
  const service = await db.clientService.findFirst({
    where: {
      id,
      tenantId: params.tenantId,
      deletedAt: null,
      ...(companyScope ? { company: companyScope } : {}),
    },
    include: clientServiceInclude,
  });
  if (!service) throw new NotFoundError('Client service not found');
  return service;
}

export type ClientServiceDeadlineImpactAction = 'CREATE' | 'RECALCULATE' | 'CANCEL' | 'PRESERVE' | 'WARN';

export type ClientServiceDeadlineImpact = {
  clientServiceId: string;
  expectedUpdatedAt: string;
  scheduleSnapshot: ClientServiceDeadlineScheduleSnapshot;
  proposedConfigHash: string;
  previewFingerprint: string;
  counts: {
    created: number;
    recalculated: number;
    cancelled: number;
    preserved: number;
    inapplicable: number;
    missingInput: number;
    conflicts: number;
    warnings: number;
  };
  samples: Array<{
    ruleId: string;
    deadlineOccurrenceId: string | null;
    action: ClientServiceDeadlineImpactAction;
    oldDate: DateOnly | null;
    newDate: DateOnly | null;
    reason: string;
  }>;
  warnings: Array<{ ruleId: string; state: 'NOT_APPLICABLE' | 'MISSING_INPUT'; reason: string | null }>;
};

type PreviewCycle = {
  id: string;
  ruleId: string;
  periodKey: string;
  generationKey?: string;
  origin?: string;
  occurrences?: PreviewOccurrence[];
};

type PreviewOccurrence = {
  id: string;
  cycleId: string;
  milestoneKey: string;
  scheduleEntryKey: string;
  deadlineType: string;
  calculatedDueDate: Date | string;
  operativeDueDate: Date | string;
  dateOverridden: boolean;
  status: string;
  origin: string;
  ruleVersionId: string;
};

function previewDateOnly(value: unknown): DateOnly | null {
  try {
    if (value instanceof Date) return value.toISOString().slice(0, 10) as DateOnly;
    if (typeof value === 'string') {
      const date = value.slice(0, 10) as DateOnly;
      parseDateOnly(date);
      return date;
    }
  } catch {
    return null;
  }
  return null;
}

function previewMilestones(version: unknown): DeadlineRuleEvaluationInput['milestones'] {
  if (!Array.isArray(version)) return [];
  return version.map((milestone, index) => {
    const value = isRecord(milestone) ? milestone : {};
    return {
      key: typeof value.milestoneKey === 'string' ? value.milestoneKey : `milestone-${index + 1}`,
      name: typeof value.name === 'string' ? value.name : `Milestone ${index + 1}`,
      description: typeof value.description === 'string' ? value.description : null,
      type: (typeof value.type === 'string' ? value.type : 'CLIENT') as 'STATUTORY' | 'CLIENT' | 'INTERNAL',
      generationMode: (typeof value.generationMode === 'string' ? value.generationMode : 'ONCE_PER_CYCLE') as 'ONCE_PER_CYCLE' | 'ONCE_PER_SCHEDULE_ENTRY',
      expression: value.dateExpression as never,
      businessDayAdjustment: (typeof value.businessDayAdjustment === 'string' ? value.businessDayAdjustment : 'NONE') as 'NONE' | 'PREVIOUS' | 'NEXT',
      displayOrder: typeof value.displayOrder === 'number' ? value.displayOrder : index,
      isActive: value.isActive !== false,
    };
  });
}

function previewCalendar(value: unknown): BusinessCalendarSnapshot {
  const record = isRecord(value) ? value : {};
  const holidays = Array.isArray(record.holidays)
    ? record.holidays.map((holiday) => previewDateOnly(isRecord(holiday) ? holiday.date : holiday)).filter((date): date is DateOnly => date !== null)
    : [];
  const weekendDays = Array.isArray(record.weekendDays)
    ? record.weekendDays.filter((day): day is number => typeof day === 'number')
    : [0, 6];
  return {
    id: typeof record.id === 'string' ? record.id : 'default',
    timeZone: typeof record.timeZone === 'string' ? record.timeZone : 'Asia/Singapore',
    revision: typeof record.revision === 'number' ? record.revision : 1,
    weekendDays: new Set(weekendDays),
    holidays: new Set(holidays),
  };
}

function emptyImpactCounts(): ClientServiceDeadlineImpact['counts'] {
  return { created: 0, recalculated: 0, cancelled: 0, preserved: 0, inapplicable: 0, missingInput: 0, conflicts: 0, warnings: 0 };
}

function previewStoredDeadline(occurrence: PreviewOccurrence): StoredDeadline | null {
  const calculatedDueDate = previewDateOnly(occurrence.calculatedDueDate);
  const operativeDueDate = previewDateOnly(occurrence.operativeDueDate);
  if (!calculatedDueDate || !operativeDueDate) return null;
  return {
    id: occurrence.id,
    cycleId: occurrence.cycleId,
    milestoneKey: occurrence.milestoneKey,
    scheduleEntryKey: occurrence.scheduleEntryKey,
    deadlineType: occurrence.deadlineType,
    calculatedDueDate,
    operativeDueDate,
    dateOverridden: occurrence.dateOverridden,
    status: occurrence.status,
    origin: occurrence.origin,
    ruleVersionId: occurrence.ruleVersionId,
  };
}

/**
 * Run the same planner/evaluator/diff contracts used by reconciliation in
 * observe mode. This function has no writes and is also used by PATCH to
 * make a preview fingerprint a true compare-and-swap token.
 */
export async function previewClientServiceDeadlineConfiguration(
  id: string,
  rawInput: { expectedUpdatedAt: string; deadlineRules: ClientServiceDeadlineRuleInput[]; scheduleSnapshot: ClientServiceDeadlineScheduleSnapshot },
  params: ClientServiceAccessParams,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ClientServiceDeadlineImpact> {
  const input = clientServiceDeadlineImpactSchema.parse(rawInput);
  const service = await requireService(id, params, db);
  if (service.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new ConflictError('This service was updated by someone else. Reload it and try again.');
  }
  const company = await loadCompanyRuleSource(db, params.tenantId, service.companyId);
  const validation = await validateClientServiceDeadlineRules(
    db,
    { tenantId: params.tenantId, serviceVariantId: service.serviceVariantId, companyId: service.companyId },
    input.deadlineRules,
    company,
  );
  const today = currentDateInSingapore();
  const horizonEnd = addMonthsClamped(today, ROLLING_HORIZON_MONTHS);
  const counts = emptyImpactCounts();
  const samples: ClientServiceDeadlineImpact['samples'] = [];
  const warnings: ClientServiceDeadlineImpact['warnings'] = [];
  const identityStates: Array<Record<string, unknown>> = [];

  const serviceCycleDelegate = (db as unknown as { serviceCycle?: { findMany?: (args: unknown) => Promise<unknown> } }).serviceCycle;
  const rawCycles = serviceCycleDelegate?.findMany
    ? await serviceCycleDelegate.findMany({
      where: { tenantId: params.tenantId, clientServiceId: id },
      include: { occurrences: true },
      orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
    })
    : [];
  const cycles = (Array.isArray(rawCycles) ? rawCycles : []) as PreviewCycle[];
  const calendarDelegate = (db as unknown as { businessCalendar?: { findFirst?: (args: unknown) => Promise<unknown> } }).businessCalendar;
  const calendarRecord = calendarDelegate?.findFirst
    ? await calendarDelegate.findFirst({
      where: { tenantId: params.tenantId, isActive: true, archivedAt: null },
      include: { holidays: { where: { tenantId: params.tenantId, isActive: true } } },
    })
    : null;
  const calendar = previewCalendar(calendarRecord);
  const cyclesByKey = new Map(cycles.map((cycle) => [`${cycle.ruleId}|${cycle.periodKey}`, cycle]));
  const processedOccurrenceIds = new Set<string>();
  const skipCleanupRuleIds = new Set<string>();
  const skipCleanupCycleIds = new Set<string>();
  const serviceInactive = input.scheduleSnapshot.status === 'ENDED'
    || (input.scheduleSnapshot.endDate !== null && input.scheduleSnapshot.endDate < today);

  for (const [index, configuration] of validation.normalized.entries()) {
    if (serviceInactive) continue;
    const association = validation.associations[index];
    const version = association?.rule?.currentVersion;
    const state = validation.states[index];
    if (!association?.rule || !version || !state) continue;
    if (!configuration.enabled) {
      counts.inapplicable += 1;
      warnings.push({ ruleId: configuration.ruleId, state: 'NOT_APPLICABLE', reason: 'Rule is disabled for this client service' });
      continue;
    }
    if (state.applicabilityState === 'MISSING_INPUT' || state.applicabilityState === 'NOT_APPLICABLE') {
      counts[state.applicabilityState === 'MISSING_INPUT' ? 'missingInput' : 'inapplicable'] += 1;
      counts.warnings += 1;
      warnings.push({ ruleId: configuration.ruleId, state: state.applicabilityState, reason: state.applicabilityReason });
      if (state.applicabilityState === 'MISSING_INPUT') skipCleanupRuleIds.add(configuration.ruleId);
      continue;
    }

    let periods;
    try {
      periods = planRollingPeriods(version.recurrence as never, today, horizonEnd);
    } catch (error) {
      counts.warnings += 1;
      warnings.push({ ruleId: configuration.ruleId, state: 'MISSING_INPUT', reason: error instanceof Error ? error.message : 'Unable to plan rule periods' });
      skipCleanupRuleIds.add(configuration.ruleId);
      continue;
    }
    for (const period of periods) {
      const cycle = cyclesByKey.get(`${configuration.ruleId}|${period.periodKey}`);
      const cycleId = cycle?.id ?? `${id}|${configuration.ruleId}|${period.periodKey}|${ROLLING_PLAN_VERSION}`;
      let evaluation;
      try {
        evaluation = evaluateDeadlineRule({
          ruleId: configuration.ruleId,
          ruleVersionId: version.id,
          recurrence: version.recurrence as never,
          applicability: version.applicability as never,
          parameters: configuration.parameterValues as Record<string, unknown>,
          scheduleEntries: configuration.scheduleEntries as never,
          milestones: previewMilestones(version.milestoneTemplates),
          company: normalizeCompanyRuleSource(company, today),
          period: { key: period.periodKey, start: period.start, end: period.end },
          calendar,
        });
      } catch (error) {
        counts.missingInput += 1;
        counts.warnings += 1;
        warnings.push({ ruleId: configuration.ruleId, state: 'MISSING_INPUT', reason: error instanceof Error ? error.message : 'Rule evaluation requires input' });
        if (cycle) skipCleanupCycleIds.add(cycle.id);
        continue;
      }
      if (evaluation.applicability.state !== 'APPLICABLE') {
        counts[evaluation.applicability.state === 'MISSING_INPUT' ? 'missingInput' : 'inapplicable'] += 1;
        counts.warnings += evaluation.applicability.state === 'MISSING_INPUT' ? 1 : 0;
        warnings.push({ ruleId: configuration.ruleId, state: evaluation.applicability.state, reason: evaluation.applicability.reason });
        if (evaluation.applicability.state === 'MISSING_INPUT' && cycle) skipCleanupCycleIds.add(cycle.id);
        continue;
      }
      const existingOccurrences = cycle?.occurrences ?? [];
      const byOccurrenceKey = new Map(existingOccurrences.map((occurrence) => [`${occurrence.milestoneKey}|${occurrence.scheduleEntryKey}`, occurrence]));
      for (const occurrence of evaluation.occurrences) {
        const existing = byOccurrenceKey.get(`${occurrence.milestoneKey}|${occurrence.scheduleEntryKey}`);
        const stored = existing ? previewStoredDeadline(existing) : null;
        const proposed: EvaluatedDeadlineForDiff = {
          milestoneKey: occurrence.milestoneKey,
          scheduleEntryKey: occurrence.scheduleEntryKey,
          deadlineType: occurrence.type,
          dueDate: occurrence.calculatedDueDate,
          ruleVersionId: version.id,
          explanation: occurrence.explanation,
        };
        const decision = classifyDeadlineChange(stored, proposed, today);
        const action: ClientServiceDeadlineImpactAction = decision.action === 'CREATE'
          ? 'CREATE'
          : decision.action === 'RECALCULATE'
            ? 'RECALCULATE'
            : decision.action === 'PRESERVE' ? 'PRESERVE' : 'PRESERVE';
        if (action === 'CREATE') counts.created += 1;
        else if (action === 'RECALCULATE') counts.recalculated += 1;
        else counts.preserved += 1;
        if (existing) processedOccurrenceIds.add(existing.id);
        const sample = {
          ruleId: configuration.ruleId,
          deadlineOccurrenceId: existing?.id ?? null,
          action,
          oldDate: stored?.operativeDueDate ?? null,
          newDate: action === 'CREATE' || action === 'RECALCULATE' ? occurrence.calculatedDueDate : stored?.operativeDueDate ?? occurrence.calculatedDueDate,
          reason: decision.action === 'PRESERVE' ? decision.reason : action === 'CREATE' ? 'Occurrence is newly produced by the proposed rule' : 'Evaluated due date changed',
        };
        samples.push(sample);
        identityStates.push({ cycleId, milestoneKey: occurrence.milestoneKey, scheduleEntryKey: occurrence.scheduleEntryKey, ...sample });
      }
    }
  }

  for (const cycle of cycles) {
    if (skipCleanupRuleIds.has(cycle.ruleId) || skipCleanupCycleIds.has(cycle.id)) continue;
    for (const occurrence of cycle.occurrences ?? []) {
      if (processedOccurrenceIds.has(occurrence.id)) continue;
      const stored = previewStoredDeadline(occurrence);
      if (!stored) continue;
      const eligible = stored.origin === 'RULE' && stored.status === 'OPEN' && !stored.dateOverridden && stored.operativeDueDate >= today;
      if (eligible) {
        counts.cancelled += 1;
        const sample = {
          ruleId: cycle.ruleId,
          deadlineOccurrenceId: occurrence.id,
          action: 'CANCEL' as const,
          oldDate: stored.operativeDueDate,
          newDate: null,
          reason: 'Occurrence is no longer produced by the proposed rule',
        };
        samples.push(sample);
        identityStates.push({ cycleId: cycle.id, ...sample });
      } else {
        counts.preserved += 1;
        identityStates.push({ cycleId: cycle.id, occurrenceId: occurrence.id, action: 'PRESERVE', oldDate: stored.operativeDueDate, reason: 'Stored lifecycle state is immutable' });
      }
    }
  }

  const proposedConfigHash = hashConfiguration(validation.normalized.map((rule, index) => ({
    ...rule,
    versionId: validation.states[index]?.versionId ?? null,
    configHash: validation.states[index]?.configHash ?? null,
  })));
  const sortedStates = identityStates.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const previewFingerprint = hashConfiguration({
    tenantId: params.tenantId,
    clientServiceId: id,
    expectedUpdatedAt: input.expectedUpdatedAt,
    scheduleSnapshot: input.scheduleSnapshot,
    proposedConfigHash,
    rollingPlan: { version: ROLLING_PLAN_VERSION, today, horizonEnd },
    counts,
    states: sortedStates,
    warnings,
  });
  return {
    clientServiceId: id,
    expectedUpdatedAt: input.expectedUpdatedAt,
    scheduleSnapshot: input.scheduleSnapshot,
    proposedConfigHash,
    previewFingerprint,
    counts,
    samples: samples.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))).slice(0, 100),
    warnings,
  };
}

export async function listCompanyServices(
  companyId: string,
  input: SearchClientServicesInput,
  params: TenantAwareParams,
): Promise<{ services: ClientServiceDto[]; total: number; activations: CompanyServiceActivationDto[] }> {
  const where: Prisma.ClientServiceWhereInput = {
    tenantId: params.tenantId,
    companyId,
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.query ? { OR: [
      { serviceName: { contains: input.query, mode: 'insensitive' } },
      { familyName: { contains: input.query, mode: 'insensitive' } },
    ] } : {}),
  };
  const [services, total, agreements] = await Promise.all([
    prisma.clientService.findMany({ where, include: clientServiceInclude, orderBy: [{ status: 'asc' }, { serviceName: 'asc' }], skip: (input.page - 1) * input.limit, take: input.limit }),
    prisma.clientService.count({ where }),
    prisma.serviceAgreement.findMany({
      where: { tenantId: params.tenantId, entities: { some: { companyId } }, activationStatus: { in: ['PENDING', 'PROCESSING', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'] } },
      select: { id: true, activationStatus: true, activationLastError: true, generatedDocument: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  return { services: services.map(toClientServiceDto), total, activations: agreements.map((agreement) => ({ agreementId: agreement.id, title: agreement.generatedDocument.title, activationStatus: agreement.activationStatus, activationLastError: agreement.activationLastError, canRetry: false })) };
}

export async function getClientService(id: string, params: ClientServiceAccessParams): Promise<ClientServiceDto> {
  return toClientServiceDto(await requireService(id, params));
}

export async function updateClientService(id: string, input: UpdateClientServiceInput, params: ClientServiceAccessParams): Promise<ClientServiceDto> {
  const updated: ClientServiceRecord = await prisma.$transaction(async (tx): Promise<ClientServiceRecord> => {
    const current = await requireService(id, params, tx);
    if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ConflictError('This service was updated by someone else. Reload it and try again.');
    }
    const cadence = input.serviceCadence ?? current.serviceCadence;
    const customCadenceLabel = input.customCadenceLabel === undefined ? current.customCadenceLabel : input.customCadenceLabel;
    const startDate = parseDate(input.startDate) ?? current.startDate;
    const endDate = input.endDate === undefined ? current.endDate : parseDate(input.endDate);
    if (cadence === 'CUSTOM' && !customCadenceLabel?.trim()) throw new ValidationError('Custom cadence label is required');
    if (endDate && endDate < startDate) throw new ValidationError('End date must be on or after start date');

    const scalarChanges = computeChanges(
      {
        familyName: current.familyName,
        serviceName: current.serviceName,
        status: current.status,
        serviceCadence: current.serviceCadence,
        customCadenceLabel: current.customCadenceLabel,
        startDate: dateOnly(current.startDate),
        endDate: dateOnly(current.endDate),
      },
      {
        familyName: input.familyName,
        serviceName: input.serviceName,
        status: input.status,
        serviceCadence: input.serviceCadence,
        customCadenceLabel: input.customCadenceLabel,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      ['familyName', 'serviceName', 'status', 'serviceCadence', 'customCadenceLabel', 'startDate', 'endDate'],
    ) ?? {};
    const fieldValuesChanged = input.fieldValues !== undefined && !sameJson(current.fieldValues, input.fieldValues);
    const scheduleScalarChanged = [
      'status',
      'serviceCadence',
      'customCadenceLabel',
      'startDate',
      'endDate',
    ].some((field) => Object.prototype.hasOwnProperty.call(scalarChanges, field));
    const scheduleFieldsChanged = scheduleScalarChanged || fieldValuesChanged;
    let deadlineRuleValidation: ClientRuleConfigValidation | undefined;
    let currentDeadlineRuleValidation: ClientRuleConfigValidation | undefined;
    const currentRules = ((current as ClientServiceRecord & { deadlineRules?: ClientServiceDeadlineRuleRecord[] }).deadlineRules ?? [])
      .map(ruleConfigurationInput)
      .filter((rule): rule is ClientServiceDeadlineRuleInput => rule !== null);
    let deadlineRulesChanged = false;
    if (input.deadlineRules !== undefined || scheduleFieldsChanged) {
      const company = await loadCompanyRuleSource(tx, params.tenantId, current.companyId);
      if (currentRules.length > 0) {
        currentDeadlineRuleValidation = await validateClientServiceDeadlineRules(
          tx,
          { tenantId: params.tenantId, serviceVariantId: current.serviceVariantId, companyId: current.companyId },
          currentRules,
          company,
        );
      } else {
        currentDeadlineRuleValidation = { normalized: [], states: [], associations: [] };
      }
      if (input.deadlineRules !== undefined) {
        deadlineRuleValidation = await validateClientServiceDeadlineRules(
          tx,
          { tenantId: params.tenantId, serviceVariantId: current.serviceVariantId, companyId: current.companyId },
          input.deadlineRules,
          company,
        );
        deadlineRulesChanged = !sameJson(currentRules, deadlineRuleValidation.normalized);
      } else {
        deadlineRuleValidation = currentDeadlineRuleValidation;
      }
    }
    const feeSummaryBefore = summarizeClientServiceFees(current.feeLines);
    const feeSummaryAfter = input.feeLines ? summarizeClientServiceFees(input.feeLines) : feeSummaryBefore;
    const feesChanged = input.feeLines !== undefined && !sameJson(
      current.feeLines.map((fee) => ({ id: fee.id, description: fee.description, amount: fee.amount.toFixed(2), currency: fee.currency, billingFrequency: fee.billingFrequency, customFrequencyLabel: fee.customFrequencyLabel, billingStartDate: dateOnly(fee.billingStartDate), displayOrder: fee.displayOrder })),
      input.feeLines.map((fee) => ({ ...fee, customFrequencyLabel: fee.customFrequencyLabel ?? null, billingStartDate: fee.billingStartDate ?? null })),
    );
    if (Object.keys(scalarChanges).length === 0 && !fieldValuesChanged && !feesChanged && !deadlineRulesChanged) return current;

    const scheduleConfigurationChanged = scheduleFieldsChanged || deadlineRulesChanged;
    const proposedScheduleSnapshot: ClientServiceDeadlineScheduleSnapshot = {
      status: input.status ?? current.status,
      serviceCadence: input.serviceCadence ?? current.serviceCadence,
      customCadenceLabel,
      startDate: dateOnly(startDate)!,
      endDate: dateOnly(endDate ?? null),
      fieldValues: (input.fieldValues ?? current.fieldValues ?? {}) as Record<string, string>,
    };

    if (scheduleConfigurationChanged) {
      if (!input.impactFingerprint) {
        throw new ValidationError('Schedule-affecting changes require an impact preview fingerprint');
      }
      const impact = await previewClientServiceDeadlineConfiguration(id, {
        expectedUpdatedAt: input.expectedUpdatedAt,
        deadlineRules: deadlineRuleValidation?.normalized ?? currentDeadlineRuleValidation?.normalized ?? [],
        scheduleSnapshot: proposedScheduleSnapshot,
      }, params, tx);
      if (input.impactFingerprint !== impact.previewFingerprint) {
        throw new DeadlineApiError(
          ErrorCodes.IMPACT_CHANGED,
          'The deadline impact changed while you were editing. Preview the configuration again.',
          409,
          { expectedUpdatedAt: current.updatedAt.toISOString(), impact },
        );
      }
    }

    const claimed = await tx.clientService.updateMany({
      where: { id, tenantId: params.tenantId, deletedAt: null, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        familyName: input.familyName,
        serviceName: input.serviceName,
        status: input.status,
        serviceCadence: input.serviceCadence,
        customCadenceLabel: input.customCadenceLabel,
        startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : undefined,
        endDate: input.endDate === undefined ? undefined : parseDate(input.endDate),
        fieldValues: input.fieldValues,
        updatedAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new ConflictError('This service was updated by someone else. Reload it and try again.');

    if (input.feeLines && feesChanged) {
      await tx.clientServiceFeeLine.deleteMany({ where: { clientServiceId: id, tenantId: params.tenantId } });
      await tx.clientServiceFeeLine.createMany({ data: input.feeLines.map((fee) => ({
        id: fee.id,
        tenantId: params.tenantId,
        clientServiceId: id,
        sourceAgreementFeeLineId: current.feeLines.find((storedFee) => storedFee.id === fee.id)?.sourceAgreementFeeLineId ?? null,
        description: fee.description,
        amount: new Prisma.Decimal(fee.amount),
        currency: fee.currency,
        billingFrequency: fee.billingFrequency,
        customFrequencyLabel: fee.customFrequencyLabel ?? null,
        billingStartDate: parseDate(fee.billingStartDate) ?? null,
        displayOrder: fee.displayOrder,
      })) });
    }

    if (deadlineRulesChanged && deadlineRuleValidation) {
      await persistClientServiceDeadlineRules(tx, {
        tenantId: params.tenantId,
        clientServiceId: id,
        userId: params.userId,
      }, deadlineRuleValidation);
    }

    const result = await requireService(id, params, tx);
    const reconciliationCorrelationId = scheduleConfigurationChanged
      ? `client-service-update-${id}-${Date.now()}`
      : null;
    const changes = {
      ...scalarChanges,
      ...(fieldValuesChanged ? { fieldValues: { old: '[redacted]', new: '[redacted]' } } : {}),
      ...(feesChanged ? { feeLines: { old: feeSummaryBefore, new: feeSummaryAfter } } : {}),
      ...(scheduleConfigurationChanged ? {
        deadlineRules: {
          old: canonicalDeadlineRuleAudit(currentDeadlineRuleValidation),
          new: canonicalDeadlineRuleAudit(deadlineRuleValidation ?? currentDeadlineRuleValidation),
        },
      } : {}),
      ...(reconciliationCorrelationId ? { reconciliationCorrelationId: { old: null, new: reconciliationCorrelationId } } : {}),
    };
    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      companyId: current.companyId,
      entityType: 'ClientService',
      entityId: id,
      entityName: result.serviceName,
      action: 'UPDATE',
      changes,
      summary: `Updated operational service${feesChanged ? ` and ${input.feeLines?.length ?? 0} fee line(s)` : ''}`,
    }, tx);
    if (reconciliationCorrelationId) {
      await enqueueScheduleReconciliation(tx, {
        tenantId: params.tenantId,
        scopeType: 'CLIENT_SERVICE',
        scopeId: id,
        triggerType: 'CLIENT_SERVICE_CONFIGURATION_CHANGED',
        correlationId: reconciliationCorrelationId,
        requestedById: params.userId,
      });
    }
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return toClientServiceDto(updated);
}

export async function archiveClientService(id: string, reason: string, params: ClientServiceAccessParams): Promise<{ id: string; archived: true }> {
  await prisma.$transaction(async (tx) => {
    const current = await requireService(id, params, tx);
    const archived = await tx.clientService.updateMany({
      where: { id, tenantId: params.tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedReason: reason },
    });
    if (archived.count !== 1) throw new ConflictError('Client service changed while archiving');
    await enqueueScheduleReconciliation(tx, {
      tenantId: params.tenantId,
      scopeType: 'CLIENT_SERVICE',
      scopeId: id,
      triggerType: 'CLIENT_SERVICE_ARCHIVED',
      correlationId: `client-service-archive-${id}-${Date.now()}`,
      requestedById: params.userId,
    });
    await createAuditLog({ tenantId: params.tenantId, userId: params.userId, companyId: current.companyId, entityType: 'ClientService', entityId: id, entityName: current.serviceName, action: 'DELETE', reason, summary: 'Archived operational service' }, tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { id, archived: true };
}
