import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma';
import { compareDateOnly, parseDateOnly } from '@/services/service-schedule/date-only';
import { companyPeriodFacts, normalizeCompanyRuleSource } from '@/services/service-schedule';
import type { DateOnly, FinancialPeriodFact, MilestoneDefinition } from '@/services/service-schedule';
import {
  classifyDeadlineChange,
  loadActiveBusinessCalendar,
  recurrenceAnchorFor,
} from '@/services/schedule-reconciliation/deadline-reconciler';
import type {
  DeadlineReconciliationCounts,
  DeadlineReconciliationPreservedCounts,
  PreserveReason,
} from '@/services/schedule-reconciliation/types';
import { OBLIGATION_CATALOG, isMonitoringProfile } from './catalog';
import {
  projectCompanyObligations,
  type CompanyMonitoringProjection,
  type CompanyReviewIssue,
  type CoverageInput,
  type DeliveryScopeInput,
  type InclusionReason,
  type ProjectedCompanyObligation,
  type PublishedRuleInput,
} from './projection';

/**
 * Company obligation writer. Persists the pure company projection as
 * COMPANY-owned cycles and occurrences, links every monitoring reason,
 * records responsibility history and keeps review issues in sync.
 *
 * It never writes fee lines, billing occurrences or billing-coverage issues,
 * and it never cancels a company obligation: an obligation that loses every
 * reason becomes a handover review item instead.
 */

/** Generation key for company-owned rule cycles (one cycle per obligation period). */
export const COMPANY_OBLIGATION_GENERATION_KEY = 'company-obligation-v1';

const PRESET_RULE_CODES = OBLIGATION_CATALOG
  .map((definition) => definition.ruleCode)
  .filter((code): code is string => code !== null);

type Db = Prisma.TransactionClient | typeof prisma;

export type CompanyObligationWriteMode = 'OBSERVE' | 'APPLY';

export type ReconcileCompanyObligationsInput = {
  tenantId: string;
  companyId: string;
  today: DateOnly;
  writeMode: CompanyObligationWriteMode;
  reconciliationRequestId?: string;
  assertLease?: () => Promise<void>;
};

export type CompanyObligationReconciliationResult = {
  tenantId: string;
  companyId: string;
  writeMode: CompanyObligationWriteMode;
  counts: DeadlineReconciliationCounts;
  preservedByReason: DeadlineReconciliationPreservedCounts;
  links: { attached: number; released: number };
  responsibilityChanges: number;
  issues: { opened: number; refreshed: number; resolved: number; open: number };
  projection: CompanyMonitoringProjection | null;
};

const STAFF_REVIEW_ISSUE_TYPES = new Set<string>(['MONITORING_START_REVIEW']);

type HandoverIssue = Omit<CompanyReviewIssue, 'type'> & { type: 'HANDOVER_REVIEW' };

function emptyCounts(): DeadlineReconciliationCounts {
  return { created: 0, recalculated: 0, cancelled: 0, preserved: 0, noChange: 0 };
}

function emptyPreserved(): DeadlineReconciliationPreservedCounts {
  return { MANUAL_TRIGGER: 0, HISTORICAL: 0, COMPLETED: 0, WAIVED: 0, CANCELLED: 0, OVERRIDDEN: 0 };
}

function toDateOnly(value: Date | null | undefined): DateOnly | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10) as DateOnly;
}

