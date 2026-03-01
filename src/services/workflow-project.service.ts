import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma';
import { randomUUID } from 'crypto';
import type {
  ClientRequestStatus,
  DocumentCategory,
  DuplicateStatus,
  PipelineStatus,
  RequestPriority,
  RevisionStatus,
} from '@/generated/prisma';

export type WorkflowProjectStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'AT_RISK' | 'ON_HOLD' | 'COMPLETED';
export type WorkflowDueBucket = 'today' | 'thisWeek' | 'nextWeek' | 'overdue';
export type WorkflowProjectSortField =
  | 'projectName'
  | 'clientName'
  | 'templateName'
  | 'status'
  | 'progress'
  | 'nextTaskName'
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
  nextTaskName: string | null;
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

export interface WorkflowProjectBillingTier {
  upTo: number | null;
  unitPrice: number;
}

export interface WorkflowProjectBillingConfig {
  mode: WorkflowProjectBillingMode;
  currency: string;
  fixedPrice: number | null;
  tiers: WorkflowProjectBillingTier[];
}

export interface WorkflowProjectWorkspaceState {
  groups: WorkflowTaskGroup[];
  projectAttachments: WorkflowTaskAttachment[];
  billingQuantity: number | null;
  billingStatus: WorkflowProjectBillingStatus | null;
  projectStatusOverride: 'AT_RISK' | 'ON_HOLD' | null;
  projectNotes: string;
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
  nextTaskDueDate: string | null;
  tags: string[];
  billingLabel: string;
  billingConfig: WorkflowProjectBillingConfig;
  projectAttachments: WorkflowTaskAttachment[];
  billingQuantity: number | null;
  billingStatus: WorkflowProjectBillingStatus | null;
  projectStatusOverride: 'AT_RISK' | 'ON_HOLD' | null;
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

export interface WorkflowProjectScope {
  tenantId?: string | null;
  companyIds?: string[];
  skipTenantFilter?: boolean;
}

export interface UpdateWorkflowProjectSettingsInput {
  name: string;
  startDate: string;
  dueDate: string;
  recurrenceMonths: number | null;
  billingConfig?: WorkflowProjectBillingConfig;
  workspaceState?: {
    groups?: unknown;
    projectAttachments?: unknown;
    billingQuantity?: number | null;
    billingStatus?: WorkflowProjectBillingStatus | null;
    projectStatusOverride?: 'AT_RISK' | 'ON_HOLD' | null;
    projectNotes?: string;
  };
}

export interface CreateWorkflowProjectInput {
  companyId: string;
  name: string;
  startDate: string;
  dueDate: string;
  recurrenceMonths: number | null;
}

interface WorkflowProjectSetting {
  companyId: string;
  tenantId: string;
  projectName: string | null;
  startDate: string | null;
  dueDate: string | null;
  recurrenceMonths: number | null;
  billingMode: string | null;
  billingFixedPrice: Prisma.Decimal | number | string | null;
  billingCurrency: string | null;
  billingTieredPricing: unknown;
  workspaceState: unknown;
}

interface WorkflowProjectInstance {
  id: string;
  companyId: string;
  tenantId: string;
  projectName: string;
  startDate: string;
  dueDate: string;
  recurrenceMonths: number | null;
  sourceInstanceId: string | null;
}

interface WorkflowProjectSource {
  id: string;
  projectName: string | null;
  startDate: string | null;
  dueDate: string | null;
  recurrenceMonths: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TEMPLATE_NAME = 'General Workflow';
const WORKFLOW_PROJECT_SETTINGS_TABLE = 'workflow_project_settings';
const WORKFLOW_PROJECT_INSTANCES_TABLE = 'workflow_project_instances';

let workflowProjectSettingsTableReady: Promise<void> | null = null;

const STATUS_LABELS: Record<WorkflowProjectStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  AT_RISK: 'At Risk',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
};

const STATUS_ORDER: Record<WorkflowProjectStatus, number> = {
  AT_RISK: 1,
  IN_PROGRESS: 2,
  NOT_STARTED: 3,
  ON_HOLD: 4,
  COMPLETED: 5,
};

const CATEGORY_LABELS: Partial<Record<DocumentCategory, string>> = {
  ACCOUNTS_PAYABLE: 'Accounts Payable',
  ACCOUNTS_RECEIVABLE: 'Accounts Receivable',
  TREASURY: 'Treasury',
  TAX_COMPLIANCE: 'Tax Compliance',
  PAYROLL: 'Payroll',
  CORPORATE_SECRETARIAL: 'Corporate Secretarial',
  CONTRACTS: 'Contracts',
  FINANCIAL_REPORTS: 'Financial Reports',
  INSURANCE: 'Insurance',
  CORRESPONDENCE: 'Correspondence',
  OTHER: 'General Workflow',
};

function startOfDay(value: Date | string): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonthsIsoDate(value: string, months: number): string {
  const [yearRaw, monthRaw, dayRaw] = value.split('-').map((part) => Number(part));
  const year = Number.isFinite(yearRaw) ? yearRaw : 1970;
  const monthIndex = Number.isFinite(monthRaw) ? monthRaw - 1 : 0;
  const day = Number.isFinite(dayRaw) ? dayRaw : 1;

  const firstOfTargetMonth = new Date(Date.UTC(year, monthIndex + months, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  firstOfTargetMonth.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return firstOfTargetMonth.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  const [yearRaw, monthRaw, dayRaw] = value.split('-').map((part) => Number(part));
  const year = Number.isFinite(yearRaw) ? yearRaw : 1970;
  const month = Number.isFinite(monthRaw) ? monthRaw : 1;
  const day = Number.isFinite(dayRaw) ? dayRaw : 1;
  return new Date(year, Math.max(0, month - 1), day);
}

function formatDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareDateOnly(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function parseDbNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBillingMode(value: string | null | undefined): WorkflowProjectBillingMode | null {
  if (value === 'FIXED' || value === 'TIERED') return value;
  return null;
}

function normalizeProjectStatusOverride(value: unknown): 'AT_RISK' | 'ON_HOLD' | null {
  if (value === 'AT_RISK' || value === 'ON_HOLD') return value;
  return null;
}

function normalizeBillingStatus(value: unknown): WorkflowProjectBillingStatus | null {
  if (value === 'PENDING' || value === 'TO_BE_BILLED' || value === 'BILLED') return value;
  return null;
}

function normalizeBillingCurrency(value: string | null | undefined, fallback: string): string {
  const candidate = value?.trim().toUpperCase();
  if (candidate && /^[A-Z]{3}$/.test(candidate)) return candidate;
  return fallback;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeBillingTiers(value: unknown): WorkflowProjectBillingTier[] {
  if (!Array.isArray(value)) return [];

  const tiers: WorkflowProjectBillingTier[] = [];
  for (const rawTier of value) {
    if (!rawTier || typeof rawTier !== 'object') continue;
    const tier = rawTier as { upTo?: unknown; unitPrice?: unknown };

    const rawUpTo = tier.upTo;
    let upTo: number | null = null;
    if (rawUpTo !== null && rawUpTo !== undefined && rawUpTo !== '') {
      const parsedUpTo = Number(rawUpTo);
      if (!Number.isFinite(parsedUpTo)) continue;
      const normalizedUpTo = Math.floor(parsedUpTo);
      if (normalizedUpTo <= 0) continue;
      upTo = normalizedUpTo;
    }

    const parsedUnitPrice = Number(tier.unitPrice);
    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) continue;

    tiers.push({
      upTo,
      unitPrice: roundMoney(parsedUnitPrice),
    });
  }

  return tiers
    .sort((left, right) => {
      if (left.upTo === null && right.upTo === null) return 0;
      if (left.upTo === null) return 1;
      if (right.upTo === null) return -1;
      return left.upTo - right.upTo;
    })
    .filter((tier, index, arr) => {
      if (tier.upTo === null) {
        return !arr.slice(0, index).some((entry) => entry.upTo === null);
      }

      return !arr.slice(0, index).some((entry) => entry.upTo === tier.upTo);
    });
}

function calculateBillingAmount(
  config: WorkflowProjectBillingConfig,
  quantity: number | null
): number {
  if (config.mode === 'FIXED') {
    const fixedPrice = typeof config.fixedPrice === 'number' && Number.isFinite(config.fixedPrice)
      ? config.fixedPrice
      : 0;
    return roundMoney(Math.max(0, fixedPrice));
  }

  const normalizedQuantity = typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0
    ? quantity
    : 0;

  if (normalizedQuantity === 0 || config.tiers.length === 0) {
    return 0;
  }

  for (const tier of config.tiers) {
    if (tier.upTo === null || normalizedQuantity <= tier.upTo) {
      return roundMoney(normalizedQuantity * tier.unitPrice);
    }
  }

  return 0;
}

function resolveBillingStatus(
  persistedStatus: WorkflowProjectBillingStatus | null,
  billingAmount: number,
  projectStatus: WorkflowProjectStatus
): WorkflowProjectBillingStatus | null {
  if (billingAmount <= 0) {
    return null;
  }

  if (persistedStatus === 'BILLED') {
    return 'BILLED';
  }

  if (projectStatus === 'COMPLETED') {
    return 'TO_BE_BILLED';
  }

  return 'PENDING';
}

function resolveProjectStatus(
  autoStatus: WorkflowProjectStatus,
  statusOverride: 'AT_RISK' | 'ON_HOLD' | null
): WorkflowProjectStatus {
  if (autoStatus === 'COMPLETED') return 'COMPLETED';
  if (statusOverride) return statusOverride;
  return autoStatus;
}

function summarizeWorkspaceTasks(groups: WorkflowTaskGroup[]): {
  total: number;
  resolved: number;
  team: number;
  client: number;
} | null {
  if (groups.length === 0) return null;

  let total = 0;
  let resolved = 0;
  let team = 0;
  let client = 0;

  for (const group of groups) {
    for (const task of group.tasks) {
      total += 1;
      if (task.lane === 'TEAM') team += 1;
      if (task.lane === 'CLIENT') client += 1;
      if (task.status === 'DONE' || task.status === 'SKIPPED') {
        resolved += 1;
      }
    }
  }

  return { total, resolved, team, client };
}

function deriveAutoProjectStatusFromWorkspace(groups: WorkflowTaskGroup[]): WorkflowProjectStatus | null {
  const summary = summarizeWorkspaceTasks(groups);
  if (!summary) return null;
  if (summary.total === 0) return 'NOT_STARTED';
  if (summary.resolved >= summary.total) return 'COMPLETED';
  if (summary.resolved > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

function getNextOutstandingTask(groups: WorkflowTaskGroup[]): {
  name: string | null;
  dueDate: string | null;
} {
  for (const group of groups) {
    for (const task of group.tasks) {
      if (task.status === 'DONE' || task.status === 'SKIPPED') continue;
      const normalizedName = task.title.trim();
      return {
        name: normalizedName.length > 0 ? normalizedName : null,
        dueDate: task.dueDate ?? null,
      };
    }
  }

  return { name: null, dueDate: null };
}

function resolveBillingConfig(
  setting: WorkflowProjectSetting | undefined,
  defaults: {
    defaultCurrency: string;
    defaultFixedPrice: number;
  }
): WorkflowProjectBillingConfig {
  const mode = normalizeBillingMode(setting?.billingMode) ?? 'FIXED';
  const currency = normalizeBillingCurrency(setting?.billingCurrency, defaults.defaultCurrency);
  const fixedPriceCandidate = parseDbNumber(setting?.billingFixedPrice);
  const fixedPrice = fixedPriceCandidate !== null && fixedPriceCandidate >= 0
    ? roundMoney(fixedPriceCandidate)
    : roundMoney(defaults.defaultFixedPrice);
  const tiers = normalizeBillingTiers(setting?.billingTieredPricing);

  return {
    mode,
    currency,
    fixedPrice,
    tiers,
  };
}

function normalizeBillingConfigInput(
  input: WorkflowProjectBillingConfig,
  defaults: {
    defaultCurrency: string;
    defaultFixedPrice: number;
  }
): WorkflowProjectBillingConfig {
  const mode: WorkflowProjectBillingMode = input.mode === 'TIERED' ? 'TIERED' : 'FIXED';
  const currency = normalizeBillingCurrency(input.currency, defaults.defaultCurrency);
  const parsedFixedPrice = input.fixedPrice;
  const fixedPrice = typeof parsedFixedPrice === 'number' && Number.isFinite(parsedFixedPrice) && parsedFixedPrice >= 0
    ? roundMoney(parsedFixedPrice)
    : roundMoney(defaults.defaultFixedPrice);
  const tiers = normalizeBillingTiers(input.tiers);

  return {
    mode,
    currency,
    fixedPrice,
    tiers,
  };
}

function normalizeWorkspaceState(
  value: unknown,
  defaults: WorkflowProjectWorkspaceState
): WorkflowProjectWorkspaceState {
  if (!value || typeof value !== 'object') return defaults;

  const candidate = value as Record<string, unknown>;

  const groups = Array.isArray(candidate.groups)
    ? candidate.groups as WorkflowTaskGroup[]
    : defaults.groups;
  const projectAttachments = Array.isArray(candidate.projectAttachments)
    ? candidate.projectAttachments as WorkflowTaskAttachment[]
    : defaults.projectAttachments;

  let billingQuantity = defaults.billingQuantity;
  if (candidate.billingQuantity === null) {
    billingQuantity = null;
  } else if (typeof candidate.billingQuantity === 'number'
    && Number.isInteger(candidate.billingQuantity)
    && candidate.billingQuantity >= 0) {
    billingQuantity = candidate.billingQuantity;
  }

  let billingStatus = defaults.billingStatus;
  if (candidate.billingStatus === null) {
    billingStatus = null;
  } else {
    const normalizedBillingStatus = normalizeBillingStatus(candidate.billingStatus);
    if (normalizedBillingStatus) {
      billingStatus = normalizedBillingStatus;
    }
  }

  let projectStatusOverride = defaults.projectStatusOverride;
  if (candidate.projectStatusOverride === null) {
    projectStatusOverride = null;
  } else {
    const normalizedProjectStatusOverride = normalizeProjectStatusOverride(candidate.projectStatusOverride);
    if (normalizedProjectStatusOverride) {
      projectStatusOverride = normalizedProjectStatusOverride;
    }
  }

  const projectNotes = typeof candidate.projectNotes === 'string'
    ? candidate.projectNotes
    : defaults.projectNotes;

  return {
    groups,
    projectAttachments,
    billingQuantity,
    billingStatus,
    projectStatusOverride,
    projectNotes,
  };
}

function projectProgress(project: WorkflowProject): number {
  if (!project.totalTaskCount) return 0;
  return Math.round((project.completedTaskCount / project.totalTaskCount) * 100);
}

function dueBucket(project: WorkflowProject, today: Date): WorkflowDueBucket | null {
  if (project.status === 'COMPLETED') return null;
  const delta = Math.round((startOfDay(project.dueDate).getTime() - today.getTime()) / MS_PER_DAY);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 7) return 'thisWeek';
  if (delta <= 14) return 'nextWeek';
  return null;
}

function inDateRange(dateValue: string, from?: string, to?: string): boolean {
  const value = startOfDay(dateValue).getTime();
  if (from && value < startOfDay(from).getTime()) return false;
  if (to && value > startOfDay(to).getTime()) return false;
  return true;
}

function inNumberRange(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function compareDateOpt(a?: string | null, b?: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return startOfDay(a).getTime() - startOfDay(b).getTime();
}

function compareProjects(a: WorkflowProject, b: WorkflowProject, sortBy: WorkflowProjectSortField): number {
  switch (sortBy) {
    case 'projectName':
      return a.name.localeCompare(b.name);
    case 'clientName':
      return a.clientName.localeCompare(b.clientName);
    case 'templateName':
      return a.templateName.localeCompare(b.templateName);
    case 'status':
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case 'progress':
      return projectProgress(a) - projectProgress(b);
    case 'nextTaskName':
      return (a.nextTaskName ?? '').localeCompare(b.nextTaskName ?? '');
    case 'startDate':
      return startOfDay(a.startDate).getTime() - startOfDay(b.startDate).getTime();
    case 'nextTaskDueDate':
      return compareDateOpt(a.nextTaskDueDate, b.nextTaskDueDate);
    case 'dueDate':
    default:
      return startOfDay(a.dueDate).getTime() - startOfDay(b.dueDate).getTime();
  }
}

function buildCompanyWhere(scope: WorkflowProjectScope) {
  const andConditions: Array<Record<string, unknown>> = [{ deletedAt: null }];

  if (!scope.skipTenantFilter && scope.tenantId) {
    andConditions.push({ tenantId: scope.tenantId });
  }

  if (scope.companyIds && scope.companyIds.length > 0) {
    andConditions.push({ id: { in: scope.companyIds } });
  }

  return andConditions.length === 1 ? andConditions[0] : { AND: andConditions };
}

function toTitleCaseEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatFye(month: number | null, day: number | null): string {
  if (!month || !day) return '-';
  return new Date(2000, month - 1, day).toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
}

function requestPriority(priority: RequestPriority): WorkflowTaskPriority {
  if (priority === 'PRIORITY_HIGH' || priority === 'PRIORITY_URGENT') return 'HIGH';
  if (priority === 'PRIORITY_LOW') return 'LOW';
  return 'MEDIUM';
}

function requestTaskStatus(status: ClientRequestStatus): WorkflowTaskStatus {
  if (status === 'REQUEST_RESOLVED') return 'DONE';
  if (status === 'REQUEST_CANCELLED') return 'SKIPPED';
  if (status === 'REQUEST_WAITING_CLIENT') return 'WAITING_CLIENT';
  if (status === 'REQUEST_IN_PROGRESS') return 'IN_PROGRESS';
  return 'TODO';
}

function docDone(pipelineStatus: PipelineStatus, revisionStatus: RevisionStatus | null | undefined): boolean {
  return revisionStatus === 'APPROVED' || pipelineStatus === 'EXTRACTION_DONE';
}

function docFailure(pipelineStatus: PipelineStatus): boolean {
  return pipelineStatus === 'FAILED_RETRYABLE' || pipelineStatus === 'FAILED_PERMANENT' || pipelineStatus === 'DEAD_LETTER';
}

function docDueDate(item: {
  slaDeadline: Date | null;
  createdAt: Date;
  currentRevision: { documentDate: Date | null } | null;
}): Date {
  if (item.slaDeadline) return item.slaDeadline;
  if (item.currentRevision?.documentDate) return addDays(item.currentRevision.documentDate, 3);
  return addDays(item.createdAt, 7);
}

function docTaskStatus(pipelineStatus: PipelineStatus, revisionStatus: RevisionStatus | null | undefined): WorkflowTaskStatus {
  if (docDone(pipelineStatus, revisionStatus)) return 'DONE';
  if (pipelineStatus === 'PROCESSING' || pipelineStatus === 'SPLIT_PENDING' || pipelineStatus === 'SPLIT_DONE') {
    return 'IN_PROGRESS';
  }
  if (pipelineStatus === 'FAILED_PERMANENT' || pipelineStatus === 'DEAD_LETTER') return 'WAITING_CLIENT';
  if (pipelineStatus === 'FAILED_RETRYABLE') return 'IN_PROGRESS';
  return 'TODO';
}

function docTaskPriority(pipelineStatus: PipelineStatus, duplicateStatus: DuplicateStatus): WorkflowTaskPriority {
  if (docFailure(pipelineStatus) || duplicateStatus === 'SUSPECTED' || duplicateStatus === 'CONFIRMED') return 'HIGH';
  if (pipelineStatus === 'PROCESSING' || pipelineStatus === 'SPLIT_PENDING' || pipelineStatus === 'SPLIT_DONE') return 'MEDIUM';
  return 'LOW';
}

async function ensureWorkflowProjectStorageTables(): Promise<void> {
  if (!workflowProjectSettingsTableReady) {
    workflowProjectSettingsTableReady = (async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS workflow_project_settings (
          company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          project_name TEXT,
          start_date DATE,
          due_date DATE,
          recurrence_months INTEGER,
          billing_mode TEXT,
          billing_fixed_price NUMERIC(18,2),
          billing_currency TEXT,
          billing_tiered_pricing JSONB,
          workspace_state JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT workflow_project_settings_recurrence_positive
            CHECK (recurrence_months IS NULL OR recurrence_months > 0)
        )
      `;

      await prisma.$executeRaw`
        ALTER TABLE workflow_project_settings
        ADD COLUMN IF NOT EXISTS billing_mode TEXT
      `;

      await prisma.$executeRaw`
        ALTER TABLE workflow_project_settings
        ADD COLUMN IF NOT EXISTS billing_fixed_price NUMERIC(18,2)
      `;

      await prisma.$executeRaw`
        ALTER TABLE workflow_project_settings
        ADD COLUMN IF NOT EXISTS billing_currency TEXT
      `;

      await prisma.$executeRaw`
        ALTER TABLE workflow_project_settings
        ADD COLUMN IF NOT EXISTS billing_tiered_pricing JSONB
      `;

      await prisma.$executeRaw`
        ALTER TABLE workflow_project_settings
        ADD COLUMN IF NOT EXISTS workspace_state JSONB
      `;

      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS workflow_project_instances (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          project_name TEXT NOT NULL,
          start_date DATE NOT NULL,
          due_date DATE NOT NULL,
          recurrence_months INTEGER,
          source_instance_id TEXT REFERENCES workflow_project_instances(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT workflow_project_instances_recurrence_positive
            CHECK (recurrence_months IS NULL OR recurrence_months > 0),
          CONSTRAINT workflow_project_instances_due_after_start
            CHECK (due_date >= start_date)
        )
      `;

      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS workflow_project_instances_company_window_key
        ON workflow_project_instances (company_id, start_date, due_date)
      `;
    })()
      .catch((error) => {
        workflowProjectSettingsTableReady = null;
        throw error;
      });
  }

  await workflowProjectSettingsTableReady;
}

async function getWorkflowProjectSettingsMap(
  companyIds: string[],
  scope: WorkflowProjectScope
): Promise<Map<string, WorkflowProjectSetting>> {
  if (companyIds.length === 0) return new Map();

  await ensureWorkflowProjectStorageTables();

  const tenantFilter = !scope.skipTenantFilter && scope.tenantId
    ? Prisma.sql`AND tenant_id = ${scope.tenantId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<WorkflowProjectSetting[]>(Prisma.sql`
    SELECT
      company_id AS "companyId",
      tenant_id AS "tenantId",
      project_name AS "projectName",
      start_date::text AS "startDate",
      due_date::text AS "dueDate",
      recurrence_months AS "recurrenceMonths",
      billing_mode AS "billingMode",
      billing_fixed_price AS "billingFixedPrice",
      billing_currency AS "billingCurrency",
      billing_tiered_pricing AS "billingTieredPricing",
      workspace_state AS "workspaceState"
    FROM ${Prisma.raw(WORKFLOW_PROJECT_SETTINGS_TABLE)}
    WHERE company_id IN (${Prisma.join(companyIds)})
    ${tenantFilter}
  `);

  const map = new Map<string, WorkflowProjectSetting>();
  for (const row of rows) {
    map.set(row.companyId, row);
  }

  return map;
}

function sortProjectInstances(instances: WorkflowProjectInstance[]): WorkflowProjectInstance[] {
  return [...instances].sort((a, b) => {
    const dueComparison = compareDateOnly(a.dueDate, b.dueDate);
    if (dueComparison !== 0) return dueComparison;
    const startComparison = compareDateOnly(a.startDate, b.startDate);
    if (startComparison !== 0) return startComparison;
    return a.id.localeCompare(b.id);
  });
}

function pickCurrentProjectInstance(instances: WorkflowProjectInstance[]): WorkflowProjectInstance | null {
  if (instances.length === 0) return null;

  const today = formatDateOnly(startOfDay(new Date()));
  const sorted = sortProjectInstances(instances);
  const active = sorted.find((instance) => compareDateOnly(instance.dueDate, today) >= 0);
  if (active) return active;
  return sorted[sorted.length - 1];
}

async function getWorkflowProjectInstancesMap(
  companyIds: string[],
  scope: WorkflowProjectScope
): Promise<Map<string, WorkflowProjectInstance[]>> {
  const map = new Map<string, WorkflowProjectInstance[]>();
  for (const companyId of companyIds) {
    map.set(companyId, []);
  }

  if (companyIds.length === 0) return map;

  await ensureWorkflowProjectStorageTables();

  const tenantFilter = !scope.skipTenantFilter && scope.tenantId
    ? Prisma.sql`AND tenant_id = ${scope.tenantId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<WorkflowProjectInstance[]>(Prisma.sql`
    SELECT
      id::text AS "id",
      company_id AS "companyId",
      tenant_id AS "tenantId",
      project_name AS "projectName",
      start_date::text AS "startDate",
      due_date::text AS "dueDate",
      recurrence_months AS "recurrenceMonths",
      source_instance_id::text AS "sourceInstanceId"
    FROM ${Prisma.raw(WORKFLOW_PROJECT_INSTANCES_TABLE)}
    WHERE company_id IN (${Prisma.join(companyIds)})
    ${tenantFilter}
    ORDER BY company_id, start_date, due_date, created_at
  `);

  for (const row of rows) {
    if (scope.companyIds && !scope.companyIds.includes(row.companyId)) continue;
    const instances = map.get(row.companyId) ?? [];
    instances.push(row);
    map.set(row.companyId, instances);
  }

  return map;
}

async function upsertProjectInstance(instance: WorkflowProjectInstance): Promise<WorkflowProjectInstance> {
  const rows = await prisma.$queryRaw<WorkflowProjectInstance[]>(Prisma.sql`
    INSERT INTO workflow_project_instances (
      id,
      company_id,
      tenant_id,
      project_name,
      start_date,
      due_date,
      recurrence_months,
      source_instance_id,
      created_at,
      updated_at
    )
    VALUES (
      ${instance.id},
      ${instance.companyId},
      ${instance.tenantId},
      ${instance.projectName},
      ${instance.startDate},
      ${instance.dueDate},
      ${instance.recurrenceMonths},
      ${instance.sourceInstanceId},
      NOW(),
      NOW()
    )
    ON CONFLICT (company_id, start_date, due_date)
    DO UPDATE SET updated_at = workflow_project_instances.updated_at
    RETURNING
      id::text AS "id",
      company_id AS "companyId",
      tenant_id AS "tenantId",
      project_name AS "projectName",
      start_date::text AS "startDate",
      due_date::text AS "dueDate",
      recurrence_months AS "recurrenceMonths",
      source_instance_id::text AS "sourceInstanceId"
  `);

  return rows[0];
}

async function cloneRecurringProjectInstances(
  instancesByCompany: Map<string, WorkflowProjectInstance[]>,
  settingsByCompany: Map<string, WorkflowProjectSetting>
): Promise<void> {
  const today = formatDateOnly(startOfDay(new Date()));

  for (const [companyId, currentInstances] of instancesByCompany.entries()) {
    if (currentInstances.length === 0) continue;

    const sorted = sortProjectInstances(currentInstances);
    let latest = sorted[sorted.length - 1];
    let recurrenceMonths = latest.recurrenceMonths ?? settingsByCompany.get(companyId)?.recurrenceMonths ?? null;
    if (!recurrenceMonths || recurrenceMonths < 1) continue;

    const existingWindows = new Set(sorted.map((instance) => `${instance.startDate}|${instance.dueDate}`));
    let guard = 0;

    while (guard < 240) {
      const nextStartDate = addMonthsIsoDate(latest.startDate, recurrenceMonths);
      if (compareDateOnly(nextStartDate, today) > 0) break;
      const nextDueDate = addMonthsIsoDate(latest.dueDate, recurrenceMonths);
      const nextWindowKey = `${nextStartDate}|${nextDueDate}`;

      if (existingWindows.has(nextWindowKey)) {
        const matchingInstance = sorted.find(
          (instance) => instance.startDate === nextStartDate && instance.dueDate === nextDueDate
        );
        if (!matchingInstance) break;
        latest = matchingInstance;
        recurrenceMonths = latest.recurrenceMonths ?? recurrenceMonths;
        guard += 1;
        continue;
      }

      const clonedInstance: WorkflowProjectInstance = {
        id: randomUUID(),
        companyId: latest.companyId,
        tenantId: latest.tenantId,
        projectName: latest.projectName,
        startDate: nextStartDate,
        dueDate: nextDueDate,
        recurrenceMonths,
        sourceInstanceId: latest.id,
      };

      const persistedInstance = await upsertProjectInstance(clonedInstance);
      sorted.push(persistedInstance);
      existingWindows.add(nextWindowKey);
      latest = persistedInstance;
      guard += 1;
    }

    instancesByCompany.set(companyId, sortProjectInstances(sorted));
  }
}

function sourceFromInstance(instance: WorkflowProjectInstance): WorkflowProjectSource {
  return {
    id: instance.id,
    projectName: instance.projectName,
    startDate: instance.startDate,
    dueDate: instance.dueDate,
    recurrenceMonths: instance.recurrenceMonths,
  };
}

async function fetchDataset(scope: WorkflowProjectScope) {
  const companies = await prisma.company.findMany({
    where: buildCompanyWhere(scope),
    select: {
      id: true,
      tenantId: true,
      name: true,
      homeCurrency: true,
      entityType: true,
      createdAt: true,
      nextArDueDate: true,
      accountsDueDate: true,
      financialYearEndMonth: true,
      financialYearEndDay: true,
      userAssignments: {
        where: { user: { isActive: true, deletedAt: null } },
        select: { user: { select: { firstName: true, lastName: true } } },
      },
      contactDetails: {
        where: { isPoc: true, deletedAt: null, contact: { deletedAt: null } },
        select: { contact: { select: { fullName: true } } },
        take: 1,
      },
    },
  });

  const companyIds = companies.map((c) => c.id);
  if (companyIds.length === 0) {
    return {
      companies,
      requestsByCompany: new Map<string, Awaited<ReturnType<typeof fetchRequests>>[number][]>(),
      docsByCompany: new Map<string, Awaited<ReturnType<typeof fetchDocs>>[number][]>(),
    };
  }

  const [requests, docs] = await Promise.all([fetchRequests(companyIds), fetchDocs(companyIds)]);

  const requestsByCompany = requests.reduce<Map<string, typeof requests>>((map, item) => {
    const list = map.get(item.companyId) ?? [];
    list.push(item);
    map.set(item.companyId, list);
    return map;
  }, new Map());

  const docsByCompany = docs.reduce<Map<string, typeof docs>>((map, item) => {
    const companyId = item.document.companyId;
    if (!companyId) return map;
    const list = map.get(companyId) ?? [];
    list.push(item);
    map.set(companyId, list);
    return map;
  }, new Map());

  return { companies, requestsByCompany, docsByCompany };
}

async function fetchRequests(companyIds: string[]) {
  return prisma.clientRequest.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      id: true,
      companyId: true,
      title: true,
      description: true,
      dueDate: true,
      status: true,
      priority: true,
      createdAt: true,
      _count: { select: { communications: true } },
    },
  });
}

async function fetchDocs(companyIds: string[]) {
  return prisma.processingDocument.findMany({
    where: {
      isContainer: false,
      deletedAt: null,
      document: { companyId: { in: companyIds }, deletedAt: null },
    },
    select: {
      id: true,
      documentId: true,
      createdAt: true,
      pipelineStatus: true,
      duplicateStatus: true,
      slaDeadline: true,
      currentRevision: {
        select: {
          status: true,
          documentCategory: true,
          documentSubCategory: true,
          documentNumber: true,
          vendorName: true,
          documentDate: true,
          currency: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          homeCurrency: true,
          homeSubtotal: true,
          homeTaxAmount: true,
          homeEquivalent: true,
        },
      },
      document: {
        select: {
          companyId: true,
          fileName: true,
          originalFileName: true,
          company: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
}

function parseDecimal(
  value: { toString(): string } | number | string | null | undefined
): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function billingTotalsByCurrency(docs: Awaited<ReturnType<typeof fetchDocs>>): Map<string, number> {
  const totals = new Map<string, number>();

  for (const doc of docs) {
    const revision = doc.currentRevision;
    if (!revision) continue;

    if (revision.homeCurrency && revision.homeEquivalent !== null) {
      const currency = revision.homeCurrency;
      totals.set(currency, (totals.get(currency) ?? 0) + parseDecimal(revision.homeEquivalent));
      continue;
    }

    if (revision.currency) {
      const currency = revision.currency;
      totals.set(currency, (totals.get(currency) ?? 0) + parseDecimal(revision.totalAmount));
    }
  }

  return totals;
}

function buildProject(params: {
  company: Awaited<ReturnType<typeof fetchDataset>>['companies'][number];
  requests: Awaited<ReturnType<typeof fetchRequests>>;
  docs: Awaited<ReturnType<typeof fetchDocs>>;
  source?: WorkflowProjectSource;
}): WorkflowProject {
  const assignees = uniqueSorted(
    params.company.userAssignments
      .map((assignment) => `${assignment.user.firstName} ${assignment.user.lastName}`.trim())
      .filter((name) => name.length > 0)
  );

  const openRequests = params.requests.filter((r) => r.status !== 'REQUEST_RESOLVED' && r.status !== 'REQUEST_CANCELLED');
  const completedClient = params.requests.length - openRequests.length;
  const completedTeam = params.docs.filter((d) => docDone(d.pipelineStatus, d.currentRevision?.status)).length;

  const teamTaskCount = params.docs.length;
  const clientTaskCount = params.requests.length;
  const completedTaskCount = completedClient + completedTeam;
  const totalTaskCount = teamTaskCount + clientTaskCount;
  const outstandingTaskCount = (teamTaskCount - completedTeam) + openRequests.length;

  const startDates = [
    params.company.createdAt,
    ...params.requests.map((r) => r.createdAt),
    ...params.docs.map((d) => d.createdAt),
  ];
  const startDate = new Date(Math.min(...startDates.map((d) => d.getTime())));

  const requestDue = openRequests.map((r) => r.dueDate).filter((d): d is Date => Boolean(d));
  const docDue = params.docs
    .filter((d) => !docDone(d.pipelineStatus, d.currentRevision?.status))
    .map((d) => docDueDate(d));

  const nextTaskDue = [...requestDue, ...docDue];
  const nextTaskDueDate = nextTaskDue.length
    ? new Date(Math.min(...nextTaskDue.map((d) => d.getTime())))
    : null;

  const dueDate = nextTaskDueDate
    ?? params.company.accountsDueDate
    ?? params.company.nextArDueDate
    ?? addDays(startDate, 14);

  const effectiveStartDate = params.source?.startDate ? parseDateOnly(params.source.startDate) : startDate;
  const effectiveDueDate = params.source?.dueDate ? parseDateOnly(params.source.dueDate) : dueDate;

  const hasFailures = params.docs.some((d) => docFailure(d.pipelineStatus));

  let status: WorkflowProjectStatus = 'NOT_STARTED';
  if (totalTaskCount > 0 && outstandingTaskCount === 0) {
    status = 'COMPLETED';
  } else if (completedTaskCount > 0) {
    status = 'IN_PROGRESS';
  }

  const urgentClient = openRequests.some((r) => r.priority === 'PRIORITY_HIGH' || r.priority === 'PRIORITY_URGENT');
  let priority: WorkflowTaskPriority = 'LOW';
  if (hasFailures || urgentClient) priority = 'HIGH';
  else {
    const dayDelta = Math.round((startOfDay(effectiveDueDate).getTime() - startOfDay(new Date()).getTime()) / MS_PER_DAY);
    if (dayDelta <= 7) priority = 'MEDIUM';
  }

  const categoryFrequency = new Map<string, number>();
  for (const item of params.docs) {
    const label = item.currentRevision?.documentCategory
      ? (CATEGORY_LABELS[item.currentRevision.documentCategory] ?? DEFAULT_TEMPLATE_NAME)
      : DEFAULT_TEMPLATE_NAME;
    categoryFrequency.set(label, (categoryFrequency.get(label) ?? 0) + 1);
  }

  const templateName = categoryFrequency.size
    ? [...categoryFrequency.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : DEFAULT_TEMPLATE_NAME;

  const totalsByCurrency = billingTotalsByCurrency(params.docs);
  const companyHomeCurrency = params.company.homeCurrency || undefined;
  let billingCurrency = companyHomeCurrency && totalsByCurrency.has(companyHomeCurrency)
    ? companyHomeCurrency
    : '';

  if (!billingCurrency) {
    let maxTotal = Number.NEGATIVE_INFINITY;
    for (const [currency, total] of totalsByCurrency.entries()) {
      if (total > maxTotal) {
        maxTotal = total;
        billingCurrency = currency;
      }
    }
  }

  if (!billingCurrency) {
    billingCurrency = companyHomeCurrency || 'SGD';
  }

  const billingAmount = Math.round((totalsByCurrency.get(billingCurrency) ?? 0) * 100) / 100;
  const configuredProjectName = params.source?.projectName?.trim() || `${params.company.name} - Workflow`;

  return {
    id: params.source?.id ?? params.company.id,
    companyId: params.company.id,
    name: configuredProjectName,
    clientName: params.company.name,
    templateName,
    billingAmount,
    billingCurrency,
    status,
    priority,
    assignees,
    teamTaskCount,
    clientTaskCount,
    completedTaskCount,
    totalTaskCount,
    startDate: isoDate(effectiveStartDate),
    nextTaskName: null,
    nextTaskDueDate: nextTaskDueDate ? isoDate(nextTaskDueDate) : null,
    dueDate: isoDate(effectiveDueDate),
    recurrenceMonths: params.source?.recurrenceMonths ?? null,
  };
}

function calcStats(projects: WorkflowProject[]): WorkflowProjectStats {
  const today = startOfDay(new Date());
  let dueToday = 0;
  let dueThisWeek = 0;
  let dueNextWeek = 0;
  let overdue = 0;
  let inProgress = 0;
  let completed = 0;

  for (const project of projects) {
    if (project.status === 'COMPLETED') completed += 1;
    else inProgress += 1;

    const bucket = dueBucket(project, today);
    if (bucket === 'today') dueToday += 1;
    if (bucket === 'thisWeek') dueThisWeek += 1;
    if (bucket === 'nextWeek') dueNextWeek += 1;
    if (bucket === 'overdue') overdue += 1;
  }

  return {
    total: projects.length,
    dueToday,
    dueThisWeek,
    dueNextWeek,
    overdue,
    inProgress,
    completed,
  };
}

function filterProjects(projects: WorkflowProject[], params: WorkflowProjectSearchParams): WorkflowProject[] {
  const query = params.query?.trim().toLowerCase();
  const today = startOfDay(new Date());

  return projects.filter((project) => {
    const progress = projectProgress(project);

    if (query) {
      const haystack = [project.name, project.clientName, project.templateName, ...project.assignees].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (params.projectName && !project.name.toLowerCase().includes(params.projectName.toLowerCase())) return false;
    if (params.clientName && !project.clientName.toLowerCase().includes(params.clientName.toLowerCase())) return false;
    if (params.templateName && !project.templateName.toLowerCase().includes(params.templateName.toLowerCase())) return false;
    if (params.nextTaskName && !(project.nextTaskName ?? '').toLowerCase().includes(params.nextTaskName.toLowerCase())) return false;
    if (params.assignee && !project.assignees.some((a) => a.toLowerCase() === params.assignee!.toLowerCase())) return false;
    if (params.status && project.status !== params.status) return false;

    if (params.dueBucket) {
      if (dueBucket(project, today) !== params.dueBucket) return false;
    }

    if (!inDateRange(project.startDate, params.startDateFrom, params.startDateTo)) return false;
    if (!inDateRange(project.dueDate, params.dueDateFrom, params.dueDateTo)) return false;

    if (params.nextTaskDueDateFrom || params.nextTaskDueDateTo) {
      if (!project.nextTaskDueDate) return false;
      if (!inDateRange(project.nextTaskDueDate, params.nextTaskDueDateFrom, params.nextTaskDueDateTo)) return false;
    }

    if (!inNumberRange(progress, params.progressMin, params.progressMax)) return false;
    if (!inNumberRange(project.teamTaskCount, params.teamTasksMin, params.teamTasksMax)) return false;
    if (!inNumberRange(project.clientTaskCount, params.clientTasksMin, params.clientTasksMax)) return false;
    if (!inNumberRange(project.billingAmount, params.billingMin, params.billingMax)) return false;

    return true;
  });
}

export async function searchWorkflowProjects(
  params: WorkflowProjectSearchParams,
  scope: WorkflowProjectScope
): Promise<WorkflowProjectSearchResult> {
  const dataset = await fetchDataset(scope);
  const companyIds = dataset.companies.map((company) => company.id);
  const [settingsByCompany, instancesByCompany] = await Promise.all([
    getWorkflowProjectSettingsMap(companyIds, scope),
    getWorkflowProjectInstancesMap(companyIds, scope),
  ]);

  await cloneRecurringProjectInstances(instancesByCompany, settingsByCompany);

  const allProjects = dataset.companies.flatMap((company) => {
    const requests = dataset.requestsByCompany.get(company.id) ?? [];
    const docs = dataset.docsByCompany.get(company.id) ?? [];
    const instances = instancesByCompany.get(company.id) ?? [];
    const companySettings = settingsByCompany.get(company.id);
    const companyWorkspaceState = normalizeWorkspaceState(companySettings?.workspaceState, {
      groups: [],
      projectAttachments: [],
      billingQuantity: null,
      billingStatus: null,
      projectStatusOverride: null,
      projectNotes: '',
    });

    if (instances.length === 0) return [];

    const sortedInstances = sortProjectInstances(instances);
    return sortedInstances.map((instance) => {
      const project = buildProject({
        company,
        requests,
        docs,
        source: sourceFromInstance(instance),
      });
      const fallbackGroups: WorkflowTaskGroup[] = [
        {
          id: `${instance.id}-group-team`,
          lane: 'TEAM',
          title: 'Team Tasks',
          tasks: teamTasks({ docs, assignees: project.assignees }),
          automations: [],
        },
        {
          id: `${instance.id}-group-client`,
          lane: 'CLIENT',
          title: 'Client Request',
          tasks: clientTasks({ requests, assignee: project.assignees[0] ?? null }),
          automations: [],
        },
      ];
      const groupsForProjection = companyWorkspaceState.groups.length > 0
        ? companyWorkspaceState.groups
        : fallbackGroups;
      const projectedAssignees = dedupe(
        groupsForProjection.flatMap((group) =>
          group.tasks
            .map((task) => task.assignee?.trim() ?? '')
            .filter((assignee) => assignee.length > 0)
        )
      );
      const assignees = projectedAssignees.length > 0 ? projectedAssignees : project.assignees;
      const workspaceSummary = summarizeWorkspaceTasks(groupsForProjection);
      const autoStatusFromWorkspace = deriveAutoProjectStatusFromWorkspace(groupsForProjection);
      const nextOutstandingTask = getNextOutstandingTask(groupsForProjection);
      const billingConfig = resolveBillingConfig(companySettings, {
        defaultCurrency: company.homeCurrency || project.billingCurrency || 'SGD',
        defaultFixedPrice: project.billingAmount,
      });
      const calculatedBillingAmount = calculateBillingAmount(
        billingConfig,
        companyWorkspaceState.billingQuantity
      );
      return {
        ...project,
        assignees,
        billingAmount: calculatedBillingAmount,
        billingCurrency: billingConfig.currency,
        nextTaskName: nextOutstandingTask.name,
        nextTaskDueDate: nextOutstandingTask.dueDate,
        teamTaskCount: workspaceSummary?.team ?? project.teamTaskCount,
        clientTaskCount: workspaceSummary?.client ?? project.clientTaskCount,
        completedTaskCount: workspaceSummary?.resolved ?? project.completedTaskCount,
        totalTaskCount: workspaceSummary?.total ?? project.totalTaskCount,
        status: resolveProjectStatus(
          autoStatusFromWorkspace ?? project.status,
          companyWorkspaceState.projectStatusOverride
        ),
      };
    });
  });

  const sortBy = params.sortBy ?? 'dueDate';
  const sortOrder = params.sortOrder ?? 'asc';
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;

  const statsProjects = filterProjects(allProjects, {
    ...params,
    page: undefined,
    limit: undefined,
    sortBy: undefined,
    sortOrder: undefined,
    dueBucket: undefined,
  });
  const filtered = filterProjects(allProjects, params);
  const sorted = [...filtered].sort((a, b) => {
    const result = compareProjects(a, b, sortBy);
    return sortOrder === 'desc' ? -result : result;
  });

  const total = sorted.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const currentPage = totalPages === 0 ? 1 : Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * limit;

  return {
    projects: sorted.slice(startIndex, startIndex + limit),
    total,
    page: currentPage,
    limit,
    totalPages,
    stats: calcStats(statsProjects),
    projectOptions: uniqueSorted(allProjects.map((project) => project.name)),
    clientOptions: uniqueSorted(allProjects.map((project) => project.clientName)),
    templateOptions: uniqueSorted(allProjects.map((project) => project.templateName)),
    assigneeOptions: uniqueSorted(allProjects.flatMap((project) => project.assignees)),
  };
}

export async function createWorkflowProject(
  input: CreateWorkflowProjectInput,
  scope: WorkflowProjectScope
): Promise<WorkflowProjectDetail> {
  if (input.recurrenceMonths !== null && input.recurrenceMonths <= 0) {
    throw new Error('Recurring interval must be at least 1 month');
  }

  if (input.dueDate < input.startDate) {
    throw new Error('Due date must be on or after start date');
  }

  const company = await prisma.company.findFirst({
    where: {
      ...(buildCompanyWhere(scope) as Record<string, unknown>),
      id: input.companyId,
    },
    select: {
      id: true,
      tenantId: true,
    },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  await ensureWorkflowProjectStorageTables();

  const instance: WorkflowProjectInstance = {
    id: randomUUID(),
    companyId: company.id,
    tenantId: company.tenantId,
    projectName: input.name.trim(),
    startDate: input.startDate,
    dueDate: input.dueDate,
    recurrenceMonths: input.recurrenceMonths,
    sourceInstanceId: null,
  };

  const persisted = await upsertProjectInstance(instance);
  const detail = await getWorkflowProjectDetail(persisted.id, scope);
  if (!detail) {
    throw new Error('Failed to create workflow project');
  }
  return detail;
}

export async function deleteWorkflowProject(
  projectId: string,
  scope: WorkflowProjectScope
): Promise<boolean> {
  await ensureWorkflowProjectStorageTables();

  const directInstance = await getWorkflowProjectInstanceById(projectId, scope);
  if (!directInstance) return false;

  const deletedCount = await prisma.$executeRaw`
    DELETE FROM workflow_project_instances
    WHERE id = ${directInstance.id}
  `;
  return Number(deletedCount) > 0;
}

function teamTasks(params: {
  docs: Awaited<ReturnType<typeof fetchDocs>>;
  assignees: string[];
}): WorkflowProjectTask[] {
  const sorted = [...params.docs].sort((a, b) => docDueDate(a).getTime() - docDueDate(b).getTime());

  return sorted.map((doc, index) => {
    const status = docTaskStatus(doc.pipelineStatus, doc.currentRevision?.status);
    const due = docDueDate(doc);
    const fileName = doc.document.originalFileName || doc.document.fileName;
    const documentCategory = doc.currentRevision?.documentCategory;
    const doneSubtasks = status === 'DONE' ? 2 : status === 'IN_PROGRESS' || status === 'WAITING_CLIENT' ? 1 : 0;

    return {
      id: `team-${doc.id}`,
      title: doc.currentRevision?.documentNumber ? `Review ${doc.currentRevision.documentNumber}` : `Review ${fileName}`,
      lane: 'TEAM',
      status,
      priority: docTaskPriority(doc.pipelineStatus, doc.duplicateStatus),
      dueDate: isoDate(due),
      assignee: params.assignees.length ? params.assignees[index % params.assignees.length] : null,
      description: [
        `Source document: ${fileName}.`,
        doc.currentRevision?.vendorName ? `Vendor: ${doc.currentRevision.vendorName}.` : null,
        documentCategory
          ? `Category: ${CATEGORY_LABELS[documentCategory] ?? documentCategory}.`
          : null,
        `Pipeline status: ${doc.pipelineStatus}.`,
      ].filter((v): v is string => Boolean(v)).join(' '),
      subtasks: [
        {
          id: `team-${doc.id}-sub-1`,
          title: 'Validate extraction output',
          completed: doneSubtasks >= 1,
        },
        {
          id: `team-${doc.id}-sub-2`,
          title: 'Approve and close task',
          completed: doneSubtasks >= 2,
        },
      ],
      attachments: [
        {
          id: `attachment-${doc.id}`,
          processingDocumentId: doc.id,
          documentId: doc.documentId,
          fileName,
          linkedAt: doc.createdAt.toISOString(),
          companyName: doc.document.company?.name ?? null,
          pipelineStatus: doc.pipelineStatus,
          revisionStatus: doc.currentRevision?.status ?? null,
          duplicateStatus: doc.duplicateStatus,
          documentCategory: doc.currentRevision?.documentCategory ?? null,
          documentSubCategory: doc.currentRevision?.documentSubCategory ?? null,
          vendorName: doc.currentRevision?.vendorName ?? null,
          documentNumber: doc.currentRevision?.documentNumber ?? null,
          documentDate: doc.currentRevision?.documentDate ? isoDate(doc.currentRevision.documentDate) : null,
          currency: doc.currentRevision?.currency ?? null,
          subtotal: doc.currentRevision?.subtotal?.toString() ?? null,
          taxAmount: doc.currentRevision?.taxAmount?.toString() ?? null,
          totalAmount: doc.currentRevision?.totalAmount?.toString() ?? null,
          homeCurrency: doc.currentRevision?.homeCurrency ?? null,
          homeSubtotal: doc.currentRevision?.homeSubtotal?.toString() ?? null,
          homeTaxAmount: doc.currentRevision?.homeTaxAmount?.toString() ?? null,
          homeEquivalent: doc.currentRevision?.homeEquivalent?.toString() ?? null,
          uploadedAt: doc.createdAt.toISOString(),
        },
      ],
    };
  });
}

function clientTasks(params: {
  requests: Awaited<ReturnType<typeof fetchRequests>>;
  assignee: string | null;
}): WorkflowProjectTask[] {
  const sorted = [...params.requests].sort((a, b) => {
    const aDue = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue === bDue) return a.createdAt.getTime() - b.createdAt.getTime();
    return aDue - bDue;
  });

  return sorted.map((request) => {
    const status = requestTaskStatus(request.status);
    const doneSubtasks = status === 'DONE' || status === 'SKIPPED' ? 2 : status === 'IN_PROGRESS' || status === 'WAITING_CLIENT' ? 1 : 0;

    return {
      id: `client-${request.id}`,
      title: request.title,
      lane: 'CLIENT',
      status,
      priority: requestPriority(request.priority),
      dueDate: request.dueDate ? isoDate(request.dueDate) : null,
      assignee: params.assignee,
      description: request.description || 'Client request task',
      subtasks: [
        {
          id: `client-${request.id}-sub-1`,
          title: 'Send request details',
          completed: doneSubtasks >= 1,
        },
        {
          id: `client-${request.id}-sub-2`,
          title: request._count.communications > 0
            ? `Track client replies (${request._count.communications})`
            : 'Track client replies',
          completed: doneSubtasks >= 2,
        },
      ],
      attachments: [],
    };
  });
}

function billingLabel(project: WorkflowProject): string {
  if (project.clientTaskCount > project.teamTaskCount) return 'Client-Driven Support';
  if (project.priority === 'HIGH') return 'Priority Fixed Fee';
  return 'Fixed Fee';
}

function budgetHours(project: WorkflowProject): number {
  const base = Math.max(8, Math.round(project.totalTaskCount * 1.5));
  if (project.priority === 'HIGH') return base + 4;
  if (project.priority === 'LOW') return Math.max(6, base - 2);
  return base;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function getWorkflowProjectInstanceById(
  projectId: string,
  scope: WorkflowProjectScope
): Promise<WorkflowProjectInstance | null> {
  await ensureWorkflowProjectStorageTables();

  const tenantFilter = !scope.skipTenantFilter && scope.tenantId
    ? Prisma.sql`AND tenant_id = ${scope.tenantId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<WorkflowProjectInstance[]>(Prisma.sql`
    SELECT
      id::text AS "id",
      company_id AS "companyId",
      tenant_id AS "tenantId",
      project_name AS "projectName",
      start_date::text AS "startDate",
      due_date::text AS "dueDate",
      recurrence_months AS "recurrenceMonths",
      source_instance_id::text AS "sourceInstanceId"
    FROM ${Prisma.raw(WORKFLOW_PROJECT_INSTANCES_TABLE)}
    WHERE id = ${projectId}
    ${tenantFilter}
    LIMIT 1
  `);

  const instance = rows[0] ?? null;
  if (!instance) return null;
  if (scope.companyIds && !scope.companyIds.includes(instance.companyId)) return null;
  return instance;
}

export async function resolveWorkflowProjectCompanyId(
  projectId: string,
  scope: WorkflowProjectScope
): Promise<string | null> {
  const instance = await getWorkflowProjectInstanceById(projectId, scope);
  return instance?.companyId ?? null;
}

export async function getWorkflowProjectDetail(projectId: string, scope: WorkflowProjectScope): Promise<WorkflowProjectDetail | null> {
  const resolvedInstance = await getWorkflowProjectInstanceById(projectId, scope);
  if (!resolvedInstance) return null;
  const targetCompanyId = resolvedInstance.companyId;

  const company = await prisma.company.findFirst({
    where: {
      ...(buildCompanyWhere(scope) as Record<string, unknown>),
      id: targetCompanyId,
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      entityType: true,
      homeCurrency: true,
      createdAt: true,
      nextArDueDate: true,
      accountsDueDate: true,
      financialYearEndMonth: true,
      financialYearEndDay: true,
      userAssignments: {
        where: { user: { isActive: true, deletedAt: null } },
        select: { user: { select: { firstName: true, lastName: true } } },
      },
      contactDetails: {
        where: { isPoc: true, deletedAt: null, contact: { deletedAt: null } },
        select: { contact: { select: { fullName: true } } },
        take: 1,
      },
    },
  });

  if (!company) return null;

  const [requests, docs, settingsByCompany, instancesByCompany, tenantUsers] = await Promise.all([
    fetchRequests([company.id]),
    fetchDocs([company.id]),
    getWorkflowProjectSettingsMap([company.id], scope),
    getWorkflowProjectInstancesMap([company.id], scope),
    prisma.user.findMany({
      where: {
        tenantId: company.tenantId,
        deletedAt: null,
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: [
        { firstName: 'asc' },
        { lastName: 'asc' },
        { email: 'asc' },
      ],
    }),
  ]);

  await cloneRecurringProjectInstances(instancesByCompany, settingsByCompany);

  const companyInstances = instancesByCompany.get(company.id) ?? [];
  const selectedInstance = companyInstances.find((instance) => instance.id === resolvedInstance.id) ?? resolvedInstance;

  const project = buildProject({
    company,
    requests,
    docs,
    source: sourceFromInstance(selectedInstance),
  });
  const billingConfig = resolveBillingConfig(settingsByCompany.get(company.id), {
    defaultCurrency: company.homeCurrency || project.billingCurrency || 'SGD',
    defaultFixedPrice: project.billingAmount,
  });
  const tenantAssignees = dedupe(
    tenantUsers
      .map((user) => `${user.firstName} ${user.lastName}`.trim() || user.email.trim())
      .filter((name) => name.length > 0)
  );
  const assignees = tenantAssignees.length > 0 ? tenantAssignees : project.assignees;
  const groupTeamId = `${company.id}-group-team`;
  const groupClientId = `${company.id}-group-client`;
  const defaultGroups: WorkflowTaskGroup[] = [
    {
      id: groupTeamId,
      lane: 'TEAM',
      title: 'Team Tasks',
      tasks: teamTasks({ docs, assignees }),
      automations: [
        {
          id: `${company.id}-rule-team-done`,
          name: 'Follow-up after completion',
          condition: 'TASK_DONE',
          action: 'CREATE_FOLLOW_UP',
          targetGroupId: groupTeamId,
          followUpTitleTemplate: 'Follow-up: {{taskTitle}}',
          enabled: false,
        },
      ],
    },
    {
      id: groupClientId,
      lane: 'CLIENT',
      title: 'Client Request',
      tasks: clientTasks({ requests, assignee: assignees[0] ?? null }),
      automations: [
        {
          id: `${company.id}-rule-client-skipped`,
          name: 'Escalate skipped client task',
          condition: 'TASK_SKIPPED',
          action: 'CREATE_FOLLOW_UP',
          targetGroupId: groupTeamId,
          followUpTitleTemplate: 'Escalation: {{taskTitle}}',
          enabled: false,
        },
      ],
    },
  ];
  const workspaceState = normalizeWorkspaceState(settingsByCompany.get(company.id)?.workspaceState, {
    groups: defaultGroups,
    projectAttachments: [],
    billingQuantity: null,
    billingStatus: null,
    projectStatusOverride: null,
    projectNotes: '',
  });
  const autoStatusFromWorkspace = deriveAutoProjectStatusFromWorkspace(workspaceState.groups);
  const resolvedProjectStatus = resolveProjectStatus(
    autoStatusFromWorkspace ?? project.status,
    workspaceState.projectStatusOverride
  );
  const calculatedBillingAmount = calculateBillingAmount(billingConfig, workspaceState.billingQuantity);
  const billingStatus = resolveBillingStatus(workspaceState.billingStatus, calculatedBillingAmount, resolvedProjectStatus);

  return {
    id: project.id,
    name: project.name,
    clientName: project.clientName,
    templateName: project.templateName,
    status: resolvedProjectStatus,
    statusLabel: STATUS_LABELS[resolvedProjectStatus],
    priority: project.priority,
    assignees,
    startDate: project.startDate,
    dueDate: project.dueDate,
    recurrenceMonths: project.recurrenceMonths,
    nextTaskDueDate: project.nextTaskDueDate ?? null,
    tags: dedupe([
      STATUS_LABELS[resolvedProjectStatus],
      project.priority === 'HIGH' ? 'Priority' : 'Standard',
      project.templateName,
    ]),
    billingLabel: billingLabel(project),
    billingConfig,
    projectAttachments: workspaceState.projectAttachments,
    billingQuantity: workspaceState.billingQuantity,
    billingStatus,
    projectStatusOverride: workspaceState.projectStatusOverride,
    projectNotes: workspaceState.projectNotes,
    budgetHours: budgetHours(project),
    resources: [
      {
        id: `${company.id}-resource-company`,
        title: 'Company profile',
        href: `/companies/${company.id}`,
      },
      {
        id: `${company.id}-resource-processing`,
        title: 'Processing documents',
        href: `/processing?companyId=${company.id}`,
      },
      {
        id: `${company.id}-resource-audit`,
        title: 'Company audit log',
        href: `/companies/${company.id}/audit`,
      },
    ],
    groups: workspaceState.groups,
    companySnapshot: {
      name: company.name,
      companyType: toTitleCaseEnum(company.entityType),
      financialYearEnd: formatFye(company.financialYearEndMonth, company.financialYearEndDay),
      pocContact: company.contactDetails[0]?.contact?.fullName ?? assignees[0] ?? '-',
    },
  };
}

export async function updateWorkflowProjectSettings(
  projectId: string,
  input: UpdateWorkflowProjectSettingsInput,
  scope: WorkflowProjectScope
): Promise<WorkflowProjectDetail | null> {
  if (input.recurrenceMonths !== null && input.recurrenceMonths <= 0) {
    throw new Error('Recurring interval must be at least 1 month');
  }

  if (input.dueDate < input.startDate) {
    throw new Error('Due date must be on or after start date');
  }

  const companyId = await resolveWorkflowProjectCompanyId(projectId, scope);
  if (!companyId) {
    return null;
  }

  const company = await prisma.company.findFirst({
    where: {
      ...(buildCompanyWhere(scope) as Record<string, unknown>),
      id: companyId,
    },
    select: {
      id: true,
      tenantId: true,
      homeCurrency: true,
    },
  });

  if (!company) {
    return null;
  }

  const existingSetting = (await getWorkflowProjectSettingsMap([company.id], scope)).get(company.id);
  const existingBillingConfig = resolveBillingConfig(existingSetting, {
    defaultCurrency: company.homeCurrency || 'SGD',
    defaultFixedPrice: 0,
  });
  const normalizedBillingConfig = input.billingConfig
    ? normalizeBillingConfigInput(input.billingConfig, {
      defaultCurrency: existingBillingConfig.currency,
      defaultFixedPrice: existingBillingConfig.fixedPrice ?? 0,
    })
    : existingBillingConfig;
  const existingWorkspaceState = existingSetting?.workspaceState
    ? normalizeWorkspaceState(existingSetting.workspaceState, {
      groups: [],
      projectAttachments: [],
      billingQuantity: null,
      billingStatus: null,
      projectStatusOverride: null,
      projectNotes: '',
    })
    : null;
  const normalizedWorkspaceState = input.workspaceState
    ? normalizeWorkspaceState(input.workspaceState, existingWorkspaceState ?? {
      groups: [],
      projectAttachments: [],
      billingQuantity: null,
      billingStatus: null,
      projectStatusOverride: null,
      projectNotes: '',
    })
    : existingWorkspaceState;
  const normalizedName = input.name.trim();
  const tieredPricingJson = JSON.stringify(normalizedBillingConfig.tiers);
  const workspaceStateJson = normalizedWorkspaceState ? JSON.stringify(normalizedWorkspaceState) : null;

  await ensureWorkflowProjectStorageTables();

  await prisma.$executeRaw`
    INSERT INTO workflow_project_settings (
      company_id,
      tenant_id,
      project_name,
      start_date,
      due_date,
      recurrence_months,
      billing_mode,
      billing_fixed_price,
      billing_currency,
      billing_tiered_pricing,
      workspace_state,
      created_at,
      updated_at
    )
    VALUES (
      ${company.id},
      ${company.tenantId},
      ${normalizedName},
      ${input.startDate},
      ${input.dueDate},
      ${input.recurrenceMonths},
      ${normalizedBillingConfig.mode},
      ${normalizedBillingConfig.fixedPrice},
      ${normalizedBillingConfig.currency},
      ${tieredPricingJson}::jsonb,
      ${workspaceStateJson}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (company_id)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      project_name = EXCLUDED.project_name,
      start_date = EXCLUDED.start_date,
      due_date = EXCLUDED.due_date,
      recurrence_months = EXCLUDED.recurrence_months,
      billing_mode = EXCLUDED.billing_mode,
      billing_fixed_price = EXCLUDED.billing_fixed_price,
      billing_currency = EXCLUDED.billing_currency,
      billing_tiered_pricing = EXCLUDED.billing_tiered_pricing,
      workspace_state = EXCLUDED.workspace_state,
      updated_at = NOW()
  `;

  const directInstance = await getWorkflowProjectInstanceById(projectId, scope);
  let targetInstance = directInstance;

  if (!targetInstance) {
    const instancesByCompany = await getWorkflowProjectInstancesMap([company.id], scope);
    targetInstance = pickCurrentProjectInstance(instancesByCompany.get(company.id) ?? []);
  }

  let detailProjectId = projectId;

  if (targetInstance) {
    await prisma.$executeRaw`
      UPDATE workflow_project_instances
      SET project_name = ${normalizedName},
          start_date = ${input.startDate},
          due_date = ${input.dueDate},
          recurrence_months = ${input.recurrenceMonths},
          updated_at = NOW()
      WHERE id = ${targetInstance.id}
    `;
    detailProjectId = targetInstance.id;
  } else {
    const createdInstance: WorkflowProjectInstance = {
      id: randomUUID(),
      companyId: company.id,
      tenantId: company.tenantId,
      projectName: normalizedName,
      startDate: input.startDate,
      dueDate: input.dueDate,
      recurrenceMonths: input.recurrenceMonths,
      sourceInstanceId: null,
    };
    const persistedInstance = await upsertProjectInstance(createdInstance);
    detailProjectId = persistedInstance.id;
  }

  return getWorkflowProjectDetail(detailProjectId, scope);
}
