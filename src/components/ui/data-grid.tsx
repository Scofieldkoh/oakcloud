'use client';

import { useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Square, CheckSquare, MinusSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';

// ============================================================================
// Types
// ============================================================================

export interface DataGridColumn<T> {
  /** Unique column identifier */
  id: string;
  /** Column header label */
  label: string;
  /** Field name for sorting (if sortable) */
  sortField?: string;
  /** Whether column is right-aligned (for numbers) */
  rightAligned?: boolean;
  /** Default width in pixels */
  defaultWidth?: number;
  /** Minimum width in pixels */
  minWidth?: number;
  /** Whether column is visible by default */
  defaultVisible?: boolean;
  /** Render cell content */
  render: (row: T, index: number) => ReactNode;
  /** Render header cell (optional, defaults to label) */
  renderHeader?: () => ReactNode;
  /** Whether this column shows on mobile card view */
  showOnMobile?: boolean;
  /** Fixed width (prevents resizing) */
  fixedWidth?: number;
}

export interface DataGridProps<T> {
  /** Data to display */
  data: T[];
  /** Column definitions */
  columns: DataGridColumn<T>[];
  /** Unique key extractor for rows */
  getRowKey: (row: T) => string;

  // Sorting
  /** Current sort field */
  sortBy?: string;
  /** Current sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Sort change handler */
  onSort?: (field: string) => void;

  // Selection
  /** Enable row selection */
  selectable?: boolean;
  /** Selected row keys */
  selectedKeys?: Set<string>;
  /** Selection change handler */
  onSelectionChange?: (selectedKeys: Set<string>) => void;

  // Pagination
  /** Current page (1-indexed) */
  page?: number;
  /** Total pages */
  totalPages?: number;
  /** Total items */
  total?: number;
  /** Items per page */
  limit?: number;
  /** Page change handler */
  onPageChange?: (page: number) => void;
  /** Limit change handler */
  onLimitChange?: (limit: number) => void;

  // Column customization
  /** Column widths (keyed by column id) */
  columnWidths?: Record<string, number>;
  /** Column width change handler */
  onColumnWidthChange?: (columnId: string, width: number) => void;
  /** Column visibility (keyed by column id) */
  columnVisibility?: Record<string, boolean>;
  /** Column visibility change handler (for future use) */
  _onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;

  // Appearance
  /** Additional class name for table */
  className?: string;
  /** Table variant */
  variant?: 'default' | 'compact';
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Loading skeleton rows */
  loadingRows?: number;

  // Mobile
  /** Render mobile card for a row */
  renderMobileCard?: (row: T, index: number) => ReactNode;
  /** Hide table on mobile (use cards only) */
  mobileCardsOnly?: boolean;
}

// ============================================================================
// Sub-components
// ============================================================================

interface SortIconProps {
  active: boolean;
  direction?: 'asc' | 'desc';
}

function SortIcon({ active, direction }: SortIconProps) {
  if (!active) {
    return <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />;
  }
  return direction === 'asc'
    ? <ArrowUp className="w-3.5 h-3.5" />
    : <ArrowDown className="w-3.5 h-3.5" />;
}

interface SelectionCheckboxProps {
  state: 'none' | 'some' | 'all';
  onClick: () => void;
  label: string;
}

function SelectionCheckbox({ state, onClick, label }: SelectionCheckboxProps) {
  const Icon = state === 'all' ? CheckSquare : state === 'some' ? MinusSquare : Square;
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 hover:bg-background-tertiary rounded transition-colors"
      aria-label={label}
    >
      <Icon className={cn(
        'w-4 h-4',
        state !== 'none' ? 'text-oak-primary' : 'text-text-muted'
      )} />
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * DataGrid - Feature-rich data table component
 *
 * Features:
 * - Sortable columns with direction indicators
 * - Resizable columns with drag handles
 * - Row selection with checkboxes
 * - Pagination integration
 * - Column visibility control
 * - Mobile responsive (card view)
 * - Loading states with skeletons
 *
 * @example
 * ```tsx
 * const columns: DataGridColumn<User>[] = [
 *   { id: 'name', label: 'Name', sortField: 'name', render: (row) => row.name },
 *   { id: 'email', label: 'Email', render: (row) => row.email },
 *   { id: 'balance', label: 'Balance', rightAligned: true, render: (row) => formatCurrency(row.balance) },
 * ];
 *
 * <DataGrid
 *   data={users}
 *   columns={columns}
 *   getRowKey={(user) => user.id}
 *   sortBy={sortBy}
 *   sortOrder={sortOrder}
 *   onSort={handleSort}
 *   selectable
 *   selectedKeys={selectedKeys}
 *   onSelectionChange={setSelectedKeys}
 *   page={page}
 *   totalPages={totalPages}
 *   total={total}
 *   limit={limit}
 *   onPageChange={setPage}
 *   onLimitChange={setLimit}
 * />
 * ```
 */
export function DataGrid<T>({
  data,
  columns,
  getRowKey,
  sortBy,
  sortOrder = 'asc',
  onSort,
  selectable = false,
  selectedKeys = new Set(),
  onSelectionChange,
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 20,
  onPageChange,
  onLimitChange,
  columnWidths = {},
  onColumnWidthChange,
  columnVisibility = {},
  _onColumnVisibilityChange,
  className,
  variant = 'default',
  emptyMessage = 'No data found',
  isLoading = false,
  loadingRows = 5,
  renderMobileCard,
  mobileCardsOnly = false,
}: DataGridProps<T>) {
  const isResizingRef = useRef(false);
  const tableRef = useRef<HTMLTableElement>(null);

  // Visible columns
  const visibleColumns = useMemo(() => {
    return columns.filter((col) => {
      const visibility = columnVisibility[col.id];
      if (visibility !== undefined) return visibility;
      return col.defaultVisible !== false;
    });
  }, [columns, columnVisibility]);

  // Selection state
  const selectionState = useMemo(() => {
    if (!selectable || data.length === 0) return 'none';
    const selectedCount = data.filter((row) => selectedKeys.has(getRowKey(row))).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === data.length) return 'all';
    return 'some';
  }, [selectable, data, selectedKeys, getRowKey]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (selectionState === 'all') {
      // Deselect all on current page
      const newSelection = new Set(selectedKeys);
      data.forEach((row) => newSelection.delete(getRowKey(row)));
      onSelectionChange(newSelection);
    } else {
      // Select all on current page
      const newSelection = new Set(selectedKeys);
      data.forEach((row) => newSelection.add(getRowKey(row)));
      onSelectionChange(newSelection);
    }
  }, [selectionState, selectedKeys, data, getRowKey, onSelectionChange]);

  // Handle row selection
  const handleRowSelect = useCallback((rowKey: string) => {
    if (!onSelectionChange) return;
    const newSelection = new Set(selectedKeys);
    if (newSelection.has(rowKey)) {
      newSelection.delete(rowKey);
    } else {
      newSelection.add(rowKey);
    }
    onSelectionChange(newSelection);
  }, [selectedKeys, onSelectionChange]);

  // Handle column resize
  const handleColumnResize = useCallback((e: React.PointerEvent, columnId: string) => {
    if (!onColumnWidthChange) return;

    const column = columns.find((c) => c.id === columnId);
    if (!column || column.fixedWidth) return;

    const th = (e.target as HTMLElement).closest('th');
    if (!th) return;

    const startWidth = columnWidths[columnId] ?? th.getBoundingClientRect().width;
    const startX = e.clientX;
    const minWidth = column.minWidth ?? 50;

    isResizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    let latestWidth = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = Math.max(minWidth, startWidth + delta);
      th.style.width = `${latestWidth}px`;
    };

    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      isResizingRef.current = false;
      onColumnWidthChange(columnId, latestWidth);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [columns, columnWidths, onColumnWidthChange]);

  // Padding classes based on variant
  const cellPadding = variant === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const headerPadding = variant === 'compact' ? 'px-3 py-2' : 'px-4 py-2.5';

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className={cn('w-full', className)}>
              <thead className="bg-background-secondary border-b border-border-primary">
                <tr>
                  {selectable && (
                    <th className={cn('w-10', headerPadding)}>
                      <div className="w-4 h-4 bg-background-tertiary rounded animate-pulse" />
                    </th>
                  )}
                  {visibleColumns.map((col) => (
                    <th key={col.id} className={headerPadding}>
                      <div className="h-4 bg-background-tertiary rounded animate-pulse w-20" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: loadingRows }).map((_, i) => (
                  <tr key={i} className="border-b border-border-primary last:border-0">
                    {selectable && (
                      <td className={cellPadding}>
                        <div className="w-4 h-4 bg-background-tertiary rounded animate-pulse" />
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td key={col.id} className={cellPadding}>
                        <div className="h-4 bg-background-tertiary rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mobile Cards */}
      {renderMobileCard && (
        <div className={cn('space-y-3', mobileCardsOnly ? 'block' : 'md:hidden')}>
          {data.map((row, index) => renderMobileCard(row, index))}
        </div>
      )}

      {/* Desktop Table */}
      <div className={cn('card overflow-hidden', mobileCardsOnly ? 'hidden' : renderMobileCard ? 'hidden md:block' : 'block')}>
        <div className="overflow-x-auto">
          <table ref={tableRef} className={cn('w-full', className)}>
            <thead className="bg-background-secondary border-b border-border-primary">
              <tr>
                {/* Selection header */}
                {selectable && (
                  <th className={cn('w-10', headerPadding)}>
                    <SelectionCheckbox
                      state={selectionState}
                      onClick={handleSelectAll}
                      label={selectionState === 'all' ? 'Deselect all' : 'Select all'}
                    />
                  </th>
                )}

                {/* Column headers */}
                {visibleColumns.map((col) => {
                  const isSortable = !!col.sortField && !!onSort;
                  const isActive = sortBy === col.sortField;
                  const width = col.fixedWidth ?? columnWidths[col.id] ?? col.defaultWidth;
                  const canResize = !col.fixedWidth && !!onColumnWidthChange;

                  return (
                    <th
                      key={col.id}
                      style={width ? { width: `${width}px` } : undefined}
                      className={cn(
                        'relative text-xs font-medium text-text-secondary whitespace-nowrap',
                        headerPadding,
                        col.rightAligned ? 'text-right' : 'text-left'
                      )}
                    >
                      {col.renderHeader ? (
                        col.renderHeader()
                      ) : isSortable ? (
                        <button
                          type="button"
                          onClick={() => onSort(col.sortField!)}
                          className={cn(
                            'inline-flex items-center gap-1 select-none hover:text-text-primary transition-colors',
                            isActive && 'text-text-primary'
                          )}
                        >
                          <span>{col.label}</span>
                          <SortIcon active={isActive} direction={isActive ? sortOrder : undefined} />
                        </button>
                      ) : (
                        <span>{col.label}</span>
                      )}

                      {/* Resize handle */}
                      {canResize && (
                        <div
                          onPointerDown={(e) => handleColumnResize(e, col.id)}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {data.map((row, index) => {
                const rowKey = getRowKey(row);
                const isSelected = selectedKeys.has(rowKey);

                return (
                  <tr
                    key={rowKey}
                    className={cn(
                      'border-b border-border-primary last:border-0 transition-colors',
                      isSelected ? 'bg-oak-row-selected' : 'hover:bg-background-tertiary'
                    )}
                  >
                    {/* Selection cell */}
                    {selectable && (
                      <td className={cellPadding}>
                        <SelectionCheckbox
                          state={isSelected ? 'all' : 'none'}
                          onClick={() => handleRowSelect(rowKey)}
                          label={isSelected ? 'Deselect row' : 'Select row'}
                        />
                      </td>
                    )}

                    {/* Data cells */}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        className={cn(
                          'text-sm',
                          cellPadding,
                          col.rightAligned ? 'text-right' : 'text-left'
                        )}
                      >
                        {col.render(row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {onPageChange && totalPages > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for managing DataGrid sorting state
 */
export function useDataGridSort(defaultField: string, defaultOrder: 'asc' | 'desc' = 'asc') {
  const [sortBy, setSortBy] = useState(defaultField);
  const [sortOrder, setSortOrder] = useState(defaultOrder);

  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy]);

  return { sortBy, sortOrder, handleSort };
}

/**
 * Hook for managing DataGrid selection state
 */
export function useDataGridSelection() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const selectAll = useCallback((keys: string[]) => {
    setSelectedKeys(new Set(keys));
  }, []);

  return { selectedKeys, setSelectedKeys, clearSelection, selectAll };
}

/**
 * Hook for managing DataGrid pagination state
 */
export function useDataGridPagination(defaultLimit: number = 20) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1); // Reset to first page when changing limit
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return { page, setPage, limit, setLimit: handleLimitChange, resetPage };
}

export default DataGrid;
