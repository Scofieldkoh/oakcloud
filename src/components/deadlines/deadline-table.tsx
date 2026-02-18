'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  MinusSquare,
  Plus,
  Square,
  StickyNote,
  X,
} from 'lucide-react';
import { cn, formatCurrency, formatDateShort } from '@/lib/utils';
import { MobileCard, CardDetailItem, CardDetailsGrid } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { AmountFilter, type AmountFilterValue } from '@/components/ui/amount-filter';
import {
  DeadlineStatusBadge,
  DeadlineTimingBadge,
  DeadlineCategoryBadge,
  DeadlineBillingBadge,
} from '@/components/deadlines/deadline-status-badge';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';
import type { DeadlineBillingStatus, DeadlineCategory, DeadlineStatus } from '@/generated/prisma';
import type { DeadlineTimingStatus } from '@/components/deadlines/deadline-status-badge';

export interface DeadlineInlineFilters {
  query?: string;
  period?: string;
  companyId?: string;
  contractServiceId?: string;
  category?: DeadlineCategory;
  status?: DeadlineStatus[] | undefined;
  timing?: DeadlineTimingStatus;
  assigneeId?: string;
  isInScope?: boolean;
  billingStatus?: DeadlineBillingStatus;
  dueDateFrom?: string;
  dueDateTo?: string;
  amountFrom?: number;
  amountTo?: number;
}

export interface DeadlineCompanyOption {
  id: string;
  name: string;
}

export interface DeadlineServiceOption {
  id: string;
  label: string;
}

export interface DeadlineAssigneeOption {
  id: string;
  label: string;
}

const TIMING_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'DUE_SOON', label: 'Due Soon' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'WAIVED', label: 'Waived' },
];

const WORKFLOW_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PENDING_CLIENT', label: 'Pending Client' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'WAIVED', label: 'Waived' },
];

const CATEGORY_OPTIONS: Array<{ value: DeadlineCategory; label: string }> = [
  { value: 'CORPORATE_SECRETARY', label: 'Corporate Secretary' },
  { value: 'TAX', label: 'Tax' },
  { value: 'ACCOUNTING', label: 'Accounting' },
  { value: 'AUDIT', label: 'Audit' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'OTHER', label: 'Other' },
];

const BILLING_STATUS_OPTIONS: Array<{ value: DeadlineBillingStatus; label: string }> = [
  { value: 'NOT_APPLICABLE', label: 'Not Applicable' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'TO_BE_BILLED', label: 'To be billed' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'PAID', label: 'Paid' },
];

const COLUMN_IDS = [
  'deadline',
  'period',
  'company',
  'service',
  'category',
  'dueDate',
  'status',
  'internalStatus',
  'notes',
  'billing',
  'amount',
  'assignee',
] as const;

type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  deadline: 'Deadline',
  period: 'Period',
  company: 'Company',
  service: 'Service',
  category: 'Category',
  dueDate: 'Due Date',
  status: 'Status',
  internalStatus: 'Internal Status',
  notes: 'Notes',
  billing: 'Billing',
  amount: 'Amount',
  assignee: 'Assignee',
};

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, string>> = {
  deadline: 'title',
  period: 'periodLabel',
  company: 'company',
  service: 'service',
  category: 'category',
  dueDate: 'statutoryDueDate',
  status: 'statutoryDueDate',
  internalStatus: 'status',
  billing: 'billingStatus',
  amount: 'amount',
  assignee: 'assignee',
};

const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnId, number>> = {
  deadline: 260,
  period: 120,
  company: 200,
  service: 200,
  category: 140,
  dueDate: 170,
  status: 120,
  internalStatus: 150,
  notes: 60,
  billing: 140,
  amount: 140,
  assignee: 170,
};

const RIGHT_ALIGNED_COLUMNS = new Set<ColumnId>(['amount']);

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStatusFilterValue(status?: DeadlineStatus[]): string {
  if (!status || status.length === 0) return '';
  const active = ['PENDING', 'PENDING_CLIENT', 'IN_PROGRESS', 'PENDING_REVIEW'];
  if (status.length === active.length && status.every((s) => active.includes(s))) {
    return 'ACTIVE';
  }
  return status.length === 1 ? status[0] : '';
}

