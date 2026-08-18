import { createAuditLog } from '@/lib/audit';
import { getCompanyDisplayLabel } from '@/lib/company-display-label';
import {
  DeadlineApiError,
  ErrorCodes,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import {
  deadlineSearchSchema,
  emptyDeadlineResult,
  resetDeadlineDateOverrideSchema,
  type DeadlineSearch,
  type DeadlineSearchInput,
  type ResetDeadlineDateOverrideInput,
  type UpdateDeadlineOccurrenceInput,
  updateDeadlineOccurrenceSchema,
} from '@/lib/validations/deadline';
import {
  compareDateOnly,
  currentDateInSingapore,
  formatDateOnly,
  parseDateOnly,
} from '@/services/service-schedule/date-only';
import type {
  DeadlineActor,
  DeadlineCalendarResult,
  DeadlineDb,
  DeadlineListResult,
  DeadlineOccurrenceDto,
  DeadlineScope,
  DeadlineTableResult,
  DeadlineTiming,
  ListDeadlinesOptions,
} from './types';

const CALENDAR_RESULT_CAP = 5_000;
const CALENDAR_QUERY_LIMIT = CALENDAR_RESULT_CAP + 1;

type DeadlineRecord = {
  id: string;
  tenantId: string;
  companyId: string;
  clientServiceId: string;
  cycleId: string;
  ruleVersionId: string;
  milestoneKey: string;
  scheduleEntryKey: string;
  deadlineType: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
  calculatedDueDate: Date | string;
  operativeDueDate: Date | string;
  dateOverridden: boolean;
  dateOverride: Date | string | null;
  dateOverrideReason: string | null;
  dateOverriddenById: string | null;
  dateOverriddenAt: Date | string | null;
  status: 'OPEN' | 'COMPLETED' | 'WAIVED' | 'CANCELLED';
  completedAt: Date | string | null;
  completedById: string | null;
  waivedAt: Date | string | null;
  waivedById: string | null;
  waiverReason: string | null;
  cancelledAt: Date | string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  notes?: string | null;
  origin: 'RULE' | 'MANUAL_TRIGGER';
  createdAt: Date | string;
  updatedAt: Date | string;
  company?: {
    id?: string;
    tenantId?: string;
    name?: string;
    displayAlias?: string | null;
    uen?: string | null;
  } | null;
  clientService?: {
    id?: string;
    tenantId?: string;
    serviceName?: string;
    familyName?: string;
    serviceVariant?: {
      id?: string;
      tenantId?: string;
      name?: string;
      family?: { id?: string; tenantId?: string; name?: string; displayColor?: string | null } | null;
    } | null;
  } | null;
  cycle?: {
    id?: string;
    tenantId?: string;
    periodKey?: string;
    periodStart?: Date | string;
    periodEnd?: Date | string;
  } | null;
  ruleVersion?: { tenantId?: string } | null;
};

type DeadlineDbRecord = DeadlineRecord & Record<string, unknown>;

function asRecord(value: unknown): DeadlineDbRecord {
  return value as DeadlineDbRecord;
}

function asDateOnly(value: Date | string): `${number}-${number}-${number}` {
  if (typeof value === 'string') {
    const candidate = value.slice(0, 10) as `${number}-${number}-${number}`;
    parseDateOnly(candidate);
    return candidate;
  }
  return formatDateOnly(value);
}

function asNullableDateOnly(value: Date | string | null | undefined): string | null {
  return value == null ? null : asDateOnly(value);
}

function asInstant(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateInput(value: `${number}-${number}-${number}`): Date {
  return parseDateOnly(value);
}

function familyFromRecord(record: DeadlineDbRecord) {
  const variant = record.clientService?.serviceVariant;
  const family = variant?.family;
  return {
    id: family?.id ?? null,
    name: family?.name ?? record.clientService?.familyName ?? '',
    displayColor: family?.displayColor ?? null,
  };
}

function tenantMatches(value: unknown, tenantId: string): boolean {
  if (value === null) return false;
  if (value === undefined) return true;
  if (typeof value !== 'object') return false;
  if (!Object.prototype.hasOwnProperty.call(value, 'tenantId')) return true;
  const relatedTenantId = (value as { tenantId?: unknown }).tenantId;
  return relatedTenantId === undefined || relatedTenantId === tenantId;
}

function hasTenantIntegrity(record: DeadlineDbRecord, tenantId: string): boolean {
  const variant = record.clientService?.serviceVariant;
  const family = variant?.family;
  return record.tenantId === tenantId
    && tenantMatches(record.company, tenantId)
    && tenantMatches(record.clientService, tenantId)
    && tenantMatches(variant, tenantId)
    && tenantMatches(family, tenantId)
    && tenantMatches(record.cycle, tenantId)
    && tenantMatches(record.ruleVersion, tenantId);
}

function toDeadlineDto(recordValue: unknown, today: `${number}-${number}-${number}` = currentDateInSingapore()): DeadlineOccurrenceDto {
  const record = asRecord(recordValue);
  const company = record.company ?? {};
  const clientService = record.clientService ?? {};
  const variant = clientService.serviceVariant ?? {};
  const companyName = company.name ?? '';
  const operativeDueDate = asDateOnly(record.operativeDueDate);
  const cycle = record.cycle;

  return {
    id: record.id,
    tenantId: record.tenantId,
    companyId: record.companyId,
    clientServiceId: record.clientServiceId,
    cycleId: record.cycleId,
    ruleVersionId: record.ruleVersionId,
    milestoneKey: record.milestoneKey,
    scheduleEntryKey: record.scheduleEntryKey ?? '',
    deadlineType: record.deadlineType,
    calculatedDueDate: asDateOnly(record.calculatedDueDate),
    operativeDueDate,
    dueDate: operativeDueDate,
    dateOverridden: record.dateOverridden,
    dateOverride: asNullableDateOnly(record.dateOverride),
    dateOverrideReason: record.dateOverrideReason,
    dateOverriddenById: record.dateOverriddenById,
    dateOverriddenAt: asInstant(record.dateOverriddenAt),
    status: record.status,
    timingState: deriveDeadlineTiming(record.status, operativeDueDate, today),
    completedAt: asInstant(record.completedAt),
    completedById: record.completedById,
    waivedAt: asInstant(record.waivedAt),
    waivedById: record.waivedById,
    waiverReason: record.waiverReason,
    cancelledAt: asInstant(record.cancelledAt),
    cancelledById: record.cancelledById,
    cancellationReason: record.cancellationReason,
    notes: record.notes ?? null,
    origin: record.origin,
    createdAt: asInstant(record.createdAt)!,
    updatedAt: asInstant(record.updatedAt)!,
    company: {
      id: company.id ?? record.companyId,
      name: companyName,
      displayAlias: company.displayAlias ?? null,
      displayLabel: getCompanyDisplayLabel({ name: companyName, displayAlias: company.displayAlias }),
      uen: company.uen ?? null,
    },
    family: familyFromRecord(record),
    service: {
      id: clientService.id ?? record.clientServiceId,
      name: clientService.serviceName ?? '',
      familyName: clientService.familyName ?? familyFromRecord(record).name,
      variantId: variant.id ?? null,
      variantName: variant.name ?? null,
    },
    cycle: cycle?.id
      ? {
          id: cycle.id,
          periodKey: cycle.periodKey ?? '',
          periodStart: cycle.periodStart == null ? '' : asDateOnly(cycle.periodStart),
          periodEnd: cycle.periodEnd == null ? '' : asDateOnly(cycle.periodEnd),
        }
      : null,
  };
}

/** Derive a presentation timing state from an open occurrence and Singapore date. */
export function deriveDeadlineTiming(
  status: string,
  dueDate: `${number}-${number}-${number}` | Date | string,
  today: `${number}-${number}-${number}` | Date | string = currentDateInSingapore(),
): DeadlineTiming | null {
  if (status !== 'OPEN') return null;
  const due = dueDate instanceof Date ? formatDateOnly(dueDate) : asDateOnly(dueDate);
  const current = today instanceof Date ? formatDateOnly(today) : asDateOnly(today);
  const comparison = compareDateOnly(due, current);
  if (comparison > 0) return 'UPCOMING';
  if (comparison === 0) return 'DUE';
  return 'OVERDUE';
}

function openStatusWhere(input: DeadlineSearch): Prisma.DeadlineOccurrenceWhereInput | null {
  if (!input.openOnly) {
    return input.statuses.length > 0 ? { status: { in: input.statuses } } : null;
  }
  if (input.statuses.length > 0 && !input.statuses.includes('OPEN')) return { id: '__no_open_deadlines__' };
  return { status: 'OPEN' };
}

function timingWhere(
  input: DeadlineSearch,
  today: `${number}-${number}-${number}`,
): Prisma.DeadlineOccurrenceWhereInput | null {
  if (input.timing.length === 0) return null;
  const todayDate = toDateInput(today);
  const predicates: Prisma.DeadlineOccurrenceWhereInput[] = [];
  for (const timing of input.timing) {
    if (timing === 'UPCOMING') predicates.push({ operativeDueDate: { gt: todayDate } });
    if (timing === 'DUE') predicates.push({ operativeDueDate: todayDate });
    if (timing === 'OVERDUE') predicates.push({ operativeDueDate: { lt: todayDate } });
  }
  return { status: 'OPEN', OR: predicates };
}

export function requestedDeadlineCompanyIds(
  input: Pick<DeadlineSearch, 'companyIds'>,
  scope: DeadlineScope,
): string[] | undefined {
  if (scope.companyIds === undefined) return input.companyIds.length > 0 ? [...input.companyIds] : undefined;
  if (input.companyIds.length === 0) return [...scope.companyIds];
  const accessible = new Set(scope.companyIds);
  return input.companyIds.filter((companyId) => accessible.has(companyId));
}

function occurrenceIntegrityWhere(
  id: string,
  tenantId: string,
  companyIds?: string[],
): Prisma.DeadlineOccurrenceWhereInput {
  return {
    id,
    tenantId,
    ...(companyIds === undefined ? {} : { companyId: { in: companyIds } }),
    company: { tenantId, deletedAt: null },
    clientService: {
      tenantId,
      serviceVariant: {
        tenantId,
        family: { tenantId },
      },
    },
    cycle: { tenantId },
    ruleVersion: { tenantId },
  };
}

/** Build the tenant/access/date predicate used by both count and row queries. */
export function deadlineWhereForSearch(
  input: DeadlineSearch,
  scope: DeadlineScope,
  today: `${number}-${number}-${number}` = currentDateInSingapore(),
): Prisma.DeadlineOccurrenceWhereInput {
  const companyIds = requestedDeadlineCompanyIds(input, scope);
  const where: Prisma.DeadlineOccurrenceWhereInput = {
    tenantId: scope.tenantId,
    company: { tenantId: scope.tenantId, deletedAt: null },
    operativeDueDate: {
      gte: toDateInput(input.from as `${number}-${number}-${number}`),
      lte: toDateInput(input.to as `${number}-${number}-${number}`),
    },
    ...(companyIds === undefined ? {} : { companyId: { in: companyIds } }),
    ...(input.types.length > 0 ? { deadlineType: { in: input.types } } : {}),
    clientService: {
      tenantId: scope.tenantId,
      serviceVariant: {
        tenantId: scope.tenantId,
        family: { tenantId: scope.tenantId },
        ...(input.familyIds.length > 0 ? { familyId: { in: input.familyIds } } : {}),
      },
    },
    cycle: { tenantId: scope.tenantId },
    ruleVersion: { tenantId: scope.tenantId },
    ...(input.origin ? { origin: input.origin } : {}),
  };

  const status = openStatusWhere(input);
  if (status) Object.assign(where, status);

  const timing = timingWhere(input, today);
  if (timing) {
    where.AND = Array.isArray(where.AND) ? [...where.AND, timing] : [timing];
  }
  return where;
}

function includeForDeadline(): Prisma.DeadlineOccurrenceInclude {
  return {
    company: { select: { id: true, tenantId: true, name: true, displayAlias: true, uen: true } },
    clientService: {
      select: {
        id: true,
        tenantId: true,
        serviceName: true,
        familyName: true,
        serviceVariant: {
          select: {
            id: true,
            tenantId: true,
            name: true,
            family: { select: { id: true, tenantId: true, name: true, displayColor: true } },
          },
        },
      },
    },
    cycle: { select: { id: true, tenantId: true, periodKey: true, periodStart: true, periodEnd: true } },
    ruleVersion: { select: { tenantId: true } },
  };
}

function orderByForDeadline(input: DeadlineSearch): Prisma.DeadlineOccurrenceOrderByWithRelationInput[] {
  const direction = input.sortOrder;
  switch (input.sortBy) {
    case 'company':
      return [{ company: { name: direction } }, { operativeDueDate: 'asc' }, { id: 'asc' }];
    case 'family':
      return [{ clientService: { familyName: direction } }, { operativeDueDate: 'asc' }, { id: 'asc' }];
    case 'service':
      return [{ clientService: { serviceName: direction } }, { operativeDueDate: 'asc' }, { id: 'asc' }];
    case 'type':
      return [{ deadlineType: direction }, { operativeDueDate: 'asc' }, { id: 'asc' }];
    case 'status':
      return [{ status: direction }, { operativeDueDate: 'asc' }, { id: 'asc' }];
    case 'dueDate':
    default:
      return [{ operativeDueDate: direction }, { id: 'asc' }];
  }
}

function toDb(db: DeadlineDb | typeof prisma): DeadlineDb {
  return db as unknown as DeadlineDb;
}

export async function listDeadlines(
  input: DeadlineSearchInput,
  scope: DeadlineScope,
  db: DeadlineDb | typeof prisma = prisma,
  options: ListDeadlinesOptions = {},
): Promise<DeadlineListResult> {
  const parsed = deadlineSearchSchema.parse(input);
  const companyIds = requestedDeadlineCompanyIds(parsed, scope);
  if (companyIds?.length === 0 || parsed.types.length === 0) {
    return emptyDeadlineResult(parsed);
  }

  const today = options.today ?? currentDateInSingapore();
  const where = deadlineWhereForSearch(parsed, scope, today);
  const orderBy = orderByForDeadline(parsed);
  const database = toDb(db);

  if (parsed.mode === 'CALENDAR') {
    const rows = await database.deadlineOccurrence.findMany({
      where,
      include: includeForDeadline(),
      orderBy,
      take: CALENDAR_QUERY_LIMIT,
    });
    const safeRows = rows.filter((row) => hasTenantIntegrity(asRecord(row), scope.tenantId));
    const truncated = safeRows.length > CALENDAR_RESULT_CAP;
    const result: DeadlineCalendarResult = {
      mode: 'CALENDAR',
      items: safeRows.slice(0, CALENDAR_RESULT_CAP).map((row) => toDeadlineDto(row, today)),
      truncated,
      ...(truncated ? { warning: `Calendar results are limited to ${CALENDAR_RESULT_CAP.toLocaleString()} occurrences` } : {}),
    };
    return result;
  }

  const [rows, total] = await Promise.all([
    database.deadlineOccurrence.findMany({
      where,
      include: includeForDeadline(),
      orderBy,
      skip: (parsed.page - 1) * parsed.limit,
      take: parsed.limit,
    }),
    database.deadlineOccurrence.count({ where }),
  ]);
  const result: DeadlineTableResult = {
    mode: 'TABLE',
    items: rows.filter((row) => hasTenantIntegrity(asRecord(row), scope.tenantId)).map((row) => toDeadlineDto(row, today)),
    total,
    page: parsed.page,
    limit: parsed.limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / parsed.limit),
  };
  return result;
}

export async function getDeadlineOccurrence(
  id: string,
  actor: DeadlineActor,
  db: DeadlineDb | typeof prisma = prisma,
): Promise<DeadlineOccurrenceDto> {
  const row = await toDb(db).deadlineOccurrence.findFirst({
    where: occurrenceIntegrityWhere(id, actor.tenantId, actor.companyIds),
    include: includeForDeadline(),
  });
  if (!row) throw new NotFoundError('Deadline occurrence not found');
  if (!hasTenantIntegrity(asRecord(row), actor.tenantId)) throw new NotFoundError('Deadline occurrence not found');
  return toDeadlineDto(row);
}

function assertMutationReason(
  current: DeadlineRecord,
  input: UpdateDeadlineOccurrenceInput,
  nextStatus: DeadlineRecord['status'],
): void {
  if (nextStatus !== current.status) {
    const allowed = current.status === 'OPEN'
      ? nextStatus === 'COMPLETED' || nextStatus === 'WAIVED'
      : (current.status === 'COMPLETED' || current.status === 'WAIVED') && nextStatus === 'OPEN';
    if (!allowed) {
      throw new ValidationError(`Cannot change a ${current.status.toLowerCase()} deadline directly to ${nextStatus.toLowerCase()}`);
    }
  }
  if ((current.status === 'COMPLETED' || current.status === 'WAIVED') && nextStatus === 'OPEN' && !input.reason) {
    throw new ValidationError('A reason is required when reopening a deadline');
  }
  if (input.status === 'WAIVED' && !input.reason && current.status !== 'WAIVED') {
    throw new ValidationError('A reason is required when waiving a deadline');
  }
  if (input.operativeDueDate !== undefined && !input.reason) {
    throw new ValidationError('A reason is required when overriding a due date');
  }
  if (input.completionDate !== undefined && nextStatus !== 'COMPLETED') {
    throw new ValidationError('A completion date can only be supplied for a completed deadline');
  }
}

function mutationDate(value: string | null | undefined): Date | null {
  return value == null ? null : parseDateOnly(value as `${number}-${number}-${number}`);
}

function buildMutationData(
  current: DeadlineRecord,
  input: UpdateDeadlineOccurrenceInput,
  actor: DeadlineActor,
): { data: Record<string, unknown>; next: DeadlineDbRecord } {
  const now = new Date();
  const nextStatus = input.status ?? current.status;
  assertMutationReason(current, input, nextStatus);

  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === 'OPEN') {
      data.completedAt = null;
      data.completedById = null;
      data.waivedAt = null;
      data.waivedById = null;
      data.waiverReason = null;
    } else if (input.status === 'COMPLETED') {
      data.completedAt = mutationDate(input.completionDate) ?? current.completedAt ?? now;
      data.completedById = actor.userId;
      data.waivedAt = null;
      data.waivedById = null;
      data.waiverReason = null;
    } else if (input.status === 'WAIVED') {
      data.waivedAt = now;
      data.waivedById = actor.userId;
      data.waiverReason = input.reason ?? current.waiverReason;
      data.completedAt = null;
      data.completedById = null;
    }
  } else if (input.completionDate !== undefined && current.status === 'COMPLETED') {
    data.completedAt = mutationDate(input.completionDate) ?? now;
    data.completedById = actor.userId;
  }

  if (input.operativeDueDate !== undefined) {
    const operativeDueDate = mutationDate(input.operativeDueDate)!;
    data.operativeDueDate = operativeDueDate;
    data.dateOverridden = true;
    data.dateOverride = operativeDueDate;
    data.dateOverrideReason = input.reason!;
    data.dateOverriddenById = actor.userId;
    data.dateOverriddenAt = now;
  }
  if (input.notes !== undefined) data.notes = input.notes;
  if (data.updatedAt === undefined) data.updatedAt = now;

  const next = { ...current, ...data } as DeadlineDbRecord;
  return { data, next };
}

