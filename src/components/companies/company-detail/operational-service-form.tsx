'use client';

import { useState, type Dispatch, type ReactNode, type SelectHTMLAttributes, type SetStateAction } from 'react';
import { AlertCircle, Calendar, CheckCircle2, ChevronDown, ChevronRight, Clock, HelpCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormInput } from '@/components/ui/form-input';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { ScheduleEntryEditor } from '@/components/services/shared/schedule-entry-editor';
import { cn } from '@/lib/utils';
import type { ScheduleEntryInput } from '@/lib/validations/service-schedule';
import type { CompanyComplianceContext } from '@/services/client-service/types';
import type { OperationalServiceValues } from './client-service-form-state';
import type { BillingScheduleConfigV1 } from '@/services/billing/types';
import { canonicalizeBillingSchedule } from '@/services/billing/schedule';

const uuid = () => crypto.randomUUID();

export const CADENCE_OPTIONS: Array<{ value: OperationalServiceValues['serviceCadence']; label: string }> = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'SEMI_ANNUALLY', label: 'Semi-annually' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'ONE_TIME', label: 'One-time' },
  { value: 'AD_HOC', label: 'Ad-hoc' },
  { value: 'CUSTOM', label: 'Custom' },
];

export const FEE_FREQUENCY_OPTIONS: Array<{ value: OperationalServiceValues['fees'][number]['billingFrequency']; label: string }> = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'SEMI_ANNUALLY', label: 'Semi-annually' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'ONE_TIME', label: 'One-time' },
  { value: 'CUSTOM', label: 'Custom' },
];

const BILLING_INTERVALS: Record<string, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUALLY: 6,
  ANNUALLY: 12,
  ONE_TIME: null,
  CUSTOM: null,
};

export interface ProjectedDeadlineItem {
  key: string;
  ruleUiId: string;
  label: string;
  targetDate: string;
  isoDate: string;
  timingExplanation: string;
  isOverdue?: boolean;
}

function addMonthsSafe(date: Date, months: number): Date {
  const target = new Date(date);
  const targetDay = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const maxDays = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(targetDay, maxDays));
  return target;
}

