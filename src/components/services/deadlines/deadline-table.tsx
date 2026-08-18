'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { MobileCard, CardDetailItem, CardDetailsGrid } from '@/components/ui/responsive-table';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import type { DeadlineOccurrenceDto } from '@/services/deadline';
import { DeadlineEvent, milestoneLabel } from './deadline-event';

export const DEADLINE_TABLE_COLUMNS = [
  'dueDate',
  'timing',
  'company',
  'familyService',
  'milestone',
  'type',
  'status',
  'cycleOrigin',
  'actions',
] as const;

export type DeadlineTableColumnId = (typeof DEADLINE_TABLE_COLUMNS)[number];
export type DeadlineSortBy = 'dueDate' | 'company' | 'family' | 'service' | 'type' | 'status';
export type DeadlineColumnWidths = Record<string, number | undefined>;

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
  onSort?: (sortBy: DeadlineSortBy) => void;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onColumnWidthChange?: (columnId: DeadlineTableColumnId, width: number) => void;
  onColumnResizeEnd?: (columnId: DeadlineTableColumnId, width: number) => void;
  onComplete?: (occurrence: DeadlineOccurrenceDto) => void;
  onWaive?: (occurrence: DeadlineOccurrenceDto) => void;
}

export const deadlineColumnLabels: Record<DeadlineTableColumnId, string> = {
  dueDate: 'Operative due date',
  timing: 'Timing',
  company: 'Company',
  familyService: 'Family / service',
  milestone: 'Milestone',
  type: 'Type',
  status: 'Status',
  cycleOrigin: 'Cycle / origin',
  actions: 'Actions',
};

export const defaultDeadlineColumnWidths: Record<DeadlineTableColumnId, number> = {
  dueDate: 150,
  timing: 110,
  company: 220,
  familyService: 220,
  milestone: 180,
  type: 110,
  status: 110,
  cycleOrigin: 160,
  actions: 90,
};

const sortFields: Partial<Record<DeadlineTableColumnId, DeadlineSortBy>> = {
  dueDate: 'dueDate',
  company: 'company',
  familyService: 'family',
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
      <span className="block truncate font-medium text-text-primary">{occurrence.company.displayLabel}</span>
      <span className="block truncate text-xs text-text-secondary">{occurrence.company.name}</span>
    </div>
  );
}

function FamilyServiceCell({ occurrence }: { occurrence: DeadlineOccurrenceDto }) {
  const color = occurrence.family.displayColor ?? '#58736a';
  return (
    <div className="min-w-0">
      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-1 text-xs" style={{ borderColor: color }}>
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-text-primary">{occurrence.family.name || occurrence.service.familyName || '—'}</span>
      </span>
      <span className="mt-1 block truncate text-xs text-text-secondary" title={occurrence.service.name}>{occurrence.service.name || occurrence.service.variantName || '—'}</span>
    </div>
  );
}

