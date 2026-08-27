import { getCompanyDisplayLabel } from '@/lib/company-display-label';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { currentDateInSingapore, parseDateOnly, type DateOnly } from '@/services/service-schedule';
import type { ServiceRosterSearch } from '@/lib/validations/service-roster';
import { emptyServiceRosterResult } from '@/lib/validations/service-roster';
import type {
  ServiceRosterDb,
  ServiceRosterDeadline,
  ServiceRosterItem,
  ServiceRosterResult,
  ServiceRosterFamily,
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
  billingDisposition?: 'CONFIGURED' | 'NOT_REQUIRED' | 'UNREVIEWED';
  billingNotRequiredReason?: string | null;
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
  billingOccurrences?: Array<{
    status: 'OPEN' | 'BILLED' | 'WAIVED' | 'CANCELLED';
    operativeExpectedDate: Date | string;
  }>;
  billingCoverageIssues?: Array<{
    severity: 'ERROR' | 'WARNING';
    type: string;
    details?: unknown;
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

  const andFilters: Prisma.ClientServiceWhereInput[] = [];

  if (input.companyQuery) {
    andFilters.push({
      company: {
        ...companyRelation,
        OR: [
          { name: { contains: input.companyQuery, mode: 'insensitive' } },
          { displayAlias: { contains: input.companyQuery, mode: 'insensitive' } },
          { uen: { contains: input.companyQuery, mode: 'insensitive' } },
        ],
      },
    });
  }

  if (input.familyQuery) {
    andFilters.push({
      OR: [
        { familyName: { contains: input.familyQuery, mode: 'insensitive' } },
        {
          serviceVariant: {
            ...variantRelation,
            family: { tenantId, name: { contains: input.familyQuery, mode: 'insensitive' } },
          },
        },
      ],
    });
  }

  if (input.serviceQuery) {
    andFilters.push({
      OR: [
        { serviceName: { contains: input.serviceQuery, mode: 'insensitive' } },
        {
          serviceVariant: {
            ...variantRelation,
            OR: [
              { name: { contains: input.serviceQuery, mode: 'insensitive' } },
              { code: { contains: input.serviceQuery, mode: 'insensitive' } },
            ],
          },
        },
      ],
    });
  }

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
    andFilters.push({
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
    });
  }
  if (andFilters.length > 0) where.AND = andFilters;
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
      // The page-ID query below owns this ordering. Hydration only needs a
      // deterministic order because the IDs are reassembled in SQL order.
      return [{ id: 'asc' }];
    case 'startDate':
      return [{ startDate: direction }, { companyId: 'asc' }, { id: 'asc' }];
    case 'company':
    default:
      return [{ company: { name: direction } }, { companyId: 'asc' }, { id: 'asc' }];
  }
}

