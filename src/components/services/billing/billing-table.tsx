'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CardDetailItem, CardDetailsGrid, MobileCard } from '@/components/ui/responsive-table';
import { cn, formatCurrency } from '@/lib/utils';
import type { BillingOccurrenceDto } from '@/services/billing';
import type { BillingColumnId } from '@/lib/validations/services-preferences';

export interface BillingInlineFilters {
  company?: string;
  familyService?: string;
  feeLinePeriod?: string;
}

export interface BillingTableProps {
  items: BillingOccurrenceDto[];
  isFetching?: boolean;
  canEdit?: boolean;
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
  onEdit?: (occurrence: BillingOccurrenceDto) => void;
}

export const billingColumnLabels: Record<BillingColumnId, string> = {
  expectedDate: 'Expected date',
  timing: 'Timing',
  company: 'Company',
  familyService: 'Family / service',
  feeLinePeriod: 'Fee line / period',
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
  familyService: 220,
  feeLinePeriod: 220,
  status: 110,
  amount: 150,
  billedDate: 130,
  reference: 170,
  actions: 100,
};

const sortableColumns: Partial<Record<BillingColumnId, BillingTableProps['sortBy']>> = {
  expectedDate: 'expectedDate',
  company: 'company',
  familyService: 'service',
  status: 'status',
  amount: 'amount',
};

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
  return (
    <div className="min-w-0" title={item.company.name}>
      <span className="block truncate font-medium text-text-primary">{item.company.displayLabel}</span>
      <span className="block truncate text-xs text-text-secondary">{item.company.name}</span>
    </div>
  );
}

function FamilyServiceCell({ item }: { item: BillingOccurrenceDto }) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-2 truncate text-sm text-text-primary">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.family.displayColor ?? '#2F6F5E' }} />
        <span className="truncate">{item.family.name || item.service.familyName}</span>
      </span>
      <span className="block truncate text-xs text-text-secondary">{item.service.name}</span>
    </div>
  );
}

function FeeLinePeriodCell({ item }: { item: BillingOccurrenceDto }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-sm text-text-primary">{item.feeLine.description || 'Fee line'}</span>
      <span className="block truncate text-xs text-text-secondary">{item.billingPeriodKey}</span>
    </div>
  );
}

