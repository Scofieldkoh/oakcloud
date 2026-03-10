'use client';

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  Download,
  ExternalLink,
  GripVertical,
  Paperclip,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { BulkActionsToolbar } from '@/components/ui/bulk-actions-toolbar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FilterChip } from '@/components/ui/filter-chip';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import {
  useDeleteFormDraft,
  useDeleteFormResponse,
  useForm,
  useFormResponses,
  type FormResponsesResult,
} from '@/hooks/use-forms';
import {
  RESPONSE_COLUMN_STATUS_ID,
  RESPONSE_COLUMN_SUBMITTED_ID,
  clampResponseColumnWidth,
  formatChoiceAnswer,
  hasUnresolvedFormSubmissionAiWarning,
  isSummaryEligibleFieldType,
  normalizeResponseColumnOrder,
  parseObject,
  parseFormSubmissionAiReview,
  parseFormResponseTableSettings,
  sanitizeResponseColumnWidths,
} from '@/lib/form-utils';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const DRAFT_COLUMN_CODE_ID = '__draft_code';
const DRAFT_COLUMN_SAVED_ID = '__draft_saved';
const DRAFT_COLUMN_EXPIRES_ID = '__draft_expires';
const DRAFT_COLUMN_LOCALE_ID = '__draft_locale';
const SUBMISSION_ATTACHMENTS_COLUMN_ID = '__submission_attachments';
const DRAFT_ATTACHMENTS_COLUMN_ID = '__draft_attachments';
const SUBMISSION_SELECT_COLUMN_WIDTH = 72;
const SUBMISSION_OPEN_COLUMN_WIDTH = 56;
const SUBMISSION_ACTION_COLUMN_WIDTH = 64;
const DRAFT_SELECT_COLUMN_WIDTH = 72;
const DRAFT_OPEN_COLUMN_WIDTH = 56;
const DRAFT_ACTION_COLUMN_WIDTH = 64;
const DEFAULT_SUBMISSION_SORT_COLUMN_ID = RESPONSE_COLUMN_SUBMITTED_ID;
const DEFAULT_DRAFT_SORT_COLUMN_ID = DRAFT_COLUMN_SAVED_ID;

type SubmissionSortOrder = 'asc' | 'desc';
type SubmissionFilters = Record<string, string>;

type SubmissionItem = FormResponsesResult['submissions'][number];
type DraftItem = FormResponsesResult['drafts'][number];

type ResponseTableKind = 'submissions' | 'drafts';

type ResponseColumnDef = {
  id: string;
  kind:
    | 'submitted'
    | 'status'
    | 'field'
    | 'draftCode'
    | 'draftSaved'
    | 'draftExpires'
    | 'draftLocale'
    | 'attachments';
  label: string;
  fieldKey?: string;
  fieldType?: string;
  minWidth: number;
  defaultWidth: number;
};

type ResponseTableLayout = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
};

type ResponseTablePreference = Partial<{
  submissions: Partial<ResponseTableLayout>;
  drafts: Partial<ResponseTableLayout>;
}>;

type AttachmentDialogState = {
  title: string;
  description: string;
  attachments: SubmissionItem['attachments'];
  source: {
    type: 'submission' | 'draft';
    id: string;
  };
} | null;

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toAnswerRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function formatLocaleValue(value: unknown): string {
  if (typeof value !== 'string') return '-';
  const trimmed = value.trim();
  return trimmed || '-';
}

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function defaultFieldColumnWidth(fieldType: string): number {
  if (fieldType === 'LONG_TEXT') return 280;
  if (fieldType === 'FILE_UPLOAD') return 220;
  return 180;
}

function formatSummaryCellValue(fieldType: string, value: unknown): string {
  if (value === null || value === undefined) return '-';

  if (fieldType === 'SIGNATURE') {
    return typeof value === 'string' && value.trim().length > 0 ? 'Signed' : '-';
  }

  if (fieldType === 'FILE_UPLOAD') {
    if (Array.isArray(value)) {
      return value.length > 0 ? `${value.length} file${value.length > 1 ? 's' : ''}` : '-';
    }
    return typeof value === 'string' && value.trim().length > 0 ? value : '-';
  }

  if (fieldType === 'SINGLE_CHOICE' || fieldType === 'MULTIPLE_CHOICE') {
    const choiceText = formatChoiceAnswer(value);
    return choiceText || '-';
  }

  if (Array.isArray(value)) {
    const text = value.map((item) => String(item)).join(', ').trim();
    return text || '-';
  }

  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value);
      return text.length > 0 ? text : '-';
    } catch {
      return '-';
    }
  }

  const text = String(value).trim();
  return text || '-';
}

function renderDraftCell(draft: DraftItem, column: ResponseColumnDef): string {
  if (column.kind === 'draftCode') return draft.code;
  if (column.kind === 'draftSaved') return formatDate(draft.lastSavedAt);
  if (column.kind === 'draftExpires') return formatDate(draft.expiresAt);
  if (column.kind === 'draftLocale') {
    const metadata = toAnswerRecord(draft.metadata);
    return formatLocaleValue(metadata.locale);
  }

  const answers = toAnswerRecord(draft.answers);
  const value = answers[column.fieldKey || ''];
  return formatSummaryCellValue(column.fieldType || 'SHORT_TEXT', value);
}

function compareDraftRows(
  left: DraftItem,
  right: DraftItem,
  draftSortBy: string,
  draftSortOrder: SubmissionSortOrder,
  orderedDraftColumns: ResponseColumnDef[]
): number {
  const direction = draftSortOrder === 'asc' ? 1 : -1;

  if (draftSortBy === DRAFT_COLUMN_SAVED_ID) {
    return (new Date(left.lastSavedAt).getTime() - new Date(right.lastSavedAt).getTime()) * direction;
  }

  if (draftSortBy === DRAFT_COLUMN_EXPIRES_ID) {
    return (new Date(left.expiresAt).getTime() - new Date(right.expiresAt).getTime()) * direction;
  }

  if (draftSortBy === DRAFT_ATTACHMENTS_COLUMN_ID) {
    return (left.uploadCount - right.uploadCount) * direction;
  }

  const sortColumn = orderedDraftColumns.find((column) => column.id === draftSortBy);
  const leftValue = sortColumn ? renderDraftCell(left, sortColumn) : '';
  const rightValue = sortColumn ? renderDraftCell(right, sortColumn) : '';
  const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });

  if (comparison !== 0) {
    return comparison * direction;
  }

  return new Date(right.lastSavedAt).getTime() - new Date(left.lastSavedAt).getTime();
}

function parseResponseTablePreference(value: unknown): ResponseTablePreference {
  const root = parseObject(value);
  if (!root) return {};

  const parseLayout = (candidate: unknown): Partial<ResponseTableLayout> | undefined => {
    const record = parseObject(candidate);
    if (!record) return undefined;

    const columnOrder = Array.isArray(record.columnOrder)
      ? record.columnOrder.filter((item): item is string => typeof item === 'string')
      : [];

    const rawWidths = parseObject(record.columnWidths);
    const columnWidths: Record<string, number> = {};
    if (rawWidths) {
      for (const [key, width] of Object.entries(rawWidths)) {
        if (typeof width !== 'number' || !Number.isFinite(width)) continue;
        columnWidths[key] = width;
      }
    }

    return { columnOrder, columnWidths };
  };

  const submissions = parseLayout(root.submissions);
  const drafts = parseLayout(root.drafts);

  return {
    ...(submissions ? { submissions } : {}),
    ...(drafts ? { drafts } : {}),
  };
}