function nextDeadlinePageQuery(
  input: ServiceRosterSearch,
  tenantId: string,
  companyIds: string[] | undefined,
): Prisma.Sql {
  const companyScope = companyIds
    ? Prisma.sql`AND cs."company_id" IN (${Prisma.join(companyIds)})`
    : Prisma.empty;
  const deadlineCompanyScope = companyIds
    ? Prisma.sql`AND d."company_id" IN (${Prisma.join(companyIds)})`
    : Prisma.empty;
  const archivedFilter = input.archived
    ? Prisma.sql`AND cs."deleted_at" IS NOT NULL`
    : Prisma.sql`AND cs."deleted_at" IS NULL`;
  const statusFilter = input.statuses.length > 0
    ? Prisma.sql`AND cs."status"::text IN (${Prisma.join(input.statuses)})`
    : Prisma.empty;
  const familyFilter = input.familyIds.length > 0
    ? Prisma.sql`AND sv."family_id" IN (${Prisma.join(input.familyIds)})`
    : Prisma.empty;
  const variantFilter = input.variantId
    ? Prisma.sql`AND sv."id" = ${input.variantId}`
    : Prisma.empty;
  const searchFilter = input.query
    ? Prisma.sql`AND (
        cs."service_name" ILIKE '%' || ${input.query} || '%'
        OR cs."family_name" ILIKE '%' || ${input.query} || '%'
        OR c."name" ILIKE '%' || ${input.query} || '%'
        OR c."display_alias" ILIKE '%' || ${input.query} || '%'
        OR c."uen" ILIKE '%' || ${input.query} || '%'
        OR sv."name" ILIKE '%' || ${input.query} || '%'
        OR sv."code" ILIKE '%' || ${input.query} || '%'
        OR sf."name" ILIKE '%' || ${input.query} || '%'
      )`
    : Prisma.empty;
  const companyQueryFilter = input.companyQuery
    ? Prisma.sql`AND (
        c."name" ILIKE '%' || ${input.companyQuery} || '%'
        OR c."display_alias" ILIKE '%' || ${input.companyQuery} || '%'
        OR c."uen" ILIKE '%' || ${input.companyQuery} || '%'
      )`
    : Prisma.empty;
  const familyQueryFilter = input.familyQuery
    ? Prisma.sql`AND (
        cs."family_name" ILIKE '%' || ${input.familyQuery} || '%'
        OR sf."name" ILIKE '%' || ${input.familyQuery} || '%'
      )`
    : Prisma.empty;
  const serviceQueryFilter = input.serviceQuery
    ? Prisma.sql`AND (
        cs."service_name" ILIKE '%' || ${input.serviceQuery} || '%'
        OR sv."name" ILIKE '%' || ${input.serviceQuery} || '%'
        OR sv."code" ILIKE '%' || ${input.serviceQuery} || '%'
      )`
    : Prisma.empty;
  const applicabilityFilter = input.applicability
    ? Prisma.sql`AND EXISTS (
        SELECT 1
        FROM "client_service_deadline_rules" AS dr
        WHERE dr."client_service_id" = cs."id"
          AND dr."tenant_id" = ${tenantId}
          AND dr."enabled" = TRUE
          AND dr."applicability_state"::text = ${input.applicability}
      )`
    : Prisma.empty;
  const direction = input.sortOrder === 'desc'
    ? Prisma.sql`DESC`
    : Prisma.sql`ASC`;
  const skip = (input.page - 1) * input.limit;

  // Prisma's generated relation ordering cannot express MIN of a filtered
  // relation. This parameterized page-ID query keeps every tenant/company
  // predicate in SQL, orders by the minimum OPEN operative date, puts nulls
  // last in either direction, and uses the client-service ID as a tie-breaker.
  return Prisma.sql`
    SELECT cs."id"
    FROM "client_services" AS cs
    INNER JOIN "companies" AS c
      ON c."id" = cs."company_id"
      AND c."tenantId" = ${tenantId}
      AND c."deletedAt" IS NULL
    INNER JOIN "service_variants" AS sv
      ON sv."id" = cs."service_variant_id"
      AND sv."tenant_id" = ${tenantId}
    INNER JOIN "service_families" AS sf
      ON sf."id" = sv."family_id"
      AND sf."tenant_id" = ${tenantId}
    LEFT JOIN "deadline_occurrences" AS d
      ON d."client_service_id" = cs."id"
      AND d."tenant_id" = ${tenantId}
      AND d."company_id" = cs."company_id"
      AND d."status" = 'OPEN'
      ${deadlineCompanyScope}
    WHERE cs."tenant_id" = ${tenantId}
      ${companyScope}
      ${archivedFilter}
      ${statusFilter}
      ${familyFilter}
      ${variantFilter}
      ${searchFilter}
      ${companyQueryFilter}
      ${familyQueryFilter}
      ${serviceQueryFilter}
      ${applicabilityFilter}
    GROUP BY cs."id"
    ORDER BY
      CASE WHEN MIN(d."operative_due_date") IS NULL THEN 1 ELSE 0 END ASC,
      MIN(d."operative_due_date") ${direction},
      cs."id" ASC
    OFFSET ${skip}
    LIMIT ${input.limit}
  `;
}

async function nextDeadlinePageIds(
  db: ServiceRosterDb,
  input: ServiceRosterSearch,
  tenantId: string,
  companyIds: string[] | undefined,
): Promise<string[]> {
  if (typeof db.$queryRaw !== 'function') {
    throw new Error('Next-deadline roster ordering is unavailable');
  }
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    nextDeadlinePageQuery(input, tenantId, companyIds),
  );
  return rows.map((row) => row.id);
}

