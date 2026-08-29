'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { MobileCard, CardDetailItem, CardDetailsGrid } from '@/components/ui/responsive-table';
import { Pagination } from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { DeadlineOccurrenceDto } from '@/services/deadline';
import type { UpdateDeadlineOccurrenceInput } from '@/lib/validations/deadline';
import { DEADLINE_COLUMN_WIDTH_MAX, DEADLINE_COLUMN_WIDTH_MIN } from '@/lib/validations/services-preferences';
import { DeadlineEventPanel, milestoneLabel } from './deadline-event';

export const DEADLINE_TABLE_COLUMNS = [
  'dueDate',
  'timing',
  'company',
  'family',
  'service',
  'milestone',
  'type',
  'status',
  'actions',
] as const;

export type DeadlineTableColumnId = (typeof DEADLINE_TABLE_COLUMNS)[number];
export type DeadlineSortBy = 'dueDate' | 'company' | 'family' | 'service' | 'type' | 'status';
export type DeadlineColumnWidths = Record<string, number>;

export interface DeadlineTableProps {
  items?: DeadlineOccurrenceDto[];
  isFetching?: boolean;
  page?: number;
  total?: number;
  limit?: number;
  totalPages?: number;
  sortBy?: DeadlineSortBy;
  sortOrder?: 'asc' | 'desc';
  columnWidths?: DeadlineColumnWidths;
  columnOrder?: DeadlineTableColumnId[];
  columnVisibility?: Record<DeadlineTableColumnId, boolean>;
  canEdit?: boolean;
  isPending?: boolean;
  mutationError?: unknown;
  onSort?: (sortBy: DeadlineSortBy) => void;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onColumnWidthChange?: (columnId: DeadlineTableColumnId, width: number) => void;
  onColumnResizeEnd?: (columnId: DeadlineTableColumnId, width: number) => void;
  onUpdate?: (occurrence: DeadlineOccurrenceDto, data: UpdateDeadlineOccurrenceInput) => void;
  onResetOverride?: (occurrence: DeadlineOccurrenceDto, reason: string) => void;
  inlineFilters?: ReactNode;
  selectedIds?: ReadonlySet<string>;
  onToggleSelection?: (occurrence: DeadlineOccurrenceDto) => void;
  onToggleSelectAll?: () => void;
}

export const deadlineColumnLabels: Record<DeadlineTableColumnId, string> = {
  dueDate: 'Operative due date',
  timing: 'Timing',
  company: 'Company',
  family: 'Family',
  service: 'Service',
  milestone: 'Milestone',
  type: 'Type',
  status: 'Status',
  actions: 'Actions',
};

export const defaultDeadlineColumnWidths: Record<DeadlineTableColumnId, number> = {
  dueDate: 150,
  timing: 110,
  company: 220,
  family: 160,
  service: 220,
  milestone: 180,
  type: 110,
  status: 110,
  actions: 90,
};

const sortFields: Partial<Record<DeadlineTableColumnId, DeadlineSortBy>> = {
  dueDate: 'dueDate',
  company: 'company',
  family: 'family',
  service: 'service',
  type: 'type',
  status: 'status',
};

const typeLabels: Record<DeadlineOccurrenceDto['deadlineType'], string> = {
  STATUTORY: 'Statutory',
  CLIENT: 'Client',
  INTERNAL: 'Internal',
};

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  const monthName = month
    ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]
    : undefined;
  return year && day && monthName ? `${day} ${monthName} ${year}` : value;
}

function timingLabel(value: DeadlineOccurrenceDto['timingState'], status: DeadlineOccurrenceDto['status']): string {
  if (status !== 'OPEN') return status.charAt(0) + status.slice(1).toLowerCase();
  if (value === 'DUE') return 'Due today';
  if (value === 'OVERDUE') return 'Overdue';
  return 'Upcoming';
}

function statusClass(value: DeadlineOccurrenceDto['status']): string {
  if (value === 'COMPLETED') return 'badge-success';
  if (value === 'WAIVED') return 'badge-warning';
  if (value === 'CANCELLED') return 'badge-neutral';
  return 'badge-info';
}

function timingClass(value: DeadlineOccurrenceDto['timingState'], status: DeadlineOccurrenceDto['status']): string {
  if (status !== 'OPEN') return 'badge-neutral';
  if (value === 'OVERDUE') return 'badge-error';
  if (value === 'DUE') return 'badge-warning';
  return 'badge-info';
}

function CompanyCell({ occurrence }: { occurrence: DeadlineOccurrenceDto }) {
  return (
    <div className="min-w-0" title={occurrence.company.name}>
      <span className="block truncate font-medium text-text-primary">{occurrence.company.name}</span>
    </div>
  );
}