function SortableHeader({
  columnId,
  sortBy,
  sortOrder,
  onSort,
  onResize,
}: {
  columnId: DeadlineTableColumnId;
  sortBy: DeadlineSortBy;
  sortOrder: 'asc' | 'desc';
  onSort?: (sortBy: DeadlineSortBy) => void;
  onResize: (columnId: DeadlineTableColumnId, event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const field = sortFields[columnId];
  const active = field === sortBy;
  const label = deadlineColumnLabels[columnId];
  return (
    <th scope="col" className="relative px-4 py-3 text-left text-xs font-medium text-text-secondary">
      {field && onSort ? (
        <button
          type="button"
          aria-label={active ? `Sort by ${label}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`}
          onClick={() => onSort(field)}
          className="inline-flex min-h-11 items-center gap-1 text-left hover:text-text-primary"
        >
          <span>{label}</span>
          {active ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />) : <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
        </button>
      ) : <span>{label}</span>}
      {columnId !== 'actions' ? (
        <button
          type="button"
          aria-label={`Resize ${label} column`}
          onPointerDown={(event) => onResize(columnId, event)}
          className="absolute inset-y-0 -right-2 w-4 cursor-col-resize touch-none"
        />
      ) : null}
    </th>
  );
}

function DeadlineActions({ occurrence, canEdit, onComplete, onWaive }: { occurrence: DeadlineOccurrenceDto; canEdit: boolean; onComplete?: (occurrence: DeadlineOccurrenceDto) => void; onWaive?: (occurrence: DeadlineOccurrenceDto) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-end">
      <button
        type="button"
        aria-label={`Actions for ${occurrence.company.displayLabel} ${milestoneLabel(occurrence)}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-tertiary hover:bg-background-tertiary hover:text-text-primary"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-border-primary bg-background-elevated p-1 shadow-elevation-2">
          <DeadlineEvent occurrence={occurrence} onComplete={onComplete} onWaive={onWaive} />
          {!canEdit ? <span className="block px-3 py-2 text-xs text-text-muted">Read-only access</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function DesktopCell({ occurrence, column, canEdit, onComplete, onWaive }: { occurrence: DeadlineOccurrenceDto; column: DeadlineTableColumnId; canEdit: boolean; onComplete?: (occurrence: DeadlineOccurrenceDto) => void; onWaive?: (occurrence: DeadlineOccurrenceDto) => void }) {
  switch (column) {
    case 'dueDate': return <td className="px-4 py-3 align-top text-sm text-text-primary"><span className="whitespace-nowrap">{dateLabel(occurrence.operativeDueDate)}</span>{occurrence.dateOverridden ? <span className="ml-1 inline-flex rounded-full bg-background-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">Override</span> : null}</td>;
    case 'timing': return <td className="px-4 py-3 align-top"><span className={cn('badge', timingClass(occurrence.timingState, occurrence.status))}>{timingLabel(occurrence.timingState, occurrence.status)}</span></td>;
    case 'company': return <td className="max-w-0 px-4 py-3 align-top"><CompanyCell occurrence={occurrence} /></td>;
    case 'familyService': return <td className="max-w-0 px-4 py-3 align-top"><FamilyServiceCell occurrence={occurrence} /></td>;
    case 'milestone': return <td className="max-w-0 px-4 py-3 align-top text-sm text-text-primary"><span className="block truncate" title={milestoneLabel(occurrence)}>{milestoneLabel(occurrence)}</span></td>;
    case 'type': return <td className="px-4 py-3 align-top"><span className="badge badge-info">{typeLabels[occurrence.deadlineType]}</span></td>;
    case 'status': return <td className="px-4 py-3 align-top"><span className={cn('badge', statusClass(occurrence.status))}>{occurrence.status.charAt(0) + occurrence.status.slice(1).toLowerCase()}</span></td>;
    case 'cycleOrigin': return <td className="px-4 py-3 align-top text-xs text-text-secondary"><span className="block">{occurrence.cycle?.periodKey || '—'}</span><span className="block text-text-muted">{occurrence.origin === 'MANUAL_TRIGGER' ? 'Manual trigger' : 'Rule'}</span></td>;
    case 'actions': return <td className="px-4 py-3 align-top"><DeadlineActions occurrence={occurrence} canEdit={canEdit} onComplete={onComplete} onWaive={onWaive} /></td>;
  }
}

function MobileDeadlineCard({ occurrence, canEdit, onComplete, onWaive }: { occurrence: DeadlineOccurrenceDto; canEdit: boolean; onComplete?: (occurrence: DeadlineOccurrenceDto) => void; onWaive?: (occurrence: DeadlineOccurrenceDto) => void }) {
  return (
    <MobileCard
      title={<CompanyCell occurrence={occurrence} />}
      subtitle={<span title={occurrence.service.name}>{occurrence.service.name || occurrence.service.variantName || '—'} · {milestoneLabel(occurrence)}</span>}
      badge={<span className={cn('badge', timingClass(occurrence.timingState, occurrence.status))}>{timingLabel(occurrence.timingState, occurrence.status)}</span>}
      actions={<DeadlineActions occurrence={occurrence} canEdit={canEdit} onComplete={onComplete} onWaive={onWaive} />}
      details={(
        <CardDetailsGrid>
          <CardDetailItem label="Due date" value={dateLabel(occurrence.operativeDueDate)} />
          <CardDetailItem label="Family" value={<FamilyServiceCell occurrence={occurrence} />} />
          <CardDetailItem label="Type" value={typeLabels[occurrence.deadlineType]} />
          <CardDetailItem label="Status" value={occurrence.status.charAt(0) + occurrence.status.slice(1).toLowerCase()} />
          <CardDetailItem label="Cycle / origin" value={`${occurrence.cycle?.periodKey || '—'} · ${occurrence.origin === 'MANUAL_TRIGGER' ? 'Manual' : 'Rule'}`} />
        </CardDetailsGrid>
      )}
    />
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
  onSort,
  onPageChange,
  onLimitChange,
  onColumnWidthChange,
  onColumnResizeEnd,
  onComplete,
  onWaive,
}: DeadlineTableProps) {
  const visibleColumns = useMemo(
    () => columnOrder.filter((column) => columnVisibility[column]),
    [columnOrder, columnVisibility],
  );
  const startResize = (columnId: DeadlineTableColumnId, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const initial = columnWidths[columnId] ?? defaultDeadlineColumnWidths[columnId];
    let latestWidth = initial;
    const pointerMove = (moveEvent: PointerEvent) => {
      latestWidth = Math.max(96, initial + moveEvent.clientX - startX);
      onColumnWidthChange?.(columnId, latestWidth);
    };
    const pointerUp = () => {
      window.removeEventListener('pointermove', pointerMove);
      onColumnResizeEnd?.(columnId, latestWidth);
      window.removeEventListener('pointerup', pointerUp);
    };
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp, { once: true });
  };

  return (
    <>
      <div className="space-y-3 md:hidden" aria-label="Deadline cards">
        {items.map((occurrence) => <MobileDeadlineCard key={occurrence.id} occurrence={occurrence} canEdit={canEdit} onComplete={onComplete} onWaive={onWaive} />)}
      </div>
      <div className={cn('hidden overflow-x-auto rounded-xl border border-border-primary bg-background-secondary md:block', isFetching && 'opacity-70')}>
        <table className="min-w-[1500px] w-full table-fixed border-collapse" aria-label="Deadline occurrences table">
          <colgroup>{visibleColumns.map((column) => <col key={column} style={{ width: `${columnWidths[column] ?? defaultDeadlineColumnWidths[column]}px` }} />)}</colgroup>
          <thead>
            <tr className="border-b border-border-primary bg-background-tertiary/70">
              {visibleColumns.map((column) => <SortableHeader key={column} columnId={column} sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} onResize={startResize} />)}
            </tr>
          </thead>
          <tbody>
            {items.map((occurrence, index) => (
              <tr key={occurrence.id} className={cn('border-b border-border-primary transition-colors hover:bg-background-tertiary/60', index % 2 === 0 && 'bg-oak-row-alt')}>
                {visibleColumns.map((column) => <DesktopCell key={column} occurrence={occurrence} column={column} canEdit={canEdit} onComplete={onComplete} onWaive={onWaive} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPageChange ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      ) : null}
    </>
  );
}
