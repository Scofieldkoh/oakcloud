'use client';

import { memo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { formatDateShort, formatCurrency, cn } from '@/lib/utils';
import { getEntityTypeLabel, ENTITY_TYPES, COMPANY_STATUSES } from '@/lib/constants';
import { SUPPORTED_CURRENCIES } from '@/lib/validations/exchange-rate';
import { Building2, MoreHorizontal, ExternalLink, Pencil, Trash2, Square, CheckSquare, MinusSquare, ArrowUp, ArrowDown, ArrowUpDown, X, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { PrefetchLink } from '@/components/ui/prefetch-link';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { AmountFilter, type AmountFilterValue } from '@/components/ui/amount-filter';
import type { Company, CompanyStatus, EntityType } from '@/generated/prisma';

interface CompanyWithRelations extends Company {
  addresses?: Array<{
    id: string;
    addressType: string;
    fullAddress: string;
    isCurrent: boolean;
  }>;
  _count?: {
    documents: number;
    officers: number;
    shareholders: number;
    charges: number;
  };
  /** Whether any linked contact is marked as Point of Contact */
  hasPoc?: boolean;
}

/** Month names for FYE filter */
const MONTH_NAMES = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

/** Inline filter values for the table */
export interface CompanyInlineFilters {
  companyName?: string;
  address?: string;
  uen?: string;
  entityType?: EntityType;
  status?: CompanyStatus;
  incorporationDateFrom?: string;
  incorporationDateTo?: string;
  officersMin?: number;
  officersMax?: number;
  shareholdersMin?: number;
  shareholdersMax?: number;
  homeCurrency?: string;
  financialYearEndMonth?: number;
  paidUpCapitalMin?: number;
  paidUpCapitalMax?: number;
  issuedCapitalMin?: number;
  issuedCapitalMax?: number;
  hasWarnings?: boolean;
}

// Column definitions
const COLUMN_IDS = [
  'open',
  'warnings',
  'company',
  'address',
  'uen',
  'type',
  'status',
  'homeCurrency',
  'fye',
  'incorporated',
  'officers',
  'shareholders',
  'paidUpCapital',
  'issuedCapital',
  'actions',
] as const;
type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  open: '',
  warnings: '',
  company: 'Company',
  address: 'Address',
  uen: 'UEN',
  type: 'Type',
  status: 'Status',
  incorporated: 'Incorporated',
  officers: 'Officers',
  shareholders: 'Shareholders',
  homeCurrency: 'Currency',
  fye: 'FYE',
  paidUpCapital: 'Paid-up Capital',
  issuedCapital: 'Issued Capital',
  actions: '',
};

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, string>> = {
  company: 'name',
  address: 'address',
  uen: 'uen',
  status: 'status',
  incorporated: 'incorporationDate',
  homeCurrency: 'homeCurrency',
  fye: 'financialYearEndMonth',
  officers: 'officersCount',
  shareholders: 'shareholdersCount',
  paidUpCapital: 'paidUpCapitalAmount',
  issuedCapital: 'issuedCapitalAmount',
};

const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnId, number>> = {
  open: 44,
  warnings: 36,
  company: 200,
  address: 250,
  uen: 120,
  type: 160,
  status: 100,
  incorporated: 120,
  officers: 80,
  shareholders: 100,
  homeCurrency: 90,
  fye: 80,
  paidUpCapital: 130,
  issuedCapital: 130,
  actions: 50,
};

/** Option for company filter dropdown */
export interface CompanyFilterOption {
  id: string;
  name: string;
}

interface CompanyTableProps {
  companies: CompanyWithRelations[];
  onDelete?: (id: string) => void;
  /** Whether data is being refetched (for opacity transition) */
  isFetching?: boolean;
  /** Function to check if user can edit a specific company, or boolean for all */
  canEdit?: boolean | ((companyId: string) => boolean);
  /** Function to check if user can delete a specific company, or boolean for all */
  canDelete?: boolean | ((companyId: string) => boolean);
  canCreate?: boolean;
  /** Whether to show selection checkboxes */
  selectable?: boolean;
  /** Set of currently selected company IDs */
  selectedIds?: Set<string>;
  /** Handler for toggling a single item */
  onToggleOne?: (id: string) => void;
  /** Handler for toggling all items */
  onToggleAll?: () => void;
  /** Whether all items are selected */
  isAllSelected?: boolean;
  /** Whether some but not all items are selected */
  isIndeterminate?: boolean;
  /** Current sort field */
  sortBy?: string;
  /** Current sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Handler for sorting */
  onSort?: (field: string) => void;
  /** Current inline filter values */
  inlineFilters?: CompanyInlineFilters;
  /** Handler for inline filter changes */
  onInlineFilterChange?: (filters: Partial<CompanyInlineFilters>) => void;
  /** Column widths for resizable columns */
  columnWidths?: Partial<Record<ColumnId, number>>;
  /** Handler for column width changes */
  onColumnWidthChange?: (columnId: ColumnId, width: number) => void;
  /** Available companies for filter dropdown (dynamic search) */
  companyFilterOptions?: CompanyFilterOption[];
}

/** Sortable column header component with resize handle */
function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  width,
  onResize,
  columnId,
}: {
  label: string;
  field?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  width?: number;
  onResize?: (e: React.PointerEvent, columnId: ColumnId) => void;
  columnId: ColumnId;
}) {
  const isActive = field && sortBy === field;
  const isSortable = field && onSort;

  const sortLabel = isActive
    ? `Sort by ${label}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}`
    : `Sort by ${label}`;

  return (
    <th
      style={width ? { width: `${width}px` } : undefined}
      className={cn(
        'relative text-xs font-medium text-text-secondary py-2.5 whitespace-nowrap text-left',
        columnId === 'actions' ? 'px-2' : 'px-4'
      )}
    >
      {isSortable ? (
        <button
          type="button"
          onClick={() => onSort(field)}
          aria-label={sortLabel}
          className={cn(
            'inline-flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer select-none',
            isActive ? 'text-text-primary' : ''
          )}
        >
          <span>{label}</span>
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
        <span>{label}</span>
      )}
      {onResize && (
        <div
          onPointerDown={(e) => onResize(e, columnId)}
          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
          title="Drag to resize"
        />
      )}
    </th>
  );
}

