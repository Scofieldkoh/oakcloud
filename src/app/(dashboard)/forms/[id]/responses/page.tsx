'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Download, Eye, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useForm, useFormResponses, useUpdateForm, type FormResponsesResult } from '@/hooks/use-forms';
import {
  RESPONSE_COLUMN_STATUS_ID,
  RESPONSE_COLUMN_SUBMITTED_ID,
  clampResponseColumnWidth,
  isSummaryEligibleFieldType,
  normalizeResponseColumnOrder,
  parseFormResponseTableSettings,
  sanitizeResponseColumnWidths,
  writeFormResponseTableSettings,
} from '@/lib/form-utils';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
type SubmissionItem = FormResponsesResult['submissions'][number];

type SummaryColumnDef = {
  id: string;
  kind: 'submitted' | 'status' | 'field';
  label: string;
  fieldKey?: string;
  fieldType?: string;
  minWidth: number;
  defaultWidth: number;
};

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

export default function FormResponsesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { error: showError } = useToast();
  const formId = params.id;

  const [page, setPage] = useState(1);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);

  const columnOrderRef = useRef<string[]>([]);
  const columnWidthsRef = useRef<Record<string, number>>({});

  const { data: form, isLoading: isFormLoading, error: formError } = useForm(formId);
  const { data, isLoading, error } = useFormResponses(formId, page, PAGE_SIZE);
  const updateForm = useUpdateForm(formId);

  useEffect(() => {
    columnOrderRef.current = columnOrder;
  }, [columnOrder]);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  const conversionRate = useMemo(() => {
    if (!form || form.viewsCount === 0) return 0;
    return Number(((form.submissionsCount / form.viewsCount) * 100).toFixed(1));
  }, [form]);

  const summaryColumns = useMemo(() => {
    if (!form) return [] as SummaryColumnDef[];

    const responseTableSettings = parseFormResponseTableSettings(form.settings);
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
  }, [form]);

  const columnMap = useMemo(() => {
    const map = new Map<string, SummaryColumnDef>();

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

    return map;
  }, [summaryColumns]);

  const baseColumnIds = useMemo(() => Array.from(columnMap.keys()), [columnMap]);
  const baseColumnSignature = useMemo(() => baseColumnIds.join('|'), [baseColumnIds]);

  useEffect(() => {
    if (!form) return;

    const responseTableSettings = parseFormResponseTableSettings(form.settings);
    const nextColumnOrder = normalizeResponseColumnOrder(baseColumnIds, responseTableSettings.columnOrder);
    const nextColumnWidths = sanitizeResponseColumnWidths(responseTableSettings.columnWidths, baseColumnIds);

    setColumnOrder(nextColumnOrder);
    setColumnWidths(nextColumnWidths);
  }, [form, baseColumnSignature, baseColumnIds]);

  const orderedColumns = useMemo(() => {
    const resolvedOrder = normalizeResponseColumnOrder(baseColumnIds, columnOrder);
    return resolvedOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is SummaryColumnDef => !!column);
  }, [baseColumnIds, columnOrder, columnMap]);

  async function persistLayout(nextOrder: string[], nextWidths: Record<string, number>) {
    if (!form) return;

    const summaryFieldKeys = summaryColumns.map((column) => column.id);
    const baseIds = [
      RESPONSE_COLUMN_SUBMITTED_ID,
      ...summaryFieldKeys,
      RESPONSE_COLUMN_STATUS_ID,
    ];

    const sanitizedOrder = normalizeResponseColumnOrder(baseIds, nextOrder);
    const sanitizedWidths = sanitizeResponseColumnWidths(nextWidths, baseIds);

    const nextSettings = writeFormResponseTableSettings(form.settings, {
      summaryFieldKeys,
      columnOrder: sanitizedOrder,
      columnWidths: sanitizedWidths,
    });

    try {
      await updateForm.mutateAsync({
        settings: nextSettings,
        reason: 'Updated responses summary table layout',
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save table layout');
    }
  }

  function reorderColumns(sourceColumnId: string, targetColumnId: string) {
    const currentOrder = normalizeResponseColumnOrder(baseColumnIds, columnOrderRef.current);
    const fromIndex = currentOrder.indexOf(sourceColumnId);
    const toIndex = currentOrder.indexOf(targetColumnId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    if (!moved) return;
    nextOrder.splice(toIndex, 0, moved);

    setColumnOrder(nextOrder);
    void persistLayout(nextOrder, columnWidthsRef.current);
  }

  function startColumnResize(event: ReactPointerEvent<HTMLDivElement>, column: SummaryColumnDef) {
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
      void persistLayout(columnOrderRef.current, nextWidths);
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

  function openSubmissionDetail(submissionId: string) {
    router.push(`/forms/${form!.id}/responses/${submissionId}`);
  }

  function renderCell(submission: SubmissionItem, column: SummaryColumnDef): string {
    if (column.kind === 'submitted') return formatDate(submission.submittedAt);
    if (column.kind === 'status') return submission.status;

    const answers = toAnswerRecord(submission.answers);
    const value = answers[column.fieldKey || ''];
    return formatSummaryCellValue(column.fieldType || 'SHORT_TEXT', value);
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
      </div>

      <div className="rounded-lg border border-border-primary bg-background-elevated overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3 text-sm font-medium text-text-primary">
          Submissions
        </div>

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

        {!isLoading && data && data.submissions.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-text-secondary">No submissions yet.</div>
        )}

        {!isLoading && data && data.submissions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-sm">
              <thead className="bg-background-primary">
                <tr className="text-left text-xs text-text-secondary">
                  {orderedColumns.map((column) => {
                    const width = columnWidths[column.id] ?? column.defaultWidth;
                    return (
                      <th
                        key={column.id}
                        style={{ width: `${width}px`, minWidth: `${column.minWidth}px` }}
                        className={cn(
                          'relative px-4 py-2 font-medium select-none',
                          draggedColumnId === column.id && 'opacity-50'
                        )}
                        draggable
                        onDragStart={(event) => {
                          setDraggedColumnId(column.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', column.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceColumnId = draggedColumnId || event.dataTransfer.getData('text/plain');
                          if (!sourceColumnId) return;
                          reorderColumns(sourceColumnId, column.id);
                          setDraggedColumnId(null);
                        }}
                        onDragEnd={() => setDraggedColumnId(null)}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <GripVertical className="h-3.5 w-3.5 text-text-muted" />
                          <span className="truncate">{column.label}</span>
                        </div>
                        <div
                          onPointerDown={(event) => startColumnResize(event, column)}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                    );
                  })}
                  <th className="px-4 py-2 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((submission) => (
                  <tr
                    key={submission.id}
                    className="cursor-pointer border-t border-border-primary text-text-primary hover:bg-background-primary/60"
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
                    {orderedColumns.map((column) => (
                      <td
                        key={`${submission.id}:${column.id}`}
                        style={{ width: `${columnWidths[column.id] ?? column.defaultWidth}px` }}
                        className="px-4 py-3 align-top"
                      >
                        <span className="line-clamp-2 break-words">
                          {renderCell(submission, column)}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <Tooltip content="View submission">
                        <button
                          type="button"
                          className="rounded p-1.5 text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSubmissionDetail(submission.id);
                          }}
                          aria-label="View submission"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
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
    </div>
  );
}