async function findMutationRecord(
  id: string,
  actor: DeadlineActor,
  db: DeadlineDb | typeof prisma,
): Promise<DeadlineRecord> {
  const row = await toDb(db).deadlineOccurrence.findFirst({
    where: occurrenceIntegrityWhere(id, actor.tenantId, actor.companyIds),
    include: includeForDeadline(),
  });
  if (!row) throw new NotFoundError('Deadline occurrence not found');
  const record = asRecord(row);
  if (!hasTenantIntegrity(record, actor.tenantId)) throw new NotFoundError('Deadline occurrence not found');
  if (record.status === 'CANCELLED') {
    throw new DeadlineApiError(ErrorCodes.OCCURRENCE_IMMUTABLE, 'Cancelled deadline occurrences are immutable', 409);
  }
  return record;
}

async function updateWithAudit(
  current: DeadlineRecord,
  data: Record<string, unknown>,
  next: DeadlineDbRecord,
  input: UpdateDeadlineOccurrenceInput | ResetDeadlineDateOverrideInput,
  actor: DeadlineActor,
  db: DeadlineDb | typeof prisma,
): Promise<void> {
  const database = toDb(db);
  const where = {
    id: current.id,
    tenantId: actor.tenantId,
    updatedAt: new Date(input.expectedUpdatedAt),
    status: { not: 'CANCELLED' },
  };
  const execute = async (tx: DeadlineDb): Promise<void> => {
    const updated = await tx.deadlineOccurrence.updateMany({ where, data });
    if (updated.count === 0) {
      throw new DeadlineApiError(ErrorCodes.VERSION_CONFLICT, 'Deadline occurrence was changed by another user', 409);
    }
    await createAuditLog({
      tenantId: actor.tenantId,
      userId: actor.userId,
      companyId: current.companyId,
      action: 'UPDATE',
      entityType: 'DeadlineOccurrence',
      entityId: current.id,
      entityName: current.milestoneKey,
      reason: input.reason,
      summary: 'Updated service deadline occurrence',
      changes: deadlineAuditChanges(current, next),
      metadata: {
        reason: input.reason ?? null,
        notes: 'notes' in input ? input.notes ?? null : null,
        before: deadlineAuditState(current),
        after: deadlineAuditState(next),
      },
    }, tx as unknown as Prisma.TransactionClient);
  };

  if (typeof database.$transaction === 'function') {
    await database.$transaction(execute);
  } else {
    await execute(database);
  }
}

