'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, MinusSquare, MoreHorizontal, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CardDetailItem, CardDetailsGrid, MobileCard } from '@/components/ui/responsive-table';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { cn, formatCurrency } from '@/lib/utils';
import type { BillingOccurrenceDto, BillingOccurrenceTiming } from '@/services/billing';
import type { ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import {
  BILLING_COLUMN_WIDTH_MAX,
  BILLING_COLUMN_WIDTH_MIN,
  type BillingColumnId,
} from '@/lib/validations/services-preferences';

export interface BillingInlineFilters {
  expectedDate?: string;
  timing?: BillingOccurrenceTiming;
  companyId?: string;
  familyId?: string;
  service?: string;
  feeLine?: string;
  period?: string;
  status?: BillingOccurrenceDto['status'];
  amountMin?: string;
  amountMax?: string;
  billedDate?: string;
  reference?: string;
}

export interface BillingTableProps {
  items: BillingOccurrenceDto[];
  families?: ServiceFamilyFilter[];
  isFetching?: boolean;
  canEdit?: boolean;
  selectedIds?: Set<string>;
  isAllSelected?: boolean;
  isIndeterminate?: boolean;
  columnWidths: Record<string, number | undefined>;
  columnOrder: BillingColumnId[];
  columnVisibility: Record<BillingColumnId, boolean>;
  sortBy: 'expectedDate' | 'company' | 'family' | 'service' | 'status' | 'amount';
  sortOrder: 'asc' | 'desc';
  inlineFilters?: BillingInlineFilters;
  onInlineFilterChange?: (filters: Partial<BillingInlineFilters>) => void;
  onSort?: (sortBy: BillingTableProps['sortBy']) => void;
  onColumnWidthChange?: (columnId: BillingColumnId, width: number) => void;
  onColumnResizeEnd?: (columnId: BillingColumnId, width: number) => void;
  onToggleOne?: (id: string) => void;
  onToggleAll?: () => void;
  onEdit?: (occurrence: BillingOccurrenceDto) => void;
}

export const billingColumnLabels: Record<BillingColumnId, string> = {
  expectedDate: 'Expected date',
  timing: 'Timing',
  company: 'Company',
  family: 'Family',
  service: 'Service',
  feeLine: 'Fee line',
  period: 'Period',
  status: 'State',
  amount: 'Amount / currency',
  billedDate: 'Billed date',
  reference: 'Reference',
  actions: 'Actions',
};

export const defaultBillingColumnWidths: Record<BillingColumnId, number> = {
  expectedDate: 140,
  timing: 110,
  company: 200,
  family: 160,
  service: 180,
  feeLine: 180,
  period: 120,
  status: 110,
  amount: 150,
  billedDate: 130,
  reference: 170,
  actions: 100,
};

const sortableColumns: Partial<Record<BillingColumnId, BillingTableProps['sortBy']>> = {
  expectedDate: 'expectedDate',
  company: 'company',
  family: 'family',
  service: 'service',
  status: 'status',
  amount: 'amount',
};

const timingOptions: SelectOption[] = [
  { value: '', label: 'All' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'DUE', label: 'Due' },
  { value: 'OVERDUE', label: 'Overdue' },
];

const statusOptions: SelectOption[] = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'BILLED', label: 'Billed' },
  { value: 'WAIVED', label: 'Waived' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function displayDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function statusLabel(status: BillingOccurrenceDto['status']): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function statusClass(status: BillingOccurrenceDto['status'], timingState: BillingOccurrenceDto['timingState']): string {
  if (status === 'BILLED') return 'badge-success';
  if (status === 'WAIVED' || status === 'CANCELLED') return 'badge-neutral';
  if (timingState === 'OVERDUE') return 'badge-danger';
  if (timingState === 'DUE') return 'badge-warning';
  return 'badge-success';
}

function timingLabel(item: BillingOccurrenceDto): string {
  if (item.status !== 'OPEN' || !item.timingState) return '—';
  return item.timingState.charAt(0) + item.timingState.slice(1).toLowerCase();
}

function CompanyCell({ item }: { item: BillingOccurrenceDto }) {
  return <div className="min-w-0" title={item.company.name}><span className="block truncate font-medium text-text-primary">{item.company.name}</span></div>;
}

function SelectionIcon({ selected, indeterminate = false }: { selected: boolean; indeterminate?: boolean }) {
  if (selected) return <CheckSquare className="h-4 w-4 text-oak-primary" aria-hidden="true" />;
  if (indeterminate) return <MinusSquare className="h-4 w-4 text-oak-light" aria-hidden="true" />;
  return <Square className="h-4 w-4 text-text-muted" aria-hidden="true" />;
}

function SortableHeader({ column, sortBy, sortOrder, onSort, onResize, onResizeKeyboard }: { column: BillingColumnId; sortBy: BillingTableProps['sortBy']; sortOrder: BillingTableProps['sortOrder']; onSort?: BillingTableProps['onSort']; onResize: (columnId: BillingColumnId, event: React.PointerEvent<HTMLSpanElement>) => void; onResizeKeyboard: (columnId: BillingColumnId, delta: number) => void }) {
  const field = sortableColumns[column];
  const active = field === sortBy;
  return (
    <th scope="col" aria-label={billingColumnLabels[column]} aria-sort={field ? (active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} className="relative px-4 py-2.5 text-left text-xs font-medium text-text-secondary whitespace-nowrap">
      {field && onSort ? (
        <button type="button" onClick={() => onSort(field)} aria-label={active ? `Sort by ${billingColumnLabels[column]}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${billingColumnLabels[column]}`} className="inline-flex min-h-11 items-center gap-1 text-left hover:text-text-primary sm:min-h-8">
          <span>{billingColumnLabels[column]}</span>
          {active ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />) : <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
        </button>
      ) : <span>{billingColumnLabels[column]}</span>}
      {column !== 'actions' ? <span role="separator" aria-label={`Resize ${billingColumnLabels[column]} column`} aria-orientation="vertical" tabIndex={0} onPointerDown={(event) => onResize(column, event)} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); onResizeKeyboard(column, event.key === 'ArrowRight' ? 10 : -10); }} className="absolute inset-y-0 -right-2 w-4 cursor-col-resize touch-none select-none" /> : null}
    </th>
  );
}

