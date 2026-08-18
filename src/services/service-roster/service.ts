import { getCompanyDisplayLabel } from '@/lib/company-display-label';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import type { ServiceRosterSearch } from '@/lib/validations/service-roster';
import { emptyServiceRosterResult } from '@/lib/validations/service-roster';
import type {
  ServiceRosterDb,
  ServiceRosterDeadline,
  ServiceRosterItem,
  ServiceRosterResult,
  ServiceRosterScope,
  ServiceRosterWarningSummary,
} from './types';

const DEFAULT_FAMILY_COLOR = '#2F6F5E';

type ScopeLike = ServiceRosterScope | {
  tenantId: string;
  options?: { companyIds?: string[] };
  companyIds?: string[];
  allCompaniesAccess?: boolean;
};

type RosterRecord = {
  id: string;
  tenantId?: string;
  companyId: string;
  source: 'AGREEMENT' | 'MANUAL';
  agreementId?: string | null;
  agreementItemId?: string | null;
  serviceVariantId: string;
  familyName: string;
  serviceName: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  serviceCadence: ServiceRosterItem['cadence'];
  customCadenceLabel: string | null;
  startDate: Date | string;
  endDate: Date | string | null;
  updatedAt: Date | string;
  company?: {
    id?: string;
    tenantId?: string;
    name?: string;
    displayAlias?: string | null;
    uen?: string | null;
  } | null;
  serviceVariant?: {
    id?: string;
    code?: string;
    name?: string;
    version?: number;
    serviceCadence?: ServiceRosterItem['cadence'];
    customCadenceLabel?: string | null;
    family?: {
      id?: string;
      name?: string;
      displayColor?: string | null;
    } | null;
  } | null;
  deadlineRules?: Array<{
    enabled?: boolean;
    applicabilityState?: 'APPLICABLE' | 'NOT_APPLICABLE' | 'MISSING_INPUT';
    applicabilityReason?: string | null;
  }>;
  deadlineOccurrences?: Array<{
    id: string;
    milestoneKey: string;
    scheduleEntryKey?: string;
    deadlineType: 'STATUTORY' | 'CLIENT' | 'INTERNAL';
    calculatedDueDate: Date | string;
    operativeDueDate: Date | string;
    status: 'OPEN';
    origin: 'RULE' | 'MANUAL_TRIGGER';
  }>;
};

function asRosterRecord(value: unknown): RosterRecord {
  return value as RosterRecord;
}

function dateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1]!;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Prisma @db.Date values are normalized to UTC midnight. Reading UTC
  // components avoids browser/server-local timezone conversions.
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0'))
    .join('-');
}

function instant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeScope(scope: ScopeLike): { tenantId: string; companyIds?: string[] } {
  const companyIds = 'options' in scope
    ? scope.options?.companyIds
    : scope.companyIds;
  return { tenantId: scope.tenantId, companyIds };
}

function visibleCompanyIds(
  input: ServiceRosterSearch,
  scope: { companyIds?: string[] },
): string[] | undefined {
  if (scope.companyIds === undefined) return input.companyId ? [input.companyId] : undefined;
  if (input.companyId) return scope.companyIds.filter((id) => id === input.companyId);
  return scope.companyIds;
}

function queryWhere(
  input: ServiceRosterSearch,
  tenantId: string,
  companyIds: string[] | undefined,
): Prisma.ClientServiceWhereInput {
  const companyRelation: Prisma.CompanyWhereInput = {
    tenantId,
    deletedAt: null,
    ...(companyIds ? { id: { in: companyIds } } : {}),
  };
  const variantRelation: Prisma.ServiceVariantWhereInput = {
    tenantId,
    ...(input.variantId ? { id: input.variantId } : {}),
    ...(input.familyIds.length > 0 ? { familyId: { in: input.familyIds } } : {}),
    family: { tenantId },
  };

  const where: Prisma.ClientServiceWhereInput = {
    tenantId,
    ...(companyIds ? { companyId: { in: companyIds } } : {}),
    deletedAt: input.archived ? { not: null } : null,
    ...(input.statuses.length > 0 ? { status: { in: input.statuses } } : {}),
    company: companyRelation,
    serviceVariant: variantRelation,
    ...(input.applicability ? {
      deadlineRules: {
        some: {
          tenantId,
          enabled: true,
          applicabilityState: input.applicability,
        },
      },
    } : {}),
  };

  if (input.query) {
    where.AND = [{
      OR: [
        { serviceName: { contains: input.query, mode: 'insensitive' } },
        { familyName: { contains: input.query, mode: 'insensitive' } },
        {
          company: {
            ...companyRelation,
            AND: [{
              OR: [
                { name: { contains: input.query, mode: 'insensitive' } },
                { displayAlias: { contains: input.query, mode: 'insensitive' } },
                { uen: { contains: input.query, mode: 'insensitive' } },
              ],
            }],
          },
        },
        {
          serviceVariant: {
            ...variantRelation,
            AND: [{
              OR: [
                { name: { contains: input.query, mode: 'insensitive' } },
                { code: { contains: input.query, mode: 'insensitive' } },
                { family: { tenantId, name: { contains: input.query, mode: 'insensitive' } } },
              ],
            }],
          },
        },
      ],
    }];
  }
  return where;
}