function deadlineAuditState(record: DeadlineRecord): Record<string, unknown> {
  return {
    status: record.status,
    calculatedDueDate: asDateOnly(record.calculatedDueDate),
    operativeDueDate: asDateOnly(record.operativeDueDate),
    dateOverridden: record.dateOverridden,
    dateOverride: asNullableDateOnly(record.dateOverride),
    dateOverrideReason: record.dateOverrideReason,
    dateOverriddenById: record.dateOverriddenById,
    dateOverriddenAt: asInstant(record.dateOverriddenAt),
    completedAt: asInstant(record.completedAt),
    completedById: record.completedById,
    waivedAt: asInstant(record.waivedAt),
    waivedById: record.waivedById,
    waiverReason: record.waiverReason,
    cancelledAt: asInstant(record.cancelledAt),
    cancelledById: record.cancelledById,
    cancellationReason: record.cancellationReason,
    notes: record.notes ?? null,
  };
}

function deadlineAuditChanges(current: DeadlineRecord, next: DeadlineRecord): Record<string, { old: unknown; new: unknown }> {
  const before = deadlineAuditState(current);
  const after = deadlineAuditState(next);
  return Object.fromEntries(Object.keys(before).map((key) => [key, { old: before[key], new: after[key] }])) as Record<string, { old: unknown; new: unknown }>;
}

