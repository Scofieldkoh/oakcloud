'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Edit3,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CompanySelect } from '@/components/ui/company-select';
import { useUpsertUserPreference, useUserPreferences } from '@/hooks/use-user-preferences';
import { cn } from '@/lib/utils';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';
import type {
  TaskListParams,
  TaskStatusAction,
  TaskUpdatePayload,
} from '@/hooks/use-tasks';
import type { TaskListItem, TaskStageSummary, TaskStatus } from '@/services/tasks/types';
import { TaskStagePipeline } from './task-stage-pipeline';
import {
  TaskInlineEditor,
  type TaskEditableField,
} from './task-inline-editor';

interface CompanyOption {
  id: string;
  name: string;
}

interface OwnerOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface TaskListProps {
  tasks: TaskListItem[];
  filters: TaskListParams;
  pipelines: TaskPipeline[];
  companies: CompanyOption[];
  owners: OwnerOption[];
  onFiltersChange: (value: TaskListParams) => void;
  onUpdateMetadata: (task: TaskListItem, payload: TaskUpdatePayload) => Promise<void>;
  onSelectStage: (task: TaskListItem, stage: TaskStageSummary) => void;
  onEdit: (task: TaskListItem) => void;
  onStatusAction: (task: TaskListItem, action: TaskStatusAction) => void;
  onArchive: (task: TaskListItem) => void;
  busyTaskId?: string | null;
}

const TASK_COLUMN_PREF_KEY = 'tasks:list:columns:v1';
const ROW_CLICK_DELAY_MS = 500;
const TASK_COLUMN_IDS = [
  'company',
  'task',
  'status',
  'pipeline',
  'stages',
  'owner',
  'due',
  'actions',
] as const;
type TaskColumnId = (typeof TASK_COLUMN_IDS)[number];

const columnLabels: Record<TaskColumnId, string> = {
  company: 'Company',
  task: 'Task',
  status: 'Status',
  pipeline: 'Pipeline',
  stages: 'Stages',
  owner: 'Owner',
  due: 'Due',
  actions: 'Actions',
};

const defaultColumnWidths: Record<TaskColumnId, number> = {
  company: 180,
  task: 220,
  status: 130,
  pipeline: 180,
  stages: 320,
  owner: 180,
  due: 140,
  actions: 72,
};

const minimumColumnWidths: Record<TaskColumnId, number> = {
  company: 100,
  task: 140,
  status: 100,
  pipeline: 110,
  stages: 220,
  owner: 120,
  due: 110,
  actions: 56,
};

