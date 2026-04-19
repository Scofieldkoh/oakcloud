'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentType, type DragEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  Copy,
  Clock3,
  FileText,
  Flag,
  FolderOpen,
  GripVertical,
  ListPlus,
  Paperclip,
  PencilLine,
  Plus,
  Repeat2,
  Save,
  Trash2,
  UserCircle2,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/dropdown';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { AmountFilter, type AmountFilterValue } from '@/components/ui/amount-filter';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { WorkflowDateRangeInput } from '@/components/workflow/workflow-date-range-input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useToast } from '@/components/ui/toast';
import {
  useWorkflowProjectDetail,
  useUpdateWorkflowProject,
  type WorkflowAutomationRule,
  type WorkflowProjectBillingMode,
  type WorkflowProjectBillingStatus,
  type WorkflowProjectBillingTier,
  type WorkflowProjectDetail,
  type WorkflowProjectReferralFeeType,
  type WorkflowProjectTask,
  type WorkflowTaskAttachment,
  type WorkflowTaskGroup,
  type WorkflowTaskLane,
  type WorkflowTaskPriority,
  type WorkflowTaskStatus,
  WORKFLOW_TASK_STATUS_LABELS,
} from '@/hooks/use-workflow-project-detail';
import { useCompanies } from '@/hooks/use-companies';
import { useCompanyContactDetails } from '@/hooks/use-contact-details';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { useUserPreference, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import {
  useProcessingDocuments,
  type ProcessingDocumentListItem,
} from '@/hooks/use-processing-documents';
import { getEntityTypeLabel } from '@/lib/constants';
import { cn, formatCurrency, formatDateShort } from '@/lib/utils';

interface WorkflowProjectDetailPageProps {
  projectId: string;
}

type WorkflowProjectTab = 'LIST' | 'FILES' | 'NOTES' | 'BILLING';
type AutomationCondition = WorkflowAutomationRule['condition'];

interface WorkflowAutomationDraft {
  name: string;
  condition: AutomationCondition;
  targetGroupId: string;
  followUpTitleTemplate: string;
  enabled: boolean;
}

type ProjectRecurrenceMode = 'ONE_TIME' | 'MONTHLY';

interface WorkflowProjectEditDraft {
  name: string;
  startDate: string;
  dueDate: string;
  statusOverride: 'AUTO' | 'AT_RISK' | 'ON_HOLD';
  recurrenceMode: ProjectRecurrenceMode;
  recurrenceMonths: string;
}

interface WorkflowProjectBillingTierDraft {
  id: string;
  upTo: string;
  unitPrice: string;
}

interface WorkflowProjectBillingDraft {
  mode: WorkflowProjectBillingMode;
  currency: string;
  fixedPrice: string;
  disbursementAmount: string;
  referralFeeAmount: string;
  referralFeeType: WorkflowProjectReferralFeeType;
  referralFeeRecurringLimit: string;
  referralPayee: string;
  referralPayeeContactId: string;
  quantity: string;
  statusOverride: Extract<WorkflowProjectBillingStatus, 'BILLED'> | null;
  tiers: WorkflowProjectBillingTierDraft[];
}

interface WorkflowProjectTierCalculationRow {
  key: string;
  from: number;
  to: number | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface WorkflowLinkedDocumentRow {
  key: string;
  attachmentId: string;
  processingDocumentId: string;
  documentId: string;
  fileName: string;
  linkedAt: string;
  linkedAtLabel: string;
  linkedScope: 'PROJECT' | 'TASK';
  linkedTaskId: string | null;
  linkedTaskTitle: string;
  companyName: string | null;
  pipelineStatus: string | null;
  revisionStatus: string | null;
  duplicateStatus: string | null;
  documentCategory: string | null;
  documentSubCategory: string | null;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  currency: string | null;
  subtotal: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  homeCurrency: string | null;
  homeSubtotal: string | null;
  homeTaxAmount: string | null;
  homeEquivalent: string | null;
  uploadedAt: string | null;
}

interface WorkflowFilesInlineFilters {
  linkedAt: string;
  fileName: string;
  companyName: string;
  pipelineStatus: string;
  revisionStatus: string;
  duplicateStatus: string;
  documentCategory: string;
  documentSubCategory: string;
  vendorName: string;
  documentNumber: string;
  documentDateFrom: string;
  documentDateTo: string;
  currency: string;
  subtotalFilter: AmountFilterValue | undefined;
  taxFilter: AmountFilterValue | undefined;
  totalFilter: AmountFilterValue | undefined;
  homeCurrency: string;
  homeSubtotalFilter: AmountFilterValue | undefined;
  homeTaxFilter: AmountFilterValue | undefined;
  homeTotalFilter: AmountFilterValue | undefined;
  uploadedFrom: string;
  uploadedTo: string;
}

interface WorkflowLinkModalInlineFilters {
  fileName: string;
  pipelineStatus: string;
  documentCategory: string;
  documentSubCategory: string;
}

const TASK_STATUS_CLASS_MAP: Record<WorkflowTaskStatus, string> = {
  TODO: 'badge-neutral',
  IN_PROGRESS: 'badge-info',
  WAITING_CLIENT: 'badge-warning',
  DONE: 'badge-success',
  SKIPPED: 'badge-error',
};

const TASK_PRIORITY_CLASS_MAP: Record<WorkflowTaskPriority, string> = {
  LOW: 'text-text-secondary',
  MEDIUM: 'text-status-info',
  HIGH: 'text-status-error',
};

const PROJECT_STATUS_CLASS_MAP: Record<WorkflowProjectDetail['status'], string> = {
  NOT_STARTED: 'badge-neutral',
  IN_PROGRESS: 'badge-info',
  AT_RISK: 'badge-warning',
  ON_HOLD: 'badge-neutral',
  COMPLETED: 'badge-success',
};
const PROJECT_STATUS_LABEL_MAP: Record<WorkflowProjectDetail['status'], string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  AT_RISK: 'At Risk',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
};

const TAB_OPTIONS: Array<{ id: WorkflowProjectTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'LIST', label: 'List', icon: ClipboardList },
  { id: 'FILES', label: 'Files', icon: FolderOpen },
  { id: 'NOTES', label: 'Notes', icon: FileText },
  { id: 'BILLING', label: 'Billing', icon: Flag },
];

const TASK_STATUS_OPTIONS: WorkflowTaskStatus[] = ['TODO', 'IN_PROGRESS', 'WAITING_CLIENT', 'DONE', 'SKIPPED'];
const TASK_PRIORITY_OPTIONS: WorkflowTaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
const BILLING_STATUS_LABELS: Record<WorkflowProjectBillingStatus, string> = {
  PENDING: 'Pending',
  TO_BE_BILLED: 'To be billed',
  BILLED: 'Billed',
};
const BILLING_STATUS_CLASS_MAP: Record<WorkflowProjectBillingStatus, string> = {
  PENDING: 'text-status-warning',
  TO_BE_BILLED: 'text-status-info',
  BILLED: 'text-status-success',
};
const UNSAVED_CHANGES_PROMPT_MESSAGE = 'You have unsaved changes. Leave this page without saving?';
const FILES_COLUMN_PREF_KEY = 'workflow:project-detail:files:columns:v1';
const FILES_COLUMN_IDS = [
  'linkedAt',
  'document',
  'company',
  'status',
  'tags',
  'category',
  'subCategory',
  'vendor',
  'docNumber',
  'docDate',
  'currency',
  'subtotal',
  'tax',
  'total',
  'homeCurrency',
  'homeSubtotal',
  'homeTax',
  'homeTotal',
  'uploaded',
  'action',
] as const;
type FilesColumnId = (typeof FILES_COLUMN_IDS)[number];
const FILES_COLUMN_DEFAULT_WIDTHS: Record<FilesColumnId, number> = {
  linkedAt: 180,
  document: 260,
  company: 180,
  status: 120,
  tags: 120,
  category: 140,
  subCategory: 140,
  vendor: 180,
  docNumber: 120,
  docDate: 130,
  currency: 100,
  subtotal: 120,
  tax: 120,
  total: 120,
  homeCurrency: 110,
  homeSubtotal: 130,
  homeTax: 130,
  homeTotal: 130,
  uploaded: 130,
  action: 72,
};

function getTaskStatusIcon(status: WorkflowTaskStatus) {
  if (status === 'DONE') return CheckCircle2;
  if (status === 'SKIPPED') return X;
  if (status === 'WAITING_CLIENT') return Clock3;
  if (status === 'IN_PROGRESS') return CircleDashed;
  return ChevronRight;
}

function getInitialGroupCollapseState(project: WorkflowProjectDetail | null): Record<string, boolean> {
  if (!project) return {};
  return project.groups.reduce<Record<string, boolean>>((state, group) => {
    state[group.id] = false;
    return state;
  }, {});
}

function getDefaultAutomationDraft(groupId: string): WorkflowAutomationDraft {
  return {
    name: '',
    condition: 'TASK_DONE',
    targetGroupId: groupId,
    followUpTitleTemplate: 'Follow-up: {{taskTitle}}',
    enabled: true,
  };
}

function createTask(taskId: string, lane: WorkflowTaskLane, assignee: string | null, dueDate: string | null, title?: string): WorkflowProjectTask {
  return {
    id: taskId,
    title: title?.trim() || 'New task',
    lane,
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate,
    assignee,
    description: '',
    subtasks: [],
    attachments: [],
  };
}

function findTaskWithGroup(groups: WorkflowTaskGroup[], taskId: string): {
  group: WorkflowTaskGroup;
  groupIndex: number;
  task: WorkflowProjectTask;
  taskIndex: number;
} | null {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const taskIndex = group.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex >= 0) {
      return {
        group,
        groupIndex,
        task: group.tasks[taskIndex],
        taskIndex,
      };
    }
  }
  return null;
}

function updateTaskInGroups(
  groups: WorkflowTaskGroup[],
  taskId: string,
  updater: (task: WorkflowProjectTask) => WorkflowProjectTask
): WorkflowTaskGroup[] {
  let hasChanged = false;
  const nextGroups = groups.map((group) => {
    let groupChanged = false;
    const nextTasks = group.tasks.map((task) => {
      if (task.id !== taskId) return task;
      hasChanged = true;
      groupChanged = true;
      return updater(task);
    });
    return groupChanged ? { ...group, tasks: nextTasks } : group;
  });
  return hasChanged ? nextGroups : groups;
}

function moveGroupBefore(
  groups: WorkflowTaskGroup[],
  sourceGroupId: string,
  targetGroupId: string
): WorkflowTaskGroup[] {
  if (sourceGroupId === targetGroupId) return groups;

  const sourceIndex = groups.findIndex((group) => group.id === sourceGroupId);
  const targetIndex = groups.findIndex((group) => group.id === targetGroupId);
  if (sourceIndex < 0 || targetIndex < 0) return groups;

  const next = [...groups];
  const [sourceGroup] = next.splice(sourceIndex, 1);
  const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(insertIndex, 0, sourceGroup);
  return next;
}

function moveGroupToEnd(
  groups: WorkflowTaskGroup[],
  sourceGroupId: string
): WorkflowTaskGroup[] {
  const sourceIndex = groups.findIndex((group) => group.id === sourceGroupId);
  if (sourceIndex < 0 || sourceIndex === groups.length - 1) return groups;

  const next = [...groups];
  const [sourceGroup] = next.splice(sourceIndex, 1);
  next.push(sourceGroup);
  return next;
}

function moveTaskToPosition(
  groups: WorkflowTaskGroup[],
  sourceTaskId: string,
  targetGroupId: string,
  targetTaskId: string | null
): WorkflowTaskGroup[] {
  if (targetTaskId && sourceTaskId === targetTaskId) return groups;

  const sourceLocation = findTaskWithGroup(groups, sourceTaskId);
  if (!sourceLocation) return groups;

  const movingTask = sourceLocation.task;
  const withoutSource = groups.map((group, index) => {
    if (index !== sourceLocation.groupIndex) return group;
    const nextTasks = [...group.tasks];
    nextTasks.splice(sourceLocation.taskIndex, 1);
    return { ...group, tasks: nextTasks };
  });

  return withoutSource.map((group) => {
    if (group.id !== targetGroupId) return group;

    const normalizedTask = movingTask.lane === group.lane
      ? movingTask
      : { ...movingTask, lane: group.lane };
    const nextTasks = [...group.tasks];
    const insertIndex = targetTaskId
      ? nextTasks.findIndex((task) => task.id === targetTaskId)
      : nextTasks.length;

    if (insertIndex < 0) {
      nextTasks.push(normalizedTask);
    } else {
      nextTasks.splice(insertIndex, 0, normalizedTask);
    }

    return { ...group, tasks: nextTasks };
  });
}

function formatFye(month: number | null | undefined, day: number | null | undefined): string {
  if (!month || !day) return '-';
  const reference = new Date(2000, Math.max(0, month - 1), day);
  return reference.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
}

function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function hasRichTextContent(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u200B/g, '')
    .trim();
  return normalized.length > 0;
}

interface WorkflowMatchedCompany {
  id: string;
  name: string;
  entityType: string;
  financialYearEndMonth: number | null;
  financialYearEndDay: number | null;
}

function pickBestCompanyMatch(
  clientName: string,
  companies: WorkflowMatchedCompany[] | undefined
): WorkflowMatchedCompany | null {
  if (!companies || companies.length === 0) return null;
  const normalizedClient = clientName.toLowerCase();
  const exact = companies.find((company) => company.name.toLowerCase() === normalizedClient);
  if (exact) return exact;
  const partial = companies.find((company) => company.name.toLowerCase().includes(normalizedClient));
  if (partial) return partial;
  return companies[0];
}

function buildProjectEditDraft(project: WorkflowProjectDetail): WorkflowProjectEditDraft {
  return {
    name: project.name,
    startDate: project.startDate,
    dueDate: project.dueDate,
    statusOverride: project.projectStatusOverride ?? 'AUTO',
    recurrenceMode: project.recurrenceMonths ? 'MONTHLY' : 'ONE_TIME',
    recurrenceMonths: project.recurrenceMonths ? String(project.recurrenceMonths) : '1',
  };
}

function toMoneyInput(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function parseAmountInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function getDateTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function matchesDateRange(
  value: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  const valueTimestamp = getDateTimestamp(value);
  if (valueTimestamp === null) return false;

  const fromTimestamp = getDateTimestamp(from);
  if (fromTimestamp !== null && valueTimestamp < fromTimestamp) return false;

  const toTimestamp = getDateTimestamp(to);
  if (toTimestamp !== null && valueTimestamp > toTimestamp) return false;

  return true;
}

function matchesAmountFilter(
  value: string | null | undefined,
  filter: AmountFilterValue | undefined
): boolean {
  if (!filter) return true;
  const amount = parseAmountInput(value ?? '');
  if (amount === null) return false;

  if (filter.mode === 'single') {
    if (filter.single === undefined) return true;
    return Math.abs(amount - filter.single) < 0.0001;
  }

  const from = filter.range?.from;
  const to = filter.range?.to;
  if (from !== undefined && amount < from) return false;
  if (to !== undefined && amount > to) return false;
  return true;
}

function parsePriceInput(value: string): number | null {
  const parsed = parseAmountInput(value);
  if (parsed === null || parsed < 0) return null;
  return parsed;
}

function calculateFixedBillingAmount(
  fixedPrice: number,
  disbursementAmount: number
): number {
  return Math.round((fixedPrice + disbursementAmount) * 100) / 100;
}

function calculateFixedMargin(
  billingAmount: number,
  disbursementAmount: number,
  referralFeeAmount: number
): number {
  return Math.round((billingAmount - disbursementAmount - referralFeeAmount) * 100) / 100;
}

function resolveReferralFeeValue(
  fixedPrice: number,
  referralFeeAmount: number,
  referralFeeType: WorkflowProjectReferralFeeType
): number {
  if (referralFeeType === 'PERCENTAGE') {
    return Math.round(fixedPrice * Math.max(0, referralFeeAmount) * 100) / 10000;
  }

  return Math.round(Math.max(0, referralFeeAmount) * 100) / 100;
}

function resolveEffectiveReferralFee(
  referralFeeAmount: number,
  fixedPrice: number,
  referralFeeType: WorkflowProjectReferralFeeType,
  referralFeeRecurringLimit: number | null,
  instanceNumber: number
): number {
  const resolvedReferralFeeAmount = resolveReferralFeeValue(fixedPrice, referralFeeAmount, referralFeeType);
  if (referralFeeRecurringLimit !== null && instanceNumber > referralFeeRecurringLimit) {
    return 0;
  }
  return resolvedReferralFeeAmount;
}

function parsePositiveIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseNonNegativeIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeMoneyInputForComparison(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = parseAmountInput(trimmed);
  if (parsed === null) return trimmed;
  return parsed.toFixed(2);
}

function normalizePositiveIntegerInputForComparison(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = parsePositiveIntegerInput(trimmed);
  if (parsed === null) return trimmed;
  return String(parsed);
}

function normalizeNonNegativeIntegerInputForComparison(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = parseNonNegativeIntegerInput(trimmed);
  if (parsed === null) return trimmed;
  return String(parsed);
}

function buildComparableProjectEditDraft(draft: WorkflowProjectEditDraft | null | undefined) {
  if (!draft) return null;
  return {
    name: draft.name.trim(),
    startDate: draft.startDate,
    dueDate: draft.dueDate,
    statusOverride: draft.statusOverride,
    recurrenceMode: draft.recurrenceMode,
    recurrenceMonths: normalizePositiveIntegerInputForComparison(draft.recurrenceMonths),
  };
}

function buildComparableBillingDraft(
  draft: WorkflowProjectBillingDraft | null | undefined,
  fallbackCurrency: string
) {
  if (!draft) return null;
  return {
    mode: draft.mode,
    currency: normalizeCurrencyInput(draft.currency, fallbackCurrency),
    fixedPrice: normalizeMoneyInputForComparison(draft.fixedPrice),
    disbursementAmount: normalizeMoneyInputForComparison(draft.disbursementAmount),
    referralFeeAmount: normalizeMoneyInputForComparison(draft.referralFeeAmount),
    referralFeeType: draft.referralFeeType,
    referralFeeRecurringLimit: normalizePositiveIntegerInputForComparison(draft.referralFeeRecurringLimit),
    referralPayee: draft.referralPayee.trim(),
    referralPayeeContactId: draft.referralPayeeContactId.trim(),
    quantity: normalizeNonNegativeIntegerInputForComparison(draft.quantity),
    statusOverride: draft.statusOverride ?? null,
    tiers: draft.tiers
      .map((tier) => ({
        upTo: normalizePositiveIntegerInputForComparison(tier.upTo),
        unitPrice: normalizeMoneyInputForComparison(tier.unitPrice),
      }))
      .filter((tier) => tier.upTo.length > 0 || tier.unitPrice.length > 0),
  };
}

function buildBillingDraft(project: WorkflowProjectDetail): WorkflowProjectBillingDraft {
  const tiers = project.billingConfig.tiers.length > 0
    ? project.billingConfig.tiers.map((tier, index) => ({
      id: `tier-${index + 1}`,
      upTo: tier.upTo === null ? '' : String(tier.upTo),
      unitPrice: toMoneyInput(tier.unitPrice),
    }))
    : [
      {
        id: 'tier-1',
        upTo: '',
        unitPrice: '',
      },
    ];

  return {
    mode: project.billingConfig.mode,
    currency: project.billingConfig.currency,
    fixedPrice: toMoneyInput(project.billingConfig.fixedPrice),
    disbursementAmount: toMoneyInput(project.billingConfig.disbursementAmount),
    referralFeeAmount: toMoneyInput(project.billingConfig.referralFeeAmount),
    referralFeeType: project.billingConfig.referralFeeType,
    referralFeeRecurringLimit: project.billingConfig.referralFeeRecurringLimit === null
      ? ''
      : String(project.billingConfig.referralFeeRecurringLimit),
    referralPayee: project.billingConfig.referralPayee ?? '',
    referralPayeeContactId: project.billingConfig.referralPayeeContactId ?? '',
    quantity: typeof project.billingQuantity === 'number' ? String(project.billingQuantity) : '',
    statusOverride: project.billingStatus === 'BILLED' ? 'BILLED' : null,
    tiers,
  };
}

function getDefaultFilesInlineFilters(): WorkflowFilesInlineFilters {
  return {
    linkedAt: '',
    fileName: '',
    companyName: '',
    pipelineStatus: '',
    revisionStatus: '',
    duplicateStatus: '',
    documentCategory: '',
    documentSubCategory: '',
    vendorName: '',
    documentNumber: '',
    documentDateFrom: '',
    documentDateTo: '',
    currency: '',
    subtotalFilter: undefined,
    taxFilter: undefined,
    totalFilter: undefined,
    homeCurrency: '',
    homeSubtotalFilter: undefined,
    homeTaxFilter: undefined,
    homeTotalFilter: undefined,
    uploadedFrom: '',
    uploadedTo: '',
  };
}

function getDefaultLinkModalInlineFilters(): WorkflowLinkModalInlineFilters {
  return {
    fileName: '',
    pipelineStatus: '',
    documentCategory: '',
    documentSubCategory: '',
  };
}

function uniqueSortedNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))
  ).sort((left, right) => left.localeCompare(right));
}

