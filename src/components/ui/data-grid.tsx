'use client';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import {
  TableBody,
  TableCell,
  TableFilterCell,
  TableFilterRow,
  TableHead,
  TableHeaderCell,
  TableHeaderRow,
  TableRoot,
  TableRow,
  TableSelectionButton,
  TableShell,
  TableViewport,
} from '@/components/ui/data-table';

// ============================================================================
// Types
// ============================================================================

export interface DataGridColumn<T> {
  /** Unique column identifier. */
  id: string;
  /** Column header label. */
  label: string;
  /** Field name for sorting, when sortable. */
  sortField?: string;
  /** Whether column content is right-aligned. */
  rightAligned?: boolean;
  /** Default width in pixels. */
  defaultWidth?: number;
  /** Minimum width in pixels. */
  minWidth?: number;
  /** Whether column is visible by default. */
  defaultVisible?: boolean;
  /** Render cell content. */
  render: (row: T, index: number) => ReactNode;
  /** Render custom header content instead of the standard label/sort control. */
  renderHeader?: () => ReactNode;
  /** Render an inline filter for this column. When any column provides one, a filter row is shown. */
  renderFilter?: () => ReactNode;
  /** Whether this column shows on mobile card view. */
  showOnMobile?: boolean;
  /** Fixed width in pixels; fixed columns cannot be resized. */
  fixedWidth?: number;
}

export interface DataGridProps<T> {
  /** Data to display. */
  data: T[];
  /** Column definitions. */
  columns: DataGridColumn<T>[];
  /** Unique key extractor for rows. */
  getRowKey: (row: T) => string;

  // Sorting
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;

  // Selection
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (selectedKeys: Set<string>) => void;

  // Row interaction
  /** Optional row activation. Shared table behavior handles mouse/keyboard activation and ignores nested controls. */
  onRowActivate?: (row: T) => void;
  /** Optional accessible label for interactive rows. */
  getRowAriaLabel?: (row: T) => string;

  // Pagination
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;

  // Column customization
  columnWidths?: Record<string, number>;
  onColumnWidthChange?: (columnId: string, width: number) => void;
  columnVisibility?: Record<string, boolean>;
  _onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;

  // Appearance
  className?: string;
  variant?: 'default' | 'compact';
  emptyMessage?: string;
  isLoading?: boolean;
  loadingRows?: number;

  // Mobile
  renderMobileCard?: (row: T, index: number) => ReactNode;
  mobileCardsOnly?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * DataGrid is the higher-level, configuration-driven table API.
 *
 * It composes the canonical primitives from data-table.tsx so sorting,
 * resizing, selection, zebra rows, keyboard row activation, filters, spacing,
 * and interaction states stay aligned with hand-composed tables.
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
  onRowActivate,
  getRowAriaLabel,
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
  const visibleColumns = useMemo(() => {
    return columns.filter((column) => {
      const visibility = columnVisibility[column.id];
      if (visibility !== undefined) return visibility;
      return column.defaultVisible !== false;
    });
  }, [columns, columnVisibility]);

  const hasInlineFilters = useMemo(
    () => visibleColumns.some((column) => Boolean(column.renderFilter)),
    [visibleColumns],
  );