function FamilyCell({ occurrence }: { occurrence: DeadlineOccurrenceDto }) {
  const familyName = occurrence.family.name || occurrence.service.familyName || '—';
  return <span className="block truncate text-sm text-text-primary" title={familyName}>{familyName}</span>;
}

function ServiceCell({ occurrence }: { occurrence: DeadlineOccurrenceDto }) {
  const serviceName = occurrence.service.name || occurrence.service.variantName || '—';
  return <span className="block truncate text-sm text-text-primary" title={serviceName}>{serviceName}</span>;
}

function actionDialogPosition(trigger: HTMLButtonElement): { left: number; top: number } {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(360, Math.max(280, window.innerWidth - 32));
  const left = Math.min(Math.max(16, rect.right - width), Math.max(16, window.innerWidth - width - 16));
  const estimatedHeight = 480;
  const top = rect.bottom + estimatedHeight <= window.innerHeight - 16
    ? rect.bottom + 8
    : Math.max(16, rect.top - estimatedHeight - 8);
  return { left, top };
}

interface ActionAnchorPoint {
  x: number;
  y: number;
}

function actionDialogPositionAtPoint(point: ActionAnchorPoint): { left: number; top: number } {
  const width = Math.min(360, Math.max(280, window.innerWidth - 32));
  const left = Math.min(Math.max(16, point.x), Math.max(16, window.innerWidth - width - 16));
  const estimatedHeight = 480;
  const top = point.y + 8 + estimatedHeight <= window.innerHeight - 16
    ? point.y + 8
    : Math.max(16, point.y - estimatedHeight - 8);
  return { left, top };
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), a[href]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';

interface DeadlineActionsProps {
  occurrence: DeadlineOccurrenceDto;
  canEdit: boolean;
  isPending: boolean;
  mutationError?: unknown;
  onUpdate?: DeadlineTableProps['onUpdate'];
  onResetOverride?: DeadlineTableProps['onResetOverride'];
  open?: boolean;
  openAt?: ActionAnchorPoint | null;
  onOpen?: () => void;
  onClose?: () => void;
}