function filterLinkableProcessingDocuments(
  documents: ProcessingDocumentListItem[],
  filters: WorkflowLinkModalInlineFilters
): ProcessingDocumentListItem[] {
  const normalizedFileName = filters.fileName.trim().toLowerCase();

  return documents.filter((document) => {
    if (normalizedFileName && !document.document.fileName.toLowerCase().includes(normalizedFileName)) return false;
    if (filters.pipelineStatus && document.pipelineStatus !== filters.pipelineStatus) return false;
    if (filters.documentCategory && document.currentRevision?.documentCategory !== filters.documentCategory) return false;
    if (filters.documentSubCategory && document.currentRevision?.documentSubCategory !== filters.documentSubCategory) {
      return false;
    }
    return true;
  });
}

function normalizeCurrencyInput(value: string | null | undefined, fallback: string): string {
  const candidate = value?.trim().toUpperCase();
  if (candidate && /^[A-Z]{3}$/.test(candidate)) return candidate;
  return fallback;
}

function calculateTierPricing(
  tiers: WorkflowProjectBillingTier[],
  quantity: number
): {
  rows: WorkflowProjectTierCalculationRow[];
  total: number;
  unpricedQuantity: number;
} {
  if (quantity <= 0 || tiers.length === 0) {
    return { rows: [], total: 0, unpricedQuantity: Math.max(0, quantity) };
  }

  let previousUpperBound = 0;
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const tierStart = previousUpperBound + 1;
    const tierUpperBound = tier.upTo;
    const isMatched = tierUpperBound === null || quantity <= tierUpperBound;

    if (isMatched) {
      const amount = Math.round(quantity * tier.unitPrice * 100) / 100;
      return {
        rows: [
          {
            key: `${tierStart}-${tierUpperBound ?? 'open'}-${index}`,
            from: tierStart,
            to: tierUpperBound,
            quantity,
            unitPrice: tier.unitPrice,
            amount,
          },
        ],
        total: amount,
        unpricedQuantity: 0,
      };
    }

    if (tierUpperBound !== null) {
      previousUpperBound = tierUpperBound;
    }
  }

  return {
    rows: [],
    total: 0,
    unpricedQuantity: Math.max(0, quantity),
  };
}

function resolveAutoBillingStatus(
  amount: number,
  projectStatus: WorkflowProjectDetail['status']
): Exclude<WorkflowProjectBillingStatus, 'BILLED'> | null {
  if (amount <= 0) return null;
  if (projectStatus === 'COMPLETED') return 'TO_BE_BILLED';
  return 'PENDING';
}

