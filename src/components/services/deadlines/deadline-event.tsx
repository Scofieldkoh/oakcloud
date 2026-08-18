'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getCompanyDisplayLabel } from '@/lib/company-display-label';
import type { DeadlineOccurrenceDto } from '@/services/deadline';

interface DeadlineEventProps {
  occurrence: DeadlineOccurrenceDto;
  compact?: boolean;
  onComplete?: (occurrence: DeadlineOccurrenceDto) => void;
  onWaive?: (occurrence: DeadlineOccurrenceDto) => void;
}

const typeLabels: Record<DeadlineOccurrenceDto['deadlineType'], string> = {
  STATUTORY: 'Statutory',
  CLIENT: 'Client',
  INTERNAL: 'Internal',
};

const timingLabels: Record<NonNullable<DeadlineOccurrenceDto['timingState']>, string> = {
  UPCOMING: 'Upcoming',
  DUE: 'Due today',
  OVERDUE: 'Overdue',
};

function dateLabel(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  const monthName = month
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]
    : undefined;
  return year && day && monthName ? `${day} ${monthName} ${year}` : value;
}

function milestoneLabel(occurrence: DeadlineOccurrenceDto): string {
  return occurrence.milestoneKey.replaceAll(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateLabel(occurrence: DeadlineOccurrenceDto): string {
  if (occurrence.status !== 'OPEN') return occurrence.status.charAt(0) + occurrence.status.slice(1).toLowerCase();
  return occurrence.timingState ? timingLabels[occurrence.timingState] : 'Open';
}

export function DeadlineEvent({ occurrence, compact = false, onComplete, onWaive }: DeadlineEventProps) {
  const [open, setOpen] = useState(false);
  const companyLabel = occurrence.company.displayLabel || getCompanyDisplayLabel(occurrence.company);
  const milestone = milestoneLabel(occurrence);
  const familyColor = occurrence.family.displayColor ?? '#58736a';
  const label = `${companyLabel} ${milestone}`;

  return (
    <div className={cn('relative min-w-0', compact && 'w-full')}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={cn(
          'flex min-h-11 w-full min-w-0 items-center gap-1 rounded-md border-l-4 px-2 text-left text-xs transition-colors',
          'border-border-primary bg-background-tertiary/70 text-text-primary hover:bg-background-tertiary',
          !compact && 'py-1.5',
        )}
        style={{ borderLeftColor: familyColor }}
        title={`${occurrence.company.name} — ${milestone}`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: familyColor }} />
        <span className="truncate font-medium">{companyLabel}</span>
        <span className="truncate text-text-secondary">· {milestone}</span>
        <span className="sr-only">{typeLabels[occurrence.deadlineType]}, {stateLabel(occurrence)}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={`${companyLabel} deadline details`}
          className="absolute left-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border-primary bg-background-elevated p-4 text-sm shadow-elevation-2"
        >
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-text-primary">{occurrence.company.name}</p>
              <p className="text-xs text-text-secondary">{companyLabel}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div><dt className="text-text-muted">Service</dt><dd className="text-text-primary">{occurrence.service.name || occurrence.service.variantName || '—'}</dd></div>
              <div><dt className="text-text-muted">Milestone</dt><dd className="text-text-primary">{milestone}</dd></div>
              <div><dt className="text-text-muted">Type</dt><dd className="text-text-primary">{typeLabels[occurrence.deadlineType]}</dd></div>
              <div><dt className="text-text-muted">State</dt><dd className="text-text-primary">{stateLabel(occurrence)}</dd></div>
              <div><dt className="text-text-muted">Calculated date</dt><dd className="text-text-primary">{dateLabel(occurrence.calculatedDueDate)}</dd></div>
              <div><dt className="text-text-muted">Operative date</dt><dd className="text-text-primary">{dateLabel(occurrence.operativeDueDate)}</dd></div>
              <div><dt className="text-text-muted">Source</dt><dd className="text-text-primary">{occurrence.origin === 'MANUAL_TRIGGER' ? 'Manual trigger' : `Rule ${occurrence.ruleVersionId.slice(0, 8)}`}</dd></div>
              <div><dt className="text-text-muted">Cycle</dt><dd className="text-text-primary">{occurrence.cycle?.periodKey || '—'}</dd></div>
            </dl>
            {occurrence.notes ? <p className="border-t border-border-primary pt-3 text-xs text-text-secondary"><span className="font-medium text-text-primary">Notes:</span> {occurrence.notes}</p> : null}
            {occurrence.status === 'OPEN' ? (
              <div className="flex flex-wrap gap-2 border-t border-border-primary pt-3">
                {onComplete ? <button type="button" className="min-h-11 rounded-lg border border-border-primary px-3 text-xs font-medium text-text-primary hover:bg-background-tertiary" onClick={() => onComplete(occurrence)}>Mark complete</button> : null}
                {onWaive ? <button type="button" className="min-h-11 rounded-lg border border-border-primary px-3 text-xs font-medium text-text-primary hover:bg-background-tertiary" onClick={() => onWaive(occurrence)}>Waive</button> : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { milestoneLabel };
