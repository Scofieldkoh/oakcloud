'use client';

import { useMemo } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import type { DeadlineRuleInput } from '@/lib/validations/service';
import type { CompanyData } from './deadline-builder-table';
import { cn } from '@/lib/utils';

export interface ChronologicalDeadlinePreviewProps {
  rules: DeadlineRuleInput[];
  companyData: CompanyData;
  serviceStartDate?: string;
}

interface PreviewDeadline {
  taskName: string;
  date: Date;
  dateString: string;
  warning?: string;
}

/**
 * Chronological view of all upcoming deadlines across all rules
 */
export function ChronologicalDeadlinePreview({
  rules,
  companyData,
  serviceStartDate,
}: ChronologicalDeadlinePreviewProps) {
  // Calculate all deadlines and sort chronologically
  const sortedDeadlines = useMemo(() => {
    const allDeadlines: PreviewDeadline[] = [];
    const warnings: string[] = [];

    rules.forEach((rule) => {
      if (!rule.taskName) return;

      try {
        if (rule.ruleType === 'FIXED_DATE') {
          if (!rule.specificDate) return;

          const baseDate = new Date(rule.specificDate);
          if (isNaN(baseDate.getTime())) return;

          // For recurring, show multiple occurrences
          if (rule.isRecurring && rule.frequency && rule.frequency !== 'ONE_TIME') {
            const occurrenceCount = Math.min(rule.generateOccurrences || 3, 5);
            for (let i = 0; i < occurrenceCount; i++) {
              const occurrence = new Date(baseDate);
              if (rule.frequency === 'MONTHLY') {
                occurrence.setMonth(occurrence.getMonth() + i);
              } else if (rule.frequency === 'QUARTERLY') {
                occurrence.setMonth(occurrence.getMonth() + (i * 3));
              } else if (rule.frequency === 'ANNUALLY') {
                occurrence.setFullYear(occurrence.getFullYear() + i);
              }
              allDeadlines.push({
                taskName: rule.taskName,
                date: occurrence,
                dateString: occurrence.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  weekday: 'short'
                }),
              });
            }
          } else {
            allDeadlines.push({
              taskName: rule.taskName,
              date: baseDate,
              dateString: baseDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                weekday: 'short'
              }),
            });
          }
        } else if (rule.ruleType === 'RULE_BASED') {
          if (!rule.anchorType) return;

          // Check for missing company data
          if (rule.anchorType === 'FYE') {
            if (companyData.fyeMonth === null || companyData.fyeMonth === undefined ||
                companyData.fyeDay === null || companyData.fyeDay === undefined) {
              warnings.push(`${rule.taskName}: Company FYE not set`);
              return;
            }

            // Calculate FYE-based dates (show next 3 years)
            const currentYear = new Date().getFullYear();
            for (let i = 0; i < 3; i++) {
              const fye = new Date(currentYear + i, companyData.fyeMonth - 1, companyData.fyeDay);
              const dueDate = new Date(fye);
              dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
              dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));

              allDeadlines.push({
                taskName: rule.taskName,
                date: dueDate,
                dateString: dueDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  weekday: 'short'
                }),
              });
            }
          } else if (rule.anchorType === 'INCORPORATION') {
            if (!companyData.incorporationDate) {
              warnings.push(`${rule.taskName}: Incorporation date not set`);
              return;
            }
            const incDate = new Date(companyData.incorporationDate);
            if (rule.isRecurring && rule.frequency && rule.frequency !== 'ONE_TIME') {
              const occurrenceCount = Math.min(rule.generateOccurrences || 3, 5);
              for (let i = 0; i < occurrenceCount; i++) {
                const occurrence = new Date(incDate);
                occurrence.setFullYear(occurrence.getFullYear() + i);
                occurrence.setMonth(occurrence.getMonth() + (rule.offsetMonths || 0));
                occurrence.setDate(occurrence.getDate() + (rule.offsetDays || 0));

                allDeadlines.push({
                  taskName: rule.taskName,
                  date: occurrence,
                  dateString: occurrence.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    weekday: 'short'
                  }),
                });
              }
            } else {
              const dueDate = new Date(incDate);
              dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
              dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));

              allDeadlines.push({
                taskName: rule.taskName,
                date: dueDate,
                dateString: dueDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  weekday: 'short'
                }),
              });
            }
          } else if (rule.anchorType === 'SERVICE_START') {
            if (!serviceStartDate) {
              warnings.push(`${rule.taskName}: Service start date not set`);
              return;
            }

            const startDate = new Date(serviceStartDate);
            if (rule.isRecurring && rule.frequency && rule.frequency !== 'ONE_TIME') {
              const occurrenceCount = Math.min(rule.generateOccurrences || 3, 5);
              for (let i = 0; i < occurrenceCount; i++) {
                const occurrence = new Date(startDate);
                if (rule.frequency === 'MONTHLY') {
                  occurrence.setMonth(occurrence.getMonth() + i);
                } else if (rule.frequency === 'QUARTERLY') {
                  occurrence.setMonth(occurrence.getMonth() + (i * 3));
                } else if (rule.frequency === 'ANNUALLY') {
                  occurrence.setFullYear(occurrence.getFullYear() + i);
                }
                occurrence.setMonth(occurrence.getMonth() + (rule.offsetMonths || 0));
                occurrence.setDate(occurrence.getDate() + (rule.offsetDays || 0));

                allDeadlines.push({
                  taskName: rule.taskName,
                  date: occurrence,
                  dateString: occurrence.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    weekday: 'short'
                  }),
                });
              }
            } else {
              const dueDate = new Date(startDate);
              dueDate.setMonth(dueDate.getMonth() + (rule.offsetMonths || 0));
              dueDate.setDate(dueDate.getDate() + (rule.offsetDays || 0));

              allDeadlines.push({
                taskName: rule.taskName,
                date: dueDate,
                dateString: dueDate.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  weekday: 'short'
                }),
              });
            }
          }
        }
      } catch {
        // Skip invalid rules silently
      }
    });

    // Sort by date
    allDeadlines.sort((a, b) => a.date.getTime() - b.date.getTime());

    return { deadlines: allDeadlines, warnings };
  }, [rules, companyData, serviceStartDate]);

  if (rules.length === 0) {
    return (
      <div className="p-6 text-center border-2 border-dashed border-border-secondary rounded-lg">
        <p className="text-sm text-text-muted">No deadlines configured</p>
      </div>
    );
  }

  return (
    <div>
      {/* Warnings */}
      {sortedDeadlines.warnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {sortedDeadlines.warnings.map((warning, index) => (
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

      {/* Chronological list */}
      {sortedDeadlines.deadlines.length > 0 ? (
        <div className="space-y-1">
          {sortedDeadlines.deadlines.map((deadline, index) => {
            const isPast = deadline.date < new Date();
            return (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-md transition-colors',
                  isPast
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'hover:bg-background-secondary'
                )}
              >
                <Calendar
                  className={cn(
                    'w-3.5 h-3.5 flex-shrink-0 mt-0.5',
                    isPast ? 'text-red-500' : 'text-oak-primary'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-xs font-medium truncate',
                      isPast ? 'text-red-700 dark:text-red-400' : 'text-text-primary'
                    )}
                  >
                    {deadline.taskName}
                  </p>
                  <p
                    className={cn(
                      'text-[10px]',
                      isPast ? 'text-red-600 dark:text-red-400' : 'text-text-muted'
                    )}
                  >
                    {deadline.dateString}
                    {isPast && ' (Past)'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 text-center border border-border-primary rounded-lg">
          <p className="text-xs text-text-muted">No preview dates available</p>
          <p className="text-[10px] text-text-muted mt-1">
            Check company FYE and service start date
          </p>
        </div>
      )}
    </div>
  );
}
