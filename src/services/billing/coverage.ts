import { hashConfiguration } from '@/services/service-schedule/hash';
import {
  formatDateOnly,
  parseDateOnly,
  type BusinessCalendarSnapshot,
  type DateOnly,
} from '@/services/service-schedule';
import { billingScheduleConfigSchema } from '@/lib/validations/billing';
import { prisma } from '@/lib/prisma';
import { getCompanyDisplayLabel } from '@/lib/company-display-label';
import type { Prisma } from '@/generated/prisma';
import { convertLegacyBillingSchedule, evaluateBillingSchedule } from './schedule';
import type { BillingScheduleConfigV1, EvaluatedBillingOccurrence } from './types';

export type BillingCoverageIssueType =
  | 'MISSING_DISPOSITION'
  | 'MISSING_FEE_LINES'
  | 'MISSING_START_DATE'
  | 'INVALID_CUSTOM_SCHEDULE'
  | 'MISSING_SCHEDULE_PARAMETER'
  | 'OCCURRENCE_GAP'
  | 'INVALID_AMOUNT_OR_CURRENCY';

export type BillingCoverageIssueSeverity = 'ERROR' | 'WARNING';

export type BillingCoverageIssueSummary = {
  issueKey: string;
  type: BillingCoverageIssueType;
  severity: BillingCoverageIssueSeverity;
  feeLineId: string | null;
  message: string;
};

export type BillingCoverageResult = {
  clientServiceId: string;
  opened: number;
  refreshed: number;
  resolved: number;
  openIssues: BillingCoverageIssueSummary[];
};

export type ReconcileBillingCoverageInput = {
  tenantId: string;
  clientServiceId: string;
  today: DateOnly;
  horizonEnd: DateOnly;
  writeMode: 'OBSERVE' | 'APPLY';
};

export type BillingCoverageListInput = {
  tenantId: string;
  companyIds?: readonly string[];
  types?: readonly BillingCoverageIssueType[];
  severities?: readonly BillingCoverageIssueSeverity[];
};

export type BillingCoverageSummary = {
  openIssueCount: number;
  affectedServiceCount: number;
  healthyActiveServiceCount: number;
  issues: Array<{
    id: string;
    type: BillingCoverageIssueType;
    severity: BillingCoverageIssueSeverity;
    company: { id: string; name: string; displayLabel: string };
    service: { id: string; name: string; familyName: string; familyColor: string };
    feeLine: { id: string; description: string } | null;
    message: string;
  }>;
};

type CoverageDb = Prisma.TransactionClient | typeof prisma;

type CoverageFeeLine = {
  id: string;
  description?: string | null;
  amount?: unknown;
  currency?: string | null;
  billingFrequency?: string | null;
  customFrequencyLabel?: string | null;
  billingStartDate?: Date | string | null;
  scheduleConfig?: unknown;
  isActive?: boolean;
  deletedAt?: Date | string | null;
};

type CoverageService = {
  id: string;
  tenantId: string;
  companyId: string;
  status?: string | null;
  deletedAt?: Date | string | null;
  billingDisposition?: string | null;
  billingNotRequiredReason?: string | null;
  feeLines?: CoverageFeeLine[];
};

type CoverageIssueRecord = {
  id?: string;
  issueKey: string;
  type: BillingCoverageIssueType | string;
  severity: BillingCoverageIssueSeverity | string;
  feeLineId?: string | null;
  details?: unknown;
  company?: { id?: string; tenantId?: string; name?: string | null; displayAlias?: string | null } | null;
  clientService?: {
    id?: string;
    tenantId?: string;
    serviceName?: string | null;
    familyName?: string | null;
    serviceVariant?: {
      id?: string;
      family?: { id?: string; name?: string | null; displayColor?: string | null } | null;
    } | null;
  } | null;
  feeLine?: { id?: string; description?: string | null } | null;
};

type CoverageOccurrence = {
  feeLineId: string;
  billingPeriodKey: string;
  scheduleEntryKey: string;
  generationKey: string;
  status?: string;
};

type CoverageIssueDelegate = {
  findMany?: (args: unknown) => Promise<unknown>;
  create?: (args: unknown) => Promise<unknown>;
  update?: (args: unknown) => Promise<unknown>;
  updateMany?: (args: unknown) => Promise<{ count: number }>;
};