function includeForRoster(
  tenantId: string,
  companyIds: string[] | undefined,
  today: DateOnly = currentDateInSingapore(),
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
    billingOccurrences: {
      where: {
        tenantId,
        status: { in: ['OPEN', 'BILLED'] },
        operativeExpectedDate: { gte: parseDateOnly(today) },
      },
      orderBy: [{ operativeExpectedDate: 'asc' }, { id: 'asc' }],
      take: 1,
      select: { status: true, operativeExpectedDate: true },
    },
    billingCoverageIssues: {
      where: { tenantId, resolvedAt: null },
      orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'asc' }, { id: 'asc' }],
      take: 1,
      select: { severity: true, type: true, details: true },
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
    const leftDate = dateOnly(left.operativeDueDate) ?? '';
    const rightDate = dateOnly(right.operativeDueDate) ?? '';
    const dateResult = leftDate.localeCompare(rightDate);
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
  // ClientService stores the operational snapshot captured at activation.
  // Live catalog relations remain available under `family` and `variant`, but
  // must not rewrite the service that the client actually purchased.
  const familyName = record.familyName;
  const liveFamilyName = family.name ?? record.familyName;
  const cadence = record.serviceCadence;
  const customCadenceLabel = record.customCadenceLabel;
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
  const today = currentDateInSingapore();
  const nextBillingOccurrence = record.billingOccurrences?.find((candidate) => {
    if (candidate.status !== 'OPEN' && candidate.status !== 'BILLED') return false;
    const expectedDate = dateOnly(candidate.operativeExpectedDate);
    return Boolean(expectedDate && expectedDate >= today);
  });
  const nextBillingExpectedDate = nextBillingOccurrence ? dateOnly(nextBillingOccurrence.operativeExpectedDate) : null;
  const nextBilling = nextBillingOccurrence && nextBillingExpectedDate
    ? {
      status: nextBillingOccurrence.status,
      expectedDate: nextBillingExpectedDate,
      timingState: nextBillingOccurrence.status === 'OPEN'
        ? (nextBillingExpectedDate > today
          ? 'UPCOMING' as const
          : nextBillingExpectedDate === today
            ? 'DUE' as const
            : 'OVERDUE' as const)
        : null,
    }
    : null;
  const billingCoverageIssue = record.billingCoverageIssues?.[0]
    ? {
      severity: record.billingCoverageIssues[0].severity,
      type: record.billingCoverageIssues[0].type,
    }
    : null;

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
      name: liveFamilyName,
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
    billingDisposition: record.billingDisposition ?? 'UNREVIEWED',
    billingNotRequiredReason: record.billingNotRequiredReason ?? null,
    billingCoverageIssue,
    nextBilling,
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
  const today = currentDateInSingapore();
  if (companyIds?.length === 0) {
    return emptyResult(inputResult);
  }

  const where = queryWhere(inputResult, scope.tenantId, companyIds);
  if (inputResult.sortBy === 'nextDeadline') {
    const [pageIds, total] = await Promise.all([
      nextDeadlinePageIds(db, inputResult, scope.tenantId, companyIds),
      db.clientService.count({ where }),
    ]);

    if (pageIds.length === 0) {
      return {
        items: [],
        total,
        page: inputResult.page,
        limit: inputResult.limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / inputResult.limit),
      };
    }

    // Hydration remains access-scoped through the original predicate. The
    // page-ID order is restored after Prisma returns its deterministic ID
    // order; this is ordering, not a permission post-filter.
    const records = await db.clientService.findMany({
      where: { ...where, id: { in: pageIds } },
      include: includeForRoster(scope.tenantId, companyIds, today),
      orderBy: [{ id: 'asc' }],
      take: pageIds.length,
    });
    const recordsById = new Map(
      records.map((record) => {
        const typed = asRosterRecord(record);
        return [typed.id, record] as const;
      }),
    );

    return {
      items: pageIds
        .map((id) => recordsById.get(id))
        .filter((record): record is unknown => Boolean(record))
        .map(toServiceRosterItem),
      total,
      page: inputResult.page,
      limit: inputResult.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / inputResult.limit),
    };
  }

  const [records, total] = await Promise.all([
    db.clientService.findMany({
      where,
      include: includeForRoster(scope.tenantId, companyIds, today),
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

export async function listServiceRosterFamilies(
  scopeLike: ScopeLike,
  db: ServiceRosterDb = prisma as unknown as ServiceRosterDb,
): Promise<ServiceRosterFamily[]> {
  const scope = normalizeScope(scopeLike);
  if (scope.companyIds?.length === 0) return [];

  if (typeof db.$queryRaw !== 'function') {
    throw new Error('Service roster family facets are unavailable');
  }

  const companyScope = scope.companyIds
    ? Prisma.sql`AND cs."company_id" IN (${Prisma.join(scope.companyIds)})`
    : Prisma.empty;
  const rows = await db.$queryRaw<Array<{
    id: string;
    name: string;
    displayColor: string | null;
  }>>(Prisma.sql`
    SELECT sf."id", sf."name", sf."display_color" AS "displayColor"
    FROM "client_services" AS cs
    INNER JOIN "companies" AS c
      ON c."id" = cs."company_id"
      AND c."tenantId" = ${scope.tenantId}
      AND c."deletedAt" IS NULL
    INNER JOIN "service_variants" AS sv
      ON sv."id" = cs."service_variant_id"
      AND sv."tenant_id" = ${scope.tenantId}
    INNER JOIN "service_families" AS sf
      ON sf."id" = sv."family_id"
      AND sf."tenant_id" = ${scope.tenantId}
    WHERE cs."tenant_id" = ${scope.tenantId}
      ${companyScope}
    GROUP BY sf."id", sf."name", sf."display_color"
    ORDER BY LOWER(sf."name") ASC, sf."id" ASC
  `);

  return rows
    .filter((family) => Boolean(family.id && family.name))
    .map((family) => ({
      id: family.id,
      name: family.name,
      displayColor: family.displayColor ?? DEFAULT_FAMILY_COLOR,
    }));
}

export {
  aggregateApplicability,
  dateOnly as serviceRosterDateOnly,
  toServiceRosterItem,
};
