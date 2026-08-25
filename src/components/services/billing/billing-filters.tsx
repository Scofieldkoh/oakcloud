'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FamilyFilterChips, type ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import { cn } from '@/lib/utils';
import type { BillingOccurrenceSearch } from '@/lib/validations/billing';

const STATUS_OPTIONS: Array<{ value: BillingOccurrenceSearch['statuses'][number]; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'BILLED', label: 'Billed' },
  { value: 'WAIVED', label: 'Waived' },
];

const TIMING_OPTIONS: Array<{ value: BillingOccurrenceSearch['timing'][number]; label: string }> = [
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'DUE', label: 'Due' },
  { value: 'OVERDUE', label: 'Overdue' },
];

export interface BillingFilterState {
  query: string;
  statuses: BillingOccurrenceSearch['statuses'];
  timing: BillingOccurrenceSearch['timing'];
  from: string;
  to: string;
  familyIds: string[];
}

interface BillingFiltersProps {
  value: BillingFilterState;
  families: ServiceFamilyFilter[];
  onChange: (value: BillingFilterState) => void;
  onReset?: () => void;
}

function toggle<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function BillingFilters({ value, families, onChange, onReset }: BillingFiltersProps) {
  const [queryDraft, setQueryDraft] = useState(value.query);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    setQueryDraft(value.query);
  }, [value.query]);

  useEffect(() => {
    if (queryDraft === value.query) return undefined;
    const timeout = window.setTimeout(() => {
      onChangeRef.current({ ...valueRef.current, query: queryDraft });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [queryDraft, value.query]);

  const hasFilters = Boolean(queryDraft || value.timing.length || value.familyIds.length || value.from || value.to);

  return (
    <section aria-label="Billing filters" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <span className="sr-only">Search company or fee line</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              aria-label="Search company or fee line"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Search company or fee line"
              className="min-h-11 w-full rounded-lg border border-border-primary bg-background-secondary py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20 sm:min-h-9"
            />
          </label>
          <div role="group" aria-label="Billing status filters" className="flex flex-wrap items-center gap-2">
            {STATUS_OPTIONS.map((option) => {
              const selected = value.statuses.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ ...value, statuses: toggle(value.statuses, option.value) })}
                  className={cn(
                    'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2 sm:min-h-9',
                    selected ? 'border-oak-primary bg-oak-primary text-white' : 'border-border-primary bg-background-secondary text-text-secondary hover:border-oak-primary hover:text-text-primary',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border-primary bg-background-secondary px-3 text-xs text-text-secondary sm:min-h-9">
            <span>From</span>
            <input
              type="date"
              aria-label="Billing date from"
              value={value.from}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
              className="min-w-0 bg-transparent text-text-primary outline-none"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border-primary bg-background-secondary px-3 text-xs text-text-secondary sm:min-h-9">
            <span>To</span>
            <input
              type="date"
              aria-label="Billing date to"
              value={value.to}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
              className="min-w-0 bg-transparent text-text-primary outline-none"
            />
          </label>
          {hasFilters ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReset} leftIcon={<X className="h-4 w-4" />}>
              Reset filters
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-text-secondary">Timing</span>
        <div role="group" aria-label="Billing timing filters" className="flex flex-wrap gap-2">
          {TIMING_OPTIONS.map((option) => {
            const selected = value.timing.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...value, timing: toggle(value.timing, option.value) })}
                className={cn(
                  'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2 sm:min-h-9',
                  selected ? 'border-oak-primary bg-oak-primary/10 text-oak-primary' : 'border-border-primary bg-background-secondary text-text-secondary hover:border-oak-primary hover:text-text-primary',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {families.length > 0 ? (
        <div className="flex flex-wrap items-start gap-3">
          <span className="pt-2 text-xs font-medium text-text-secondary">Families</span>
          <FamilyFilterChips
            families={families}
            selectedIds={value.familyIds}
            onToggle={(familyId) => onChange({ ...value, familyIds: toggle(value.familyIds, familyId) })}
          />
        </div>
      ) : null}
    </section>
  );
}

export { STATUS_OPTIONS, TIMING_OPTIONS };
