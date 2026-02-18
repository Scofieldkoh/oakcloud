'use client';

import { useMemo } from 'react';
import { Calendar, AlertCircle, RotateCcw, X } from 'lucide-react';
import type { DeadlineExclusionInput, DeadlineRuleInput } from '@/lib/validations/service';
import type { CompanyData } from './deadline-builder-table';
import { cn } from '@/lib/utils';

export interface ChronologicalDeadlinePreviewProps {
  rules: DeadlineRuleInput[];
  companyData: CompanyData;
  serviceStartDate?: string;
  highlightTaskName?: string | null;
  serverDeadlines?: Array<{ taskName: string; statutoryDueDate: string }>;
  serverWarnings?: string[];
  excludedDeadlines?: DeadlineExclusionInput[];
  onExcludeDeadline?: (deadline: DeadlineExclusionInput) => void;
  onRestoreExcludedDeadlines?: () => void;
  loading?: boolean;
  error?: string | null;
}

interface PreviewDeadline {
  taskName: string;
  date: Date;
  dateString: string;
  relativeLabel: string;
  isPast: boolean;
  isToday: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PREVIEW_PER_RULE = 12;
const MAX_RENDER_ITEMS = 24;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date: Date): string {
  const datePart = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${datePart}, ${weekday}`;
}

function formatRelativeLabel(dayDelta: number): string {
  if (dayDelta === 0) return 'today';
  if (dayDelta > 0) return `in ${dayDelta} day${dayDelta === 1 ? '' : 's'}`;
  const overdue = Math.abs(dayDelta);
  return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
}

function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const day = date.getDate();
  const targetIndex = monthIndex + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return new Date(targetYear, targetMonth, safeDay);
}

function applyOffset(baseDate: Date, rule: DeadlineRuleInput): Date {
  let shifted = addMonthsClamped(baseDate, rule.offsetMonths ?? 0);
  if (rule.offsetDays) {
    shifted = new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate() + rule.offsetDays);
  }
  return shifted;
}

function frequencyStepMonths(rule: DeadlineRuleInput): number {
  if (!rule.isRecurring) return 0;
  if (!rule.frequency || rule.frequency === 'ONE_TIME') return 0;
  if (rule.frequency === 'MONTHLY') return 1;
  if (rule.frequency === 'QUARTERLY') return 3;
  return 12;
}

function previewOccurrenceCount(rule: DeadlineRuleInput): number {
  if (!rule.isRecurring || !rule.frequency || rule.frequency === 'ONE_TIME') {
    return 1;
  }

  const fallback = rule.frequency === 'MONTHLY' ? 6 : rule.frequency === 'QUARTERLY' ? 6 : 4;
  const configured = rule.generateOccurrences ?? fallback;
  return Math.max(1, Math.min(configured, MAX_PREVIEW_PER_RULE));
}

function recurringDatesFromBase(baseDate: Date, rule: DeadlineRuleInput): Date[] {
  const count = previewOccurrenceCount(rule);
  const stepMonths = frequencyStepMonths(rule);

  if (count <= 1 || stepMonths === 0) {
    return [applyOffset(baseDate, rule)];
  }

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const occurrence = addMonthsClamped(baseDate, i * stepMonths);
    dates.push(applyOffset(occurrence, rule));
  }

  return dates;
}

function safeDate(dateInput: string | Date): Date | null {
  const candidate = new Date(dateInput);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate;
}

function quarterEndForOffset(baseDate: Date, offset: number): Date {
  const currentQuarter = Math.floor(baseDate.getMonth() / 3);
  const targetQuarter = currentQuarter + offset;
  const year = baseDate.getFullYear() + Math.floor(targetQuarter / 4);
  const quarterInYear = ((targetQuarter % 4) + 4) % 4;
  const quarterEndMonth = quarterInYear * 3 + 2;
  return new Date(year, quarterEndMonth + 1, 0);
}

function normalizeDeadlineExclusionKey(taskName: string, statutoryDueDate: string | Date): string | null {
  const normalizedTask = taskName.trim().toLowerCase();
  if (!normalizedTask) return null;
  const parsedDate = new Date(statutoryDueDate);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return `${normalizedTask}|${parsedDate.toISOString().split('T')[0]}`;
}

/**
 * Chronological view of all upcoming deadlines across all rules
 */
export function ChronologicalDeadlinePreview({
  rules,
  companyData,
  serviceStartDate,
  highlightTaskName,
  serverDeadlines,
  serverWarnings,
  excludedDeadlines = [],
  onExcludeDeadline,
  onRestoreExcludedDeadlines,
  loading = false,
  error = null,
}: ChronologicalDeadlinePreviewProps) {
  const excludedDeadlineKeySet = useMemo(
    () => new Set(
      excludedDeadlines
        .map((item) => normalizeDeadlineExclusionKey(item.taskName, item.statutoryDueDate))
        .filter((key): key is string => Boolean(key))
    ),
    [excludedDeadlines]
  );

  const previewData = useMemo(() => {
    if (serverDeadlines) {
      const rawDeadlines: Array<{ taskName: string; date: Date }> = [];
      serverDeadlines.forEach((deadline) => {
        const date = safeDate(deadline.statutoryDueDate);
        if (!date) return;
        rawDeadlines.push({ taskName: deadline.taskName, date });
      });

      rawDeadlines.sort((a, b) => a.date.getTime() - b.date.getTime());

      const today = startOfDay(new Date());
      const mappedDeadlines: PreviewDeadline[] = rawDeadlines.map((deadline) => {
        const dayDelta = Math.round((startOfDay(deadline.date).getTime() - today.getTime()) / DAY_MS);
        return {
          taskName: deadline.taskName,
          date: deadline.date,
          dateString: formatDate(deadline.date),
          relativeLabel: formatRelativeLabel(dayDelta),
          isPast: dayDelta < 0,
          isToday: dayDelta === 0,
        };
      });

      const filteredDeadlines = mappedDeadlines.filter((deadline) => {
        const key = normalizeDeadlineExclusionKey(deadline.taskName, deadline.date);
        return !key || !excludedDeadlineKeySet.has(key);
      });
      const visibleDeadlines = filteredDeadlines.slice(0, MAX_RENDER_ITEMS);
      const overdueCount = filteredDeadlines.filter((deadline) => deadline.isPast).length;

      return {
        deadlines: visibleDeadlines,
        warnings: serverWarnings ?? [],
        totalCount: filteredDeadlines.length,
        hiddenCount: Math.max(0, filteredDeadlines.length - visibleDeadlines.length),
        overdueCount,
      };
    }

    const rawDeadlines: Array<{ taskName: string; date: Date }> = [];
    const warningSet = new Set<string>();
    const now = new Date();

    rules.forEach((rule) => {
      const taskName = rule.taskName?.trim();
      if (!taskName) return;

      try {
        if (rule.ruleType === 'FIXED_DATE') {
          if (!rule.specificDate) {
            warningSet.add(`${taskName}: specific date not set`);
            return;
          }

          const fixedDate = safeDate(rule.specificDate);
          if (!fixedDate) {
            warningSet.add(`${taskName}: invalid specific date`);
            return;
          }

          recurringDatesFromBase(fixedDate, rule).forEach((date) => {
            rawDeadlines.push({ taskName, date });
          });
          return;
        }

        if (!rule.anchorType) {
          warningSet.add(`${taskName}: anchor type not set`);
          return;
        }

        if (rule.anchorType === 'FYE') {
          if (!companyData.fyeMonth || !companyData.fyeDay) {
            warningSet.add(`${taskName}: company FYE is not configured`);
            return;
          }

          const count = previewOccurrenceCount(rule);
          const baseYear = companyData.fyeYear ?? now.getFullYear();
          for (let i = 0; i < count; i++) {
            const anchor = new Date(
              baseYear + i,
              companyData.fyeMonth - 1,
              companyData.fyeDay
            );
            rawDeadlines.push({ taskName, date: applyOffset(anchor, rule) });
          }
          return;
        }

        if (rule.anchorType === 'INCORPORATION') {
          if (!companyData.incorporationDate) {
            warningSet.add(`${taskName}: incorporation date not set`);
            return;
          }

          const incorporationDate = safeDate(companyData.incorporationDate);
          if (!incorporationDate) {
            warningSet.add(`${taskName}: incorporation date is invalid`);
            return;
          }

          recurringDatesFromBase(incorporationDate, rule).forEach((date) => {
            rawDeadlines.push({ taskName, date });
          });
          return;
        }

        if (rule.anchorType === 'SERVICE_START') {
          if (!serviceStartDate) {
            warningSet.add(`${taskName}: service start date not set`);
            return;
          }

          const startDate = safeDate(serviceStartDate);
          if (!startDate) {
            warningSet.add(`${taskName}: service start date is invalid`);
            return;
          }

          recurringDatesFromBase(startDate, rule).forEach((date) => {
            rawDeadlines.push({ taskName, date });
          });
          return;
        }

        if (rule.anchorType === 'MONTH_END') {
          const count = previewOccurrenceCount(rule);
          for (let i = 0; i < count; i++) {
            const anchor = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
            rawDeadlines.push({ taskName, date: applyOffset(anchor, rule) });
          }
          return;
        }

        if (rule.anchorType === 'QUARTER_END') {
          const count = previewOccurrenceCount(rule);
          for (let i = 0; i < count; i++) {
            const anchor = quarterEndForOffset(now, i);
            rawDeadlines.push({ taskName, date: applyOffset(anchor, rule) });
          }
          return;
        }

        if (rule.anchorType === 'FIXED_CALENDAR') {
          const fixedMonth = rule.fixedMonth;
          const fixedDay = rule.fixedDay;

          if (!fixedMonth || !fixedDay) {
            warningSet.add(`${taskName}: fixed month/day not set`);
            return;
          }

          const count = previewOccurrenceCount(rule);
          for (let i = 0; i < count; i++) {
            const year = now.getFullYear() + i;
            const lastDayOfMonth = new Date(year, fixedMonth, 0).getDate();
            const safeDay = Math.min(fixedDay, lastDayOfMonth);
            const anchor = new Date(year, fixedMonth - 1, safeDay);
            rawDeadlines.push({ taskName, date: applyOffset(anchor, rule) });
          }
          return;
        }

        if (rule.anchorType === 'IPC_EXPIRY') {
          warningSet.add(`${taskName}: IPC expiry preview is shown after save`);
          return;
        }
      } catch {
        warningSet.add(`${taskName}: preview unavailable`);
      }
    });

    rawDeadlines.sort((a, b) => a.date.getTime() - b.date.getTime());

    const today = startOfDay(now);
    const mappedDeadlines: PreviewDeadline[] = rawDeadlines.map((deadline) => {
      const dayDelta = Math.round((startOfDay(deadline.date).getTime() - today.getTime()) / DAY_MS);
      return {
        taskName: deadline.taskName,
        date: deadline.date,
        dateString: formatDate(deadline.date),
        relativeLabel: formatRelativeLabel(dayDelta),
        isPast: dayDelta < 0,
        isToday: dayDelta === 0,
      };
    });

    const filteredDeadlines = mappedDeadlines.filter((deadline) => {
      const key = normalizeDeadlineExclusionKey(deadline.taskName, deadline.date);
      return !key || !excludedDeadlineKeySet.has(key);
    });
    const visibleDeadlines = filteredDeadlines.slice(0, MAX_RENDER_ITEMS);
    const overdueCount = filteredDeadlines.filter((deadline) => deadline.isPast).length;

    return {
      deadlines: visibleDeadlines,
      warnings: Array.from(warningSet),
      totalCount: filteredDeadlines.length,
      hiddenCount: Math.max(0, filteredDeadlines.length - visibleDeadlines.length),
      overdueCount,
    };
  }, [rules, companyData, serviceStartDate, serverDeadlines, serverWarnings, excludedDeadlineKeySet]);

  if (loading && !serverDeadlines) {
    return (
      <div className="p-6 text-center border border-border-primary rounded-lg">
        <p className="text-sm text-text-muted">Loading preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center border border-border-primary rounded-lg">
        <p className="text-sm text-text-muted">Preview unavailable</p>
        <p className="text-xs text-text-muted mt-1">{error}</p>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="p-6 text-center border-2 border-dashed border-border-secondary rounded-lg">
        <p className="text-sm text-text-muted">No deadlines configured</p>
      </div>
    );
  }

  return (
    <div>
      {previewData.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {previewData.warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-800 dark:text-amber-300">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {previewData.deadlines.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-text-muted">
              Showing {previewData.deadlines.length} of {previewData.totalCount} generated deadline{previewData.totalCount !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              {excludedDeadlines.length > 0 && onRestoreExcludedDeadlines && (
                <button
                  type="button"
                  onClick={onRestoreExcludedDeadlines}
                  className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo {excludedDeadlines.length} removed
                </button>
              )}
              {previewData.overdueCount > 0 && (
                <span className="text-[11px] text-red-600 dark:text-red-400">
                  {previewData.overdueCount} overdue
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {previewData.deadlines.map((deadline, index) => {
              const isHighlighted = Boolean(highlightTaskName) && (
                deadline.taskName === highlightTaskName ||
                deadline.taskName.startsWith(`${highlightTaskName} -`)
              );
              const isDimmed = Boolean(highlightTaskName) && !isHighlighted;
              const deadlineExclusion: DeadlineExclusionInput = {
                taskName: deadline.taskName,
                statutoryDueDate: deadline.date.toISOString(),
              };
              const deadlineKey = normalizeDeadlineExclusionKey(
                deadlineExclusion.taskName,
                deadlineExclusion.statutoryDueDate
              ) ?? `${deadline.taskName}|${deadline.dateString}|${index}`;
              return (
              <div
                key={deadlineKey}
                className={cn(
                  'flex items-start gap-2 p-3 rounded-md border transition-colors',
                  deadline.isPast
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50'
                    : deadline.isToday
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50'
                      : 'bg-background-primary border-border-primary/60 hover:bg-background-secondary/60',
                  isHighlighted && 'ring-1 ring-oak-primary/30 bg-oak-light/10 border-border-primary',
                  isDimmed && 'opacity-70'
                )}
              >
                <Calendar
                  className={cn(
                    'w-4 h-4 flex-shrink-0 mt-0.5',
                    deadline.isPast
                      ? 'text-red-500'
                      : deadline.isToday
                        ? 'text-amber-500'
                        : 'text-oak-primary'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium whitespace-normal break-words',
                      deadline.isPast ? 'text-red-700 dark:text-red-400' : 'text-text-primary'
                    )}
                  >
                    <span>{deadline.taskName}</span>
                    <span className="text-text-muted"> - {deadline.dateString} ({deadline.relativeLabel})</span>
                  </p>
                </div>
                {onExcludeDeadline && (
                  <button
                    type="button"
                    onClick={() => onExcludeDeadline(deadlineExclusion)}
                    className="text-text-muted hover:text-red-600 rounded-md p-1 transition-colors"
                    title="Remove this generated deadline"
                    aria-label={`Remove ${deadline.taskName} on ${deadline.dateString}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              );
            })}
          </div>

          {previewData.hiddenCount > 0 && (
            <div className="mt-2 text-center text-[10px] text-text-muted">
              +{previewData.hiddenCount} more dates not shown
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-center border border-border-primary rounded-lg">
          <p className="text-xs text-text-muted">No deadlines available yet</p>
          <p className="text-[10px] text-text-muted mt-1">
            Check company FYE, service start, and anchor settings
          </p>
        </div>
      )}
    </div>
  );
}