export function calculateActualDeadlinesPreview(
  rule: OperationalServiceValues['deadlineRules'][number],
  startDateString: string,
  serviceCadence: OperationalServiceValues['serviceCadence'],
  companyContext?: CompanyComplianceContext | null,
): ProjectedDeadlineItem[] {
  const now = new Date();
  const horizonEnd = addMonthsSafe(now, 12);
  const start = startDateString ? new Date(startDateString) : now;
  const startYear = !Number.isNaN(start.getFullYear()) ? start.getFullYear() : now.getFullYear();
  const startMonth = !Number.isNaN(start.getMonth()) ? start.getMonth() : now.getMonth();
  const currentYear = now.getFullYear();

  const results: ProjectedDeadlineItem[] = [];

  // 1. If custom schedule entries are configured
  if (rule.scheduleEntries.length > 0) {
    for (const [idx, entry] of rule.scheduleEntries.entries()) {
      const expr = entry.expression as Record<string, unknown>;

      if (expr.kind === 'DAY_OF_MONTH') {
        const day = typeof expr.day === 'number' ? expr.day : 1;
        if (serviceCadence === 'MONTHLY') {
          for (let i = 0; i < 12; i++) {
            const occDate = new Date(startYear, startMonth + i, day);
            const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
            const isPast = occDate < now;
            results.push({
              key: `${rule.uiId}-${entry.key || idx}-m-${i}`,
              ruleUiId: rule.uiId,
              label: entry.label || rule.name,
              targetDate: formatted,
              isoDate: occDate.toISOString().slice(0, 10),
              timingExplanation: `Monthly on Day ${day} (Month ${i + 1} of 12)`,
              isOverdue: isPast,
            });
          }
        } else if (serviceCadence === 'QUARTERLY') {
          for (let i = 0; i < 4; i++) {
            const occDate = new Date(startYear, startMonth + i * 3, day);
            const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
            const isPast = occDate < now;
            results.push({
              key: `${rule.uiId}-${entry.key || idx}-q-${i}`,
              ruleUiId: rule.uiId,
              label: entry.label || rule.name,
              targetDate: formatted,
              isoDate: occDate.toISOString().slice(0, 10),
              timingExplanation: `Quarterly on Day ${day} (Quarter ${i + 1} of 4)`,
              isOverdue: isPast,
            });
          }
        } else if (serviceCadence === 'SEMI_ANNUALLY') {
          for (let i = 0; i < 2; i++) {
            const occDate = new Date(startYear, startMonth + i * 6, day);
            const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
            const isPast = occDate < now;
            results.push({
              key: `${rule.uiId}-${entry.key || idx}-s-${i}`,
              ruleUiId: rule.uiId,
              label: entry.label || rule.name,
              targetDate: formatted,
              isoDate: occDate.toISOString().slice(0, 10),
              timingExplanation: `Semi-annual on Day ${day} (#${i + 1})`,
              isOverdue: isPast,
            });
          }
        } else {
          const occDate = new Date(startYear + 1, startMonth, day);
          const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
          results.push({
            key: `${rule.uiId}-${entry.key || idx}`,
            ruleUiId: rule.uiId,
            label: entry.label || rule.name,
            targetDate: formatted,
            isoDate: occDate.toISOString().slice(0, 10),
            timingExplanation: `Annual cycle on Day ${day}`,
            isOverdue: occDate < now,
          });
        }
      } else if (expr.kind === 'RELATIVE_TO_SOURCE') {
        const source = expr.source && typeof expr.source === 'object' ? (expr.source as Record<string, unknown>) : {};
        const offset = typeof expr.offset === 'number' ? expr.offset : 0;
        const unit = expr.unit === 'BUSINESS_DAY' ? 'business days' : 'days';
        let targetDate: Date;
        let explanation = '';

        if (source.kind === 'COMPANY_FIELD') {
          const field = String(source.field ?? 'financialYearEnd');
          if (field === 'accountsDueDate' && companyContext?.accountsDueDate) {
            targetDate = new Date(companyContext.accountsDueDate);
            if (offset !== 0) {
              targetDate = addMonthsSafe(targetDate, offset);
            }
            explanation = offset < 0 ? `${Math.abs(offset)} month${Math.abs(offset) === 1 ? '' : 's'} before accounts due date` : `Sourced from accounts due date (${companyContext.accountsDueDate})`;
          } else if (field === 'financialYearEnd') {
            const fyeMonth = companyContext?.financialYearEndMonth ? companyContext.financialYearEndMonth - 1 : 11;
            const fyeDay = companyContext?.financialYearEndDay ?? 31;
            const refYear = startYear >= currentYear ? startYear : currentYear;
            const fye = new Date(refYear, fyeMonth, fyeDay);
            targetDate = addMonthsSafe(fye, offset || 7);
            explanation = `Relative to FYE (+${offset || 7} months)`;
          } else {
            targetDate = new Date(startYear + 1, startMonth, 1);
            explanation = `Relative to company ${field}`;
          }
        } else if (source.kind === 'CYCLE_END') {
          targetDate = new Date(startYear, 11, 31);
          targetDate.setDate(targetDate.getDate() + offset);
          explanation = `Cycle End + ${offset} ${unit}`;
        } else {
          targetDate = new Date(start);
          targetDate.setDate(targetDate.getDate() + (offset || 30));
          explanation = `Cycle Start + ${offset} ${unit}`;
        }

        const isPast = targetDate < now;
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(targetDate);
        results.push({
          key: `${rule.uiId}-${entry.key || idx}`,
          ruleUiId: rule.uiId,
          label: entry.label || rule.name,
          targetDate: formatted,
          isoDate: targetDate.toISOString().slice(0, 10),
          timingExplanation: isPast ? `${explanation} (Overdue Backlog)` : explanation,
          isOverdue: isPast,
        });
      } else {
        const occDate = new Date(startYear + 1, startMonth, 1);
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        results.push({
          key: `${rule.uiId}-${entry.key || idx}`,
          ruleUiId: rule.uiId,
          label: entry.label || rule.name,
          targetDate: formatted,
          isoDate: occDate.toISOString().slice(0, 10),
          timingExplanation: 'Standard milestone schedule',
          isOverdue: occDate < now,
        });
      }
    }
    return results;
  }

  // 2. Statutory / Default Rules without custom entries
  const nameLower = rule.name.toLowerCase();

  if (serviceCadence === 'MONTHLY' || nameLower.includes('monthly')) {
    for (let i = 0; i < 12; i++) {
      const occDate = new Date(startYear, startMonth + i, 15);
      const isPast = occDate < now;
      const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
      results.push({
        key: `${rule.uiId}-m-${i}`,
        ruleUiId: rule.uiId,
        label: rule.name,
        targetDate: formatted,
        isoDate: occDate.toISOString().slice(0, 10),
        timingExplanation: `Month ${i + 1} of 12`,
        isOverdue: isPast,
      });
    }
    return results;
  }

  if (serviceCadence === 'QUARTERLY' || nameLower.includes('quarterly') || nameLower.includes('gst') || nameLower.includes('f5')) {
    for (let i = 0; i < 4; i++) {
      const occDate = new Date(startYear, startMonth + (i + 1) * 3, 0);
      const isPast = occDate < now;
      const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
      results.push({
        key: `${rule.uiId}-q-${i}`,
        ruleUiId: rule.uiId,
        label: rule.name,
        targetDate: formatted,
        isoDate: occDate.toISOString().slice(0, 10),
        timingExplanation: `Quarter ${i + 1} of 4`,
        isOverdue: isPast,
      });
    }
    return results;
  }

  if (nameLower.includes('annual return') || nameLower.includes('ar filing')) {
    if (companyContext?.accountsDueDate) {
      let occDate = new Date(companyContext.accountsDueDate);
      let cycleIdx = 0;
      while (occDate <= horizonEnd && cycleIdx < 10) {
        const isPast = occDate < now;
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        results.push({
          key: `auto-${rule.uiId}-ar-${cycleIdx}`,
          ruleUiId: rule.uiId,
          label: rule.name,
          targetDate: formatted,
          isoDate: occDate.toISOString().slice(0, 10),
          timingExplanation: isPast
            ? `Sourced from accounts due date (Overdue Backlog: ${occDate.toISOString().slice(0, 10)})`
            : `Sourced from Company accounts due date (${occDate.toISOString().slice(0, 10)})`,
          isOverdue: isPast,
        });
        occDate = addMonthsSafe(occDate, 12);
        cycleIdx++;
      }
    } else {
      const fyeMonth = companyContext?.financialYearEndMonth ? companyContext.financialYearEndMonth - 1 : 11;
      const fyeDay = companyContext?.financialYearEndDay ?? 31;
      const fye = new Date(startYear, fyeMonth, fyeDay);
      let occDate = addMonthsSafe(fye, 7);
      let cycleIdx = 0;
      while (occDate <= horizonEnd && cycleIdx < 10) {
        const isPast = occDate < now;
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const fyeFormatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(addMonthsSafe(fye, cycleIdx * 12));
        results.push({
          key: `auto-${rule.uiId}-ar-fye-${cycleIdx}`,
          ruleUiId: rule.uiId,
          label: rule.name,
          targetDate: formatted,
          isoDate: occDate.toISOString().slice(0, 10),
          timingExplanation: isPast ? `7 months after FYE (${fyeFormatted}) (Overdue Backlog)` : `7 months after FYE (${fyeFormatted})`,
          isOverdue: isPast,
        });
        occDate = addMonthsSafe(occDate, 12);
        cycleIdx++;
      }
    }
    return results;
  }

  if (nameLower.includes('agm') || nameLower.includes('general meeting')) {
    if (companyContext?.accountsDueDate) {
      let occDate = addMonthsSafe(new Date(companyContext.accountsDueDate), -1);
      let cycleIdx = 0;
      while (occDate <= horizonEnd && cycleIdx < 10) {
        const isPast = occDate < now;
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        results.push({
          key: `auto-${rule.uiId}-agm-${cycleIdx}`,
          ruleUiId: rule.uiId,
          label: rule.name,
          targetDate: formatted,
          isoDate: occDate.toISOString().slice(0, 10),
          timingExplanation: isPast
            ? `1 month before accounts due date (Overdue Backlog: ${occDate.toISOString().slice(0, 10)})`
            : `1 month before Company accounts due date (${occDate.toISOString().slice(0, 10)})`,
          isOverdue: isPast,
        });
        occDate = addMonthsSafe(occDate, 12);
        cycleIdx++;
      }
    } else {
      const fyeMonth = companyContext?.financialYearEndMonth ? companyContext.financialYearEndMonth - 1 : 11;
      const fyeDay = companyContext?.financialYearEndDay ?? 31;
      const fye = new Date(startYear, fyeMonth, fyeDay);
      let occDate = addMonthsSafe(fye, 6);
      let cycleIdx = 0;
      while (occDate <= horizonEnd && cycleIdx < 10) {
        const isPast = occDate < now;
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const fyeFormatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(addMonthsSafe(fye, cycleIdx * 12));
        results.push({
          key: `auto-${rule.uiId}-agm-fye-${cycleIdx}`,
          ruleUiId: rule.uiId,
          label: rule.name,
          targetDate: formatted,
          isoDate: occDate.toISOString().slice(0, 10),
          timingExplanation: isPast ? `6 months after FYE (${fyeFormatted}) (Overdue Backlog)` : `6 months after FYE (${fyeFormatted})`,
          isOverdue: isPast,
        });
        occDate = addMonthsSafe(occDate, 12);
        cycleIdx++;
      }
    }
    return results;
  }

  // General annual fallback (e.g. Tax / ECI / others)
  let occDate = new Date(startYear + 1, startMonth, 1);
  let cycleIdx = 0;
  while (occDate <= horizonEnd && cycleIdx < 10) {
    const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
    results.push({
      key: `auto-${rule.uiId}-fallback-${cycleIdx}`,
      ruleUiId: rule.uiId,
      label: rule.name,
      targetDate: formatted,
      isoDate: occDate.toISOString().slice(0, 10),
      timingExplanation: `Annual cycle due date (${occDate.getFullYear()})`,
      isOverdue: occDate < now,
    });
    occDate = addMonthsSafe(occDate, 12);
    cycleIdx++;
  }
  return results;
}

