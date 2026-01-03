'use client';

import { useState, useCallback, useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import {
  FileText,
  AlertCircle,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Eye,
  Copy,
  FileStack,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Square,
  CheckSquare,
  MinusSquare,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import {
  useProcessingDocuments,
  type ProcessingDocumentSearchParams,
  type ProcessingDocumentListItem,
} from '@/hooks/use-processing-documents';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { BulkActionsToolbar } from '@/components/processing/bulk-actions-toolbar';
import { ProcessingFilters, type ProcessingFilterValues } from '@/components/processing/processing-filters';
import { ProcessingToolbar } from '@/components/processing/processing-toolbar';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { AmountFilter, type AmountFilterValue } from '@/components/ui/amount-filter';
import { useCompanies } from '@/hooks/use-companies';
import { useAvailableTags } from '@/hooks/use-document-tags';
import { useActiveCompanyId } from '@/components/ui/company-selector';
import { useUserPreference, useUpsertUserPreference } from '@/hooks/use-user-preferences';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Checkbox } from '@/components/ui/checkbox';
import type { PipelineStatus, DuplicateStatus, RevisionStatus, DocumentCategory, DocumentSubCategory } from '@/generated/prisma';
import { CATEGORY_LABELS, SUBCATEGORY_LABELS } from '@/lib/document-categories';
import { cn } from '@/lib/utils';

const COLUMN_PREF_KEY = 'processing:list:columns:v1';
const COLUMN_VISIBILITY_PREF_KEY = 'processing:list:column-visibility:v1';
const COLUMN_IDS = [
  'open',
  'document',
  'company',
  'pipeline',
  'status',
  'duplicate',
  'category',
  'subCategory',
  'vendor',
  'docNumber',
  'docDate',
  'subtotal',
  'tax',
  'total',
  'homeSubtotal',
  'homeTax',
  'homeTotal',
  'uploaded',
] as const;
type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  open: 'Open',
  document: 'Document',
  company: 'Company',
  pipeline: 'Pipeline',
  status: 'Status',
  duplicate: 'Duplicate',
  category: 'Category',
  subCategory: 'Sub-Category',
  vendor: 'Vendor',
  docNumber: 'Doc #',
  docDate: 'Doc Date',
  subtotal: 'Subtotal',
  tax: 'Tax',
  total: 'Total',
  homeSubtotal: 'Home Subtotal',
  homeTax: 'Home Tax',
  homeTotal: 'Home Total',
  uploaded: 'Uploaded',
};

const RIGHT_ALIGNED_COLUMNS = new Set<ColumnId>([
  'subtotal',
  'tax',
  'total',
  'homeSubtotal',
  'homeTax',
  'homeTotal',
]);

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, string>> = {
  document: 'fileName',
  company: 'companyName',
  pipeline: 'pipelineStatus',
  status: 'revisionStatus',
  duplicate: 'duplicateStatus',
  category: 'documentCategory',
  subCategory: 'documentSubCategory',
  vendor: 'vendorName',
  docNumber: 'documentNumber',
  docDate: 'documentDate',
  subtotal: 'subtotal',
  tax: 'taxAmount',
  total: 'totalAmount',
  homeSubtotal: 'homeSubtotal',
  homeTax: 'homeTaxAmount',
  homeTotal: 'homeEquivalent',
  uploaded: 'createdAt',
};

// Revision status display config
const revisionStatusConfig: Record<
  RevisionStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: 'Pending Review', color: 'text-status-warning bg-status-warning/10' },
  APPROVED: { label: 'Approved', color: 'text-oak-primary bg-oak-primary/10' },
  SUPERSEDED: { label: 'Superseded', color: 'text-text-muted bg-background-tertiary' },
};

// Pipeline status display config
const pipelineStatusConfig: Record<
  PipelineStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  UPLOADED: { label: 'Uploaded', color: 'text-text-secondary bg-background-tertiary', icon: Upload },
  QUEUED: { label: 'Queued', color: 'text-status-info bg-status-info/10', icon: Clock },
  PROCESSING: { label: 'Processing', color: 'text-status-info bg-status-info/10', icon: RefreshCw },
  SPLIT_PENDING: { label: 'Split Pending', color: 'text-status-warning bg-status-warning/10', icon: FileStack },
  SPLIT_DONE: { label: 'Split Done', color: 'text-status-success bg-status-success/10', icon: FileStack },
  EXTRACTION_DONE: { label: 'Extracted', color: 'text-status-success bg-status-success/10', icon: CheckCircle },
  FAILED_RETRYABLE: { label: 'Failed (Retry)', color: 'text-status-warning bg-status-warning/10', icon: AlertTriangle },
  FAILED_PERMANENT: { label: 'Failed', color: 'text-status-error bg-status-error/10', icon: XCircle },
  DEAD_LETTER: { label: 'Dead Letter', color: 'text-status-error bg-status-error/10', icon: XCircle },
};

// Duplicate status display config
const duplicateStatusConfig: Record<
  DuplicateStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  NONE: { label: 'None', color: 'text-text-muted bg-background-tertiary', icon: Clock },
  SUSPECTED: { label: 'Suspected', color: 'text-status-warning bg-status-warning/10', icon: AlertTriangle },
  CONFIRMED: { label: 'Confirmed', color: 'text-status-error bg-status-error/10', icon: Copy },
  REJECTED: { label: 'Not Duplicate', color: 'text-status-success bg-status-success/10', icon: CheckCircle },
};

