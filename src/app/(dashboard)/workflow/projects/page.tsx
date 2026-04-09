'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Calculator,
  Plus,
  RefreshCw,
  AlertCircle,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Trash2,
  X,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { FilterChip } from '@/components/ui/filter-chip';
import { Pagination } from '@/components/ui/pagination';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import {
  type WorkflowDueBucket,
  type WorkflowProject,
  type WorkflowProjectSortField,
  type WorkflowProjectSearchParams,
  type WorkflowProjectStatus,
  useBulkDeleteWorkflowProjects,
  useDeleteWorkflowProject,
  useWorkflowProjects,
  WORKFLOW_PROJECT_STATUS_LABELS,
} from '@/hooks/use-workflow-projects';
import { usePermissions } from '@/hooks/use-permissions';
import { WorkflowProjectFilters, type WorkflowProjectFilterValues } from '@/components/workflow/project-filters';
import { WorkflowProjectTable, type WorkflowProjectInlineFilters } from '@/components/workflow/project-table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { cn, formatCurrency } from '@/lib/utils';

const WORKFLOW_SEARCH_INPUT_ID = 'workflow-projects-search-input';
const COLUMN_PREF_KEY = 'workflow:projects:list:columns:v1';

const DUE_BUCKET_LABELS: Record<WorkflowDueBucket, string> = {
  today: 'Due Today',
  thisWeek: 'Due This Week',
  nextWeek: 'Due Next Week',
  overdue: 'Overdue',
};

type NumericFilterField =
  | 'progressMin'
  | 'progressMax'
  | 'teamTasksMin'
  | 'teamTasksMax'
  | 'clientTasksMin'
  | 'clientTasksMax'
  | 'billingMin'
  | 'billingMax';

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatDateRange(from?: string, to?: string): string {
  if (from && to) return `${from} - ${to}`;
  if (from) return `From ${from}`;
  if (to) return `To ${to}`;
  return '';
}

function formatNumberRange(min?: number, max?: number, suffix = ''): string {
  if (min !== undefined && max !== undefined) {
    return min === max ? `${min}${suffix}` : `${min} - ${max}${suffix}`;
  }
  if (min !== undefined) return `>= ${min}${suffix}`;
  if (max !== undefined) return `<= ${max}${suffix}`;
  return '';
}