export default function FormResponsesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { success, error: showError } = useToast();
  const formId = params.id;
  const tablePreferenceKey = useMemo(() => `forms:responses:${formId}:table-layout:v2`, [formId]);

  const [page, setPage] = useState(1);
  const [draftPage, setDraftPage] = useState(1);
  const [submissionSortBy, setSubmissionSortBy] = useState<string>(DEFAULT_SUBMISSION_SORT_COLUMN_ID);
  const [submissionSortOrder, setSubmissionSortOrder] = useState<SubmissionSortOrder>('desc');
  const [draftSortBy, setDraftSortBy] = useState<string>(DEFAULT_DRAFT_SORT_COLUMN_ID);
  const [draftSortOrder, setDraftSortOrder] = useState<SubmissionSortOrder>('desc');
  const [submissionFilters, setSubmissionFilters] = useState<SubmissionFilters>({});
  const [draftFilters, setDraftFilters] = useState<SubmissionFilters>({});
  const [submissionColumnOrder, setSubmissionColumnOrder] = useState<string[]>([]);
  const [submissionColumnWidths, setSubmissionColumnWidths] = useState<Record<string, number>>({});
  const [draggedSubmissionColumnId, setDraggedSubmissionColumnId] = useState<string | null>(null);
  const [draftColumnOrder, setDraftColumnOrder] = useState<string[]>([]);
  const [draftColumnWidths, setDraftColumnWidths] = useState<Record<string, number>>({});
  const [draggedDraftColumnId, setDraggedDraftColumnId] = useState<string | null>(null);
  const [submissionToDelete, setSubmissionToDelete] = useState<SubmissionItem | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<DraftItem | null>(null);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDraftDeleteOpen, setIsBulkDraftDeleteOpen] = useState(false);
  const [isBulkDraftDeleting, setIsBulkDraftDeleting] = useState(false);
  const [attachmentDialog, setAttachmentDialog] = useState<AttachmentDialogState>(null);

  const submissionColumnOrderRef = useRef<string[]>([]);
  const submissionColumnWidthsRef = useRef<Record<string, number>>({});
  const draftColumnOrderRef = useRef<string[]>([]);
  const draftColumnWidthsRef = useRef<Record<string, number>>({});
  const tablePreferenceRef = useRef<ResponseTablePreference>({});
  const deferredSubmissionFilters = useDeferredValue(submissionFilters);

  const {
    data: form,
    isLoading: isFormLoading,
    isFetching: isFormFetching,
    error: formError,
    refetch: refetchForm,
  } = useForm(formId);
  const {
    data,
    isLoading,
    isFetching: isResponsesFetching,
    error,
    refetch: refetchResponses,
  } = useFormResponses(formId, {
    page,
    limit: PAGE_SIZE,
    draftPage,
    draftLimit: PAGE_SIZE,
    submissionSortBy,
    submissionSortOrder,
    submissionFilters: deferredSubmissionFilters,
  });
  const deleteResponseMutation = useDeleteFormResponse(formId);
  const deleteDraftMutation = useDeleteFormDraft(formId);
  const { data: tablePreferenceData } = useUserPreference<ResponseTablePreference>(tablePreferenceKey, {
    enabled: !!formId,
  });
  const saveTablePreference = useUpsertUserPreference<ResponseTablePreference>();

  useEffect(() => {
    submissionColumnOrderRef.current = submissionColumnOrder;
  }, [submissionColumnOrder]);

  useEffect(() => {
    submissionColumnWidthsRef.current = submissionColumnWidths;
  }, [submissionColumnWidths]);

  useEffect(() => {
    draftColumnOrderRef.current = draftColumnOrder;
  }, [draftColumnOrder]);

  useEffect(() => {
    draftColumnWidthsRef.current = draftColumnWidths;
  }, [draftColumnWidths]);

  const conversionRate = useMemo(() => {
    if (!form || form.viewsCount === 0) return 0;
    return Number(((form.submissionsCount / form.viewsCount) * 100).toFixed(1));
  }, [form]);

  const responseTableSettings = useMemo(
    () => parseFormResponseTableSettings(form?.settings),
    [form?.settings]
  );
  const parsedTablePreference = useMemo(
    () => parseResponseTablePreference(tablePreferenceData?.value),
    [tablePreferenceData?.value]
  );

  useEffect(() => {
    tablePreferenceRef.current = parsedTablePreference;
  }, [parsedTablePreference]);

  const summaryColumns = useMemo(() => {
    if (!form) return [] as ResponseColumnDef[];

    const fieldByKey = new Map(form.fields.map((field) => [field.key, field]));

    return responseTableSettings.summaryFieldKeys
      .map((fieldKey) => fieldByKey.get(fieldKey))
      .filter((field): field is (typeof form.fields)[number] => !!field && isSummaryEligibleFieldType(field.type))
      .map((field) => ({
        id: field.key,
        kind: 'field' as const,
        label: field.label || field.key,
        fieldKey: field.key,
        fieldType: field.type,
        minWidth: 140,
        defaultWidth: defaultFieldColumnWidth(field.type),
      }));
  }, [form, responseTableSettings.summaryFieldKeys]);

  const submissionColumnMap = useMemo(() => {
    const map = new Map<string, ResponseColumnDef>();

    map.set(RESPONSE_COLUMN_SUBMITTED_ID, {
      id: RESPONSE_COLUMN_SUBMITTED_ID,
      kind: 'submitted',
      label: 'Submitted',
      minWidth: 170,
      defaultWidth: 200,
    });

    for (const column of summaryColumns) {
      map.set(column.id, column);
    }

    map.set(RESPONSE_COLUMN_STATUS_ID, {
      id: RESPONSE_COLUMN_STATUS_ID,
      kind: 'status',
      label: 'Status',
      minWidth: 120,
      defaultWidth: 130,
    });

    map.set(SUBMISSION_ATTACHMENTS_COLUMN_ID, {
      id: SUBMISSION_ATTACHMENTS_COLUMN_ID,
      kind: 'attachments',
      label: 'Attachments',
      minWidth: 140,
      defaultWidth: 150,
    });

    return map;
  }, [summaryColumns]);

  const draftColumnMap = useMemo(() => {
    const map = new Map<string, ResponseColumnDef>();

    map.set(DRAFT_COLUMN_CODE_ID, {
      id: DRAFT_COLUMN_CODE_ID,
      kind: 'draftCode',
      label: 'Draft ID',
      minWidth: 140,
      defaultWidth: 150,
    });

    map.set(DRAFT_COLUMN_SAVED_ID, {
      id: DRAFT_COLUMN_SAVED_ID,
      kind: 'draftSaved',
      label: 'Last saved',
      minWidth: 170,
      defaultWidth: 180,
    });

    map.set(DRAFT_COLUMN_EXPIRES_ID, {
      id: DRAFT_COLUMN_EXPIRES_ID,
      kind: 'draftExpires',
      label: 'Expires',
      minWidth: 170,
      defaultWidth: 180,
    });

    map.set(DRAFT_COLUMN_LOCALE_ID, {
      id: DRAFT_COLUMN_LOCALE_ID,
      kind: 'draftLocale',
      label: 'Locale',
      minWidth: 120,
      defaultWidth: 140,
    });

    for (const column of summaryColumns) {
      map.set(column.id, column);
    }

    map.set(DRAFT_ATTACHMENTS_COLUMN_ID, {
      id: DRAFT_ATTACHMENTS_COLUMN_ID,
      kind: 'attachments',
      label: 'Attachments',
      minWidth: 140,
      defaultWidth: 150,
    });

    return map;
  }, [summaryColumns]);

  const submissionBaseColumnIds = useMemo(() => Array.from(submissionColumnMap.keys()), [submissionColumnMap]);
  const submissionBaseColumnSignature = useMemo(
    () => submissionBaseColumnIds.join('|'),
    [submissionBaseColumnIds]
  );
  const draftBaseColumnIds = useMemo(() => Array.from(draftColumnMap.keys()), [draftColumnMap]);
  const draftBaseColumnSignature = useMemo(() => draftBaseColumnIds.join('|'), [draftBaseColumnIds]);

  useEffect(() => {
    if (!form) return;

    const nextSubmissionOrder = normalizeResponseColumnOrder(
      submissionBaseColumnIds,
      parsedTablePreference.submissions?.columnOrder ?? responseTableSettings.columnOrder
    );
    const nextSubmissionWidths = sanitizeResponseColumnWidths(
      parsedTablePreference.submissions?.columnWidths ?? responseTableSettings.columnWidths,
      submissionBaseColumnIds
    );

    const nextDraftOrder = normalizeResponseColumnOrder(
      draftBaseColumnIds,
      parsedTablePreference.drafts?.columnOrder ?? []
    );
    const nextDraftWidths = sanitizeResponseColumnWidths(
      parsedTablePreference.drafts?.columnWidths ?? {},
      draftBaseColumnIds
    );

    setSubmissionColumnOrder(nextSubmissionOrder);
    setSubmissionColumnWidths(nextSubmissionWidths);
    setDraftColumnOrder(nextDraftOrder);
    setDraftColumnWidths(nextDraftWidths);
  }, [
    draftBaseColumnIds,
    draftBaseColumnSignature,
    form,
    parsedTablePreference,
    responseTableSettings.columnOrder,
    responseTableSettings.columnWidths,
    submissionBaseColumnIds,
    submissionBaseColumnSignature,
  ]);

  const orderedSubmissionColumns = useMemo(() => {
    const resolvedOrder = normalizeResponseColumnOrder(submissionBaseColumnIds, submissionColumnOrder);
    return resolvedOrder
      .map((columnId) => submissionColumnMap.get(columnId))
      .filter((column): column is ResponseColumnDef => !!column);
  }, [submissionBaseColumnIds, submissionColumnOrder, submissionColumnMap]);

  const orderedDraftColumns = useMemo(() => {
    const resolvedOrder = normalizeResponseColumnOrder(draftBaseColumnIds, draftColumnOrder);
    return resolvedOrder
      .map((columnId) => draftColumnMap.get(columnId))
      .filter((column): column is ResponseColumnDef => !!column);
  }, [draftBaseColumnIds, draftColumnOrder, draftColumnMap]);

  const filteredDrafts = useMemo(() => {
    if (!data?.drafts) return [] as DraftItem[];

    const normalizedFilters = Object.entries(draftFilters)
      .map(([columnId, value]) => [columnId, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value.length > 0);

    if (normalizedFilters.length === 0) {
      return [...data.drafts].sort((left, right) => (
        compareDraftRows(left, right, draftSortBy, draftSortOrder, orderedDraftColumns)
      ));
    }

    return data.drafts.filter((draft) => normalizedFilters.every(([columnId, value]) => {
      const column = orderedDraftColumns.find((candidate) => candidate.id === columnId);
      if (!column) {
        return true;
      }

      return renderDraftCell(draft, column).toLowerCase().includes(value);
    })).sort((left, right) => compareDraftRows(left, right, draftSortBy, draftSortOrder, orderedDraftColumns));
  }, [data?.drafts, draftFilters, draftSortBy, draftSortOrder, orderedDraftColumns]);

  const visibleSubmissionIds = useMemo(
    () => data?.submissions.map((submission) => submission.id) ?? [],
    [data?.submissions]
  );
  const visibleDraftIds = useMemo(
    () => filteredDrafts.map((draft) => draft.id),
    [filteredDrafts]
  );
  const isAllVisibleSubmissionsSelected = visibleSubmissionIds.length > 0
    && visibleSubmissionIds.every((id) => selectedSubmissionIds.has(id));
  const isSomeVisibleSubmissionsSelected = visibleSubmissionIds.some((id) => selectedSubmissionIds.has(id));
  const isAllVisibleDraftsSelected = visibleDraftIds.length > 0
    && visibleDraftIds.every((id) => selectedDraftIds.has(id));
  const isSomeVisibleDraftsSelected = visibleDraftIds.some((id) => selectedDraftIds.has(id));
  const hasActiveSubmissionFilters = Object.values(submissionFilters).some((value) => value.trim().length > 0);
  const hasActiveDraftFilters = Object.values(draftFilters).some((value) => value.trim().length > 0);
  const submissionFilterChips = useMemo(() => (
    Object.entries(submissionFilters)
      .map(([columnId, value]) => ({
        columnId,
        label: submissionColumnMap.get(columnId)?.label || columnId,
        value: value.trim(),
      }))
      .filter((chip) => chip.value.length > 0)
  ), [submissionColumnMap, submissionFilters]);
  const draftFilterChips = useMemo(() => (
    Object.entries(draftFilters)
      .map(([columnId, value]) => ({
        columnId,
        label: draftColumnMap.get(columnId)?.label || columnId,
        value: value.trim(),
      }))
      .filter((chip) => chip.value.length > 0)
  ), [draftColumnMap, draftFilters]);

  useEffect(() => {
    setSelectedSubmissionIds((previous) => new Set(
      [...previous].filter((id) => visibleSubmissionIds.includes(id))
    ));
  }, [visibleSubmissionIds]);

  useEffect(() => {
    setSelectedDraftIds((previous) => new Set(
      [...previous].filter((id) => visibleDraftIds.includes(id))
    ));
  }, [visibleDraftIds]);

  const submissionTableWidth = useMemo(
    () => orderedSubmissionColumns.reduce(
      (total, column) => total + (submissionColumnWidths[column.id] ?? column.defaultWidth),
      SUBMISSION_SELECT_COLUMN_WIDTH + SUBMISSION_OPEN_COLUMN_WIDTH + SUBMISSION_ACTION_COLUMN_WIDTH
    ),
    [orderedSubmissionColumns, submissionColumnWidths]
  );
  const draftTableWidth = useMemo(
    () => orderedDraftColumns.reduce(
      (total, column) => total + (draftColumnWidths[column.id] ?? column.defaultWidth),
      DRAFT_SELECT_COLUMN_WIDTH + DRAFT_OPEN_COLUMN_WIDTH + DRAFT_ACTION_COLUMN_WIDTH
    ),
    [draftColumnWidths, orderedDraftColumns]
  );

  const isRefreshing = isFormFetching || isResponsesFetching;

  const handleRefresh = useCallback(() => {
    void Promise.all([refetchForm(), refetchResponses()]);
  }, [refetchForm, refetchResponses]);

  useKeyboardShortcuts([
    {
      key: 'r',
      ctrl: true,
      handler: handleRefresh,
      description: 'Refresh responses',
    },
  ]);

  async function persistLayout(
    kind: ResponseTableKind,
    baseColumnIds: string[],
    nextOrder: string[],
    nextWidths: Record<string, number>
  ) {
    const sanitizedOrder = normalizeResponseColumnOrder(baseColumnIds, nextOrder);
    const sanitizedWidths = sanitizeResponseColumnWidths(nextWidths, baseColumnIds);
    const nextPreference: ResponseTablePreference = {
      ...tablePreferenceRef.current,
      [kind]: {
        columnOrder: sanitizedOrder,
        columnWidths: sanitizedWidths,
      },
    };

    tablePreferenceRef.current = nextPreference;

    try {
      await saveTablePreference.mutateAsync({
        key: tablePreferenceKey,
        value: nextPreference,
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save table layout');
    }
  }

  function reorderColumns(
    sourceColumnId: string,
    targetColumnId: string,
    baseColumnIds: string[],
    columnOrderRef: { current: string[] },
    columnWidthsRef: { current: Record<string, number> },
    setColumnOrder: Dispatch<SetStateAction<string[]>>,
    kind: ResponseTableKind
  ) {
    const currentOrder = normalizeResponseColumnOrder(baseColumnIds, columnOrderRef.current);
    const fromIndex = currentOrder.indexOf(sourceColumnId);
    const toIndex = currentOrder.indexOf(targetColumnId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    if (!moved) return;
    nextOrder.splice(toIndex, 0, moved);

    setColumnOrder(nextOrder);
    void persistLayout(kind, baseColumnIds, nextOrder, columnWidthsRef.current);
  }

  function startColumnResize(
    event: ReactPointerEvent<HTMLDivElement>,
    column: ResponseColumnDef,
    columnWidthsRef: { current: Record<string, number> },
    setColumnWidths: Dispatch<SetStateAction<Record<string, number>>>,
    columnOrderRef: { current: string[] },
    baseColumnIds: string[],
    kind: ResponseTableKind
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = columnWidthsRef.current[column.id] ?? column.defaultWidth;
    let latestWidth = startWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = clampResponseColumnWidth(Math.max(column.minWidth, startWidth + delta));
      setColumnWidths((prev) => ({ ...prev, [column.id]: latestWidth }));
    };

    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const nextWidths = { ...columnWidthsRef.current, [column.id]: latestWidth };
      setColumnWidths(nextWidths);
      void persistLayout(kind, baseColumnIds, columnOrderRef.current, nextWidths);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function exportCsv() {
    if (!form) return;
    try {
      const res = await fetch(`/api/forms/${formId}/responses/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'responses.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // Export failure is non-blocking for this page.
    }
  }

  async function handleDeleteSubmission(reason?: string) {
    if (!submissionToDelete) return;

    const deletingLastSubmissionOnPage = (data?.submissions.length ?? 0) === 1 && page > 1;

    try {
      await deleteResponseMutation.mutateAsync({
        submissionId: submissionToDelete.id,
        reason,
      });
      success('Response deleted');
      setSubmissionToDelete(null);

      if (deletingLastSubmissionOnPage) {
        setPage((prev) => Math.max(1, prev - 1));
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete response');
    }
  }

  async function handleDeleteSelectedSubmissions(reason?: string) {
    const submissionIds = Array.from(selectedSubmissionIds);
    if (submissionIds.length === 0) return;

    const deletingAllVisibleSubmissions = visibleSubmissionIds.length > 0
      && visibleSubmissionIds.every((submissionId) => selectedSubmissionIds.has(submissionId))
      && page > 1;

    let deletedCount = 0;
    let failedCount = 0;

    setIsBulkDeleting(true);

    try {
      for (const submissionId of submissionIds) {
        try {
          await deleteResponseMutation.mutateAsync({
            submissionId,
            reason: reason || 'Bulk delete from responses table',
          });
          deletedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (deletedCount > 0) {
        success(`${deletedCount} response${deletedCount === 1 ? '' : 's'} deleted`);
      }

      if (failedCount > 0) {
        showError(`Failed to delete ${failedCount} response${failedCount === 1 ? '' : 's'}`);
      }

      setSelectedSubmissionIds(new Set());
      setIsBulkDeleteOpen(false);

      if (deletedCount > 0 && deletingAllVisibleSubmissions) {
        setPage((previous) => Math.max(1, previous - 1));
      } else if (deletedCount > 0) {
        void refetchResponses();
      }
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function handleDeleteSelectedDrafts(reason?: string) {
    const draftIds = Array.from(selectedDraftIds);
    if (draftIds.length === 0) return;

    const deletingAllVisibleDrafts = visibleDraftIds.length > 0
      && visibleDraftIds.every((draftId) => selectedDraftIds.has(draftId))
      && draftPage > 1;

    let deletedCount = 0;
    let failedCount = 0;

    setIsBulkDraftDeleting(true);

    try {
      for (const draftId of draftIds) {
        try {
          await deleteDraftMutation.mutateAsync({
            draftId,
            reason: reason || 'Bulk delete from draft responses table',
          });
          deletedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (deletedCount > 0) {
        success(`${deletedCount} draft${deletedCount === 1 ? '' : 's'} deleted`);
      }

      if (failedCount > 0) {
        showError(`Failed to delete ${failedCount} draft${failedCount === 1 ? '' : 's'}`);
      }

      setSelectedDraftIds(new Set());
      setIsBulkDraftDeleteOpen(false);

      if (deletedCount > 0 && deletingAllVisibleDrafts) {
        setDraftPage((previous) => Math.max(1, previous - 1));
      } else if (deletedCount > 0) {
        void refetchResponses();
      }
    } finally {
      setIsBulkDraftDeleting(false);
    }
  }

  async function handleDeleteDraft(reason?: string) {
    if (!draftToDelete) return;

    const deletingLastDraftOnPage = (data?.drafts.length ?? 0) === 1 && draftPage > 1;

    try {
      await deleteDraftMutation.mutateAsync({
        draftId: draftToDelete.id,
        reason,
      });
      success('Draft deleted');
      setDraftToDelete(null);

      if (deletingLastDraftOnPage) {
        setDraftPage((prev) => Math.max(1, prev - 1));
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete draft');
    }
  }

  function handleSubmissionSort(columnId: string) {
    setPage(1);
    setSelectedSubmissionIds(new Set());

    if (submissionSortBy === columnId) {
      setSubmissionSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSubmissionSortBy(columnId);
    setSubmissionSortOrder(columnId === RESPONSE_COLUMN_SUBMITTED_ID ? 'desc' : 'asc');
  }

  function handleSubmissionFilterChange(columnId: string, value: string) {
    setPage(1);
    setSelectedSubmissionIds(new Set());
    setSubmissionFilters((previous) => ({
      ...previous,
      [columnId]: value,
    }));
  }

  function clearSubmissionFilters() {
    setPage(1);
    setSelectedSubmissionIds(new Set());
    setSubmissionFilters({});
  }

  function handleDraftFilterChange(columnId: string, value: string) {
    setSelectedDraftIds(new Set());
    setDraftFilters((previous) => ({
      ...previous,
      [columnId]: value,
    }));
  }

  function clearDraftFilters() {
    setSelectedDraftIds(new Set());
    setDraftFilters({});
  }

  function toggleSubmissionSelection(submissionId: string) {
    setSelectedDraftIds(new Set());
    setSelectedSubmissionIds((previous) => {
      const next = new Set(previous);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  }

  function toggleAllVisibleSubmissionSelection() {
    setSelectedDraftIds(new Set());
    setSelectedSubmissionIds((previous) => {
      const next = new Set(previous);

      if (isAllVisibleSubmissionsSelected) {
        visibleSubmissionIds.forEach((submissionId) => next.delete(submissionId));
      } else {
        visibleSubmissionIds.forEach((submissionId) => next.add(submissionId));
      }

      return next;
    });
  }

  function handleDraftSort(columnId: string) {
    setSelectedDraftIds(new Set());

    if (draftSortBy === columnId) {
      setDraftSortOrder((previous) => (previous === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setDraftSortBy(columnId);
    setDraftSortOrder(columnId === DRAFT_COLUMN_SAVED_ID ? 'desc' : 'asc');
  }

  function toggleDraftSelection(draftId: string) {
    setSelectedSubmissionIds(new Set());
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);
      if (next.has(draftId)) {
        next.delete(draftId);
      } else {
        next.add(draftId);
      }
      return next;
    });
  }

  function toggleAllVisibleDraftSelection() {
    setSelectedSubmissionIds(new Set());
    setSelectedDraftIds((previous) => {
      const next = new Set(previous);

      if (isAllVisibleDraftsSelected) {
        visibleDraftIds.forEach((draftId) => next.delete(draftId));
      } else {
        visibleDraftIds.forEach((draftId) => next.add(draftId));
      }

      return next;
    });
  }

  if (isFormLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-10 w-72 animate-pulse rounded bg-background-tertiary mb-4" />
        <div className="h-64 animate-pulse rounded-lg border border-border-primary bg-background-elevated" />
      </div>
    );
  }

  if (formError || !form) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {formError instanceof Error ? formError.message : 'Form not found'}
        </div>
      </div>
    );
  }

  const viewHref = form.status === 'PUBLISHED'
    ? `/forms/f/${form.slug}`
    : `/forms/f/${form.slug}?preview=1&formId=${form.id}&tenantId=${form.tenantId}`;

  function handleOpenPreview() {
    window.open(viewHref, '_blank', 'noopener,noreferrer');
  }

  function getSubmissionHref(submissionId: string) {
    return `/forms/${params.id}/responses/${submissionId}`;
  }

  function getDraftHref(draftId: string) {
    return `/forms/${params.id}/responses/drafts/${draftId}`;
  }

  function openSubmissionDetail(submissionId: string) {
    router.push(getSubmissionHref(submissionId));
  }

  function openDraftDetail(draftId: string) {
    router.push(getDraftHref(draftId));
  }

  function getAttachmentHref(source: NonNullable<AttachmentDialogState>['source'], uploadId: string): string {
    if (!form) return '#';

    const tenantQuery = form.tenantId ? `?tenantId=${encodeURIComponent(form.tenantId)}&disposition=inline` : '?disposition=inline';

    if (source.type === 'submission') {
      return `/api/forms/${encodeURIComponent(form.id)}/responses/${encodeURIComponent(source.id)}/uploads/${encodeURIComponent(uploadId)}${tenantQuery}`;
    }

    return `/api/forms/${encodeURIComponent(form.id)}/drafts/${encodeURIComponent(source.id)}/uploads/${encodeURIComponent(uploadId)}${tenantQuery}`;
  }

  function renderSubmissionCell(submission: SubmissionItem, column: ResponseColumnDef): ReactNode {
    if (column.kind === 'submitted') return formatDate(submission.submittedAt);
    if (column.kind === 'status') {
      const aiReview = parseFormSubmissionAiReview(submission.metadata);
      const reviewRequired = hasUnresolvedFormSubmissionAiWarning(aiReview);
      const reviewPending = aiReview?.status === 'queued' || aiReview?.status === 'processing';

      return (
        <span className="inline-flex items-center gap-1.5">
          {reviewPending && (
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 text-sky-500 ${aiReview?.status === 'processing' ? 'animate-spin' : ''}`} aria-hidden="true" />
          )}
          {reviewRequired && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          )}
          <span>{submission.status}</span>
        </span>
      );
    }

    const answers = toAnswerRecord(submission.answers);
    const value = answers[column.fieldKey || ''];
    return formatSummaryCellValue(column.fieldType || 'SHORT_TEXT', value);
  }

  function openAttachmentsDialog(
    title: string,
    description: string,
    attachments: SubmissionItem['attachments'],
    source: NonNullable<AttachmentDialogState>['source']
  ) {
    setAttachmentDialog({
      title,
      description,
      attachments,
      source,
    });
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link href="/forms" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
            <ChevronLeft className="w-4 h-4" />
            Back to Forms
          </Link>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">
            Responses to &quot;{form.title}&quot;
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <span className="hidden xl:inline">Refresh (Ctrl+R)</span>
            <span className="xl:hidden">Refresh</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={handleOpenPreview}>
            {form.status === 'PUBLISHED' ? 'View' : 'Preview'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push(`/forms/${form.id}/builder`)}>
            Edit Form
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 mb-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Total views</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{form.viewsCount}</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Responses</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{form.submissionsCount}</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Conversion rate</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{conversionRate}%</div>
        </div>
        <div className="rounded-lg border border-border-primary bg-background-elevated p-4">
          <div className="text-xs text-text-secondary">Active drafts</div>
          <div className="mt-1 text-2xl font-semibold text-text-primary">{data?.draftTotal ?? 0}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border-primary px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text-primary">Submissions</div>
            <p className="mt-1 text-xs text-text-secondary">
              Sort and filter the visible response columns directly in the table.
            </p>
          </div>
          {hasActiveSubmissionFilters && (
            <button
              type="button"
              onClick={clearSubmissionFilters}
              className="text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Clear filters
            </button>
          )}
        </div>

        {submissionFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-primary px-4 py-3">
            <span className="text-xs font-medium text-text-secondary">Active filters:</span>
            {submissionFilterChips.map((chip) => (
              <FilterChip
                key={chip.columnId}
                label={chip.label}
                value={chip.value}
                onRemove={() => handleSubmissionFilterChange(chip.columnId, '')}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error instanceof Error ? error.message : 'Failed to load responses'}
          </div>
        )}

        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded bg-background-tertiary" />
            ))}
          </div>
        )}

        {!isLoading && data && data.submissions.length === 0 && !hasActiveSubmissionFilters && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">
            No submissions yet.
          </div>
        )}

        {!isLoading && data && (data.submissions.length > 0 || hasActiveSubmissionFilters) && (
          <div className="overflow-x-auto px-4 pb-4">
            <table
              className="table-fixed text-sm"
              style={{ width: `${submissionTableWidth}px` }}
            >
              <thead className="bg-background-primary">
                <tr className="border-b border-border-primary bg-background-elevated/60">
                  <th
                    className="pl-4 pr-2 py-2"
                    style={{ width: `${SUBMISSION_SELECT_COLUMN_WIDTH}px`, minWidth: `${SUBMISSION_SELECT_COLUMN_WIDTH}px` }}
                  />
                  <th
                    className="px-2 py-2"
                    style={{ width: `${SUBMISSION_OPEN_COLUMN_WIDTH}px`, minWidth: `${SUBMISSION_OPEN_COLUMN_WIDTH}px` }}
                  />
                  {orderedSubmissionColumns.map((column) => (
                    <th
                      key={`${column.id}:filter`}
                      style={{ width: `${submissionColumnWidths[column.id] ?? column.defaultWidth}px`, minWidth: `${column.minWidth}px` }}
                      className="px-3 py-3"
                    >
                      <input
                        value={submissionFilters[column.id] || ''}
                        onChange={(event) => handleSubmissionFilterChange(column.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="Filter"
                        aria-label={`Filter ${column.label}`}
                        className="w-full rounded-md border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-oak-primary"
                      />
                    </th>
                  ))}
                  <th
                    className="px-2 py-2"
                    style={{ width: `${SUBMISSION_ACTION_COLUMN_WIDTH}px`, minWidth: `${SUBMISSION_ACTION_COLUMN_WIDTH}px` }}
                  />
                </tr>
                <tr className="text-left text-xs text-text-secondary">
                  <th
                    className="pl-4 pr-2 py-2 font-medium"
                    style={{ width: `${SUBMISSION_SELECT_COLUMN_WIDTH}px`, minWidth: `${SUBMISSION_SELECT_COLUMN_WIDTH}px` }}
                  >
                    <div onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        size="sm"
                        checked={isAllVisibleSubmissionsSelected}
                        indeterminate={!isAllVisibleSubmissionsSelected && isSomeVisibleSubmissionsSelected}
                        onChange={toggleAllVisibleSubmissionSelection}
                        aria-label="Select all visible submissions"
                        className="justify-center"
                      />
                    </div>
                  </th>
                  <th
                    className="px-2 py-2 font-medium text-center"
                    style={{ width: `${SUBMISSION_OPEN_COLUMN_WIDTH}px`, minWidth: `${SUBMISSION_OPEN_COLUMN_WIDTH}px` }}
                  >
                    <span className="sr-only">Open in new tab</span>
                    <ExternalLink className="mx-auto h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  </th>
                  {orderedSubmissionColumns.map((column) => {
                    const width = submissionColumnWidths[column.id] ?? column.defaultWidth;
                    const isActiveSort = submissionSortBy === column.id;
                    return (
                      <th
                        key={column.id}
                        style={{ width: `${width}px`, minWidth: `${column.minWidth}px` }}
                        className={cn(
                          'relative px-4 py-2 font-medium select-none',
                          draggedSubmissionColumnId === column.id && 'opacity-50'
                        )}
                        draggable
                        onDragStart={(event) => {
                          setDraggedSubmissionColumnId(column.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', column.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceColumnId = draggedSubmissionColumnId || event.dataTransfer.getData('text/plain');
                          if (!sourceColumnId) return;
                          reorderColumns(
                            sourceColumnId,
                            column.id,
                            submissionBaseColumnIds,
                            submissionColumnOrderRef,
                            submissionColumnWidthsRef,
                            setSubmissionColumnOrder,
                            'submissions'
                          );
                          setDraggedSubmissionColumnId(null);
                        }}
                        onDragEnd={() => setDraggedSubmissionColumnId(null)}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <GripVertical className="h-3.5 w-3.5 text-text-muted" />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSubmissionSort(column.id);
                            }}
                            className={cn(
                              'inline-flex min-w-0 items-center gap-1 text-left hover:text-text-primary',
                              isActiveSort && 'text-text-primary'
                            )}
                            aria-label={`Sort by ${column.label}`}
                          >
                            <span className="truncate">{column.label}</span>
                            {isActiveSort ? (
                              submissionSortOrder === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                            )}
                          </button>
                        </div>
                        <div
                          onPointerDown={(event) => startColumnResize(
                            event,
                            column,
                            submissionColumnWidthsRef,
                            setSubmissionColumnWidths,
                            submissionColumnOrderRef,
                            submissionBaseColumnIds,
                            'submissions'
                          )}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                    );
                  })}
                  <th
                    className="px-2 py-2 font-medium text-center"
                    style={{ width: `${SUBMISSION_ACTION_COLUMN_WIDTH}px`, minWidth: `${SUBMISSION_ACTION_COLUMN_WIDTH}px` }}
                  >
                    <span className="sr-only">Delete</span>
                    <Trash2 className="mx-auto h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={orderedSubmissionColumns.length + 3}
                      className="px-4 py-10 text-center text-sm text-text-secondary"
                    >
                      No submissions match the current filters.
                    </td>
                  </tr>
                ) : data.submissions.map((submission, index) => {
                  const isSelected = selectedSubmissionIds.has(submission.id);
                  const isAlternate = index % 2 === 1;

                  return (
                    <tr
                      key={submission.id}
                      className={cn(
                        'group cursor-pointer border-t border-border-primary text-text-primary hover:bg-background-primary/60',
                        isSelected ? 'bg-oak-primary/5' : isAlternate ? 'bg-background-primary/40' : 'bg-background-elevated'
                      )}
                      onClick={() => openSubmissionDetail(submission.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openSubmissionDetail(submission.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label="Open submission details"
                    >
                      <td
                        className="pl-4 pr-2 py-3.5 align-middle"
                        style={{ width: `${SUBMISSION_SELECT_COLUMN_WIDTH}px` }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          size="sm"
                          checked={isSelected}
                          onChange={() => toggleSubmissionSelection(submission.id)}
                          aria-label={`Select submission ${submission.id}`}
                          className="justify-center"
                        />
                      </td>
                      <td
                        className="px-2 py-3.5 align-middle"
                        style={{ width: `${SUBMISSION_OPEN_COLUMN_WIDTH}px` }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Tooltip content="Open in new tab">
                          <Link
                            href={getSubmissionHref(submission.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex rounded p-1.5 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                            aria-label="Open in new tab"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Tooltip>
                      </td>
                      {orderedSubmissionColumns.map((column) => (
                        <td
                          key={`${submission.id}:${column.id}`}
                          style={{ width: `${submissionColumnWidths[column.id] ?? column.defaultWidth}px` }}
                          className="px-4 py-3.5 align-middle"
                        >
                          {column.kind === 'attachments' ? (
                            submission.attachments.length > 0 ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAttachmentsDialog(
                                    'Submission attachments',
                                    `Attachments linked to the response submitted on ${formatDate(submission.submittedAt)}.`,
                                    submission.attachments,
                                    { type: 'submission', id: submission.id }
                                  );
                                }}
                                className="inline-flex min-w-[6rem] items-center justify-center gap-1.5 whitespace-nowrap rounded border border-border-primary px-2.5 py-1.5 text-xs text-text-secondary hover:bg-background-primary hover:text-text-primary"
                                aria-label={`View attachments for submission ${submission.id}`}
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                {submission.uploadCount} file{submission.uploadCount === 1 ? '' : 's'}
                              </button>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )
                          ) : (
                            <span className="line-clamp-2 break-words">
                              {renderSubmissionCell(submission, column)}
                            </span>
                          )}
                        </td>
                      ))}
                      <td
                        className="px-2 py-3.5 align-middle"
                        style={{ width: `${SUBMISSION_ACTION_COLUMN_WIDTH}px` }}
                      >
                        <div className="flex justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Tooltip content="Delete submission">
                            <button
                              type="button"
                              className="rounded p-1.5 text-text-secondary hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSubmissionToDelete(submission);
                              }}
                              aria-label="Delete submission"
                              disabled={deleteResponseMutation.isPending && submissionToDelete?.id === submission.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={data.limit}
            onPageChange={setPage}
            showPageSize={false}
          />
        )}
      </div>

      <BulkActionsToolbar
        selectedCount={selectedDraftIds.size > 0 ? selectedDraftIds.size : selectedSubmissionIds.size}
        onClearSelection={() => {
          setSelectedSubmissionIds(new Set());
          setSelectedDraftIds(new Set());
        }}
        actions={[
          {
            id: 'delete',
            label: 'Delete',
            icon: Trash2,
            description: selectedDraftIds.size > 0 ? 'Delete selected drafts' : 'Delete selected submissions',
            variant: 'danger',
            isLoading: selectedDraftIds.size > 0 ? isBulkDraftDeleting : isBulkDeleting,
          },
        ]}
        onAction={(actionId) => {
          if (actionId !== 'delete') return;
          if (selectedDraftIds.size > 0) {
            setIsBulkDraftDeleteOpen(true);
            return;
          }
          if (selectedSubmissionIds.size > 0) {
            setIsBulkDeleteOpen(true);
          }
        }}
      />

      <div className="mt-4 rounded-lg border border-border-primary bg-background-elevated overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border-primary px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text-primary">Draft entries</div>
            <p className="mt-1 text-xs text-text-secondary">
              Active saved drafts that have not been submitted yet.
            </p>
          </div>
          {hasActiveDraftFilters && (
            <button
              type="button"
              onClick={clearDraftFilters}
              className="text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Clear filters
            </button>
          )}
        </div>

        {draftFilterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-primary px-4 py-3">
            <span className="text-xs font-medium text-text-secondary">Active filters:</span>
            {draftFilterChips.map((chip) => (
              <FilterChip
                key={chip.columnId}
                label={chip.label}
                value={chip.value}
                onRemove={() => handleDraftFilterChange(chip.columnId, '')}
              />
            ))}
          </div>
        )}

        {isLoading && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded bg-background-tertiary" />
            ))}
          </div>
        )}

        {!isLoading && data && data.drafts.length === 0 && !hasActiveDraftFilters && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">No active draft entries.</div>
        )}

        {!isLoading && data && (data.drafts.length > 0 || hasActiveDraftFilters) && (
          <div className="overflow-x-auto px-4 pb-4">
            <table
              className="table-fixed text-sm"
              style={{ width: `${draftTableWidth}px` }}
            >
              <thead className="bg-background-primary">
                <tr className="border-b border-border-primary bg-background-elevated/60">
                  <th
                    className="pl-4 pr-2 py-2"
                    style={{ width: `${DRAFT_SELECT_COLUMN_WIDTH}px`, minWidth: `${DRAFT_SELECT_COLUMN_WIDTH}px` }}
                  />
                  <th
                    className="px-2 py-2"
                    style={{ width: `${DRAFT_OPEN_COLUMN_WIDTH}px`, minWidth: `${DRAFT_OPEN_COLUMN_WIDTH}px` }}
                  />
                  {orderedDraftColumns.map((column) => (
                    <th
                      key={`draft-filter-${column.id}`}
                      style={{ width: `${draftColumnWidths[column.id] ?? column.defaultWidth}px`, minWidth: `${column.minWidth}px` }}
                      className="px-3 py-3"
                    >
                      <input
                        value={draftFilters[column.id] || ''}
                        onChange={(event) => handleDraftFilterChange(column.id, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="Filter"
                        aria-label={`Filter ${column.label}`}
                        className="w-full rounded-md border border-border-primary bg-background-primary px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-oak-primary"
                      />
                    </th>
                  ))}
                  <th
                    className="px-2 py-2"
                    style={{ width: `${DRAFT_ACTION_COLUMN_WIDTH}px`, minWidth: `${DRAFT_ACTION_COLUMN_WIDTH}px` }}
                  />
                </tr>
                <tr className="text-left text-xs text-text-secondary">
                  <th
                    className="pl-4 pr-2 py-2 font-medium"
                    style={{ width: `${DRAFT_SELECT_COLUMN_WIDTH}px`, minWidth: `${DRAFT_SELECT_COLUMN_WIDTH}px` }}
                  >
                    <div onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        size="sm"
                        checked={isAllVisibleDraftsSelected}
                        indeterminate={!isAllVisibleDraftsSelected && isSomeVisibleDraftsSelected}
                        onChange={toggleAllVisibleDraftSelection}
                        aria-label="Select all visible drafts"
                        className="justify-center"
                      />
                    </div>
                  </th>
                  <th
                    className="px-2 py-2 font-medium text-center"
                    style={{ width: `${DRAFT_OPEN_COLUMN_WIDTH}px`, minWidth: `${DRAFT_OPEN_COLUMN_WIDTH}px` }}
                  >
                    <span className="sr-only">Open in new tab</span>
                    <ExternalLink className="mx-auto h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  </th>
                  {orderedDraftColumns.map((column) => {
                    const width = draftColumnWidths[column.id] ?? column.defaultWidth;
                    const isActiveSort = draftSortBy === column.id;

                    return (
                      <th
                        key={`draft-${column.id}`}
                        style={{ width: `${width}px`, minWidth: `${column.minWidth}px` }}
                        className={cn(
                          'relative px-4 py-2 font-medium select-none',
                          draggedDraftColumnId === column.id && 'opacity-50'
                        )}
                        draggable
                        onDragStart={(event) => {
                          setDraggedDraftColumnId(column.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', column.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceColumnId = draggedDraftColumnId || event.dataTransfer.getData('text/plain');
                          if (!sourceColumnId) return;
                          reorderColumns(
                            sourceColumnId,
                            column.id,
                            draftBaseColumnIds,
                            draftColumnOrderRef,
                            draftColumnWidthsRef,
                            setDraftColumnOrder,
                            'drafts'
                          );
                          setDraggedDraftColumnId(null);
                        }}
                        onDragEnd={() => setDraggedDraftColumnId(null)}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <GripVertical className="h-3.5 w-3.5 text-text-muted" />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDraftSort(column.id);
                            }}
                            className={cn(
                              'inline-flex min-w-0 items-center gap-1 text-left hover:text-text-primary',
                              isActiveSort && 'text-text-primary'
                            )}
                            aria-label={`Sort by ${column.label}`}
                          >
                            <span className="truncate">{column.label}</span>
                            {isActiveSort ? (
                              draftSortOrder === 'asc' ? (
                                <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                            )}
                          </button>
                        </div>
                        <div
                          onPointerDown={(event) => startColumnResize(
                            event,
                            column,
                            draftColumnWidthsRef,
                            setDraftColumnWidths,
                            draftColumnOrderRef,
                            draftBaseColumnIds,
                            'drafts'
                          )}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                    );
                  })}
                  <th
                    className="px-2 py-2 font-medium text-center"
                    style={{ width: `${DRAFT_ACTION_COLUMN_WIDTH}px`, minWidth: `${DRAFT_ACTION_COLUMN_WIDTH}px` }}
                  >
                    <span className="sr-only">Delete</span>
                    <Trash2 className="mx-auto h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDrafts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={orderedDraftColumns.length + 3}
                      className="px-4 py-10 text-center text-sm text-text-secondary"
                    >
                      No draft entries match the current filters.
                    </td>
                  </tr>
                ) : filteredDrafts.map((draft, index) => {
                  const isSelected = selectedDraftIds.has(draft.id);
                  const isAlternate = index % 2 === 1;

                  return (
                    <tr
                      key={draft.id}
                      className={cn(
                        'group cursor-pointer border-t border-border-primary text-text-primary hover:bg-background-primary/60',
                        isSelected ? 'bg-oak-primary/5' : isAlternate ? 'bg-background-primary/40' : 'bg-background-elevated'
                      )}
                      onClick={() => openDraftDetail(draft.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openDraftDetail(draft.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label="Open draft details"
                    >
                      <td
                        className="pl-4 pr-2 py-3.5 align-middle"
                        style={{ width: `${DRAFT_SELECT_COLUMN_WIDTH}px` }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          size="sm"
                          checked={isSelected}
                          onChange={() => toggleDraftSelection(draft.id)}
                          aria-label={`Select draft ${draft.code}`}
                          className="justify-center"
                        />
                      </td>
                      <td
                        className="px-2 py-3.5 align-middle"
                        style={{ width: `${DRAFT_OPEN_COLUMN_WIDTH}px` }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Tooltip content="Open in new tab">
                          <Link
                            href={getDraftHref(draft.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex rounded p-1.5 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                            aria-label="Open in new tab"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Tooltip>
                      </td>
                      {orderedDraftColumns.map((column) => (
                        <td
                          key={`${draft.id}:${column.id}`}
                          style={{ width: `${draftColumnWidths[column.id] ?? column.defaultWidth}px` }}
                          className="px-4 py-3.5 align-middle"
                        >
                          {column.kind === 'attachments' ? (
                            draft.attachments.length > 0 ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAttachmentsDialog(
                                    `Draft ${draft.code} attachments`,
                                    `Attachments linked to draft ${draft.code}.`,
                                    draft.attachments,
                                    { type: 'draft', id: draft.id }
                                  );
                                }}
                                className="inline-flex min-w-[6rem] items-center justify-center gap-1.5 whitespace-nowrap rounded border border-border-primary px-2.5 py-1.5 text-xs text-text-secondary hover:bg-background-primary hover:text-text-primary"
                                aria-label={`View attachments for draft ${draft.code}`}
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                {draft.uploadCount} file{draft.uploadCount === 1 ? '' : 's'}
                              </button>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )
                          ) : (
                            <span className={cn(
                              'line-clamp-2 break-words',
                              column.kind === 'draftCode' && 'font-mono text-xs sm:text-sm'
                            )}>
                              {renderDraftCell(draft, column)}
                            </span>
                          )}
                        </td>
                      ))}
                      <td
                        className="px-2 py-3.5 align-middle"
                        style={{ width: `${DRAFT_ACTION_COLUMN_WIDTH}px` }}
                      >
                        <div className="flex justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Tooltip content="Delete draft">
                            <button
                              type="button"
                              className="rounded p-1.5 text-text-secondary hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                              onClick={(event) => {
                                event.stopPropagation();
                                setDraftToDelete(draft);
                              }}
                              aria-label="Delete draft"
                              disabled={deleteDraftMutation.isPending && draftToDelete?.id === draft.id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.draftTotalPages > 1 && (
          <Pagination
            page={data.draftPage}
            totalPages={data.draftTotalPages}
            total={data.draftTotal}
            limit={data.draftLimit}
            onPageChange={setDraftPage}
            showPageSize={false}
          />
        )}
      </div>

      <ConfirmDialog
        isOpen={!!submissionToDelete}
        onClose={() => setSubmissionToDelete(null)}
        onConfirm={handleDeleteSubmission}
        title="Delete response"
        description={submissionToDelete ? `Are you sure you want to delete the response submitted on ${formatDate(submissionToDelete.submittedAt)}? This action cannot be undone.` : undefined}
        confirmLabel="Delete response"
        isLoading={deleteResponseMutation.isPending}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleDeleteSelectedSubmissions}
        title="Delete selected responses"
        description={`Are you sure you want to delete ${selectedSubmissionIds.size} selected response${selectedSubmissionIds.size === 1 ? '' : 's'}? This action cannot be undone.`}
        confirmLabel="Delete selected"
        isLoading={isBulkDeleting}
      />

      <ConfirmDialog
        isOpen={isBulkDraftDeleteOpen}
        onClose={() => setIsBulkDraftDeleteOpen(false)}
        onConfirm={handleDeleteSelectedDrafts}
        title="Delete selected drafts"
        description={`Are you sure you want to delete ${selectedDraftIds.size} selected draft${selectedDraftIds.size === 1 ? '' : 's'}? This action cannot be undone.`}
        confirmLabel="Delete selected"
        isLoading={isBulkDraftDeleting}
      />

      <ConfirmDialog
        isOpen={!!draftToDelete}
        onClose={() => setDraftToDelete(null)}
        onConfirm={handleDeleteDraft}
        title="Delete draft"
        description={draftToDelete ? `Are you sure you want to delete draft ${draftToDelete.code}? This action cannot be undone.` : undefined}
        confirmLabel="Delete draft"
        isLoading={deleteDraftMutation.isPending}
      />

      <Modal
        isOpen={!!attachmentDialog}
        onClose={() => setAttachmentDialog(null)}
        title={attachmentDialog?.title}
        description={attachmentDialog?.description}
        size="lg"
      >
        <ModalBody className="space-y-3">
          {!attachmentDialog || attachmentDialog.attachments.length === 0 ? (
            <p className="text-sm text-text-secondary">No attachments linked.</p>
          ) : (
            <div className="space-y-2">
              {attachmentDialog.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={getAttachmentHref(attachmentDialog!.source, attachment.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-background-primary px-3 py-2 transition-colors hover:bg-background-elevated"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{attachment.fileName}</p>
                    <p className="text-xs text-text-secondary">
                      {formatFileSize(attachment.sizeBytes)} • {attachment.mimeType}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs text-text-muted">
                    {formatDate(attachment.createdAt)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" size="sm" onClick={() => setAttachmentDialog(null)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
