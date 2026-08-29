import { ValidationError } from '@/lib/errors';
import { compareDateOnly, parseDateOnly } from '@/services/service-schedule/date-only';
import { evaluateDeadlineRule } from '@/services/service-schedule/evaluator';
import { hashConfiguration } from '@/services/service-schedule/hash';
import type { ApplicabilityResult } from '@/services/service-schedule';
import {
  MAX_AUTHORITATIVE_BACKLOG_CYCLES,
  deadlineMaterializationPolicyForRule,
  planAuthoritativeAnnualBacklog,
} from './materialization-policy';
import { planRollingPeriods } from './planner';
import type {
  DeadlineReconciliationWarning,
  DeadlineRuleProjection,
  DeadlineRuleProjectionInput,
  ProjectedDeadline,
} from './types';

const MAX_HORIZON_OVERFLOW_WARNINGS = 10;

function missingInputWarning(
  ruleId: string,
  ruleVersionId: string,
  message: string,
  missingFields: string[],
): DeadlineReconciliationWarning {
  return {
    code: 'MISSING_INPUT',
    message,
    ruleId,
    ruleVersionId,
    missingFields,
    permanent: true,
  };
}

function missingFieldsFromError(error: unknown): string[] {
  const details = (error as { details?: unknown })?.details;
  if (details && typeof details === 'object' && 'source' in details) {
    const source = (details as { source?: { kind?: string; field?: string; key?: string } }).source;
    if (source?.kind === 'COMPANY_FIELD' && source.field) return [source.field];
    if (source?.kind === 'PARAMETER' && source.key) return [`parameter:${source.key}`];
  }
  if (details && typeof details === 'object' && 'parameter' in details) {
    const parameter = (details as { parameter?: unknown }).parameter;
    if (typeof parameter === 'string') return [`parameter:${parameter}`];
  }
  return [];
}

function occurrenceKey(
  ruleId: string,
  milestoneKey: string,
  scheduleEntryKey: string,
  calculatedDueDate: string,
): string {
  return [ruleId, milestoneKey, scheduleEntryKey, calculatedDueDate].join('|');
}

function compareProjectedDeadline(left: ProjectedDeadline, right: ProjectedDeadline): number {
  return (
    left.calculatedDueDate.localeCompare(right.calculatedDueDate)
    || left.ruleId.localeCompare(right.ruleId)
    || left.milestoneKey.localeCompare(right.milestoneKey)
    || left.scheduleEntryKey.localeCompare(right.scheduleEntryKey)
  );
}

/**
 * Canonical, pure deadline projection. It performs no persistence: consumers
 * load inputs, call this function, and diff against stored state.
 */
