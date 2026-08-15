'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDate, cn } from '@/lib/utils';
import {
  FileText,
  Eye,
  Pencil,
  Trash2,
  Download,
  Clock,
  CheckCircle,
  Archive,
  Building2,
  User,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Square,
  CheckSquare,
  MinusSquare,
} from 'lucide-react';
import type { GeneratedDocumentStatus } from '@/generated/prisma';
import { PrefetchLink } from '@/components/ui/prefetch-link';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CompanySelect } from '@/components/ui/company-select';
import { DatePicker, type DatePickerValue } from '@/components/ui/date-picker';
import { useUserPreferences, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import { isActiveGenerationSessionMetadata } from '@/lib/document-generation-session';

// ============================================================================
// Types
// ============================================================================

export type GeneratedDocumentSortField =
  | 'title'
  | 'companyName'
  | 'templateName'
  | 'status'
  | 'createdByName'
  | 'createdAt'
  | 'updatedAt'
  | 'finalizedAt';

export type GeneratedDocumentSortOrder = 'asc' | 'desc';

export interface GeneratedDocumentFilters {
  title?: string;
  companyId?: string;
  companyName?: string;
  templateName?: string;
  status?: GeneratedDocumentStatus | '';
  createdBy?: string;
  updatedFrom?: string;
  updatedTo?: string;
  sortBy?: GeneratedDocumentSortField;
  sortOrder?: GeneratedDocumentSortOrder;
}

export interface GeneratedDocument {
  id: string;
  title: string;
  status: GeneratedDocumentStatus;
  content: string;
  useLetterhead: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: unknown;
  finalizedAt?: string;
  template?: {
    id: string;
    name: string;
    category: string;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
  createdBy: {
    firstName: string;
    lastName: string;
  };
  _count?: {
    comments: number;
    drafts: number;
  };
}

interface DocumentTableProps {
  documents: GeneratedDocument[];
  onDelete?: (id: string) => void;
  onExport?: (id: string) => void;
  onDiscardDraft?: (id: string) => void;
  isLoading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canCreate?: boolean;
  filters?: GeneratedDocumentFilters;
  onFilterChange?: (patch: Partial<GeneratedDocumentFilters>) => void;
  onSortChange?: (field: GeneratedDocumentSortField) => void;
  /** Whether to show selection checkboxes */
  selectable?: boolean;
  /** Set of currently selected document IDs */
  selectedIds?: Set<string>;
  /** Handler for toggling a single item */
  onToggleOne?: (id: string) => void;
  /** Handler for toggling all items */
  onToggleAll?: () => void;
  /** Whether all items are selected */
  isAllSelected?: boolean;
  /** Whether some but not all items are selected */
  isIndeterminate?: boolean;
}

// ============================================================================
// Status Config
// ============================================================================

const statusConfig: Record<GeneratedDocumentStatus, { color: string; label: string; icon: typeof Clock }> = {
  DRAFT: { color: 'badge-warning', label: 'Draft', icon: Clock },
  FINALIZED: { color: 'badge-success', label: 'Finalized', icon: CheckCircle },
  ARCHIVED: { color: 'badge-neutral', label: 'Archived', icon: Archive },
};

const COLUMN_IDS = [
  'document',
  'company',
  'template',
  'status',
  'createdBy',
  'updated',
  'actions',
] as const;
type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  document: 'Document',
  company: 'Company',
  template: 'Template',
  status: 'Status',
  createdBy: 'Created By',
  updated: 'Updated',
  actions: 'Actions',
};

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, GeneratedDocumentSortField>> = {
  document: 'title',
  company: 'companyName',
  template: 'templateName',
  status: 'status',
  createdBy: 'createdByName',
  updated: 'updatedAt',
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(statusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

const COLUMN_PREF_KEY = 'generated-documents:list:columns:v1';
const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
  document: 240,
  company: 200,
  template: 180,
  status: 120,
  createdBy: 160,
  updated: 140,
  actions: 110,
};
const MINIMUM_COLUMN_WIDTHS: Record<ColumnId, number> = {
  document: 140,
  company: 120,
  template: 120,
  status: 100,
  createdBy: 110,
  updated: 110,
  actions: 80,
};

const CHECKBOX_COLUMN_WIDTH = 44;

function toLocalDateString(date?: Date): string | undefined {
  if (!date) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

// ============================================================================
// Small building blocks
// ============================================================================

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
    <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
      <input
        type="text"
        aria-label={ariaLabel}
        value={value || ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        placeholder="All"
        className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
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

function SortHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: GeneratedDocumentSortField;
  sortBy?: GeneratedDocumentSortField;
  sortOrder?: GeneratedDocumentSortOrder;
  onSort?: (field: GeneratedDocumentSortField) => void;
}) {
  const active = sortBy === field;
  return (
    <button
      type="button"
      onClick={() => onSort?.(field)}
      className={cn(
        'inline-flex items-center gap-1 select-none hover:text-text-primary transition-colors',
        active && 'text-text-primary',
      )}
    >
      <span>{label}</span>
      <span className="flex-shrink-0">
        {active ? (
          sortOrder === 'asc'
            ? <ArrowUp className="w-3.5 h-3.5" />
            : <ArrowDown className="w-3.5 h-3.5" />
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
        )}
      </span>
    </button>
  );
}

// ============================================================================
// Action Icons Component
// ============================================================================

interface DocumentActionsProps {
  documentId: string;
  documentTitle: string;
  status: string;
  isGenerationSession: boolean;
  onDelete?: (id: string) => void;
  onExport?: (id: string) => void;
  onDiscardDraft?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
}

function DocumentActions({
  documentId,
  documentTitle,
  status,
  isGenerationSession,
  onDelete,
  onExport,
  onDiscardDraft,
  canEdit,
  canDelete,
  canExport,
}: DocumentActionsProps) {
  if (isGenerationSession) {
    return (
      <div className="flex items-center gap-1">
        {canEdit && (
          <Link
            href={`/generated-documents/generate?draft=${documentId}`}
            className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
            aria-label={`Resume ${documentTitle}`}
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDiscardDraft?.(documentId)}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors"
            aria-label={`Discard ${documentTitle}`}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/* View */}
      <Link
        href={`/generated-documents/${documentId}`}
        className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
        aria-label={`View ${documentTitle}`}
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
      </Link>

      {/* Edit (only for drafts) */}
      {canEdit && status === 'DRAFT' && (
        <Link
          href={`/generated-documents/${documentId}/edit`}
          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
          aria-label={`Edit ${documentTitle}`}
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}

      {/* Export PDF */}
      {canExport && (
        <button
          type="button"
          onClick={() => onExport?.(documentId)}
          className="p-1.5 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors"
          aria-label={`Export ${documentTitle} as PDF`}
        >
          <Download className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

      {/* Delete */}
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete?.(documentId)}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors"
          aria-label={`Delete ${documentTitle}`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Document Table Component
// ============================================================================

export function DocumentTable({
  documents,
  onDelete,
  onExport,
  onDiscardDraft,
  isLoading,
  canEdit = true,
  canDelete = true,
  canExport = true,
  canCreate = true,
  filters = {},
  onFilterChange,
  onSortChange,
  selectable = false,
  selectedIds = new Set(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
}: DocumentTableProps) {
  const router = useRouter();
  const isResizingRef = useRef(false);
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ColumnId, number>>>({});
  const { data: preferenceMap } = useUserPreferences([COLUMN_PREF_KEY]);
  const saveColumnPreference = useUpsertUserPreference<Record<ColumnId, number>>();
  const preferenceValue = preferenceMap?.[COLUMN_PREF_KEY]?.value;
  const preferenceValueKey = JSON.stringify(preferenceValue ?? null);

  const tableWidth = useMemo(
    () => (selectable ? CHECKBOX_COLUMN_WIDTH : 0) + COLUMN_IDS.reduce(
      (total, columnId) => total + (columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTHS[columnId]),
      0,
    ),
    [columnWidths, selectable],
  );

  useEffect(() => {
    const restored = JSON.parse(preferenceValueKey) as unknown;
    if (!restored || typeof restored !== 'object' || Array.isArray(restored)) return;

    const nextWidths: Partial<Record<ColumnId, number>> = {};
    for (const columnId of COLUMN_IDS) {
      const width = (restored as Record<string, unknown>)[columnId];
      if (typeof width === 'number' && Number.isFinite(width)) {
        nextWidths[columnId] = Math.max(MINIMUM_COLUMN_WIDTHS[columnId], width);
      }
    }
    setColumnWidths(nextWidths);
  }, [preferenceValueKey]);

  const persistWidth = useCallback((columnId: ColumnId, width: number) => {
    setColumnWidths((current) => {
      const nextWidths: Record<ColumnId, number> = {
        ...DEFAULT_COLUMN_WIDTHS,
        ...current,
        [columnId]: width,
      };
      saveColumnPreference.mutate({ key: COLUMN_PREF_KEY, value: nextWidths });
      return nextWidths;
    });
  }, [saveColumnPreference]);

  const startResize = useCallback((
    event: React.PointerEvent,
    columnId: ColumnId,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget as HTMLElement;
    const header = handle.closest('th');
    const measuredWidth = header?.getBoundingClientRect().width ?? 0;
    const startWidth = columnWidths[columnId]
      ?? (measuredWidth >= MINIMUM_COLUMN_WIDTHS[columnId]
        ? measuredWidth
        : DEFAULT_COLUMN_WIDTHS[columnId]);
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
        MINIMUM_COLUMN_WIDTHS[columnId],
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
    columnId: ColumnId,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const currentWidth = columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTHS[columnId];
    persistWidth(
      columnId,
      Math.max(MINIMUM_COLUMN_WIDTHS[columnId], currentWidth + (direction * 10)),
    );
  }, [columnWidths, persistWidth]);

  const getDetailHref = useCallback((doc: GeneratedDocument) => {
    const isGenerationSession = isActiveGenerationSessionMetadata(doc.metadata);
    return isGenerationSession && canEdit
      ? `/generated-documents/generate?draft=${doc.id}`
      : `/generated-documents/${doc.id}`;
  }, [canEdit]);

  const handleRowClick = useCallback((
    event: MouseEvent<HTMLTableRowElement>,
    doc: GeneratedDocument,
  ) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('a,button,input,select,textarea,[role="button"]')) return;

    router.push(getDetailHref(doc));
  }, [getDetailHref, router]);

  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Company</th>
              <th>Template</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Updated</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td><div className="skeleton h-4 w-48" /></td>
                <td><div className="skeleton h-4 w-32" /></td>
                <td><div className="skeleton h-4 w-28" /></td>
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-24 ml-auto" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {documents.length === 0 ? (
          <div className="card p-8 text-center">
            <FileText className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-secondary mb-3">No documents found</p>
            {canCreate && (
              <Link href="/generated-documents/generate" className="btn-primary btn-sm inline-flex">
                Generate Document
              </Link>
            )}
          </div>
        ) : (
          <>
            {selectable && (
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={onToggleAll}
                  className="p-2 hover:bg-background-secondary rounded transition-colors flex items-center gap-2"
                  aria-label={isAllSelected ? 'Deselect all documents' : 'Select all documents'}
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
            {documents.map((doc, index) => {
              const status = statusConfig[doc.status] || statusConfig.DRAFT;
              const StatusIcon = status.icon;
              const isGenerationSession = isActiveGenerationSessionMetadata(doc.metadata);
              const isSelected = selectedIds.has(doc.id);

              return (
                <MobileCard
                  key={doc.id}
                  isSelected={isSelected}
                  selectable={selectable}
                  onToggle={() => onToggleOne?.(doc.id)}
                  selectionLabel={isSelected ? `Deselect ${doc.title}` : `Select ${doc.title}`}
                  title={doc.title}
                subtitle={doc.template?.name}
                badge={
                  <span className={cn('badge inline-flex items-center gap-1', status.color)}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </span>
                }
                onCardClick={() => router.push(getDetailHref(doc))}
                className={index % 2 === 1 ? 'bg-oak-row-alt' : undefined}
                details={
                  <CardDetailsGrid>
                    <CardDetailItem
                      label="Company"
                      value={doc.company?.name || '—'}
                      icon={<Building2 className="w-3 h-3" />}
                    />
                    <CardDetailItem
                      label="Created By"
                      value={`${doc.createdBy.firstName} ${doc.createdBy.lastName}`}
                      icon={<User className="w-3 h-3" />}
                    />
                    <CardDetailItem
                      label="Updated"
                      value={formatDate(doc.updatedAt)}
                      icon={<Clock className="w-3 h-3" />}
                    />
                  </CardDetailsGrid>
                }
                actions={
                  <div className="flex items-center gap-1">
                    {isGenerationSession && canEdit ? (
                      <Link
                        href={`/generated-documents/generate?draft=${doc.id}`}
                        className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`Resume ${doc.title}`}
                      >
                        <RotateCcw className="w-4 h-4" aria-hidden="true" />
                      </Link>
                    ) : (
                      <Link
                        href={`/generated-documents/${doc.id}`}
                        className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`View ${doc.title}`}
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      </Link>
                    )}
                    {!isGenerationSession && canEdit && doc.status === 'DRAFT' && (
                      <Link
                        href={`/generated-documents/${doc.id}/edit`}
                        className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`Edit ${doc.title}`}
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </Link>
                    )}
                    {!isGenerationSession && canExport && (
                      <button
                        type="button"
                        onClick={() => onExport?.(doc.id)}
                        className="p-2 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`Export ${doc.title} as PDF`}
                      >
                        <Download className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => isGenerationSession ? onDiscardDraft?.(doc.id) : onDelete?.(doc.id)}
                        className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-950 text-text-tertiary hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label={`${isGenerationSession ? 'Discard' : 'Delete'} ${doc.title}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                }
              />
            );
          })}
          </>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block table-container relative overflow-x-auto">
        <div
          aria-hidden="true"
          data-testid="document-column-header-band"
          className="pointer-events-none absolute inset-x-0 top-0 h-[94px] bg-background-tertiary"
        />
        <div
          aria-hidden="true"
          data-testid="document-filter-row-band"
          className="pointer-events-none absolute inset-x-0 top-0 h-14 border-b border-border-primary bg-background-secondary/50"
        />
        <table
          className="table relative z-[1] table-fixed"
          style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
        >
          <colgroup>
            {selectable && <col style={{ width: `${CHECKBOX_COLUMN_WIDTH}px` }} />}
            {COLUMN_IDS.map((columnId) => (
              <col
                key={columnId}
                style={{ width: `${columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTHS[columnId]}px` }}
              />
            ))}
          </colgroup>
          <thead className="bg-background-tertiary border-b border-border-primary">
            {/* Inline filter row - moved above headers */}
            <tr data-filter-row className="h-14 bg-background-secondary/50">
              {selectable && <th className="max-w-0" />}
              {COLUMN_IDS.map((columnId) => (
                <th key={columnId} className="max-w-0">
                  {columnId === 'document' ? (
                    <InlineTextFilter
                      ariaLabel="Filter documents by title"
                      value={filters.title}
                      onChange={(value) => onFilterChange?.({ title: value })}
                    />
                  ) : columnId === 'company' ? (
                    <CompanySelect
                      value={filters.companyId || ''}
                      onChange={(companyId, company) => onFilterChange?.({
                        companyId: companyId || undefined,
                        companyName: company?.name || undefined,
                      })}
                      placeholder="All companies"
                      className="text-xs"
                    />
                  ) : columnId === 'template' ? (
                    <InlineTextFilter
                      ariaLabel="Filter documents by template"
                      value={filters.templateName}
                      onChange={(value) => onFilterChange?.({ templateName: value })}
                    />
                  ) : columnId === 'status' ? (
                    <SearchableSelect
                      variant="table-filter"
                      options={STATUS_FILTER_OPTIONS}
                      value={filters.status || ''}
                      onChange={(value) => onFilterChange?.({
                        status: value ? value as GeneratedDocumentStatus : undefined,
                      })}
                      placeholder="All statuses"
                      className="text-xs"
                      showChevron={false}
                      showKeyboardHints={false}
                    />
                  ) : columnId === 'createdBy' ? (
                    <InlineTextFilter
                      ariaLabel="Filter documents by creator"
                      value={filters.createdBy}
                      onChange={(value) => onFilterChange?.({ createdBy: value })}
                    />
                  ) : columnId === 'updated' ? (
                    <DatePicker
                      value={
                        filters.updatedFrom || filters.updatedTo
                          ? {
                              mode: 'range' as const,
                              range: {
                                from: parseLocalDate(filters.updatedFrom),
                                to: parseLocalDate(filters.updatedTo),
                              },
                            }
                          : undefined
                      }
                      onChange={(value: DatePickerValue | undefined) => {
                        const range = value?.mode === 'range' ? value.range : undefined;
                        onFilterChange?.({
                          updatedFrom: toLocalDateString(range?.from),
                          updatedTo: toLocalDateString(range?.to),
                        });
                      }}
                      placeholder="All dates"
                      size="sm"
                      defaultTab="range"
                      className="text-xs"
                    />
                  ) : null}
                </th>
              ))}
            </tr>

            {/* Column header row - below filters */}
            <tr data-column-header-row className="h-[38px] border-t border-border-primary">
              {selectable && (
                <th className="relative px-2 py-2.5">
                  <button
                    onClick={onToggleAll}
                    className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                    aria-label={isAllSelected ? 'Deselect all documents' : 'Select all documents'}
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
              )}
              {COLUMN_IDS.map((columnId) => (
                <th
                  key={columnId}
                  className={cn(
                    'relative px-4 py-2.5 text-xs font-medium text-text-secondary whitespace-nowrap',
                    columnId === 'actions' && 'text-right',
                  )}
                >
                  {columnId === 'actions' ? (
                    <span>{COLUMN_LABELS[columnId]}</span>
                  ) : COLUMN_SORT_FIELDS[columnId] ? (
                    <SortHeader
                      label={COLUMN_LABELS[columnId]}
                      field={COLUMN_SORT_FIELDS[columnId]!}
                      sortBy={filters.sortBy}
                      sortOrder={filters.sortOrder}
                      onSort={onSortChange}
                    />
                  ) : (
                    <span>{COLUMN_LABELS[columnId]}</span>
                  )}
                  <span
                    role="separator"
                    aria-label={`Resize ${COLUMN_LABELS[columnId]} column`}
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
            {documents.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_IDS.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center">
                  <FileText className="w-8 h-8 text-text-muted mx-auto mb-2" />
                  <p className="text-sm text-text-secondary mb-3">
                    No documents found. Try adjusting your filters.
                  </p>
                  {canCreate && (
                    <Link href="/generated-documents/generate" className="btn-primary btn-sm inline-flex">
                      Generate Document
                    </Link>
                  )}
                </td>
              </tr>
            ) : documents.map((doc, index) => {
                const status = statusConfig[doc.status] || statusConfig.DRAFT;
                const StatusIcon = status.icon;
                const isGenerationSession = isActiveGenerationSessionMetadata(doc.metadata);
                const isSelected = selectedIds.has(doc.id);

                return (
                  <tr
                    key={doc.id}
                    onClick={(event) => handleRowClick(event, doc)}
                    className={cn(
                      'border-b border-border-primary transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-oak-row-selected hover:bg-oak-row-selected-hover'
                        : index % 2 === 1
                          ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                          : 'hover:bg-background-tertiary/50',
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onToggleOne?.(doc.id)}
                          className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                          aria-label={isSelected ? `Deselect ${doc.title}` : `Select ${doc.title}`}
                          aria-pressed={isSelected}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-oak-primary" aria-hidden="true" />
                          ) : (
                            <Square className="w-4 h-4 text-text-muted" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <PrefetchLink
                        href={getDetailHref(doc)}
                        className="font-medium text-text-primary hover:text-oak-light transition-colors"
                      >
                        {doc.title}
                      </PrefetchLink>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {doc.company ? (
                        <span className="truncate max-w-[200px] block">{doc.company.name}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary max-w-0">
                      {doc.template ? (
                        <span className="truncate block" title={doc.template.name}>
                          {doc.template.name}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${status.color} inline-flex items-center gap-1`}>
                        <StatusIcon className="w-3 h-3" aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {doc.createdBy.firstName} {doc.createdBy.lastName}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(doc.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DocumentActions
                        documentId={doc.id}
                        documentTitle={doc.title}
                        status={doc.status}
                        isGenerationSession={isGenerationSession}
                        onDelete={onDelete}
                        onExport={onExport}
                        onDiscardDraft={onDiscardDraft}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        canExport={canExport}
                      />
                    </td>
                  </tr>
                );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
