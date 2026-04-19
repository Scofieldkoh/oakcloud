'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkflowProjectStatus } from '@/hooks/use-workflow-projects';

export type WorkflowTaskLane = 'TEAM' | 'CLIENT' | 'CUSTOM';
export type WorkflowTaskStatus = 'TODO' | 'IN_PROGRESS' | 'WAITING_CLIENT' | 'DONE' | 'SKIPPED';
export type WorkflowTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface WorkflowTaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface WorkflowTaskAttachment {
  id: string;
  processingDocumentId: string;
  documentId: string;
  fileName: string;
  linkedAt: string;
  linkedScope?: 'PROJECT' | 'TASK';
  linkedTaskId?: string | null;
  companyName?: string | null;
  pipelineStatus?: string | null;
  revisionStatus?: string | null;
  duplicateStatus?: string | null;
  documentCategory?: string | null;
  documentSubCategory?: string | null;
  vendorName?: string | null;
  documentNumber?: string | null;
  documentDate?: string | null;
  currency?: string | null;
  subtotal?: string | null;
  taxAmount?: string | null;
  totalAmount?: string | null;
  homeCurrency?: string | null;
  homeSubtotal?: string | null;
  homeTaxAmount?: string | null;
  homeEquivalent?: string | null;
  uploadedAt?: string | null;
}

export interface WorkflowAutomationRule {
  id: string;
  name: string;
  condition: 'TASK_DONE' | 'TASK_SKIPPED';
  action: 'CREATE_FOLLOW_UP';
  targetGroupId: string;
  followUpTitleTemplate: string;
  enabled: boolean;
}

export interface WorkflowProjectTask {
  id: string;
  title: string;
  lane: WorkflowTaskLane;
  status: WorkflowTaskStatus;
  priority: WorkflowTaskPriority;
  dueDate: string | null;
  assignee: string | null;
  description: string;
  subtasks: WorkflowTaskSubtask[];
  attachments: WorkflowTaskAttachment[];
}

export interface WorkflowTaskGroup {
  id: string;
  lane: WorkflowTaskLane;
  title: string;
  tasks: WorkflowProjectTask[];
  automations: WorkflowAutomationRule[];
}

export interface WorkflowProjectResource {
  id: string;
  title: string;
  href: string;
}

export type WorkflowProjectBillingMode = 'FIXED' | 'TIERED';
export type WorkflowProjectBillingStatus = 'PENDING' | 'TO_BE_BILLED' | 'BILLED';
export type WorkflowProjectReferralFeeType = 'AMOUNT' | 'PERCENTAGE';
export type WorkflowProjectStatusOverride = 'AT_RISK' | 'ON_HOLD';

export interface WorkflowProjectBillingTier {
  upTo: number | null;
  unitPrice: number;
}

export interface WorkflowProjectBillingConfig {
  mode: WorkflowProjectBillingMode;
  currency: string;
  fixedPrice: number | null;
  disbursementAmount: number | null;
  referralFeeAmount: number | null;
  referralFeeType: WorkflowProjectReferralFeeType;
  referralFeeRecurringLimit: number | null;
  referralPayee: string;
  referralPayeeContactId: string | null;
  tiers: WorkflowProjectBillingTier[];
}

export interface WorkflowProjectWorkspaceState {
  groups: WorkflowTaskGroup[];
  projectAttachments: WorkflowTaskAttachment[];
  billingQuantity: number | null;
  billingStatus: WorkflowProjectBillingStatus | null;
  projectStatusOverride: WorkflowProjectStatusOverride | null;
  projectNotes: string;
}

export interface WorkflowProjectWorkspaceStateInput {
  groups?: WorkflowTaskGroup[];
  projectAttachments?: WorkflowTaskAttachment[];
  billingQuantity?: number | null;
  billingStatus?: WorkflowProjectBillingStatus | null;
  projectStatusOverride?: WorkflowProjectStatusOverride | null;
  projectNotes?: string;
}

export interface WorkflowProjectDetail {
  id: string;
  name: string;
  clientName: string;
  templateName: string;
  status: WorkflowProjectStatus;
  statusLabel: string;
  priority: WorkflowTaskPriority;
  assignees: string[];
  startDate: string;
  dueDate: string;
  recurrenceMonths: number | null;
  instanceNumber: number;
  instanceCount: number;
  nextTaskDueDate: string | null;
  tags: string[];
  billingLabel: string;
  billingConfig: WorkflowProjectBillingConfig;
  projectAttachments: WorkflowTaskAttachment[];
  billingQuantity: number | null;
  billingStatus: WorkflowProjectBillingStatus | null;
  projectStatusOverride: WorkflowProjectStatusOverride | null;
  projectNotes: string;
  budgetHours: number;
  resources: WorkflowProjectResource[];
  groups: WorkflowTaskGroup[];
  companySnapshot: {
    name: string;
    companyType: string;
    financialYearEnd: string;
    pocContact: string;
  };
}

export const WORKFLOW_TASK_STATUS_LABELS: Record<WorkflowTaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  WAITING_CLIENT: 'Waiting Client',
  DONE: 'Done',
  SKIPPED: 'Skipped',
};

const TASK_STATUS_ORDER: WorkflowTaskStatus[] = ['TODO', 'IN_PROGRESS', 'WAITING_CLIENT', 'DONE', 'SKIPPED'];

async function fetchWorkflowProjectDetail(projectId: string): Promise<WorkflowProjectDetail> {
  const response = await fetch(`/api/workflow/projects/${projectId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || 'Failed to fetch workflow project detail');
  }

  return response.json();
}

export interface UpdateWorkflowProjectPayload {
  name: string;
  startDate: string;
  dueDate: string;
  recurrenceMonths: number | null;
  billingConfig?: WorkflowProjectBillingConfig;
  workspaceState?: WorkflowProjectWorkspaceStateInput;
}

async function patchWorkflowProjectDetail(
  projectId: string,
  payload: UpdateWorkflowProjectPayload
): Promise<WorkflowProjectDetail> {
  const response = await fetch(`/api/workflow/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(error?.error || 'Failed to update workflow project');
  }

  return response.json();
}

export function useWorkflowProjectDetail(projectId: string) {
  return useQuery({
    queryKey: ['workflow-project-detail', projectId],
    queryFn: () => fetchWorkflowProjectDetail(projectId),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useUpdateWorkflowProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateWorkflowProjectPayload) => patchWorkflowProjectDetail(projectId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['workflow-project-detail', projectId], data);
      queryClient.invalidateQueries({ queryKey: ['workflow-projects'] });
    },
  });
}

export function rankTaskStatus(status: WorkflowTaskStatus): number {
  return TASK_STATUS_ORDER.indexOf(status);
}