export function projectDeadlineRule(input: DeadlineRuleProjectionInput): DeadlineRuleProjection {
  parseDateOnly(input.today);
  parseDateOnly(input.horizonEnd);
  if (compareDateOnly(input.today, input.horizonEnd) > 0) {
    throw new ValidationError('Projection horizon must not precede today');
  }

  const warnings: DeadlineReconciliationWarning[] = [];
  const policy = deadlineMaterializationPolicyForRule(input.ruleCode);

  let periods;
  if (policy === 'AUTHORITATIVE_ANNUAL_BACKLOG') {
    if (input.recurrence.kind !== 'ANNUALLY' || !input.company.accountsDueDate) {
      const missingFields = input.company.accountsDueDate ? [] : ['accountsDueDate'];
      const reason = input.recurrence.kind !== 'ANNUALLY'
        ? 'Authoritative backlog rules require annual recurrence'
        : 'Authoritative backlog rules require Company.accountsDueDate';
      warnings.push(missingInputWarning(input.ruleId, input.ruleVersionId, reason, missingFields));
      return {
        materializationPolicy: policy,
        periods: [],
        occurrences: [],
        applicability: { state: 'MISSING_INPUT', reason, missingFields },
        warnings,
        periodEvaluations: [],
      };
    }
    const plan = planAuthoritativeAnnualBacklog(
      input.company.accountsDueDate as never,
      input.horizonEnd,
      MAX_AUTHORITATIVE_BACKLOG_CYCLES,
    );
    periods = plan.periods;
    if (plan.excludedCycleCount > 0) {
      warnings.push({
        code: 'AUTHORITATIVE_BACKLOG_TRUNCATED',
        message: `Authoritative annual backlog exceeded ${MAX_AUTHORITATIVE_BACKLOG_CYCLES} cycles`,
        ruleId: input.ruleId,
        ruleVersionId: input.ruleVersionId,
        excludedCycleCount: plan.excludedCycleCount,
        oldestRetainedYear: plan.oldestRetainedYear ?? undefined,
      });
    }
  } else {
    periods = planRollingPeriods(input.recurrence, input.today, input.horizonEnd);
  }

  const occurrences: ProjectedDeadline[] = [];
  const periodEvaluations: DeadlineRuleProjection['periodEvaluations'] = [];
  const seen = new Set<string>();
  let applicability: ApplicabilityResult = { state: 'APPLICABLE', reason: null };
  let horizonOverflowWarnings = 0;
  let stopped = false;

  for (const period of periods) {
    if (stopped) break;
    let evaluation;
    try {
      evaluation = evaluateDeadlineRule({
        ruleId: input.ruleId,
        ruleVersionId: input.ruleVersionId,
        recurrence: input.recurrence,
        applicability: input.applicability,
        parameters: input.parameters,
        scheduleEntries: input.scheduleEntries,
        milestones: input.milestones,
        company: input.company,
        period: { key: period.periodKey, start: period.start, end: period.end },
        calendar: input.calendar,
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'MISSING_RULE_INPUT') throw error;
      const message = error instanceof Error ? error.message : 'Rule input is missing';
      warnings.push(missingInputWarning(
        input.ruleId,
        input.ruleVersionId,
        message,
        missingFieldsFromError(error),
      ));
      if (occurrences.length === 0) {
        applicability = {
          state: 'MISSING_INPUT',
          reason: message,
          missingFields: missingFieldsFromError(error),
        };
      }
      stopped = true;
      break;
    }

    applicability = evaluation.applicability;
    periodEvaluations.push({
      periodKey: period.periodKey,
      sourceSnapshot: evaluation.sourceSnapshot,
      evaluationHash: evaluation.evaluationHash ?? hashConfiguration(evaluation.sourceSnapshot),
    });

    if (evaluation.applicability.state !== 'APPLICABLE') {
      stopped = true;
      break;
    }

    for (const evaluated of evaluation.occurrences) {
      const dueDate = evaluated.calculatedDueDate;
      if (compareDateOnly(dueDate, input.horizonEnd) > 0) {
        if (policy === 'ROLLING_HORIZON' && horizonOverflowWarnings < MAX_HORIZON_OVERFLOW_WARNINGS) {
          horizonOverflowWarnings += 1;
          warnings.push({
            code: 'OCCURRENCE_OUTSIDE_ROLLING_HORIZON',
            message: 'Evaluated occurrence was excluded from the rolling horizon',
            ruleId: input.ruleId,
            ruleVersionId: input.ruleVersionId,
          });
        }
        continue;
      }
      if (policy === 'ROLLING_HORIZON' && compareDateOnly(dueDate, input.today) < 0) {
        continue;
      }

      const key = occurrenceKey(
        input.ruleId,
        evaluated.milestoneKey,
        evaluated.scheduleEntryKey,
        dueDate,
      );
      if (seen.has(key)) continue;
      seen.add(key);

      occurrences.push({
        ruleId: input.ruleId,
        ruleVersionId: input.ruleVersionId,
        periodKey: period.periodKey,
        milestoneKey: evaluated.milestoneKey,
        scheduleEntryKey: evaluated.scheduleEntryKey,
        deadlineType: evaluated.type,
        calculatedDueDate: dueDate,
        explanation: [...evaluated.explanation],
      });
    }
  }

  occurrences.sort(compareProjectedDeadline);

  return {
    materializationPolicy: policy,
    periods,
    occurrences,
    applicability,
    warnings,
    periodEvaluations,
  };
}