export default function WorkflowProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const { success, error: toastError } = useToast();
  const deleteWorkflowProject = useDeleteWorkflowProject();
  const bulkDeleteWorkflowProjects = useBulkDeleteWorkflowProjects();

  const getParamsFromUrl = useCallback((): WorkflowProjectSearchParams => {
    return {
      query: searchParams.get('q') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: (searchParams.get('sortBy') || 'dueDate') as WorkflowProjectSortField,
      sortOrder: (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc',
      dueBucket: (searchParams.get('dueBucket') || undefined) as WorkflowDueBucket | undefined,
      status: (searchParams.get('status') || undefined) as WorkflowProjectStatus | undefined,
      projectName: searchParams.get('projectName') || undefined,
      clientName: searchParams.get('clientName') || undefined,
      templateName: searchParams.get('templateName') || undefined,
      nextTaskName: searchParams.get('nextTaskName') || undefined,
      assignee: searchParams.get('assignee') || undefined,
      startDateFrom: searchParams.get('startDateFrom') || undefined,
      startDateTo: searchParams.get('startDateTo') || undefined,
      nextTaskDueDateFrom: searchParams.get('nextTaskDueDateFrom') || undefined,
      nextTaskDueDateTo: searchParams.get('nextTaskDueDateTo') || undefined,
      dueDateFrom: searchParams.get('dueDateFrom') || undefined,
      dueDateTo: searchParams.get('dueDateTo') || undefined,
      progressMin: parseOptionalNumber(searchParams.get('progressMin')),
      progressMax: parseOptionalNumber(searchParams.get('progressMax')),
      teamTasksMin: parseOptionalNumber(searchParams.get('teamTasksMin')),
      teamTasksMax: parseOptionalNumber(searchParams.get('teamTasksMax')),
      clientTasksMin: parseOptionalNumber(searchParams.get('clientTasksMin')),
      clientTasksMax: parseOptionalNumber(searchParams.get('clientTasksMax')),
      billingMin: parseOptionalNumber(searchParams.get('billingMin')),
      billingMax: parseOptionalNumber(searchParams.get('billingMax')),
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const { data, isLoading, isFetching, error, refetch } = useWorkflowProjects(params);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [params]);

  const toggleSelect = useCallback((projectId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!data?.projects || data.projects.length === 0) return;
    const allIds = data.projects.map((project) => project.id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  }, [data?.projects, selectedIds]);

  const selectedProjects = useMemo(() => {
    if (!data?.projects || selectedIds.size === 0) return [];
    return data.projects.filter((project) => selectedIds.has(project.id));
  }, [data?.projects, selectedIds]);

  const selectedCount = selectedProjects.length;
  const isAllSelected = !!data?.projects.length && selectedCount === data.projects.length;
  const isIndeterminate = selectedCount > 0 && !isAllSelected;

  const selectedBillingTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const project of selectedProjects) {
      const currency = project.billingCurrency || 'SGD';
      totals.set(currency, (totals.get(currency) ?? 0) + project.billingAmount);
    }
    return Array.from(totals.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [selectedProjects]);

  const selectedBillingLabel = useMemo(() => {
    if (selectedBillingTotals.length === 0) return '-';
    return selectedBillingTotals
      .map((entry) => formatCurrency(entry.amount, entry.currency))
      .join(' + ');
  }, [selectedBillingTotals]);

  const handleDeleteProject = useCallback((project: WorkflowProject) => {
    if (!can.deleteCompany) return;
    setProjectToDelete({ id: project.id, name: project.name });
  }, [can.deleteCompany]);

  const handleDeleteConfirm = useCallback(async (reason?: string) => {
    if (!projectToDelete || !reason) return;

    const targetProjectId = projectToDelete.id;
    try {
      await deleteWorkflowProject.mutateAsync({ id: targetProjectId, reason });
      success('Project deleted successfully');
      setProjectToDelete(null);
      setSelectedIds((previous) => {
        const next = new Set(previous);
        next.delete(targetProjectId);
        return next;
      });
      await refetch();
    } catch (errorValue) {
      toastError(errorValue instanceof Error ? errorValue.message : 'Failed to delete project');
    }
  }, [deleteWorkflowProject, projectToDelete, refetch, success, toastError]);

  const handleBulkDeleteConfirm = useCallback(async (reason?: string) => {
    if (!reason || selectedIds.size === 0) return;

    try {
      const ids = Array.from(new Set(selectedProjects.map((project) => project.id)));
      if (ids.length === 0) return;
      const result = await bulkDeleteWorkflowProjects.mutateAsync({ ids, reason });
      success(result.message || `Deleted ${ids.length} projects`);
      setBulkDeleteDialogOpen(false);
      clearSelection();
      await refetch();
    } catch (errorValue) {
      toastError(errorValue instanceof Error ? errorValue.message : 'Failed to delete selected projects');
    }
  }, [bulkDeleteWorkflowProjects, clearSelection, refetch, selectedIds, selectedProjects, success, toastError]);

  const targetUrl = useMemo(() => {
    const query = new URLSearchParams();

    if (params.query) query.set('q', params.query);
    if ((params.page ?? 1) > 1) query.set('page', String(params.page));
    if ((params.limit ?? 20) !== 20) query.set('limit', String(params.limit));
    if ((params.sortBy ?? 'dueDate') !== 'dueDate') query.set('sortBy', params.sortBy!);
    if ((params.sortOrder ?? 'asc') !== 'asc') query.set('sortOrder', params.sortOrder!);
    if (params.dueBucket) query.set('dueBucket', params.dueBucket);
    if (params.status) query.set('status', params.status);
    if (params.projectName) query.set('projectName', params.projectName);
    if (params.clientName) query.set('clientName', params.clientName);
    if (params.templateName) query.set('templateName', params.templateName);
    if (params.nextTaskName) query.set('nextTaskName', params.nextTaskName);
    if (params.assignee) query.set('assignee', params.assignee);
    if (params.startDateFrom) query.set('startDateFrom', params.startDateFrom);
    if (params.startDateTo) query.set('startDateTo', params.startDateTo);
    if (params.nextTaskDueDateFrom) query.set('nextTaskDueDateFrom', params.nextTaskDueDateFrom);
    if (params.nextTaskDueDateTo) query.set('nextTaskDueDateTo', params.nextTaskDueDateTo);
    if (params.dueDateFrom) query.set('dueDateFrom', params.dueDateFrom);
    if (params.dueDateTo) query.set('dueDateTo', params.dueDateTo);

    const numberFields: NumericFilterField[] = [
      'progressMin',
      'progressMax',
      'teamTasksMin',
      'teamTasksMax',
      'clientTasksMin',
      'clientTasksMax',
    ];
    for (const field of numberFields) {
      if (params[field] !== undefined) query.set(field, String(params[field]));
    }

    const queryString = query.toString();
    return queryString ? `/workflow/projects?${queryString}` : '/workflow/projects';
  }, [params]);

  useEffect(() => {
    if (window.location.pathname + window.location.search !== targetUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  }, [targetUrl, router]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const focusSearchInput = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.getElementById(WORKFLOW_SEARCH_INPUT_ID) as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const handleSearch = (query: string) => {
    setParams((previous) => ({ ...previous, query, page: 1 }));
  };

  const handleFilterChange = (filters: WorkflowProjectFilterValues) => {
    setParams((previous) => ({
      ...previous,
      ...filters,
      page: 1,
    }));
  };

  const handleInlineFilterChange = useCallback((filters: Partial<WorkflowProjectInlineFilters>) => {
    setParams((previous) => ({
      ...previous,
      ...filters,
      page: 1,
    }));
  }, []);

  const handleSort = (field: string) => {
    setParams((previous) => {
      if (previous.sortBy === field) {
        return { ...previous, sortOrder: previous.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      return { ...previous, sortBy: field as WorkflowProjectSortField, sortOrder: 'asc' };
    });
  };

  const handlePageChange = (page: number) => {
    setParams((previous) => ({ ...previous, page }));
  };

  const handleLimitChange = (limit: number) => {
    setParams((previous) => ({ ...previous, limit, page: 1 }));
  };

  const clearAllFilters = useCallback(() => {
    setParams((previous) => ({
      ...previous,
      query: '',
      dueBucket: undefined,
      status: undefined,
      projectName: undefined,
      clientName: undefined,
      templateName: undefined,
      nextTaskName: undefined,
      assignee: undefined,
      startDateFrom: undefined,
      startDateTo: undefined,
      nextTaskDueDateFrom: undefined,
      nextTaskDueDateTo: undefined,
      dueDateFrom: undefined,
      dueDateTo: undefined,
      progressMin: undefined,
      progressMax: undefined,
      teamTasksMin: undefined,
      teamTasksMax: undefined,
      clientTasksMin: undefined,
      clientTasksMax: undefined,
      billingMin: undefined,
      billingMax: undefined,
      page: 1,
    }));
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; value: string; onRemove: () => void }> = [];

    if (params.query) {
      chips.push({
        key: 'query',
        label: 'Search',
        value: params.query,
        onRemove: () => setParams((previous) => ({ ...previous, query: '', page: 1 })),
      });
    }
    if (params.dueBucket) {
      chips.push({
        key: 'dueBucket',
        label: 'Bucket',
        value: DUE_BUCKET_LABELS[params.dueBucket],
        onRemove: () => setParams((previous) => ({ ...previous, dueBucket: undefined, page: 1 })),
      });
    }
    if (params.status) {
      chips.push({
        key: 'status',
        label: 'Status',
        value: WORKFLOW_PROJECT_STATUS_LABELS[params.status],
        onRemove: () => setParams((previous) => ({ ...previous, status: undefined, page: 1 })),
      });
    }
    if (params.projectName) {
      chips.push({
        key: 'projectName',
        label: 'Project',
        value: params.projectName,
        onRemove: () => setParams((previous) => ({ ...previous, projectName: undefined, page: 1 })),
      });
    }
    if (params.clientName) {
      chips.push({
        key: 'clientName',
        label: 'Client',
        value: params.clientName,
        onRemove: () => setParams((previous) => ({ ...previous, clientName: undefined, page: 1 })),
      });
    }
    if (params.templateName) {
      chips.push({
        key: 'templateName',
        label: 'Template',
        value: params.templateName,
        onRemove: () => setParams((previous) => ({ ...previous, templateName: undefined, page: 1 })),
      });
    }
    if (params.nextTaskName) {
      chips.push({
        key: 'nextTaskName',
        label: 'Next Task',
        value: params.nextTaskName,
        onRemove: () => setParams((previous) => ({ ...previous, nextTaskName: undefined, page: 1 })),
      });
    }
    if (params.assignee) {
      chips.push({
        key: 'assignee',
        label: 'Assignee',
        value: params.assignee,
        onRemove: () => setParams((previous) => ({ ...previous, assignee: undefined, page: 1 })),
      });
    }
    if (params.startDateFrom || params.startDateTo) {
      chips.push({
        key: 'startDate',
        label: 'Start Date',
        value: formatDateRange(params.startDateFrom, params.startDateTo),
        onRemove: () => setParams((previous) => ({ ...previous, startDateFrom: undefined, startDateTo: undefined, page: 1 })),
      });
    }
    if (params.nextTaskDueDateFrom || params.nextTaskDueDateTo) {
      chips.push({
        key: 'nextTaskDueDate',
        label: 'Next Task Due',
        value: formatDateRange(params.nextTaskDueDateFrom, params.nextTaskDueDateTo),
        onRemove: () => setParams((previous) => ({
          ...previous,
          nextTaskDueDateFrom: undefined,
          nextTaskDueDateTo: undefined,
          page: 1,
        })),
      });
    }
    if (params.dueDateFrom || params.dueDateTo) {
      chips.push({
        key: 'dueDate',
        label: 'Due Date',
        value: formatDateRange(params.dueDateFrom, params.dueDateTo),
        onRemove: () => setParams((previous) => ({ ...previous, dueDateFrom: undefined, dueDateTo: undefined, page: 1 })),
      });
    }
    if (params.progressMin !== undefined || params.progressMax !== undefined) {
      chips.push({
        key: 'progress',
        label: 'Progress',
        value: formatNumberRange(params.progressMin, params.progressMax, '%'),
        onRemove: () => setParams((previous) => ({ ...previous, progressMin: undefined, progressMax: undefined, page: 1 })),
      });
    }
    if (params.teamTasksMin !== undefined || params.teamTasksMax !== undefined) {
      chips.push({
        key: 'teamTasks',
        label: 'Team Tasks',
        value: formatNumberRange(params.teamTasksMin, params.teamTasksMax),
        onRemove: () => setParams((previous) => ({ ...previous, teamTasksMin: undefined, teamTasksMax: undefined, page: 1 })),
      });
    }
    if (params.clientTasksMin !== undefined || params.clientTasksMax !== undefined) {
      chips.push({
        key: 'clientTasks',
        label: 'Client Tasks',
        value: formatNumberRange(params.clientTasksMin, params.clientTasksMax),
        onRemove: () => setParams((previous) => ({ ...previous, clientTasksMin: undefined, clientTasksMax: undefined, page: 1 })),
      });
    }
    if (params.billingMin !== undefined || params.billingMax !== undefined) {
      chips.push({
        key: 'billing',
        label: 'Billing',
        value: formatNumberRange(params.billingMin, params.billingMax),
        onRemove: () => setParams((previous) => ({ ...previous, billingMin: undefined, billingMax: undefined, page: 1 })),
      });
    }

    return chips;
  }, [params]);

  const inlineFilters: WorkflowProjectInlineFilters = useMemo(() => ({
    projectName: params.projectName,
    clientName: params.clientName,
    templateName: params.templateName,
    nextTaskName: params.nextTaskName,
    status: params.status,
    assignee: params.assignee,
    startDateFrom: params.startDateFrom,
    startDateTo: params.startDateTo,
    nextTaskDueDateFrom: params.nextTaskDueDateFrom,
    nextTaskDueDateTo: params.nextTaskDueDateTo,
    dueDateFrom: params.dueDateFrom,
    dueDateTo: params.dueDateTo,
    progressMin: params.progressMin,
    progressMax: params.progressMax,
    teamTasksMin: params.teamTasksMin,
    teamTasksMax: params.teamTasksMax,
    clientTasksMin: params.clientTasksMin,
    clientTasksMax: params.clientTasksMax,
    billingMin: params.billingMin,
    billingMax: params.billingMax,
  }), [params]);

  const handleColumnWidthChange = useCallback((columnId: string, width: number) => {
    setColumnWidths((previous) => {
      const next = { ...previous, [columnId]: width };
      if (typeof window !== 'undefined') {
        localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(COLUMN_PREF_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      setColumnWidths(parsed);
    } catch {
      // Ignore malformed localStorage values.
    }
  }, []);

  // Keyboard shortcuts (standardized): Ctrl+R refresh, F1 primary action, F2 secondary action
  useKeyboardShortcuts([
    {
      key: 'r',
      ctrl: true,
      handler: handleRefresh,
      description: 'Refresh workflow projects',
    },
    {
      key: 'k',
      ctrl: true,
      handler: focusSearchInput,
      description: 'Focus search',
    },
    {
      key: 'F1',
      handler: () => router.push('/workflow/projects/new'),
      description: 'Create project',
    },
    ...(can.deleteCompany && selectedCount > 0 ? [{
      key: 'F2',
      handler: () => setBulkDeleteDialogOpen(true),
      description: 'Delete selected projects',
    }] : []),
  ]);

  const dueCards = [
    {
      key: 'today' as const,
      title: 'Due Today',
      count: data?.stats.dueToday ?? 0,
      icon: Clock,
    },
    {
      key: 'thisWeek' as const,
      title: 'Due This Week',
      count: data?.stats.dueThisWeek ?? 0,
      icon: Calendar,
    },
    {
      key: 'nextWeek' as const,
      title: 'Due Next Week',
      count: data?.stats.dueNextWeek ?? 0,
      icon: CheckCircle,
    },
    {
      key: 'overdue' as const,
      title: 'Overdue',
      count: data?.stats.overdue ?? 0,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Workflow Projects</h1>
          <p className="text-text-secondary text-sm mt-1">
            Track active client workflows with inline filtering and due-date visibility
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            className="btn-secondary btn-sm flex items-center gap-2 whitespace-nowrap"
            aria-label="Refresh projects"
            title="Refresh list (Ctrl+R)"
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">Refresh (Ctrl+R)</span>
            <span className="xl:hidden">Refresh</span>
          </button>

          <Link href="/workflow/projects/new" className="btn-primary btn-sm flex items-center gap-2 whitespace-nowrap" title="Create project (F1)">
            <Plus className="w-4 h-4" />
            <span className="hidden xl:inline">New Project (F1)</span>
            <span className="xl:hidden">New</span>
          </Link>
        </div>
      </div>

      <MobileCollapsibleSection title="Workload Snapshot" count={dueCards.length} className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dueCards.map((card) => {
            const Icon = card.icon;
            const active = params.dueBucket === card.key;
            return (
              <button
                type="button"
                key={card.key}
                onClick={() => {
                  setParams((previous) => ({
                    ...previous,
                    dueBucket: previous.dueBucket === card.key ? undefined : card.key,
                    page: 1,
                  }));
                }}
                className={cn(
                  'card card-compact sm:p-4 text-left transition-colors border',
                  active
                    ? 'border-oak-primary bg-oak-primary/5'
                    : 'border-border-primary hover:border-oak-primary/30'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded', active ? 'bg-oak-primary/10' : 'bg-background-tertiary')}>
                    <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', active ? 'text-oak-light' : 'text-text-secondary')} />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-semibold text-text-primary">{card.count}</p>
                    <p className="text-xs sm:text-sm text-text-tertiary">{card.title}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-text-secondary">
          <span>Total Projects: {data?.stats.total ?? 0}</span>
          {params.dueBucket && (
            <button
              type="button"
              onClick={() => setParams((previous) => ({ ...previous, dueBucket: undefined, page: 1 }))}
              className="hover:text-text-primary underline"
            >
              Clear due bucket
            </button>
          )}
        </div>
      </MobileCollapsibleSection>

      <div className="mb-6">
        <WorkflowProjectFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialFilters={{
            status: params.status,
            clientName: params.clientName,
            templateName: params.templateName,
            assignee: params.assignee,
            dueDateFrom: params.dueDateFrom,
            dueDateTo: params.dueDateTo,
            progressMin: params.progressMin,
            progressMax: params.progressMax,
          }}
          initialQuery={params.query}
          searchInputId={WORKFLOW_SEARCH_INPUT_ID}
          clientOptions={data?.clientOptions || []}
          templateOptions={data?.templateOptions || []}
          assigneeOptions={data?.assigneeOptions || []}
        />
      </div>

      {error && (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load workflow projects'}</p>
          </div>
        </div>
      )}

      {activeFilterChips.length > 0 && (
        <div className="hidden lg:flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-text-secondary font-medium">Active filters:</span>
          {activeFilterChips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              value={chip.value}
              onRemove={chip.onRemove}
            />
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-sm text-text-muted hover:text-text-primary transition-colors ml-2"
          >
            Clear all
          </button>
        </div>
      )}

      {isLoading && !data && (
        <div className="card p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-oak-light border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-text-secondary">Loading workflow projects...</span>
        </div>
      )}

      {data && (
        <WorkflowProjectTable
          projects={data.projects}
          isFetching={isFetching}
          sortBy={params.sortBy}
          sortOrder={params.sortOrder}
          onSort={handleSort}
          selectedIds={selectedIds}
          onToggleOne={toggleSelect}
          onToggleAll={toggleSelectAll}
          isAllSelected={isAllSelected}
          isIndeterminate={isIndeterminate}
          canDelete={can.deleteCompany}
          onDeleteProject={handleDeleteProject}
          inlineFilters={inlineFilters}
          onInlineFilterChange={handleInlineFilterChange}
          projectOptions={data.projectOptions}
          clientOptions={data.clientOptions}
          templateOptions={data.templateOptions}
          assigneeOptions={data.assigneeOptions}
          columnWidths={columnWidths}
          onColumnWidthChange={(columnId, width) => handleColumnWidthChange(columnId, width)}
        />
      )}

      {data && data.totalPages > 0 && (
        <div className="mt-4">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}

      {selectedCount > 0 && (
        <div
          className={cn(
            'fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40',
            'bg-background-primary border border-border-primary rounded-lg shadow-xl',
            'flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3',
            'max-w-[calc(100%-2rem)] sm:max-w-none',
            'animate-in slide-in-from-bottom-4'
          )}
        >
          <div className="flex items-center gap-2 pr-3 border-r border-border-primary">
            <span className="text-xs sm:text-sm text-text-secondary whitespace-nowrap">
              <span className="font-medium text-text-primary">{selectedCount}</span> selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="btn-ghost btn-xs p-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 pr-3 border-r border-border-primary">
            <Calculator className="w-4 h-4 text-oak-primary flex-shrink-0" />
            <span className="text-xs sm:text-sm text-text-secondary whitespace-nowrap">
              Billing: <span className="text-text-primary font-medium">{selectedBillingLabel}</span>
            </span>
          </div>

          {can.deleteCompany && (
            <button
              type="button"
              onClick={() => setBulkDeleteDialogOpen(true)}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors hover:bg-status-error/10 hover:text-status-error text-text-secondary"
              title="Delete selected projects (F2)"
              disabled={bulkDeleteWorkflowProjects.isPending}
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-xs sm:text-sm hidden lg:inline">Delete (F2)</span>
              <span className="text-xs sm:text-sm lg:hidden">Delete</span>
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Project"
        description={
          projectToDelete
            ? `Delete "${projectToDelete.name}" from workflow projects?`
            : undefined
        }
        confirmLabel="Delete Project"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this project..."
        reasonMinLength={10}
        isLoading={deleteWorkflowProject.isPending}
      />

      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        onClose={() => setBulkDeleteDialogOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
        title={`Delete ${selectedCount} ${selectedCount === 1 ? 'Project' : 'Projects'}`}
        description="This will remove the selected workflow projects."
        confirmLabel={`Delete ${selectedCount} ${selectedCount === 1 ? 'Project' : 'Projects'}`}
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting these projects..."
        reasonMinLength={10}
        isLoading={bulkDeleteWorkflowProjects.isPending}
      />
    </div>
  );
}