function orderBy(input: ServiceRosterSearch): Prisma.ClientServiceOrderByWithRelationInput[] {
  const direction = input.sortOrder;
  switch (input.sortBy) {
    case 'family':
      return [{ familyName: direction }, { serviceName: direction }, { id: 'asc' }];
    case 'service':
      return [{ serviceName: direction }, { familyName: direction }, { id: 'asc' }];
    case 'status':
      return [{ status: direction }, { serviceName: 'asc' }, { id: 'asc' }];
    case 'nextDeadline':
      // Prisma cannot order a relation by its filtered minimum date through
      // the generated client. Keep this path deterministic; the relation is
      // still selected and ordered by operativeDueDate for the DTO.
      return [{ updatedAt: direction }, { id: 'asc' }];
    case 'startDate':
      return [{ startDate: direction }, { companyId: 'asc' }, { id: 'asc' }];
    case 'company':
    default:
      return [{ company: { name: direction } }, { companyId: 'asc' }, { id: 'asc' }];
  }
}

function includeForRoster(
  tenantId: string,
  companyIds: string[] | undefined,
): Prisma.ClientServiceInclude {
  return {
    company: {
      select: { id: true, name: true, displayAlias: true, uen: true },
    },
    serviceVariant: {
      select: {
        id: true,
        code: true,
        name: true,
        version: true,
        serviceCadence: true,
        customCadenceLabel: true,
        family: {
          select: { id: true, name: true, displayColor: true },
        },
      },
    },
    deadlineRules: {
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        enabled: true,
        applicabilityState: true,
        applicabilityReason: true,
      },
    },
    deadlineOccurrences: {
      where: {
        tenantId,
        ...(companyIds ? { companyId: { in: companyIds } } : {}),
        status: 'OPEN',
      },
      orderBy: [{ operativeDueDate: 'asc' }, { id: 'asc' }],
      take: 1,
      select: {
        id: true,
        milestoneKey: true,
        scheduleEntryKey: true,
        deadlineType: true,
        calculatedDueDate: true,
        operativeDueDate: true,
        status: true,
        origin: true,
      },
    },
  };
}

function aggregateApplicability(record: RosterRecord): ServiceRosterWarningSummary {
  const rules = (record.deadlineRules ?? []).filter((rule) => rule.enabled !== false);
  const applicableCount = rules.filter((rule) => rule.applicabilityState === 'APPLICABLE').length;
  const notApplicableCount = rules.filter((rule) => rule.applicabilityState === 'NOT_APPLICABLE').length;
  const missingInputCount = rules.filter((rule) => rule.applicabilityState === 'MISSING_INPUT').length;
  const reasons = [...new Set(
    rules
      .filter((rule) => rule.applicabilityState === 'MISSING_INPUT' || rule.applicabilityState === 'NOT_APPLICABLE')
      .map((rule) => rule.applicabilityReason?.trim())
      .filter((reason): reason is string => Boolean(reason)),
  )];

  let state: ServiceRosterWarningSummary['state'] = null;
  if (missingInputCount > 0) state = 'MISSING_INPUT';
  else if (applicableCount > 0 && notApplicableCount > 0) state = 'MIXED';
  else if (applicableCount > 0) state = 'APPLICABLE';
  else if (notApplicableCount > 0) state = 'NOT_APPLICABLE';

  return {
    state,
    applicabilityState: state,
    hasWarning: missingInputCount > 0,
    ruleCount: rules.length,
    applicableCount,
    notApplicableCount,
    missingInputCount,
    reasons,
  };
}

function earliestDeadline(record: RosterRecord): ServiceRosterDeadline | null {
  const open = (record.deadlineOccurrences ?? []).filter((deadline) => deadline.status === 'OPEN');
  const sorted = [...open].sort((left, right) => {
    const dateResult = dateOnly(left.operativeDueDate)!.localeCompare(dateOnly(right.operativeDueDate)!);
    return dateResult || left.id.localeCompare(right.id);
  });
  const deadline = sorted[0];
  if (!deadline) return null;
  const calculatedDueDate = dateOnly(deadline.calculatedDueDate);
  const operativeDueDate = dateOnly(deadline.operativeDueDate);
  if (!calculatedDueDate || !operativeDueDate) return null;
  return {
    id: deadline.id,
    milestoneKey: deadline.milestoneKey,
    scheduleEntryKey: deadline.scheduleEntryKey ?? '',
    deadlineType: deadline.deadlineType,
    calculatedDueDate,
    operativeDueDate,
    dueDate: operativeDueDate,
    status: 'OPEN',
    origin: deadline.origin,
  };
}