export async function updateDeadlineOccurrence(
  id: string,
  rawInput: UpdateDeadlineOccurrenceInput,
  actor: DeadlineActor,
  db: DeadlineDb | typeof prisma = prisma,
): Promise<DeadlineOccurrenceDto> {
  const current = await findMutationRecord(id, actor, db);
  const input = updateDeadlineOccurrenceSchema.parse(rawInput);
  const { data, next } = buildMutationData(current, input, actor);
  await updateWithAudit(current, data, next, input, actor, db);
  return toDeadlineDto(next);
}

export async function resetDeadlineDateOverride(
  id: string,
  rawInput: ResetDeadlineDateOverrideInput,
  actor: DeadlineActor,
  db: DeadlineDb | typeof prisma = prisma,
): Promise<DeadlineOccurrenceDto> {
  const current = await findMutationRecord(id, actor, db);
  const input = resetDeadlineDateOverrideSchema.parse(rawInput);
  const data: Record<string, unknown> = {
    operativeDueDate: parseDateOnly(asDateOnly(current.calculatedDueDate)),
    dateOverridden: false,
    dateOverride: null,
    dateOverrideReason: null,
    dateOverriddenById: null,
    dateOverriddenAt: null,
    updatedAt: new Date(),
  };
  const next = { ...current, ...data } as DeadlineDbRecord;
  await updateWithAudit(current, data, next, input, actor, db);
  return toDeadlineDto(next);
}

export { toDeadlineDto };

// Compatibility aliases keep the service vocabulary discoverable to callers
// that use “search”/“reset override” terminology from the API contract.
export const searchDeadlines = listDeadlines;
export const getDeadline = getDeadlineOccurrence;
export const updateDeadline = updateDeadlineOccurrence;
export const resetDateOverride = resetDeadlineDateOverride;