function StatusBadge({
  config,
}: {
  status: string;
  config: { label: string; color: string; icon: React.ComponentType<{ className?: string }> };
}) {
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Currency symbols mapping - SGD displayed as "S$"
const CURRENCY_SYMBOLS: Record<string, string> = {
  SGD: 'S$',
  USD: 'US$',
  EUR: 'â‚¬',
  GBP: ' £',
  JPY: ' ¥',
  CNY: ' ¥',
  HKD: 'HK$',
  AUD: 'A$',
  MYR: 'RM',
};

function formatCurrency(amount: string | null | undefined, currency: string): string {
  if (!amount) return '-';
  const num = parseFloat(amount);
  if (isNaN(num)) return '-';

  const formatted = new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${symbol}${formatted}`;
}

// Format enum values to proper case (e.g., VENDOR_INVOICE -> Vendor Invoice)
function formatCategory(value: string | null | undefined): string {
  if (!value) return '-';
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Parse URL params to AmountFilterValue
function parseAmountFilter(
  searchParams: URLSearchParams,
  prefix: string
): AmountFilterValue | undefined {
  const exact = searchParams.get(prefix);
  const from = searchParams.get(`${prefix}From`);
  const to = searchParams.get(`${prefix}To`);

  if (exact) {
    const num = parseFloat(exact);
    if (!isNaN(num)) {
      return { mode: 'single', single: num };
    }
  }

  if (from || to) {
    const fromNum = from ? parseFloat(from) : undefined;
    const toNum = to ? parseFloat(to) : undefined;

    if (fromNum !== undefined || toNum !== undefined) {
      return {
        mode: 'range',
        range: {
          from: !isNaN(fromNum!) ? fromNum : undefined,
          to: !isNaN(toNum!) ? toNum : undefined,
        },
      };
    }
  }

  return undefined;
}

export default function ProcessingDocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const { data: session } = useSession();

  // Get active tenant ID (from store for SUPER_ADMIN, from session for others)
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Get active company from sidebar selector
  const activeCompanyId = useActiveCompanyId();

  // Handle file drop - redirect to upload page with files
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      // Store files in sessionStorage to pass to upload page
      const fileData = acceptedFiles.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));
      sessionStorage.setItem('pendingUploadFiles', JSON.stringify(fileData));

      // Create a DataTransfer object to temporarily hold files
      const dataTransfer = new DataTransfer();
      acceptedFiles.forEach(file => dataTransfer.items.add(file));

      // Store the FileList in a global variable (will be picked up by upload page)
      (window as Window & { __pendingUploadFiles?: FileList }).__pendingUploadFiles = dataTransfer.files;

      // Navigate to upload page
      router.push('/processing/upload');
    }
  }, [router]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/tiff': ['.tif', '.tiff'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    noClick: true, // Don't open file picker on click
    noKeyboard: true, // Don't open on keyboard events
  });

  // Parse URL params
  const getParamsFromUrl = useCallback((): ProcessingDocumentSearchParams => {
    const tagIdsParam = searchParams.get('tagIds');
    return {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      pipelineStatus: (searchParams.get('pipelineStatus') || undefined) as PipelineStatus | undefined,
      duplicateStatus: (searchParams.get('duplicateStatus') || undefined) as DuplicateStatus | undefined,
      revisionStatus: (searchParams.get('revisionStatus') || undefined) as RevisionStatus | undefined,
      needsReview: searchParams.get('needsReview') === 'true' ? true : undefined,
      isContainer: searchParams.get('isContainer') === 'true' ? true :
                   searchParams.get('isContainer') === 'false' ? false : undefined,
      // New filter parameters
      companyId: searchParams.get('companyId') || undefined,
      uploadDatePreset: (searchParams.get('uploadDatePreset') || undefined) as 'TODAY' | undefined,
      uploadDateFrom: searchParams.get('uploadDateFrom') || undefined,
      uploadDateTo: searchParams.get('uploadDateTo') || undefined,
      documentDateFrom: searchParams.get('documentDateFrom') || undefined,
      documentDateTo: searchParams.get('documentDateTo') || undefined,
      search: searchParams.get('search') || undefined,
      vendorName: searchParams.get('vendorName') || undefined,
      documentNumber: searchParams.get('documentNumber') || undefined,
      fileName: searchParams.get('fileName') || undefined,
      // Category filters
      documentCategory: (searchParams.get('documentCategory') || undefined) as DocumentCategory | undefined,
      documentSubCategory: (searchParams.get('documentSubCategory') || undefined) as DocumentSubCategory | undefined,
      // Tag filter
      tagIds: tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : undefined,
      // Amount filters - parse using helper function
      ...parseAmountFilterParams(searchParams),
    };
  }, [searchParams]);

  // Helper to parse all amount filter parameters
  const parseAmountFilterParams = (searchParams: URLSearchParams) => {
    const params: Partial<ProcessingDocumentSearchParams> = {};

    // Subtotal
    const subtotal = parseAmountFilter(searchParams, 'subtotal');
    if (subtotal?.mode === 'single') params.subtotal = subtotal.single;
    if (subtotal?.mode === 'range') {
      params.subtotalFrom = subtotal.range?.from;
      params.subtotalTo = subtotal.range?.to;
    }

    // Tax
    const tax = parseAmountFilter(searchParams, 'tax');
    if (tax?.mode === 'single') params.tax = tax.single;
    if (tax?.mode === 'range') {
      params.taxFrom = tax.range?.from;
      params.taxTo = tax.range?.to;
    }

    // Total
    const total = parseAmountFilter(searchParams, 'total');
    if (total?.mode === 'single') params.total = total.single;
    if (total?.mode === 'range') {
      params.totalFrom = total.range?.from;
      params.totalTo = total.range?.to;
    }

    // Home Subtotal
    const homeSubtotal = parseAmountFilter(searchParams, 'homeSubtotal');
    if (homeSubtotal?.mode === 'single') params.homeSubtotal = homeSubtotal.single;
    if (homeSubtotal?.mode === 'range') {
      params.homeSubtotalFrom = homeSubtotal.range?.from;
      params.homeSubtotalTo = homeSubtotal.range?.to;
    }

    // Home Tax
    const homeTax = parseAmountFilter(searchParams, 'homeTax');
    if (homeTax?.mode === 'single') params.homeTax = homeTax.single;
    if (homeTax?.mode === 'range') {
      params.homeTaxFrom = homeTax.range?.from;
      params.homeTaxTo = homeTax.range?.to;
    }

    // Home Total
    const homeTotal = parseAmountFilter(searchParams, 'homeTotal');
    if (homeTotal?.mode === 'single') params.homeTotal = homeTotal.single;
    if (homeTotal?.mode === 'range') {
      params.homeTotalFrom = homeTotal.range?.from;
      params.homeTotalTo = homeTotal.range?.to;
    }

    return params;
  };

  const [params, setParams] = useState(getParamsFromUrl);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const isResizingRef = useRef(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  // Determine effective company ID: URL filter takes priority, then sidebar selector
  // If sidebar has "All Companies" selected (activeCompanyId is undefined), show all companies
  const effectiveCompanyId = params.companyId || activeCompanyId;

  const { data: columnPref } = useUserPreference<Record<string, number>>(COLUMN_PREF_KEY);
  const { data: visibilityPref } = useUserPreference<Record<string, boolean>>(COLUMN_VISIBILITY_PREF_KEY);
  const saveColumnPref = useUpsertUserPreference<Record<string, number | boolean>>();
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ColumnId, number>>>({});
  const [columnVisibility, setColumnVisibility] = useState<Partial<Record<ColumnId, boolean>>>({});

  useEffect(() => {
    const value = columnPref?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    setColumnWidths(value as Partial<Record<ColumnId, number>>);
  }, [columnPref?.value]);

  useEffect(() => {
    const value = visibilityPref?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    setColumnVisibility(value as Partial<Record<ColumnId, boolean>>);
  }, [visibilityPref?.value]);

  const isColumnVisible = useCallback((columnId: ColumnId) => {
    if (columnId === 'open') return true;
    return columnVisibility[columnId] !== false;
  }, [columnVisibility]);
  const visibleColumnIds = useMemo(() => COLUMN_IDS.filter((id) => isColumnVisible(id)), [isColumnVisible]);
  const hiddenColumnCount = useMemo(() => {
    return COLUMN_IDS.filter((id) => id !== 'open' && !isColumnVisible(id)).length;
  }, [isColumnVisible]);

  const renderDesktopCell = (doc: ProcessingDocumentListItem, columnId: ColumnId) => {
    switch (columnId) {
      case 'open':
        return (
          <td key={columnId} className="px-2 py-3">
            <Link
              href={`/processing/${doc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
              aria-label={`Open &quot;${doc.document.fileName}&quot; in new tab`}
              title={`Open &quot;${doc.document.fileName}&quot; in new tab`}
            >
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </td>
        );
      case 'document':
        return (
          <td key={columnId} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded bg-background-tertiary">
                {doc.isContainer ? (
                  <FileStack className="w-4 h-4 text-text-secondary" />
                ) : (
                  <FileText className="w-4 h-4 text-text-secondary" />
                )}
              </div>
              <div>
                <Link
                  href={`/processing/${doc.id}`}
                  className="text-sm font-medium text-text-primary whitespace-nowrap hover:underline"
                  title={doc.document.fileName}
                >
                  {doc.document.fileName}
                </Link>
                <p className="text-xs text-text-muted">
                  {doc.isContainer ? 'Container' : `Pages ${doc.pageFrom}-${doc.pageTo}`}
                </p>
              </div>
            </div>
          </td>
        );
      case 'company':
        return (
          <td key={columnId} className="px-4 py-3">
            <span className="text-sm text-text-primary whitespace-nowrap">
              {doc.document.company?.name || '-'}
            </span>
          </td>
        );
      case 'pipeline':
        return (
          <td key={columnId} className="px-4 py-3">
            <StatusBadge status={doc.pipelineStatus} config={pipelineStatusConfig[doc.pipelineStatus]} />
          </td>
        );
      case 'status':
        return (
          <td key={columnId} className="px-4 py-3">
            {doc.currentRevision ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                  revisionStatusConfig[doc.currentRevision.status].color
                )}
              >
                {revisionStatusConfig[doc.currentRevision.status].label}
              </span>
            ) : (
              <span className="text-xs text-text-muted">-</span>
            )}
          </td>
        );
      case 'duplicate':
        return (
          <td key={columnId} className="px-4 py-3">
            <StatusBadge status={doc.duplicateStatus} config={duplicateStatusConfig[doc.duplicateStatus]} />
          </td>
        );
      case 'category':
        return (
          <td key={columnId} className="px-4 py-3">
            <span
              className="text-sm text-text-primary whitespace-nowrap"
              title={formatCategory(doc.currentRevision?.documentCategory)}
            >
              {formatCategory(doc.currentRevision?.documentCategory)}
            </span>
          </td>
        );
      case 'subCategory':
        return (
          <td key={columnId} className="px-4 py-3">
            <span
              className="text-sm text-text-secondary whitespace-nowrap"
              title={formatCategory(doc.currentRevision?.documentSubCategory)}
            >
              {formatCategory(doc.currentRevision?.documentSubCategory)}
            </span>
          </td>
        );
      case 'vendor':
        return (
          <td key={columnId} className="px-4 py-3">
            <span
              className="text-sm text-text-primary whitespace-nowrap"
              title={doc.currentRevision?.vendorName || undefined}
            >
              {doc.currentRevision?.vendorName || '-'}
            </span>
          </td>
        );
      case 'docNumber':
        return (
          <td key={columnId} className="px-4 py-3">
            <span className="text-sm text-text-secondary whitespace-nowrap">
              {doc.currentRevision?.documentNumber || '-'}
            </span>
          </td>
        );
      case 'docDate':
        return (
          <td key={columnId} className="px-4 py-3">
            <span className="text-sm text-text-secondary whitespace-nowrap">
              {doc.currentRevision?.documentDate ? formatDate(doc.currentRevision.documentDate) : '-'}
            </span>
          </td>
        );
      case 'subtotal':
        return (
          <td key={columnId} className="px-4 py-3 text-right">
            <span className="text-sm text-text-primary whitespace-nowrap">
              {doc.currentRevision ? formatCurrency(doc.currentRevision.subtotal, doc.currentRevision.currency) : '-'}
            </span>
          </td>
        );
      case 'tax':
        return (
          <td key={columnId} className="px-4 py-3 text-right">
            <span className="text-sm text-text-primary whitespace-nowrap">
              {doc.currentRevision ? formatCurrency(doc.currentRevision.taxAmount, doc.currentRevision.currency) : '-'}
            </span>
          </td>
        );
      case 'total':
        return (
          <td key={columnId} className="px-4 py-3 text-right">
            <span className="text-sm text-text-primary font-medium whitespace-nowrap">
              {doc.currentRevision
                ? formatCurrency(doc.currentRevision.totalAmount, doc.currentRevision.currency)
                : '-'}
            </span>
          </td>
        );
      case 'homeSubtotal':
        return (
          <td key={columnId} className="px-4 py-3 text-right">
            <span className="text-sm text-text-secondary whitespace-nowrap">
              {doc.currentRevision?.homeCurrency
                ? formatCurrency(doc.currentRevision.homeSubtotal, doc.currentRevision.homeCurrency)
                : '-'}
            </span>
          </td>
        );
      case 'homeTax':
        return (
          <td key={columnId} className="px-4 py-3 text-right">
            <span className="text-sm text-text-secondary whitespace-nowrap">
              {doc.currentRevision?.homeCurrency
                ? formatCurrency(doc.currentRevision.homeTaxAmount, doc.currentRevision.homeCurrency)
                : '-'}
            </span>
          </td>
        );
      case 'homeTotal':
        return (
          <td key={columnId} className="px-4 py-3 text-right">
            <span className="text-sm text-text-secondary font-medium whitespace-nowrap">
              {doc.currentRevision?.homeCurrency
                ? formatCurrency(doc.currentRevision.homeEquivalent, doc.currentRevision.homeCurrency)
                : '-'}
            </span>
          </td>
        );
      case 'uploaded':
        return (
          <td key={columnId} className="px-4 py-3">
            <span className="text-sm text-text-muted whitespace-nowrap">{formatDate(doc.createdAt)}</span>
          </td>
        );
      default:
        return null;
    }
  };

  const startResize = useCallback((e: React.PointerEvent, columnId: ColumnId) => {
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget as HTMLElement | null;
    const th = handle?.closest('th') as HTMLTableCellElement | null;
    const startWidth = columnWidths[columnId] ?? th?.getBoundingClientRect().width ?? 120;
    const startX = e.clientX;
    const pointerId = e.pointerId;

    isResizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    let latestWidth = startWidth;

    try {
      handle?.setPointerCapture(pointerId);
    } catch {
      // ignore
    }

    const onMove = (ev: globalThis.PointerEvent) => {
      const nextWidth = Math.max(80, startWidth + (ev.clientX - startX));
      latestWidth = nextWidth;
      setColumnWidths((prev) => ({ ...prev, [columnId]: nextWidth }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        handle?.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      isResizingRef.current = false;

      const nextWidths = { ...columnWidths, [columnId]: latestWidth };
      setColumnWidths(nextWidths);
      saveColumnPref.mutate({ key: COLUMN_PREF_KEY, value: nextWidths });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [columnWidths, saveColumnPref]);

  const startResizeIfEdge = useCallback((e: React.PointerEvent, columnId: ColumnId) => {
    const rect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    if (rect && rect.right - e.clientX > 14) return;
    startResize(e, columnId);
  }, [startResize]);

  const resetColumns = useCallback(() => {
    setColumnWidths({});
    saveColumnPref.mutate({ key: COLUMN_PREF_KEY, value: {} });
  }, [saveColumnPref]);

  const showAllColumns = useCallback(() => {
    setColumnVisibility({});
    saveColumnPref.mutate({ key: COLUMN_VISIBILITY_PREF_KEY, value: {} });
  }, [saveColumnPref]);

  const toggleColumnVisibility = useCallback((columnId: ColumnId) => {
    if (columnId === 'open') return;
    const next = { ...columnVisibility, [columnId]: columnVisibility[columnId] === false ? true : false };
    setColumnVisibility(next);
    saveColumnPref.mutate({ key: COLUMN_VISIBILITY_PREF_KEY, value: next });
  }, [columnVisibility, saveColumnPref]);

  // Pass tenantId and effective companyId to filter documents
  const { data, isLoading, isFetching, error, refetch } = useProcessingDocuments({
    ...params,
    companyId: effectiveCompanyId,
    tenantId: activeTenantId,
  });

  // Fetch companies for filter dropdown
  const { data: companiesData } = useCompanies({
    tenantId: activeTenantId || undefined,
    limit: 200, // Fetch all companies for dropdown
  });

  // Fetch tags for filter dropdown (uses effectiveCompanyId if available, otherwise just tenant tags)
  const { data: tagsData } = useAvailableTags(effectiveCompanyId, activeTenantId);

  // Reset page and selection when tenant or sidebar company changes
  useEffect(() => {
    setParams((prev) => ({ ...prev, page: 1 }));
    setSelectedIds([]);
  }, [activeTenantId, activeCompanyId]);

  // Clear selection when params change (e.g., page change, filter change)
  useEffect(() => {
    setSelectedIds([]);
  }, [params]);

  // Selection handlers
  const toggleSelectAll = useCallback(() => {
    if (!data?.documents) return;
    const allIds = data.documents.map((d) => d.id);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  }, [data?.documents, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleRowNavigate = useCallback(
    (e: MouseEvent, documentId: string) => {
      // Only handle plain left-clicks; allow Ctrl/Cmd+click (new tab), right-click, etc.
      if (e.defaultPrevented) return;
      if (isResizingRef.current) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest('a,button,input,select,textarea,[role="button"]')) return;

      router.push(`/processing/${documentId}`);
    },
    [router]
  );

  const handleReviewNext = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('filter', 'needs-review');
      params.set('start', 'true');
      if (activeTenantId) params.set('tenantId', activeTenantId);
      if (effectiveCompanyId) params.set('companyId', effectiveCompanyId);

      const response = await fetch(`/api/processing-documents/navigation?${params}`);
      if (!response.ok) return;
      const result = await response.json();
      const nextId = result?.data?.currentDocumentId as string | null | undefined;
      if (nextId) router.push(`/processing/${nextId}`);
    } catch {
      // ignore
    }
  }, [activeTenantId, effectiveCompanyId, router]);

  // Selection state
  const selectionState = useMemo(() => {
    if (!data?.documents || data.documents.length === 0) return 'none';
    const allIds = data.documents.map((d) => d.id);
    const selectedCount = allIds.filter((id) => selectedIds.includes(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === allIds.length) return 'all';
    return 'partial';
  }, [data?.documents, selectedIds]);

  // Memoize URL construction
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.page && params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit && params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy && params.sortBy !== 'createdAt') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder && params.sortOrder !== 'desc') urlParams.set('sortOrder', params.sortOrder);
    if (params.pipelineStatus) urlParams.set('pipelineStatus', params.pipelineStatus);
    if (params.duplicateStatus) urlParams.set('duplicateStatus', params.duplicateStatus);
    if (params.revisionStatus) urlParams.set('revisionStatus', params.revisionStatus);
    if (params.needsReview) urlParams.set('needsReview', 'true');
    if (params.isContainer !== undefined) urlParams.set('isContainer', params.isContainer.toString());
    // New filter parameters
    if (params.companyId) urlParams.set('companyId', params.companyId);
    if (params.uploadDatePreset) urlParams.set('uploadDatePreset', params.uploadDatePreset);
    if (params.uploadDateFrom) urlParams.set('uploadDateFrom', params.uploadDateFrom);
    if (params.uploadDateTo) urlParams.set('uploadDateTo', params.uploadDateTo);
    if (params.documentDateFrom) urlParams.set('documentDateFrom', params.documentDateFrom);
    if (params.documentDateTo) urlParams.set('documentDateTo', params.documentDateTo);
    if (params.search) urlParams.set('search', params.search);
    if (params.vendorName) urlParams.set('vendorName', params.vendorName);
    if (params.documentNumber) urlParams.set('documentNumber', params.documentNumber);
    if (params.fileName) urlParams.set('fileName', params.fileName);
    // Tag filter
    if (params.tagIds && params.tagIds.length > 0) urlParams.set('tagIds', params.tagIds.join(','));

    const queryString = urlParams.toString();
    return queryString ? `/processing?${queryString}` : '/processing';
  }, [params]);

  // Sync URL when params change
  useEffect(() => {
    if (window.location.pathname + window.location.search !== targetUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  }, [targetUrl, router]);

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  // Handler for the new ProcessingFilters component
  const handleFiltersChange = useCallback((filters: Partial<ProcessingFilterValues>) => {
    setParams((prev) => {
      // Convert AmountFilterValue to flat params
      const convertAmountFilter = (filter?: AmountFilterValue) => {
        if (!filter) return { single: undefined, from: undefined, to: undefined };
        if (filter.mode === 'single') return { single: filter.single, from: undefined, to: undefined };
        return { single: undefined, from: filter.range?.from, to: filter.range?.to };
      };

      // Only convert amount filters if they are provided in the filters object
      const subtotal = 'subtotalFilter' in filters ? convertAmountFilter(filters.subtotalFilter) : undefined;
      const tax = 'taxFilter' in filters ? convertAmountFilter(filters.taxFilter) : undefined;
      const total = 'totalFilter' in filters ? convertAmountFilter(filters.totalFilter) : undefined;
      const homeSubtotal = 'homeSubtotalFilter' in filters ? convertAmountFilter(filters.homeSubtotalFilter) : undefined;
      const homeTax = 'homeTaxFilter' in filters ? convertAmountFilter(filters.homeTaxFilter) : undefined;
      const homeTotal = 'homeTotalFilter' in filters ? convertAmountFilter(filters.homeTotalFilter) : undefined;

      return {
        // Keep pagination and sorting params
        page: 1, // Reset to first page on filter change
        limit: prev.limit,
        sortBy: prev.sortBy,
        sortOrder: prev.sortOrder,
        // Merge new filter values with previous values (only update if provided)
        pipelineStatus: 'pipelineStatus' in filters ? filters.pipelineStatus : prev.pipelineStatus,
        duplicateStatus: 'duplicateStatus' in filters ? filters.duplicateStatus : prev.duplicateStatus,
        revisionStatus: 'revisionStatus' in filters ? filters.revisionStatus : prev.revisionStatus,
        needsReview: 'needsReview' in filters ? filters.needsReview : prev.needsReview,
        isContainer: 'isContainer' in filters ? filters.isContainer : prev.isContainer,
        companyId: 'companyId' in filters ? filters.companyId : prev.companyId,
        uploadDatePreset: 'uploadDatePreset' in filters ? filters.uploadDatePreset : prev.uploadDatePreset,
        uploadDateFrom: 'uploadDateFrom' in filters ? filters.uploadDateFrom : prev.uploadDateFrom,
        uploadDateTo: 'uploadDateTo' in filters ? filters.uploadDateTo : prev.uploadDateTo,
        documentDateFrom: 'documentDateFrom' in filters ? filters.documentDateFrom : prev.documentDateFrom,
        documentDateTo: 'documentDateTo' in filters ? filters.documentDateTo : prev.documentDateTo,
        vendorName: 'vendorName' in filters ? filters.vendorName : prev.vendorName,
        documentNumber: 'documentNumber' in filters ? filters.documentNumber : prev.documentNumber,
        fileName: 'fileName' in filters ? filters.fileName : prev.fileName,
        documentCategory: 'documentCategory' in filters ? filters.documentCategory : prev.documentCategory,
        documentSubCategory: 'documentSubCategory' in filters ? filters.documentSubCategory : prev.documentSubCategory,
        // Tag filter
        tagIds: 'tagIds' in filters ? filters.tagIds : prev.tagIds,
        // Amount filters - only update if provided
        subtotal: subtotal !== undefined ? subtotal.single : prev.subtotal,
        subtotalFrom: subtotal !== undefined ? subtotal.from : prev.subtotalFrom,
        subtotalTo: subtotal !== undefined ? subtotal.to : prev.subtotalTo,
        tax: tax !== undefined ? tax.single : prev.tax,
        taxFrom: tax !== undefined ? tax.from : prev.taxFrom,
        taxTo: tax !== undefined ? tax.to : prev.taxTo,
        total: total !== undefined ? total.single : prev.total,
        totalFrom: total !== undefined ? total.from : prev.totalFrom,
        totalTo: total !== undefined ? total.to : prev.totalTo,
        homeSubtotal: homeSubtotal !== undefined ? homeSubtotal.single : prev.homeSubtotal,
        homeSubtotalFrom: homeSubtotal !== undefined ? homeSubtotal.from : prev.homeSubtotalFrom,
        homeSubtotalTo: homeSubtotal !== undefined ? homeSubtotal.to : prev.homeSubtotalTo,
        homeTax: homeTax !== undefined ? homeTax.single : prev.homeTax,
        homeTaxFrom: homeTax !== undefined ? homeTax.from : prev.homeTaxFrom,
        homeTaxTo: homeTax !== undefined ? homeTax.to : prev.homeTaxTo,
        homeTotal: homeTotal !== undefined ? homeTotal.single : prev.homeTotal,
        homeTotalFrom: homeTotal !== undefined ? homeTotal.from : prev.homeTotalFrom,
        homeTotalTo: homeTotal !== undefined ? homeTotal.to : prev.homeTotalTo,
        // Keep search separate (handled by handleSearchChange)
        search: prev.search,
      };
    });
  }, []);

  const handleSort = useCallback((field: string) => {
    setParams((prev) => {
      const isSame = (prev.sortBy || 'createdAt') === field;
      const nextOrder: 'asc' | 'desc' = isSame ? (prev.sortOrder === 'asc' ? 'desc' : 'asc') : 'asc';
      return { ...prev, page: 1, sortBy: field, sortOrder: nextOrder };
    });
  }, []);

  const handleSearchChange = useCallback((query: string) => {
    setParams((prev) => ({
      ...prev,
      search: query || undefined,
      page: 1,
    }));
  }, []);

  // Calculate stats from data
  const stats = useMemo(() => {
    if (!data?.documents) return null;
    const docs = data.documents;
    return {
      total: data.total,
      queued: docs.filter((d) => d.pipelineStatus === 'QUEUED').length,
      processing: docs.filter((d) => d.pipelineStatus === 'PROCESSING').length,
      pendingReview: docs.filter((d) =>
        d.currentRevision?.status === 'DRAFT' &&
        d.pipelineStatus === 'EXTRACTION_DONE'
      ).length,
      approved: docs.filter((d) => d.currentRevision?.status === 'APPROVED').length,
      failed: docs.filter((d) =>
        d.pipelineStatus === 'FAILED_RETRYABLE' ||
        d.pipelineStatus === 'FAILED_PERMANENT' ||
        d.pipelineStatus === 'DEAD_LETTER'
      ).length,
    };
  }, [data]);

  return (
    <div {...getRootProps()} className="p-4 sm:p-6 relative">
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-50 bg-oak-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-background-secondary border-2 border-dashed border-oak-primary rounded-lg shadow-xl p-12 max-w-md">
            <div className="flex flex-col items-center text-center">
              <div className="p-4 rounded-lg bg-oak-primary/10 mb-4">
                <Upload className="w-12 h-12 text-oak-primary" />
              </div>
              <p className="text-lg font-semibold text-text-primary mb-2">Drop files to upload</p>
              <p className="text-sm text-text-secondary">
                You&apos;ll be redirected to the upload page with files attached
              </p>
              <div className="mt-4 text-xs text-text-muted">
                PDF, PNG, JPG, TIFF • Max 50MB per file
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Document Processing</h1>
          <p className="text-text-secondary text-sm mt-1">
            AI-powered document extraction, classification, and revision workflow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn-secondary btn-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleReviewNext}
            className="btn-secondary btn-sm flex items-center gap-2"
            title="Review next document needing attention"
          >
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Review Next</span>
            <span className="sm:hidden">Review</span>
          </button>
          {can.createDocument && (
            <Link href="/processing/upload" className="btn-primary btn-sm flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Upload Documents</span>
              <span className="sm:hidden">Upload</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <MobileCollapsibleSection title="Statistics" count={6} className={cn('mb-6', isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-oak-primary/10">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-oak-light" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.total}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Total</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.queued}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Queued</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.processing}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Processing</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-warning/10">
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.pendingReview}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Pending Review</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-success/10">
                  <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.approved}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Approved</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-error/10">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-status-error" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.failed}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Failed</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters - Desktop: Integrated in table. Mobile: Separate panel */}
      <div className="mb-4 md:hidden">
        <ProcessingFilters
          onFilterChange={handleFiltersChange}
          initialFilters={{
            pipelineStatus: params.pipelineStatus,
            duplicateStatus: params.duplicateStatus,
            revisionStatus: params.revisionStatus,
            needsReview: params.needsReview,
            isContainer: params.isContainer,
            companyId: params.companyId,
            uploadDatePreset: params.uploadDatePreset,
            uploadDateFrom: params.uploadDateFrom,
            uploadDateTo: params.uploadDateTo,
            documentDateFrom: params.documentDateFrom,
            documentDateTo: params.documentDateTo,
            vendorName: params.vendorName,
            documentNumber: params.documentNumber,
            fileName: params.fileName,
            tagIds: params.tagIds,
          }}
          onSearchChange={handleSearchChange}
          initialSearch={params.search || ''}
          companies={companiesData?.companies.map(c => ({ id: c.id, name: c.name })) || []}
          tags={tagsData?.map(t => ({ id: t.id, name: t.name, color: t.color })) || []}
          activeCompanyId={effectiveCompanyId}
          activeTenantId={activeTenantId}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load documents'}</p>
          </div>
        </div>
      )}

      {/* Loading State - Only show full loading spinner on initial load (no data yet) */}
      {isLoading && !data && (
        <div className="card p-8 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-oak-light" />
          <span className="ml-3 text-text-secondary">Loading documents...</span>
        </div>
      )}

      {/* Empty State - Only show when not fetching and no documents */}
      {!isFetching && !error && data?.documents.length === 0 && (
        <div className="card p-8 text-center">
          <FileText className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No documents found</h3>
          <p className="text-text-secondary mb-4">
            Upload invoices, receipts, and other business documents for AI-powered extraction.
          </p>
          <Link href="/processing/upload" className="btn-primary btn-sm inline-flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Documents
          </Link>
        </div>
      )}

      {/* Document Cards - Mobile View */}
      {!error && data && data.documents.length > 0 && (
        <div className={cn('md:hidden space-y-3 mb-6 relative', isFetching && 'opacity-60')}>
          {data.documents.map((doc) => {
            const isSelected = selectedIds.includes(doc.id);
            return (
              <MobileCard
                key={doc.id}
                isSelected={isSelected}
                selectable
                onToggle={() => toggleSelect(doc.id)}
                title={
                  <Link href={`/processing/${doc.id}`} className="hover:underline">
                    {doc.document.fileName}
                  </Link>
                }
                subtitle={
                  <span className="text-text-muted">
                    {doc.isContainer ? 'Container' : `Pages ${doc.pageFrom}-${doc.pageTo}`}
                    {doc.document.company && ` • ${doc.document.company.name}`}
                  </span>
                }
                badge={
                  <StatusBadge
                    status={doc.pipelineStatus}
                    config={pipelineStatusConfig[doc.pipelineStatus]}
                  />
                }
                details={
                  <div className="space-y-3">
                    {/* Status Badges Row */}
                    <div className="flex flex-wrap gap-2">
                      {doc.currentRevision && (
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                          revisionStatusConfig[doc.currentRevision.status].color
                        )}>
                          {revisionStatusConfig[doc.currentRevision.status].label}
                        </span>
                      )}
                      {doc.duplicateStatus !== 'NONE' && (
                        <StatusBadge
                          status={doc.duplicateStatus}
                          config={duplicateStatusConfig[doc.duplicateStatus]}
                        />
                      )}
                    </div>

                    <CardDetailsGrid>
                      <CardDetailItem
                        label="Company"
                        value={doc.document.company?.name || '-'}
                      />
                      <CardDetailItem
                        label="Category"
                        value={formatCategory(doc.currentRevision?.documentCategory)}
                      />
                      <CardDetailItem
                        label="Sub-Category"
                        value={formatCategory(doc.currentRevision?.documentSubCategory)}
                      />
                      <CardDetailItem
                        label="Vendor"
                        value={doc.currentRevision?.vendorName || '-'}
                      />
                      <CardDetailItem
                        label="Doc #"
                        value={doc.currentRevision?.documentNumber || '-'}
                      />
                      <CardDetailItem
                        label="Doc Date"
                        value={doc.currentRevision?.documentDate
                          ? formatDate(doc.currentRevision.documentDate)
                          : '-'}
                      />
                      <CardDetailItem
                        label="Subtotal"
                        value={doc.currentRevision
                          ? formatCurrency(doc.currentRevision.subtotal, doc.currentRevision.currency)
                          : '-'}
                      />
                      <CardDetailItem
                        label="Tax"
                        value={doc.currentRevision
                          ? formatCurrency(doc.currentRevision.taxAmount, doc.currentRevision.currency)
                          : '-'}
                      />
                      <CardDetailItem
                        label="Total"
                        value={doc.currentRevision
                          ? formatCurrency(doc.currentRevision.totalAmount, doc.currentRevision.currency)
                          : '-'}
                      />
                      {doc.currentRevision?.homeCurrency && (
                        <>
                          <CardDetailItem
                            label="Home Subtotal"
                            value={formatCurrency(doc.currentRevision.homeSubtotal, doc.currentRevision.homeCurrency)}
                          />
                          <CardDetailItem
                            label="Home Tax"
                            value={formatCurrency(doc.currentRevision.homeTaxAmount, doc.currentRevision.homeCurrency)}
                          />
                          <CardDetailItem
                            label="Home Total"
                            value={formatCurrency(doc.currentRevision.homeEquivalent, doc.currentRevision.homeCurrency)}
                          />
                        </>
                      )}
                      <CardDetailItem
                        label="Uploaded"
                        value={formatDate(doc.createdAt)}
                      />
                    </CardDetailsGrid>
                  </div>
                }
                actions={
                  <div className="flex items-center gap-2">
                    {doc.duplicateStatus === 'SUSPECTED' && (
                      <Link
                        href={`/processing/${doc.id}?compare=true`}
                        className="btn-ghost btn-xs inline-flex items-center gap-1 text-status-warning min-h-[44px]"
                        title="Compare with suspected duplicate"
                      >
                        <Copy className="w-4 h-4" />
                        Compare
                      </Link>
                    )}
                    <Link
                      href={`/processing/${doc.id}`}
                      className="btn-secondary btn-xs inline-flex items-center gap-1 min-h-[44px]"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Link>
                  </div>
                }
              />
            );
          })}

          {/* Mobile Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3">
              <p className="text-xs text-text-secondary">
                {(data.page - 1) * data.limit + 1}-{Math.min(data.page * data.limit, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(data.page - 1)}
                  disabled={data.page === 1}
                  className="btn-ghost btn-xs min-h-[44px]"
                >
                  Previous
                </button>
                <span className="text-xs text-text-secondary">
                  {data.page}/{data.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(data.page + 1)}
                  disabled={data.page === data.totalPages}
                  className="btn-ghost btn-xs min-h-[44px]"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Desktop Toolbar */}
      <div className="hidden md:block mb-4">
        <ProcessingToolbar
          search={params.search || ''}
          onSearchChange={handleSearchChange}
          quickFilters={{
            needsReview: params.needsReview,
            uploadDatePreset: params.uploadDatePreset,
            duplicateStatus: params.duplicateStatus,
          }}
          onQuickFilterChange={(filters) => {
            handleFiltersChange(filters);
          }}
          companies={companiesData?.companies.map(c => ({ id: c.id, name: c.name })) || []}
          selectedCompanyId={params.companyId}
          onCompanyChange={(companyId) => {
            handleFiltersChange({ companyId });
          }}
          tags={tagsData}
          selectedTagIds={params.tagIds}
          onTagsChange={(tagIds) => {
            handleFiltersChange({ tagIds });
          }}
          onAdjustColumns={() => setIsColumnModalOpen(true)}
          hiddenColumnCount={hiddenColumnCount}
        />
      </div>

      {/* Document Table - Desktop View */}
      {!error && data && data.documents.length > 0 && (
        <div className={cn('hidden md:block card overflow-hidden relative', isFetching && 'opacity-60')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <colgroup>
                <col style={{ width: '40px' }} />
                {visibleColumnIds.map((id) => (
                  <col
                    key={id}
                    style={
                      id === 'open'
                        ? { width: '44px' }
                        : columnWidths[id]
                          ? { width: `${columnWidths[id]}px` }
                          : undefined
                    }
                  />
                ))}
              </colgroup>
              <thead className="bg-background-tertiary border-b border-border-primary">
                {/* Column header row */}
                <tr>
                  <th className="w-10 px-4 py-3">
                    <button
                      onClick={toggleSelectAll}
                      className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                      title={selectionState === 'all' ? 'Deselect all' : 'Select all'}
                    >
                      {selectionState === 'all' ? (
                        <CheckSquare className="w-4 h-4 text-oak-primary" />
                      ) : selectionState === 'partial' ? (
                        <MinusSquare className="w-4 h-4 text-oak-light" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                  )}
                    </button>
                      </th>
                  {visibleColumnIds.map((columnId) =>
                    columnId === 'open' ? (
                      <th
                        key={columnId}
                        className="text-center text-xs font-medium text-text-secondary px-2 py-3 whitespace-nowrap"
                        title="Open in new tab"
                      >
                        <ArrowUpRight className="w-4 h-4 inline-block text-text-muted" />
                      </th>
                    ) : (
                      <th
                        key={columnId}
                        style={columnWidths[columnId] ? { width: `${columnWidths[columnId]}px` } : undefined}
                        className={cn(
                          'relative text-xs font-medium text-text-secondary px-4 py-3 whitespace-nowrap pr-3',
                          RIGHT_ALIGNED_COLUMNS.has(columnId) ? 'text-right' : 'text-left'
                        )}
                        onPointerDown={(e) => startResizeIfEdge(e, columnId)}
                      >
                        {COLUMN_SORT_FIELDS[columnId] ? (
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => handleSort(COLUMN_SORT_FIELDS[columnId]!)}
                            className={cn(
                              'inline-flex items-center gap-1 select-none hover:text-text-primary transition-colors',
                              params.sortBy === COLUMN_SORT_FIELDS[columnId] && 'text-text-primary'
                            )}
                          >
                            <span>{COLUMN_LABELS[columnId]}</span>
                            <span className="flex-shrink-0">
                              {params.sortBy === COLUMN_SORT_FIELDS[columnId] ? (
                                params.sortOrder === 'asc' ? (
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
                          <span>{COLUMN_LABELS[columnId]}</span>
                        )}
                        <div
                          onPointerDown={(e) => startResize(e, columnId)}
                          className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
                          title="Drag to resize"
                        />
                      </th>
                    )
                  )}
                </tr>
                {/* Inline filter row */}
                <tr className="bg-background-secondary">
                  <th className="px-4 py-2"></th>
                  {visibleColumnIds.map((columnId) => (
                    <th key={columnId} className="px-2 py-2">
                      {columnId === 'open' ? null : columnId === 'document' ? (
                        <input
                          type="text"
                          value={params.fileName || ''}
                          onChange={(e) => handleFiltersChange({ fileName: e.target.value || undefined })}
                          placeholder="Filter..."
                          className="w-full h-9 text-sm px-3 rounded-lg border border-border-primary bg-white dark:bg-background-secondary hover:border-oak-primary/50 focus:ring-2 focus:ring-oak-primary/30 focus:border-oak-primary outline-none transition-colors placeholder:text-text-muted"
                        />
                      ) : columnId === 'company' ? (
                        <SearchableSelect
                          options={[
                            { value: '', label: 'All' },
                            ...companiesData?.companies.map(c => ({ value: c.id, label: c.name })) || []
                          ]}
                          value={params.companyId || ''}
                          onChange={(value) => handleFiltersChange({ companyId: value || undefined })}
                          placeholder="All"
                          className="text-xs"
                        />
                      ) : columnId === 'pipeline' ? (
                        <SearchableSelect
                          options={[
                            { value: '', label: 'All' },
                            ...Object.entries(pipelineStatusConfig).map(([value, config]) => ({
                              value,
                              label: config.label
                            }))
                          ]}
                          value={params.pipelineStatus || ''}
                          onChange={(value) => handleFiltersChange({ pipelineStatus: value as PipelineStatus || undefined })}
                          placeholder="All"
                          className="text-xs"
                        />
                      ) : columnId === 'status' ? (
                        <SearchableSelect
                          options={[
                            { value: '', label: 'All' },
                            ...Object.entries(revisionStatusConfig).map(([value, config]) => ({
                              value,
                              label: config.label
                            }))
                          ]}
                          value={params.revisionStatus || ''}
                          onChange={(value) => handleFiltersChange({ revisionStatus: value as RevisionStatus || undefined })}
                          placeholder="All"
                          className="text-xs"
                        />
                      ) : columnId === 'duplicate' ? (
                        <SearchableSelect
                          options={[
                            { value: '', label: 'All' },
                            ...Object.entries(duplicateStatusConfig).map(([value, config]) => ({
                              value,
                              label: config.label
                            }))
                          ]}
                          value={params.duplicateStatus || ''}
                          onChange={(value) => handleFiltersChange({ duplicateStatus: value as DuplicateStatus || undefined })}
                          placeholder="All"
                          className="text-xs"
                        />
                      ) : columnId === 'vendor' ? (
                        <input
                          type="text"
                          value={params.vendorName || ''}
                          onChange={(e) => handleFiltersChange({ vendorName: e.target.value || undefined })}
                          placeholder="Filter..."
                          className="w-full h-9 text-sm px-3 rounded-lg border border-border-primary bg-white dark:bg-background-secondary hover:border-oak-primary/50 focus:ring-2 focus:ring-oak-primary/30 focus:border-oak-primary outline-none transition-colors placeholder:text-text-muted"
                        />
                      ) : columnId === 'docNumber' ? (
                        <input
                          type="text"
                          value={params.documentNumber || ''}
                          onChange={(e) => handleFiltersChange({ documentNumber: e.target.value || undefined })}
                          placeholder="Filter..."
                          className="w-full h-9 text-sm px-3 rounded-lg border border-border-primary bg-white dark:bg-background-secondary hover:border-oak-primary/50 focus:ring-2 focus:ring-oak-primary/30 focus:border-oak-primary outline-none transition-colors placeholder:text-text-muted"
                        />
                      ) : columnId === 'docDate' ? (
                        <DatePicker
                          value={
                            params.documentDateFrom || params.documentDateTo
                              ? {
                                  mode: 'range' as const,
                                  range: {
                                    from: params.documentDateFrom ? new Date(params.documentDateFrom) : undefined,
                                    to: params.documentDateTo ? new Date(params.documentDateTo) : undefined,
                                  }
                                }
                              : undefined
                          }
                          onChange={(value) => {
                            if (!value || value.mode !== 'range') {
                              handleFiltersChange({ documentDateFrom: undefined, documentDateTo: undefined });
                            } else if (value.range) {
                              handleFiltersChange({
                                documentDateFrom: value.range.from?.toISOString().split('T')[0],
                                documentDateTo: value.range.to?.toISOString().split('T')[0],
                              });
                            }
                          }}
                          placeholder="All dates"
                          size="sm"
                          defaultTab="range"
                          className="text-xs"
                        />
                      ) : columnId === 'uploaded' ? (
                        <DatePicker
                          value={
                            params.uploadDateFrom || params.uploadDateTo
                              ? {
                                  mode: 'range' as const,
                                  range: {
                                    from: params.uploadDateFrom ? new Date(params.uploadDateFrom) : undefined,
                                    to: params.uploadDateTo ? new Date(params.uploadDateTo) : undefined,
                                  }
                                }
                              : undefined
                          }
                          onChange={(value) => {
                            if (!value || value.mode !== 'range') {
                              handleFiltersChange({ uploadDateFrom: undefined, uploadDateTo: undefined });
                            } else if (value.range) {
                              handleFiltersChange({
                                uploadDateFrom: value.range.from?.toISOString().split('T')[0],
                                uploadDateTo: value.range.to?.toISOString().split('T')[0],
                              });
                            }
                          }}
                          placeholder="All dates"
                          size="sm"
                          defaultTab="range"
                          className="text-xs"
                        />
                      ) : columnId === 'category' ? (
                        <SearchableSelect
                          options={[
                            { value: '', label: 'All' },
                            ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                              value,
                              label
                            }))
                          ]}
                          value={params.documentCategory || ''}
                          onChange={(value) => handleFiltersChange({ documentCategory: value as DocumentCategory || undefined })}
                          placeholder="All"
                          className="text-xs"
                        />
                      ) : columnId === 'subCategory' ? (
                        <SearchableSelect
                          options={[
                            { value: '', label: 'All' },
                            ...Object.entries(SUBCATEGORY_LABELS).map(([value, label]) => ({
                              value,
                              label
                            }))
                          ]}
                          value={params.documentSubCategory || ''}
                          onChange={(value) => handleFiltersChange({ documentSubCategory: value as DocumentSubCategory || undefined })}
                          placeholder="All"
                          className="text-xs"
                        />
                      ) : columnId === 'subtotal' ? (
                        <AmountFilter
                          value={params.subtotal !== undefined ? { mode: 'single', single: params.subtotal } :
                                params.subtotalFrom !== undefined || params.subtotalTo !== undefined ?
                                { mode: 'range', range: { from: params.subtotalFrom, to: params.subtotalTo } } : undefined}
                          onChange={(value) => handleFiltersChange({ subtotalFilter: value })}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                        />
                      ) : columnId === 'tax' ? (
                        <AmountFilter
                          value={params.tax !== undefined ? { mode: 'single', single: params.tax } :
                                params.taxFrom !== undefined || params.taxTo !== undefined ?
                                { mode: 'range', range: { from: params.taxFrom, to: params.taxTo } } : undefined}
                          onChange={(value) => handleFiltersChange({ taxFilter: value })}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                        />
                      ) : columnId === 'total' ? (
                        <AmountFilter
                          value={params.total !== undefined ? { mode: 'single', single: params.total } :
                                params.totalFrom !== undefined || params.totalTo !== undefined ?
                                { mode: 'range', range: { from: params.totalFrom, to: params.totalTo } } : undefined}
                          onChange={(value) => handleFiltersChange({ totalFilter: value })}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                        />
                      ) : columnId === 'homeSubtotal' ? (
                        <AmountFilter
                          value={params.homeSubtotal !== undefined ? { mode: 'single', single: params.homeSubtotal } :
                                params.homeSubtotalFrom !== undefined || params.homeSubtotalTo !== undefined ?
                                { mode: 'range', range: { from: params.homeSubtotalFrom, to: params.homeSubtotalTo } } : undefined}
                          onChange={(value) => handleFiltersChange({ homeSubtotalFilter: value })}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                        />
                      ) : columnId === 'homeTax' ? (
                        <AmountFilter
                          value={params.homeTax !== undefined ? { mode: 'single', single: params.homeTax } :
                                params.homeTaxFrom !== undefined || params.homeTaxTo !== undefined ?
                                { mode: 'range', range: { from: params.homeTaxFrom, to: params.homeTaxTo } } : undefined}
                          onChange={(value) => handleFiltersChange({ homeTaxFilter: value })}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                        />
                      ) : columnId === 'homeTotal' ? (
                        <AmountFilter
                          value={params.homeTotal !== undefined ? { mode: 'single', single: params.homeTotal } :
                                params.homeTotalFrom !== undefined || params.homeTotalTo !== undefined ?
                                { mode: 'range', range: { from: params.homeTotalFrom, to: params.homeTotalTo } } : undefined}
                          onChange={(value) => handleFiltersChange({ homeTotalFilter: value })}
                          placeholder="All amounts"
                          size="sm"
                          className="text-xs"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.documents.map((doc) => {
                  const isSelected = selectedIds.includes(doc.id);
                  return (
                    <tr
                      key={doc.id}
                      onClick={(e) => handleRowNavigate(e, doc.id)}
                      className={cn(
                        'border-b border-border-primary transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-oak-primary/5 hover:bg-oak-primary/10'
                          : 'hover:bg-background-tertiary/50'
                      )}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(doc.id);
                          }}
                          className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-oak-primary" />
                          ) : (
                            <Square className="w-4 h-4 text-text-muted" />
                          )}
                        </button>
                      </td>
                      {visibleColumnIds.map((columnId) => renderDesktopCell(doc, columnId))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
              <p className="text-sm text-text-secondary">
                Showing {(data.page - 1) * data.limit + 1} to{' '}
                {Math.min(data.page * data.limit, data.total)} of {data.total} documents
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(data.page - 1)}
                  disabled={data.page === 1}
                  className="btn-ghost btn-xs"
                >
                  Previous
                </button>
                <span className="text-sm text-text-secondary">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(data.page + 1)}
                  disabled={data.page === data.totalPages}
                  className="btn-ghost btn-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedIds={selectedIds}
        onClearSelection={clearSelection}
      />

      <Modal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        title="Adjust columns"
        description="Choose which columns to show, and reset widths if needed."
        size="lg"
      >
        <ModalBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {COLUMN_IDS.map((columnId) => (
              <Checkbox
                key={columnId}
                checked={isColumnVisible(columnId)}
                disabled={columnId === 'open'}
                label={COLUMN_LABELS[columnId]}
                description={columnId === 'open' ? 'Always shown' : undefined}
                onChange={() => toggleColumnVisibility(columnId)}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">Saved per user.</p>
        </ModalBody>
        <ModalFooter className="justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={showAllColumns} className="btn-secondary btn-sm">
              Show all
            </button>
            <button type="button" onClick={resetColumns} className="btn-secondary btn-sm" title="Reset column widths">
              Reset widths
            </button>
          </div>
          <button type="button" onClick={() => setIsColumnModalOpen(false)} className="btn-primary btn-sm">
            Done
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