function toServiceRosterItem(value: unknown): ServiceRosterItem {
  const record = asRosterRecord(value);
  const company = record.company ?? {};
  const variant = record.serviceVariant ?? {};
  const family = variant.family ?? {};
  const companyName = company.name ?? '';
  const displayAlias = company.displayAlias ?? null;
  const familyId = family.id ?? variant.id ?? record.serviceVariantId;
  const familyName = family.name ?? record.familyName;
  const cadence = variant.serviceCadence ?? record.serviceCadence;
  const customCadenceLabel = variant.customCadenceLabel ?? record.customCadenceLabel;
  const applicability = aggregateApplicability(record);
  const warningReasons = [...new Set(
    (record.deadlineRules ?? [])
      .filter((rule) => rule.enabled !== false && rule.applicabilityState === 'MISSING_INPUT')
      .map((rule) => rule.applicabilityReason?.trim())
      .filter((reason): reason is string => Boolean(reason)),
  )];
  const ruleWarning: ServiceRosterWarningSummary = {
    ...applicability,
    reasons: warningReasons,
  };
  const serviceVariant = {
    id: variant.id ?? record.serviceVariantId,
    code: variant.code ?? null,
    name: variant.name ?? record.serviceName,
    version: variant.version ?? null,
    serviceCadence: variant.serviceCadence ?? null,
    customCadenceLabel: variant.customCadenceLabel ?? null,
  };
  const service = {
    id: record.id,
    name: record.serviceName,
    source: record.source,
    status: record.status,
    cadence,
    serviceCadence: cadence,
    customCadenceLabel,
    startDate: dateOnly(record.startDate) ?? '',
    endDate: dateOnly(record.endDate),
  };

  return {
    id: record.id,
    companyId: record.companyId,
    agreementId: record.agreementId ?? null,
    agreementItemId: record.agreementItemId ?? null,
    serviceVariantId: record.serviceVariantId,
    company: {
      id: company.id ?? record.companyId,
      name: companyName,
      displayAlias,
      displayLabel: getCompanyDisplayLabel({ name: companyName, displayAlias }),
      uen: company.uen ?? null,
    },
    family: {
      id: familyId,
      name: familyName,
      displayColor: family.displayColor ?? DEFAULT_FAMILY_COLOR,
    },
    familyName,
    familyDisplayColor: family.displayColor ?? DEFAULT_FAMILY_COLOR,
    variant: serviceVariant,
    serviceVariant,
    service,
    serviceName: record.serviceName,
    status: record.status,
    cadence,
    serviceCadence: cadence,
    customCadenceLabel,
    startDate: service.startDate,
    endDate: service.endDate,
    source: record.source,
    hasRuleWarning: ruleWarning.hasWarning,
    nextDeadline: earliestDeadline(record),
    applicability,
    applicabilityState: applicability.state,
    ruleWarning,
    warning: ruleWarning,
    updatedAt: instant(record.updatedAt),
  };
}

function emptyResult(input: ServiceRosterSearch): ServiceRosterResult {
  return emptyServiceRosterResult(input);
}

export async function listServiceRoster(
  input: ServiceRosterSearch,
  scopeLike: ScopeLike,
  db: ServiceRosterDb = prisma as unknown as ServiceRosterDb,
): Promise<ServiceRosterResult> {
  const inputResult = input;
  const scope = normalizeScope(scopeLike);
  const companyIds = visibleCompanyIds(inputResult, scope);
  if (companyIds?.length === 0 || inputResult.statuses.length === 0) {
    return emptyResult(inputResult);
  }

  const where = queryWhere(inputResult, scope.tenantId, companyIds);
  const [records, total] = await Promise.all([
    db.clientService.findMany({
      where,
      include: includeForRoster(scope.tenantId, companyIds),
      orderBy: orderBy(inputResult),
      skip: (inputResult.page - 1) * inputResult.limit,
      take: inputResult.limit,
    }),
    db.clientService.count({ where }),
  ]);

  return {
    items: records.map(toServiceRosterItem),
    total,
    page: inputResult.page,
    limit: inputResult.limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / inputResult.limit),
  };
}

export {
  aggregateApplicability,
  dateOnly as serviceRosterDateOnly,
  toServiceRosterItem,
};