const statusFilterOptions = [
  { value: '', label: 'All' },
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const taskStatusClasses: Record<TaskStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  PAUSED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function taskStatusLabel(status: TaskStatus) {
  return {
    NOT_STARTED: 'Not started',
    IN_PROGRESS: 'In progress',
    PAUSED: 'Paused',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }[status];
}

function dueDateLabel(value: string | null) {
  if (!value) return { date: 'No due date', detail: 'Unscheduled' };
  const date = new Date(value);
  const dueDay = value.slice(0, 10);
  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const todayValue = (type: 'year' | 'month' | 'day') => (
    todayParts.find((part) => part.type === type)?.value ?? ''
  );
  const today = `${todayValue('year')}-${todayValue('month')}-${todayValue('day')}`;
  return {
    date: new Intl.DateTimeFormat('en-SG', {
      timeZone: 'Asia/Singapore',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date),
    detail: dueDay < today ? 'Overdue' : dueDay === today ? 'Today' : 'Scheduled',
  };
}

function Owner({ task }: { task: TaskListItem }) {
  if (!task.owner) return <span className="text-text-muted">Unassigned</span>;
  const name = `${task.owner.firstName} ${task.owner.lastName}`.trim();
  const initials = `${task.owner.firstName[0] ?? ''}${task.owner.lastName[0] ?? ''}`.toUpperCase();
  return (
    <div className="flex items-center gap-2" title={name || task.owner.email}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-oak-primary dark:bg-oak-primary/20">{initials || '?'}</span>
      <span className="truncate text-sm text-text-secondary">{name || task.owner.email}</span>
    </div>
  );
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

function nextIncompleteStage(task: TaskListItem): TaskStageSummary | undefined {
  return [...task.stages]
    .sort((left, right) => left.position - right.position)
    .find((stage) => stage.status !== 'COMPLETED' && stage.status !== 'SKIPPED');
}

function InlineTextFilter({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-border-primary bg-background-secondary/30 transition-colors hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30">
      <input
        type="text"
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        placeholder="All"
        className="min-w-0 flex-1 bg-transparent px-3 text-xs text-text-primary outline-none placeholder:text-text-secondary"
      />
      {value ? (
        <button
          type="button"
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          onClick={() => onChange(undefined)}
          className="mr-1 rounded p-0.5 transition-colors hover:bg-background-tertiary"
        >
          <X className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

interface TaskActionsProps extends Omit<
  TaskListProps,
  'tasks' | 'filters' | 'pipelines' | 'companies' | 'owners' | 'onFiltersChange'
  | 'onUpdateMetadata' | 'onSelectStage'
> {
  task: TaskListItem;
}

function TaskActions({
  task,
  onEdit,
  onStatusAction,
  onArchive,
  busyTaskId,
}: TaskActionsProps) {
  const disabled = busyTaskId === task.id;
  const canTransition = !['COMPLETED', 'CANCELLED'].includes(task.status);
  const statusAction = task.status === 'PAUSED' ? 'resume' : 'pause';
  const StatusIcon = statusAction === 'resume' ? Play : Pause;
  const statusLabel = statusAction === 'resume' ? 'Resume' : 'Pause';
  const triggerClassName = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-background-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30';

  if (disabled) {
    return (
      <button
        type="button"
        className={triggerClassName}
        aria-label={`Actions for ${task.title}`}
        disabled
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Dropdown className="inline-flex">
      <DropdownTrigger asChild aria-label={`Actions for ${task.title}`}>
        <button type="button" className={triggerClassName}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <DropdownItem icon={<Edit3 className="h-4 w-4" />} onClick={() => onEdit(task)}>
          Edit metadata
        </DropdownItem>
        {canTransition ? (
          <DropdownItem icon={<StatusIcon className="h-4 w-4" />} onClick={() => onStatusAction(task, statusAction)}>
            {statusLabel}
          </DropdownItem>
        ) : null}
        {canTransition ? (
          <DropdownItem icon={<XCircle className="h-4 w-4" />} onClick={() => onStatusAction(task, 'cancel')}>
            Cancel
          </DropdownItem>
        ) : null}
        <DropdownSeparator />
        <DropdownItem destructive icon={<Trash2 className="h-4 w-4" />} onClick={() => onArchive(task)}>
          Delete
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}

export function TaskList({
  tasks,
  filters,
  pipelines,
  companies,
  owners,
  onFiltersChange,
  onUpdateMetadata,
  onSelectStage,
  onEdit,
  onStatusAction,
  onArchive,
  busyTaskId,
}: TaskListProps) {
  const { data: preferenceMap } = useUserPreferences([TASK_COLUMN_PREF_KEY]);
  const saveColumnPreference = useUpsertUserPreference<Record<string, number>>();
  const [columnWidths, setColumnWidths] = useState<Partial<Record<TaskColumnId, number>>>({});
  const [editingCell, setEditingCell] = useState<{
    taskId: string;
    field: TaskEditableField;
  } | null>(null);
  const isResizingRef = useRef(false);
  const rowClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferenceValue = preferenceMap?.[TASK_COLUMN_PREF_KEY]?.value;
  const preferenceValueKey = JSON.stringify(preferenceValue ?? null);
  const pipelineFilterOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name })),
  ], [pipelines]);
  const tableWidth = TASK_COLUMN_IDS.reduce(
    (total, columnId) => total + (columnWidths[columnId] ?? defaultColumnWidths[columnId]),
    0,
  );

  useEffect(() => {
    const preferenceValue = JSON.parse(preferenceValueKey) as unknown;
    if (!preferenceValue || typeof preferenceValue !== 'object' || Array.isArray(preferenceValue)) {
      return;
    }

    const restoredWidths: Partial<Record<TaskColumnId, number>> = {};
    for (const columnId of TASK_COLUMN_IDS) {
      const width = (preferenceValue as Record<string, unknown>)[columnId];
      if (typeof width === 'number' && Number.isFinite(width)) {
        restoredWidths[columnId] = Math.max(minimumColumnWidths[columnId], width);
      }
    }
    setColumnWidths(restoredWidths);
  }, [preferenceValueKey]);

  useEffect(() => () => {
    if (rowClickTimeoutRef.current) {
      clearTimeout(rowClickTimeoutRef.current);
    }
  }, []);

  const cancelPendingRowClick = useCallback(() => {
    if (!rowClickTimeoutRef.current) return;
    clearTimeout(rowClickTimeoutRef.current);
    rowClickTimeoutRef.current = null;
  }, []);

  const handleRowClick = useCallback((
    event: React.MouseEvent<HTMLTableRowElement>,
    task: TaskListItem,
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest(
      'button, input, select, textarea, a, [role="button"], [role="separator"], [data-task-inline-editor]',
    )) {
      return;
    }

    const stage = nextIncompleteStage(task);
    if (!stage) return;

    cancelPendingRowClick();
    rowClickTimeoutRef.current = setTimeout(() => {
      rowClickTimeoutRef.current = null;
      onSelectStage(task, stage);
    }, ROW_CLICK_DELAY_MS);
  }, [cancelPendingRowClick, onSelectStage]);

  const beginInlineEdit = useCallback((
    event: React.MouseEvent<HTMLTableCellElement>,
    taskId: string,
    field: TaskEditableField,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingRowClick();
    setEditingCell({ taskId, field });
  }, [cancelPendingRowClick]);

  const updateFilters = useCallback((patch: Partial<TaskListParams>) => {
    onFiltersChange({ ...filters, ...patch, page: 1 });
  }, [filters, onFiltersChange]);

  const persistWidth = useCallback((columnId: TaskColumnId, width: number) => {
    setColumnWidths((current) => {
      const nextWidths = { ...current, [columnId]: width };
      saveColumnPreference.mutate({ key: TASK_COLUMN_PREF_KEY, value: nextWidths });
      return nextWidths;
    });
  }, [saveColumnPreference]);

  const startResize = useCallback((event: React.PointerEvent, columnId: TaskColumnId) => {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget as HTMLElement;
    const header = handle.closest('th');
    const measuredWidth = header?.getBoundingClientRect().width ?? 0;
    const startWidth = columnWidths[columnId]
      ?? (measuredWidth >= minimumColumnWidths[columnId]
        ? measuredWidth
        : defaultColumnWidths[columnId]);
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let latestWidth = startWidth;

    isResizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is unavailable in some browsers and test environments.
    }

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      latestWidth = Math.max(
        minimumColumnWidths[columnId],
        startWidth + (moveEvent.clientX - startX),
      );
      setColumnWidths((current) => ({ ...current, [columnId]: latestWidth }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture is unavailable in some browsers and test environments.
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      isResizingRef.current = false;
      persistWidth(columnId, latestWidth);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [columnWidths, persistWidth]);

  const resizeWithKeyboard = useCallback((
    event: React.KeyboardEvent,
    columnId: TaskColumnId,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentWidth = columnWidths[columnId] ?? defaultColumnWidths[columnId];
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    persistWidth(
      columnId,
      Math.max(minimumColumnWidths[columnId], currentWidth + (direction * 10)),
    );
  }, [columnWidths, persistWidth]);

  return (
    <div data-testid="task-list">
      <div className="space-y-4 md:hidden">
        {tasks.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-text-secondary">No tasks found</p>
          </div>
        ) : tasks.map((task) => {
          const due = dueDateLabel(task.dueDate);
          return (
            <div key={task.id} data-testid="task-mobile-card" className="md:hidden">
              <MobileCard
                className="p-4"
                title={task.title}
                subtitle={task.pipelineVersion.pipeline.name}
                badge={<span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', taskStatusClasses[task.status])}>{taskStatusLabel(task.status)}</span>}
                actions={<TaskActions task={task} onEdit={onEdit} onStatusAction={onStatusAction} onArchive={onArchive} busyTaskId={busyTaskId} />}
                details={(
                  <div className="space-y-4">
                    <CardDetailsGrid className="gap-3">
                      <CardDetailItem label="Company" value={task.company?.name ?? 'Not linked'} />
                      <CardDetailItem label="Owner" value={task.owner ? `${task.owner.firstName} ${task.owner.lastName}`.trim() : 'Unassigned'} />
                      <CardDetailItem label="Due" value={due.date} icon={<CalendarDays className="h-3.5 w-3.5" />} fullWidth />
                    </CardDetailsGrid>
                    <div className="border-t border-border-primary pt-4">
                      <span className="mb-2 block text-xs font-medium text-text-muted">Stages</span>
                      <div className="overflow-x-auto pb-1">
                        <TaskStagePipeline stages={task.stages} onSelectStage={(stage) => onSelectStage(task, stage)} />
                      </div>
                    </div>
                  </div>
                )}
              />
            </div>
          );
        })}
      </div>

      <div
        data-testid="task-table-scroll"
        className="table-container relative hidden overflow-x-auto md:block"
      >
        <div
          aria-hidden="true"
          data-testid="task-column-header-band"
          className="pointer-events-none absolute inset-x-0 top-0 h-[94px] bg-background-tertiary"
        />
        <div
          aria-hidden="true"
          data-testid="task-filter-row-band"
          className="pointer-events-none absolute inset-x-0 top-0 h-14 border-b border-border-primary bg-background-secondary/50"
        />
        <table
          className="table relative z-[1] table-fixed"
          style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
        >
          <colgroup>
            {TASK_COLUMN_IDS.map((columnId) => (
              <col
                key={columnId}
                style={{ width: `${columnWidths[columnId] ?? defaultColumnWidths[columnId]}px` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr data-filter-row className="h-14 bg-background-secondary/50">
              <th className="max-w-0">
                <CompanySelect
                  value={filters.companyId ?? ''}
                  onChange={(companyId) => updateFilters({ companyId: companyId || undefined })}
                  placeholder="All companies"
                  className="text-xs"
                />
              </th>
              <th className="max-w-0">
                <InlineTextFilter
                  ariaLabel="Filter tasks by title"
                  value={filters.title}
                  onChange={(value) => updateFilters({ title: value })}
                />
              </th>
              <th className="max-w-0">
                <SearchableSelect
                  variant="table-filter"
                  options={statusFilterOptions}
                  value={filters.status ?? ''}
                  onChange={(value) => updateFilters({ status: value as TaskListParams['status'] || undefined })}
                  placeholder="All statuses"
                  className="text-xs"
                  showChevron={false}
                  showKeyboardHints={false}
                />
              </th>
              <th className="max-w-0">
                <SearchableSelect
                  variant="table-filter"
                  options={pipelineFilterOptions}
                  value={filters.pipelineId ?? ''}
                  onChange={(value) => updateFilters({ pipelineId: value || undefined })}
                  placeholder="All pipelines"
                  className="text-xs"
                  showChevron={false}
                  showKeyboardHints={false}
                />
              </th>
              <th aria-hidden="true" />
              <th className="max-w-0">
                <InlineTextFilter
                  ariaLabel="Filter tasks by owner"
                  value={filters.ownerQuery}
                  onChange={(value) => updateFilters({ ownerQuery: value })}
                />
              </th>
              <th className="max-w-0">
                <DatePicker
                  value={filters.dueDateFrom || filters.dueDateTo
                    ? {
                      mode: 'range',
                      range: {
                        from: parseLocalDate(filters.dueDateFrom),
                        to: parseLocalDate(filters.dueDateTo),
                      },
                    }
                    : undefined}
                  onChange={(value) => {
                    const range = value?.mode === 'range' ? value.range : undefined;
                    updateFilters({
                      dueBucket: undefined,
                      dueDateFrom: range?.from ? toLocalDateString(range.from) : undefined,
                      dueDateTo: range?.to ? toLocalDateString(range.to) : undefined,
                    });
                  }}
                  placeholder="All dates"
                  size="sm"
                  defaultTab="range"
                  className="text-xs"
                />
              </th>
              <th aria-hidden="true" />
            </tr>
            <tr data-column-header-row className="h-[38px] border-t border-border-primary">
              {TASK_COLUMN_IDS.map((columnId) => (
                <th key={columnId} className="relative">
                  {columnLabels[columnId]}
                  <span
                    role="separator"
                    aria-label={`Resize ${columnLabels[columnId]} column`}
                    aria-orientation="vertical"
                    tabIndex={0}
                    className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none select-none border-r border-transparent hover:border-oak-primary focus:border-oak-primary focus:outline-none"
                    onPointerDown={(event) => startResize(event, columnId)}
                    onKeyDown={(event) => resizeWithKeyboard(event, columnId)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={TASK_COLUMN_IDS.length} className="px-4 py-12 text-center">
                  <p className="text-sm text-text-secondary">No tasks found</p>
                </td>
              </tr>
            ) : tasks.map((task, index) => {
              const due = dueDateLabel(task.dueDate);
              return (
                <tr
                  key={task.id}
                  onClick={(event) => handleRowClick(event, task)}
                  className={cn(
                    'transition-colors hover:bg-background-tertiary/50',
                    nextIncompleteStage(task) && 'cursor-pointer',
                    index % 2 === 1 && 'bg-oak-row-alt hover:bg-oak-row-alt-hover',
                  )}
                >
                  <td
                    className="truncate align-middle"
                    title={task.company?.name ?? undefined}
                    onDoubleClick={(event) => beginInlineEdit(event, task.id, 'company')}
                  >
                    {editingCell?.taskId === task.id && editingCell.field === 'company' ? (
                      <TaskInlineEditor
                        field="company"
                        task={task}
                        companies={companies}
                        owners={owners}
                        onSaveMetadata={(payload) => onUpdateMetadata(task, payload)}
                        onStatusAction={(action) => onStatusAction(task, action)}
                        onSaved={() => setEditingCell(null)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : task.company?.name ?? <span className="text-text-muted">Not linked</span>}
                  </td>
                  <td onDoubleClick={(event) => beginInlineEdit(event, task.id, 'title')}>
                    {editingCell?.taskId === task.id && editingCell.field === 'title' ? (
                      <TaskInlineEditor
                        field="title"
                        task={task}
                        companies={companies}
                        owners={owners}
                        onSaveMetadata={(payload) => onUpdateMetadata(task, payload)}
                        onStatusAction={(action) => onStatusAction(task, action)}
                        onSaved={() => setEditingCell(null)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary" title={task.title}>{task.title}</p>
                      </div>
                    )}
                  </td>
                  <td
                    data-testid="task-status-cell"
                    className="align-middle"
                    onDoubleClick={(event) => beginInlineEdit(event, task.id, 'status')}
                  >
                    {editingCell?.taskId === task.id && editingCell.field === 'status' ? (
                      <TaskInlineEditor
                        field="status"
                        task={task}
                        companies={companies}
                        owners={owners}
                        onSaveMetadata={(payload) => onUpdateMetadata(task, payload)}
                        onStatusAction={(action) => onStatusAction(task, action)}
                        onSaved={() => setEditingCell(null)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium', taskStatusClasses[task.status])}>{taskStatusLabel(task.status)}</span>
                    )}
                  </td>
                  <td data-testid="task-pipeline-cell" className="truncate align-middle" title={task.pipelineVersion.pipeline.name}>
                    {task.pipelineVersion.pipeline.name}
                  </td>
                  <td data-testid="task-stage-cell" className="whitespace-nowrap align-middle">
                    <TaskStagePipeline stages={task.stages} onSelectStage={(stage) => onSelectStage(task, stage)} />
                  </td>
                  <td
                    className="align-middle"
                    onDoubleClick={(event) => beginInlineEdit(event, task.id, 'owner')}
                  >
                    {editingCell?.taskId === task.id && editingCell.field === 'owner' ? (
                      <TaskInlineEditor
                        field="owner"
                        task={task}
                        companies={companies}
                        owners={owners}
                        onSaveMetadata={(payload) => onUpdateMetadata(task, payload)}
                        onStatusAction={(action) => onStatusAction(task, action)}
                        onSaved={() => setEditingCell(null)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : <Owner task={task} />}
                  </td>
                  <td onDoubleClick={(event) => beginInlineEdit(event, task.id, 'due')}>
                    {editingCell?.taskId === task.id && editingCell.field === 'due' ? (
                      <TaskInlineEditor
                        field="due"
                        task={task}
                        companies={companies}
                        owners={owners}
                        onSaveMetadata={(payload) => onUpdateMetadata(task, payload)}
                        onStatusAction={(action) => onStatusAction(task, action)}
                        onSaved={() => setEditingCell(null)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{due.date}</p>
                        {due.detail !== 'Unscheduled' ? (
                          <p className={cn('truncate text-xs', due.detail === 'Overdue' ? 'text-red-600' : 'text-text-muted')}>{due.detail}</p>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="text-center align-middle">
                    <TaskActions task={task} onEdit={onEdit} onStatusAction={onStatusAction} onArchive={onArchive} busyTaskId={busyTaskId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