export interface DeadlineTableProps {
  deadlines: DeadlineWithRelations[];
  isLoading?: boolean;
  isFetching?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleOne?: (id: string) => void;
  onToggleAll?: () => void;
  isAllSelected?: boolean;
  isIndeterminate?: boolean;
  inlineFilters?: DeadlineInlineFilters;
  onInlineFilterChange?: (filters: Partial<DeadlineInlineFilters>) => void;
  companyFilterOptions?: DeadlineCompanyOption[];
  serviceFilterOptions?: DeadlineServiceOption[];
  assigneeFilterOptions?: DeadlineAssigneeOption[];
  columnWidths?: Partial<Record<ColumnId, number>>;
  onColumnWidthChange?: (columnId: ColumnId, width: number) => void;
  onEditNotes?: (deadline: DeadlineWithRelations) => void;
}

export function DeadlineTable({
  deadlines,
  isLoading,
  isFetching,
  sortBy,
  sortOrder,
  onSort,
  selectable = false,
  selectedIds = new Set(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
  inlineFilters = {},
  onInlineFilterChange,
  companyFilterOptions = [],
  serviceFilterOptions = [],
  assigneeFilterOptions = [],
  columnWidths: externalColumnWidths,
  onColumnWidthChange,
  onEditNotes,
}: DeadlineTableProps) {
  const [internalColumnWidths, setInternalColumnWidths] = useState<Partial<Record<ColumnId, number>>>({});
  const columnWidths = externalColumnWidths ?? internalColumnWidths;
  const isResizingRef = useRef(false);

  const startResize = useCallback(
    (e: React.PointerEvent, columnId: ColumnId) => {
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget as HTMLElement | null;
      const th = handle?.closest('th') as HTMLTableCellElement | null;
      const startWidth = columnWidths[columnId] ?? th?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTHS[columnId] ?? 120;
      const startX = e.clientX;
      const pointerId = e.pointerId;

      isResizingRef.current = true;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      let latestWidth = startWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        latestWidth = Math.max(30, startWidth + delta);
        if (th) {
          th.style.width = `${latestWidth}px`;
        }
      };

      const onUp = () => {
        (handle as HTMLElement | null)?.releasePointerCapture(pointerId);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        isResizingRef.current = false;

        if (onColumnWidthChange) {
          onColumnWidthChange(columnId, latestWidth);
        } else {
          setInternalColumnWidths(prev => ({ ...prev, [columnId]: latestWidth }));
        }

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [columnWidths, onColumnWidthChange]
  );

  const renderFilterCell = useCallback(
    (columnId: ColumnId) => {
      if (!onInlineFilterChange) return null;

      switch (columnId) {
        case 'deadline':
          return (
            <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
              <input
                type="text"
                value={inlineFilters.query || ''}
                onChange={(e) => onInlineFilterChange({ query: e.target.value })}
                placeholder="All"
                className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
              />
              {inlineFilters.query && (
                <button
                  type="button"
                  onClick={() => onInlineFilterChange({ query: '' })}
                  className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                >
                  <X className="w-3.5 h-3.5 text-text-muted" />
                </button>
              )}
            </div>
          );

        case 'period':
          return (
            <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
              <input
                type="text"
                value={inlineFilters.period || ''}
                onChange={(e) => onInlineFilterChange({ period: e.target.value })}
                placeholder="All"
                className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
              />
              {inlineFilters.period && (
                <button
                  type="button"
                  onClick={() => onInlineFilterChange({ period: '' })}
                  className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                >
                  <X className="w-3.5 h-3.5 text-text-muted" />
                </button>
              )}
            </div>
          );

        case 'company':
          return (
            <SearchableSelect
              options={[
                { value: '', label: 'All' },
                ...companyFilterOptions.map((c) => ({ value: c.id, label: c.name })),
              ]}
              value={inlineFilters.companyId || ''}
              onChange={(value) => onInlineFilterChange({ companyId: value || undefined })}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        case 'service':
          return (
            <SearchableSelect
              options={[
                { value: '', label: 'All' },
                ...serviceFilterOptions.map((s) => ({ value: s.id, label: s.label })),
              ]}
              value={inlineFilters.contractServiceId || ''}
              onChange={(value) => onInlineFilterChange({ contractServiceId: value || undefined })}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        case 'category':
          return (
            <SearchableSelect
              options={[
                { value: '', label: 'All' },
                ...CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
              ]}
              value={inlineFilters.category || ''}
              onChange={(value) => onInlineFilterChange({ category: value as DeadlineCategory || undefined })}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        case 'status':
          return (
            <SearchableSelect
              options={TIMING_STATUS_OPTIONS}
              value={inlineFilters.timing || ''}
              onChange={(val) => {
                onInlineFilterChange({
                  timing: val ? (val as DeadlineTimingStatus) : undefined,
                });
              }}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        case 'internalStatus': {
          const value = getStatusFilterValue(inlineFilters.status);
          return (
            <SearchableSelect
              options={WORKFLOW_STATUS_OPTIONS}
              value={value}
              onChange={(val) => {
                if (!val) {
                  onInlineFilterChange({ status: undefined });
                } else {
                  onInlineFilterChange({ status: [val as DeadlineStatus] });
                }
              }}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );
        }

        case 'notes':
          return null;

        case 'dueDate':
          return (
            <DatePicker
              value={
                inlineFilters.dueDateFrom || inlineFilters.dueDateTo
                  ? {
                    mode: 'range' as const,
                    range: {
                      from: inlineFilters.dueDateFrom ? new Date(inlineFilters.dueDateFrom) : undefined,
                      to: inlineFilters.dueDateTo ? new Date(inlineFilters.dueDateTo) : undefined,
                    },
                  }
                  : undefined
              }
              onChange={(value: DatePickerValue | undefined) => {
                if (!value || value.mode !== 'range') {
                  onInlineFilterChange({ dueDateFrom: undefined, dueDateTo: undefined });
                } else if (value.range) {
                  onInlineFilterChange({
                    dueDateFrom: value.range.from ? toLocalDateString(value.range.from) : undefined,
                    dueDateTo: value.range.to ? toLocalDateString(value.range.to) : undefined,
                  });
                }
              }}
              placeholder="All dates"
              size="sm"
              defaultTab="range"
              className="text-xs"
            />
          );

        case 'billing':
          return (
            <SearchableSelect
              options={[
                { value: '', label: 'All' },
                ...BILLING_STATUS_OPTIONS.map((b) => ({ value: b.value, label: b.label })),
              ]}
              value={inlineFilters.billingStatus || ''}
              onChange={(value) => onInlineFilterChange({ billingStatus: value as DeadlineBillingStatus || undefined })}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        case 'amount':
          return (
            <AmountFilter
              value={
                inlineFilters.amountFrom !== undefined || inlineFilters.amountTo !== undefined
                  ? {
                    mode: 'range',
                    range: {
                      from: inlineFilters.amountFrom,
                      to: inlineFilters.amountTo,
                    },
                  }
                  : undefined
              }
              onChange={(value: AmountFilterValue | undefined) => {
                if (!value) {
                  onInlineFilterChange({ amountFrom: undefined, amountTo: undefined });
                } else if (value.mode === 'single' && value.single !== undefined) {
                  onInlineFilterChange({ amountFrom: value.single, amountTo: value.single });
                } else if (value.mode === 'range' && value.range) {
                  onInlineFilterChange({
                    amountFrom: value.range.from,
                    amountTo: value.range.to,
                  });
                }
              }}
              placeholder="All"
              size="sm"
              showChevron={false}
            />
          );

        case 'assignee':
          return (
            <SearchableSelect
              options={[
                { value: '', label: 'All' },
                ...assigneeFilterOptions.map((a) => ({ value: a.id, label: a.label })),
              ]}
              value={inlineFilters.assigneeId || ''}
              onChange={(value) => onInlineFilterChange({ assigneeId: value || undefined })}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        default:
          return null;
      }
    },
    [assigneeFilterOptions, companyFilterOptions, inlineFilters, onInlineFilterChange, serviceFilterOptions]
  );

  const renderHeaderCell = useCallback(
    (columnId: ColumnId) => {
      const sortField = COLUMN_SORT_FIELDS[columnId];
      const isSortable = !!sortField && !!onSort;
      const isActive = sortBy === sortField;
      const width = columnWidths[columnId];
      const isResizable = true;

      const sortLabel = isActive
        ? `Sort by ${COLUMN_LABELS[columnId]}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}`
        : `Sort by ${COLUMN_LABELS[columnId]}`;

      return (
        <th
          key={columnId}
          style={width ? { width: `${width}px` } : undefined}
          className={cn(
            'relative text-xs font-medium text-text-secondary py-2.5 whitespace-nowrap max-w-0',
            RIGHT_ALIGNED_COLUMNS.has(columnId) ? 'text-right pr-6' : 'text-left',
            'px-4'
          )}
        >
          {isSortable ? (
            <button
              type="button"
              onClick={() => onSort?.(sortField!)}
              aria-label={sortLabel}
              className={cn(
                'inline-flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer select-none min-w-0',
                isActive ? 'text-text-primary' : ''
              )}
            >
              <span className="truncate">{COLUMN_LABELS[columnId]}</span>
              <span className="flex-shrink-0" aria-hidden="true">
                {isActive ? (
                  sortOrder === 'asc' ? (
                    <ArrowUp className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5" />
                  )
                ) : (
                  <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
                )}
              </span>
            </button>
          ) : (
            <span className="truncate block">{COLUMN_LABELS[columnId]}</span>
          )}
          {isResizable && (
            <div
              onPointerDown={(e) => startResize(e, columnId)}
              className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
              title="Drag to resize"
            />
          )}
        </th>
      );
    },
    [columnWidths, onSort, sortBy, sortOrder, startResize]
  );

  const hasData = deadlines.length > 0;

  const renderDeadlineDueDate = (deadline: DeadlineWithRelations) => {
    return (
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            'text-sm text-text-primary whitespace-nowrap',
            deadline.extendedDueDate ? 'line-through' : ''
          )}
        >
          {formatDateShort(deadline.statutoryDueDate)}
        </span>
        {deadline.extendedDueDate && (
          <span className="text-sm text-text-primary whitespace-nowrap">
            {formatDateShort(deadline.extendedDueDate)}
            {deadline.eotReference && (
              <span className="text-sm text-text-primary ml-1 whitespace-nowrap">
                (EOT: {deadline.eotReference})
              </span>
            )}
          </span>
        )}
        {deadline.internalDueDate && (
          <span className="text-sm text-text-primary whitespace-nowrap">
            Internal: {formatDateShort(deadline.internalDueDate)}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Card View */}
      <div className={cn('md:hidden space-y-3', isFetching && 'opacity-60')}>
        {isLoading && !hasData ? (
          <div className="card p-8 text-center">
            <p className="text-text-secondary">Loading deadlines...</p>
          </div>
        ) : !hasData ? (
          <div className="card p-6 sm:p-12 text-center">
            <p className="text-text-secondary">No deadlines found</p>
          </div>
        ) : (
          deadlines.map((deadline, index) => {
            const isAlternate = index % 2 === 1;
            const isSelected = selectedIds.has(deadline.id);
            const effectiveBillable = deadline.overrideBillable ?? deadline.isBillable;
            const amountToDisplay = deadline.overrideAmount ?? deadline.amount;

            return (
              <MobileCard
                key={deadline.id}
                className={isAlternate ? 'bg-oak-row-alt' : undefined}
                selectable={selectable}
                isSelected={isSelected}
                onToggle={() => onToggleOne?.(deadline.id)}
                title={deadline.title}
                subtitle={deadline.company?.name || 'Unknown Company'}
                badge={(
                  <DeadlineTimingBadge
                    status={deadline.status}
                    dueDate={deadline.statutoryDueDate}
                    extendedDueDate={deadline.extendedDueDate}
                    size="xs"
                    showDays={false}
                  />
                )}
                details={(
                  <CardDetailsGrid>
                    <CardDetailItem label="Category" value={<DeadlineCategoryBadge category={deadline.category} size="xs" />} />
                    <CardDetailItem label="Period" value={deadline.periodLabel || '-'} />
                    <CardDetailItem label="Due" value={formatDateShort(deadline.statutoryDueDate)} />
                    <CardDetailItem
                      label="Status"
                      value={(
                        <DeadlineTimingBadge
                          status={deadline.status}
                          dueDate={deadline.statutoryDueDate}
                          extendedDueDate={deadline.extendedDueDate}
                          size="xs"
                          showDays={false}
                        />
                      )}
                    />
                    <CardDetailItem
                      label="Internal Status"
                      value={<DeadlineStatusBadge status={deadline.status} size="xs" />}
                    />
                    <CardDetailItem label="Service" value={deadline.contractService?.name || '-'} />
                    <CardDetailItem label="Assignee" value={deadline.assignee ? `${deadline.assignee.firstName} ${deadline.assignee.lastName}` : 'Unassigned'} />
                    <CardDetailItem
                      label="Notes"
                      value={
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditNotes?.(deadline);
                          }}
                          className="p-0.5 hover:bg-background-tertiary rounded transition-colors"
                          aria-label={deadline.internalNotes ? 'View/Edit notes' : 'Add notes'}
                        >
                          {deadline.internalNotes ? (
                            <StickyNote className="w-4 h-4 text-oak-primary" />
                          ) : (
                            <Plus className="w-4 h-4 text-text-muted/40" />
                          )}
                        </button>
                      }
                    />
                    <CardDetailItem
                      label="Billing"
                      value={
                        effectiveBillable ? (
                          <DeadlineBillingBadge
                            status={deadline.billingStatus}
                            deadlineStatus={deadline.status}
                            size="xs"
                          />
                        ) : (
                          '-'
                        )
                      }
                    />
                    <CardDetailItem
                      label="Amount"
                      value={amountToDisplay != null ? formatCurrency(amountToDisplay, deadline.currency) : '-'}
                    />
                  </CardDetailsGrid>
                )}
              />
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className={cn('hidden md:block table-container overflow-hidden', isFetching && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max table-fixed">
            <colgroup>
              {selectable && <col style={{ width: '40px' }} />}
              {COLUMN_IDS.map((id) => (
                <col
                  key={id}
                  style={
                    columnWidths[id]
                      ? { width: `${columnWidths[id]}px` }
                      : DEFAULT_COLUMN_WIDTHS[id]
                        ? { width: `${DEFAULT_COLUMN_WIDTHS[id]}px` }
                        : undefined
                  }
                />
              ))}
              <col />
            </colgroup>
            <thead className="bg-background-tertiary border-b border-border-primary">
              {onInlineFilterChange && (
                <tr className="bg-background-secondary/50">
                  {selectable && <th className="px-4 py-2"></th>}
                  {COLUMN_IDS.map((columnId) => (
                    <th
                      key={columnId}
                      className="py-2 px-4 max-w-0"
                    >
                      {renderFilterCell(columnId)}
                    </th>
                  ))}
                  <th className="p-0"></th>
                </tr>
              )}
              <tr className={onInlineFilterChange ? 'border-t border-border-primary' : ''}>
                {selectable && (
                  <th className="w-10 px-4 py-2.5">
                    <button
                      onClick={onToggleAll}
                      className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                      aria-label={isAllSelected ? 'Deselect all deadlines' : 'Select all deadlines'}
                      aria-pressed={isAllSelected}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-oak-primary" aria-hidden="true" />
                      ) : isIndeterminate ? (
                        <MinusSquare className="w-4 h-4 text-oak-light" aria-hidden="true" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" aria-hidden="true" />
                      )}
                    </button>
                  </th>
                )}
                {COLUMN_IDS.map((columnId) => renderHeaderCell(columnId))}
                <th className="p-0"></th>
              </tr>
            </thead>
            <tbody>
              {!hasData ? (
                <tr>
                  <td colSpan={COLUMN_IDS.length + (selectable ? 1 : 0) + 1} className="px-4 py-12 text-center">
                    <p className="text-sm text-text-secondary">No deadlines found</p>
                  </td>
                </tr>
              ) : (
                deadlines.map((deadline, index) => {
                  const isSelected = selectedIds.has(deadline.id);
                  const isAlternate = index % 2 === 1;
                  const effectiveBillable = deadline.overrideBillable ?? deadline.isBillable;
                  const amountToDisplay = deadline.overrideAmount ?? deadline.amount;

                  return (
                    <tr
                      key={deadline.id}
                      className={cn(
                        'border-b border-border-primary transition-colors',
                        isSelected
                          ? 'bg-oak-row-selected hover:bg-oak-row-selected-hover'
                          : isAlternate
                            ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                            : 'hover:bg-background-tertiary/50'
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-3 max-w-0">
                          <button
                            onClick={() => onToggleOne?.(deadline.id)}
                            className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                            aria-label={isSelected ? `Deselect ${deadline.title}` : `Select ${deadline.title}`}
                            aria-pressed={isSelected}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-oak-primary" aria-hidden="true" />
                            ) : (
                              <Square className="w-4 h-4 text-text-muted" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3 max-w-0">
                        <span className="text-sm text-text-primary truncate block">
                          {deadline.title}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <span className="text-sm text-text-primary truncate block">
                          {deadline.periodLabel || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        {deadline.company ? (
                          <span className="text-sm text-text-primary truncate block">
                            {deadline.company.name}
                          </span>
                        ) : (
                          <span className="text-sm text-text-primary block truncate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        {deadline.contractService ? (
                          <span className="text-sm text-text-primary truncate block">
                            {deadline.contractService.name}
                          </span>
                        ) : (
                          <span className="text-sm text-text-primary block truncate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <DeadlineCategoryBadge category={deadline.category} size="xs" />
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        {renderDeadlineDueDate(deadline)}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <DeadlineTimingBadge
                          status={deadline.status}
                          dueDate={deadline.statutoryDueDate}
                          extendedDueDate={deadline.extendedDueDate}
                          size="xs"
                          showDays={false}
                        />
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <DeadlineStatusBadge status={deadline.status} size="xs" />
                      </td>
                      <td className="px-4 py-3 max-w-0 text-center">
                        <button
                          type="button"
                          onClick={() => onEditNotes?.(deadline)}
                          className="p-1 hover:bg-background-tertiary rounded transition-colors"
                          aria-label={deadline.internalNotes ? 'View/Edit notes' : 'Add notes'}
                        >
                          {deadline.internalNotes ? (
                            <StickyNote className="w-4 h-4 text-oak-primary" />
                          ) : (
                            <Plus className="w-4 h-4 text-text-muted/40" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        {effectiveBillable ? (
                          <DeadlineBillingBadge
                            status={deadline.billingStatus}
                            deadlineStatus={deadline.status}
                            size="xs"
                          />
                        ) : (
                          <span className="text-sm text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right max-w-0">
                        {amountToDisplay != null ? (
                          <span className="text-sm text-text-primary block truncate">
                            {formatCurrency(amountToDisplay, deadline.currency)}
                          </span>
                        ) : (
                          <span className="text-sm text-text-primary block truncate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        {deadline.assignee ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-oak-primary/10 text-oak-primary flex items-center justify-center text-xs font-medium">
                              {deadline.assignee.firstName[0]}
                              {deadline.assignee.lastName[0]}
                            </div>
                            <span className="text-sm text-text-primary truncate block">
                              {deadline.assignee.firstName} {deadline.assignee.lastName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-text-primary block truncate">Unassigned</span>
                        )}
                      </td>
                      <td className="p-0"></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default DeadlineTable;
