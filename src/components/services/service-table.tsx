'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckSquare,
  MinusSquare,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import { cn, formatCurrency, formatDateShort } from '@/lib/utils';
import {
  getBillingFrequencyLabel,
  getServiceStatusColor,
  getServiceStatusLabel,
  getServiceTypeLabel,
  SERVICE_STATUSES,
  SERVICE_TYPES,
} from '@/lib/constants/contracts';
import { MobileCard, CardDetailItem, CardDetailsGrid } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { AmountFilter, type AmountFilterValue } from '@/components/ui/amount-filter';
import type { ContractServiceWithRelations } from '@/hooks/use-contract-services';
import type { ServiceStatus, ServiceType } from '@/generated/prisma';

export interface ServiceInlineFilters {
  query?: string;
  companyId?: string;
  status?: ServiceStatus;
  serviceType?: ServiceType;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  rateFrom?: number;
  rateTo?: number;
}

export interface ServiceCompanyOption {
  id: string;
  name: string;
}

const COLUMN_IDS = [
  'service',
  'company',
  'type',
  'status',
  'rate',
  'startDate',
  'endDate',
] as const;

type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  service: 'Service',
  company: 'Company',
  type: 'Type',
  status: 'Status',
  rate: 'Rate',
  startDate: 'Start Date',
  endDate: 'End Date',
};

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, string>> = {
  service: 'name',
  company: 'company',
  type: 'serviceType',
  status: 'status',
  rate: 'rate',
  startDate: 'startDate',
  endDate: 'endDate',
};

const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnId, number>> = {
  service: 240,
  company: 200,
  type: 120,
  status: 120,
  rate: 160,
  startDate: 130,
  endDate: 130,
};

const RIGHT_ALIGNED_COLUMNS = new Set<ColumnId>(['rate']);

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatRate(service: ContractServiceWithRelations): string {
  if (service.rate == null) return '-';
  const base = formatCurrency(Number(service.rate), service.currency);
  if (service.frequency === 'ONE_TIME') return base;
  return `${base} / ${getBillingFrequencyLabel(service.frequency).toLowerCase()}`;
}

export interface ServiceTableProps {
  services: ContractServiceWithRelations[];
  isLoading?: boolean;
  isFetching?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  onViewScope?: (service: ContractServiceWithRelations) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleOne?: (id: string) => void;
  onToggleAll?: () => void;
  isAllSelected?: boolean;
  isIndeterminate?: boolean;
  inlineFilters?: ServiceInlineFilters;
  onInlineFilterChange?: (filters: Partial<ServiceInlineFilters>) => void;
  companyFilterOptions?: ServiceCompanyOption[];
  columnWidths?: Partial<Record<ColumnId, number>>;
  onColumnWidthChange?: (columnId: ColumnId, width: number) => void;
}