export interface ProjectedBillingItem {
  key: string;
  feeUiId: string;
  description: string;
  amount: string;
  currency: string;
  frequency: string;
  billingDate: string;
  isoDate: string;
  timingExplanation: string;
}

export function calculateActualBillingPreview(
  fees: OperationalServiceValues['fees'],
  serviceStartDate: string,
): ProjectedBillingItem[] {
  const start = serviceStartDate ? new Date(serviceStartDate) : new Date();
  const startYear = !Number.isNaN(start.getFullYear()) ? start.getFullYear() : 2026;
  const startMonth = !Number.isNaN(start.getMonth()) ? start.getMonth() : 7;
  const startDay = !Number.isNaN(start.getDate()) ? start.getDate() : 1;

  const results: ProjectedBillingItem[] = [];

  for (const [idx, fee] of fees.entries()) {
    if (!fee.description.trim() && Number(fee.amount) <= 0 && !fee.billingStartDate) continue;

    const feeStartStr = fee.billingStartDate || serviceStartDate || '';
    const feeStart = feeStartStr ? new Date(feeStartStr) : new Date(startYear, startMonth, startDay);
    const fYear = !Number.isNaN(feeStart.getFullYear()) ? feeStart.getFullYear() : startYear;
    const fMonth = !Number.isNaN(feeStart.getMonth()) ? feeStart.getMonth() : startMonth;
    const fDay = !Number.isNaN(feeStart.getDate()) ? feeStart.getDate() : startDay;

    const freq = fee.billingFrequency || 'ONE_TIME';
    const freqLabel = FEE_FREQUENCY_OPTIONS.find((o) => o.value === freq)?.label ?? freq;
    const desc = fee.description.trim() || `Fee ${idx + 1}`;
    const amt = fee.amount.trim() || '0.00';
    const curr = fee.currency || 'SGD';

    if (freq === 'MONTHLY') {
      // Show next 12 monthly occurrences
      for (let i = 0; i < 12; i++) {
        const occDate = new Date(fYear, fMonth + i, fDay);
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const iso = occDate.toISOString().slice(0, 10);
        results.push({
          key: `${fee.uiId}-occ-${i}`,
          feeUiId: fee.uiId,
          description: desc,
          amount: amt,
          currency: curr,
          frequency: 'Monthly',
          billingDate: formatted,
          isoDate: iso,
          timingExplanation: `Month ${i + 1} of 12`,
        });
      }
    } else if (freq === 'QUARTERLY') {
      // Show 4 quarterly occurrences
      for (let i = 0; i < 4; i++) {
        const occDate = new Date(fYear, fMonth + i * 3, fDay);
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const iso = occDate.toISOString().slice(0, 10);
        results.push({
          key: `${fee.uiId}-occ-${i}`,
          feeUiId: fee.uiId,
          description: desc,
          amount: amt,
          currency: curr,
          frequency: 'Quarterly',
          billingDate: formatted,
          isoDate: iso,
          timingExplanation: `Quarter ${i + 1} of 4`,
        });
      }
    } else if (freq === 'SEMI_ANNUALLY') {
      // Show 2 semi-annual occurrences
      for (let i = 0; i < 2; i++) {
        const occDate = new Date(fYear, fMonth + i * 6, fDay);
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const iso = occDate.toISOString().slice(0, 10);
        results.push({
          key: `${fee.uiId}-occ-${i}`,
          feeUiId: fee.uiId,
          description: desc,
          amount: amt,
          currency: curr,
          frequency: 'Semi-annually',
          billingDate: formatted,
          isoDate: iso,
          timingExplanation: `Semi-annual #${i + 1}`,
        });
      }
    } else if (freq === 'ANNUALLY') {
      // Show 2 annual occurrences
      for (let i = 0; i < 2; i++) {
        const occDate = new Date(fYear + i, fMonth, fDay);
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const iso = occDate.toISOString().slice(0, 10);
        results.push({
          key: `${fee.uiId}-occ-${i}`,
          feeUiId: fee.uiId,
          description: desc,
          amount: amt,
          currency: curr,
          frequency: 'Annually',
          billingDate: formatted,
          isoDate: iso,
          timingExplanation: i === 0 ? 'Annual billing (Year 1)' : 'Annual billing (Year 2)',
        });
      }
    } else if (freq === 'CUSTOM') {
      const interval = fee.scheduleConfig?.customInterval?.count ?? 1;
      const count = Math.max(1, Math.min(12, Math.floor(12 / interval) || 1));
      for (let i = 0; i < count; i++) {
        const occDate = new Date(fYear, fMonth + i * interval, fDay);
        const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
        const iso = occDate.toISOString().slice(0, 10);
        results.push({
          key: `${fee.uiId}-occ-${i}`,
          feeUiId: fee.uiId,
          description: desc,
          amount: amt,
          currency: curr,
          frequency: 'Custom',
          billingDate: formatted,
          isoDate: iso,
          timingExplanation: `Every ${interval} month${interval === 1 ? '' : 's'} (#${i + 1})`,
        });
      }
    } else {
      // ONE_TIME
      const occDate = new Date(fYear, fMonth, fDay);
      const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(occDate);
      const iso = occDate.toISOString().slice(0, 10);
      results.push({
        key: `${fee.uiId}-occ-0`,
        feeUiId: fee.uiId,
        description: desc,
        amount: amt,
        currency: curr,
        frequency: freqLabel,
        billingDate: formatted,
        isoDate: iso,
        timingExplanation: 'One-time fee',
      });
    }
  }

  return results;
}