function resolveAutoProjectStatusFromTasks(tasks: WorkflowProjectTask[]): WorkflowProjectDetail['status'] {
  const total = tasks.length;
  if (total === 0) return 'NOT_STARTED';

  const resolved = tasks.filter((task) => task.status === 'DONE' || task.status === 'SKIPPED').length;
  if (resolved >= total) return 'COMPLETED';
  if (resolved > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

function parseBillingTierDrafts(
  tiers: WorkflowProjectBillingTierDraft[]
): {
  tiers: WorkflowProjectBillingTier[];
  error: string | null;
} {
  const parsed: WorkflowProjectBillingTier[] = [];
  let previousUpTo = 0;

  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const isEmpty = tier.upTo.trim().length === 0 && tier.unitPrice.trim().length === 0;
    const hasConfiguredTierAfter = tiers.slice(index + 1).some((entry) => (
      entry.upTo.trim().length > 0 || entry.unitPrice.trim().length > 0
    ));

    if (isEmpty) {
      if (hasConfiguredTierAfter) {
        return {
          tiers: [],
          error: `Tier ${index + 1} is incomplete`,
        };
      }
      continue;
    }

    const parsedUnitPrice = parsePriceInput(tier.unitPrice);
    if (parsedUnitPrice === null) {
      return {
        tiers: [],
        error: `Tier ${index + 1} unit price is invalid`,
      };
    }

    let parsedUpTo: number | null = null;
    if (tier.upTo.trim().length > 0) {
      parsedUpTo = parsePositiveIntegerInput(tier.upTo);
      if (parsedUpTo === null) {
        return {
          tiers: [],
          error: `Tier ${index + 1} upper limit must be a positive whole number`,
        };
      }

      if (parsedUpTo <= previousUpTo) {
        return {
          tiers: [],
          error: `Tier ${index + 1} upper limit must be greater than Tier ${index}`,
        };
      }
      previousUpTo = parsedUpTo;
    } else if (hasConfiguredTierAfter) {
      return {
        tiers: [],
        error: `Tier ${index + 1} must be the last tier when upper limit is blank`,
      };
    }

    parsed.push({
      upTo: parsedUpTo,
      unitPrice: parsedUnitPrice,
    });
  }

  return {
    tiers: parsed,
    error: null,
  };
}

function compareDateOnly(left: string, right: string): number {
  return new Date(`${left}T00:00:00`).getTime() - new Date(`${right}T00:00:00`).getTime();
}

export function WorkflowProjectDetailPage({ projectId }: WorkflowProjectDetailPageProps) {
  const router = useRouter();
  const toast = useToast();
  const { data: projectDetail, isLoading, error, refetch } = useWorkflowProjectDetail(projectId);
  const updateProjectMutation = useUpdateWorkflowProject(projectId);
  const idCounterRef = useRef(1);
  const automationTriggerRef = useRef<Set<string>>(new Set());
  const dragModeRef = useRef<'GROUP' | 'TASK' | null>(null);
  const draggedGroupIdRef = useRef<string | null>(null);
  const draggedTaskRef = useRef<{ taskId: string; sourceGroupId: string } | null>(null);
  const skipNextPopStateRef = useRef(false);

  const [activeTab, setActiveTab] = useState<WorkflowProjectTab>('LIST');
  const [groups, setGroups] = useState<WorkflowTaskGroup[]>(projectDetail?.groups ?? []);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(
    () => getInitialGroupCollapseState(projectDetail ?? null)
  );
  const [quickAddDraftByGroup, setQuickAddDraftByGroup] = useState<Record<string, string>>({});
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null);
  const [renameTaskDraft, setRenameTaskDraft] = useState('');
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const [renameGroupDraft, setRenameGroupDraft] = useState('');
  const [automationGroupId, setAutomationGroupId] = useState<string | null>(null);
  const [automationDraft, setAutomationDraft] = useState<WorkflowAutomationDraft>(getDefaultAutomationDraft(''));
  const [attachModalTaskId, setAttachModalTaskId] = useState<string | null>(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const [projectTags, setProjectTags] = useState<string[]>(projectDetail?.tags ?? []);
  const [projectNotes, setProjectNotes] = useState<string>(projectDetail?.projectNotes ?? '');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState('');
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [projectEditDraft, setProjectEditDraft] = useState<WorkflowProjectEditDraft | null>(
    projectDetail ? buildProjectEditDraft(projectDetail) : null
  );
  const [billingDraft, setBillingDraft] = useState<WorkflowProjectBillingDraft | null>(
    projectDetail ? buildBillingDraft(projectDetail) : null
  );
  const [quickTierUpToDraft, setQuickTierUpToDraft] = useState('');
  const [quickTierUnitPriceDraft, setQuickTierUnitPriceDraft] = useState('');
  const [projectAttachments, setProjectAttachments] = useState<WorkflowTaskAttachment[]>(
    projectDetail?.projectAttachments ?? []
  );
  const [isFilesLinkModalOpen, setIsFilesLinkModalOpen] = useState(false);
  const [filesLinkSearch, setFilesLinkSearch] = useState('');
  const [filesLinkTargetTaskId, setFilesLinkTargetTaskId] = useState<string>('PROJECT');
  const [filesLinkInlineFilters, setFilesLinkInlineFilters] = useState<WorkflowLinkModalInlineFilters>(
    getDefaultLinkModalInlineFilters
  );
  const [attachInlineFilters, setAttachInlineFilters] = useState<WorkflowLinkModalInlineFilters>(
    getDefaultLinkModalInlineFilters
  );
  const [filesInlineFilters, setFilesInlineFilters] = useState<WorkflowFilesInlineFilters>(getDefaultFilesInlineFilters);
  const { data: filesColumnPref } = useUserPreference<Record<string, number>>(FILES_COLUMN_PREF_KEY);
  const saveFilesColumnPref = useUpsertUserPreference<Record<string, number>>();
  const [filesColumnWidths, setFilesColumnWidths] = useState<Partial<Record<FilesColumnId, number>>>({});
  const [collapsedTaskNotes, setCollapsedTaskNotes] = useState<Record<string, boolean>>({});
  const [groupDropTargetId, setGroupDropTargetId] = useState<string | null>(null);
  const [isGroupDropToEnd, setIsGroupDropToEnd] = useState(false);
  const [taskDropTarget, setTaskDropTarget] = useState<{ groupId: string; taskId: string | null } | null>(null);

  const { data: companySearch } = useCompanies({
    query: projectDetail?.clientName ?? '__workflow_no_client__',
    page: 1,
    limit: 5,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  const matchedCompany = useMemo(() => {
    if (!projectDetail) return null;
    return pickBestCompanyMatch(projectDetail.clientName, companySearch?.companies);
  }, [companySearch?.companies, projectDetail]);

  const { data: companyContactDetails } = useCompanyContactDetails(matchedCompany?.id ?? null);

  const { data: processingDocuments, isFetching: isFetchingDocuments } = useProcessingDocuments({
    page: 1,
    limit: 20,
    search: documentSearch || undefined,
    companyId: matchedCompany?.id ?? undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const { data: filesLinkDocuments, isFetching: isFetchingFilesLinkDocuments } = useProcessingDocuments({
    page: 1,
    limit: 20,
    search: filesLinkSearch || undefined,
    companyId: matchedCompany?.id ?? undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const filesLinkDocumentRows = useMemo(
    () => filesLinkDocuments?.documents ?? [],
    [filesLinkDocuments?.documents]
  );
  const attachDocumentRows = useMemo(
    () => processingDocuments?.documents ?? [],
    [processingDocuments?.documents]
  );

  const filesLinkPipelineFilterOptions = useMemo(
    () => uniqueSortedNonEmpty(filesLinkDocumentRows.map((document) => document.pipelineStatus)),
    [filesLinkDocumentRows]
  );
  const filesLinkCategoryFilterOptions = useMemo(
    () => uniqueSortedNonEmpty(filesLinkDocumentRows.map((document) => document.currentRevision?.documentCategory ?? null)),
    [filesLinkDocumentRows]
  );
  const filesLinkSubCategoryFilterOptions = useMemo(
    () => uniqueSortedNonEmpty(filesLinkDocumentRows.map((document) => document.currentRevision?.documentSubCategory ?? null)),
    [filesLinkDocumentRows]
  );

  const attachPipelineFilterOptions = useMemo(
    () => uniqueSortedNonEmpty(attachDocumentRows.map((document) => document.pipelineStatus)),
    [attachDocumentRows]
  );
  const attachCategoryFilterOptions = useMemo(
    () => uniqueSortedNonEmpty(attachDocumentRows.map((document) => document.currentRevision?.documentCategory ?? null)),
    [attachDocumentRows]
  );
  const attachSubCategoryFilterOptions = useMemo(
    () => uniqueSortedNonEmpty(attachDocumentRows.map((document) => document.currentRevision?.documentSubCategory ?? null)),
    [attachDocumentRows]
  );

  const filteredFilesLinkDocuments = useMemo(
    () => filterLinkableProcessingDocuments(filesLinkDocumentRows, filesLinkInlineFilters),
    [filesLinkDocumentRows, filesLinkInlineFilters]
  );
  const filteredAttachDocuments = useMemo(
    () => filterLinkableProcessingDocuments(attachDocumentRows, attachInlineFilters),
    [attachDocumentRows, attachInlineFilters]
  );

  useEffect(() => {
    setGroups(projectDetail?.groups ?? []);
    setCollapsedGroups(getInitialGroupCollapseState(projectDetail ?? null));
    setQuickAddDraftByGroup({});
    setOpenTaskId(null);
    setRenameTaskId(null);
    setRenameTaskDraft('');
    setRenameGroupId(null);
    setRenameGroupDraft('');
    setAutomationGroupId(null);
    setAutomationDraft(getDefaultAutomationDraft(''));
    setAttachModalTaskId(null);
    setDocumentSearch('');
    setProjectTags(projectDetail?.tags ?? []);
    setProjectNotes(projectDetail?.projectNotes ?? '');
    setIsAddingTag(false);
    setNewTagDraft('');
    setIsEditProjectModalOpen(false);
    setProjectEditDraft(projectDetail ? buildProjectEditDraft(projectDetail) : null);
    setBillingDraft(projectDetail ? buildBillingDraft(projectDetail) : null);
    setQuickTierUpToDraft('');
    setQuickTierUnitPriceDraft('');
    setProjectAttachments(projectDetail?.projectAttachments ?? []);
    if (!isFilesLinkModalOpen) {
      setFilesLinkSearch('');
      setFilesLinkTargetTaskId('PROJECT');
      setFilesLinkInlineFilters(getDefaultLinkModalInlineFilters());
    }
    setAttachInlineFilters(getDefaultLinkModalInlineFilters());
    setFilesInlineFilters(getDefaultFilesInlineFilters());
    setCollapsedTaskNotes({});
    setGroupDropTargetId(null);
    setIsGroupDropToEnd(false);
    setTaskDropTarget(null);
    dragModeRef.current = null;
    draggedGroupIdRef.current = null;
    draggedTaskRef.current = null;
    automationTriggerRef.current = new Set();
  }, [isFilesLinkModalOpen, projectDetail]);

  useEffect(() => {
    if (!automationGroupId) return;
    setAutomationDraft(getDefaultAutomationDraft(automationGroupId));
  }, [automationGroupId]);

  useEffect(() => {
    const value = filesColumnPref?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;

    const nextWidths: Partial<Record<FilesColumnId, number>> = {};
    FILES_COLUMN_IDS.forEach((columnId) => {
      const width = (value as Record<string, unknown>)[columnId];
      if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        nextWidths[columnId] = width;
      }
    });
    setFilesColumnWidths(nextWidths);
  }, [filesColumnPref?.value]);

  const allTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);
  const openTask = useMemo(() => (openTaskId ? findTaskWithGroup(groups, openTaskId)?.task ?? null : null), [groups, openTaskId]);
  const attachTask = useMemo(
    () => (attachModalTaskId ? findTaskWithGroup(groups, attachModalTaskId)?.task ?? null : null),
    [attachModalTaskId, groups]
  );
  const automationGroup = useMemo(
    () => (automationGroupId ? groups.find((group) => group.id === automationGroupId) ?? null : null),
    [automationGroupId, groups]
  );

  useEffect(() => {
    if (openTaskId && !findTaskWithGroup(groups, openTaskId)) {
      setOpenTaskId(null);
    }
  }, [groups, openTaskId]);

  const projectStats = useMemo(() => {
    const total = allTasks.length;
    const completed = allTasks.filter((task) => task.status === 'DONE').length;
    const skipped = allTasks.filter((task) => task.status === 'SKIPPED').length;
    const inProgress = allTasks.filter((task) => task.status === 'IN_PROGRESS').length;
    const waitingClient = allTasks.filter((task) => task.status === 'WAITING_CLIENT').length;
    const resolved = completed + skipped;
    const progress = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const upcoming = allTasks
      .filter((task) => task.status !== 'DONE' && task.status !== 'SKIPPED' && task.dueDate)
      .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())[0] ?? null;

    return {
      total,
      completed,
      skipped,
      inProgress,
      waitingClient,
      resolved,
      progress,
      upcoming,
    };
  }, [allTasks]);

  const recurringLabel = useMemo(() => {
    if (!projectDetail?.recurrenceMonths) return 'One-time';
    const suffix = projectDetail.recurrenceMonths === 1 ? '' : 's';
    return `Every ${projectDetail.recurrenceMonths} month${suffix}`;
  }, [projectDetail?.recurrenceMonths]);

  const autoProjectStatusPreview = useMemo<WorkflowProjectDetail['status']>(
    () => resolveAutoProjectStatusFromTasks(allTasks),
    [allTasks]
  );

  const projectStatusPreview = useMemo<WorkflowProjectDetail['status']>(() => {
    if (autoProjectStatusPreview === 'COMPLETED') return 'COMPLETED';
    return projectDetail?.projectStatusOverride ?? autoProjectStatusPreview;
  }, [autoProjectStatusPreview, projectDetail?.projectStatusOverride]);

  const taskNoteEntries = useMemo(() => {
    return groups.flatMap((group) =>
      group.tasks
        .filter((task) => hasRichTextContent(task.description))
        .map((task) => ({
          groupId: group.id,
          groupTitle: group.title,
          taskId: task.id,
          taskTitle: task.title,
          description: task.description,
        }))
    );
  }, [groups]);

  useEffect(() => {
    setCollapsedTaskNotes((previous) => {
      const next: Record<string, boolean> = {};
      taskNoteEntries.forEach((entry) => {
        next[entry.taskId] = previous[entry.taskId] ?? true;
      });

      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      const isUnchanged = previousKeys.length === nextKeys.length
        && nextKeys.every((key) => previous[key] === next[key]);
      if (isUnchanged) return previous;
      return next;
    });
  }, [taskNoteEntries]);

  const projectNotesDirty = useMemo(
    () => projectNotes !== (projectDetail?.projectNotes ?? ''),
    [projectDetail?.projectNotes, projectNotes]
  );

  const taskNotesDirty = useMemo(() => {
    if (!projectDetail) return false;

    const originalDescriptions = new Map(
      projectDetail.groups.flatMap((group) => group.tasks.map((task) => [task.id, task.description]))
    );
    const currentTaskIds = new Set(allTasks.map((task) => task.id));

    for (const task of allTasks) {
      const originalDescription = originalDescriptions.get(task.id) ?? '';
      if (task.description !== originalDescription) return true;
    }

    for (const [taskId, description] of originalDescriptions) {
      if (!currentTaskIds.has(taskId) && hasRichTextContent(description)) return true;
    }

    return false;
  }, [allTasks, projectDetail]);

  const notesDirty = projectNotesDirty || taskNotesDirty;

  const groupsDirty = useMemo(() => {
    if (!projectDetail) return false;
    return JSON.stringify(groups) !== JSON.stringify(projectDetail.groups);
  }, [groups, projectDetail]);

  const projectAttachmentsDirty = useMemo(() => {
    if (!projectDetail) return false;
    return JSON.stringify(projectAttachments) !== JSON.stringify(projectDetail.projectAttachments);
  }, [projectAttachments, projectDetail]);

  const billingDraftDirty = useMemo(() => {
    if (!projectDetail || !billingDraft) return false;
    const fallbackCurrency = projectDetail.billingConfig.currency || 'SGD';
    const baseline = buildComparableBillingDraft(buildBillingDraft(projectDetail), fallbackCurrency);
    const current = buildComparableBillingDraft(billingDraft, fallbackCurrency);
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }, [billingDraft, projectDetail]);

  const projectEditDraftDirty = useMemo(() => {
    if (!projectDetail || !projectEditDraft) return false;
    const baseline = buildComparableProjectEditDraft(buildProjectEditDraft(projectDetail));
    const current = buildComparableProjectEditDraft(projectEditDraft);
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }, [projectDetail, projectEditDraft]);

  const hasUnsavedChanges = groupsDirty
    || projectAttachmentsDirty
    || projectNotesDirty
    || billingDraftDirty
    || projectEditDraftDirty;

  useUnsavedChangesWarning(hasUnsavedChanges, !updateProjectMutation.isPending);

  const pocContacts = useMemo(() => {
    const pickDetailValue = (details: Array<{ detailType: string; value: string; isPrimary: boolean }>, type: 'EMAIL' | 'PHONE') => {
      const filtered = details.filter((detail) => detail.detailType === type && detail.value.trim().length > 0);
      if (filtered.length === 0) return '-';
      return (filtered.find((detail) => detail.isPrimary) ?? filtered[0]).value;
    };

    const pocEntries = (companyContactDetails?.contactDetails ?? []).filter((entry) => entry.isPoc && entry.contact);
    if (pocEntries.length === 0) {
      return [
        {
          id: 'fallback-poc',
          name: projectDetail?.companySnapshot.pocContact ?? '-',
          email: '-',
          phone: '-',
        },
      ];
    }

    return pocEntries.map((entry) => ({
      id: entry.contact.id,
      name: entry.contact.fullName,
      email: pickDetailValue(entry.details, 'EMAIL'),
      phone: pickDetailValue(entry.details, 'PHONE'),
    }));
  }, [companyContactDetails?.contactDetails, projectDetail?.companySnapshot.pocContact]);

  const referralPayeeContactOptions = useMemo(() => {
    const contactMap = new Map<string, { value: string; label: string; description?: string }>();

    for (const entry of companyContactDetails?.contactDetails ?? []) {
      if (!entry.contact) continue;
      if (contactMap.has(entry.contact.id)) continue;

      const primaryEmail = entry.details.find((detail) => detail.detailType === 'EMAIL' && detail.value.trim().length > 0 && detail.isPrimary)?.value
        ?? entry.details.find((detail) => detail.detailType === 'EMAIL' && detail.value.trim().length > 0)?.value
        ?? undefined;

      contactMap.set(entry.contact.id, {
        value: entry.contact.id,
        label: entry.contact.fullName,
        description: primaryEmail,
      });
    }

    return Array.from(contactMap.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [companyContactDetails?.contactDetails]);

  const referralPayeeSuggestionsId = `workflow-referral-payee-${projectId}`;

  const handleReferralPayeeInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const matchedContact = referralPayeeContactOptions.find((option) => option.label === value);

    setBillingDraft((previous) => (
      previous
        ? {
          ...previous,
          referralPayee: value,
          referralPayeeContactId: matchedContact?.value ?? '',
        }
        : previous
    ));
  }, [referralPayeeContactOptions]);

  const nextId = useCallback((prefix: string) => {
    const id = `${prefix}-${Date.now()}-${idCounterRef.current}`;
    idCounterRef.current += 1;
    return id;
  }, []);

  const parsedBillingTiers = useMemo(() => {
    if (!billingDraft) {
      return { tiers: [], error: null } as { tiers: WorkflowProjectBillingTier[]; error: string | null };
    }
    return parseBillingTierDrafts(billingDraft.tiers);
  }, [billingDraft]);

  const billingCurrency = useMemo(
    () => normalizeCurrencyInput(billingDraft?.currency, projectDetail?.billingConfig.currency ?? 'SGD'),
    [billingDraft?.currency, projectDetail?.billingConfig.currency]
  );

  const currentProjectInstanceNumber = projectDetail?.instanceNumber ?? 1;

  const tierQuantity = useMemo(() => parsePositiveIntegerInput(billingDraft?.quantity ?? '') ?? 0, [billingDraft?.quantity]);

  const tierPricingPreview = useMemo(
    () => calculateTierPricing(parsedBillingTiers.tiers, tierQuantity),
    [parsedBillingTiers.tiers, tierQuantity]
  );

  const fixedPricingPreview = useMemo(
    () => parsePriceInput(billingDraft?.fixedPrice ?? '') ?? 0,
    [billingDraft?.fixedPrice]
  );

  const disbursementAmountPreview = useMemo(
    () => parsePriceInput(billingDraft?.disbursementAmount ?? '') ?? 0,
    [billingDraft?.disbursementAmount]
  );

  const configuredReferralFeeAmountPreview = useMemo(
    () => parsePriceInput(billingDraft?.referralFeeAmount ?? '') ?? 0,
    [billingDraft?.referralFeeAmount]
  );

  const referralFeeTypePreview = billingDraft?.referralFeeType ?? 'AMOUNT';

  const referralFeeRecurringLimitPreview = useMemo(
    () => parsePositiveIntegerInput(billingDraft?.referralFeeRecurringLimit ?? ''),
    [billingDraft?.referralFeeRecurringLimit]
  );

  const referralFeeActiveForCurrentInstance = useMemo(
    () => referralFeeRecurringLimitPreview === null || currentProjectInstanceNumber <= referralFeeRecurringLimitPreview,
    [currentProjectInstanceNumber, referralFeeRecurringLimitPreview]
  );

  const effectiveReferralFeeAmountPreview = useMemo(
    () => resolveEffectiveReferralFee(
      configuredReferralFeeAmountPreview,
      fixedPricingPreview,
      referralFeeTypePreview,
      referralFeeRecurringLimitPreview,
      currentProjectInstanceNumber
    ),
    [
      configuredReferralFeeAmountPreview,
      currentProjectInstanceNumber,
      fixedPricingPreview,
      referralFeeRecurringLimitPreview,
      referralFeeTypePreview,
    ]
  );

  const fixedBillingAmountPreview = useMemo(
    () => calculateFixedBillingAmount(fixedPricingPreview, disbursementAmountPreview),
    [disbursementAmountPreview, fixedPricingPreview]
  );

  const fixedMarginPreview = useMemo(
    () => calculateFixedMargin(fixedBillingAmountPreview, disbursementAmountPreview, effectiveReferralFeeAmountPreview),
    [disbursementAmountPreview, effectiveReferralFeeAmountPreview, fixedBillingAmountPreview]
  );

  const billingPreviewAmount = useMemo(() => {
    if (!billingDraft) return 0;
    return billingDraft.mode === 'FIXED' ? fixedBillingAmountPreview : tierPricingPreview.total;
  }, [billingDraft, fixedBillingAmountPreview, tierPricingPreview.total]);

  const autoBillingStatus = useMemo(
    () => resolveAutoBillingStatus(billingPreviewAmount, projectStatusPreview),
    [billingPreviewAmount, projectStatusPreview]
  );

  const billingStatusPreview = useMemo<WorkflowProjectBillingStatus | null>(() => {
    if (billingPreviewAmount <= 0) return null;
    if (billingDraft?.statusOverride === 'BILLED') return 'BILLED';
    return autoBillingStatus;
  }, [autoBillingStatus, billingDraft?.statusOverride, billingPreviewAmount]);

  const billingStatusPayload = useMemo<WorkflowProjectBillingStatus | null>(
    () => (billingStatusPreview === 'BILLED' ? 'BILLED' : null),
    [billingStatusPreview]
  );

  const tierRatePreview = useMemo(() => {
    if (billingDraft?.mode !== 'TIERED') return null;
    return tierPricingPreview.rows[0]?.unitPrice ?? null;
  }, [billingDraft?.mode, tierPricingPreview.rows]);

  const allLinkedDocumentRows = useMemo(() => {
    const rows: WorkflowLinkedDocumentRow[] = [];
    const defaultCompanyName = matchedCompany?.name ?? projectDetail?.companySnapshot.name ?? null;

    projectAttachments.forEach((attachment) => {
      rows.push({
        key: `project-${attachment.id}`,
        attachmentId: attachment.id,
        processingDocumentId: attachment.processingDocumentId,
        documentId: attachment.documentId,
        fileName: attachment.fileName,
        linkedAt: attachment.linkedAt,
        linkedAtLabel: 'Project',
        linkedScope: 'PROJECT',
        linkedTaskId: null,
        linkedTaskTitle: 'Project',
        companyName: attachment.companyName ?? defaultCompanyName,
        pipelineStatus: attachment.pipelineStatus ?? null,
        revisionStatus: attachment.revisionStatus ?? null,
        duplicateStatus: attachment.duplicateStatus ?? null,
        documentCategory: attachment.documentCategory ?? null,
        documentSubCategory: attachment.documentSubCategory ?? null,
        vendorName: attachment.vendorName ?? null,
        documentNumber: attachment.documentNumber ?? null,
        documentDate: attachment.documentDate ?? null,
        currency: attachment.currency ?? null,
        subtotal: attachment.subtotal ?? null,
        taxAmount: attachment.taxAmount ?? null,
        totalAmount: attachment.totalAmount ?? null,
        homeCurrency: attachment.homeCurrency ?? null,
        homeSubtotal: attachment.homeSubtotal ?? null,
        homeTaxAmount: attachment.homeTaxAmount ?? null,
        homeEquivalent: attachment.homeEquivalent ?? null,
        uploadedAt: attachment.uploadedAt ?? null,
      });
    });

    groups.forEach((group) => {
      group.tasks.forEach((task) => {
        task.attachments.forEach((attachment) => {
          rows.push({
            key: `${task.id}-${attachment.id}`,
            attachmentId: attachment.id,
            processingDocumentId: attachment.processingDocumentId,
            documentId: attachment.documentId,
            fileName: attachment.fileName,
            linkedAt: attachment.linkedAt,
            linkedAtLabel: task.title,
            linkedScope: 'TASK',
            linkedTaskId: task.id,
            linkedTaskTitle: task.title,
            companyName: attachment.companyName ?? defaultCompanyName,
            pipelineStatus: attachment.pipelineStatus ?? null,
            revisionStatus: attachment.revisionStatus ?? null,
            duplicateStatus: attachment.duplicateStatus ?? null,
            documentCategory: attachment.documentCategory ?? null,
            documentSubCategory: attachment.documentSubCategory ?? null,
            vendorName: attachment.vendorName ?? null,
            documentNumber: attachment.documentNumber ?? null,
            documentDate: attachment.documentDate ?? null,
            currency: attachment.currency ?? null,
            subtotal: attachment.subtotal ?? null,
            taxAmount: attachment.taxAmount ?? null,
            totalAmount: attachment.totalAmount ?? null,
            homeCurrency: attachment.homeCurrency ?? null,
            homeSubtotal: attachment.homeSubtotal ?? null,
            homeTaxAmount: attachment.homeTaxAmount ?? null,
            homeEquivalent: attachment.homeEquivalent ?? null,
            uploadedAt: attachment.uploadedAt ?? null,
          });
        });
      });
    });

    return rows.sort((left, right) => {
      const leftTime = new Date(left.linkedAt).getTime();
      const rightTime = new Date(right.linkedAt).getTime();
      return rightTime - leftTime;
    });
  }, [groups, matchedCompany?.name, projectAttachments, projectDetail?.companySnapshot.name]);

  const filesLinkedAtFilterOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [{ value: 'PROJECT', label: 'Project' }];
    groups.forEach((group) => {
      group.tasks.forEach((task) => {
        options.push({ value: task.id, label: task.title });
      });
    });
    return options;
  }, [groups]);

  const filesCompanyFilterOptions = useMemo(() => {
    return Array.from(
      new Set(allLinkedDocumentRows.map((row) => row.companyName).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right));
  }, [allLinkedDocumentRows]);

  const filesRevisionFilterOptions = useMemo(() => {
    return Array.from(
      new Set(allLinkedDocumentRows.map((row) => row.revisionStatus).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right));
  }, [allLinkedDocumentRows]);

  const filesCategoryFilterOptions = useMemo(() => {
    return Array.from(
      new Set(allLinkedDocumentRows.map((row) => row.documentCategory).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right));
  }, [allLinkedDocumentRows]);

  const filesSubCategoryFilterOptions = useMemo(() => {
    return Array.from(
      new Set(allLinkedDocumentRows.map((row) => row.documentSubCategory).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right));
  }, [allLinkedDocumentRows]);

  const filesCurrencyFilterOptions = useMemo(() => {
    return Array.from(
      new Set(allLinkedDocumentRows.map((row) => row.currency).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right));
  }, [allLinkedDocumentRows]);

  const filesHomeCurrencyFilterOptions = useMemo(() => {
    return Array.from(
      new Set(allLinkedDocumentRows.map((row) => row.homeCurrency).filter((value): value is string => Boolean(value)))
    ).sort((left, right) => left.localeCompare(right));
  }, [allLinkedDocumentRows]);

  const filteredLinkedDocumentRows = useMemo(() => {
    const normalizedFileName = filesInlineFilters.fileName.trim().toLowerCase();
    const normalizedCompanyName = filesInlineFilters.companyName.trim().toLowerCase();
    const normalizedVendorName = filesInlineFilters.vendorName.trim().toLowerCase();
    const normalizedDocumentNumber = filesInlineFilters.documentNumber.trim().toLowerCase();

    return allLinkedDocumentRows.filter((row) => {
      if (filesInlineFilters.linkedAt) {
        if (filesInlineFilters.linkedAt === 'PROJECT') {
          if (row.linkedScope !== 'PROJECT') return false;
        } else if (row.linkedTaskId !== filesInlineFilters.linkedAt) {
          return false;
        }
      }

      if (normalizedFileName && !row.fileName.toLowerCase().includes(normalizedFileName)) return false;
      if (normalizedCompanyName && !(row.companyName ?? '').toLowerCase().includes(normalizedCompanyName)) return false;
      if (filesInlineFilters.pipelineStatus && row.pipelineStatus !== filesInlineFilters.pipelineStatus) return false;
      if (filesInlineFilters.revisionStatus && row.revisionStatus !== filesInlineFilters.revisionStatus) return false;
      if (filesInlineFilters.duplicateStatus && row.duplicateStatus !== filesInlineFilters.duplicateStatus) return false;
      if (filesInlineFilters.documentCategory && row.documentCategory !== filesInlineFilters.documentCategory) return false;
      if (filesInlineFilters.documentSubCategory && row.documentSubCategory !== filesInlineFilters.documentSubCategory) return false;
      if (normalizedVendorName && !(row.vendorName ?? '').toLowerCase().includes(normalizedVendorName)) return false;
      if (normalizedDocumentNumber && !(row.documentNumber ?? '').toLowerCase().includes(normalizedDocumentNumber)) return false;
      if (!matchesDateRange(row.documentDate, filesInlineFilters.documentDateFrom, filesInlineFilters.documentDateTo)) return false;
      if (filesInlineFilters.currency && row.currency !== filesInlineFilters.currency) return false;
      if (!matchesAmountFilter(row.subtotal, filesInlineFilters.subtotalFilter)) return false;
      if (!matchesAmountFilter(row.taxAmount, filesInlineFilters.taxFilter)) return false;
      if (!matchesAmountFilter(row.totalAmount, filesInlineFilters.totalFilter)) return false;
      if (filesInlineFilters.homeCurrency && row.homeCurrency !== filesInlineFilters.homeCurrency) return false;
      if (!matchesAmountFilter(row.homeSubtotal, filesInlineFilters.homeSubtotalFilter)) return false;
      if (!matchesAmountFilter(row.homeTaxAmount, filesInlineFilters.homeTaxFilter)) return false;
      if (!matchesAmountFilter(row.homeEquivalent, filesInlineFilters.homeTotalFilter)) return false;
      if (!matchesDateRange(row.uploadedAt, filesInlineFilters.uploadedFrom, filesInlineFilters.uploadedTo)) return false;

      return true;
    });
  }, [allLinkedDocumentRows, filesInlineFilters]);

  const getFilesColumnWidth = useCallback((columnId: FilesColumnId): number => {
    const preferredWidth = filesColumnWidths[columnId];
    if (typeof preferredWidth === 'number' && Number.isFinite(preferredWidth) && preferredWidth > 0) {
      return preferredWidth;
    }
    return FILES_COLUMN_DEFAULT_WIDTHS[columnId];
  }, [filesColumnWidths]);

  const startFilesColumnResize = useCallback((event: React.PointerEvent<HTMLDivElement>, columnId: FilesColumnId) => {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const tableHeader = handle.closest('th');
    const startWidth = filesColumnWidths[columnId]
      ?? tableHeader?.getBoundingClientRect().width
      ?? FILES_COLUMN_DEFAULT_WIDTHS[columnId];
    const pointerId = event.pointerId;
    const startX = event.clientX;
    let latestWidth = startWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // ignore
    }

    const onPointerMove = (pointerEvent: PointerEvent) => {
      const nextWidth = Math.max(1, startWidth + (pointerEvent.clientX - startX));
      latestWidth = nextWidth;
      setFilesColumnWidths((previous) => ({ ...previous, [columnId]: nextWidth }));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }

      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      const nextWidths = { ...filesColumnWidths, [columnId]: latestWidth };
      setFilesColumnWidths(nextWidths);
      saveFilesColumnPref.mutate({ key: FILES_COLUMN_PREF_KEY, value: nextWidths });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [filesColumnWidths, saveFilesColumnPref]);

  const updateBillingTierDraft = useCallback((tierId: string, field: 'upTo' | 'unitPrice', value: string) => {
    setBillingDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        tiers: previous.tiers.map((tier) => (
          tier.id === tierId
            ? { ...tier, [field]: value }
            : tier
        )),
      };
    });
  }, []);

  const removeBillingTierDraft = useCallback((tierId: string) => {
    setBillingDraft((previous) => {
      if (!previous) return previous;
      const remaining = previous.tiers.filter((tier) => tier.id !== tierId);
      return {
        ...previous,
        tiers: remaining.length > 0 ? remaining : [{ id: nextId('workflow-billing-tier'), upTo: '', unitPrice: '' }],
      };
    });
  }, [nextId]);

  const commitQuickAddTier = useCallback(() => {
    const upToDraft = quickTierUpToDraft.trim();
    const unitPriceDraft = quickTierUnitPriceDraft.trim();
    if (!upToDraft && !unitPriceDraft) return;

    const parsedUnitPrice = parsePriceInput(unitPriceDraft);
    if (parsedUnitPrice === null) {
      toast.error('Tier unit price is invalid');
      return;
    }

    let normalizedUpTo = '';
    if (upToDraft) {
      const parsedUpTo = parsePositiveIntegerInput(upToDraft);
      if (parsedUpTo === null) {
        toast.error('Tier upper limit must be a positive whole number');
        return;
      }
      normalizedUpTo = String(parsedUpTo);
    }

    const tierId = nextId('workflow-billing-tier');
    setBillingDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        tiers: [
          ...previous.tiers,
          {
            id: tierId,
            upTo: normalizedUpTo,
            unitPrice: parsedUnitPrice.toFixed(2),
          },
        ],
      };
    });

    setQuickTierUpToDraft('');
    setQuickTierUnitPriceDraft('');
  }, [nextId, quickTierUnitPriceDraft, quickTierUpToDraft, toast]);

  const saveBillingConfig = useCallback(async () => {
    if (!projectDetail || !billingDraft) return;

    const currency = normalizeCurrencyInput(billingDraft.currency, projectDetail.billingConfig.currency || 'SGD');
    const parsedFixedPrice = parsePriceInput(billingDraft.fixedPrice);
    const parsedDisbursementAmount = parsePriceInput(billingDraft.disbursementAmount);
    const parsedReferralFeeAmount = parsePriceInput(billingDraft.referralFeeAmount);
    const parsedReferralFeeRecurringLimit = parsePositiveIntegerInput(billingDraft.referralFeeRecurringLimit);
    const referralFeeType = billingDraft.referralFeeType;
    const referralPayee = billingDraft.referralPayee.trim();
    const referralPayeeContactId = billingDraft.referralPayeeContactId.trim() || null;
    const parsedTiers = parseBillingTierDrafts(billingDraft.tiers);
    const parsedBillingQuantity = parseNonNegativeIntegerInput(billingDraft.quantity);

    if (billingDraft.quantity.trim().length > 0 && parsedBillingQuantity === null) {
      toast.error('Actual quantity must be a whole number that is zero or more');
      return;
    }

    if (billingDraft.mode === 'FIXED' && parsedFixedPrice === null) {
      toast.error('Fixed pricing amount is required');
      return;
    }

    if (billingDraft.disbursementAmount.trim().length > 0 && parsedDisbursementAmount === null) {
      toast.error('Disbursement amount must be zero or more');
      return;
    }

    if (billingDraft.referralFeeAmount.trim().length > 0 && parsedReferralFeeAmount === null) {
      toast.error('Referral fee must be zero or more');
      return;
    }

    if (referralFeeType === 'PERCENTAGE' && (parsedReferralFeeAmount ?? 0) > 100) {
      toast.error('Referral percentage cannot exceed 100');
      return;
    }

    if (billingDraft.referralFeeRecurringLimit.trim().length > 0 && parsedReferralFeeRecurringLimit === null) {
      toast.error('Referral cycle limit must be a positive whole number');
      return;
    }

    if ((parsedReferralFeeAmount ?? 0) > 0 && referralPayee.length === 0) {
      toast.error('Referral payee is required when a referral fee is entered');
      return;
    }

    if (billingDraft.mode === 'TIERED') {
      if (parsedTiers.error) {
        toast.error(parsedTiers.error);
        return;
      }
      if (parsedTiers.tiers.length === 0) {
        toast.error('At least one pricing tier is required');
        return;
      }
    }

    const tiersForPayload = billingDraft.mode === 'TIERED'
      ? parsedTiers.tiers
      : (parsedTiers.error ? projectDetail.billingConfig.tiers : parsedTiers.tiers);

    try {
      await updateProjectMutation.mutateAsync({
        name: projectDetail.name,
        startDate: projectDetail.startDate,
        dueDate: projectDetail.dueDate,
        recurrenceMonths: projectDetail.recurrenceMonths,
        billingConfig: {
          mode: billingDraft.mode,
          currency,
          fixedPrice: parsedFixedPrice ?? projectDetail.billingConfig.fixedPrice ?? 0,
          disbursementAmount: parsedDisbursementAmount,
          referralFeeAmount: parsedReferralFeeAmount,
          referralFeeType,
          referralFeeRecurringLimit: parsedReferralFeeRecurringLimit,
          referralPayee,
          referralPayeeContactId,
          tiers: tiersForPayload,
        },
        workspaceState: {
          groups,
          projectAttachments,
          billingQuantity: parsedBillingQuantity,
          billingStatus: billingStatusPayload,
          projectNotes,
        },
      });
      toast.success('Billing settings updated');
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to update billing settings');
    }
  }, [billingDraft, billingStatusPayload, groups, projectAttachments, projectDetail, projectNotes, toast, updateProjectMutation]);

  const saveWorkspaceRecords = useCallback(async () => {
    if (!projectDetail || !billingDraft) return;

    const currency = normalizeCurrencyInput(billingDraft.currency, projectDetail.billingConfig.currency || 'SGD');
    const parsedFixedPrice = parsePriceInput(billingDraft.fixedPrice);
    const parsedDisbursementAmount = parsePriceInput(billingDraft.disbursementAmount);
    const parsedReferralFeeAmount = parsePriceInput(billingDraft.referralFeeAmount);
    const parsedReferralFeeRecurringLimit = parsePositiveIntegerInput(billingDraft.referralFeeRecurringLimit);
    const referralFeeType = billingDraft.referralFeeType;
    const referralPayee = billingDraft.referralPayee.trim();
    const referralPayeeContactId = billingDraft.referralPayeeContactId.trim() || null;
    const parsedTiers = parseBillingTierDrafts(billingDraft.tiers);
    const parsedBillingQuantity = parseNonNegativeIntegerInput(billingDraft.quantity);

    if (billingDraft.quantity.trim().length > 0 && parsedBillingQuantity === null) {
      toast.error('Actual quantity must be a whole number that is zero or more');
      return;
    }

    if (billingDraft.mode === 'FIXED' && parsedFixedPrice === null) {
      toast.error('Fixed pricing amount is required');
      return;
    }

    if (billingDraft.disbursementAmount.trim().length > 0 && parsedDisbursementAmount === null) {
      toast.error('Disbursement amount must be zero or more');
      return;
    }

    if (billingDraft.referralFeeAmount.trim().length > 0 && parsedReferralFeeAmount === null) {
      toast.error('Referral fee must be zero or more');
      return;
    }

    if (referralFeeType === 'PERCENTAGE' && (parsedReferralFeeAmount ?? 0) > 100) {
      toast.error('Referral percentage cannot exceed 100');
      return;
    }

    if (billingDraft.referralFeeRecurringLimit.trim().length > 0 && parsedReferralFeeRecurringLimit === null) {
      toast.error('Referral cycle limit must be a positive whole number');
      return;
    }

    if ((parsedReferralFeeAmount ?? 0) > 0 && referralPayee.length === 0) {
      toast.error('Referral payee is required when a referral fee is entered');
      return;
    }

    if (billingDraft.mode === 'TIERED') {
      if (parsedTiers.error) {
        toast.error(parsedTiers.error);
        return;
      }
      if (parsedTiers.tiers.length === 0) {
        toast.error('At least one pricing tier is required');
        return;
      }
    }

    const tiersForPayload = billingDraft.mode === 'TIERED'
      ? parsedTiers.tiers
      : (parsedTiers.error ? projectDetail.billingConfig.tiers : parsedTiers.tiers);

    try {
      await updateProjectMutation.mutateAsync({
        name: projectDetail.name,
        startDate: projectDetail.startDate,
        dueDate: projectDetail.dueDate,
        recurrenceMonths: projectDetail.recurrenceMonths,
        billingConfig: {
          mode: billingDraft.mode,
          currency,
          fixedPrice: parsedFixedPrice ?? projectDetail.billingConfig.fixedPrice ?? 0,
          disbursementAmount: parsedDisbursementAmount,
          referralFeeAmount: parsedReferralFeeAmount,
          referralFeeType,
          referralFeeRecurringLimit: parsedReferralFeeRecurringLimit,
          referralPayee,
          referralPayeeContactId,
          tiers: tiersForPayload,
        },
        workspaceState: {
          groups,
          projectAttachments,
          billingQuantity: parsedBillingQuantity,
          billingStatus: billingStatusPayload,
          projectNotes,
        },
      });
      toast.success('Project records saved');
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save project records');
    }
  }, [billingDraft, billingStatusPayload, groups, projectAttachments, projectDetail, projectNotes, toast, updateProjectMutation]);

  const resetNotesDraft = useCallback(() => {
    if (!projectDetail) return;
    setProjectNotes(projectDetail.projectNotes);

    const descriptionByTaskId = new Map(
      projectDetail.groups.flatMap((group) => group.tasks.map((task) => [task.id, task.description]))
    );

    setGroups((previous) =>
      previous.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) => {
          const originalDescription = descriptionByTaskId.get(task.id);
          if (originalDescription === undefined || task.description === originalDescription) return task;
          return { ...task, description: originalDescription };
        }),
      }))
    );
  }, [projectDetail]);

  const toggleTaskNoteCollapse = useCallback((taskId: string) => {
    setCollapsedTaskNotes((previous) => ({
      ...previous,
      [taskId]: !(previous[taskId] ?? true),
    }));
  }, []);

  const updateTask = useCallback((taskId: string, updater: (task: WorkflowProjectTask) => WorkflowProjectTask) => {
    setGroups((previous) => updateTaskInGroups(previous, taskId, updater));
  }, []);

  const persistLinkedDocuments = useCallback(async (
    nextGroups: WorkflowTaskGroup[],
    nextProjectAttachments: WorkflowTaskAttachment[]
  ) => {
    if (!projectDetail) return false;
    try {
      await updateProjectMutation.mutateAsync({
        name: projectDetail.name,
        startDate: projectDetail.startDate,
        dueDate: projectDetail.dueDate,
        recurrenceMonths: projectDetail.recurrenceMonths,
        workspaceState: {
          groups: nextGroups,
          projectAttachments: nextProjectAttachments,
        },
      });
      return true;
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to save linked documents');
      return false;
    }
  }, [projectDetail, toast, updateProjectMutation]);

  const createAttachmentFromProcessingDocument = useCallback((
    document: ProcessingDocumentListItem,
    linkedScope: 'PROJECT' | 'TASK',
    linkedTaskId: string | null
  ): WorkflowTaskAttachment => {
    const revision = document.currentRevision;
    return {
      id: nextId('workflow-attachment'),
      processingDocumentId: document.id,
      documentId: document.documentId,
      fileName: document.document.fileName,
      linkedAt: new Date().toISOString(),
      linkedScope,
      linkedTaskId,
      pipelineStatus: document.pipelineStatus,
      revisionStatus: revision?.status ?? null,
      duplicateStatus: document.duplicateStatus,
      documentCategory: revision?.documentCategory ?? null,
      documentSubCategory: revision?.documentSubCategory ?? null,
      vendorName: revision?.vendorName ?? null,
      documentNumber: revision?.documentNumber ?? null,
      documentDate: revision?.documentDate ?? null,
      currency: revision?.currency ?? null,
      subtotal: revision?.subtotal ?? null,
      taxAmount: revision?.taxAmount ?? null,
      totalAmount: revision?.totalAmount ?? null,
      homeCurrency: revision?.homeCurrency ?? null,
      homeSubtotal: revision?.homeSubtotal ?? null,
      homeTaxAmount: revision?.homeTaxAmount ?? null,
      homeEquivalent: revision?.homeEquivalent ?? null,
      companyName: document.document.company?.name ?? null,
      uploadedAt: document.createdAt,
    };
  }, [nextId]);

  const linkDocumentToProject = useCallback(async (document: ProcessingDocumentListItem) => {
    const attachment = createAttachmentFromProcessingDocument(document, 'PROJECT', null);
    const alreadyExists = projectAttachments.some((entry) => entry.processingDocumentId === attachment.processingDocumentId);
    if (alreadyExists) return;

    const nextProjectAttachments = [...projectAttachments, attachment];
    setProjectAttachments(nextProjectAttachments);

    const persisted = await persistLinkedDocuments(groups, nextProjectAttachments);
    if (!persisted) {
      setProjectAttachments(projectAttachments);
    }
  }, [createAttachmentFromProcessingDocument, groups, persistLinkedDocuments, projectAttachments]);

  const linkDocumentToTask = useCallback(async (taskId: string, document: ProcessingDocumentListItem) => {
    const attachment = createAttachmentFromProcessingDocument(document, 'TASK', taskId);
    const nextGroups = updateTaskInGroups(groups, taskId, (task) => {
      const alreadyAttached = task.attachments.some(
        (entry) => entry.processingDocumentId === attachment.processingDocumentId
      );
      if (alreadyAttached) return task;
      return {
        ...task,
        attachments: [...task.attachments, attachment],
      };
    });
    if (nextGroups === groups) return;

    setGroups(nextGroups);
    const persisted = await persistLinkedDocuments(nextGroups, projectAttachments);
    if (!persisted) {
      setGroups(groups);
    }
  }, [createAttachmentFromProcessingDocument, groups, persistLinkedDocuments, projectAttachments]);

  const filesLinkTargetTask = useMemo(
    () => (filesLinkTargetTaskId === 'PROJECT' ? null : allTasks.find((task) => task.id === filesLinkTargetTaskId) ?? null),
    [allTasks, filesLinkTargetTaskId]
  );

  const activeFilesLinkDocumentIds = useMemo(() => {
    if (filesLinkTargetTaskId === 'PROJECT') {
      return new Set(projectAttachments.map((attachment) => attachment.processingDocumentId));
    }

    const targetTask = allTasks.find((task) => task.id === filesLinkTargetTaskId);
    return new Set(targetTask?.attachments.map((attachment) => attachment.processingDocumentId) ?? []);
  }, [allTasks, filesLinkTargetTaskId, projectAttachments]);

  const openFilesLinkModal = useCallback(() => {
    setFilesLinkSearch('');
    setFilesLinkTargetTaskId('PROJECT');
    setFilesLinkInlineFilters(getDefaultLinkModalInlineFilters());
    setIsFilesLinkModalOpen(true);
  }, []);

  const closeFilesLinkModal = useCallback(() => {
    setIsFilesLinkModalOpen(false);
  }, []);

  const openFilesUploadPage = useCallback(() => {
    window.open('/processing/upload', '_blank', 'noopener,noreferrer');
  }, []);

  const linkDocumentFromFilesModal = useCallback(async (document: ProcessingDocumentListItem) => {
    if (filesLinkTargetTaskId === 'PROJECT') {
      await linkDocumentToProject(document);
      return;
    }

    await linkDocumentToTask(filesLinkTargetTaskId, document);
  }, [filesLinkTargetTaskId, linkDocumentToProject, linkDocumentToTask]);

  const addTaskToGroup = useCallback((groupId: string | null, title?: string) => {
    if (!projectDetail || !groupId) return;
    const targetGroup = groups.find((group) => group.id === groupId);
    if (!targetGroup) return;

    const taskId = nextId('workflow-task');
    const newTask = createTask(
      taskId,
      targetGroup.lane,
      projectDetail.assignees[0] ?? null,
      projectDetail.nextTaskDueDate ?? projectDetail.dueDate,
      title
    );

    setGroups((previous) =>
      previous.map((group) => (group.id === groupId ? { ...group, tasks: [...group.tasks, newTask] } : group))
    );
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setOpenTaskId(taskId);
  }, [groups, nextId, projectDetail]);

  const removeGrouping = useCallback((groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) return;

    const removedTaskIds = new Set(group.tasks.map((task) => task.id));
    setGroups((previous) => previous.filter((entry) => entry.id !== groupId));
    setCollapsedGroups((previous) => {
      const next = { ...previous };
      delete next[groupId];
      return next;
    });
    setQuickAddDraftByGroup((previous) => {
      const next = { ...previous };
      delete next[groupId];
      return next;
    });

    if (openTaskId && removedTaskIds.has(openTaskId)) setOpenTaskId(null);
    if (automationGroupId === groupId) setAutomationGroupId(null);
    if (renameGroupId === groupId) {
      setRenameGroupId(null);
      setRenameGroupDraft('');
    }
  }, [automationGroupId, groups, openTaskId, renameGroupId]);

  const addGrouping = useCallback(() => {
    const groupId = nextId('workflow-group');
    const newGroup: WorkflowTaskGroup = {
      id: groupId,
      lane: 'CUSTOM',
      title: 'New Group',
      tasks: [],
      automations: [],
    };
    setGroups((previous) => [...previous, newGroup]);
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    setRenameGroupId(groupId);
    setRenameGroupDraft(newGroup.title);
    setQuickAddDraftByGroup((previous) => ({ ...previous, [groupId]: '' }));
  }, [nextId]);

  const setTaskStatus = useCallback((taskId: string, nextStatus: WorkflowTaskStatus) => {
    if (!projectDetail) return;

    setGroups((previous) => {
      const located = findTaskWithGroup(previous, taskId);
      if (!located || located.task.status === nextStatus) return previous;

      let nextGroups = updateTaskInGroups(previous, taskId, (task) => ({ ...task, status: nextStatus }));

      const condition: AutomationCondition | null =
        nextStatus === 'DONE' ? 'TASK_DONE' : nextStatus === 'SKIPPED' ? 'TASK_SKIPPED' : null;
      if (!condition) return nextGroups;

      const matchingRules = located.group.automations.filter(
        (rule) => rule.enabled && rule.condition === condition && rule.action === 'CREATE_FOLLOW_UP'
      );
      if (matchingRules.length === 0) return nextGroups;

      for (const rule of matchingRules) {
        const triggerKey = `${rule.id}:${taskId}:${condition}`;
        if (automationTriggerRef.current.has(triggerKey)) continue;
        automationTriggerRef.current.add(triggerKey);

        const targetGroup = nextGroups.find((group) => group.id === rule.targetGroupId) ?? nextGroups[located.groupIndex];
        if (!targetGroup) continue;

        const followUpTaskId = nextId('workflow-task');
        const followUpTitle = (rule.followUpTitleTemplate || 'Follow-up: {{taskTitle}}').replace('{{taskTitle}}', located.task.title);
        const followUpTask = createTask(
          followUpTaskId,
          targetGroup.lane,
          located.task.assignee,
          located.task.dueDate,
          followUpTitle
        );
        followUpTask.priority = located.task.priority;
        followUpTask.description = `Automatically generated from "${located.task.title}" by rule "${rule.name}".`;

        nextGroups = nextGroups.map((group) =>
          group.id === targetGroup.id ? { ...group, tasks: [...group.tasks, followUpTask] } : group
        );
      }

      return nextGroups;
    });
  }, [nextId, projectDetail]);

  const setTaskPriority = useCallback((taskId: string, priority: WorkflowTaskPriority) => {
    updateTask(taskId, (task) => ({ ...task, priority }));
  }, [updateTask]);

  const setTaskAssignee = useCallback((taskId: string, assignee: string | null) => {
    updateTask(taskId, (task) => ({ ...task, assignee }));
  }, [updateTask]);

  const startAddProjectTag = useCallback(() => {
    setIsAddingTag(true);
    setNewTagDraft('');
  }, []);

  const cancelAddProjectTag = useCallback(() => {
    setIsAddingTag(false);
    setNewTagDraft('');
  }, []);

  const commitAddProjectTag = useCallback(() => {
    const normalizedTag = newTagDraft.trim();
    if (!normalizedTag) {
      cancelAddProjectTag();
      return;
    }

    setProjectTags((previous) => {
      const alreadyExists = previous.some((tag) => tag.toLowerCase() === normalizedTag.toLowerCase());
      if (alreadyExists) return previous;
      return [...previous, normalizedTag];
    });
    cancelAddProjectTag();
  }, [cancelAddProjectTag, newTagDraft]);

  const openProjectEditModal = useCallback(() => {
    if (!projectDetail) return;
    setProjectEditDraft(buildProjectEditDraft(projectDetail));
    setIsEditProjectModalOpen(true);
  }, [projectDetail]);

  const closeProjectEditModal = useCallback(() => {
    setIsEditProjectModalOpen(false);
  }, []);

  const confirmExitWithoutSaving = useCallback(() => {
    if (!hasUnsavedChanges || updateProjectMutation.isPending) return true;
    return window.confirm(UNSAVED_CHANGES_PROMPT_MESSAGE);
  }, [hasUnsavedChanges, updateProjectMutation.isPending]);

  const navigateBackToProjects = useCallback(() => {
    if (!confirmExitWithoutSaving()) return;
    router.push('/workflow/projects');
  }, [confirmExitWithoutSaving, router]);

  useEffect(() => {
    if (!hasUnsavedChanges || updateProjectMutation.isPending) return;

    const handleNavigationClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest('a');
      if (!anchor) return;
      if (anchor.target?.toLowerCase() === '_blank') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (destination.origin !== window.location.origin) return;

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const destinationPath = `${destination.pathname}${destination.search}${destination.hash}`;
      if (destinationPath === currentPath) return;

      if (!confirmExitWithoutSaving()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handlePopState = () => {
      if (skipNextPopStateRef.current) {
        skipNextPopStateRef.current = false;
        return;
      }

      if (confirmExitWithoutSaving()) return;

      skipNextPopStateRef.current = true;
      window.history.go(1);
    };

    document.addEventListener('click', handleNavigationClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleNavigationClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [confirmExitWithoutSaving, hasUnsavedChanges, updateProjectMutation.isPending]);

  const saveProjectEdit = useCallback(async () => {
    if (!projectEditDraft) return;

    const trimmedName = projectEditDraft.name.trim();
    if (!trimmedName) {
      toast.error('Project name is required');
      return;
    }

    if (!projectEditDraft.startDate || !projectEditDraft.dueDate) {
      toast.error('Start date and end date are required');
      return;
    }

    if (compareDateOnly(projectEditDraft.dueDate, projectEditDraft.startDate) < 0) {
      toast.error('End date must be on or after start date');
      return;
    }

    let recurrenceMonths: number | null = null;
    if (projectEditDraft.recurrenceMode === 'MONTHLY') {
      const parsedMonths = Number(projectEditDraft.recurrenceMonths);
      if (!Number.isInteger(parsedMonths) || parsedMonths <= 0) {
        toast.error('Recurring months must be a positive whole number');
        return;
      }
      recurrenceMonths = parsedMonths;
    }

    try {
      await updateProjectMutation.mutateAsync({
        name: trimmedName,
        startDate: projectEditDraft.startDate,
        dueDate: projectEditDraft.dueDate,
        recurrenceMonths,
        billingConfig: projectDetail?.billingConfig,
        workspaceState: {
          groups,
          projectAttachments,
          projectStatusOverride: projectEditDraft.statusOverride === 'AUTO'
            ? null
            : projectEditDraft.statusOverride,
          projectNotes,
        },
      });
      toast.success('Project updated');
      setIsEditProjectModalOpen(false);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : 'Failed to update project');
    }
  }, [groups, projectDetail?.billingConfig, projectAttachments, projectEditDraft, projectNotes, toast, updateProjectMutation]);

  const copyContactValue = useCallback(async (value: string, label: string) => {
    if (!value || value === '-') return;

    if (!navigator?.clipboard?.writeText) {
      toast.error('Clipboard is not available');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }, [toast]);

  const openAttachmentModal = useCallback((taskId: string) => {
    setAttachModalTaskId(taskId);
    setDocumentSearch('');
    setAttachInlineFilters(getDefaultLinkModalInlineFilters());
  }, []);

  const addSubtask = useCallback((taskId: string) => {
    const subtaskId = nextId('workflow-subtask');
    updateTask(taskId, (task) => ({
      ...task,
      subtasks: [...task.subtasks, { id: subtaskId, title: 'New subtask', completed: false }],
    }));
    setOpenTaskId(taskId);
  }, [nextId, updateTask]);

  const attachDocumentToTask = useCallback((taskId: string, document: ProcessingDocumentListItem) => {
    void linkDocumentToTask(taskId, document);
  }, [linkDocumentToTask]);

  const removeAttachmentFromTask = useCallback(async (taskId: string, attachmentId: string) => {
    const nextGroups = updateTaskInGroups(groups, taskId, (task) => ({
      ...task,
      attachments: task.attachments.filter((attachment) => attachment.id !== attachmentId),
    }));
    if (nextGroups === groups) return;

    setGroups(nextGroups);
    const persisted = await persistLinkedDocuments(nextGroups, projectAttachments);
    if (!persisted) {
      setGroups(groups);
    }
  }, [groups, persistLinkedDocuments, projectAttachments]);

  const removeProjectAttachment = useCallback(async (attachmentId: string) => {
    const nextProjectAttachments = projectAttachments.filter((attachment) => attachment.id !== attachmentId);
    if (nextProjectAttachments.length === projectAttachments.length) return;

    setProjectAttachments(nextProjectAttachments);
    const persisted = await persistLinkedDocuments(groups, nextProjectAttachments);
    if (!persisted) {
      setProjectAttachments(projectAttachments);
    }
  }, [groups, persistLinkedDocuments, projectAttachments]);

  const startTaskRename = useCallback((taskId: string) => {
    const task = findTaskWithGroup(groups, taskId)?.task;
    if (!task) return;
    setRenameTaskId(taskId);
    setRenameTaskDraft(task.title);
  }, [groups]);

  const commitTaskRename = useCallback((taskId: string) => {
    const title = renameTaskDraft.trim();
    if (!title) {
      setRenameTaskId(null);
      setRenameTaskDraft('');
      return;
    }
    updateTask(taskId, (task) => ({ ...task, title }));
    setRenameTaskId(null);
    setRenameTaskDraft('');
  }, [renameTaskDraft, updateTask]);

  const cancelTaskRename = useCallback(() => {
    setRenameTaskId(null);
    setRenameTaskDraft('');
  }, []);

  const startGroupRename = useCallback((groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) return;
    setRenameGroupId(groupId);
    setRenameGroupDraft(group.title);
  }, [groups]);

  const commitGroupRename = useCallback((groupId: string) => {
    const title = renameGroupDraft.trim();
    if (!title) {
      setRenameGroupId(null);
      setRenameGroupDraft('');
      return;
    }
    setGroups((previous) =>
      previous.map((group) => (group.id === groupId ? { ...group, title } : group))
    );
    setRenameGroupId(null);
    setRenameGroupDraft('');
  }, [renameGroupDraft]);

  const cancelGroupRename = useCallback(() => {
    setRenameGroupId(null);
    setRenameGroupDraft('');
  }, []);

  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: !previous[groupId] }));
  }, []);

  const setQuickAddDraft = useCallback((groupId: string, draft: string) => {
    setQuickAddDraftByGroup((previous) => ({ ...previous, [groupId]: draft }));
  }, []);

  const commitQuickAdd = useCallback((groupId: string) => {
    const draft = quickAddDraftByGroup[groupId]?.trim();
    if (!draft) return;
    addTaskToGroup(groupId, draft);
    setQuickAddDraftByGroup((previous) => ({ ...previous, [groupId]: '' }));
  }, [addTaskToGroup, quickAddDraftByGroup]);

  const deleteTask = useCallback((taskId: string) => {
    setGroups((previous) =>
      previous.map((group) => ({
        ...group,
        tasks: group.tasks.filter((task) => task.id !== taskId),
      }))
    );
    if (openTaskId === taskId) setOpenTaskId(null);
    if (renameTaskId === taskId) {
      setRenameTaskId(null);
      setRenameTaskDraft('');
    }
    if (attachModalTaskId === taskId) setAttachModalTaskId(null);
  }, [attachModalTaskId, openTaskId, renameTaskId]);

  const openTaskPanel = useCallback((taskId: string) => {
    setOpenTaskId(taskId);
    setRenameTaskId(null);
    setRenameTaskDraft('');
  }, []);

  const updateGroupAutomation = useCallback((
    groupId: string,
    updater: (automations: WorkflowAutomationRule[]) => WorkflowAutomationRule[]
  ) => {
    setGroups((previous) =>
      previous.map((group) =>
        group.id === groupId
          ? {
            ...group,
            automations: updater(group.automations),
          }
          : group
      )
    );
  }, []);

  const addAutomationRule = useCallback(() => {
    if (!automationGroupId || !automationDraft.targetGroupId) return;
    const name = automationDraft.name.trim() || `Rule ${Date.now().toString().slice(-4)}`;
    const rule: WorkflowAutomationRule = {
      id: nextId('workflow-rule'),
      name,
      condition: automationDraft.condition,
      action: 'CREATE_FOLLOW_UP',
      targetGroupId: automationDraft.targetGroupId,
      followUpTitleTemplate: automationDraft.followUpTitleTemplate.trim() || 'Follow-up: {{taskTitle}}',
      enabled: automationDraft.enabled,
    };
    updateGroupAutomation(automationGroupId, (automations) => [...automations, rule]);
    setAutomationDraft(getDefaultAutomationDraft(automationGroupId));
  }, [automationDraft, automationGroupId, nextId, updateGroupAutomation]);

  const updateAutomationRule = useCallback((groupId: string, ruleId: string, updater: (rule: WorkflowAutomationRule) => WorkflowAutomationRule) => {
    updateGroupAutomation(groupId, (automations) =>
      automations.map((rule) => (rule.id === ruleId ? updater(rule) : rule))
    );
  }, [updateGroupAutomation]);

  const removeAutomationRule = useCallback((groupId: string, ruleId: string) => {
    updateGroupAutomation(groupId, (automations) => automations.filter((rule) => rule.id !== ruleId));
  }, [updateGroupAutomation]);

  const resetDragState = useCallback(() => {
    dragModeRef.current = null;
    draggedGroupIdRef.current = null;
    draggedTaskRef.current = null;
    setGroupDropTargetId(null);
    setIsGroupDropToEnd(false);
    setTaskDropTarget(null);
  }, []);

  const startGroupDrag = useCallback((groupId: string, event: DragEvent<HTMLElement>) => {
    dragModeRef.current = 'GROUP';
    draggedGroupIdRef.current = groupId;
    setIsGroupDropToEnd(false);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', groupId);
  }, []);

  const handleGroupDragOver = useCallback((groupId: string, event: DragEvent<HTMLElement>) => {
    if (dragModeRef.current !== 'GROUP') return;
    const draggedGroupId = draggedGroupIdRef.current;
    if (!draggedGroupId || draggedGroupId === groupId) {
      setGroupDropTargetId(null);
      setIsGroupDropToEnd(false);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setGroupDropTargetId(groupId);
    setIsGroupDropToEnd(false);
  }, []);

  const handleGroupDrop = useCallback((groupId: string, event: DragEvent<HTMLElement>) => {
    if (dragModeRef.current !== 'GROUP') return;
    event.preventDefault();
    event.stopPropagation();
    const draggedGroupId = draggedGroupIdRef.current;
    if (!draggedGroupId || draggedGroupId === groupId) {
      resetDragState();
      return;
    }
    setGroups((previous) => moveGroupBefore(previous, draggedGroupId, groupId));
    resetDragState();
  }, [resetDragState]);

  const handleGroupDragOverEnd = useCallback((event: DragEvent<HTMLElement>) => {
    if (dragModeRef.current !== 'GROUP') return;
    if (!draggedGroupIdRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setGroupDropTargetId(null);
    setIsGroupDropToEnd(true);
  }, []);

  const handleGroupDropToEnd = useCallback((event: DragEvent<HTMLElement>) => {
    if (dragModeRef.current !== 'GROUP') return;
    event.preventDefault();
    event.stopPropagation();
    const draggedGroupId = draggedGroupIdRef.current;
    if (!draggedGroupId) {
      resetDragState();
      return;
    }
    setGroups((previous) => moveGroupToEnd(previous, draggedGroupId));
    resetDragState();
  }, [resetDragState]);

  const startTaskDrag = useCallback((
    sourceGroupId: string,
    taskId: string,
    event: DragEvent<HTMLElement>
  ) => {
    dragModeRef.current = 'TASK';
    draggedTaskRef.current = { taskId, sourceGroupId };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
  }, []);

  const handleTaskDragOver = useCallback((
    groupId: string,
    targetTaskId: string | null,
    event: DragEvent<HTMLElement>
  ) => {
    if (dragModeRef.current !== 'TASK') return;
    const draggedTask = draggedTaskRef.current;
    if (!draggedTask) return;
    if (targetTaskId && draggedTask.taskId === targetTaskId) {
      setTaskDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setTaskDropTarget({ groupId, taskId: targetTaskId });
  }, []);

  const handleTaskDrop = useCallback((
    groupId: string,
    targetTaskId: string | null,
    event: DragEvent<HTMLElement>
  ) => {
    if (dragModeRef.current !== 'TASK') return;
    event.preventDefault();
    event.stopPropagation();
    const draggedTask = draggedTaskRef.current;
    if (!draggedTask) {
      resetDragState();
      return;
    }
    if (targetTaskId && draggedTask.taskId === targetTaskId) {
      resetDragState();
      return;
    }
    setGroups((previous) => moveTaskToPosition(previous, draggedTask.taskId, groupId, targetTaskId));
    setCollapsedGroups((previous) => ({ ...previous, [groupId]: false }));
    resetDragState();
  }, [resetDragState]);

  const handleDragEnd = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  const handleSaveShortcut = useCallback(() => {
    if (isEditProjectModalOpen) {
      void saveProjectEdit();
      return;
    }
    if (activeTab === 'BILLING') {
      void saveBillingConfig();
      return;
    }
    void saveWorkspaceRecords();
  }, [activeTab, isEditProjectModalOpen, saveBillingConfig, saveProjectEdit, saveWorkspaceRecords]);

  // Keyboard shortcuts (standardized): Ctrl+R refresh, Ctrl+S save, Ctrl+E edit, Ctrl+Backspace back
  useKeyboardShortcuts([
    {
      key: 'r',
      ctrl: true,
      handler: () => {
        void refetch();
      },
      description: 'Refresh workflow project',
    },
    {
      key: 's',
      ctrl: true,
      handler: handleSaveShortcut,
      description: 'Save workflow project records',
    },
    {
      key: 'e',
      ctrl: true,
      handler: openProjectEditModal,
      description: 'Edit workflow project',
    },
    {
      key: 'backspace',
      ctrl: true,
      handler: navigateBackToProjects,
      description: 'Back to workflow projects',
    },
    ...(activeTab === 'FILES' ? [{
      key: 'F1',
      handler: openFilesLinkModal,
      description: 'Link documents',
    }, {
      key: 'F2',
      handler: openFilesUploadPage,
      description: 'Upload document',
    }] : []),
  ]);

  const activeAttachmentDocumentIds = useMemo(
    () => new Set(attachTask?.attachments.map((attachment) => attachment.processingDocumentId) ?? []),
    [attachTask?.attachments]
  );

  if (isLoading && !projectDetail) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-oak-light border-t-transparent rounded-full animate-spin" />
          <span className="ml-3 text-text-secondary">Loading workflow project...</span>
        </div>
      </div>
    );
  }

  if (!projectDetail) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-status-warning mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-text-primary mb-2">Workflow project not found</h1>
          <p className="text-sm text-text-secondary mb-5">
            {error instanceof Error
              ? error.message
              : (
                <>
                  Project ID <span className="font-medium text-text-primary">{projectId}</span> was not found.
                </>
              )}
          </p>
          <Link
            href="/workflow/projects"
            className="btn-secondary btn-sm inline-flex items-center gap-2"
            title="Back to Workflow Projects (Ctrl+Backspace)"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Workflow Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <header className="space-y-3">
        <div>
          <button
            type="button"
            onClick={navigateBackToProjects}
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-3"
            title="Back to Projects (Ctrl+Backspace)"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{projectDetail.name}</h1>
              <span className={cn('badge', PROJECT_STATUS_CLASS_MAP[projectStatusPreview])}>
                {PROJECT_STATUS_LABEL_MAP[projectStatusPreview]}
              </span>
              {projectTags.map((tag) => (
                <span key={tag} className="badge badge-primary">
                  {tag}
                </span>
              ))}
              {isAddingTag ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    autoFocus
                    value={newTagDraft}
                    onChange={(event) => setNewTagDraft(event.target.value)}
                    onBlur={commitAddProjectTag}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitAddProjectTag();
                      if (event.key === 'Escape') cancelAddProjectTag();
                    }}
                    className="input input-sm h-7 w-28"
                    placeholder="New tag"
                  />
                </div>
              ) : (
                <Button variant="ghost" size="xs" onClick={startAddProjectTag}>
                  + tags
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Save className="w-4 h-4" />}
                onClick={saveWorkspaceRecords}
                isLoading={updateProjectMutation.isPending}
              >
                <span className="hidden sm:inline">Save (Ctrl+S)</span>
                <span className="sm:hidden">Save</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<PencilLine className="w-4 h-4" />}
                onClick={openProjectEditModal}
              >
                <span className="hidden sm:inline">Edit (Ctrl+E)</span>
                <span className="sm:hidden">Edit</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="card p-2 sm:p-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TAB_OPTIONS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-oak-primary/10 text-oak-light border border-oak-primary/30'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary border border-transparent'
                )}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'FILES' ? (
        <div className="space-y-4">
          <section className="card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Project Files</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Linked documents across this project and its tasks.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Paperclip className="w-4 h-4" />}
                  onClick={openFilesLinkModal}
                >
                  <span className="hidden sm:inline">Link Documents (F1)</span>
                  <span className="sm:hidden">Link Documents</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<ArrowUpRight className="w-4 h-4" />}
                  onClick={openFilesUploadPage}
                >
                  <span className="hidden sm:inline">Upload Document (F2)</span>
                  <span className="sm:hidden">Upload Document</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-text-secondary">
                Showing <span className="text-text-primary font-medium">{filteredLinkedDocumentRows.length}</span> linked document(s)
              </p>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setFilesInlineFilters(getDefaultFilesInlineFilters())}
              >
                Reset Filters
              </Button>
            </div>

            <div className="rounded-lg border border-border-primary overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <colgroup>
                    {FILES_COLUMN_IDS.map((columnId) => (
                      <col key={columnId} style={{ width: `${getFilesColumnWidth(columnId)}px` }} />
                    ))}
                  </colgroup>
                  <thead className="bg-background-tertiary border-b border-border-primary">
                    <tr className="bg-background-secondary/50">
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesLinkedAtFilterOptions}
                          value={filesInlineFilters.linkedAt}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, linkedAt: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
                          <input
                            type="text"
                            value={filesInlineFilters.fileName}
                            onChange={(event) =>
                              setFilesInlineFilters((previous) => ({ ...previous, fileName: event.target.value }))
                            }
                            placeholder="All"
                            className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
                          />
                          {filesInlineFilters.fileName && (
                            <button
                              type="button"
                              onClick={() => setFilesInlineFilters((previous) => ({ ...previous, fileName: '' }))}
                              className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                            >
                              <X className="w-3.5 h-3.5 text-text-muted" />
                            </button>
                          )}
                        </div>
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesCompanyFilterOptions.map((option) => ({ value: option, label: option }))}
                          value={filesInlineFilters.companyName}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, companyName: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesRevisionFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                          value={filesInlineFilters.revisionStatus}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, revisionStatus: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0" />
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesCategoryFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                          value={filesInlineFilters.documentCategory}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, documentCategory: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesSubCategoryFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                          value={filesInlineFilters.documentSubCategory}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, documentSubCategory: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
                          <input
                            type="text"
                            value={filesInlineFilters.vendorName}
                            onChange={(event) =>
                              setFilesInlineFilters((previous) => ({ ...previous, vendorName: event.target.value }))
                            }
                            placeholder="All"
                            className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
                          />
                          {filesInlineFilters.vendorName && (
                            <button
                              type="button"
                              onClick={() => setFilesInlineFilters((previous) => ({ ...previous, vendorName: '' }))}
                              className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                            >
                              <X className="w-3.5 h-3.5 text-text-muted" />
                            </button>
                          )}
                        </div>
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
                          <input
                            type="text"
                            value={filesInlineFilters.documentNumber}
                            onChange={(event) =>
                              setFilesInlineFilters((previous) => ({ ...previous, documentNumber: event.target.value }))
                            }
                            placeholder="All"
                            className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
                          />
                          {filesInlineFilters.documentNumber && (
                            <button
                              type="button"
                              onClick={() => setFilesInlineFilters((previous) => ({ ...previous, documentNumber: '' }))}
                              className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                            >
                              <X className="w-3.5 h-3.5 text-text-muted" />
                            </button>
                          )}
                        </div>
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <WorkflowDateRangeInput
                          fromValue={filesInlineFilters.documentDateFrom}
                          toValue={filesInlineFilters.documentDateTo}
                          onFromChange={(value) =>
                            setFilesInlineFilters((previous) => ({ ...previous, documentDateFrom: value }))
                          }
                          onToChange={(value) =>
                            setFilesInlineFilters((previous) => ({ ...previous, documentDateTo: value }))
                          }
                          fromAriaLabel="Workflow linked document date from"
                          toAriaLabel="Workflow linked document date to"
                          className="min-w-[10rem]"
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesCurrencyFilterOptions.map((option) => ({ value: option, label: option }))}
                          value={filesInlineFilters.currency}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, currency: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <AmountFilter
                          value={filesInlineFilters.subtotalFilter}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, subtotalFilter: value }))}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                          showChevron={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <AmountFilter
                          value={filesInlineFilters.taxFilter}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, taxFilter: value }))}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                          showChevron={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <AmountFilter
                          value={filesInlineFilters.totalFilter}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, totalFilter: value }))}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                          showChevron={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <SearchableSelect
                          options={filesHomeCurrencyFilterOptions.map((option) => ({ value: option, label: option }))}
                          value={filesInlineFilters.homeCurrency}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, homeCurrency: value }))}
                          placeholder="All"
                          className="text-xs"
                          showChevron={false}
                          showKeyboardHints={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <AmountFilter
                          value={filesInlineFilters.homeSubtotalFilter}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, homeSubtotalFilter: value }))}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                          showChevron={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <AmountFilter
                          value={filesInlineFilters.homeTaxFilter}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, homeTaxFilter: value }))}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                          showChevron={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <AmountFilter
                          value={filesInlineFilters.homeTotalFilter}
                          onChange={(value) => setFilesInlineFilters((previous) => ({ ...previous, homeTotalFilter: value }))}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                          showChevron={false}
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0">
                        <WorkflowDateRangeInput
                          fromValue={filesInlineFilters.uploadedFrom}
                          toValue={filesInlineFilters.uploadedTo}
                          onFromChange={(value) =>
                            setFilesInlineFilters((previous) => ({ ...previous, uploadedFrom: value }))
                          }
                          onToChange={(value) =>
                            setFilesInlineFilters((previous) => ({ ...previous, uploadedTo: value }))
                          }
                          fromAriaLabel="Workflow linked file upload date from"
                          toAriaLabel="Workflow linked file upload date to"
                          className="min-w-[10rem]"
                        />
                      </th>
                      <th className="px-3 py-2 max-w-0" />
                    </tr>
                    <tr className="border-t border-border-primary">
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Linked at
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'linkedAt')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Document
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'document')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Company
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'company')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Status
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'status')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Tags
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'tags')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Category
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'category')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Sub-Category
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'subCategory')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Vendor
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'vendor')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Doc #
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'docNumber')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Doc Date
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'docDate')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Currency
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'currency')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Subtotal
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'subtotal')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Tax
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'tax')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Total
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'total')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Home Ccy
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'homeCurrency')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Home Subtotal
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'homeSubtotal')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Home Tax
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'homeTax')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Home Total
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'homeTotal')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 text-left text-xs font-medium text-text-secondary">
                        Uploaded
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'uploaded')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                      <th className="relative px-3 py-2 pr-6 text-right text-xs font-medium text-text-secondary">
                        Action
                        <div
                          onPointerDown={(event) => startFilesColumnResize(event, 'action')}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLinkedDocumentRows.length === 0 && (
                      <tr>
                        <td colSpan={FILES_COLUMN_IDS.length} className="px-3 py-8 text-center text-text-secondary">
                          No linked documents found.
                        </td>
                      </tr>
                    )}
                    {filteredLinkedDocumentRows.map((row) => (
                      <tr key={row.key} className="border-b border-border-primary last:border-0">
                        <td className="px-3 py-2 text-text-secondary max-w-0">
                          <div className="min-w-0">
                            <p className="truncate">{row.linkedAtLabel}</p>
                            <p className="text-2xs text-text-tertiary truncate">{formatDateShort(row.linkedAt)}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-text-primary max-w-0">
                          <Link
                            href={`/processing/${row.processingDocumentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline truncate block"
                            title={row.fileName}
                          >
                            {row.fileName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{row.companyName ?? '-'}</td>
                        <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(row.revisionStatus)}</td>
                        <td className="px-3 py-2 text-text-secondary">-</td>
                        <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(row.documentCategory)}</td>
                        <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(row.documentSubCategory)}</td>
                        <td className="px-3 py-2 text-text-secondary">{row.vendorName ?? '-'}</td>
                        <td className="px-3 py-2 text-text-secondary">{row.documentNumber ?? '-'}</td>
                        <td className="px-3 py-2 text-text-secondary">{formatDateShort(row.documentDate)}</td>
                        <td className="px-3 py-2 text-text-secondary">{row.currency ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-text-primary">
                          {row.subtotal !== null && row.subtotal !== undefined
                            ? formatCurrency(row.subtotal, row.currency ?? billingCurrency)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-text-primary">
                          {row.taxAmount !== null && row.taxAmount !== undefined
                            ? formatCurrency(row.taxAmount, row.currency ?? billingCurrency)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-text-primary">
                          {row.totalAmount !== null && row.totalAmount !== undefined
                            ? formatCurrency(row.totalAmount, row.currency ?? billingCurrency)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{row.homeCurrency ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-text-primary">
                          {row.homeSubtotal !== null && row.homeSubtotal !== undefined
                            ? formatCurrency(row.homeSubtotal, row.homeCurrency ?? billingCurrency)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-text-primary">
                          {row.homeTaxAmount !== null && row.homeTaxAmount !== undefined
                            ? formatCurrency(row.homeTaxAmount, row.homeCurrency ?? billingCurrency)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-text-primary">
                          {row.homeEquivalent !== null && row.homeEquivalent !== undefined
                            ? formatCurrency(row.homeEquivalent, row.homeCurrency ?? billingCurrency)
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{formatDateShort(row.uploadedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leftIcon={<Trash2 className="w-4 h-4 text-status-error" />}
                            aria-label={`Unlink ${row.fileName}`}
                            onClick={() => {
                              if (row.linkedScope === 'PROJECT') {
                                void removeProjectAttachment(row.attachmentId);
                                return;
                              }

                              if (row.linkedTaskId) {
                                void removeAttachmentFromTask(row.linkedTaskId, row.attachmentId);
                              }
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : activeTab === 'NOTES' ? (
        <div className="space-y-4">
          <section className="card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Project Notes</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Capture context, instructions, and reminders for this project.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetNotesDraft}
                  disabled={!notesDirty}
                >
                  Reset
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Save className="w-4 h-4" />}
                  onClick={saveWorkspaceRecords}
                  isLoading={updateProjectMutation.isPending}
                  disabled={!notesDirty}
                >
                  <span className="hidden sm:inline">Save Notes (Ctrl+S)</span>
                  <span className="sm:hidden">Save Notes</span>
                </Button>
              </div>
            </div>

            <RichTextEditor
              value={projectNotes}
              onChange={setProjectNotes}
              minHeight={280}
              className="min-h-[320px]"
            />

            <p className="text-xs text-text-secondary">
              Notes are stored at project level and synced with the workspace save.
            </p>
          </section>

          <section className="card p-4 sm:p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">Task Notes</h3>
              <p className="text-sm text-text-secondary mt-1">
                Only tasks with notes are shown. Empty notes are treated as no notes.
              </p>
            </div>

            {taskNoteEntries.length === 0 ? (
              <div className="rounded-lg border border-border-primary bg-background-secondary/50 p-4 text-sm text-text-secondary">
                No task notes yet.
              </div>
            ) : (
              <div className="space-y-2">
                {taskNoteEntries.map((entry) => {
                  const isCollapsed = collapsedTaskNotes[entry.taskId] ?? true;
                  return (
                    <div key={entry.taskId} className="rounded-lg border border-border-primary overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleTaskNoteCollapse(entry.taskId)}
                        className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left bg-background-secondary/50 hover:bg-background-tertiary/60 transition-colors"
                        aria-expanded={!isCollapsed}
                        aria-controls={`task-note-${entry.taskId}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{entry.taskTitle}</p>
                          <p className="text-xs text-text-secondary truncate">{entry.groupTitle}</p>
                        </div>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
                        )}
                      </button>

                      {!isCollapsed && (
                        <div id={`task-note-${entry.taskId}`} className="p-3 border-t border-border-primary">
                          <RichTextEditor
                            value={entry.description}
                            onChange={(html) => updateTask(entry.taskId, (task) => ({ ...task, description: html }))}
                            minHeight={180}
                            className="min-h-[220px]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : activeTab === 'BILLING' ? (
        <div className="space-y-4">
          <section className="card p-5 sm:p-6">
            {/* Header row — title, description, metadata chips */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-text-primary">Pricing Configuration</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Choose fixed or tiered pricing. Tiered pricing auto-calculates when quantity is entered.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border-primary bg-background-secondary px-2.5 py-1 text-xs text-text-secondary">
                  Instance #{currentProjectInstanceNumber}
                </span>
                {referralFeeRecurringLimitPreview ? (
                  <span className={cn(
                    'rounded-full border px-2.5 py-1 text-xs',
                    referralFeeActiveForCurrentInstance
                      ? 'border-status-success/30 bg-status-success/10 text-status-success'
                      : 'border-border-primary bg-background-secondary text-text-secondary'
                  )}>
                    {referralFeeActiveForCurrentInstance
                      ? `Referral ${currentProjectInstanceNumber} of ${referralFeeRecurringLimitPreview}`
                      : `Referral ended after ${referralFeeRecurringLimitPreview}`}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Mode + meta row */}
            <div className="mt-5 grid gap-4 md:grid-cols-[auto_1fr] md:items-end">
              <div>
                <label className="label">Pricing Mode</label>
                <div className="inline-flex items-center rounded-full border border-border-primary bg-background-secondary p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setBillingDraft((previous) => (
                        previous
                          ? { ...previous, mode: 'FIXED' }
                          : previous
                      ))
                    }
                    disabled={!billingDraft}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      billingDraft?.mode === 'FIXED'
                        ? 'bg-oak-primary text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    Fixed Pricing
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBillingDraft((previous) => (
                        previous
                          ? { ...previous, mode: 'TIERED' }
                          : previous
                      ))
                    }
                    disabled={!billingDraft}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      billingDraft?.mode === 'TIERED'
                        ? 'bg-oak-primary text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    Tiered Pricing
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:justify-self-end md:w-auto md:min-w-[280px]">
                <div>
                  <label className="label">Currency</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={billingDraft?.currency ?? ''}
                    onChange={(event) =>
                      setBillingDraft((previous) => (
                        previous
                          ? { ...previous, currency: event.target.value.toUpperCase() }
                          : previous
                      ))
                    }
                    className="input input-sm uppercase"
                    placeholder="SGD"
                    disabled={!billingDraft}
                  />
                </div>
                <div>
                  <label className="label">Billing Status</label>
                  <select
                    value={billingStatusPreview === 'BILLED' ? 'BILLED' : 'AUTO'}
                    onChange={(event) =>
                      setBillingDraft((previous) => (
                        previous
                          ? { ...previous, statusOverride: event.target.value === 'BILLED' ? 'BILLED' : null }
                          : previous
                      ))
                    }
                    className="input input-sm"
                    disabled={!billingDraft || autoBillingStatus === null}
                  >
                    <option value="AUTO">
                      {autoBillingStatus ? BILLING_STATUS_LABELS[autoBillingStatus] : 'No billing'}
                    </option>
                    {autoBillingStatus && (
                      <option value="BILLED">Billed</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Pricing section */}
            <section className="mt-6 border-t border-border-primary pt-6">
              {billingDraft?.mode === 'FIXED' ? (
                <>
                  <h3 className="text-sm font-semibold text-text-primary mb-4">Pricing</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">Fixed Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={billingDraft?.fixedPrice ?? ''}
                        onChange={(event) =>
                          setBillingDraft((previous) => (
                            previous
                              ? { ...previous, fixedPrice: event.target.value }
                              : previous
                          ))
                        }
                        className="input input-sm"
                        placeholder="0.00"
                        disabled={!billingDraft}
                      />
                    </div>
                    <div>
                      <label className="label">Disbursement</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={billingDraft?.disbursementAmount ?? ''}
                        onChange={(event) =>
                          setBillingDraft((previous) => (
                            previous
                              ? { ...previous, disbursementAmount: event.target.value }
                              : previous
                          ))
                        }
                        className="input input-sm"
                        placeholder="0.00"
                        disabled={!billingDraft}
                      />
                      <p className="mt-1 text-xs text-text-secondary">
                        Pass-through cost, deducted from margin.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <h3 className="text-sm font-semibold text-text-primary">Pricing</h3>
                    <div className="w-full sm:w-auto sm:min-w-[200px]">
                      <label className="label">Actual Quantity</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={billingDraft?.quantity ?? ''}
                        onChange={(event) =>
                          setBillingDraft((previous) => (
                            previous
                              ? { ...previous, quantity: event.target.value }
                              : previous
                          ))
                        }
                        className="input input-sm"
                        placeholder="Enter qty"
                        disabled={!billingDraft}
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-md border border-border-primary">
                    <table className="w-full text-sm">
                      <thead className="bg-background-tertiary border-b border-border-primary">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Tier</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Up To Qty</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Unit Price</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(billingDraft?.tiers ?? []).map((tier, index) => (
                          <tr key={tier.id} className="border-b border-border-primary last:border-0">
                            <td className="px-3 py-2 text-text-primary">Tier {index + 1}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={tier.upTo}
                                onChange={(event) => updateBillingTierDraft(tier.id, 'upTo', event.target.value)}
                                className="input input-sm h-7"
                                placeholder="No limit"
                                disabled={!billingDraft}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={tier.unitPrice}
                                onChange={(event) => updateBillingTierDraft(tier.id, 'unitPrice', event.target.value)}
                                className="input input-sm h-7"
                                placeholder="0.00"
                                disabled={!billingDraft}
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                variant="ghost"
                                size="xs"
                                iconOnly
                                leftIcon={<Trash2 className="w-3.5 h-3.5 text-status-error" />}
                                aria-label={`Remove tier ${index + 1}`}
                                onClick={() => removeBillingTierDraft(tier.id)}
                                disabled={!billingDraft}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="px-3 py-2 border-t border-border-primary bg-background-secondary/60">
                      <div className="flex flex-wrap items-center gap-2">
                        <Plus className="w-4 h-4 shrink-0 text-text-muted" />
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={quickTierUpToDraft}
                          onChange={(event) => setQuickTierUpToDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitQuickAddTier();
                          }}
                          className="input input-sm h-7 w-[170px]"
                          placeholder="Up to qty (optional)"
                          disabled={!billingDraft}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={quickTierUnitPriceDraft}
                          onChange={(event) => setQuickTierUnitPriceDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitQuickAddTier();
                          }}
                          className="input input-sm h-7 w-[170px]"
                          placeholder="Unit price"
                          disabled={!billingDraft}
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={commitQuickAddTier}
                          disabled={!billingDraft}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  {parsedBillingTiers.error && (
                    <p className="mt-2 text-xs text-status-error">{parsedBillingTiers.error}</p>
                  )}

                  {tierPricingPreview.rows.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-md border border-border-primary">
                      <table className="w-full text-sm">
                        <thead className="bg-background-tertiary border-b border-border-primary">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Band</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Rate</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tierPricingPreview.rows.map((row) => (
                            <tr key={row.key} className="border-b border-border-primary last:border-0">
                              <td className="px-3 py-2 text-text-primary">
                                {row.from} - {row.to ?? 'Above'}
                              </td>
                              <td className="px-3 py-2 text-right text-text-primary">{row.quantity}</td>
                              <td className="px-3 py-2 text-right text-text-primary">{formatCurrency(row.unitPrice, billingCurrency)}</td>
                              <td className="px-3 py-2 text-right text-text-primary">{formatCurrency(row.amount, billingCurrency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {tierPricingPreview.unpricedQuantity > 0 && (
                    <p className="mt-2 text-xs text-status-warning">
                      {tierPricingPreview.unpricedQuantity} quantity is not covered by any tier.
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Referral Fee section — Fixed mode only */}
            {billingDraft?.mode === 'FIXED' && (
              <section className="mt-6 border-t border-border-primary pt-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-primary">Referral Fee</h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Optional fee deducted from margin, paid to a referrer.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label">Fee</label>
                    <div className="flex items-stretch gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={billingDraft?.referralFeeType === 'PERCENTAGE' ? 100 : undefined}
                        value={billingDraft?.referralFeeAmount ?? ''}
                        onChange={(event) =>
                          setBillingDraft((previous) => (
                            previous
                              ? { ...previous, referralFeeAmount: event.target.value }
                              : previous
                          ))
                        }
                        className="input input-sm flex-1"
                        placeholder="0.00"
                        disabled={!billingDraft}
                      />
                      <div className="inline-flex items-center rounded-md border border-border-primary bg-background-secondary p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setBillingDraft((previous) => (
                              previous
                                ? { ...previous, referralFeeType: 'AMOUNT' }
                                : previous
                            ))
                          }
                          disabled={!billingDraft}
                          className={cn(
                            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                            billingDraft?.referralFeeType === 'AMOUNT'
                              ? 'bg-oak-primary text-white'
                              : 'text-text-secondary hover:text-text-primary'
                          )}
                          aria-label="Amount"
                        >
                          $
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBillingDraft((previous) => (
                              previous
                                ? { ...previous, referralFeeType: 'PERCENTAGE' }
                                : previous
                            ))
                          }
                          disabled={!billingDraft}
                          className={cn(
                            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                            billingDraft?.referralFeeType === 'PERCENTAGE'
                              ? 'bg-oak-primary text-white'
                              : 'text-text-secondary hover:text-text-primary'
                          )}
                          aria-label="Percentage"
                        >
                          %
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {billingDraft?.referralFeeType === 'PERCENTAGE'
                        ? 'Calculated from fixed amount only.'
                        : 'Deducted as a flat amount.'}
                    </p>
                  </div>

                  <div>
                    <label className="label">Recurring Cycles</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={billingDraft?.referralFeeRecurringLimit ?? ''}
                      onChange={(event) =>
                        setBillingDraft((previous) => (
                          previous
                            ? { ...previous, referralFeeRecurringLimit: event.target.value }
                            : previous
                        ))
                      }
                      className="input input-sm"
                      placeholder="Unlimited"
                      disabled={!billingDraft}
                    />
                    <p className="mt-1 text-xs text-text-secondary">Blank means every instance.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="label">Pay Referral To</label>
                    <input
                      type="text"
                      list={referralPayeeSuggestionsId}
                      value={billingDraft?.referralPayee ?? ''}
                      onChange={handleReferralPayeeInputChange}
                      className="input input-sm"
                      placeholder="Type a name or pick a contact"
                      disabled={!billingDraft}
                    />
                    <datalist id={referralPayeeSuggestionsId}>
                      {referralPayeeContactOptions.map((option) => (
                        <option key={option.value} value={option.label} label={option.description} />
                      ))}
                    </datalist>
                    <p className="mt-1 text-xs text-text-secondary">Type freely or choose a contact.</p>
                  </div>
                </div>
              </section>
            )}

            {/* Summary section */}
            <section className="mt-6 border-t border-border-primary pt-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Summary</h3>

              {billingDraft?.mode === 'FIXED' ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Billing Amount</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">Fixed Amount</span>
                      <span className="font-medium text-text-primary">{formatCurrency(fixedPricingPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">+ Disbursement</span>
                      <span className="font-medium text-text-primary">{formatCurrency(disbursementAmountPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border-primary pt-2">
                      <span className="font-medium text-text-primary">Total</span>
                      <span className="text-base font-semibold text-text-primary">
                        {formatCurrency(fixedBillingAmountPreview, billingCurrency)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Margin</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">Billing Amount</span>
                      <span className="font-medium text-text-primary">{formatCurrency(fixedBillingAmountPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">- Disbursement</span>
                      <span className="font-medium text-text-primary">{formatCurrency(-disbursementAmountPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">
                        - {billingDraft?.referralFeeType === 'PERCENTAGE'
                          ? `${configuredReferralFeeAmountPreview.toFixed(2)}% `
                          : ''}Referral{billingDraft?.referralPayee.trim() ? ` (Pay to: ${billingDraft.referralPayee.trim()})` : ''}
                      </span>
                      <span className="font-medium text-text-primary">{formatCurrency(-effectiveReferralFeeAmountPreview, billingCurrency)}</span>
                    </div>
                    {configuredReferralFeeAmountPreview > 0 && !referralFeeActiveForCurrentInstance ? (
                      <p className="text-xs text-text-secondary">
                        Configured referral fee is {billingDraft?.referralFeeType === 'PERCENTAGE'
                          ? `${configuredReferralFeeAmountPreview.toFixed(2)}%`
                          : formatCurrency(-configuredReferralFeeAmountPreview, billingCurrency)}, but it no longer applies from instance {currentProjectInstanceNumber}.
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 border-t border-border-primary pt-2">
                      <span className="font-medium text-text-primary">Net Margin</span>
                      <span className="text-base font-semibold text-text-primary">
                        {formatCurrency(fixedMarginPreview, billingCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Quantity</p>
                    <p className="mt-1 font-medium text-text-primary">{tierQuantity || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Effective Rate</p>
                    <p className="mt-1 font-medium text-text-primary">
                      {tierRatePreview === null ? '-' : formatCurrency(tierRatePreview, billingCurrency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Total</p>
                    <p className="mt-1 text-base font-semibold text-text-primary">
                      {formatCurrency(billingPreviewAmount, billingCurrency)}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Form footer — right-aligned Save, matches design guide full-page form pattern */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border-primary pt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={saveBillingConfig}
                isLoading={updateProjectMutation.isPending}
                disabled={!billingDraft}
              >
                <span className="hidden sm:inline">Save Pricing (Ctrl+S)</span>
                <span className="sm:hidden">Save Pricing</span>
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className="space-y-4">
            {groups.map((group) => {
              const collapsed = collapsedGroups[group.id];
              const resolvedCount = group.tasks.filter((task) => task.status === 'DONE' || task.status === 'SKIPPED').length;
              const isRenamingGroup = group.id === renameGroupId;

              return (
                <section
                  key={group.id}
                  className={cn(
                    'card p-0 overflow-hidden',
                    groupDropTargetId === group.id && 'ring-2 ring-oak-primary/35'
                  )}
                  onDragOver={(event) => handleGroupDragOver(group.id, event)}
                  onDrop={(event) => handleGroupDrop(group.id, event)}
                >
                  <div
                    className={cn(
                      'flex flex-col gap-3 px-4 py-3 border-b border-border-primary bg-background-secondary/60 sm:flex-row sm:items-center sm:justify-between',
                      taskDropTarget?.groupId === group.id && taskDropTarget.taskId === null && 'bg-oak-primary/10'
                    )}
                    onDragOver={(event) => handleTaskDragOver(group.id, null, event)}
                    onDrop={(event) => handleTaskDrop(group.id, null, event)}
                  >
                    <div className="min-w-0 flex w-full items-center gap-2 sm:w-auto">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => startGroupDrag(group.id, event)}
                        onDragEnd={handleDragEnd}
                        className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-background-tertiary transition-colors cursor-grab active:cursor-grabbing"
                        aria-label={`Reorder grouping ${group.title}`}
                        title="Drag to reorder grouping"
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.id)}
                        className="p-1 rounded hover:bg-background-tertiary transition-colors"
                        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.title}`}
                      >
                        {collapsed ? <ChevronRight className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
                      </button>

                      {isRenamingGroup ? (
                        <input
                          type="text"
                          value={renameGroupDraft}
                          autoFocus
                          onChange={(event) => setRenameGroupDraft(event.target.value)}
                          onBlur={() => commitGroupRename(group.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitGroupRename(group.id);
                            if (event.key === 'Escape') cancelGroupRename();
                          }}
                          className="input input-sm max-w-[280px]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startGroupRename(group.id)}
                          className="text-sm font-medium text-text-primary hover:text-oak-light transition-colors truncate"
                          title="Rename grouping"
                        >
                          {group.title}
                        </button>
                      )}

                      <span className="text-xs text-text-secondary">({resolvedCount}/{group.tasks.length})</span>
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-1 sm:w-auto sm:justify-end">
                      <Button
                        variant="ghost"
                        size="xs"
                        leftIcon={<Zap className="w-3.5 h-3.5" />}
                        onClick={() => setAutomationGroupId(group.id)}
                      >
                        Automation {group.automations.length > 0 ? `(${group.automations.length})` : ''}
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                        onClick={() => addTaskToGroup(group.id)}
                      >
                        Add
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        iconOnly
                        leftIcon={<Trash2 className="w-4 h-4 text-status-error" />}
                        aria-label={`Remove grouping ${group.title}`}
                        onClick={() => removeGrouping(group.id)}
                      />
                    </div>
                  </div>

                  {!collapsed && (
                    <div className="divide-y divide-border-primary">
                      {group.tasks.length === 0 && (
                        <div
                          className={cn(
                            'px-4 py-6 text-sm text-text-secondary text-center',
                            taskDropTarget?.groupId === group.id && taskDropTarget.taskId === null && 'bg-oak-primary/10'
                          )}
                          onDragOver={(event) => handleTaskDragOver(group.id, null, event)}
                          onDrop={(event) => handleTaskDrop(group.id, null, event)}
                        >
                          {taskDropTarget?.groupId === group.id && taskDropTarget.taskId === null
                            ? 'Drop task here'
                            : 'No tasks yet. Use quick add below to create one.'}
                        </div>
                      )}

                      {group.tasks.map((task) => {
                        const TaskStatusIcon = getTaskStatusIcon(task.status);
                        const taskIsOpen = task.id === openTaskId;
                        const taskIsRenaming = task.id === renameTaskId;
                        const iconButtonClass = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-background-tertiary transition-colors';

                        return (
                          <div
                            key={task.id}
                            onDragOver={(event) => handleTaskDragOver(group.id, task.id, event)}
                            onDrop={(event) => handleTaskDrop(group.id, task.id, event)}
                            className={cn(
                              'group px-4 py-2.5 border-l-2 transition-colors',
                              group.lane === 'TEAM'
                                ? 'border-l-oak-primary/35'
                                : group.lane === 'CLIENT'
                                  ? 'border-l-status-info/35'
                                  : 'border-l-status-warning/35',
                              taskIsOpen ? 'bg-oak-primary/5' : 'hover:bg-background-tertiary/50',
                              taskDropTarget?.groupId === group.id && taskDropTarget.taskId === task.id && 'bg-oak-primary/10'
                            )}
                          >
                            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                              <div className="flex min-w-0 items-start gap-2.5">
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(event) => startTaskDrag(group.id, task.id, event)}
                                    onDragEnd={handleDragEnd}
                                    className="h-4 w-4 rounded border border-border-primary inline-flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-background-tertiary transition-colors cursor-grab active:cursor-grabbing"
                                    aria-label={`Reorder task ${task.title}`}
                                    title="Drag to reorder task"
                                  >
                                    <GripVertical className="w-3 h-3" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setTaskStatus(task.id, task.status === 'DONE' ? 'TODO' : 'DONE')}
                                    className={cn(
                                      'h-4 w-4 rounded border inline-flex items-center justify-center transition-colors',
                                      task.status === 'DONE'
                                        ? 'bg-status-success border-status-success text-white'
                                        : 'border-status-success/60 text-status-success hover:bg-status-success/10'
                                    )}
                                    aria-label={`Mark ${task.title} done`}
                                    title="Mark task done"
                                  >
                                    <Check className={cn('w-2.5 h-2.5', task.status === 'DONE' ? 'opacity-100' : 'opacity-0')} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setTaskStatus(task.id, task.status === 'SKIPPED' ? 'TODO' : 'SKIPPED')}
                                    className={cn(
                                      'h-4 w-4 rounded border inline-flex items-center justify-center transition-colors',
                                      task.status === 'SKIPPED'
                                        ? 'bg-status-error border-status-error text-white'
                                        : 'border-status-error/60 text-status-error hover:bg-status-error/10'
                                    )}
                                    aria-label={`Mark ${task.title} as skipped`}
                                    title="Skip task"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                <div className="min-w-0 flex-1">
                                  {taskIsRenaming ? (
                                    <input
                                      type="text"
                                      value={renameTaskDraft}
                                      autoFocus
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) => setRenameTaskDraft(event.target.value)}
                                      onBlur={() => commitTaskRename(task.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') commitTaskRename(task.id);
                                        if (event.key === 'Escape') cancelTaskRename();
                                      }}
                                      className="input input-sm"
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openTaskPanel(task.id)}
                                      className={cn(
                                        'block w-full text-left text-sm leading-5 text-text-primary hover:text-oak-light transition-colors',
                                        (task.status === 'DONE' || task.status === 'SKIPPED') && 'line-through text-text-secondary'
                                      )}
                                    >
                                      {task.title}
                                    </button>
                                  )}

                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-text-secondary">
                                    <span className={cn('badge badge-sm', TASK_STATUS_CLASS_MAP[task.status])}>
                                      <span className="inline-flex items-center gap-1">
                                        <TaskStatusIcon className="w-3.5 h-3.5" />
                                        {WORKFLOW_TASK_STATUS_LABELS[task.status]}
                                      </span>
                                    </span>
                                    <span className={cn('inline-flex items-center gap-1', TASK_PRIORITY_CLASS_MAP[task.priority])}>
                                      <Flag className="w-3.5 h-3.5" />
                                      {task.priority}
                                    </span>
                                    {task.assignee && (
                                      <span className="inline-flex items-center gap-1">
                                        <UserCircle2 className="w-3.5 h-3.5 text-text-tertiary" />
                                        {task.assignee}
                                      </span>
                                    )}
                                    {task.dueDate && (
                                      <span className="inline-flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                                        {formatDateShort(task.dueDate)}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1">
                                      <Paperclip className="w-3.5 h-3.5 text-text-tertiary" />
                                      {task.attachments.length}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-1 sm:justify-end sm:self-start">
                                <button
                                  type="button"
                                  onClick={() => openTaskPanel(task.id)}
                                  className={iconButtonClass}
                                  title="Open task"
                                  aria-label={`Open ${task.title}`}
                                >
                                  <FolderOpen className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAttachmentModal(task.id)}
                                  className={iconButtonClass}
                                  title="Attach document"
                                  aria-label={`Attach document to ${task.title}`}
                                >
                                  <Paperclip className="w-4 h-4" />
                                </button>
                                <Dropdown>
                                  <DropdownTrigger asChild aria-label={`Change assignee for ${task.title}`}>
                                    <button
                                      type="button"
                                      className={iconButtonClass}
                                      title="Change assignee"
                                      aria-label={`Change assignee for ${task.title}`}
                                    >
                                      <UserPlus className="w-4 h-4" />
                                    </button>
                                  </DropdownTrigger>
                                  <DropdownMenu>
                                    <DropdownItem
                                      icon={<X className="w-4 h-4" />}
                                      onClick={() => setTaskAssignee(task.id, null)}
                                    >
                                      {task.assignee ? 'Unassign' : 'Unassigned (Current)'}
                                    </DropdownItem>
                                    {projectDetail.assignees.map((assignee) => (
                                      <DropdownItem
                                        key={assignee}
                                        icon={<UserCircle2 className="w-4 h-4" />}
                                        onClick={() => setTaskAssignee(task.id, assignee)}
                                      >
                                        {assignee}{task.assignee === assignee ? ' (Current)' : ''}
                                      </DropdownItem>
                                    ))}
                                  </DropdownMenu>
                                </Dropdown>
                                <Dropdown>
                                  <DropdownTrigger asChild aria-label={`Change status for ${task.title}`}>
                                    <button
                                      type="button"
                                      className={iconButtonClass}
                                      title="Change status"
                                      aria-label={`Change status for ${task.title}`}
                                    >
                                      <Repeat2 className="w-4 h-4" />
                                    </button>
                                  </DropdownTrigger>
                                  <DropdownMenu>
                                    {TASK_STATUS_OPTIONS.map((statusOption) => {
                                      const StatusOptionIcon = getTaskStatusIcon(statusOption);
                                      return (
                                        <DropdownItem
                                          key={statusOption}
                                          icon={<StatusOptionIcon className="w-4 h-4" />}
                                          onClick={() => setTaskStatus(task.id, statusOption)}
                                        >
                                          {WORKFLOW_TASK_STATUS_LABELS[statusOption]}{task.status === statusOption ? ' (Current)' : ''}
                                        </DropdownItem>
                                      );
                                    })}
                                  </DropdownMenu>
                                </Dropdown>
                                <Dropdown>
                                  <DropdownTrigger asChild aria-label={`Change priority for ${task.title}`}>
                                    <button
                                      type="button"
                                      className={iconButtonClass}
                                      title="Change priority"
                                      aria-label={`Change priority for ${task.title}`}
                                    >
                                      <Flag className="w-4 h-4" />
                                    </button>
                                  </DropdownTrigger>
                                  <DropdownMenu>
                                    {TASK_PRIORITY_OPTIONS.map((priorityOption) => (
                                      <DropdownItem
                                        key={priorityOption}
                                        icon={<Flag className={cn('w-4 h-4', TASK_PRIORITY_CLASS_MAP[priorityOption])} />}
                                        onClick={() => setTaskPriority(task.id, priorityOption)}
                                      >
                                        {priorityOption}{task.priority === priorityOption ? ' (Current)' : ''}
                                      </DropdownItem>
                                    ))}
                                  </DropdownMenu>
                                </Dropdown>
                                <button
                                  type="button"
                                  onClick={() => addSubtask(task.id)}
                                  className={iconButtonClass}
                                  title="Add subtask"
                                  aria-label={`Add subtask to ${task.title}`}
                                >
                                  <ListPlus className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startTaskRename(task.id)}
                                  className={iconButtonClass}
                                  title="Rename task"
                                  aria-label={`Rename ${task.title}`}
                                >
                                  <PencilLine className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTask(task.id)}
                                  className={cn(iconButtonClass, 'text-status-error hover:text-status-error')}
                                  title="Delete task"
                                  aria-label={`Delete ${task.title}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div
                        className={cn(
                          'px-4 py-2.5 border-l-2 border-l-border-primary bg-background-secondary/50',
                          taskDropTarget?.groupId === group.id && taskDropTarget.taskId === null && 'bg-oak-primary/10'
                        )}
                        onDragOver={(event) => handleTaskDragOver(group.id, null, event)}
                        onDrop={(event) => handleTaskDrop(group.id, null, event)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Plus className="w-4 h-4 shrink-0 text-text-muted" />
                          <input
                            type="text"
                            value={quickAddDraftByGroup[group.id] ?? ''}
                            onChange={(event) => setQuickAddDraft(group.id, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitQuickAdd(group.id);
                            }}
                            placeholder="Quick add task..."
                            className="input input-sm min-w-0 flex-1"
                          />
                          <Button variant="ghost" size="xs" onClick={() => commitQuickAdd(group.id)}>
                            Add
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}

            <section
              className={cn(
                'card p-0 overflow-hidden',
                isGroupDropToEnd && 'ring-2 ring-oak-primary/35'
              )}
              onDragOver={handleGroupDragOverEnd}
              onDrop={handleGroupDropToEnd}
            >
              <div className="px-4 py-2.5 border-l-2 border-l-border-primary bg-background-secondary/50">
                <button
                  type="button"
                  onClick={addGrouping}
                  className="flex w-full items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Plus className="w-4 h-4 shrink-0 text-text-muted" />
                  Add grouping...
                </button>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="card p-4">
              <h2 className="text-sm font-medium text-text-primary mb-3">Project Summary</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                    <span>Progress</span>
                    <span>{projectStats.resolved}/{projectStats.total} resolved</span>
                  </div>
                  <div className="h-2 rounded-full bg-background-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-oak-light transition-[width]"
                      style={{ width: `${projectStats.progress}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border-primary p-2.5 text-center">
                    <p className="text-lg font-semibold text-text-primary">{projectStats.completed}</p>
                    <p className="text-2xs text-text-secondary uppercase tracking-wide">Done</p>
                  </div>
                  <div className="rounded-lg border border-border-primary p-2.5 text-center">
                    <p className="text-lg font-semibold text-text-primary">{projectStats.skipped}</p>
                    <p className="text-2xs text-text-secondary uppercase tracking-wide">Skipped</p>
                  </div>
                  <div className="rounded-lg border border-border-primary p-2.5 text-center">
                    <p className="text-lg font-semibold text-text-primary">{projectStats.inProgress}</p>
                    <p className="text-2xs text-text-secondary uppercase tracking-wide">In Progress</p>
                  </div>
                  <div className="rounded-lg border border-border-primary p-2.5 text-center">
                    <p className="text-lg font-semibold text-text-primary">{projectStats.waitingClient}</p>
                    <p className="text-2xs text-text-secondary uppercase tracking-wide">Waiting</p>
                  </div>
                </div>
                <div className="text-xs text-text-secondary space-y-1.5">
                  <p>Start: <span className="text-text-primary">{formatDateShort(projectDetail.startDate)}</span></p>
                  <p>End: <span className="text-text-primary">{formatDateShort(projectDetail.dueDate)}</span></p>
                  <p>Recurring: <span className="text-text-primary">{recurringLabel}</span></p>
                  <p>Instance: <span className="text-text-primary">#{projectDetail.instanceNumber} of {projectDetail.instanceCount}</span></p>
                  <p>
                    Next Task:{' '}
                    <span className="text-text-primary">
                      {projectStats.upcoming?.dueDate ? formatDateShort(projectStats.upcoming.dueDate) : 'No pending task'}
                    </span>
                  </p>
                </div>
              </div>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-medium text-text-primary mb-3">Company Contact</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-text-secondary">Name</span>
                  <span className="min-w-0 max-w-[65%] break-words text-right text-text-primary">{matchedCompany?.name ?? projectDetail.companySnapshot.name}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-text-secondary">Type</span>
                  <span className="min-w-0 max-w-[65%] break-words text-right text-text-primary">
                    {matchedCompany ? getEntityTypeLabel(matchedCompany.entityType, true) : projectDetail.companySnapshot.companyType}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-text-secondary">FYE</span>
                  <span className="min-w-0 max-w-[65%] break-words text-right text-text-primary">
                    {matchedCompany ? formatFye(matchedCompany.financialYearEndMonth, matchedCompany.financialYearEndDay) : projectDetail.companySnapshot.financialYearEnd}
                  </span>
                </div>
                <div className="pt-2 border-t border-border-primary space-y-1">
                  <p className="text-text-secondary text-xs uppercase tracking-wide">POC Contact</p>
                  <div className="space-y-2">
                    {pocContacts.map((pocContact) => (
                      <div key={pocContact.id} className="rounded-lg border border-border-primary p-2.5 space-y-2">
                        <p className="text-text-primary text-xs">{pocContact.name}</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-text-primary text-xs break-all">Email: {pocContact.email}</p>
                          <Button
                            variant="ghost"
                            size="xs"
                            leftIcon={<Copy className="w-3.5 h-3.5" />}
                            onClick={() => copyContactValue(pocContact.email, 'Email')}
                            disabled={pocContact.email === '-'}
                          >
                            Copy
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-text-primary text-xs break-all">Phone: {pocContact.phone}</p>
                          <Button
                            variant="ghost"
                            size="xs"
                            leftIcon={<Copy className="w-3.5 h-3.5" />}
                            onClick={() => copyContactValue(pocContact.phone, 'Phone')}
                            disabled={pocContact.phone === '-'}
                          >
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-medium text-text-primary mb-3">Billing</h2>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Mode</span>
                  <span className="text-text-primary font-medium">
                    {billingDraft?.mode === 'TIERED' ? 'Tiered Pricing' : 'Fixed Pricing'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Currency</span>
                  <span className="text-text-primary font-medium">{billingCurrency}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Instance</span>
                  <span className="text-text-primary font-medium">#{projectDetail.instanceNumber}</span>
                </div>
                {billingDraft?.mode === 'TIERED' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs text-text-secondary">Actual Quantity</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={billingDraft?.quantity ?? ''}
                        onChange={(event) =>
                          setBillingDraft((previous) => (
                            previous
                              ? { ...previous, quantity: event.target.value }
                              : previous
                          ))
                        }
                        className="input input-sm"
                        placeholder="Enter qty"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Effective Rate</span>
                      <span className="text-text-primary font-medium">
                        {tierRatePreview === null ? '-' : formatCurrency(tierRatePreview, billingCurrency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border-primary pt-2">
                      <span className="text-text-primary font-medium">Total</span>
                      <span className="text-text-primary font-semibold">{formatCurrency(billingPreviewAmount, billingCurrency)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pt-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Billing Amount</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Fixed Amount</span>
                      <span className="text-text-primary font-medium">{formatCurrency(fixedPricingPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">+ Disbursement</span>
                      <span className="text-text-primary font-medium">{formatCurrency(disbursementAmountPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border-primary pt-2">
                      <span className="text-text-primary font-medium">Total</span>
                      <span className="text-text-primary font-semibold">{formatCurrency(fixedBillingAmountPreview, billingCurrency)}</span>
                    </div>
                    <div className="pt-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Margin</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">- Disbursement</span>
                      <span className="text-text-primary font-medium">{formatCurrency(-disbursementAmountPreview, billingCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">
                        - {billingDraft?.referralFeeType === 'PERCENTAGE'
                          ? `${configuredReferralFeeAmountPreview.toFixed(2)}% `
                          : ''}Referral{billingDraft?.referralPayee.trim() ? ` (Pay to: ${billingDraft.referralPayee.trim()})` : ''}
                      </span>
                      <span className="text-text-primary font-medium">{formatCurrency(-effectiveReferralFeeAmountPreview, billingCurrency)}</span>
                    </div>
                    {referralFeeRecurringLimitPreview ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-text-secondary">Referral Cycle</span>
                        <span className="text-right text-text-primary font-medium">
                          {referralFeeActiveForCurrentInstance
                            ? `${projectDetail.instanceNumber} of ${referralFeeRecurringLimitPreview}`
                            : `Completed after ${referralFeeRecurringLimitPreview}`}
                        </span>
                      </div>
                    ) : null}
                    {billingDraft?.referralPayee.trim() ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-text-secondary">Pay Referral To</span>
                        <span className="text-right text-text-primary font-medium">{billingDraft.referralPayee.trim()}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between border-t border-border-primary pt-2">
                      <span className="text-text-primary font-medium">Net Margin</span>
                      <span className="text-text-primary font-semibold">{formatCurrency(fixedMarginPreview, billingCurrency)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Billing Status</span>
                  <span className={cn('font-medium', billingStatusPreview ? BILLING_STATUS_CLASS_MAP[billingStatusPreview] : 'text-text-primary')}>
                    {billingStatusPreview ? BILLING_STATUS_LABELS[billingStatusPreview] : '-'}
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}

      {openTask && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpenTaskId(null)} />
          <aside className="fixed inset-y-0 right-0 z-[45] w-full max-w-[680px] bg-background-secondary border-l border-border-primary shadow-elevation-3 animate-slide-in-right">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between gap-3 p-4 border-b border-border-primary">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary truncate">Task Details</h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {openTask.lane === 'TEAM' ? 'Internal task' : openTask.lane === 'CLIENT' ? 'Client request' : 'Custom task'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  leftIcon={<X className="w-4 h-4" />}
                  aria-label="Close task details"
                  onClick={() => setOpenTaskId(null)}
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <section className="space-y-2">
                  <label className="label">Task Name</label>
                  <input
                    type="text"
                    value={openTask.title}
                    onChange={(event) => {
                      const nextTitle = event.target.value;
                      updateTask(openTask.id, (task) => ({ ...task, title: nextTitle }));
                    }}
                    className="input input-sm"
                  />
                </section>

                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Status</label>
                    <select
                      value={openTask.status}
                      onChange={(event) => setTaskStatus(openTask.id, event.target.value as WorkflowTaskStatus)}
                      className="input input-sm"
                    >
                      {Object.entries(WORKFLOW_TASK_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Priority</label>
                    <select
                      value={openTask.priority}
                      onChange={(event) => {
                        const nextPriority = event.target.value as WorkflowTaskPriority;
                        updateTask(openTask.id, (task) => ({ ...task, priority: nextPriority }));
                      }}
                      className="input input-sm"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Assignee</label>
                    <select
                      value={openTask.assignee ?? ''}
                      onChange={(event) => {
                        const nextAssignee = event.target.value || null;
                        updateTask(openTask.id, (task) => ({ ...task, assignee: nextAssignee }));
                      }}
                      className="input input-sm"
                    >
                      <option value="">Unassigned</option>
                      {projectDetail.assignees.map((assignee) => (
                        <option key={assignee} value={assignee}>
                          {assignee}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <SingleDateInput
                      label="Due Date"
                      value={openTask.dueDate ?? ''}
                      onChange={(value) => {
                        const nextDueDate = value || null;
                        updateTask(openTask.id, (task) => ({ ...task, dueDate: nextDueDate }));
                      }}
                      placeholder="Select date..."
                    />
                  </div>
                </section>

                <section>
                  <label className="label">Description</label>
                  <RichTextEditor
                    value={openTask.description}
                    onChange={(html) => {
                      updateTask(openTask.id, (task) => ({ ...task, description: html }));
                    }}
                    minHeight={180}
                    className="min-h-[220px]"
                  />
                </section>

                <section className="card p-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-medium text-text-primary">Attachments ({openTask.attachments.length})</h3>
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon={<Paperclip className="w-3.5 h-3.5" />}
                      onClick={() => openAttachmentModal(openTask.id)}
                    >
                      Attach document
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {openTask.attachments.length === 0 && (
                      <p className="text-xs text-text-secondary">No documents attached to this task.</p>
                    )}
                    {openTask.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between gap-3 p-2 rounded border border-border-primary">
                        <div className="min-w-0">
                          <Link
                            href={`/processing/${attachment.processingDocumentId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-text-primary hover:underline truncate block"
                            title={attachment.fileName}
                          >
                            {attachment.fileName}
                          </Link>
                          <p className="text-2xs text-text-secondary">Attached {formatDateShort(attachment.linkedAt)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          leftIcon={<Trash2 className="w-4 h-4 text-status-error" />}
                          aria-label={`Remove ${attachment.fileName}`}
                          onClick={() => void removeAttachmentFromTask(openTask.id, attachment.id)}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <section className="card p-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-medium text-text-primary">
                      Subtasks ({openTask.subtasks.filter((subtask) => subtask.completed).length}/{openTask.subtasks.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => addSubtask(openTask.id)}
                    >
                      Add subtask
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {openTask.subtasks.length === 0 && (
                      <p className="text-xs text-text-secondary">No subtasks yet. Add checkpoints for this task.</p>
                    )}

                    {openTask.subtasks.map((subtask) => (
                      <div key={subtask.id} className="flex items-center gap-2">
                        <Checkbox
                          size="sm"
                          className="!min-h-0 !py-0"
                          checked={subtask.completed}
                          onChange={() => {
                            updateTask(openTask.id, (task) => ({
                              ...task,
                              subtasks: task.subtasks.map((entry) =>
                                entry.id === subtask.id ? { ...entry, completed: !entry.completed } : entry
                              ),
                            }));
                          }}
                          aria-label={`Toggle subtask ${subtask.title}`}
                        />
                        <input
                          type="text"
                          value={subtask.title}
                          onChange={(event) => {
                            const nextTitle = event.target.value;
                            updateTask(openTask.id, (task) => ({
                              ...task,
                              subtasks: task.subtasks.map((entry) =>
                                entry.id === subtask.id ? { ...entry, title: nextTitle } : entry
                              ),
                            }));
                          }}
                          className={cn(
                            'input input-sm',
                            subtask.completed && 'line-through text-text-secondary'
                          )}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </aside>
        </>
      )}

      <Modal
        isOpen={isEditProjectModalOpen}
        onClose={closeProjectEditModal}
        title="Edit Workflow Project"
        size="lg"
      >
        <ModalBody className="space-y-4">
          <div className="space-y-2">
            <label className="label">Project Name</label>
            <input
              type="text"
              value={projectEditDraft?.name ?? ''}
              onChange={(event) =>
                setProjectEditDraft((previous) =>
                  previous
                    ? { ...previous, name: event.target.value }
                    : previous
                )
              }
              className="input input-sm"
              placeholder="Project name"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SingleDateInput
              label="Start Date"
              value={projectEditDraft?.startDate ?? ''}
              onChange={(value) =>
                setProjectEditDraft((previous) =>
                  previous
                    ? { ...previous, startDate: value }
                    : previous
                )
              }
              placeholder="Select date..."
            />
            <SingleDateInput
              label="End Date (Optional)"
              value={projectEditDraft?.dueDate ?? ''}
              onChange={(value) =>
                setProjectEditDraft((previous) =>
                  previous
                    ? { ...previous, dueDate: value }
                    : previous
                )
              }
              placeholder="Select date..."
            />
          </div>

          <div className="space-y-2">
            <label className="label">Project Status</label>
            <select
              value={projectEditDraft?.statusOverride ?? 'AUTO'}
              onChange={(event) =>
                setProjectEditDraft((previous) =>
                  previous
                    ? {
                      ...previous,
                      statusOverride: event.target.value as WorkflowProjectEditDraft['statusOverride'],
                    }
                    : previous
                )
              }
              className="input input-sm"
            >
              <option value="AUTO">Auto (Task-based)</option>
              <option value="AT_RISK">At Risk</option>
              <option value="ON_HOLD">On Hold</option>
            </select>
            <p className="text-xs text-text-secondary">
              Auto keeps status synced to task progress. If there are no outstanding tasks, it becomes Completed.
            </p>
          </div>

          <div className="space-y-2">
            <label className="label">Recurring</label>
            <select
              value={projectEditDraft?.recurrenceMode ?? 'ONE_TIME'}
              onChange={(event) =>
                setProjectEditDraft((previous) =>
                  previous
                    ? {
                      ...previous,
                      recurrenceMode: event.target.value as ProjectRecurrenceMode,
                    }
                    : previous
                )
              }
              className="input input-sm"
            >
              <option value="ONE_TIME">One-time</option>
              <option value="MONTHLY">Every __ months</option>
            </select>
          </div>

          {projectEditDraft?.recurrenceMode === 'MONTHLY' && (
            <div className="space-y-2">
              <label className="label">Recurring Interval (Months)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={projectEditDraft.recurrenceMonths}
                onChange={(event) =>
                  setProjectEditDraft((previous) =>
                    previous
                      ? { ...previous, recurrenceMonths: event.target.value }
                      : previous
                  )
                }
                className="input input-sm"
                placeholder="1"
              />
              <p className="text-xs text-text-secondary">
                A new cloned project instance is generated when the next cycle start date is reached.
              </p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={closeProjectEditModal}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={saveProjectEdit}
            isLoading={updateProjectMutation.isPending}
            disabled={!projectEditDraft}
          >
            <span className="hidden sm:inline">Save Changes (Ctrl+S)</span>
            <span className="sm:hidden">Save Changes</span>
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!automationGroup}
        onClose={() => setAutomationGroupId(null)}
        title={automationGroup ? `Automations - ${automationGroup.title}` : 'Automations'}
        size="2xl"
      >
        <ModalBody className="space-y-4">
          {automationGroup && (
            <>
              <div className="space-y-2">
                {automationGroup.automations.length === 0 && (
                  <p className="text-sm text-text-secondary">No automation rules yet for this grouping.</p>
                )}
                {automationGroup.automations.map((rule) => (
                  <div key={rule.id} className="p-3 rounded-lg border border-border-primary bg-background-secondary/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{rule.name}</p>
                        <p className="text-xs text-text-secondary mt-1">
                          When {rule.condition === 'TASK_DONE' ? 'task is marked done' : 'task is marked skipped'}, create follow-up in{' '}
                          <span className="text-text-primary">
                            {groups.find((group) => group.id === rule.targetGroupId)?.title ?? 'selected grouping'}
                          </span>
                        </p>
                        <p className="text-xs text-text-secondary mt-1">
                          Template: <span className="text-text-primary">{rule.followUpTitleTemplate}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) =>
                              updateAutomationRule(automationGroup.id, rule.id, (previousRule) => ({
                                ...previousRule,
                                enabled: event.target.checked,
                              }))
                            }
                          />
                          Enabled
                        </label>
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          leftIcon={<Trash2 className="w-4 h-4 text-status-error" />}
                          aria-label={`Delete automation ${rule.name}`}
                          onClick={() => removeAutomationRule(automationGroup.id, rule.id)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-border-primary space-y-3">
                <h3 className="text-sm font-medium text-text-primary">Add Automation Rule</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Rule Name</label>
                    <input
                      type="text"
                      value={automationDraft.name}
                      onChange={(event) => setAutomationDraft((previous) => ({ ...previous, name: event.target.value }))}
                      placeholder="e.g. Escalate skipped task"
                      className="input input-sm"
                    />
                  </div>
                  <div>
                    <label className="label">Condition</label>
                    <select
                      value={automationDraft.condition}
                      onChange={(event) =>
                        setAutomationDraft((previous) => ({
                          ...previous,
                          condition: event.target.value as AutomationCondition,
                        }))
                      }
                      className="input input-sm"
                    >
                      <option value="TASK_DONE">Task marked Done</option>
                      <option value="TASK_SKIPPED">Task marked Skipped</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Target Grouping</label>
                    <select
                      value={automationDraft.targetGroupId}
                      onChange={(event) =>
                        setAutomationDraft((previous) => ({
                          ...previous,
                          targetGroupId: event.target.value,
                        }))
                      }
                      className="input input-sm"
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Enabled</label>
                    <label className="inline-flex items-center gap-2 text-sm text-text-secondary h-8">
                      <input
                        type="checkbox"
                        checked={automationDraft.enabled}
                        onChange={(event) =>
                          setAutomationDraft((previous) => ({
                            ...previous,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      Turn on after creation
                    </label>
                  </div>
                </div>
                <div>
                  <label className="label">Follow-up Title Template</label>
                  <input
                    type="text"
                    value={automationDraft.followUpTitleTemplate}
                    onChange={(event) =>
                      setAutomationDraft((previous) => ({
                        ...previous,
                        followUpTitleTemplate: event.target.value,
                      }))
                    }
                    placeholder="Follow-up: {{taskTitle}}"
                    className="input input-sm"
                  />
                  <p className="text-2xs text-text-muted mt-1">Use <span className="font-mono">{'{{taskTitle}}'}</span> to include the triggering task title.</p>
                </div>
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setAutomationGroupId(null)}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={addAutomationRule} disabled={!automationGroup}>
            Add Rule
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={isFilesLinkModalOpen}
        onClose={closeFilesLinkModal}
        title={filesLinkTargetTaskId === 'PROJECT'
          ? 'Link Documents - Project'
          : `Link Documents - ${filesLinkTargetTask?.title ?? 'Task'}`
        }
        size="6xl"
      >
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px_440px] gap-3">
            <div>
              <label className="label">Search Documents</label>
              <input
                type="text"
                value={filesLinkSearch}
                onChange={(event) => setFilesLinkSearch(event.target.value)}
                placeholder="Search by filename, vendor, or document number..."
                className="input input-sm"
              />
            </div>
            <div>
              <label className="label">Link Target</label>
              <select
                value={filesLinkTargetTaskId}
                onChange={(event) => setFilesLinkTargetTaskId(event.target.value)}
                className="input input-sm"
              >
                <option value="PROJECT">Project</option>
                {allTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    Task: {task.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Company Scope</label>
              <div className="input input-sm flex items-center">
                {matchedCompany?.name ?? 'All companies'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-primary overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background-tertiary border-b border-border-primary">
                <tr className="bg-background-secondary/50">
                  <th className="px-3 py-2 max-w-0">
                    <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
                      <input
                        type="text"
                        value={filesLinkInlineFilters.fileName}
                        onChange={(event) =>
                          setFilesLinkInlineFilters((previous) => ({ ...previous, fileName: event.target.value }))
                        }
                        placeholder="All"
                        className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
                      />
                      {filesLinkInlineFilters.fileName && (
                        <button
                          type="button"
                          onClick={() => setFilesLinkInlineFilters((previous) => ({ ...previous, fileName: '' }))}
                          className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                        >
                          <X className="w-3.5 h-3.5 text-text-muted" />
                        </button>
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2 max-w-0">
                    <SearchableSelect
                      options={filesLinkPipelineFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                      value={filesLinkInlineFilters.pipelineStatus}
                      onChange={(value) => setFilesLinkInlineFilters((previous) => ({ ...previous, pipelineStatus: value }))}
                      placeholder="All"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  </th>
                  <th className="px-3 py-2 max-w-0">
                    <SearchableSelect
                      options={filesLinkCategoryFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                      value={filesLinkInlineFilters.documentCategory}
                      onChange={(value) => setFilesLinkInlineFilters((previous) => ({ ...previous, documentCategory: value }))}
                      placeholder="All"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  </th>
                  <th className="px-3 py-2 max-w-0">
                    <SearchableSelect
                      options={filesLinkSubCategoryFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                      value={filesLinkInlineFilters.documentSubCategory}
                      onChange={(value) => setFilesLinkInlineFilters((previous) => ({ ...previous, documentSubCategory: value }))}
                      placeholder="All"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  </th>
                  <th className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setFilesLinkInlineFilters(getDefaultLinkModalInlineFilters())}
                    >
                      Reset
                    </Button>
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">File Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Sub Category</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredFilesLinkDocuments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-text-secondary">
                      {isFetchingFilesLinkDocuments ? 'Loading documents...' : 'No documents found.'}
                    </td>
                  </tr>
                )}
                {filteredFilesLinkDocuments.map((document) => {
                  const alreadyLinked = activeFilesLinkDocumentIds.has(document.id);
                  return (
                    <tr key={document.id} className="border-b border-border-primary last:border-0">
                      <td className="px-3 py-2 text-text-primary">{document.document.fileName}</td>
                      <td className="px-3 py-2">
                        <span className="badge badge-neutral">{formatEnumLabel(document.pipelineStatus)}</span>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(document.currentRevision?.documentCategory)}</td>
                      <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(document.currentRevision?.documentSubCategory)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant={alreadyLinked ? 'secondary' : 'primary'}
                          size="xs"
                          onClick={() => void linkDocumentFromFilesModal(document)}
                          disabled={alreadyLinked}
                        >
                          {alreadyLinked ? 'Linked' : 'Link'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={closeFilesLinkModal}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!attachTask}
        onClose={() => setAttachModalTaskId(null)}
        title={attachTask ? `Attach Documents - ${attachTask.title}` : 'Attach Documents'}
        size="6xl"
      >
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_400px] gap-3">
            <div>
              <label className="label">Search Documents</label>
              <input
                type="text"
                value={documentSearch}
                onChange={(event) => setDocumentSearch(event.target.value)}
                placeholder="Search by filename, vendor, or document number..."
                className="input input-sm"
              />
            </div>
            <div>
              <label className="label">Company Scope</label>
              <div className="input input-sm flex items-center">
                {matchedCompany?.name ?? 'All companies'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-primary overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background-tertiary border-b border-border-primary">
                <tr className="bg-background-secondary/50">
                  <th className="px-3 py-2 max-w-0">
                    <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
                      <input
                        type="text"
                        value={attachInlineFilters.fileName}
                        onChange={(event) =>
                          setAttachInlineFilters((previous) => ({ ...previous, fileName: event.target.value }))
                        }
                        placeholder="All"
                        className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
                      />
                      {attachInlineFilters.fileName && (
                        <button
                          type="button"
                          onClick={() => setAttachInlineFilters((previous) => ({ ...previous, fileName: '' }))}
                          className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
                        >
                          <X className="w-3.5 h-3.5 text-text-muted" />
                        </button>
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2 max-w-0">
                    <SearchableSelect
                      options={attachPipelineFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                      value={attachInlineFilters.pipelineStatus}
                      onChange={(value) => setAttachInlineFilters((previous) => ({ ...previous, pipelineStatus: value }))}
                      placeholder="All"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  </th>
                  <th className="px-3 py-2 max-w-0">
                    <SearchableSelect
                      options={attachCategoryFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                      value={attachInlineFilters.documentCategory}
                      onChange={(value) => setAttachInlineFilters((previous) => ({ ...previous, documentCategory: value }))}
                      placeholder="All"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  </th>
                  <th className="px-3 py-2 max-w-0">
                    <SearchableSelect
                      options={attachSubCategoryFilterOptions.map((option) => ({ value: option, label: formatEnumLabel(option) }))}
                      value={attachInlineFilters.documentSubCategory}
                      onChange={(value) => setAttachInlineFilters((previous) => ({ ...previous, documentSubCategory: value }))}
                      placeholder="All"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  </th>
                  <th className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setAttachInlineFilters(getDefaultLinkModalInlineFilters())}
                    >
                      Reset
                    </Button>
                  </th>
                </tr>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">File Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-secondary">Sub Category</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-secondary">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttachDocuments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-text-secondary">
                      {isFetchingDocuments ? 'Loading documents...' : 'No documents found.'}
                    </td>
                  </tr>
                )}
                {filteredAttachDocuments.map((document) => {
                  const alreadyAttached = activeAttachmentDocumentIds.has(document.id);
                  return (
                    <tr key={document.id} className="border-b border-border-primary last:border-0">
                      <td className="px-3 py-2 text-text-primary">{document.document.fileName}</td>
                      <td className="px-3 py-2">
                        <span className="badge badge-neutral">{formatEnumLabel(document.pipelineStatus)}</span>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(document.currentRevision?.documentCategory)}</td>
                      <td className="px-3 py-2 text-text-secondary">{formatEnumLabel(document.currentRevision?.documentSubCategory)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant={alreadyAttached ? 'secondary' : 'primary'}
                          size="xs"
                          onClick={() => attachTask && attachDocumentToTask(attachTask.id, document)}
                          disabled={alreadyAttached || !attachTask}
                        >
                          {alreadyAttached ? 'Attached' : 'Attach'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setAttachModalTaskId(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