function toDate(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Dedupe keys are bounded by the column; long keys keep a stable hash suffix. */
function boundedDedupeKey(key: string): string {
  if (key.length <= 400) return key;
  const digest = createHash('sha256').update(key).digest('hex');
  return `${key.slice(0, 330)}#${digest}`;
}

function linkKeyFor(reason: InclusionReason): string {
  return reason.kind === 'CONTRACTED_DELIVERY'
    ? `${reason.kind}:${reason.deliveryScopeId}`
    : `${reason.kind}:${reason.coverageId}`;
}

function cycleKey(obligationCode: string, periodKey: string): string {
  return `${obligationCode}|${periodKey}`;
}

function preserveReasonFor(occurrence: {
  origin: string;
  status: string;
  dateOverridden: boolean;
  operativeDueDate: Date;
}, today: DateOnly): PreserveReason | null {
  if (occurrence.origin !== 'RULE') return 'MANUAL_TRIGGER';
  if (occurrence.status === 'COMPLETED') return 'COMPLETED';
  if (occurrence.status === 'WAIVED') return 'WAIVED';
  if (occurrence.status === 'CANCELLED') return 'CANCELLED';
  if (occurrence.dateOverridden) return 'OVERRIDDEN';
  const due = toDateOnly(occurrence.operativeDueDate);
  if (due && compareDateOnly(due, today) < 0) return 'HISTORICAL';
  return null;
}

async function loadProjectionInput(db: Db, tenantId: string, companyId: string, today: DateOnly) {
  const company = await db.company.findFirst({ where: { id: companyId, tenantId, deletedAt: null } });
  if (!company) return null;

  const [periods, coverages, scopes, rules, calendar] = await Promise.all([
    db.companyFinancialPeriod.findMany({
      where: { tenantId, companyId },
      orderBy: { periodEnd: 'asc' },
    }),
    db.companyMonitoringCoverage.findMany({
      where: { tenantId, companyId },
      orderBy: [{ monitoringStart: 'asc' }, { id: 'asc' }],
    }),
    db.clientServiceObligationScope.findMany({
      where: { tenantId, companyId },
      include: { clientService: { select: { status: true, deletedAt: true, endDate: true } } },
      orderBy: [{ periodKey: 'asc' }, { id: 'asc' }],
    }),
    db.deadlineRule.findMany({
      where: { tenantId, code: { in: [...PRESET_RULE_CODES] }, isActive: true, archivedAt: null },
      include: { currentVersion: { include: { milestoneTemplates: true } } },
    }),
    loadActiveBusinessCalendar(db, tenantId),
  ]);

  const confirmedPeriods: FinancialPeriodFact[] = periods.flatMap((period) => {
    const start = toDateOnly(period.periodStart);
    const end = toDateOnly(period.periodEnd);
    if (!start || !end) return [];
    return [{
      id: period.id,
      start,
      end,
      yearsOfAssessment: period.yearsOfAssessment.length > 0 ? period.yearsOfAssessment : null,
      source: 'CONFIRMED' as const,
    }];
  });

  const coverageInputs: CoverageInput[] = coverages.flatMap((coverage) => {
    const start = toDateOnly(coverage.monitoringStart);
    if (!start || !isMonitoringProfile(coverage.profile)) return [];
    return [{
      id: coverage.id,
      profile: coverage.profile,
      monitoringStart: start,
      monitoringEnd: toDateOnly(coverage.monitoringEnd),
    }];
  });

  const scopeInputs: DeliveryScopeInput[] = scopes.map((scope) => {
    const endDate = toDateOnly(scope.clientService.endDate);
    const serviceActive = scope.clientService.deletedAt === null
      && scope.clientService.status !== 'ENDED'
      && (endDate === null || compareDateOnly(endDate, today) >= 0);
    return {
      id: scope.id,
      clientServiceId: scope.clientServiceId,
      obligationCode: scope.obligationCode,
      periodKey: scope.periodKey,
      confirmation: scope.confirmation,
      serviceActive,
    };
  });

  const rulesByCode: Record<string, PublishedRuleInput | undefined> = {};
  for (const rule of rules) {
    const version = rule.currentVersion;
    if (!version || version.state !== 'PUBLISHED') continue;
    const milestones: MilestoneDefinition[] = version.milestoneTemplates.map((template, index) => ({
      key: template.milestoneKey,
      name: template.name,
      description: template.description,
      type: template.type as MilestoneDefinition['type'],
      generationMode: template.generationMode as MilestoneDefinition['generationMode'],
      expression: template.dateExpression as never,
      businessDayAdjustment: template.businessDayAdjustment as MilestoneDefinition['businessDayAdjustment'],
      displayOrder: template.displayOrder ?? index,
      isActive: template.isActive !== false,
    }));
    rulesByCode[rule.code] = {
      ruleId: rule.id,
      ruleCode: rule.code,
      ruleVersionId: version.id,
      recurrence: version.recurrence as never,
      applicability: version.applicability as never,
      milestones,
    };
  }

  return {
    company,
    calendar,
    input: {
      companyId,
      today,
      company: normalizeCompanyRuleSource(company, today),
      isGstRegistered: company.isGstRegistered === true,
      periodFacts: companyPeriodFacts(company, confirmedPeriods),
      coverages: coverageInputs,
      deliveryScopes: scopeInputs,
      rulesByCode,
      calendar: calendar.snapshot,
    },
  };
}

function occurrenceMetadata(obligation: ProjectedCompanyObligation) {
  return {
    obligationCode: obligation.obligationCode,
    obligationPeriodKey: obligation.periodKey,
    financialPeriodStart: toDate(obligation.obligationPeriod.start),
    financialPeriodEnd: toDate(obligation.obligationPeriod.end),
    yearOfAssessment: obligation.obligationPeriod.yearOfAssessment,
    periodProvisional: obligation.obligationPeriod.provisional,
    coverageTiming: obligation.coverageTiming,
  };
}

/**
 * Reconcile one company's statutory obligations. OBSERVE computes the same
 * counts without writing, so observe-mode runs can be compared with apply.
 */
export async function reconcileCompanyObligations(
  input: ReconcileCompanyObligationsInput,
  db: Db = prisma,
): Promise<CompanyObligationReconciliationResult> {
  const { tenantId, companyId, today, writeMode } = input;
  parseDateOnly(today);
  const apply = writeMode === 'APPLY';
  const counts = emptyCounts();
  const preservedByReason = emptyPreserved();
  const links = { attached: 0, released: 0 };
  const issueCounts = { opened: 0, refreshed: 0, resolved: 0, open: 0 };
  let responsibilityChanges = 0;
  const now = new Date();

  await input.assertLease?.();
  const loaded = await loadProjectionInput(db, tenantId, companyId, today);
  if (!loaded) {
    return {
      tenantId, companyId, writeMode, counts, preservedByReason, links,
      responsibilityChanges, issues: issueCounts, projection: null,
    };
  }
  const projection = projectCompanyObligations(loaded.input);

  const existingCycles = await db.serviceCycle.findMany({
    where: { tenantId, companyId, ownershipScope: 'COMPANY', origin: 'RULE' },
    include: { occurrences: { include: { coverageLinks: true } } },
  });
  const cyclesByKey = new Map(existingCycles.flatMap((cycle) => (
    cycle.obligationCode && cycle.obligationPeriodKey
      ? [[cycleKey(cycle.obligationCode, cycle.obligationPeriodKey), cycle] as const]
      : []
  )));

  const handoverIssues: HandoverIssue[] = [];
  const touchedOccurrenceIds = new Set<string>();
  const grouped = new Map<string, ProjectedCompanyObligation[]>();
  for (const obligation of projection.obligations) {
    const key = cycleKey(obligation.obligationCode, obligation.periodKey);
    grouped.set(key, [...(grouped.get(key) ?? []), obligation]);
  }

  for (const [key, obligations] of grouped) {
    await input.assertLease?.();
    const first = obligations[0]!;
    let cycle = cyclesByKey.get(key);
    const cycleData = {
      ruleId: first.ruleId,
      ruleVersionId: first.ruleVersionId,
      businessCalendarId: loaded.calendar.record?.id ?? null,
      businessCalendarRevision: loaded.calendar.record?.revision ?? null,
      periodStart: toDate(first.obligationPeriod.start),
      periodEnd: toDate(first.obligationPeriod.end),
      evaluationHash: first.evaluationHash || createHash('sha256').update(key).digest('hex'),
      recurrenceAnchor: recurrenceAnchorFor(first.periodKey, first.obligationPeriod),
      sourceSnapshot: {
        ...first.sourceSnapshot,
        explanations: Object.fromEntries(obligations.map((obligation) => [
          `${obligation.milestoneKey}|${obligation.scheduleEntryKey}`,
          obligation.explanation,
        ])),
      } as Prisma.InputJsonValue,
    };

    if (apply) {
      if (!cycle) {
        // ON CONFLICT DO NOTHING honours the partial unique index, so a
        // concurrent writer for the same company period cannot duplicate it.
        await db.serviceCycle.createMany({
          data: [{
            tenantId,
            companyId,
            ownershipScope: 'COMPANY',
            clientServiceId: null,
            obligationCode: first.obligationCode,
            obligationPeriodKey: first.periodKey,
            periodKey: first.periodKey,
            generationKey: COMPANY_OBLIGATION_GENERATION_KEY,
            origin: 'RULE',
            ...cycleData,
          }],
          skipDuplicates: true,
        });
        cycle = await db.serviceCycle.findFirstOrThrow({
          where: {
            tenantId,
            companyId,
            ownershipScope: 'COMPANY',
            origin: 'RULE',
            obligationCode: first.obligationCode,
            obligationPeriodKey: first.periodKey,
          },
          include: { occurrences: { include: { coverageLinks: true } } },
        });
        cyclesByKey.set(key, cycle);
      } else {
        await db.serviceCycle.updateMany({
          where: { id: cycle.id, tenantId, companyId, ownershipScope: 'COMPANY' },
          data: cycleData,
        });
      }
    }

    const existingByKey = new Map((cycle?.occurrences ?? []).map((occurrence) => (
      [`${occurrence.milestoneKey}|${occurrence.scheduleEntryKey}`, occurrence] as const
    )));

    for (const obligation of obligations) {
      const existing = existingByKey.get(`${obligation.milestoneKey}|${obligation.scheduleEntryKey}`);
      const decision = classifyDeadlineChange(
        existing
          ? {
            id: existing.id,
            cycleId: existing.cycleId,
            milestoneKey: existing.milestoneKey,
            scheduleEntryKey: existing.scheduleEntryKey,
            deadlineType: existing.deadlineType,
            calculatedDueDate: toDateOnly(existing.calculatedDueDate)!,
            operativeDueDate: toDateOnly(existing.operativeDueDate)!,
            dateOverridden: existing.dateOverridden,
            status: existing.status,
            origin: existing.origin,
            ruleVersionId: existing.ruleVersionId,
          }
          : null,
        {
          milestoneKey: obligation.milestoneKey,
          scheduleEntryKey: obligation.scheduleEntryKey,
          deadlineType: obligation.deadlineType,
          dueDate: obligation.dueDate,
          ruleVersionId: obligation.ruleVersionId,
          explanation: obligation.explanation,
        },
        today,
      );

      let occurrenceId = existing?.id ?? null;
      let storedResponsibility = existing
        ? {
          filingResponsibility: existing.filingResponsibility,
          responsibilitySource: existing.responsibilitySource,
          deliveryClientServiceId: existing.deliveryClientServiceId,
        }
        : null;

      switch (decision.action) {
        case 'CREATE': {
          if (apply && cycle) {
            const created = await db.deadlineOccurrence.createMany({
              data: [{
                tenantId,
                companyId,
                ownershipScope: 'COMPANY',
                clientServiceId: null,
                cycleId: cycle.id,
                ruleVersionId: obligation.ruleVersionId,
                milestoneKey: obligation.milestoneKey,
                scheduleEntryKey: obligation.scheduleEntryKey,
                deadlineType: obligation.deadlineType,
                calculatedDueDate: toDate(obligation.dueDate),
                operativeDueDate: toDate(obligation.dueDate),
                dateOverridden: false,
                status: 'OPEN',
                origin: 'RULE',
                ...occurrenceMetadata(obligation),
                filingResponsibility: obligation.filingResponsibility,
                responsibilitySource: 'PROJECTED',
                deliveryClientServiceId: obligation.deliveryClientServiceId,
                filingStatusUnconfirmed: obligation.filingStatusUnconfirmed,
              }],
              skipDuplicates: true,
            });
            const row = await db.deadlineOccurrence.findUniqueOrThrow({
              where: {
                tenantId_cycleId_milestoneKey_scheduleEntryKey: {
                  tenantId,
                  cycleId: cycle.id,
                  milestoneKey: obligation.milestoneKey,
                  scheduleEntryKey: obligation.scheduleEntryKey,
                },
              },
            });
            occurrenceId = row.id;
            if (created.count === 1) {
              counts.created += 1;
              responsibilityChanges += 1;
              await db.deadlineResponsibilityChange.create({
                data: {
                  tenantId,
                  occurrenceId: row.id,
                  previousResponsibility: null,
                  newResponsibility: obligation.filingResponsibility,
                  newDeliveryClientServiceId: obligation.deliveryClientServiceId,
                  source: 'PROJECTED',
                  reason: 'Initial projection',
                },
              });
              storedResponsibility = {
                filingResponsibility: obligation.filingResponsibility,
                responsibilitySource: 'PROJECTED',
                deliveryClientServiceId: obligation.deliveryClientServiceId,
              };
            } else {
              counts.noChange += 1;
              storedResponsibility = {
                filingResponsibility: row.filingResponsibility,
                responsibilitySource: row.responsibilitySource,
                deliveryClientServiceId: row.deliveryClientServiceId,
              };
            }
          } else {
            counts.created += 1;
          }
          break;
        }
        case 'RECALCULATE':
          counts.recalculated += 1;
          if (apply && existing) {
            await db.deadlineOccurrence.updateMany({
              where: { id: existing.id, tenantId, companyId, ownershipScope: 'COMPANY' },
              data: {
                calculatedDueDate: toDate(obligation.dueDate),
                operativeDueDate: toDate(obligation.dueDate),
                ruleVersionId: obligation.ruleVersionId,
              },
            });
          }
          break;
        case 'PRESERVE':
          counts.preserved += 1;
          preservedByReason[decision.reason] += 1;
          if (decision.reason === 'OVERRIDDEN' && apply && existing) {
            await db.deadlineOccurrence.updateMany({
              where: { id: existing.id, tenantId, companyId, ownershipScope: 'COMPANY' },
              data: { calculatedDueDate: toDate(obligation.dueDate) },
            });
          }
          break;
        case 'NO_CHANGE':
          counts.noChange += 1;
          break;
      }

      if (!occurrenceId) continue;
      touchedOccurrenceIds.add(occurrenceId);

      if (apply && existing) {
        // Period, YA and coverage timing are descriptive metadata and follow
        // the projection even on protected rows; dates and status do not.
        await db.deadlineOccurrence.updateMany({
          where: { id: existing.id, tenantId, companyId, ownershipScope: 'COMPANY' },
          data: occurrenceMetadata(obligation),
        });
      }

      // Staff-confirmed responsibility is never overwritten by a projection.
      if (
        storedResponsibility
        && storedResponsibility.responsibilitySource !== 'STAFF'
        && (storedResponsibility.filingResponsibility !== obligation.filingResponsibility
          || storedResponsibility.deliveryClientServiceId !== obligation.deliveryClientServiceId)
      ) {
        responsibilityChanges += 1;
        if (apply) {
          await db.deadlineOccurrence.updateMany({
            where: { id: occurrenceId, tenantId, companyId, ownershipScope: 'COMPANY' },
            data: {
              filingResponsibility: obligation.filingResponsibility,
              responsibilitySource: 'PROJECTED',
              deliveryClientServiceId: obligation.deliveryClientServiceId,
            },
          });
          await db.deadlineResponsibilityChange.create({
            data: {
              tenantId,
              occurrenceId,
              previousResponsibility: storedResponsibility.filingResponsibility,
              newResponsibility: obligation.filingResponsibility,
              previousDeliveryClientServiceId: storedResponsibility.deliveryClientServiceId,
              newDeliveryClientServiceId: obligation.deliveryClientServiceId,
              source: 'PROJECTED',
              reason: 'Contracted filing scope changed',
            },
          });
        }
      }

      // Coverage links: attach current reasons, release the rest (kept as history).
      const currentLinks = new Map(obligation.reasons.map((reason) => [linkKeyFor(reason), reason]));
      const storedLinks = existing?.coverageLinks ?? [];
      for (const [linkKey, reason] of currentLinks) {
        const stored = storedLinks.find((link) => link.linkKey === linkKey);
        if (stored && stored.releasedAt === null) continue;
        links.attached += 1;
        if (!apply) continue;
        await db.deadlineOccurrenceCoverageLink.upsert({
          where: { occurrenceId_linkKey: { occurrenceId, linkKey } },
          create: {
            tenantId,
            occurrenceId,
            linkKey,
            reason: reason.kind,
            coverageId: reason.kind === 'CONTRACTED_DELIVERY' ? null : reason.coverageId,
            deliveryScopeId: reason.kind === 'CONTRACTED_DELIVERY' ? reason.deliveryScopeId : null,
          },
          update: { releasedAt: null, linkedAt: now },
        });
      }
      for (const stored of storedLinks) {
        if (stored.releasedAt !== null || currentLinks.has(stored.linkKey)) continue;
        links.released += 1;
        if (apply) {
          await db.deadlineOccurrenceCoverageLink.updateMany({
            where: { id: stored.id, tenantId },
            data: { releasedAt: now },
          });
        }
      }
    }
  }

  // Obligations that lost every reason are never cancelled here. Open ones go
  // to handover review; their links are released so the history is explicit.
  const blockedCodes = new Set(projection.issues
    .filter((entry) => entry.type === 'RULE_NOT_PUBLISHED' || entry.type === 'RULE_INPUT_MISSING')
    .map((entry) => entry.obligationCode));
  const missingFye = projection.issues.some((entry) => entry.type === 'MISSING_FINANCIAL_YEAR_END');
  for (const cycle of existingCycles) {
    if (!cycle.obligationCode || blockedCodes.has(cycle.obligationCode) || missingFye) continue;
    for (const occurrence of cycle.occurrences) {
      if (touchedOccurrenceIds.has(occurrence.id)) continue;
      const reason = preserveReasonFor(occurrence, today);
      counts.preserved += 1;
      preservedByReason[reason ?? 'HISTORICAL'] += 1;
      for (const link of occurrence.coverageLinks) {
        if (link.releasedAt !== null) continue;
        links.released += 1;
        if (apply) {
          await db.deadlineOccurrenceCoverageLink.updateMany({
            where: { id: link.id, tenantId },
            data: { releasedAt: now },
          });
        }
      }
      if (occurrence.status !== 'OPEN') continue;
      handoverIssues.push({
        type: 'HANDOVER_REVIEW',
        dedupeKey: ['HANDOVER_REVIEW', cycle.obligationCode, cycle.obligationPeriodKey ?? '', occurrence.id].join('|'),
        message: `${cycle.obligationCode} for ${cycle.obligationPeriodKey ?? cycle.periodKey} is no longer covered by monitoring or a contracted filing. Confirm who handles it, or close it.`,
        obligationCode: cycle.obligationCode,
        periodKey: cycle.obligationPeriodKey,
        coverageId: null,
      });
    }
  }

  // Review issues: upsert what is open now, resolve what no longer applies.
  const currentIssues = [...projection.issues, ...handoverIssues].map((entry) => ({
    ...entry,
    dedupeKey: boundedDedupeKey(entry.dedupeKey),
  }));
  const storedIssues = await db.companyComplianceIssue.findMany({
    where: { tenantId, companyId },
    select: { id: true, type: true, dedupeKey: true, resolvedAt: true, resolvedById: true },
  });
  const storedByKey = new Map(storedIssues.map((entry) => [entry.dedupeKey, entry]));
  for (const entry of currentIssues) {
    const stored = storedByKey.get(entry.dedupeKey);
    // A staff member's resolution stands while the same issue persists.
    const staffResolved = stored?.resolvedAt != null && stored.resolvedById != null;
    if (stored && stored.resolvedAt === null) issueCounts.refreshed += 1;
    else if (!staffResolved) issueCounts.opened += 1;
    if (!apply) continue;
    await db.companyComplianceIssue.upsert({
      where: { tenantId_companyId_dedupeKey: { tenantId, companyId, dedupeKey: entry.dedupeKey } },
      create: {
        tenantId,
        companyId,
        coverageId: entry.coverageId,
        type: entry.type,
        dedupeKey: entry.dedupeKey,
        obligationCode: entry.obligationCode,
        periodKey: entry.periodKey,
        message: entry.message.slice(0, 1000),
        lastSeenAt: now,
      },
      update: staffResolved
        ? { lastSeenAt: now }
        : {
          message: entry.message.slice(0, 1000),
          lastSeenAt: now,
          resolvedAt: null,
          resolutionNote: null,
          ...(stored?.resolvedAt ? { openedAt: now } : {}),
        },
    });
  }
  const currentKeys = new Set(currentIssues.map((entry) => entry.dedupeKey));
  // Staff-raised review items (such as an unconfirmed monitoring start) are not
  // the projection's to resolve.
  const stale = storedIssues.filter((entry) => (
    entry.resolvedAt === null
    && !STAFF_REVIEW_ISSUE_TYPES.has(entry.type)
    && !currentKeys.has(entry.dedupeKey)
  ));
  issueCounts.resolved = stale.length;
  issueCounts.open = currentIssues.filter((entry) => {
    const stored = storedByKey.get(entry.dedupeKey);
    return !(stored?.resolvedAt != null && stored.resolvedById != null);
  }).length;
  if (apply && stale.length > 0) {
    await db.companyComplianceIssue.updateMany({
      where: { tenantId, companyId, id: { in: stale.map((entry) => entry.id) }, resolvedAt: null },
      data: { resolvedAt: now, resolutionNote: 'No longer applies after reconciliation' },
    });
  }

  return {
    tenantId,
    companyId,
    writeMode,
    counts,
    preservedByReason,
    links,
    responsibilityChanges,
    issues: issueCounts,
    projection,
  };
}

/** Companies with any monitoring coverage or contracted filing scope. */
export async function monitoredCompanyIds(
  db: Db,
  tenantId: string,
): Promise<string[]> {
  const [coverages, scopes] = await Promise.all([
    db.companyMonitoringCoverage.findMany({ where: { tenantId }, select: { companyId: true }, distinct: ['companyId'] }),
    db.clientServiceObligationScope.findMany({ where: { tenantId }, select: { companyId: true }, distinct: ['companyId'] }),
  ]);
  return [...new Set([...coverages, ...scopes].map((row) => row.companyId))].sort();
}