function DeadlineActions({ occurrence, canEdit, isPending, mutationError, onUpdate, onResetOverride, open: controlledOpen, openAt, onOpen, onClose }: DeadlineActionsProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 16, top: 16 });

  const setOpen = useCallback((nextOpen: boolean) => {
    if (!isControlled) setUncontrolledOpen(nextOpen);
    if (nextOpen) onOpen?.();
    else onClose?.();
  }, [isControlled, onClose, onOpen]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    setPosition(openAt ? actionDialogPositionAtPoint(openAt) : actionDialogPosition(triggerRef.current));
    dialogRef.current?.querySelector<HTMLElement>('button, input, textarea')?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, open, openAt]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="relative flex items-center justify-end">
      <button ref={triggerRef} type="button" aria-label={`Actions for ${occurrence.company.displayLabel} ${milestoneLabel(occurrence)}`} aria-expanded={open} aria-haspopup="dialog" onClick={(event) => { event.stopPropagation(); if (open) close(); else setOpen(true); }} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-tertiary hover:bg-background-tertiary hover:text-text-primary sm:min-h-8 sm:min-w-8">
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div
            data-testid="deadline-actions-backdrop"
            aria-hidden="true"
            className="fixed inset-0 z-20 bg-transparent"
            onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
          />
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Deadline actions" className="fixed z-30 w-[min(22.5rem,calc(100vw-2rem))] rounded-xl border border-border-primary bg-background-elevated p-4 shadow-elevation-2" style={{ left: position.left, top: position.top }} onKeyDown={handleDialogKeyDown} onClick={(event) => event.stopPropagation()}>
            <DeadlineEventPanel occurrence={occurrence} canEdit={canEdit} isPending={isPending} mutationError={mutationError} onUpdate={onUpdate} onResetOverride={onResetOverride} onClose={close} />
            {!canEdit ? <p className="px-2 py-2 text-xs text-text-muted">Read-only access</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

interface DesktopCellProps {
  occurrence: DeadlineOccurrenceDto;
  column: DeadlineTableColumnId;
  canEdit: boolean;
  isPending: boolean;
  mutationError?: unknown;
  onUpdate?: DeadlineTableProps['onUpdate'];
  onResetOverride?: DeadlineTableProps['onResetOverride'];
  actionOpen?: boolean;
  actionAnchor?: ActionAnchorPoint | null;
  onActionOpen?: () => void;
  onActionClose?: () => void;
}

function DesktopCell({ occurrence, column, canEdit, isPending, mutationError, onUpdate, onResetOverride, actionOpen, actionAnchor, onActionOpen, onActionClose }: DesktopCellProps) {
  switch (column) {
    case 'dueDate': return <td className="px-4 py-3 align-middle text-sm text-text-primary"><span className="whitespace-nowrap">{dateLabel(occurrence.operativeDueDate)}</span>{occurrence.dateOverridden ? <span className="ml-1 inline-flex rounded-full bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">Override</span> : null}</td>;
    case 'timing': return <td className="px-4 py-3 align-middle"><span className={cn('badge', timingClass(occurrence.timingState, occurrence.status))}>{timingLabel(occurrence.timingState, occurrence.status)}</span></td>;
    case 'company': return <td className="max-w-0 px-4 py-3 align-middle"><CompanyCell occurrence={occurrence} /></td>;
    case 'family': return <td className="max-w-0 px-4 py-3 align-middle"><FamilyCell occurrence={occurrence} /></td>;
    case 'service': return <td className="max-w-0 px-4 py-3 align-middle"><ServiceCell occurrence={occurrence} /></td>;
    case 'milestone': return <td className="max-w-0 px-4 py-3 align-middle text-sm text-text-primary"><span className="block truncate" title={milestoneLabel(occurrence)}>{milestoneLabel(occurrence)}</span></td>;
    case 'type': return <td className="px-4 py-3 align-middle"><span className="badge badge-info">{typeLabels[occurrence.deadlineType]}</span></td>;
    case 'status': return <td className="px-4 py-3 align-middle"><span className={cn('badge', statusClass(occurrence.status))}>{occurrence.status.charAt(0) + occurrence.status.slice(1).toLowerCase()}</span></td>;
    case 'actions': return <td className="px-4 py-3 align-middle"><DeadlineActions occurrence={occurrence} canEdit={canEdit} isPending={isPending} mutationError={mutationError} onUpdate={onUpdate} onResetOverride={onResetOverride} open={actionOpen} openAt={actionAnchor} onOpen={onActionOpen} onClose={onActionClose} /></td>;
  }
}

function MobileDeadlineCard({ occurrence, canEdit, isPending, mutationError, onUpdate, onResetOverride, isSelected, onToggleSelection }: { occurrence: DeadlineOccurrenceDto; canEdit: boolean; isPending: boolean; mutationError?: unknown; onUpdate?: DeadlineTableProps['onUpdate']; onResetOverride?: DeadlineTableProps['onResetOverride']; isSelected: boolean; onToggleSelection?: (occurrence: DeadlineOccurrenceDto) => void }) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <MobileCard
      isSelected={isSelected}
      selectable={Boolean(onToggleSelection)}
      onToggle={() => onToggleSelection?.(occurrence)}
      selectionLabel={`Select deadline ${occurrence.company.name} ${milestoneLabel(occurrence)}`}
      title={<CompanyCell occurrence={occurrence} />}
      subtitle={<span title={occurrence.service.name}>{occurrence.service.name || occurrence.service.variantName || '—'} · {milestoneLabel(occurrence)}</span>}
      badge={<span className={cn('badge', timingClass(occurrence.timingState, occurrence.status))}>{timingLabel(occurrence.timingState, occurrence.status)}</span>}
      onCardClick={() => setActionsOpen(true)}
      actions={<DeadlineActions occurrence={occurrence} canEdit={canEdit} isPending={isPending} mutationError={mutationError} onUpdate={onUpdate} onResetOverride={onResetOverride} open={actionsOpen} onOpen={() => setActionsOpen(true)} onClose={() => setActionsOpen(false)} />}
      details={(
        <CardDetailsGrid>
          <CardDetailItem label="Due date" value={dateLabel(occurrence.operativeDueDate)} />
          <CardDetailItem label="Family" value={occurrence.family.name || occurrence.service.familyName || '—'} />
          <CardDetailItem label="Service" value={occurrence.service.name || occurrence.service.variantName || '—'} />
          <CardDetailItem label="Type" value={typeLabels[occurrence.deadlineType]} />
          <CardDetailItem label="Status" value={occurrence.status.charAt(0) + occurrence.status.slice(1).toLowerCase()} />
        </CardDetailsGrid>
      )}
    />
  );
}