function DebouncedInlineFilter({ label, value, filterKey, onChange, type = 'search' }: { label: string; value: string | undefined; filterKey: keyof BillingInlineFilters; onChange?: BillingTableProps['onInlineFilterChange']; type?: 'search' | 'number' }) {
  const [draft, setDraft] = useState(value ?? '');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => setDraft(value ?? ''), [value]);

  useEffect(() => {
    if (draft === (value ?? '')) return undefined;
    const timeout = window.setTimeout(() => onChangeRef.current?.({ [filterKey]: draft || undefined }), 300);
    return () => window.clearTimeout(timeout);
  }, [draft, filterKey, value]);

  return (
    <label className="block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        type={type}
        aria-label={`Filter ${label}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="All"
        className="input input-sm min-h-8 w-full min-w-0 px-3 text-xs placeholder:text-text-muted"
      />
    </label>
  );
}

function SelectFilter({ label, options, value, onChange }: { label: string; options: SelectOption[]; value: string; onChange: (value: string) => void }) {
  const filterLabels: Record<string, string> = { timing: 'Timing', company: 'Company', family: 'Family', status: 'Status' };
  return <SearchableSelect variant="table-filter" options={options} value={value} onChange={onChange} placeholder="All" ariaLabel={`Filter ${filterLabels[label] ?? label}`} className="w-full min-w-0 text-xs [&>label]:sr-only [&_input]:placeholder:text-text-muted" showChevron={false} showKeyboardHints={false} clearable />;
}

function AmountRangeFilter({ filters, onChange }: { filters: BillingInlineFilters; onChange?: BillingTableProps['onInlineFilterChange'] }) {
  return (
    <div role="group" aria-label="Filter Amount / currency" className="flex min-w-0 items-center gap-1">
      <DebouncedInlineFilter label="Minimum amount" value={filters.amountMin} filterKey="amountMin" onChange={onChange} type="number" />
      <span aria-hidden="true" className="text-xs text-text-muted">–</span>
      <DebouncedInlineFilter label="Maximum amount" value={filters.amountMax} filterKey="amountMax" onChange={onChange} type="number" />
    </div>
  );
}

function DateFilter({ label, value, filterKey, onChange }: { label: string; value: string | undefined; filterKey: 'expectedDate' | 'billedDate'; onChange?: BillingTableProps['onInlineFilterChange'] }) {
  return <SingleDateInput value={value ?? ''} onChange={(nextValue) => onChange?.({ [filterKey]: nextValue || undefined })} ariaLabel={`Filter ${label}`} placeholder="All dates" showCalendar variant="table-filter" className="text-xs [&_input]:placeholder:text-text-muted" />;
}

function InlineFilterRow({ columns, filters, families, companyOptions, onChange, selectable }: { columns: BillingColumnId[]; filters: BillingInlineFilters; families: ServiceFamilyFilter[]; companyOptions: SelectOption[]; onChange?: BillingTableProps['onInlineFilterChange']; selectable: boolean }) {
  const familyOptions = families.map((family) => ({ value: family.id, label: family.name }));
  const filter = (column: BillingColumnId) => {
    switch (column) {
      case 'expectedDate': return <DateFilter label="Expected date" value={filters.expectedDate} filterKey="expectedDate" onChange={onChange} />;
      case 'timing': return <SelectFilter label="timing" options={timingOptions} value={filters.timing ?? ''} onChange={(value) => onChange?.({ timing: (value || undefined) as BillingOccurrenceTiming | undefined })} />;
      case 'company': return <SelectFilter label="company" options={companyOptions} value={filters.companyId ?? ''} onChange={(value) => onChange?.({ companyId: value || undefined })} />;
      case 'family': return <SelectFilter label="family" options={familyOptions} value={filters.familyId ?? ''} onChange={(value) => onChange?.({ familyId: value || undefined })} />;
      case 'service': return <DebouncedInlineFilter label="Service" value={filters.service} filterKey="service" onChange={onChange} />;
      case 'feeLine': return <DebouncedInlineFilter label="Fee line" value={filters.feeLine} filterKey="feeLine" onChange={onChange} />;
      case 'period': return <DebouncedInlineFilter label="Period" value={filters.period} filterKey="period" onChange={onChange} />;
      case 'status': return <SelectFilter label="status" options={statusOptions} value={filters.status ?? ''} onChange={(value) => onChange?.({ status: (value || undefined) as BillingOccurrenceDto['status'] | undefined })} />;
      case 'amount': return <AmountRangeFilter filters={filters} onChange={onChange} />;
      case 'billedDate': return <DateFilter label="Billed date" value={filters.billedDate} filterKey="billedDate" onChange={onChange} />;
      case 'reference': return <DebouncedInlineFilter label="Reference" value={filters.reference} filterKey="reference" onChange={onChange} />;
      default: return <span className="sr-only">{billingColumnLabels[column]} filter</span>;
    }
  };

  return <tr data-filter-row className="h-14 bg-background-secondary/50">{selectable ? <th className="max-w-0 px-2 py-2"><span className="sr-only">Selection filter</span></th> : null}{columns.map((column) => <th key={column} className="max-w-0 px-2 py-2">{filter(column)}</th>)}</tr>;
}

function Cell({ item, column, canEdit, onEdit }: { item: BillingOccurrenceDto; column: BillingColumnId; canEdit: boolean; onEdit?: (occurrence: BillingOccurrenceDto) => void }) {
  const amount = formatCurrency(item.operativeAmount, item.operativeCurrency);
  switch (column) {
    case 'expectedDate': return <td className="px-4 py-3 align-middle text-sm text-text-secondary">{displayDate(item.operativeExpectedDate)}</td>;
    case 'timing': return <td className="px-4 py-3 align-middle"><span className={cn('badge', statusClass(item.status, item.timingState))}>{timingLabel(item)}</span></td>;
    case 'company': return <td className="max-w-0 px-4 py-3 align-middle"><CompanyCell item={item} /></td>;
    case 'family': return <td className="max-w-0 px-4 py-3 align-middle text-sm text-text-primary">{item.family.name || item.service.familyName || '—'}</td>;
    case 'service': return <td className="max-w-0 px-4 py-3 align-middle text-sm text-text-primary"><span className="block truncate" title={item.service.name}>{item.service.name || '—'}</span></td>;
    case 'feeLine': return <td className="max-w-0 px-4 py-3 align-middle text-sm text-text-primary"><span className="block truncate" title={item.feeLine.description}>{item.feeLine.description || 'Fee line'}</span></td>;
    case 'period': return <td className="px-4 py-3 align-middle text-sm text-text-secondary">{item.billingPeriodKey}</td>;
    case 'status': return <td className="px-4 py-3 align-middle"><span className={cn('badge', statusClass(item.status, item.timingState))}>{statusLabel(item.status)}</span></td>;
    case 'amount': return <td className="px-4 py-3 align-middle text-sm text-text-primary">{amount}</td>;
    case 'billedDate': return <td className="px-4 py-3 align-middle text-sm text-text-secondary">{displayDate(item.billedDate)}</td>;
    case 'reference': return <td className="max-w-0 px-4 py-3 align-middle text-sm text-text-secondary"><span className="block truncate" title={item.externalReference ?? undefined}>{item.externalReference || '—'}</span></td>;
    case 'actions': return <td className="px-4 py-3 align-middle"><Button type="button" variant="ghost" size="sm" iconOnly className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" aria-label={`Edit tracking for ${item.company.name}`} onClick={(event) => { event.stopPropagation(); onEdit?.(item); }} disabled={!canEdit} leftIcon={<MoreHorizontal className="h-4 w-4" />} /></td>;
  }
}

function MobileBillingCard({ item, canEdit, selected, onToggle, onEdit }: { item: BillingOccurrenceDto; canEdit: boolean; selected: boolean; onToggle?: (id: string) => void; onEdit?: (occurrence: BillingOccurrenceDto) => void }) {
  const selectable = canEdit && item.status === 'OPEN';
  return (
    <MobileCard title={<CompanyCell item={item} />} subtitle={<span title={item.service.name}>{item.service.name}</span>} badge={<span className={cn('badge', statusClass(item.status, item.timingState))}>{item.status === 'OPEN' ? timingLabel(item) : statusLabel(item.status)}</span>} isSelected={selected} selectable={selectable} onToggle={() => onToggle?.(item.id)} selectionLabel={selected ? `Deselect billing occurrence for ${item.company.name}` : `Select billing occurrence for ${item.company.name}`} onCardClick={() => canEdit && onEdit?.(item)} actions={<Button type="button" variant="ghost" size="sm" iconOnly className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" aria-label={`Edit tracking for ${item.company.name}`} onClick={() => onEdit?.(item)} disabled={!canEdit} leftIcon={<MoreHorizontal className="h-4 w-4" />} />} details={(
      <CardDetailsGrid>
        <CardDetailItem label="Family" value={item.family.name || item.service.familyName} />
        <CardDetailItem label="Service" value={item.service.name} />
        <CardDetailItem label="Expected date" value={displayDate(item.operativeExpectedDate)} />
        <CardDetailItem label="Fee line" value={item.feeLine.description || 'Fee line'} />
        <CardDetailItem label="Period" value={item.billingPeriodKey} />
        <CardDetailItem label="Amount" value={formatCurrency(item.operativeAmount, item.operativeCurrency)} />
        <CardDetailItem label="Billed date" value={displayDate(item.billedDate)} />
        <CardDetailItem label="Reference" value={item.externalReference || '—'} fullWidth />
      </CardDetailsGrid>
    )} />
  );
}

export function BillingTable({ items, families = [], isFetching = false, canEdit = true, selectedIds = new Set(), isAllSelected = false, isIndeterminate = false, columnWidths, columnOrder, columnVisibility, sortBy, sortOrder, inlineFilters = {}, onInlineFilterChange, onSort, onColumnWidthChange, onColumnResizeEnd, onToggleOne, onToggleAll, onEdit }: BillingTableProps) {
  const visibleColumns = useMemo(() => columnOrder.filter((column) => columnVisibility[column]), [columnOrder, columnVisibility]);
  const selectable = canEdit && Boolean(onToggleOne && onToggleAll);
  const companyOptions = useMemo(() => {
    const options = new Map<string, SelectOption>();
    for (const item of items) options.set(item.company.id, { value: item.company.id, label: item.company.name, description: item.company.uen ?? undefined });
    return [...options.values()];
  }, [items]);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const clampColumnWidth = (width: number) => Math.min(BILLING_COLUMN_WIDTH_MAX, Math.max(BILLING_COLUMN_WIDTH_MIN, Math.round(width)));
  const startResize = useCallback((columnId: BillingColumnId, event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();

    const handle = event.currentTarget;
    const header = handle.closest('th');
    const measuredWidth = header?.getBoundingClientRect().width ?? 0;
    const initial = columnWidths[columnId] ?? (measuredWidth >= BILLING_COLUMN_WIDTH_MIN ? measuredWidth : defaultBillingColumnWidths[columnId]);
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let latestWidth = initial;
    const pointerMove = (moveEvent: PointerEvent) => { latestWidth = clampColumnWidth(initial + moveEvent.clientX - startX); onColumnWidthChange?.(columnId, latestWidth); };
    const cleanup = () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture is unavailable in some browsers and test environments.
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null;
    };
    const pointerUp = () => { cleanup(); onColumnResizeEnd?.(columnId, latestWidth); };
    const pointerCancel = () => cleanup();

    resizeCleanupRef.current = cleanup;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is unavailable in some browsers and test environments.
    }
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
  }, [columnWidths, onColumnResizeEnd, onColumnWidthChange]);

  const resizeColumnByKeyboard = useCallback((columnId: BillingColumnId, delta: number) => {
    const initial = clampColumnWidth(columnWidths[columnId] ?? defaultBillingColumnWidths[columnId]);
    const next = clampColumnWidth(initial + delta);
    onColumnWidthChange?.(columnId, next);
    onColumnResizeEnd?.(columnId, next);
  }, [columnWidths, onColumnResizeEnd, onColumnWidthChange]);

  const handleRowClick = (item: BillingOccurrenceDto, event: React.MouseEvent<HTMLTableRowElement>) => {
    if (!canEdit || !onEdit) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button,input,select,textarea,a,[role="combobox"],[role="separator"]')) return;
    onEdit(item);
  };
  const handleRowKeyDown = (item: BillingOccurrenceDto, event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && canEdit && onEdit) { event.preventDefault(); onEdit(item); }
  };

  return (
    <>
      <div role="region" className="space-y-3 md:hidden" aria-label="Billing occurrence cards">
        {selectable ? <button type="button" onClick={onToggleAll} aria-label="Select all billing occurrences" aria-pressed={isAllSelected} className="flex min-h-11 items-center gap-2 px-1 text-sm text-text-secondary"><SelectionIcon selected={isAllSelected} indeterminate={isIndeterminate} /><span>{isAllSelected ? 'Deselect all' : 'Select all'}</span></button> : null}
        {items.length === 0 ? <div className="rounded-xl border border-border-primary bg-background-secondary p-6 text-center text-sm text-text-secondary">No billing occurrences found</div> : items.map((item) => <MobileBillingCard key={item.id} item={item} canEdit={canEdit} selected={selectedIds.has(item.id)} onToggle={onToggleOne} onEdit={onEdit} />)}
      </div>
      <div className={cn('table-container hidden w-full min-w-0 max-w-full overflow-hidden md:block', isFetching && 'opacity-60')} style={{ contain: 'inline-size paint' }}>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-max border-collapse" aria-label="Billing occurrences table">
            <colgroup>{selectable ? <col style={{ width: '48px' }} /> : null}{visibleColumns.map((column) => <col key={column} style={column === 'actions' ? undefined : { width: `${columnWidths[column] ?? defaultBillingColumnWidths[column]}px` }} />)}</colgroup>
            <thead className="bg-background-tertiary border-b border-border-primary">
              <InlineFilterRow columns={visibleColumns} filters={inlineFilters} families={families} companyOptions={companyOptions} selectable={selectable} onChange={onInlineFilterChange} />
              <tr className="h-[38px] border-t border-border-primary">
                {selectable ? <th scope="col" className="relative px-2 py-2.5 text-center"><button type="button" onClick={onToggleAll} aria-label="Select all billing occurrences" aria-pressed={isAllSelected} className="rounded p-0.5 transition-colors hover:bg-background-secondary"><SelectionIcon selected={isAllSelected} indeterminate={isIndeterminate} /></button></th> : null}
                {visibleColumns.map((column) => <SortableHeader key={column} column={column} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} onResize={startResize} onResizeKeyboard={resizeColumnByKeyboard} />)}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center">
                    <p className="text-sm text-text-secondary">No billing occurrences found</p>
                  </td>
                </tr>
              ) : items.map((item, index) => {
                const rowSelectable = selectable && item.status === 'OPEN';
                const selected = selectedIds.has(item.id);
                return <tr key={item.id} tabIndex={canEdit && onEdit ? 0 : undefined} onClick={(event) => handleRowClick(item, event)} onKeyDown={(event) => handleRowKeyDown(item, event)} className={cn('border-b border-border-primary transition-colors hover:bg-background-tertiary/60', selected ? 'bg-oak-row-selected hover:bg-oak-row-selected-hover' : index % 2 === 0 && 'bg-oak-row-alt', canEdit && onEdit && 'cursor-pointer')}>
                  {selectable ? <td className="px-2 py-3 text-center align-middle"><button type="button" disabled={!rowSelectable} onClick={(event) => { event.stopPropagation(); if (rowSelectable) onToggleOne?.(item.id); }} aria-label={selected ? `Deselect billing occurrence for ${item.company.name}` : `Select billing occurrence for ${item.company.name}`} aria-pressed={selected} title={rowSelectable ? undefined : 'Only open billing occurrences can be marked as billed'} className="rounded p-0.5 transition-colors hover:bg-background-secondary disabled:cursor-not-allowed disabled:opacity-40"><SelectionIcon selected={selected} /></button></td> : null}
                  {visibleColumns.map((column) => <Cell key={column} item={item} column={column} canEdit={canEdit} onEdit={onEdit} />)}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