function scheduleConfigForFee(fee: OperationalServiceValues['fees'][number], fallbackStartDate = ''): BillingScheduleConfigV1 {
  const cadence = fee.billingFrequency || 'CUSTOM';
  const interval = BILLING_INTERVALS[cadence];
  const existingScheduleConfig = fee.scheduleConfig;
  const existingCustomIntervalCount = existingScheduleConfig?.customInterval?.count ?? 1;
  if (existingScheduleConfig) return existingScheduleConfig;
  try {
    const canonical = canonicalizeBillingSchedule({
      billingFrequency: cadence,
      billingStartDate: fee.billingStartDate || fallbackStartDate || null,
      customFrequencyLabel: fee.customFrequencyLabel || null,
      scheduleConfig: fee.scheduleConfig,
    });
    if (canonical) return canonical;
  } catch {
    // Keep an invalid migrated value editable; save validation reports the
    // precise compatibility/materialization issue to the form.
  }
  return {
    schemaVersion: 1,
    cadence: cadence as BillingScheduleConfigV1['cadence'],
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(fee.billingStartDate || fallbackStartDate)
      ? (fee.billingStartDate || fallbackStartDate) as BillingScheduleConfigV1['startDate']
      : null,
    customInterval: interval === null ? (cadence === 'CUSTOM' ? { unit: 'MONTH', count: existingCustomIntervalCount } : null) : { unit: 'MONTH', count: interval },
    scheduleEntries: /^\d{4}-\d{2}-\d{2}$/.test(fee.billingStartDate || fallbackStartDate)
      ? [{
        key: 'default',
        label: 'Billing date',
        expression: { kind: 'DAY_OF_MONTH', day: Number((fee.billingStartDate || fallbackStartDate).slice(8, 10)) },
        businessDayAdjustment: 'NONE',
      }]
      : [],
  };
}

