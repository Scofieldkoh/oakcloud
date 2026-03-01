'use client';

import { memo, useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { cn, formatCurrency, formatDateShort } from '@/lib/utils';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  CheckSquare,
  ExternalLink,
  MinusSquare,
  MoreHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { AmountFilter, type AmountFilterValue } from '@/components/ui/amount-filter';
import {
  type WorkflowProject,
  type WorkflowProjectStatus,
  getWorkflowProjectProgress,
  WORKFLOW_PROJECT_STATUS_LABELS,
} from '@/hooks/use-workflow-projects';

export interface WorkflowProjectInlineFilters {
  projectName?: string;
  clientName?: string;
  templateName?: string;
  status?: WorkflowProjectStatus;
  nextTaskName?: string;
  assignee?: string;
  startDateFrom?: string;
  startDateTo?: string;
  nextTaskDueDateFrom?: string;
  nextTaskDueDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  progressMin?: number;
  progressMax?: number;
  teamTasksMin?: number;
  teamTasksMax?: number;
  clientTasksMin?: number;
  clientTasksMax?: number;
  billingMin?: number;
  billingMax?: number;
}

interface WorkflowProjectTableProps {
  projects: WorkflowProject[];
  isFetching?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  selectedIds?: Set<string>;
  onToggleOne?: (id: string) => void;
  onToggleAll?: () => void;
  isAllSelected?: boolean;
  isIndeterminate?: boolean;
  canDelete?: boolean;
  onDeleteProject?: (project: WorkflowProject) => void;
  inlineFilters?: WorkflowProjectInlineFilters;
  onInlineFilterChange?: (filters: Partial<WorkflowProjectInlineFilters>) => void;
  projectOptions?: string[];
  clientOptions?: string[];
  templateOptions?: string[];
  assigneeOptions?: string[];
  columnWidths?: Partial<Record<ColumnId, number>>;
  onColumnWidthChange?: (columnId: ColumnId, width: number) => void;
}

const COLUMN_IDS = [
  'select',
  'open',
  'project',
  'client',
  'template',
  'status',
  'progress',
  'nextTaskName',
  'nextTaskDueDate',
  'startDate',
  'dueDate',
  'assignees',
  'billing',
  'actions',
] as const;

type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  select: '',
  open: '',
  project: 'Project',
  client: 'Client',
  template: 'Template',
  status: 'Status',
  progress: 'Progress',
  nextTaskName: 'Next Task Name',
  billing: 'Billing',
  nextTaskDueDate: 'Next Task Due',
  startDate: 'Start Date',
  dueDate: 'Due Date',
  assignees: 'Assignees',
  actions: '',
};

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, string>> = {
  project: 'projectName',
  client: 'clientName',
  template: 'templateName',
  status: 'status',
  progress: 'progress',
  nextTaskName: 'nextTaskName',
  nextTaskDueDate: 'nextTaskDueDate',
  startDate: 'startDate',
  dueDate: 'dueDate',
};

const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnId, number>> = {
  select: 40,
  open: 44,
  project: 240,
  client: 220,
  template: 200,
  status: 130,
  progress: 140,
  nextTaskName: 220,
  nextTaskDueDate: 130,
  startDate: 120,
  dueDate: 120,
  billing: 120,
  assignees: 220,
  actions: 56,
};

