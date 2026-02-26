'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type WorkflowProjectStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'AT_RISK'
  | 'ON_HOLD'
  | 'COMPLETED';

export type WorkflowDueBucket = 'today' | 'thisWeek' | 'nextWeek' | 'overdue';

export type WorkflowProjectSortField =
  | 'projectName'
  | 'clientName'
  | 'templateName'
  | 'status'
  | 'progress'
  | 'teamTaskCount'
  | 'clientTaskCount'
  | 'startDate'
  | 'nextTaskDueDate'
  | 'dueDate';

export interface WorkflowProject {
  id: string;
  companyId: string;
  name: string;
  clientName: string;
  templateName: string;
  billingAmount: number;
  billingCurrency: string;
  status: WorkflowProjectStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assignees: string[];
  teamTaskCount: number;
  clientTaskCount: number;
  completedTaskCount: number;
  totalTaskCount: number;
  startDate: string;
  nextTaskDueDate?: string | null;
  dueDate: string;
  recurrenceMonths: number | null;
}

export interface WorkflowProjectSearchParams {
  query?: string;
  page?: number;
  limit?: number;
  sortBy?: WorkflowProjectSortField;
  sortOrder?: 'asc' | 'desc';
  dueBucket?: WorkflowDueBucket;
  status?: WorkflowProjectStatus;
  projectName?: string;
  clientName?: string;
  templateName?: string;
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

export interface WorkflowProjectStats {
  total: number;
  dueToday: number;
  dueThisWeek: number;
  dueNextWeek: number;
  overdue: number;
  inProgress: number;
  completed: number;
}

export interface WorkflowProjectSearchResult {
  projects: WorkflowProject[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: WorkflowProjectStats;
  projectOptions: string[];
  clientOptions: string[];
  templateOptions: string[];
  assigneeOptions: string[];
}

export interface CreateWorkflowProjectPayload {
  companyId: string;
  name: string;
  startDate: string;
  dueDate: string;
  recurrenceMonths: number | null;
}

interface WorkflowProjectMutationResult {
  id: string;
}

export const WORKFLOW_PROJECT_STATUS_LABELS: Record<WorkflowProjectStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  AT_RISK: 'At Risk',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
};

export function getWorkflowProjectProgress(project: WorkflowProject): number {
  if (!project.totalTaskCount) return 0;
  return Math.max(0, Math.min(100, Math.round((project.completedTaskCount / project.totalTaskCount) * 100)));
}

async function fetchWorkflowProjects(params: WorkflowProjectSearchParams): Promise<WorkflowProjectSearchResult> {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set('q', params.query);

  Object.entries(params).forEach(([key, value]) => {
    if (key === 'query') return;
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(`/api/workflow/projects?${searchParams.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || 'Failed to fetch workflow projects');
  }

  return response.json();
}

async function createWorkflowProject(payload: CreateWorkflowProjectPayload): Promise<WorkflowProjectMutationResult> {
  const response = await fetch('/api/workflow/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || 'Failed to create workflow project');
  }

  return response.json();
}

async function deleteWorkflowProject(id: string, reason: string): Promise<void> {
  const response = await fetch(`/api/workflow/projects/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || 'Failed to delete workflow project');
  }
}

export function useWorkflowProjects(params: WorkflowProjectSearchParams = {}) {
  return useQuery({
    queryKey: ['workflow-projects', params],
    queryFn: () => fetchWorkflowProjects(params),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateWorkflowProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateWorkflowProjectPayload) => createWorkflowProject(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
    },
  });
}

export function useDeleteWorkflowProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => deleteWorkflowProject(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-project-detail', variables.id] });
    },
  });
}

export function useBulkDeleteWorkflowProjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
      const failures: string[] = [];

      for (const id of uniqueIds) {
        try {
          await deleteWorkflowProject(id, reason);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `Failed to delete project ${id}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(failures[0]);
      }

      return {
        deleted: uniqueIds.length,
        message: `Deleted ${uniqueIds.length} workflow project${uniqueIds.length === 1 ? '' : 's'}`,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
    },
  });
}
