'use client';

import { FamilyFilterChips, type ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import { cn } from '@/lib/utils';

export type DeadlineFilterType = 'STATUTORY' | 'CLIENT' | 'INTERNAL';
export type DeadlineFilterStatus = 'OPEN' | 'COMPLETED' | 'WAIVED' | 'CANCELLED';
export type DeadlineFilterOrigin = 'RULE' | 'MANUAL_TRIGGER';

export interface DeadlineInlineFilterValues {
  companyQuery: string;
  serviceQuery: string;
  milestoneQuery: string;
  from: string;
  to: string;
  type: DeadlineFilterType | '';
  status: DeadlineFilterStatus | '';
  origin: DeadlineFilterOrigin | '';
}

interface DeadlineFiltersProps {
  families: ServiceFamilyFilter[];
  selectedTypes: readonly DeadlineFilterType[];
  selectedFamilyIds: readonly string[];
  openOnly: boolean;
  onToggleType: (type: DeadlineFilterType) => void;
  onToggleFamily: (familyId: string) => void;
  onToggleOpenOnly: () => void;
  className?: string;
}

interface DeadlineInlineFiltersProps {
  values: DeadlineInlineFilterValues;
  onChange: (next: Partial<DeadlineInlineFilterValues>) => void;
  className?: string;
}

const typeLabels: Record<DeadlineFilterType, string> = {
  STATUTORY: 'Statutory',
  CLIENT: 'Client',
  INTERNAL: 'Internal',
};

const statusLabels: Record<DeadlineFilterStatus, string> = {
  OPEN: 'Open',
  COMPLETED: 'Completed',
  WAIVED: 'Waived',
  CANCELLED: 'Cancelled',
};

const originLabels: Record<DeadlineFilterOrigin, string> = {
  RULE: 'Rule',
  MANUAL_TRIGGER: 'Manual trigger',
};

/** Shared, intentionally unlabeled toolbar for table and calendar modes. */
export function DeadlineFilters({
  families,
  selectedTypes,
  selectedFamilyIds,
  openOnly,
  onToggleType,
  onToggleFamily,
  onToggleOpenOnly,
  className,
}: DeadlineFiltersProps) {
  return (
    <div
      role="group"
      aria-label="Deadline filters"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {(Object.keys(typeLabels) as DeadlineFilterType[]).map((type) => {
        const selected = selectedTypes.includes(type);
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleType(type)}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2',
              selected
                ? 'border-oak-primary bg-oak-primary text-white'
                : 'border-border-primary bg-background-secondary text-text-secondary hover:border-oak-primary/50 hover:text-text-primary',
            )}
          >
            {typeLabels[type]}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={openOnly}
        onClick={onToggleOpenOnly}
        className={cn(
          'inline-flex min-h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 focus-visible:ring-offset-2',
          openOnly
            ? 'border-oak-primary bg-oak-primary text-white'
            : 'border-border-primary bg-background-secondary text-text-secondary hover:border-oak-primary/50 hover:text-text-primary',
        )}
      >
        Open only
      </button>
      {families.length > 0 ? (
        <FamilyFilterChips
          families={families}
          selectedIds={selectedFamilyIds}
          onToggle={onToggleFamily}
        />
      ) : null}
    </div>
  );
}

function FilterField({
  label,
  value,
  type = 'search',
  placeholder = 'All',
  onChange,
}: {
  label: string;
  value: string;
  type?: 'search' | 'date';
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-secondary">
      <span>{label}</span>
      <input
        type={type}
        aria-label={`Filter ${label}`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full min-w-0 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20"
      />
    </label>
  );
}

/** Server-backed column/detail filters shared by table and calendar views. */
export function DeadlineInlineFilters({ values, onChange, className }: DeadlineInlineFiltersProps) {
  return (
    <div className={cn('rounded-xl border border-border-primary bg-background-secondary p-3 sm:p-4', className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="Company" value={values.companyQuery} onChange={(value) => onChange({ companyQuery: value })} />
        <FilterField label="Service" value={values.serviceQuery} onChange={(value) => onChange({ serviceQuery: value })} />
        <FilterField label="Milestone" value={values.milestoneQuery} onChange={(value) => onChange({ milestoneQuery: value })} />
        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
          <span>Type</span>
          <select
            aria-label="Filter Type"
            value={values.type}
            onChange={(event) => onChange({ type: event.target.value as DeadlineFilterType | '' })}
            className="min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary outline-none focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20"
          >
            <option value="">All types</option>
            {(Object.keys(typeLabels) as DeadlineFilterType[]).map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
          </select>
        </label>
        <FilterField label="Due from" type="date" value={values.from} onChange={(value) => onChange({ from: value })} />
        <FilterField label="Due to" type="date" value={values.to} onChange={(value) => onChange({ to: value })} />
        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
          <span>Status</span>
          <select
            aria-label="Filter Status"
            value={values.status}
            onChange={(event) => onChange({ status: event.target.value as DeadlineFilterStatus | '' })}
            className="min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary outline-none focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20"
          >
            <option value="">All statuses</option>
            {(Object.keys(statusLabels) as DeadlineFilterStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-text-secondary">
          <span>Source</span>
          <select
            aria-label="Filter Source"
            value={values.origin}
            onChange={(event) => onChange({ origin: event.target.value as DeadlineFilterOrigin | '' })}
            className="min-h-11 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary outline-none focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20"
          >
            <option value="">All sources</option>
            {(Object.keys(originLabels) as DeadlineFilterOrigin[]).map((origin) => <option key={origin} value={origin}>{originLabels[origin]}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