const statusConfig: Record<CompanyStatus, { color: string; label: string }> = {
  LIVE: { color: 'badge-success', label: 'Live' },
  STRUCK_OFF: { color: 'badge-error', label: 'Struck Off' },
  WINDING_UP: { color: 'badge-warning', label: 'Winding Up' },
  DISSOLVED: { color: 'badge-neutral', label: 'Dissolved' },
  IN_LIQUIDATION: { color: 'badge-warning', label: 'In Liquidation' },
  IN_RECEIVERSHIP: { color: 'badge-warning', label: 'In Receivership' },
  AMALGAMATED: { color: 'badge-info', label: 'Amalgamated' },
  CONVERTED: { color: 'badge-info', label: 'Converted' },
  OTHER: { color: 'badge-neutral', label: 'Other' },
};


interface CompanyActionsDropdownProps {
  companyId: string;
  companyName?: string;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const CompanyActionsDropdown = memo(function CompanyActionsDropdown({ companyId, companyName, onDelete, canEdit, canDelete }: CompanyActionsDropdownProps) {
  // If user can only view, don't show the dropdown at all - just provide the view link
  const hasAnyAction = canEdit || canDelete;

  if (!hasAnyAction) {
    return null;
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild aria-label={`Actions for ${companyName || 'company'}`}>
        <button className="p-1 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors">
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={`/companies/${companyId}`}>
          <DropdownItem icon={<ExternalLink className="w-4 h-4" />}>
            View Details
          </DropdownItem>
        </Link>
        {canEdit && (
          <Link href={`/companies/${companyId}/edit`}>
            <DropdownItem icon={<Pencil className="w-4 h-4" />}>
              Edit
            </DropdownItem>
          </Link>
        )}
        {canDelete && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 className="w-4 h-4" />}
              destructive
              onClick={() => onDelete?.(companyId)}
            >
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
});

/**
 * Convert a Date to a local YYYY-MM-DD string.
 */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function CompanyTable({
  companies,
  onDelete,
  isFetching,
  canEdit = true,
  canDelete = true,
  canCreate = true,
  selectable = false,
  selectedIds = new Set(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
  sortBy,
  sortOrder,
  onSort,
  inlineFilters = {},
  onInlineFilterChange,
  columnWidths: externalColumnWidths,
  onColumnWidthChange,
  companyFilterOptions = [],
}: CompanyTableProps) {
  // Internal column widths state (used if external not provided)
  const [internalColumnWidths, setInternalColumnWidths] = useState<Partial<Record<ColumnId, number>>>({});
  const columnWidths = externalColumnWidths ?? internalColumnWidths;
  const isResizingRef = useRef(false);

  // Column resize handler
  const startResize = useCallback((e: React.PointerEvent, columnId: ColumnId) => {
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
  }, [columnWidths, onColumnWidthChange]);

  // Helper to check permission - supports both boolean and function
  const checkCanEdit = (companyId: string): boolean => {
    if (typeof canEdit === 'function') return canEdit(companyId);
    return canEdit;
  };

  const checkCanDelete = (companyId: string): boolean => {
    if (typeof canDelete === 'function') return canDelete(companyId);
    return canDelete;
  };

  // Note: Loading state is handled at the page level (shows spinner when isLoading && !data)
  // This component only renders when data exists, using isFetching for opacity dimming

  // Render filter cell for a column
  const renderFilterCell = (columnId: ColumnId) => {
    if (!onInlineFilterChange) return null;

    switch (columnId) {
      case 'open':
        return null;

      case 'warnings':
        return (
          <div className="flex items-center justify-center h-9">
            <button
              type="button"
              onClick={() => onInlineFilterChange({ hasWarnings: inlineFilters.hasWarnings ? undefined : true })}
              className={cn(
                'p-1 rounded transition-colors',
                inlineFilters.hasWarnings
                  ? 'text-amber-500 bg-amber-500/10'
                  : 'text-text-muted hover:text-text-secondary hover:bg-background-tertiary'
              )}
              title={inlineFilters.hasWarnings ? 'Showing companies with warnings (click to clear)' : 'Filter by warnings'}
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
          </div>
        );

      case 'company':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...companyFilterOptions.map(c => ({ value: c.name, label: c.name }))
            ]}
            value={inlineFilters.companyName || ''}
            onChange={(value) => onInlineFilterChange({ companyName: value || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'address':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.address || ''}
              onChange={(e) => onInlineFilterChange({ address: e.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
            {inlineFilters.address && (
              <button
                type="button"
                onClick={() => onInlineFilterChange({ address: undefined })}
                className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            )}
          </div>
        );

      case 'uen':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.uen || ''}
              onChange={(e) => onInlineFilterChange({ uen: e.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
            {inlineFilters.uen && (
              <button
                type="button"
                onClick={() => onInlineFilterChange({ uen: undefined })}
                className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            )}
          </div>
        );

      case 'type':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...ENTITY_TYPES.map(t => ({ value: t.value, label: t.shortLabel }))
            ]}
            value={inlineFilters.entityType || ''}
            onChange={(value) => onInlineFilterChange({ entityType: value as EntityType || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'status':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...COMPANY_STATUSES.map(s => ({ value: s.value, label: s.label }))
            ]}
            value={inlineFilters.status || ''}
            onChange={(value) => onInlineFilterChange({ status: value as CompanyStatus || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'incorporated':
        return (
          <DatePicker
            value={
              inlineFilters.incorporationDateFrom || inlineFilters.incorporationDateTo
                ? {
                    mode: 'range' as const,
                    range: {
                      from: inlineFilters.incorporationDateFrom ? new Date(inlineFilters.incorporationDateFrom) : undefined,
                      to: inlineFilters.incorporationDateTo ? new Date(inlineFilters.incorporationDateTo) : undefined,
                    }
                  }
                : undefined
            }
            onChange={(value: DatePickerValue | undefined) => {
              if (!value || value.mode !== 'range') {
                onInlineFilterChange({ incorporationDateFrom: undefined, incorporationDateTo: undefined });
              } else if (value.range) {
                onInlineFilterChange({
                  incorporationDateFrom: value.range.from ? toLocalDateString(value.range.from) : undefined,
                  incorporationDateTo: value.range.to ? toLocalDateString(value.range.to) : undefined,
                });
              }
            }}
            placeholder="All dates"
            size="sm"
            defaultTab="range"
            className="text-xs"
          />
        );

      case 'officers':
        return (
          <AmountFilter
            value={
              inlineFilters.officersMin !== undefined || inlineFilters.officersMax !== undefined
                ? {
                    mode: 'range',
                    range: {
                      from: inlineFilters.officersMin,
                      to: inlineFilters.officersMax,
                    }
                  }
                : undefined
            }
            onChange={(value: AmountFilterValue | undefined) => {
              if (!value) {
                onInlineFilterChange({ officersMin: undefined, officersMax: undefined });
              } else if (value.mode === 'single' && value.single !== undefined) {
                onInlineFilterChange({ officersMin: value.single, officersMax: value.single });
              } else if (value.mode === 'range' && value.range) {
                onInlineFilterChange({
                  officersMin: value.range.from,
                  officersMax: value.range.to,
                });
              }
            }}
            placeholder="All"
            size="sm"
            showChevron={false}
          />
        );

      case 'shareholders':
        return (
          <AmountFilter
            value={
              inlineFilters.shareholdersMin !== undefined || inlineFilters.shareholdersMax !== undefined
                ? {
                    mode: 'range',
                    range: {
                      from: inlineFilters.shareholdersMin,
                      to: inlineFilters.shareholdersMax,
                    }
                  }
                : undefined
            }
            onChange={(value: AmountFilterValue | undefined) => {
              if (!value) {
                onInlineFilterChange({ shareholdersMin: undefined, shareholdersMax: undefined });
              } else if (value.mode === 'single' && value.single !== undefined) {
                onInlineFilterChange({ shareholdersMin: value.single, shareholdersMax: value.single });
              } else if (value.mode === 'range' && value.range) {
                onInlineFilterChange({
                  shareholdersMin: value.range.from,
                  shareholdersMax: value.range.to,
                });
              }
            }}
            placeholder="All"
            size="sm"
            showChevron={false}
          />
        );

      case 'homeCurrency':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...SUPPORTED_CURRENCIES.map(c => ({ value: c, label: c }))
            ]}
            value={inlineFilters.homeCurrency || ''}
            onChange={(value) => onInlineFilterChange({ homeCurrency: value || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'fye':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...MONTH_NAMES.map(m => ({ value: String(m.value), label: m.label.slice(0, 3) }))
            ]}
            value={inlineFilters.financialYearEndMonth ? String(inlineFilters.financialYearEndMonth) : ''}
            onChange={(value) => onInlineFilterChange({ financialYearEndMonth: value ? parseInt(value, 10) : undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'paidUpCapital':
        return (
          <AmountFilter
            value={
              inlineFilters.paidUpCapitalMin !== undefined || inlineFilters.paidUpCapitalMax !== undefined
                ? {
                    mode: 'range',
                    range: {
                      from: inlineFilters.paidUpCapitalMin,
                      to: inlineFilters.paidUpCapitalMax,
                    }
                  }
                : undefined
            }
            onChange={(value: AmountFilterValue | undefined) => {
              if (!value) {
                onInlineFilterChange({ paidUpCapitalMin: undefined, paidUpCapitalMax: undefined });
              } else if (value.mode === 'single' && value.single !== undefined) {
                onInlineFilterChange({ paidUpCapitalMin: value.single, paidUpCapitalMax: value.single });
              } else if (value.mode === 'range' && value.range) {
                onInlineFilterChange({
                  paidUpCapitalMin: value.range.from,
                  paidUpCapitalMax: value.range.to,
                });
              }
            }}
            placeholder="All"
            size="sm"
            showChevron={false}
          />
        );

      case 'issuedCapital':
        return (
          <AmountFilter
            value={
              inlineFilters.issuedCapitalMin !== undefined || inlineFilters.issuedCapitalMax !== undefined
                ? {
                    mode: 'range',
                    range: {
                      from: inlineFilters.issuedCapitalMin,
                      to: inlineFilters.issuedCapitalMax,
                    }
                  }
                : undefined
            }
            onChange={(value: AmountFilterValue | undefined) => {
              if (!value) {
                onInlineFilterChange({ issuedCapitalMin: undefined, issuedCapitalMax: undefined });
              } else if (value.mode === 'single' && value.single !== undefined) {
                onInlineFilterChange({ issuedCapitalMin: value.single, issuedCapitalMax: value.single });
              } else if (value.mode === 'range' && value.range) {
                onInlineFilterChange({
                  issuedCapitalMin: value.range.from,
                  issuedCapitalMax: value.range.to,
                });
              }
            }}
            placeholder="All"
            size="sm"
            showChevron={false}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Mobile Card View */}
      <div className={cn('md:hidden space-y-3', isFetching && 'opacity-60')}>
        {selectable && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={onToggleAll}
              className="p-2 hover:bg-background-secondary rounded transition-colors flex items-center gap-2"
              aria-label={isAllSelected ? 'Deselect all companies' : 'Select all companies'}
              aria-pressed={isAllSelected}
            >
              {isAllSelected ? (
                <CheckSquare className="w-5 h-5 text-oak-primary" aria-hidden="true" />
              ) : isIndeterminate ? (
                <MinusSquare className="w-5 h-5 text-oak-light" aria-hidden="true" />
              ) : (
                <Square className="w-5 h-5 text-text-muted" aria-hidden="true" />
              )}
              <span className="text-sm text-text-secondary">
                {isAllSelected ? 'Deselect all' : 'Select all'}
              </span>
            </button>
          </div>
        )}
        {companies.length === 0 ? (
          <div className="card p-6 sm:p-12 text-center">
            <Building2 className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No companies found</h3>
            <p className="text-text-secondary mb-4">
              {canCreate
                ? 'Get started by creating your first company or adjusting your filters.'
                : 'No companies available. Try adjusting your filters.'}
            </p>
            {canCreate && (
              <Link href="/companies/new" className="btn-primary btn-sm inline-flex">
                Add Company
              </Link>
            )}
          </div>
        ) : (
          companies.map((company) => {
            const isSelected = selectedIds.has(company.id);
            return (
              <MobileCard
                key={company.id}
                isSelected={isSelected}
                selectable={selectable}
                onToggle={() => onToggleOne?.(company.id)}
                title={
                  <PrefetchLink
                    href={`/companies/${company.id}`}
                    prefetchType="company"
                    prefetchId={company.id}
                    className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                  >
                    {company.name}
                  </PrefetchLink>
                }
                subtitle={company.uen}
                badge={
                  <div className="flex items-center gap-2">
                    <span className={`badge ${statusConfig[company.status].color}`}>
                      {statusConfig[company.status].label}
                    </span>
                    {(company.financialYearEndMonth == null || company.hasPoc === false) && (
                      <span
                        className="text-amber-500"
                        title={[
                          company.financialYearEndMonth == null && 'Financial year end required',
                          company.hasPoc === false && 'Point of contact required',
                        ].filter(Boolean).join(', ')}
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                }
                selectionLabel={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
                actions={
                  <CompanyActionsDropdown
                    companyId={company.id}
                    companyName={company.name}
                    onDelete={onDelete}
                    canEdit={checkCanEdit(company.id)}
                    canDelete={checkCanDelete(company.id)}
                  />
                }
                details={
                  <CardDetailsGrid>
                    <CardDetailItem label="Type" value={getEntityTypeLabel(company.entityType, true)} />
                    <CardDetailItem label="Incorporated" value={formatDateShort(company.incorporationDate)} />
                    {company.addresses?.[0] && (
                      <CardDetailItem label="Address" value={company.addresses[0].fullAddress} fullWidth />
                    )}
                  </CardDetailsGrid>
                }
              />
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className={cn('hidden md:block table-container overflow-hidden', isFetching && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <colgroup>
              {selectable && <col style={{ width: '40px' }} />}
              {COLUMN_IDS.map((id) => (
                <col
                  key={id}
                  style={
                    id === 'open'
                      ? { width: '44px' }
                      : columnWidths[id]
                        ? { width: `${columnWidths[id]}px` }
                        : undefined
                  }
                />
              ))}
            </colgroup>
            <thead className="bg-background-tertiary border-b border-border-primary">
              {/* Inline filter row */}
              {onInlineFilterChange && (
                <tr className="bg-background-secondary/50">
                  {selectable && <th className="px-4 py-2"></th>}
                  {COLUMN_IDS.map((columnId) => (
                    <th
                      key={columnId}
                      className={cn(
                        'py-2 max-w-0',
                        columnId === 'open' || columnId === 'actions' ? 'px-2' : 'px-4'
                      )}
                    >
                      {renderFilterCell(columnId)}
                    </th>
                  ))}
                </tr>
              )}
              {/* Column header row */}
              <tr className={onInlineFilterChange ? 'border-t border-border-primary' : ''}>
                {selectable && (
                  <th className="w-10 px-4 py-2.5">
                    <button
                      onClick={onToggleAll}
                      className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                      aria-label={isAllSelected ? 'Deselect all companies' : 'Select all companies'}
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
                {COLUMN_IDS.map((columnId) =>
                  columnId === 'open' ? (
                    <th
                      key={columnId}
                      className="text-center text-xs font-medium text-text-secondary px-2 py-2.5 whitespace-nowrap"
                      title="Open in new tab"
                    >
                      <ArrowUpRight className="w-4 h-4 inline-block text-text-muted" />
                    </th>
                  ) : (
                    <SortableHeader
                      key={columnId}
                      label={COLUMN_LABELS[columnId]}
                      field={COLUMN_SORT_FIELDS[columnId]}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      width={columnWidths[columnId]}
                      onResize={columnId !== 'actions' ? startResize : undefined}
                      columnId={columnId}
                    />
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_IDS.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center">
                    <p className="text-sm text-text-secondary">No companies found</p>
                  </td>
                </tr>
              ) : (
                companies.map((company, index) => {
                  const isSelected = selectedIds.has(company.id);
                  const isAlternate = index % 2 === 1;
                  return (
                    <tr
                      key={company.id}
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
                        <td className="px-4 py-3">
                          <button
                            onClick={() => onToggleOne?.(company.id)}
                            className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                            aria-label={isSelected ? `Deselect ${company.name}` : `Select ${company.name}`}
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
                      {/* Open in new tab */}
                      <td className="px-2 py-3">
                        <Link
                          href={`/companies/${company.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
                          aria-label={`Open "${company.name}" in new tab`}
                          title={`Open "${company.name}" in new tab`}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </td>
                      {/* Warnings */}
                      <td className="px-1 py-3">
                        {(company.financialYearEndMonth == null || company.hasPoc === false) && (
                          <span
                            className="inline-flex items-center justify-center text-amber-500"
                            title={[
                              company.financialYearEndMonth == null && 'Financial year end required',
                              company.hasPoc === false && 'Point of contact required',
                            ].filter(Boolean).join(', ')}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <PrefetchLink
                          href={`/companies/${company.id}`}
                          prefetchType="company"
                          prefetchId={company.id}
                          className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                        >
                          {company.name}
                        </PrefetchLink>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">
                          {company.addresses?.[0]?.fullAddress || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{company.uen}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{getEntityTypeLabel(company.entityType, true)}</span>
                      </td>
                      <td className="px-4 py-3 max-w-0">
                        <span className={`badge ${statusConfig[company.status].color}`}>
                          {statusConfig[company.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{company.homeCurrency || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">
                          {company.financialYearEndMonth
                            ? `${company.financialYearEndDay || ''} ${MONTH_NAMES.find(m => m.value === company.financialYearEndMonth)?.label.slice(0, 3) || ''}`.trim() || '-'
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{formatDateShort(company.incorporationDate)}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        {company._count?.officers || 0}
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        {company._count?.shareholders || 0}
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0 text-right">
                        <span className="block truncate">
                          {company.paidUpCapitalAmount != null
                            ? formatCurrency(Number(company.paidUpCapitalAmount), company.paidUpCapitalCurrency || 'SGD')
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-0 text-right">
                        <span className="block truncate">
                          {company.issuedCapitalAmount != null
                            ? formatCurrency(Number(company.issuedCapitalAmount), company.issuedCapitalCurrency || 'SGD')
                            : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <CompanyActionsDropdown
                          companyId={company.id}
                          companyName={company.name}
                          onDelete={onDelete}
                          canEdit={checkCanEdit(company.id)}
                          canDelete={checkCanDelete(company.id)}
                        />
                      </td>
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
