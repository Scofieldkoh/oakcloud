'use client';

import { FamilyFilterChips, type ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import { cn } from '@/lib/utils';
import { ServiceFilterToolbar, quickFilterClass } from '@/components/services/shared/service-filter-toolbar';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';

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
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  onAdjustColumns?: () => void;
  hiddenColumnCount?: number;
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

const typeOptions = (Object.keys(typeLabels) as DeadlineFilterType[]).map((type) => ({ value: type, label: typeLabels[type] }));
const statusOptions = (Object.keys(statusLabels) as DeadlineFilterStatus[]).map((status) => ({ value: status, label: statusLabels[status] }));
const originOptions = (Object.keys(originLabels) as DeadlineFilterOrigin[]).map((origin) => ({ value: origin, label: originLabels[origin] }));

function toLocalDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toLocalDateString(value?: Date): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Shared, intentionally unlabeled toolbar for table and calendar modes. */
export function DeadlineFilters({
  families,
  selectedTypes,
  selectedFamilyIds,
  openOnly,
  onToggleType,
  onToggleFamily,
  onToggleOpenOnly,
  dateFrom,
  dateTo,
  onDateRangeChange,
  onAdjustColumns,
  hiddenColumnCount,
  className,
}: DeadlineFiltersProps) {
  return (
    <ServiceFilterToolbar label="Deadline filters" onAdjustColumns={onAdjustColumns} hiddenColumnCount={hiddenColumnCount} className={className}>
      {(Object.keys(typeLabels) as DeadlineFilterType[]).map((type) => {
        const selected = selectedTypes.includes(type);
        return (
          <button
            key={type}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleType(type)}
            className={quickFilterClass(selected)}
          >
            {typeLabels[type]}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={openOnly}
        onClick={onToggleOpenOnly}
        className={quickFilterClass(openOnly)}
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
      <DatePicker
        value={dateFrom && dateTo ? { mode: 'range', range: { from: toLocalDate(dateFrom), to: toLocalDate(dateTo) } } : undefined}
        onChange={(value: DatePickerValue | undefined) => {
          if (!value) {
            onDateRangeChange('', '');
            return;
          }
          if (value.mode !== 'range' || !value.range?.from || !value.range.to) return;
          const from = toLocalDateString(value.range.from);
          const to = toLocalDateString(value.range.to);
          if (from && to) onDateRangeChange(from, to);
        }}
        placeholder="Date Range"
        defaultTab="range"
        size="sm"
        className="min-w-[160px] text-xs"
      />
    </ServiceFilterToolbar>
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
        className="input input-sm min-h-11 w-full min-w-0 px-3 sm:min-h-8"
      />
    </label>
  );
}

/** Server-backed column/detail filters shared by table and calendar views. */
export function DeadlineInlineFilters({ values, onChange, className }: DeadlineInlineFiltersProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="Company" value={values.companyQuery} onChange={(value) => onChange({ companyQuery: value })} />
        <FilterField label="Service" value={values.serviceQuery} onChange={(value) => onChange({ serviceQuery: value })} />
        <FilterField label="Milestone" value={values.milestoneQuery} onChange={(value) => onChange({ milestoneQuery: value })} />
        <SearchableSelect
          variant="table-filter"
          options={typeOptions}
          value={values.type}
          onChange={(value) => onChange({ type: value as DeadlineFilterType | '' })}
          placeholder="All types"
          className="text-xs"
          showChevron={false}
          showKeyboardHints={false}
          clearable
        />
        <SearchableSelect
          variant="table-filter"
          options={statusOptions}
          value={values.status}
          onChange={(value) => onChange({ status: value as DeadlineFilterStatus | '' })}
          placeholder="All statuses"
          className="text-xs"
          showChevron={false}
          showKeyboardHints={false}
          clearable
        />
        <SearchableSelect
          variant="table-filter"
          options={originOptions}
          value={values.origin}
          onChange={(value) => onChange({ origin: value as DeadlineFilterOrigin | '' })}
          placeholder="All sources"
          className="text-xs"
          showChevron={false}
          showKeyboardHints={false}
          clearable
        />
      </div>
    </div>
  );
}