interface DesktopDeadlineRowProps {
  occurrence: DeadlineOccurrenceDto;
  index: number;
  visibleColumns: DeadlineTableColumnId[];
  canEdit: boolean;
  isPending: boolean;
  mutationError?: unknown;
  onUpdate?: DeadlineTableProps['onUpdate'];
  onResetOverride?: DeadlineTableProps['onResetOverride'];
  isSelected: boolean;
  onToggleSelection?: (occurrence: DeadlineOccurrenceDto) => void;
}

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(element?.closest('button, input, textarea, select, a, label, [role="dialog"], [role="separator"]'));
}

function DesktopDeadlineRow({ occurrence, index, visibleColumns, canEdit, isPending, mutationError, onUpdate, onResetOverride, isSelected, onToggleSelection }: DesktopDeadlineRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionAnchor, setActionAnchor] = useState<ActionAnchorPoint | null>(null);
  const openActions = (point?: ActionAnchorPoint) => {
    setActionAnchor(point ?? null);
    setActionsOpen(true);
  };
  const closeActions = () => {
    setActionAnchor(null);
    setActionsOpen(false);
  };
  const handleClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
    if (isInteractiveRowTarget(event.target)) return;
    openActions({ x: event.clientX, y: event.clientY });
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (isInteractiveRowTarget(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openActions();
  };

  return (
    <tr
      tabIndex={0}
      aria-label={`Open actions for ${occurrence.company.name} ${milestoneLabel(occurrence)}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn('cursor-pointer border-b border-border-primary transition-colors hover:bg-background-tertiary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oak-primary/50', index % 2 === 0 && 'bg-oak-row-alt')}
    >
      {onToggleSelection ? <td className="w-12 px-2 py-3 text-center align-middle" onClick={(event) => event.stopPropagation()}><div className="flex justify-center"><Checkbox checked={isSelected} onChange={() => onToggleSelection(occurrence)} aria-label={`Select deadline ${occurrence.company.name} ${milestoneLabel(occurrence)}`} size="sm" /></div></td> : null}
      {visibleColumns.map((column) => <DesktopCell key={column} occurrence={occurrence} column={column} canEdit={canEdit} isPending={isPending} mutationError={mutationError} onUpdate={onUpdate} onResetOverride={onResetOverride} actionOpen={actionsOpen} actionAnchor={actionAnchor} onActionOpen={() => openActions()} onActionClose={closeActions} />)}
    </tr>
  );
}

function SortableHeader({ columnId, sortBy, sortOrder, onSort, onResize, onResizeKeyboard }: { columnId: DeadlineTableColumnId; sortBy: DeadlineSortBy; sortOrder: 'asc' | 'desc'; onSort?: (sortBy: DeadlineSortBy) => void; onResize: (columnId: DeadlineTableColumnId, event: React.PointerEvent<HTMLSpanElement>) => void; onResizeKeyboard: (columnId: DeadlineTableColumnId, delta: number) => void }) {
  const field = sortFields[columnId];
  const active = field === sortBy;
  const label = deadlineColumnLabels[columnId];
  return (
    <th scope="col" aria-label={label} aria-sort={field ? (active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none') : undefined} className="relative px-4 py-2.5 text-left text-xs font-medium text-text-secondary">
      {field && onSort ? <button type="button" aria-label={active ? `Sort by ${label}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`} onClick={() => onSort(field)} className="inline-flex min-h-11 items-center gap-1 text-left hover:text-text-primary sm:min-h-8"><span>{label}</span>{active ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />) : <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}</button> : <span>{label}</span>}
      {columnId !== 'actions' ? <span role="separator" aria-label={`Resize ${label} column`} aria-orientation="vertical" tabIndex={0} onPointerDown={(event) => onResize(columnId, event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onResizeKeyboard(columnId, event.key === 'ArrowRight' ? 10 : -10); } }} className="absolute inset-y-0 -right-2 w-4 cursor-col-resize touch-none select-none" /> : null}
    </th>
  );
}

export function DeadlineTable({
  items = [],
  isFetching = false,
  page = 1,
  total = items.length,
  limit = 20,
  totalPages = total === 0 ? 0 : Math.ceil(total / limit),
  sortBy = 'dueDate',
  sortOrder = 'asc',
  columnWidths = {},
  columnOrder = [...DEADLINE_TABLE_COLUMNS],
  columnVisibility = Object.fromEntries(DEADLINE_TABLE_COLUMNS.map((column) => [column, true])) as Record<DeadlineTableColumnId, boolean>,
  canEdit = false,
  isPending = false,
  mutationError,
  onSort,
  onPageChange,
  onLimitChange,
  onColumnWidthChange,
  onColumnResizeEnd,
  onUpdate,
  onResetOverride,
  inlineFilters,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
}: DeadlineTableProps) {
  const visibleColumns = useMemo(() => columnOrder.filter((column) => columnVisibility[column]), [columnOrder, columnVisibility]);
  const selectionEnabled = Boolean(selectedIds && onToggleSelection && onToggleSelectAll);
  const allVisibleSelected = selectionEnabled && items.length > 0 && items.every((occurrence) => selectedIds?.has(occurrence.id) ?? false);
  const someVisibleSelected = selectionEnabled && items.some((occurrence) => selectedIds?.has(occurrence.id) ?? false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    resizeCleanupRef.current?.();
  }, []);

  const clampColumnWidth = (width: number) => Math.min(DEADLINE_COLUMN_WIDTH_MAX, Math.max(DEADLINE_COLUMN_WIDTH_MIN, Math.round(width)));
  const startResize = (columnId: DeadlineTableColumnId, event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    resizeCleanupRef.current?.();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const initial = clampColumnWidth(columnWidths[columnId] ?? defaultDeadlineColumnWidths[columnId]);
    let latestWidth = initial;
    const pointerMove = (moveEvent: PointerEvent) => {
      latestWidth = clampColumnWidth(initial + moveEvent.clientX - startX);
      onColumnWidthChange?.(columnId, latestWidth);
    };
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
    const pointerUp = () => {
      cleanup();
      onColumnResizeEnd?.(columnId, latestWidth);
    };
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
  };
  const resizeColumnByKeyboard = (columnId: DeadlineTableColumnId, delta: number) => {
    const initial = clampColumnWidth(columnWidths[columnId] ?? defaultDeadlineColumnWidths[columnId]);
    const next = clampColumnWidth(initial + delta);
    onColumnWidthChange?.(columnId, next);
    onColumnResizeEnd?.(columnId, next);
  };

  return (
    <>
      <div className="space-y-3 md:hidden" aria-label="Deadline cards">
        {items.length === 0 ? <div className="rounded-xl border border-border-primary bg-background-secondary p-6 text-center text-sm text-text-secondary">No deadlines found</div> : items.map((occurrence) => <MobileDeadlineCard key={occurrence.id} occurrence={occurrence} canEdit={canEdit} isPending={isPending} mutationError={mutationError} onUpdate={onUpdate} onResetOverride={onResetOverride} isSelected={selectedIds?.has(occurrence.id) ?? false} onToggleSelection={selectionEnabled ? onToggleSelection : undefined} />)}
      </div>
      <div className={cn('table-container hidden overflow-hidden md:block', isFetching && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse" aria-label="Deadline occurrences table">
          <colgroup>{selectionEnabled ? <col style={{ width: '48px' }} /> : null}{visibleColumns.map((column) => <col key={column} style={column === 'actions' ? undefined : { width: `${columnWidths[column] ?? defaultDeadlineColumnWidths[column]}px` }} />)}</colgroup>
          <thead>
            {inlineFilters ? <tr className="border-b border-border-primary"><th colSpan={visibleColumns.length + (selectionEnabled ? 1 : 0)} className="p-0 text-left">{inlineFilters}</th></tr> : null}
            <tr className="border-b border-border-primary bg-background-tertiary/70">{selectionEnabled ? <th scope="col" className="w-12 px-2 py-2.5 text-center"><div className="flex justify-center"><Checkbox checked={allVisibleSelected} indeterminate={someVisibleSelected && !allVisibleSelected} onChange={onToggleSelectAll} aria-label={allVisibleSelected ? 'Deselect all visible deadlines' : 'Select all visible deadlines'} size="sm" /></div></th> : null}{visibleColumns.map((column) => <SortableHeader key={column} columnId={column} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} onResize={startResize} onResizeKeyboard={resizeColumnByKeyboard} />)}</tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectionEnabled ? 1 : 0)} className="px-4 py-12 text-center">
                  <p className="text-sm text-text-secondary">No deadlines found</p>
                </td>
              </tr>
            ) : items.map((occurrence, index) => <DesktopDeadlineRow key={occurrence.id} occurrence={occurrence} index={index} visibleColumns={visibleColumns} canEdit={canEdit} isPending={isPending} mutationError={mutationError} onUpdate={onUpdate} onResetOverride={onResetOverride} isSelected={selectedIds?.has(occurrence.id) ?? false} onToggleSelection={selectionEnabled ? onToggleSelection : undefined} />)}
          </tbody>
          </table>
        </div>
      </div>
      {onPageChange ? <Pagination page={page} totalPages={totalPages} total={total} limit={limit} pageSizeOptions={[10, 20, 50, 100]} largeTouchTargets onPageChange={onPageChange} onLimitChange={onLimitChange} /> : null}
    </>
  );
}