  const selectionState = useMemo(() => {
    if (!selectable || data.length === 0) return 'none';
    const selectedCount = data.filter((row) => selectedKeys.has(getRowKey(row))).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === data.length) return 'all';
    return 'some';
  }, [selectable, data, selectedKeys, getRowKey]);

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    const nextSelection = new Set(selectedKeys);

    if (selectionState === 'all') {
      data.forEach((row) => nextSelection.delete(getRowKey(row)));
    } else {
      data.forEach((row) => nextSelection.add(getRowKey(row)));
    }

    onSelectionChange(nextSelection);
  }, [selectionState, selectedKeys, data, getRowKey, onSelectionChange]);

  const handleRowSelect = useCallback((rowKey: string) => {
    if (!onSelectionChange) return;
    const nextSelection = new Set(selectedKeys);
    if (nextSelection.has(rowKey)) {
      nextSelection.delete(rowKey);
    } else {
      nextSelection.add(rowKey);
    }
    onSelectionChange(nextSelection);
  }, [selectedKeys, onSelectionChange]);

  const getColumnWidth = useCallback((column: DataGridColumn<T>) => {
    return column.fixedWidth ?? columnWidths[column.id] ?? column.defaultWidth;
  }, [columnWidths]);

  const resizeColumn = useCallback((
    column: DataGridColumn<T>,
    nextWidth: number,
  ) => {
    if (!onColumnWidthChange || column.fixedWidth) return;
    const minimumWidth = column.minWidth ?? 50;
    onColumnWidthChange(column.id, Math.max(minimumWidth, Math.round(nextWidth)));
  }, [onColumnWidthChange]);

  const handleColumnResize = useCallback((
    event: React.PointerEvent<HTMLSpanElement>,
    column: DataGridColumn<T>,
  ) => {
    if (!onColumnWidthChange || column.fixedWidth) return;

    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const header = handle.closest('th');
    if (!header) return;

    const startWidth = getColumnWidth(column) ?? header.getBoundingClientRect().width;
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let latestWidth = startWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners still handle resizing.
    }

    const onMove = (moveEvent: PointerEvent) => {
      const minimumWidth = column.minWidth ?? 50;
      latestWidth = Math.max(minimumWidth, startWidth + (moveEvent.clientX - startX));
      header.style.width = `${latestWidth}px`;
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cleanup);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Ignore browsers that already released pointer capture.
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    const onUp = () => {
      cleanup();
      resizeColumn(column, latestWidth);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cleanup);
  }, [getColumnWidth, onColumnWidthChange, resizeColumn]);

  const handleColumnResizeKeyboard = useCallback((
    event: React.KeyboardEvent<HTMLSpanElement>,
    column: DataGridColumn<T>,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentWidth = getColumnWidth(column) ?? column.minWidth ?? 120;
    resizeColumn(column, currentWidth + (event.key === 'ArrowRight' ? 10 : -10));
  }, [getColumnWidth, resizeColumn]);

  const tableVisibilityClass = mobileCardsOnly
    ? 'hidden'
    : renderMobileCard
      ? 'hidden md:block'
      : 'block';
  const headerDensityClass = variant === 'compact' ? 'px-2 py-1.5' : undefined;
  const cellDensityClass = variant === 'compact' ? 'px-2 py-1.5' : undefined;

  if (isLoading) {
    return (
      <TableShell className={tableVisibilityClass}>
        <TableViewport>
          <TableRoot className={className}>
            <TableHead>
              <TableHeaderRow hasFilters={false}>
                {selectable ? (
                  <TableHeaderCell className={cn('w-10', headerDensityClass)}>
                    <div className="h-4 w-4 animate-pulse rounded bg-background-tertiary" />
                  </TableHeaderCell>
                ) : null}
                {visibleColumns.map((column) => (
                  <TableHeaderCell key={column.id} className={headerDensityClass}>
                    <div className="h-4 w-20 animate-pulse rounded bg-background-tertiary" />
                  </TableHeaderCell>
                ))}
              </TableHeaderRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: loadingRows }).map((_, index) => (
                <TableRow key={index} index={index}>
                  {selectable ? (
                    <TableCell className={cellDensityClass}>
                      <div className="h-4 w-4 animate-pulse rounded bg-background-tertiary" />
                    </TableCell>
                  ) : null}
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id} className={cellDensityClass}>
                      <div className="h-4 w-24 animate-pulse rounded bg-background-tertiary" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </TableRoot>
        </TableViewport>
      </TableShell>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-text-secondary">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderMobileCard ? (
        <div className={cn('space-y-3', mobileCardsOnly ? 'block' : 'md:hidden')}>
          {data.map((row, index) => renderMobileCard(row, index))}
        </div>
      ) : null}

      <TableShell className={tableVisibilityClass}>
        <TableViewport>
          <TableRoot className={className}>
            <colgroup>
              {selectable ? <col style={{ width: '44px' }} /> : null}
              {visibleColumns.map((column) => {
                const width = getColumnWidth(column);
                return <col key={column.id} style={width ? { width: `${width}px` } : undefined} />;
              })}
            </colgroup>

            <TableHead>
              {hasInlineFilters ? (
                <TableFilterRow>
                  {selectable ? <TableFilterCell className="w-11" /> : null}
                  {visibleColumns.map((column) => (
                    <TableFilterCell key={column.id} className={headerDensityClass}>
                      {column.renderFilter?.() ?? null}
                    </TableFilterCell>
                  ))}
                </TableFilterRow>
              ) : null}

              <TableHeaderRow hasFilters={hasInlineFilters}>
                {selectable ? (
                  <TableHeaderCell className={cn('w-11 text-center', headerDensityClass)}>
                    <TableSelectionButton
                      selected={selectionState === 'all'}
                      indeterminate={selectionState === 'some'}
                      onClick={() => handleSelectAll()}
                      ariaLabel={selectionState === 'all' ? 'Deselect all rows' : 'Select all rows'}
                    />
                  </TableHeaderCell>
                ) : null}

                {visibleColumns.map((column) => {
                  const sortField = column.sortField;
                  const sortable = Boolean(sortField && onSort && !column.renderHeader);
                  const active = Boolean(sortField && sortBy === sortField);
                  const resizable = !column.fixedWidth && Boolean(onColumnWidthChange);

                  return (
                    <TableHeaderCell
                      key={column.id}
                      style={getColumnWidth(column) ? { width: `${getColumnWidth(column)}px` } : undefined}
                      label={column.renderHeader ? undefined : column.label}
                      align={column.rightAligned ? 'right' : 'left'}
                      sorted={active}
                      sortOrder={sortOrder}
                      onSort={sortable ? () => onSort?.(sortField!) : undefined}
                      sortAriaLabel={sortable ? `Sort by ${column.label}` : undefined}
                      resizable={resizable}
                      onResizePointerDown={resizable ? (event) => handleColumnResize(event, column) : undefined}
                      onResizeKeyDown={resizable ? (event) => handleColumnResizeKeyboard(event, column) : undefined}
                      resizeAriaLabel={`Resize ${column.label} column`}
                      className={headerDensityClass}
                    >
                      {column.renderHeader?.()}
                    </TableHeaderCell>
                  );
                })}
              </TableHeaderRow>
            </TableHead>

            <TableBody>
              {data.map((row, index) => {
                const rowKey = getRowKey(row);
                const selected = selectedKeys.has(rowKey);
                return (
                  <TableRow
                    key={rowKey}
                    index={index}
                    selected={selected}
                    interactive={Boolean(onRowActivate)}
                    onActivate={onRowActivate ? () => onRowActivate(row) : undefined}
                    aria-label={onRowActivate ? getRowAriaLabel?.(row) : undefined}
                  >
                    {selectable ? (
                      <TableCell className={cn('w-11 text-center', cellDensityClass)}>
                        <TableSelectionButton
                          selected={selected}
                          onClick={() => handleRowSelect(rowKey)}
                          ariaLabel={selected ? 'Deselect row' : 'Select row'}
                        />
                      </TableCell>
                    ) : null}

                    {visibleColumns.map((column) => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          cellDensityClass,
                          column.rightAligned ? 'text-right' : 'text-left',
                        )}
                      >
                        {column.render(row, index)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </TableRoot>
        </TableViewport>
      </TableShell>

      {onPageChange && totalPages > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// Utility Hooks
// ============================================================================

export function useDataGridSort(defaultField: string, defaultOrder: 'asc' | 'desc' = 'asc') {
  const [sortBy, setSortBy] = useState(defaultField);
  const [sortOrder, setSortOrder] = useState(defaultOrder);

  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy]);

  return { sortBy, sortOrder, handleSort };
}

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

export function useDataGridPagination(defaultLimit: number = 20) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return { page, setPage, limit, setLimit: handleLimitChange, resetPage };
}

export default DataGrid;