function SelectField({
  id,
  label,
  error,
  tooltip,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  error?: string;
  tooltip?: ReactNode;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="label">
          {label}
        </label>
        {tooltip ? (
          <Tooltip content={tooltip}>
            <span className="inline-flex cursor-help text-text-muted hover:text-text-secondary">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{label} help</span>
            </span>
          </Tooltip>
        ) : null}
      </div>
      <select
        id={id}
        className={`input input-sm w-full ${error ? 'border-status-error' : ''}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        {...props}
      >
        {children}
      </select>
      {error ? <p id={errorId} className="mt-1.5 text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

function OperationalFieldValue({
  field,
  disabled,
  error,
  onChange,
}: {
  field: OperationalServiceValues['fields'][number];
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.uiId}-value`;
  const errorId = `${id}-error`;
  const label = field.label.trim() || field.key.trim() || 'Field value';
  const accessibility = {
    id,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': error ? errorId : undefined,
  } as const;

  if (field.type === 'date') {
    return (
      <SingleDateInput
        id={id}
        label={label}
        disabled={disabled}
        value={field.value}
        error={error}
        onChange={onChange}
      />
    );
  }

  let control: ReactNode;
  if (field.type === 'textarea') {
    control = <textarea {...accessibility} className="input input-sm min-h-24 px-3 py-2" disabled={disabled} value={field.value} onChange={(event) => onChange(event.target.value)} />;
  } else if (field.type === 'boolean') {
    control = (
      <select {...accessibility} className="input input-sm" disabled={disabled} value={field.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else {
    control = (
      <input
        {...accessibility}
        className="input input-sm"
        type="text"
        inputMode={field.type === 'number' || field.type === 'currency' ? 'decimal' : undefined}
        disabled={disabled}
        value={field.value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {control}
      {error ? <p id={errorId} className="mt-1.5 text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

function DeadlineParameterValue({
  rule,
  parameter,
  disabled,
  onChange,
}: {
  rule: OperationalServiceValues['deadlineRules'][number];
  parameter: OperationalServiceValues['deadlineRules'][number]['parameters'][number];
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = `deadline-${rule.uiId}-${parameter.key}`;
  const value = rule.parameterValues[parameter.key];
  const options = parameter.validation && typeof parameter.validation === 'object' && !Array.isArray(parameter.validation) && 'options' in parameter.validation && Array.isArray(parameter.validation.options)
    ? parameter.validation.options.filter((option): option is string => typeof option === 'string')
    : [];
  if (parameter.type === 'BOOLEAN') {
    return <div><label htmlFor={id} className="label">{parameter.label}</label><select id={id} className="input input-sm w-full" disabled={disabled} value={typeof value === 'boolean' ? String(value) : ''} onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></select></div>;
  }
  if (parameter.type === 'ENUM') {
    return <div><label htmlFor={id} className="label">{parameter.label}</label><select id={id} className="input input-sm w-full" disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)}><option value="">Select {parameter.label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
  }
  if (parameter.type === 'DATE') {
    return (
      <SingleDateInput
        id={id}
        label={parameter.label}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        hint={parameter.helpText ?? undefined}
        onChange={(next) => onChange(next || undefined)}
      />
    );
  }
  const isNumber = parameter.type === 'INTEGER' || parameter.type === 'DECIMAL';
  const inputValue = value === undefined || value === null ? '' : String(value);
  return <div><label htmlFor={id} className="label">{parameter.label}</label><input id={id} className="input input-sm" type="text" inputMode={isNumber ? 'decimal' : undefined} disabled={disabled} value={inputValue} onChange={(event) => {
    const next = event.target.value;
    if (!next) onChange(undefined);
    else if (parameter.type === 'INTEGER') onChange(Number.parseInt(next, 10));
    else if (parameter.type === 'DECIMAL') onChange(Number.parseFloat(next));
    else onChange(next);
  }} />{parameter.helpText ? <p className="mt-1 text-xs text-text-secondary">{parameter.helpText}</p> : null}</div>;
}

export interface OperationalServiceFormProps {
  mode?: 'create' | 'edit';
  values: OperationalServiceValues;
  onChange: Dispatch<SetStateAction<OperationalServiceValues>>;
  errors: Record<string, string | undefined>;
  disabled?: boolean;
  sectionsDisabled?: boolean;
  serviceSelector?: ReactNode;
  serviceHeader?: ReactNode;
  companyContext?: CompanyComplianceContext | null;
}

export function OperationalServiceForm({
  mode = 'edit',
  values,
  onChange,
  errors,
  disabled = false,
  sectionsDisabled = false,
  serviceSelector,
  serviceHeader,
  companyContext,
}: OperationalServiceFormProps) {
  const [billingHideConfirmationOpen, setBillingHideConfirmationOpen] = useState(false);
  const [userSelectedTab, setUserSelectedTab] = useState<'deadlines' | 'billing' | null>(null);
  const [expandedRuleIds, setExpandedRuleIds] = useState<Set<string>>(new Set());

  const activeRulesCount = values.deadlineRules.filter((r) => r.enabled).length;
  const activeFeesCount = values.billingDisposition === 'NOT_REQUIRED' ? 0 : values.fees.length;
  const activeTab = userSelectedTab ?? (values.deadlineRules.length > 0 ? 'deadlines' : 'billing');

  // Projected deadlines sorted chronologically by date using company compliance context (accountsDueDate, FYE)
  const projectedDeadlines = values.deadlineRules
    .filter((r) => r.enabled)
    .flatMap((r) => calculateActualDeadlinesPreview(r, values.startDate, values.serviceCadence, companyContext))
    .sort((a, b) => {
      if (!a.isoDate) return 1;
      if (!b.isoDate) return -1;
      return a.isoDate.localeCompare(b.isoDate);
    });

  // Projected billing items sorted chronologically by date
  const projectedBillingItems = calculateActualBillingPreview(values.fees, values.startDate).sort((a, b) => {
    if (!a.isoDate) return 1;
    if (!b.isoDate) return -1;
    return a.isoDate.localeCompare(b.isoDate);
  });

  const toggleExpandRule = (uiId: string) => {
    setExpandedRuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(uiId)) next.delete(uiId);
      else next.add(uiId);
      return next;
    });
  };

  const updateValue = <K extends keyof OperationalServiceValues>(key: K, value: OperationalServiceValues[K]) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  const requestBillingDisposition = (next: 'CONFIGURED' | 'NOT_REQUIRED') => {
    if (mode !== 'create' && next === 'NOT_REQUIRED' && values.fees.length > 0) {
      setBillingHideConfirmationOpen(true);
      return;
    }
    onChange((current) => ({
      ...current,
      billingDisposition: next,
      billingNotRequiredReason: next === 'CONFIGURED' ? '' : current.billingNotRequiredReason,
    }));
  };

  const confirmBillingHide = () => {
    setBillingHideConfirmationOpen(false);
    onChange((current) => ({ ...current, billingDisposition: 'NOT_REQUIRED' }));
  };

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 min-h-[520px]">
        {/* Left Panel: Service Details, Dates, Billing Disposition, and Service Fields */}
        <div className="space-y-4 lg:col-span-6">
          {/* Top Service tab header to align baseline with right panel */}
          <div className="flex border-b border-border-primary" role="tablist" aria-label="Service details header">
            <div className="flex items-center gap-2 border-b-2 border-oak-primary px-4 py-2.5 text-sm font-semibold text-oak-primary">
              <span>Service</span>
            </div>
          </div>

          {serviceHeader}
          {serviceSelector}

          <div className="space-y-4 rounded-xl border border-border-primary bg-background-primary p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-text-primary">Service Details</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                id="client-service-status"
                label="Status"
                disabled={disabled}
                value={values.status}
                onChange={(event) => updateValue('status', event.target.value as OperationalServiceValues['status'])}
              >
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="ENDED">Ended</option>
              </SelectField>
              <SelectField
                id="client-service-cadence"
                label="Cadence"
                tooltip="Choose how frequently this service recurs. Select 'Custom' to define a non-standard recurrence (e.g. Every 18 months)."
                disabled={disabled || sectionsDisabled}
                value={values.serviceCadence}
                onChange={(event) => updateValue('serviceCadence', event.target.value as OperationalServiceValues['serviceCadence'])}
              >
                {CADENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
              {values.serviceCadence === 'CUSTOM' ? (
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-1 mb-1">
                    <label htmlFor="client-service-custom-cadence" className="block text-xs font-medium text-text-secondary">
                      Custom cadence
                    </label>
                    <Tooltip content="Enter a descriptive cadence label for this service (e.g. 'Every 18 months' or 'Bi-monthly').">
                      <span className="inline-flex cursor-help text-text-muted hover:text-text-secondary">
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">Custom cadence help</span>
                      </span>
                    </Tooltip>
                  </div>
                  <FormInput
                    id="client-service-custom-cadence"
                    placeholder="e.g. Every 18 months"
                    disabled={disabled || sectionsDisabled}
                    value={values.customCadenceLabel}
                    error={errors.customCadenceLabel}
                    hint="Describe how frequently this service repeats (e.g. Every 18 months, Bi-monthly)."
                    onChange={(event) => updateValue('customCadenceLabel', event.target.value)}
                  />
                </div>
              ) : null}
              <SingleDateInput id="client-service-start-date" label="Start date" required disabled={disabled} value={values.startDate} error={errors.startDate} onChange={(next) => updateValue('startDate', next)} />
              <SingleDateInput id="client-service-end-date" label="End date" disabled={disabled} value={values.endDate} error={errors.endDate} onChange={(next) => updateValue('endDate', next)} />
            </div>
          </div>

          {/* Billing Tracker Section */}
          <div className="space-y-3 rounded-xl border border-border-primary bg-background-primary p-4 shadow-sm" aria-labelledby="billing-disposition-heading">
            <div>
              <h3 id="billing-disposition-heading" className="text-sm font-semibold text-text-primary">Billing Tracking</h3>
              <p className="mt-0.5 text-xs text-text-secondary">Choose how billing should be tracked for this service.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Billing disposition">
              <button
                type="button"
                className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${values.billingDisposition === 'CONFIGURED' ? 'border-oak-primary bg-oak-primary/10 text-text-primary' : 'border-border-primary bg-background-secondary text-text-secondary'}`}
                aria-label="Billing configured"
                aria-pressed={values.billingDisposition === 'CONFIGURED'}
                disabled={disabled || sectionsDisabled}
                onClick={() => requestBillingDisposition('CONFIGURED')}
              >
                <span className="font-medium">Billing configured</span>
                <span className="mt-0.5 block text-xs text-text-secondary">Track expected billing schedules.</span>
              </button>
              <button
                type="button"
                className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${values.billingDisposition === 'NOT_REQUIRED' ? 'border-oak-primary bg-oak-primary/10 text-text-primary' : 'border-border-primary bg-background-secondary text-text-secondary'}`}
                aria-label="No billing required"
                aria-pressed={values.billingDisposition === 'NOT_REQUIRED'}
                disabled={disabled || sectionsDisabled}
                onClick={() => requestBillingDisposition('NOT_REQUIRED')}
              >
                <span className="font-medium">No billing required</span>
                <span className="mt-0.5 block text-xs text-text-secondary">No fee schedules required.</span>
              </button>
            </div>
            {values.billingDisposition === 'UNREVIEWED' ? <Alert variant="warning" compact>Billing disposition needs review. Select Billing configured or No billing required before saving.</Alert> : null}
            {errors.billingDisposition ? <p role="alert" className="text-xs text-status-error">{errors.billingDisposition}</p> : null}
          </div>

          {/* Service Fields Section */}
          <div className="space-y-3 rounded-xl border border-border-primary bg-background-primary p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Service Fields</h3>
                <p className="text-xs text-text-secondary">Custom fields for operational tracking</p>
              </div>
              <Button size="xs" variant="secondary" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fields', [...values.fields, { uiId: uuid(), key: '', label: '', type: 'text', value: '', catalogDerived: false }])}>Add field</Button>
            </div>
            {values.fields.length === 0 ? <p className="text-xs text-text-secondary">No custom fields added.</p> : null}
            {values.fields.map((field, index) => (
              <div key={field.uiId} className="grid grid-cols-1 gap-2.5 rounded-lg border border-border-secondary bg-background-secondary/40 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <label htmlFor={`field-${field.uiId}-name`} className="label">Field name</label>
                  <input id={`field-${field.uiId}-name`} aria-label={`Field ${index + 1} name`} className="input input-sm" disabled={disabled || sectionsDisabled} value={field.key} onChange={(event) => updateValue('fields', values.fields.map((item) => item.uiId === field.uiId ? { ...item, key: event.target.value, label: item.catalogDerived ? item.label : event.target.value } : item))} />
                </div>
                <OperationalFieldValue field={field} disabled={disabled || sectionsDisabled} error={errors[`field-${field.uiId}-value`]} onChange={(value) => updateValue('fields', values.fields.map((item) => item.uiId === field.uiId ? { ...item, value } : item))} />
                <Button size="xs" variant="ghost" className="self-end" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fields', values.fields.filter((item) => item.uiId !== field.uiId))}>Remove</Button>
              </div>
            ))}
            {errors.fieldValues ? <p role="alert" className="text-xs text-status-error">{errors.fieldValues}</p> : null}
          </div>
        </div>

        {/* Right Panel: Tabs for Deadlines and Billing */}
        <div className="space-y-4 lg:col-span-6 min-h-[520px]">
          {/* Tab Navigation */}
          <div className="flex border-b border-border-primary" role="tablist" aria-label="Service configuration tabs">
            <button
              type="button"
              role="tab"
              id="tab-deadlines"
              aria-controls="panel-deadlines"
              aria-selected={activeTab === 'deadlines'}
              onClick={() => setUserSelectedTab('deadlines')}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30',
                activeTab === 'deadlines'
                  ? 'border-oak-primary font-semibold text-oak-primary'
                  : 'border-transparent text-text-secondary hover:border-border-secondary hover:text-text-primary'
              )}
            >
              <span>Deadline</span>
              <span className={cn(
                'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold',
                activeTab === 'deadlines' ? 'bg-oak-primary text-white' : 'border border-border-primary bg-background-elevated text-text-secondary'
              )}>
                {activeRulesCount}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-billing"
              aria-controls="panel-billing"
              aria-selected={activeTab === 'billing'}
              onClick={() => setUserSelectedTab('billing')}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30',
                activeTab === 'billing'
                  ? 'border-oak-primary font-semibold text-oak-primary'
                  : 'border-transparent text-text-secondary hover:border-border-secondary hover:text-text-primary'
              )}
            >
              <span>Billing</span>
              <span className={cn(
                'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold',
                activeTab === 'billing' ? 'bg-oak-primary text-white' : 'border border-border-primary bg-background-elevated text-text-secondary'
              )}>
                {activeFeesCount}
              </span>
            </button>
          </div>

          {/* Deadlines Tab */}
          {activeTab === 'deadlines' ? (
            <div id="panel-deadlines" role="tabpanel" aria-labelledby="tab-deadlines" className="space-y-4">
              {errors.deadlineRules ? <p role="alert" className="text-xs text-status-error">{errors.deadlineRules}</p> : null}

              {/* Top Section: Configured Rules List (Collapsed by default, expand on click) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">Configured Rules</h4>
                    <p className="text-xs text-text-secondary">Toggle rules on/off or click a rule to customize parameters and schedule</p>
                  </div>
                  <span className="text-xs text-text-muted">{values.deadlineRules.length} rule{values.deadlineRules.length === 1 ? '' : 's'}</span>
                </div>

                {values.deadlineRules.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-primary p-8 text-center text-text-secondary">
                    <p className="text-sm">No deadline rules are associated with this service.</p>
                  </div>
                ) : null}

                {values.deadlineRules.map((rule) => {
                  const hasCustomSchedule = (rule.scheduleEntries?.length ?? 0) > 0;
                  const hasParameters = rule.parameters.length > 0;
                  const isExpandable = hasCustomSchedule || hasParameters;
                  const isExpanded = isExpandable && expandedRuleIds.has(rule.uiId);
                  const updateRule = (changes: Partial<typeof rule>) => updateValue('deadlineRules', values.deadlineRules.map((item) => item.uiId === rule.uiId ? { ...item, ...changes } : item));
                  const updateParameters = (key: string, value: unknown) => updateRule({ parameterValues: value === undefined ? Object.fromEntries(Object.entries(rule.parameterValues).filter(([k]) => k !== key)) : { ...rule.parameterValues, [key]: value }, parameterProvenance: value === undefined ? Object.fromEntries(Object.entries(rule.parameterProvenance).filter(([k]) => k !== key)) as typeof rule.parameterProvenance : { ...rule.parameterProvenance, [key]: rule.parameterProvenance[key] ?? 'CLIENT_OVERRIDE' } });

                  return (
                    <article
                      key={rule.uiId}
                      className={cn(
                        'rounded-xl border transition-colors overflow-hidden',
                        rule.enabled
                          ? 'border-border-primary bg-background-primary shadow-sm'
                          : 'border-border-primary/60 bg-background-secondary/40 opacity-75'
                      )}
                    >
                      {/* Header Row: Only expandable if parameters or custom schedule exist */}
                      <div
                        onClick={isExpandable ? () => toggleExpandRule(rule.uiId) : undefined}
                        className={cn(
                          'flex select-none items-center justify-between gap-3 p-3.5 transition-colors',
                          isExpandable ? 'cursor-pointer hover:bg-background-secondary/40' : 'cursor-default'
                        )}
                        role={isExpandable ? 'button' : undefined}
                        tabIndex={isExpandable ? 0 : undefined}
                        aria-expanded={isExpandable ? isExpanded : undefined}
                        onKeyDown={isExpandable ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpandRule(rule.uiId);
                          }
                        } : undefined}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {isExpandable ? (
                            <span className="text-text-muted hover:text-text-primary transition-colors">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 transition-transform" />
                              )}
                            </span>
                          ) : null}
                          <h4 className="truncate text-sm font-semibold text-text-primary">{rule.name}</h4>
                          {rule.enabled ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-full bg-background-elevated px-2 py-0.5 text-xs font-medium text-text-muted">
                              Disabled
                            </span>
                          )}
                        </div>

                        {/* Shift Add custom schedule button left of the active/inactive toggle */}
                        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            disabled={disabled || sectionsDisabled || !rule.enabled}
                            aria-label={`Add custom schedule for ${rule.name}`}
                            onClick={() => {
                              if (!expandedRuleIds.has(rule.uiId)) {
                                setExpandedRuleIds((prev) => new Set(prev).add(rule.uiId));
                              }
                              const key = `entry-${crypto.randomUUID().slice(0, 8)}`;
                              const newEntry: ScheduleEntryInput = {
                                key,
                                label: rule.name || 'Custom deadline entry',
                                expression: { kind: 'DAY_OF_MONTH' as const, day: 1 },
                                businessDayAdjustment: 'NONE' as const,
                              };
                              updateRule({
                                scheduleEntries: [...(rule.scheduleEntries ?? []), newEntry],
                              });
                            }}
                          >
                            Add custom schedule
                          </Button>
                          <Toggle
                            size="sm"
                            ariaLabel={`Enable ${rule.name}`}
                            checked={rule.enabled}
                            disabled={disabled || sectionsDisabled}
                            onChange={(checked) => updateRule({ enabled: checked })}
                          />
                        </div>
                      </div>

                      {rule.applicabilityState && !['PENDING_EVALUATION', 'APPLICABLE'].includes(rule.applicabilityState) ? (
                        <div className="px-3.5 pb-2">
                          <p role="status" className="text-xs text-status-warning">{rule.applicabilityReason ?? (rule.applicabilityState === 'MISSING_INPUT' ? 'Required inputs are missing.' : 'This rule does not apply to the company.')}</p>
                        </div>
                      ) : null}

                      {/* Expanded Section (Parameters & Schedule Entries) */}
                      {isExpanded && (
                        <div className="border-t border-border-secondary p-4 space-y-4 bg-background-secondary/20 animate-fade-in">
                          {rule.parameters.length > 0 ? (
                            <div className="space-y-2">
                              <h5 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Rule Parameters</h5>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {rule.parameters.map((parameter) => (
                                  <div key={parameter.key} className="space-y-1">
                                    <DeadlineParameterValue rule={rule} parameter={parameter} disabled={disabled || sectionsDisabled} onChange={(value) => updateParameters(parameter.key, value)} />
                                    <label htmlFor={`deadline-${rule.uiId}-${parameter.key}-source`} className="sr-only">{parameter.label} provenance</label>
                                    <select id={`deadline-${rule.uiId}-${parameter.key}-source`} className="input input-sm w-full" disabled={disabled || sectionsDisabled || !(parameter.key in rule.parameterValues)} value={rule.parameterProvenance[parameter.key] ?? 'CLIENT_OVERRIDE'} onChange={(event) => updateRule({ parameterProvenance: { ...rule.parameterProvenance, [parameter.key]: event.target.value as typeof rule.parameterProvenance[typeof parameter.key] } })}>
                                      <option value="CLIENT_OVERRIDE">Client override</option>
                                      <option value="CATALOG_DEFAULT">Catalog default</option>
                                      <option value="COMPANY">Company source</option>
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <ScheduleEntryEditor
                            value={rule.scheduleEntries}
                            disabled={disabled || sectionsDisabled}
                            hideHeader
                            hideAddButton
                            onChange={(scheduleEntries) => updateRule({ scheduleEntries })}
                          />
                        </div>
                      )}
                      {errors[`deadline-rule-${rule.uiId}-schedule`] ? <div className="px-3.5 pb-3"><p role="alert" className="text-xs text-status-error">{errors[`deadline-rule-${rule.uiId}-schedule`]}</p></div> : null}
                    </article>
                  );
                })}
              </div>

              {/* Bottom Section: Actual Calculated Deadlines Preview (Sorted Chronologically in subtle blue) */}
              {values.deadlineRules.some((r) => r.enabled) ? (
                <div className="space-y-3 rounded-xl border border-blue-200/80 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                      <h4 className="text-sm font-semibold text-text-primary">Deadlines Preview</h4>
                    </div>
                    <span className="rounded-full border border-blue-200 bg-blue-100/80 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      {projectedDeadlines.length} scheduled milestone{projectedDeadlines.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Projected statutory deadlines and filing milestones based on start date ({values.startDate ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(values.startDate)) : 'not set'}):
                  </p>
                  {projectedDeadlines.length === 0 ? (
                    <p className="text-xs text-text-muted italic">No active deadline rules enabled to preview.</p>
                  ) : (
                    <div className="divide-y divide-blue-100/80 rounded-lg border border-blue-200/70 overflow-hidden bg-background-primary/80 dark:divide-blue-900/30 dark:border-blue-900/40 dark:bg-background-secondary/60">
                      {projectedDeadlines.map((item) => (
                        <div
                          key={item.key}
                          className={cn(
                            'flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 transition-colors',
                            item.isOverdue
                              ? 'bg-red-50/90 border-l-4 border-l-red-500 border-b border-red-100 hover:bg-red-100/80 dark:bg-red-950/30 dark:border-red-900/40 dark:border-l-red-500'
                              : 'hover:bg-blue-50/70 dark:hover:bg-blue-950/40'
                          )}
                        >
                          <div className="flex flex-col min-w-[200px] flex-1">
                            <span className={cn('font-semibold text-xs', item.isOverdue ? 'text-red-900 dark:text-red-200' : 'text-text-primary')}>
                              {item.label}
                            </span>
                            <span className={cn('text-[11px]', item.isOverdue ? 'text-red-700 font-medium dark:text-red-300' : 'text-text-muted')}>
                              {item.timingExplanation}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-2xs',
                                item.isOverdue
                                  ? 'border-red-300 bg-red-100/90 text-red-800 dark:border-red-800 dark:bg-red-950/80 dark:text-red-300'
                                  : 'border-blue-200 bg-white text-blue-800 dark:border-blue-800 dark:bg-background-elevated dark:text-blue-300'
                              )}
                            >
                              {item.isOverdue ? (
                                <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                              ) : (
                                <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              )}
                              {item.targetDate}
                            </span>
                            {item.isOverdue ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100/90 border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:border-red-800 dark:text-red-300">
                                <AlertCircle className="h-3 w-3 text-red-500" />
                                Overdue Backlog
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Billing Tab */}
          {activeTab === 'billing' ? (
            <div id="panel-billing" role="tabpanel" aria-labelledby="tab-billing" className="space-y-4">
              {errors.feeLines ? <p role="alert" className="text-xs text-status-error">{errors.feeLines}</p> : null}
              {values.billingDisposition === 'NOT_REQUIRED' ? (
                <div className="rounded-xl border border-dashed border-border-primary p-8 text-center text-text-secondary">
                  <p className="font-medium text-text-primary">No billing required</p>
                  <p className="mt-1 text-xs text-text-secondary">Billing tracking is set to not required for this service. Active billing schedules are hidden.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">Fee Schedules</h4>
                        <p className="text-xs text-text-secondary">Define recurring or one-time fees for this client service</p>
                      </div>
                      <Button size="xs" variant="secondary" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fees', [...values.fees, { uiId: uuid(), id: uuid(), description: '', amount: '0.00', currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: '', billingStartDate: '', scheduleConfig: null, catalogDerived: false }])}>Add fee</Button>
                    </div>
                    {values.fees.map((fee, index) => {
                      const prefix = `fee-${fee.uiId}`;
                      const updateFee = (changes: Partial<typeof fee>) => updateValue('fees', values.fees.map((item) => item.uiId === fee.uiId ? { ...item, ...changes } : item));
                      const scheduleConfig = scheduleConfigForFee(fee, values.startDate);
                      return (
                        <div key={fee.uiId} className="space-y-3 rounded-xl border border-border-primary bg-background-primary p-4 shadow-sm">
                          {/* Row 1: Description (70%) and Billing Start Date (30%) */}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                            <div className="sm:col-span-8">
                              <FormInput
                                id={`${prefix}-description`}
                                label="Description"
                                aria-label={`Fee ${index + 1} description`}
                                className="h-10 text-sm"
                                disabled={disabled || sectionsDisabled}
                                value={fee.description}
                                error={errors[`${prefix}-description`]}
                                onChange={(event) => updateFee({ description: event.target.value })}
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <SingleDateInput
                                id={`${prefix}-billing-start-date`}
                                label="Billing start date"
                                ariaLabel={`Fee ${index + 1} billing start date`}
                                disabled={disabled || sectionsDisabled}
                                value={fee.billingStartDate}
                                error={errors[`${prefix}-billing-start-date`]}
                                onChange={(billingStartDate) => {
                                  const nextSchedule = scheduleConfigForFee({ ...fee, billingStartDate }, values.startDate);
                                  const effectiveStartDate = billingStartDate || values.startDate || null;
                                  updateFee({ billingStartDate, scheduleConfig: { ...nextSchedule, startDate: effectiveStartDate as BillingScheduleConfigV1['startDate'] | null } });
                                }}
                              />
                            </div>
                          </div>

                          {/* Row 2: Currency (smallest), Amount, Frequency (+ Custom interval months if custom), Remove button */}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
                            <div className="sm:col-span-2">
                              <FormInput
                                id={`${prefix}-currency`}
                                label="Currency"
                                aria-label={`Fee ${index + 1} currency`}
                                className="uppercase"
                                maxLength={3}
                                disabled={disabled || sectionsDisabled}
                                value={fee.currency}
                                error={errors[`${prefix}-currency`]}
                                onChange={(event) => updateFee({ currency: event.target.value.toUpperCase() })}
                              />
                            </div>
                            <div className={fee.billingFrequency === 'CUSTOM' ? 'sm:col-span-3' : 'sm:col-span-4'}>
                              <FormInput
                                id={`${prefix}-amount`}
                                label="Amount"
                                aria-label={`Fee ${index + 1} amount`}
                                inputMode="decimal"
                                disabled={disabled || sectionsDisabled}
                                value={fee.amount}
                                error={errors[`${prefix}-amount`]}
                                onChange={(event) => updateFee({ amount: event.target.value })}
                              />
                            </div>
                            <div className={fee.billingFrequency === 'CUSTOM' ? 'sm:col-span-3' : 'sm:col-span-4'}>
                              <SelectField
                                id={`${prefix}-frequency`}
                                label="Frequency"
                                aria-label={`Fee ${index + 1} frequency`}
                                tooltip="Select the billing cycle for this fee. Choose 'Custom' to define a non-standard month interval."
                                disabled={disabled || sectionsDisabled}
                                value={fee.billingFrequency}
                                error={errors[`${prefix}-frequency`]}
                                onChange={(event) => {
                                  const billingFrequency = event.target.value as typeof fee.billingFrequency;
                                  const nextFee = { ...fee, billingFrequency };
                                  const nextSchedule = scheduleConfigForFee(nextFee, values.startDate);
                                  const customIntervalCount = fee.billingFrequency === 'CUSTOM'
                                    ? fee.scheduleConfig?.customInterval?.count ?? 1
                                    : 1;
                                  updateFee({
                                    billingFrequency,
                                    scheduleConfig: {
                                      ...nextSchedule,
                                      cadence: billingFrequency === '' ? 'CUSTOM' : billingFrequency as BillingScheduleConfigV1['cadence'],
                                      customInterval: billingFrequency === '' || billingFrequency === 'CUSTOM'
                                        ? { unit: 'MONTH', count: customIntervalCount }
                                        : BILLING_INTERVALS[billingFrequency] === null ? null : { unit: 'MONTH', count: BILLING_INTERVALS[billingFrequency]! },
                                    },
                                  });
                                }}
                              >
                                <option value="">Select frequency</option>
                                {FEE_FREQUENCY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </SelectField>
                            </div>
                            {fee.billingFrequency === 'CUSTOM' ? (
                              <div className="sm:col-span-2">
                                <FormInput
                                  id={`${prefix}-custom-interval-months`}
                                  label="Interval (months)"
                                  aria-label={`Fee ${index + 1} custom interval months`}
                                  type="number"
                                  min={1}
                                  max={120}
                                  disabled={disabled || sectionsDisabled}
                                  value={scheduleConfig.customInterval?.count ?? 1}
                                  hint="Months"
                                  onChange={(event) => updateFee({ scheduleConfig: { ...scheduleConfig, customInterval: { unit: 'MONTH', count: Number(event.target.value) } } })}
                                />
                              </div>
                            ) : null}
                            <div className={fee.billingFrequency === 'CUSTOM' ? 'sm:col-span-2 flex justify-end' : 'sm:col-span-2 flex justify-end'}>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="w-full sm:w-auto text-status-error hover:bg-status-error/10 border-status-error/30 hover:border-status-error/50 min-h-[38px]"
                                disabled={disabled || sectionsDisabled || values.fees.length === 1}
                                onClick={() => updateValue('fees', values.fees.filter((item) => item.uiId !== fee.uiId))}
                              >
                                Remove fee
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Section: Billing Preview (in subtle blue) */}
                  <div className="space-y-3 rounded-xl border border-blue-200/80 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                        <h4 className="text-sm font-semibold text-text-primary">Billing Preview</h4>
                      </div>
                      <span className="rounded-full border border-blue-200 bg-blue-100/80 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        {projectedBillingItems.length} billing item{projectedBillingItems.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Projected billing occurrences and schedule cycles:
                    </p>
                    {projectedBillingItems.length === 0 ? (
                      <p className="text-xs text-text-muted italic">No active fee schedules configured to preview.</p>
                    ) : (
                      <div className="divide-y divide-blue-100/80 rounded-lg border border-blue-200/70 overflow-hidden bg-background-primary/80 dark:divide-blue-900/30 dark:border-blue-900/40 dark:bg-background-secondary/60">
                        {projectedBillingItems.map((item) => (
                          <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 transition-colors">
                            <div className="flex flex-col min-w-[180px] flex-1">
                              <span className="font-semibold text-xs text-text-primary">{item.description}</span>
                              <span className="text-[11px] text-text-muted">{item.timingExplanation} · {item.currency} {item.amount}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-background-elevated dark:text-blue-300 shadow-2xs">
                                <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                {item.billingDate}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                {item.frequency}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        isOpen={billingHideConfirmationOpen}
        onClose={() => setBillingHideConfirmationOpen(false)}
        onConfirm={confirmBillingHide}
        title="Hide billing schedules?"
        description="This will archive the active billing schedules when you save this service. Existing billing history is preserved."
        confirmLabel="Hide schedules"
        variant="danger"
      />
    </>
  );
}