export function ServiceTable({
  services,
  isLoading,
  isFetching,
  sortBy,
  sortOrder,
  onSort,
  onViewScope,
  selectable = false,
  selectedIds = new Set(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
  inlineFilters = {},
  onInlineFilterChange,
  companyFilterOptions = [],
  columnWidths: externalColumnWidths,
  onColumnWidthChange,
}: ServiceTableProps) {
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
        case 'service':
          return (
            <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
              <input
                type="text"
                value={inlineFilters.query || ''}
                onChange={(e) => onInlineFilterChange({ query: e.target.value || undefined })}
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

        case 'type':
          return (
            <SearchableSelect
              options={[
                { value: '', label: 'All' },
                ...SERVICE_TYPES.map((t) => ({ value: t.value, label: t.label })),
              ]}
              value={inlineFilters.serviceType || ''}
              onChange={(value) => onInlineFilterChange({ serviceType: value as ServiceType || undefined })}
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
              options={[
                { value: '', label: 'All' },
                ...SERVICE_STATUSES.map((s) => ({ value: s.value, label: s.label })),
              ]}
              value={inlineFilters.status || ''}
              onChange={(value) => onInlineFilterChange({ status: value as ServiceStatus || undefined })}
              placeholder="All"
              className="text-xs w-full min-w-0"
              containerClassName="bg-background-secondary/30"
              showChevron={false}
              showKeyboardHints={false}
            />
          );

        case 'rate':
          return (
            <AmountFilter
              value={
                inlineFilters.rateFrom !== undefined || inlineFilters.rateTo !== undefined
                  ? {
                      mode: 'range',
                      range: {
                        from: inlineFilters.rateFrom,
                        to: inlineFilters.rateTo,
                      },
                    }
                  : undefined
              }
              onChange={(value: AmountFilterValue | undefined) => {
                if (!value) {
                  onInlineFilterChange({ rateFrom: undefined, rateTo: undefined });
                } else if (value.mode === 'single' && value.single !== undefined) {
                  onInlineFilterChange({ rateFrom: value.single, rateTo: value.single });
                } else if (value.mode === 'range' && value.range) {
                  onInlineFilterChange({
                    rateFrom: value.range.from,
                    rateTo: value.range.to,
                  });
                }
              }}
              placeholder="All"
              size="sm"
              showChevron={false}
            />
          );

        case 'startDate':
          return (
            <DatePicker
              value={
                inlineFilters.startDateFrom || inlineFilters.startDateTo
                  ? {
                      mode: 'range' as const,
                      range: {
                        from: inlineFilters.startDateFrom ? new Date(inlineFilters.startDateFrom) : undefined,
                        to: inlineFilters.startDateTo ? new Date(inlineFilters.startDateTo) : undefined,
                      },
                    }
                  : undefined
              }
              onChange={(value: DatePickerValue | undefined) => {
                if (!value || value.mode !== 'range') {
                  onInlineFilterChange({ startDateFrom: undefined, startDateTo: undefined });
                } else if (value.range) {
                  onInlineFilterChange({
                    startDateFrom: value.range.from ? toLocalDateString(value.range.from) : undefined,
                    startDateTo: value.range.to ? toLocalDateString(value.range.to) : undefined,
                  });
                }
              }}
              placeholder="All dates"
              size="sm"
              defaultTab="range"
              className="text-xs"
            />
          );

        case 'endDate':
          return (
            <DatePicker
              value={
                inlineFilters.endDateFrom || inlineFilters.endDateTo
                  ? {
                      mode: 'range' as const,
                      range: {
                        from: inlineFilters.endDateFrom ? new Date(inlineFilters.endDateFrom) : undefined,
                        to: inlineFilters.endDateTo ? new Date(inlineFilters.endDateTo) : undefined,
                      },
                    }
                  : undefined
              }
              onChange={(value: DatePickerValue | undefined) => {
                if (!value || value.mode !== 'range') {
                  onInlineFilterChange({ endDateFrom: undefined, endDateTo: undefined });
                } else if (value.range) {
                  onInlineFilterChange({
                    endDateFrom: value.range.from ? toLocalDateString(value.range.from) : undefined,
                    endDateTo: value.range.to ? toLocalDateString(value.range.to) : undefined,
                  });
                }
              }}
              placeholder="All dates"
              size="sm"
              defaultTab="range"
              className="text-xs"
            />
          );

        default:
          return null;
      }
    },
    [companyFilterOptions, inlineFilters, onInlineFilterChange]
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

  const hasData = services.length > 0;

  return (
    <>
      {/* Mobile Card View */}
      <div className={cn('md:hidden space-y-3', isFetching && 'opacity-60')}>
        {isLoading && !hasData ? (
          <div className="card p-8 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-oak-light" />
            <span className="ml-3 text-text-secondary">Loading services...</span>
          </div>
        ) : !hasData ? (
          <div className="card p-6 sm:p-12 text-center">
            <p className="text-text-secondary">No services found</p>
          </div>
        ) : (
          services.map((service, index) => {
            const isAlternate = index % 2 === 1;
            const isSelected = selectedIds.has(service.id);
            return (
              <MobileCard
                key={service.id}
                className={isAlternate ? 'bg-oak-row-alt' : undefined}
                selectable={selectable}
                isSelected={isSelected}
                onToggle={() => onToggleOne?.(service.id)}
                title={service.name}
                subtitle={service.contract?.company?.name || 'Unknown Company'}
                badge={(
                  <span className={`badge ${getServiceStatusColor(service.status)}`}>
                    {getServiceStatusLabel(service.status)}
                  </span>
                )}
                details={(
                  <CardDetailsGrid>
                    <CardDetailItem label="Type" value={getServiceTypeLabel(service.serviceType)} />
                    <CardDetailItem label="Rate" value={formatRate(service)} />
                    <CardDetailItem label="Start" value={formatDateShort(service.startDate)} />
                    <CardDetailItem label="End" value={service.endDate ? formatDateShort(service.endDate) : '-'} />
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
                      aria-label={isAllSelected ? 'Deselect all services' : 'Select all services'}
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
                    <p className="text-sm text-text-secondary">No services found</p>
                  </td>
                </tr>
              ) : (
                services.map((service, index) => {
                  const isAlternate = index % 2 === 1;
                  const isSelected = selectedIds.has(service.id);
                  const canOpenScope = !!service.scope && !!onViewScope;

                  return (
                    <tr
                      key={service.id}
                      className={cn(
                        'border-b border-border-primary transition-colors',
                        isSelected
                          ? 'bg-oak-row-selected hover:bg-oak-row-selected-hover'
                          : isAlternate
                            ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                            : 'hover:bg-background-tertiary/50'
                      )}
                      onClick={(event) => {
                        if (!canOpenScope) return;
                        const target = event.target as HTMLElement;
                        if (target.closest('button, a, input, select, textarea')) return;
                        onViewScope?.(service);
                      }}
                    >
                      {selectable && (
                        <td className="px-4 py-3 max-w-0">
                          <button
                            onClick={() => onToggleOne?.(service.id)}
                            className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                            aria-label={isSelected ? `Deselect ${service.name}` : `Select ${service.name}`}
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
                      <td className={cn('px-4 py-3 max-w-0', canOpenScope && 'cursor-pointer')}>
                        <span
                          className={cn(
                            'font-medium text-text-primary truncate block',
                            canOpenScope && 'hover:text-oak-light'
                          )}
                        >
                          {service.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        {service.contract?.company ? (
                          <Link
                            href={`/companies/${service.contract.company.id}`}
                            className="text-text-primary hover:text-oak-light transition-colors truncate block"
                          >
                            {service.contract.company.name}
                          </Link>
                        ) : (
                          <span className="text-text-muted block truncate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <span className="text-text-secondary block truncate">
                          {getServiceTypeLabel(service.serviceType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <span className={`badge ${getServiceStatusColor(service.status)}`}>
                          {getServiceStatusLabel(service.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right max-w-0">
                      {service.rate != null ? (
                        <div className="text-text-primary truncate">
                          <span className="font-medium">
                            {formatCurrency(Number(service.rate), service.currency)}
                          </span>
                          {service.frequency !== 'ONE_TIME' && (
                            <span className="text-xs text-text-muted ml-1">
                              / {getBillingFrequencyLabel(service.frequency).toLowerCase()}
                            </span>
                          )}
                        </div>
                        ) : (
                          <span className="text-text-muted block truncate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <span className="text-sm text-text-primary truncate block">
                          {formatDateShort(service.startDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <span className="text-sm text-text-primary truncate block">
                          {service.endDate ? formatDateShort(service.endDate) : '-'}
                        </span>
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

export default ServiceTable;