function SortableHeader({ column, sortBy, sortOrder, onSort, onResize }: { column: BillingColumnId; sortBy: BillingTableProps['sortBy']; sortOrder: BillingTableProps['sortOrder']; onSort?: BillingTableProps['onSort']; onResize: (columnId: BillingColumnId, event: React.PointerEvent<HTMLButtonElement>) => void }) {
  const field = sortableColumns[column];
  const active = field === sortBy;
  return (
    <th scope="col" aria-sort={field ? (active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} className="relative px-3 py-3 text-left text-xs font-medium text-text-secondary">
      {field && onSort ? (
        <button type="button" onClick={() => onSort(field)} aria-label={active ? `Sort by ${billingColumnLabels[column]}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${billingColumnLabels[column]}`} className="inline-flex min-h-11 items-center gap-1 text-left hover:text-text-primary sm:min-h-0">
          <span>{billingColumnLabels[column]}</span>
          {active ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />) : <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
        </button>
      ) : <span>{billingColumnLabels[column]}</span>}
      {column !== 'actions' ? <button type="button" aria-label={`Resize ${billingColumnLabels[column]} column`} onPointerDown={(event) => onResize(column, event)} className="absolute inset-y-0 -right-2 w-4 cursor-col-resize touch-none" /> : null}
    </th>
  );
}

function DebouncedInlineFilter({ label, value, filterKey, onChange }: { label: string; value: string | undefined; filterKey: keyof BillingInlineFilters; onChange?: BillingTableProps['onInlineFilterChange'] }) {
  const [draft, setDraft] = useState(value ?? '');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  useEffect(() => {
    if (draft === (value ?? '')) return undefined;
    const timeout = window.setTimeout(() => {
      onChangeRef.current?.({ [filterKey]: draft || undefined });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [draft, filterKey, value]);

  return <input type="search" aria-label={`Filter ${label}`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="All" className="h-9 w-full min-w-0 rounded-lg border border-border-primary bg-background-secondary/50 px-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20" />;
}

function InlineFilterRow({ columns, filters, onChange }: { columns: BillingColumnId[]; filters: BillingInlineFilters; onChange?: BillingTableProps['onInlineFilterChange'] }) {
  const filter = (label: string, value: string | undefined, key: keyof BillingInlineFilters) => <DebouncedInlineFilter label={label} value={value} filterKey={key} onChange={onChange} />;

  return (
    <tr className="border-b border-border-primary bg-background-secondary/60">
      {columns.map((column) => (
        <th key={column} scope="row" className="px-3 py-2">
          {column === 'company' ? filter('company', filters.company, 'company') : null}
          {column === 'familyService' ? filter('family or service', filters.familyService, 'familyService') : null}
          {column === 'feeLinePeriod' ? filter('fee line', filters.feeLinePeriod, 'feeLinePeriod') : null}
          {column !== 'company' && column !== 'familyService' && column !== 'feeLinePeriod' ? <span className="sr-only">{billingColumnLabels[column]} filter</span> : null}
        </th>
      ))}
    </tr>
  );
}

function Cell({ item, column, canEdit, onEdit }: { item: BillingOccurrenceDto; column: BillingColumnId; canEdit: boolean; onEdit?: (occurrence: BillingOccurrenceDto) => void }) {
  const amount = formatCurrency(item.operativeAmount, item.operativeCurrency);
  switch (column) {
    case 'expectedDate': return <td className="px-3 py-3 align-top text-sm text-text-secondary">{displayDate(item.operativeExpectedDate)}</td>;
    case 'timing': return <td className="px-3 py-3 align-top"><span className={cn('badge', statusClass(item.status, item.timingState))}>{timingLabel(item)}</span></td>;
    case 'company': return <td className="max-w-0 px-3 py-3 align-top"><CompanyCell item={item} /></td>;
    case 'familyService': return <td className="max-w-0 px-3 py-3 align-top"><FamilyServiceCell item={item} /></td>;
    case 'feeLinePeriod': return <td className="max-w-0 px-3 py-3 align-top"><FeeLinePeriodCell item={item} /></td>;
    case 'status': return <td className="px-3 py-3 align-top"><span className={cn('badge', statusClass(item.status, item.timingState))}>{statusLabel(item.status)}</span></td>;
    case 'amount': return <td className="px-3 py-3 align-top text-sm text-text-primary">{amount}</td>;
    case 'billedDate': return <td className="px-3 py-3 align-top text-sm text-text-secondary">{displayDate(item.billedDate)}</td>;
    case 'reference': return <td className="max-w-0 px-3 py-3 align-top text-sm text-text-secondary"><span className="block truncate" title={item.externalReference ?? undefined}>{item.externalReference || '—'}</span></td>;
    case 'actions': return <td className="px-3 py-3 align-top"><Button type="button" variant="ghost" size="xs" iconOnly aria-label={`Edit tracking for ${item.company.displayLabel}`} onClick={() => onEdit?.(item)} disabled={!canEdit} leftIcon={<MoreHorizontal className="h-4 w-4" />} /></td>;
  }
}

function MobileBillingCard({ item, canEdit, onEdit }: { item: BillingOccurrenceDto; canEdit: boolean; onEdit?: (occurrence: BillingOccurrenceDto) => void }) {
  return (
    <MobileCard
      title={<CompanyCell item={item} />}
      subtitle={<span title={item.service.name}>{item.service.name}</span>}
      badge={<span className={cn('badge', statusClass(item.status, item.timingState))}>{item.status === 'OPEN' ? timingLabel(item) : statusLabel(item.status)}</span>}
      actions={<Button type="button" variant="ghost" size="xs" iconOnly aria-label={`Edit tracking for ${item.company.displayLabel}`} onClick={() => onEdit?.(item)} disabled={!canEdit} leftIcon={<MoreHorizontal className="h-4 w-4" />} />}
      details={(
        <CardDetailsGrid>
          <CardDetailItem label="Family" value={item.family.name || item.service.familyName} />
          <CardDetailItem label="Expected date" value={displayDate(item.operativeExpectedDate)} />
          <CardDetailItem label="Fee line / period" value={`${item.feeLine.description || 'Fee line'} · ${item.billingPeriodKey}`} fullWidth />
          <CardDetailItem label="Amount" value={formatCurrency(item.operativeAmount, item.operativeCurrency)} />
          <CardDetailItem label="Billed date" value={displayDate(item.billedDate)} />
          <CardDetailItem label="Reference" value={item.externalReference || '—'} fullWidth />
        </CardDetailsGrid>
      )}
    />
  );
}

export function BillingTable({ items, isFetching = false, canEdit = true, columnWidths, columnOrder, columnVisibility, sortBy, sortOrder, inlineFilters = {}, onInlineFilterChange, onSort, onColumnWidthChange, onColumnResizeEnd, onEdit }: BillingTableProps) {
  const visibleColumns = columnOrder.filter((column) => columnVisibility[column]);
  const startResize = (columnId: BillingColumnId, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!onColumnWidthChange || !onColumnResizeEnd) return;
    event.preventDefault();
    const startX = event.clientX;
    const initial = columnWidths[columnId] ?? defaultBillingColumnWidths[columnId];
    let latestWidth = initial;
    const pointerMove = (moveEvent: PointerEvent) => {
      latestWidth = Math.max(96, initial + moveEvent.clientX - startX);
      onColumnWidthChange(columnId, latestWidth);
    };
    const pointerUp = () => {
      window.removeEventListener('pointermove', pointerMove);
      onColumnResizeEnd(columnId, latestWidth);
      window.removeEventListener('pointerup', pointerUp);
    };
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp, { once: true });
  };

  if (items.length === 0 && !isFetching) {
    return <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">No billing occurrences match these filters.</div>;
  }

  return (
    <>
      <div role="region" className="space-y-3 md:hidden" aria-label="Billing occurrence cards">
        {items.map((item) => <MobileBillingCard key={item.id} item={item} canEdit={canEdit} onEdit={onEdit} />)}
      </div>
      <div className={cn('hidden overflow-x-auto rounded-xl border border-border-primary bg-background-secondary md:block', isFetching && 'opacity-70')}>
        <table className="min-w-[1480px] w-full table-fixed border-collapse" aria-label="Billing occurrences table">
          <colgroup>{visibleColumns.map((column) => <col key={column} style={{ width: `${columnWidths[column] ?? defaultBillingColumnWidths[column]}px` }} />)}</colgroup>
          <thead>
            <InlineFilterRow columns={visibleColumns} filters={inlineFilters} onChange={onInlineFilterChange} />
            <tr className="border-b border-border-primary bg-background-tertiary/70">
              {visibleColumns.map((column) => <SortableHeader key={column} column={column} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} onResize={startResize} />)}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => <tr key={item.id} className={cn('border-b border-border-primary transition-colors hover:bg-background-tertiary/60', index % 2 === 0 && 'bg-oak-row-alt')}>{visibleColumns.map((column) => <Cell key={column} item={item} column={column} canEdit={canEdit} onEdit={onEdit} />)}</tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