type CoverageOccurrenceDelegate = {
  findMany?: (args: unknown) => Promise<unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asCoverageDb(db: CoverageDb): CoverageDb & {
  billingCoverageIssue?: CoverageIssueDelegate;
  billingOccurrence?: CoverageOccurrenceDelegate;
  clientService?: { findFirst?: (args: unknown) => Promise<unknown> };
  businessCalendar?: { findFirst?: (args: unknown) => Promise<unknown> };
} {
  return db as CoverageDb & {
    billingCoverageIssue?: CoverageIssueDelegate;
    billingOccurrence?: CoverageOccurrenceDelegate;
    clientService?: { findFirst?: (args: unknown) => Promise<unknown> };
    businessCalendar?: { findFirst?: (args: unknown) => Promise<unknown> };
  };
}

function dateOnly(value: unknown): DateOnly | null {
  try {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateOnly(value);
    if (typeof value === 'string') {
      const candidate = value.slice(0, 10) as DateOnly;
      parseDateOnly(candidate);
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function amountString(value: unknown): string {
  if (value && typeof value === 'object' && 'toFixed' in value && typeof value.toFixed === 'function') {
    return value.toFixed(2);
  }
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function validAmount(value: unknown): boolean {
  const normalized = amountString(value);
  if (!normalized || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return false;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0;
}

function validCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

function feeLineIsActive(line: CoverageFeeLine): boolean {
  return line.isActive !== false && line.deletedAt == null;
}

function serviceIsActive(service: CoverageService): boolean {
  return service.status === 'ACTIVE' && service.deletedAt == null;
}

function issueMessage(type: BillingCoverageIssueType, feeLineId: string | null, details: Record<string, unknown>): string {
  switch (type) {
    case 'MISSING_DISPOSITION': return 'Review the billing disposition for this service';
    case 'MISSING_FEE_LINES': return 'Configured billing requires at least one active fee line';
    case 'MISSING_START_DATE': return `Set a billing start date${feeLineId ? ' for this fee line' : ''}`;
    case 'INVALID_CUSTOM_SCHEDULE': return 'Review the custom billing schedule definition';
    case 'MISSING_SCHEDULE_PARAMETER': return 'Complete the billing schedule parameters';
    case 'OCCURRENCE_GAP': return `Expected billing occurrences are missing (${String(details.missingCount ?? 0)})`;
    case 'INVALID_AMOUNT_OR_CURRENCY': return 'Set a non-negative amount and a three-letter ISO currency code';
  }
}

function issueSeverity(type: BillingCoverageIssueType): BillingCoverageIssueSeverity {
  return type === 'OCCURRENCE_GAP' ? 'WARNING' : 'ERROR';
}

/** Build the deterministic SHA-256 identity for one coverage issue. */
export function billingCoverageIssueKey(input: {
  tenantId: string;
  clientServiceId: string;
  feeLineId: string | null;
  type: BillingCoverageIssueType;
  scheduleKey: string;
}): string {
  return hashConfiguration({
    tenantId: input.tenantId,
    clientServiceId: input.clientServiceId,
    feeLineId: input.feeLineId,
    type: input.type,
    scheduleKey: input.scheduleKey,
  });
}

function calendarFromRecord(record: unknown): BusinessCalendarSnapshot {
  const value = asRecord(record);
  const holidays = Array.isArray(value.holidays)
    ? value.holidays.map((holiday) => dateOnly(asRecord(holiday).date ?? holiday)).filter((date): date is DateOnly => date !== null)
    : [];
  const weekendDays = Array.isArray(value.weekendDays)
    ? value.weekendDays.filter((day): day is number => typeof day === 'number')
    : [0, 6];
  return {
    id: typeof value.id === 'string' ? value.id : 'default',
    timeZone: typeof value.timeZone === 'string' ? value.timeZone : 'Asia/Singapore',
    revision: typeof value.revision === 'number' ? value.revision : 1,
    weekendDays: new Set(weekendDays),
    holidays: new Set(holidays),
  };
}

async function loadCalendar(db: CoverageDb, tenantId: string): Promise<BusinessCalendarSnapshot> {
  const delegate = asCoverageDb(db).businessCalendar;
  if (!delegate?.findFirst) return calendarFromRecord(null);
  const record = await delegate.findFirst({
    where: { tenantId, isActive: true, archivedAt: null },
    include: { holidays: { where: { tenantId, isActive: true } } },
  });
  return calendarFromRecord(record);
}

async function loadOpenIssues(db: CoverageDb, tenantId: string, clientServiceId: string): Promise<CoverageIssueRecord[]> {
  const delegate = asCoverageDb(db).billingCoverageIssue;
  if (!delegate?.findMany) return [];
  const rows = await delegate.findMany({
    where: { tenantId, clientServiceId, resolvedAt: null },
    orderBy: [{ lastDetectedAt: 'desc' }, { id: 'asc' }],
  });
  return (Array.isArray(rows) ? rows : []) as CoverageIssueRecord[];
}

async function loadOpenOccurrences(db: CoverageDb, tenantId: string, clientServiceId: string): Promise<CoverageOccurrence[]> {
  const rows = await loadOccurrences(db, tenantId, clientServiceId);
  return rows.filter((row) => row.status === 'OPEN');
}

async function loadOccurrences(db: CoverageDb, tenantId: string, clientServiceId: string): Promise<CoverageOccurrence[]> {
  const delegate = asCoverageDb(db).billingOccurrence;
  if (!delegate?.findMany) return [];
  const rows = await delegate.findMany({
    where: { tenantId, clientServiceId },
    select: { feeLineId: true, billingPeriodKey: true, scheduleEntryKey: true, generationKey: true, status: true },
  });
  return (Array.isArray(rows) ? rows : []) as CoverageOccurrence[];
}

function issueSummary(issue: BillingCoverageIssueSummary | CoverageIssueRecord): BillingCoverageIssueSummary {
  if ('message' in issue) return issue;
  const details = asRecord(issue.details);
  return {
    issueKey: issue.issueKey,
    type: issue.type as BillingCoverageIssueType,
    severity: issue.severity as BillingCoverageIssueSeverity,
    feeLineId: issue.feeLineId ?? null,
    message: typeof details.message === 'string'
      ? details.message
      : issueMessage(issue.type as BillingCoverageIssueType, issue.feeLineId ?? null, details),
  };
}

function expectedIdentity(value: Pick<EvaluatedBillingOccurrence, 'feeLineId' | 'billingPeriodKey' | 'scheduleEntryKey' | 'generationKey'>): string {
  return [value.feeLineId, value.billingPeriodKey, value.scheduleEntryKey, value.generationKey].join('|');
}

function occurrenceIdentity(value: CoverageOccurrence): string {
  return [value.feeLineId, value.billingPeriodKey, value.scheduleEntryKey, value.generationKey].join('|');
}

function scheduleConfigFor(line: CoverageFeeLine): { config: BillingScheduleConfigV1 | null; issueType: BillingCoverageIssueType | null } {
  if (line.scheduleConfig !== null && line.scheduleConfig !== undefined) {
    try {
      const config = billingScheduleConfigSchema.parse(line.scheduleConfig) as BillingScheduleConfigV1;
      if (!config.startDate) return { config, issueType: 'MISSING_START_DATE' };
      if (config.cadence === 'CUSTOM' && !config.customInterval) return { config, issueType: 'MISSING_SCHEDULE_PARAMETER' };
      if (config.scheduleEntries.length === 0) return { config, issueType: 'MISSING_SCHEDULE_PARAMETER' };
      return { config, issueType: null };
    } catch {
      const cadence = asRecord(line.scheduleConfig).cadence;
      return { config: null, issueType: cadence === 'CUSTOM' ? 'INVALID_CUSTOM_SCHEDULE' : 'MISSING_SCHEDULE_PARAMETER' };
    }
  }

  if (!line.billingFrequency) return { config: null, issueType: 'MISSING_SCHEDULE_PARAMETER' };
  const conversion = convertLegacyBillingSchedule({
    billingFrequency: line.billingFrequency as never,
    billingStartDate: line.billingStartDate ?? null,
    customFrequencyLabel: line.customFrequencyLabel ?? null,
  });
  if (!conversion.config) {
    return { config: null, issueType: conversion.issueType === 'INVALID_CUSTOM_SCHEDULE' ? 'INVALID_CUSTOM_SCHEDULE' : 'MISSING_SCHEDULE_PARAMETER' };
  }
  if (!conversion.config.startDate) return { config: conversion.config, issueType: 'MISSING_START_DATE' };
  if (conversion.config.scheduleEntries.length === 0) return { config: conversion.config, issueType: 'MISSING_SCHEDULE_PARAMETER' };
  return { config: conversion.config, issueType: null };
}

function buildIssue(
  input: ReconcileBillingCoverageInput,
  type: BillingCoverageIssueType,
  feeLineId: string | null,
  scheduleKey: string,
  details: Record<string, unknown> = {},
): BillingCoverageIssueSummary {
  const issueDetails = { ...details, message: issueMessage(type, feeLineId, details), scheduleKey };
  return {
    issueKey: billingCoverageIssueKey({
      tenantId: input.tenantId,
      clientServiceId: input.clientServiceId,
      feeLineId,
      type,
      scheduleKey,
    }),
    type,
    severity: issueSeverity(type),
    feeLineId,
    message: issueDetails.message,
  };
}

function detailsForIssue(
  issue: BillingCoverageIssueSummary,
  input: ReconcileBillingCoverageInput,
): Record<string, unknown> {
  return {
    message: issue.message,
    detectedOn: input.today,
    issueType: issue.type,
    feeLineId: issue.feeLineId,
  };
}

async function persistIssues(
  db: CoverageDb,
  input: ReconcileBillingCoverageInput,
  companyId: string,
  issues: BillingCoverageIssueSummary[],
  existing: CoverageIssueRecord[],
): Promise<Pick<BillingCoverageResult, 'opened' | 'refreshed' | 'resolved'>> {
  const delegate = asCoverageDb(db).billingCoverageIssue;
  const existingByKey = new Map(existing.map((issue) => [issue.issueKey, issue]));
  const detectedKeys = issues.map((issue) => issue.issueKey);
  const now = new Date();
  let opened = 0;
  let refreshed = 0;
  for (const issue of issues) {
    const current = existingByKey.get(issue.issueKey);
    if (current?.id && delegate?.update) {
      await delegate.update({
        where: {
          id: current.id,
          tenantId: input.tenantId,
          clientServiceId: input.clientServiceId,
          resolvedAt: null,
        },
        data: {
          type: issue.type,
          severity: issue.severity,
          feeLineId: issue.feeLineId,
          details: detailsForIssue(issue, input),
          lastDetectedAt: now,
          resolvedAt: null,
        },
      });
      refreshed += 1;
    } else if (delegate?.create) {
      await delegate.create({
        data: {
          tenantId: input.tenantId,
          companyId,
          clientServiceId: input.clientServiceId,
          feeLineId: issue.feeLineId,
          type: issue.type,
          severity: issue.severity,
          issueKey: issue.issueKey,
          details: detailsForIssue(issue, input),
          firstDetectedAt: now,
          lastDetectedAt: now,
          resolvedAt: null,
        },
      });
      opened += 1;
    } else {
      opened += 1;
    }
  }

  let resolved = existing.filter((issue) => !detectedKeys.includes(issue.issueKey)).length;
  if (delegate?.updateMany) {
    const result = await delegate.updateMany({
      where: {
        tenantId: input.tenantId,
        clientServiceId: input.clientServiceId,
        resolvedAt: null,
        issueKey: { notIn: detectedKeys },
      },
      data: { resolvedAt: now },
    });
    resolved = result?.count ?? resolved;
  }
  return { opened, refreshed, resolved };
}

/** Materialize billing configuration issues for one client service. */
export async function reconcileBillingCoverage(
  input: ReconcileBillingCoverageInput,
  db: CoverageDb = prisma,
): Promise<BillingCoverageResult> {
  parseDateOnly(input.today);
  parseDateOnly(input.horizonEnd);
  const result: BillingCoverageResult = {
    clientServiceId: input.clientServiceId,
    opened: 0,
    refreshed: 0,
    resolved: 0,
    openIssues: [],
  };
  const database = asCoverageDb(db);
  const serviceRecord = await database.clientService?.findFirst?.({
    where: { id: input.clientServiceId, tenantId: input.tenantId },
    include: { feeLines: true },
  });
  const service = serviceRecord as CoverageService | null | undefined;
  if (!service) return result;

  const existing = await loadOpenIssues(db, input.tenantId, input.clientServiceId);
  if (service.status === 'PAUSED') {
    result.openIssues = existing.map(issueSummary);
    return result;
  }

  const openOccurrences = serviceIsActive(service)
    ? []
    : await loadOpenOccurrences(db, input.tenantId, input.clientServiceId);
  if (!serviceIsActive(service)) {
    const issues = existing.map(issueSummary);
    if (openOccurrences.length > 0 && issues.length === 0) {
      issues.push(buildIssue(input, 'OCCURRENCE_GAP', null, 'ended-open-occurrences', {
        missingCount: openOccurrences.length,
      }));
    }
    if (input.writeMode === 'APPLY' && issues.length > 0 && existing.length === 0) {
      const persisted = await persistIssues(db, input, service.companyId, issues, existing);
      result.opened = persisted.opened;
      result.refreshed = persisted.refreshed;
    } else if (input.writeMode === 'OBSERVE') {
      const existingKeys = new Set(existing.map((issue) => issue.issueKey));
      result.opened = issues.filter((issue) => !existingKeys.has(issue.issueKey)).length;
      result.refreshed = issues.filter((issue) => existingKeys.has(issue.issueKey)).length;
    }
    result.openIssues = issues;
    return result;
  }

  const issues: BillingCoverageIssueSummary[] = [];
  const disposition = service.billingDisposition;
  if (disposition !== 'CONFIGURED' && disposition !== 'NOT_REQUIRED') {
    issues.push(buildIssue(input, 'MISSING_DISPOSITION', null, 'service'));
  } else if (disposition === 'NOT_REQUIRED') {
    if ((service.billingNotRequiredReason ?? '').trim().length < 3) {
      issues.push(buildIssue(input, 'MISSING_DISPOSITION', null, 'service'));
    }
  } else {
    const activeFeeLines = (service.feeLines ?? []).filter(feeLineIsActive);
    if (activeFeeLines.length === 0) {
      issues.push(buildIssue(input, 'MISSING_FEE_LINES', null, 'service'));
    } else {
      const calendar = await loadCalendar(db, input.tenantId);
      const occurrences = await loadOccurrences(db, input.tenantId, input.clientServiceId);
      const occurrenceKeys = new Set(occurrences.map(occurrenceIdentity));
      for (const line of activeFeeLines) {
        if (!validAmount(line.amount) || !validCurrency(line.currency)) {
          issues.push(buildIssue(input, 'INVALID_AMOUNT_OR_CURRENCY', line.id, 'fee-line'));
          continue;
        }
        const schedule = scheduleConfigFor(line);
        if (schedule.issueType) {
          const scheduleKey = schedule.config?.scheduleEntries?.[0]?.key ?? 'schedule';
          issues.push(buildIssue(input, schedule.issueType, line.id, scheduleKey));
          continue;
        }
        if (!schedule.config) {
          issues.push(buildIssue(input, 'MISSING_SCHEDULE_PARAMETER', line.id, 'schedule'));
          continue;
        }
        let evaluated: EvaluatedBillingOccurrence[];
        try {
          evaluated = evaluateBillingSchedule({
            config: schedule.config,
            feeLine: { id: line.id, amount: amountString(line.amount), currency: line.currency },
            calendar,
            from: input.today,
            to: input.horizonEnd,
            generationKey: `billing-v1-${hashConfiguration({ feeLineId: line.id })}`,
          });
        } catch {
          issues.push(buildIssue(input, 'INVALID_CUSTOM_SCHEDULE', line.id, 'schedule'));
          continue;
        }
        const missing = evaluated.filter((proposal) => !occurrenceKeys.has(expectedIdentity(proposal)));
        if (missing.length > 0) {
          issues.push(buildIssue(input, 'OCCURRENCE_GAP', line.id, 'rolling-horizon', {
            missingCount: missing.length,
            firstMissingPeriod: missing[0]?.billingPeriodKey ?? null,
          }));
        }
      }
    }
  }

  const existingByKey = new Set(existing.map((issue) => issue.issueKey));
  const detectedKeys = new Set(issues.map((issue) => issue.issueKey));
  if (input.writeMode === 'APPLY') {
    const persisted = await persistIssues(db, input, service.companyId, issues, existing);
    result.opened = persisted.opened;
    result.refreshed = persisted.refreshed;
    result.resolved = persisted.resolved;
  } else {
    result.opened = issues.filter((issue) => !existingByKey.has(issue.issueKey)).length;
    result.refreshed = issues.filter((issue) => existingByKey.has(issue.issueKey)).length;
    result.resolved = existing.filter((issue) => !detectedKeys.has(issue.issueKey)).length;
  }
  result.openIssues = issues;
  return result;
}

function issueWhere(input: BillingCoverageListInput): Record<string, unknown> {
  const companyIds = input.companyIds === undefined ? undefined : [...input.companyIds];
  return {
    tenantId: input.tenantId,
    resolvedAt: null,
    ...(input.types && input.types.length > 0 ? { type: { in: [...input.types] } } : {}),
    ...(input.severities && input.severities.length > 0 ? { severity: { in: [...input.severities] } } : {}),
    ...(companyIds === undefined ? {} : { companyId: { in: companyIds } }),
    company: {
      tenantId: input.tenantId,
      deletedAt: null,
      ...(companyIds === undefined ? {} : { id: { in: companyIds } }),
    },
  };
}

function toListIssue(row: CoverageIssueRecord): BillingCoverageSummary['issues'][number] {
  const company = row.company ?? {};
  const clientService = row.clientService ?? {};
  const variant = clientService.serviceVariant ?? {};
  const family = variant.family ?? {};
  const companyName = company.name ?? '';
  const familyName = family.name ?? clientService.familyName ?? '';
  const details = asRecord(row.details);
  return {
    id: row.id ?? row.issueKey,
    type: row.type as BillingCoverageIssueType,
    severity: row.severity as BillingCoverageIssueSeverity,
    company: {
      id: company.id ?? '',
      name: companyName,
      displayLabel: getCompanyDisplayLabel({ name: companyName, displayAlias: company.displayAlias ?? null }),
    },
    service: {
      id: clientService.id ?? '',
      name: clientService.serviceName ?? '',
      familyName,
      familyColor: family.displayColor ?? '#2F6F5E',
    },
    feeLine: row.feeLine?.id
      ? { id: row.feeLine.id, description: row.feeLine.description ?? '' }
      : row.feeLineId ? { id: row.feeLineId, description: '' } : null,
    message: typeof details.message === 'string'
      ? details.message
      : issueMessage(row.type as BillingCoverageIssueType, row.feeLineId ?? null, details),
  };
}

/** Return open coverage issues and compact healthy-service counts in SQL scope. */
export async function listBillingCoverage(
  input: BillingCoverageListInput,
  db: CoverageDb = prisma,
): Promise<BillingCoverageSummary> {
  const database = asCoverageDb(db) as CoverageDb & {
    billingCoverageIssue?: {
      findMany?: (args: unknown) => Promise<unknown>;
    };
    clientService?: {
      count?: (args: unknown) => Promise<number>;
    };
  };
  const where = issueWhere(input);
  const rows = database.billingCoverageIssue?.findMany
    ? await database.billingCoverageIssue.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'asc' }, { id: 'asc' }],
      include: {
        company: { select: { id: true, tenantId: true, name: true, displayAlias: true } },
        clientService: {
          select: {
            id: true,
            tenantId: true,
            serviceName: true,
            familyName: true,
            serviceVariant: { select: { id: true, family: { select: { id: true, name: true, displayColor: true } } } },
          },
        },
        feeLine: { select: { id: true, description: true } },
      },
    })
    : [];
  const safeRows = (Array.isArray(rows) ? rows : []) as CoverageIssueRecord[];
  const activeServiceWhere = {
    tenantId: input.tenantId,
    status: 'ACTIVE',
    deletedAt: null,
    ...(input.companyIds === undefined ? {} : { companyId: { in: [...input.companyIds] } }),
    company: {
      tenantId: input.tenantId,
      deletedAt: null,
      ...(input.companyIds === undefined ? {} : { id: { in: [...input.companyIds] } }),
    },
    billingCoverageIssues: { none: { tenantId: input.tenantId, resolvedAt: null } },
  };
  const healthyActiveServiceCount = database.clientService?.count
    ? await database.clientService.count({ where: activeServiceWhere })
    : 0;
  return {
    openIssueCount: safeRows.length,
    affectedServiceCount: new Set(safeRows
      .map((row) => row.clientService?.id)
      .filter((id): id is string => Boolean(id))).size,
    healthyActiveServiceCount,
    issues: safeRows.map(toListIssue),
  };
}