const statusClassMap: Record<WorkflowProjectStatus, string> = {
  NOT_STARTED: 'badge-neutral',
  IN_PROGRESS: 'badge-info',
  AT_RISK: 'badge-warning',
  ON_HOLD: 'badge-neutral',
  COMPLETED: 'badge-success',
};

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function isOverdue(project: WorkflowProject): boolean {
  if (project.status === 'COMPLETED') return false;
  const dueDate = new Date(project.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function AssigneeStack({ assignees }: { assignees: string[] }) {
  const visible = assignees.slice(0, 3);
  const remaining = assignees.length - visible.length;

  return (
    <div className="flex items-center gap-1.5 max-w-full">
      {visible.map((assignee) => (
        <span
          key={assignee}
          title={assignee}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-oak-primary/10 text-oak-light text-2xs font-semibold"
        >
          {getInitials(assignee)}
        </span>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-text-secondary">+{remaining}</span>
      )}
    </div>
  );
}

const ProjectActionsDropdown = memo(function ProjectActionsDropdown({
  projectId,
  projectName,
  canDelete,
  onDelete,
}: {
  projectId: string;
  projectName: string;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  return (
    <Dropdown>
      <DropdownTrigger asChild aria-label={`Actions for ${projectName}`}>
        <button className="p-1 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors">
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={`/workflow/projects/${projectId}`}>
          <DropdownItem icon={<ExternalLink className="w-4 h-4" />}>Open Project</DropdownItem>
        </Link>
        {canDelete && onDelete && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 className="w-4 h-4" />}
              destructive
              onClick={onDelete}
            >
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
});

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
  onResize?: (event: React.PointerEvent, columnId: ColumnId) => void;
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
        columnId === 'actions' || columnId === 'select' ? 'px-2' : 'px-4'
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
          onPointerDown={(event) => onResize(event, columnId)}
          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
          title="Drag to resize"
        />
      )}
    </th>
  );
}

export function WorkflowProjectTable({
  projects,
  isFetching,
  sortBy,
  sortOrder,
  onSort,
  selectedIds = new Set<string>(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
  canDelete = false,
  onDeleteProject,
  inlineFilters = {},
  onInlineFilterChange,
  projectOptions = [],
  clientOptions = [],
  templateOptions = [],
  assigneeOptions = [],
  columnWidths: externalColumnWidths,
  onColumnWidthChange,
}: WorkflowProjectTableProps) {
  const [internalColumnWidths, setInternalColumnWidths] = useState<Partial<Record<ColumnId, number>>>({});
  const columnWidths = externalColumnWidths ?? internalColumnWidths;
  const isResizingRef = useRef(false);

  const startResize = useCallback((event: React.PointerEvent, columnId: ColumnId) => {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget as HTMLElement | null;
    const th = handle?.closest('th') as HTMLTableCellElement | null;
    const startWidth = columnWidths[columnId] ?? th?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTHS[columnId] ?? 120;
    const startX = event.clientX;
    const pointerId = event.pointerId;

    isResizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    let latestWidth = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = Math.max(30, startWidth + delta);
      if (th) th.style.width = `${latestWidth}px`;
    };

    const onUp = () => {
      (handle as HTMLElement | null)?.releasePointerCapture(pointerId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      isResizingRef.current = false;

      if (onColumnWidthChange) {
        onColumnWidthChange(columnId, latestWidth);
      } else {
        setInternalColumnWidths((previous) => ({ ...previous, [columnId]: latestWidth }));
      }

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [columnWidths, onColumnWidthChange]);

  const renderFilterCell = (columnId: ColumnId) => {
    if (!onInlineFilterChange) return null;

    switch (columnId) {
      case 'project':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...projectOptions.map((projectName) => ({ value: projectName, label: projectName })),
            ]}
            value={inlineFilters.projectName || ''}
            onChange={(value) => onInlineFilterChange({ projectName: value || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );
      case 'client':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...clientOptions.map((clientName) => ({ value: clientName, label: clientName })),
            ]}
            value={inlineFilters.clientName || ''}
            onChange={(value) => onInlineFilterChange({ clientName: value || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );
      case 'template':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...templateOptions.map((templateName) => ({ value: templateName, label: templateName })),
            ]}
            value={inlineFilters.templateName || ''}
            onChange={(value) => onInlineFilterChange({ templateName: value || undefined })}
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
              ...Object.entries(WORKFLOW_PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
            ]}
            value={inlineFilters.status || ''}
            onChange={(value) => onInlineFilterChange({ status: value as WorkflowProjectStatus || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );
      case 'progress':
        return (
          <AmountFilter
            value={
              inlineFilters.progressMin !== undefined || inlineFilters.progressMax !== undefined
                ? {
                  mode: 'range',
                  range: {
                    from: inlineFilters.progressMin,
                    to: inlineFilters.progressMax,
                  },
                }
                : undefined
            }
            onChange={(value: AmountFilterValue | undefined) => {
              if (!value) {
                onInlineFilterChange({ progressMin: undefined, progressMax: undefined });
              } else if (value.mode === 'single' && value.single !== undefined) {
                onInlineFilterChange({ progressMin: value.single, progressMax: value.single });
              } else if (value.mode === 'range' && value.range) {
                onInlineFilterChange({ progressMin: value.range.from, progressMax: value.range.to });
              }
            }}
            placeholder="All"
            size="sm"
            showChevron={false}
          />
        );
      case 'nextTaskName':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.nextTaskName || ''}
              onChange={(event) => onInlineFilterChange({ nextTaskName: event.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
          </div>
        );
      case 'billing':
        return (
          <AmountFilter
            value={
              inlineFilters.billingMin !== undefined || inlineFilters.billingMax !== undefined
                ? {
                  mode: 'range',
                  range: {
                    from: inlineFilters.billingMin,
                    to: inlineFilters.billingMax,
                  },
                }
                : undefined
            }
            onChange={(value: AmountFilterValue | undefined) => {
              if (!value) {
                onInlineFilterChange({ billingMin: undefined, billingMax: undefined });
              } else if (value.mode === 'single' && value.single !== undefined) {
                onInlineFilterChange({ billingMin: value.single, billingMax: value.single });
              } else if (value.mode === 'range' && value.range) {
                onInlineFilterChange({ billingMin: value.range.from, billingMax: value.range.to });
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
                  mode: 'range',
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
      case 'nextTaskDueDate':
        return (
          <DatePicker
            value={
              inlineFilters.nextTaskDueDateFrom || inlineFilters.nextTaskDueDateTo
                ? {
                  mode: 'range',
                  range: {
                    from: inlineFilters.nextTaskDueDateFrom ? new Date(inlineFilters.nextTaskDueDateFrom) : undefined,
                    to: inlineFilters.nextTaskDueDateTo ? new Date(inlineFilters.nextTaskDueDateTo) : undefined,
                  },
                }
                : undefined
            }
            onChange={(value: DatePickerValue | undefined) => {
              if (!value || value.mode !== 'range') {
                onInlineFilterChange({ nextTaskDueDateFrom: undefined, nextTaskDueDateTo: undefined });
              } else if (value.range) {
                onInlineFilterChange({
                  nextTaskDueDateFrom: value.range.from ? toLocalDateString(value.range.from) : undefined,
                  nextTaskDueDateTo: value.range.to ? toLocalDateString(value.range.to) : undefined,
                });
              }
            }}
            placeholder="All dates"
            size="sm"
            defaultTab="range"
            className="text-xs"
          />
        );
      case 'dueDate':
        return (
          <DatePicker
            value={
              inlineFilters.dueDateFrom || inlineFilters.dueDateTo
                ? {
                  mode: 'range',
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
      case 'assignees':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...assigneeOptions.map((assigneeName) => ({ value: assigneeName, label: assigneeName })),
            ]}
            value={inlineFilters.assignee || ''}
            onChange={(value) => onInlineFilterChange({ assignee: value || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className={cn('lg:hidden space-y-3', isFetching && 'opacity-60')}>
        {projects.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={onToggleAll}
              className="p-2 hover:bg-background-secondary rounded transition-colors flex items-center gap-2"
              aria-label={isAllSelected ? 'Deselect all projects' : 'Select all projects'}
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

        {projects.length === 0 ? (
          <div className="card p-6 sm:p-12 text-center">
            <h3 className="text-lg font-medium text-text-primary mb-2">No projects found</h3>
            <p className="text-text-secondary">
              Try adjusting filters or clear your current search.
            </p>
          </div>
        ) : (
          projects.map((project) => {
            const progress = getWorkflowProjectProgress(project);
            const isSelected = selectedIds.has(project.id);
            return (
              <MobileCard
                key={project.id}
                isSelected={isSelected}
                selectable
                onToggle={() => onToggleOne?.(project.id)}
                selectionLabel={isSelected ? `Deselect ${project.name}` : `Select ${project.name}`}
                title={
                  <Link
                    href={`/workflow/projects/${project.id}`}
                    className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                  >
                    {project.name}
                  </Link>
                }
                subtitle={project.clientName}
                badge={<span className={`badge ${statusClassMap[project.status]}`}>{WORKFLOW_PROJECT_STATUS_LABELS[project.status]}</span>}
                actions={(
                  <ProjectActionsDropdown
                    projectId={project.id}
                    projectName={project.name}
                    canDelete={canDelete}
                    onDelete={onDeleteProject ? () => onDeleteProject(project) : undefined}
                  />
                )}
                details={(
                  <CardDetailsGrid>
                    <CardDetailItem label="Template" value={project.templateName} fullWidth />
                    <CardDetailItem label="Progress" value={`${progress}%`} />
                    <CardDetailItem label="Due Date" value={formatDateShort(project.dueDate)} />
                    <CardDetailItem label="Billing" value={formatCurrency(project.billingAmount, project.billingCurrency)} />
                    <CardDetailItem label="Assignees" value={project.assignees.join(', ')} fullWidth />
                  </CardDetailsGrid>
                )}
              />
            );
          })
        )}
      </div>

      <div className={cn('hidden lg:block table-container overflow-hidden', isFetching && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <colgroup>
              {COLUMN_IDS.map((columnId) => (
                <col
                  key={columnId}
                  style={
                    columnId === 'select'
                      ? { width: '40px' }
                      : columnId === 'open'
                      ? { width: '44px' }
                      : columnWidths[columnId]
                        ? { width: `${columnWidths[columnId]}px` }
                        : undefined
                  }
                />
              ))}
            </colgroup>
            <thead className="bg-background-tertiary border-b border-border-primary">
              {onInlineFilterChange && (
                <tr className="bg-background-secondary/50">
                  {COLUMN_IDS.map((columnId) => (
                    <th
                      key={columnId}
                      className={cn(
                        'py-2 max-w-0',
                        columnId === 'select' || columnId === 'open' || columnId === 'actions' ? 'px-2' : 'px-4'
                      )}
                    >
                      {renderFilterCell(columnId)}
                    </th>
                  ))}
                </tr>
              )}
              <tr className={onInlineFilterChange ? 'border-t border-border-primary' : ''}>
                {COLUMN_IDS.map((columnId) =>
                  columnId === 'select' ? (
                    <th key={columnId} className="w-10 px-2 py-2.5 text-center">
                      <button
                        onClick={onToggleAll}
                        className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                        aria-label={isAllSelected ? 'Deselect all projects' : 'Select all projects'}
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
                  ) : columnId === 'open' ? (
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
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_IDS.length} className="px-4 py-12 text-center">
                    <p className="text-sm text-text-secondary">No projects found</p>
                  </td>
                </tr>
              ) : (
                projects.map((project, index) => {
                  const progress = getWorkflowProjectProgress(project);
                  const projectIsOverdue = isOverdue(project);
                  const isAlternate = index % 2 === 1;
                  const isSelected = selectedIds.has(project.id);

                  return (
                    <tr
                      key={project.id}
                      className={cn(
                        'group/workflow-row border-b border-border-primary transition-colors',
                        isSelected
                          ? 'bg-oak-row-selected hover:bg-oak-row-selected-hover'
                          : isAlternate
                            ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                            : 'hover:bg-background-tertiary/50'
                      )}
                    >
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleOne?.(project.id)}
                          className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                          aria-label={isSelected ? `Deselect ${project.name}` : `Select ${project.name}`}
                          aria-pressed={isSelected}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-oak-primary" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 text-text-muted" aria-hidden="true" />
                          )}
                        </button>
                      </td>

                      <td className="px-2 py-3">
                        <Link
                          href={`/workflow/projects/${project.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
                          aria-label={`Open "${project.name}" in new tab`}
                          title={`Open "${project.name}" in new tab`}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </td>

                      <td className="px-4 py-3 max-w-0">
                        <Link
                          href={`/workflow/projects/${project.id}`}
                          className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                        >
                          {project.name}
                        </Link>
                      </td>

                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{project.clientName}</span>
                      </td>

                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{project.templateName}</span>
                      </td>

                      <td className="px-4 py-3 max-w-0">
                        <span className={`badge ${statusClassMap[project.status]}`}>
                          {WORKFLOW_PROJECT_STATUS_LABELS[project.status]}
                        </span>
                      </td>

                      <td className="px-4 py-3 max-w-0">
                        <div className="w-full min-w-[96px]">
                          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                            <span>{progress}%</span>
                            <span>{project.completedTaskCount}/{project.totalTaskCount}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-background-tertiary overflow-hidden">
                            <div
                              className="h-full bg-oak-light rounded-full transition-[width]"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{project.nextTaskName ?? '-'}</span>
                      </td>

                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">
                          {project.nextTaskDueDate ? formatDateShort(project.nextTaskDueDate) : '-'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-text-secondary max-w-0">
                        <span className="block truncate">{formatDateShort(project.startDate)}</span>
                      </td>

                      <td className={cn('px-4 py-3 max-w-0', projectIsOverdue && 'text-status-error font-medium')}>
                        <span className="block truncate">{formatDateShort(project.dueDate)}</span>
                      </td>

                      <td className="px-4 py-3 max-w-0">
                        <AssigneeStack assignees={project.assignees} />
                      </td>

                      <td className="px-4 py-3 text-text-secondary max-w-0 text-right">
                        <span className="block truncate">{formatCurrency(project.billingAmount, project.billingCurrency)}</span>
                      </td>

                      <td className="px-2 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canDelete && onDeleteProject && (
                            <button
                              type="button"
                              onClick={() => onDeleteProject(project)}
                              className="opacity-0 group-hover/workflow-row:opacity-100 focus-visible:opacity-100 p-1 rounded hover:bg-status-error/10 text-text-tertiary hover:text-status-error transition"
                              aria-label={`Delete ${project.name}`}
                              title={`Delete ${project.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <ProjectActionsDropdown
                            projectId={project.id}
                            projectName={project.name}
                            canDelete={canDelete}
                            onDelete={onDeleteProject ? () => onDeleteProject(project) : undefined}
                          />
                        </div>
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
