'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Bookmark,
  ChevronDown,
  FileText,
  FileSignature,
  Grid2X2,
  LayoutList,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { CompanySearchableSelect } from '@/components/ui/company-searchable-select';
import { FilterChip } from '@/components/ui/filter-chip';
import { Alert } from '@/components/ui/alert';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Dropdown, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { useToast } from '@/components/ui/toast';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import {
  isAllowedEsigningUploadFile,
  useEsigningWordUploadAvailability,
} from '@/components/esigning/esigning-upload-files';
import { useSession } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import {
  useCreateEsigningEnvelope,
  useDeleteEsigningEnvelope,
  useDuplicateEsigningEnvelope,
  useEsigningEnvelopes,
  useResendEsigningEnvelope,
  useRetryEsigningEnvelopeProcessing,
  uploadEsigningDocumentRequest,
  useVoidEsigningEnvelope,
} from '@/hooks/use-esigning';
import type { EsigningEnvelopeListItem, EsigningManualLinkDto } from '@/types/esigning';
import {
  EnvelopeStatusBadge,
  ESIGNING_SIGNING_ORDER_LABELS,
  formatEsigningDateTime,
} from '@/components/esigning/esigning-shared';
import { cn } from '@/lib/utils';
import {
  ESIGNING_COMPLETION_BCC_PREFERENCE_KEY,
  parseEsigningCompletionBccPreference,
  type EsigningCompletionBccPreference,
} from '@/lib/validations/esigning';
import {
  readTaskLaunchContext,
  withTaskLaunchContext,
} from '@/lib/task-launch-context';
import {
  useEnsureTaskEsigningPreparation,
  useRetryTaskEsigningPreparation,
  useTaskEsigningPreparation,
} from '@/hooks/use-tasks';

type StatusFilter =
  | 'DRAFT'
  | 'SENT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'VOIDED'
  | 'DECLINED'
  | 'EXPIRED';

type TabKey = 'all' | 'attention' | 'waiting' | 'completed' | 'voided';

const TAB_LABELS: Record<TabKey, string> = {
  all: 'All',
  attention: 'Needs Attention',
  waiting: 'Waiting',
  completed: 'Completed',
  voided: 'Voided / Expired',
};

const TAB_LABELS_SHORT: Record<TabKey, string> = {
  all: 'All',
  attention: 'Attention',
  waiting: 'Waiting',
  completed: 'Done',
  voided: 'Voided',
};

function getEnvelopeTitleFromFile(file: File): string {
  return file.name.replace(/\.(pdf|docx?|doc)$/i, '') || 'New Envelope';
}

const TAB_STATUSES: Record<TabKey, StatusFilter[]> = {
  all: [],
  attention: ['DRAFT', 'DECLINED'],
  waiting: ['SENT', 'IN_PROGRESS'],
  completed: ['COMPLETED'],
  voided: ['VOIDED', 'EXPIRED'],
};

type ViewMode = 'table' | 'card';
type RecipientStatusFilter = 'QUEUED' | 'NOTIFIED' | 'VIEWED' | 'SIGNED' | 'DECLINED';
type SigningOrderFilter = 'PARALLEL' | 'SEQUENTIAL' | 'MIXED';
type EnvelopeSortBy =
  | 'status'
  | 'title'
  | 'companyName'
  | 'details'
  | 'updatedAt';

const CARD_STATUS_BORDER_CLASS: Record<StatusFilter, string> = {
  DRAFT: 'border-t-slate-400',
  SENT: 'border-t-blue-400',
  IN_PROGRESS: 'border-t-amber-400',
  COMPLETED: 'border-t-emerald-400',
  VOIDED: 'border-t-slate-400',
  DECLINED: 'border-t-rose-400',
  EXPIRED: 'border-t-orange-400',
};

const ESIGNING_COLUMN_WIDTH_PREF_KEY = 'esigning:list:columns:v1';
const ESIGNING_TABLE_COLUMNS = [
  'status',
  'envelope',
  'company',
  'details',
  'updated',
] as const;
type EsigningTableColumnId = (typeof ESIGNING_TABLE_COLUMNS)[number];

const DEFAULT_ESIGNING_COLUMN_WIDTHS: Record<EsigningTableColumnId, number> = {
  status: 160,
  envelope: 360,
  company: 220,
  details: 170,
  updated: 190,
};

interface EnvelopeAdvancedFilters {
  status: StatusFilter | '';
  documentName: string;
  recipientQuery: string;
  recipientStatus: RecipientStatusFilter | '';
  signingOrder: SigningOrderFilter | '';
  createdFrom: string;
  createdTo: string;
  sentFrom: string;
  sentTo: string;
  completedFrom: string;
  completedTo: string;
  createdBy: 'all' | 'me';
}

const EMPTY_ADVANCED_FILTERS: EnvelopeAdvancedFilters = {
  status: '',
  documentName: '',
  recipientQuery: '',
  recipientStatus: '',
  signingOrder: '',
  createdFrom: '',
  createdTo: '',
  sentFrom: '',
  sentTo: '',
  completedFrom: '',
  completedTo: '',
  createdBy: 'all',
};

const STATUS_TO_TAB: Record<StatusFilter, TabKey> = {
  DRAFT: 'attention',
  SENT: 'waiting',
  IN_PROGRESS: 'waiting',
  COMPLETED: 'completed',
  VOIDED: 'voided',
  DECLINED: 'attention',
  EXPIRED: 'voided',
};

const ENVELOPE_STATUS_LABELS: Record<StatusFilter, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  VOIDED: 'Voided',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
};

const RECIPIENT_STATUS_LABELS: Record<RecipientStatusFilter, string> = {
  QUEUED: 'Pending',
  NOTIFIED: 'Sent',
  VIEWED: 'Viewed',
  SIGNED: 'Signed',
  DECLINED: 'Declined',
};

const SIGNING_ORDER_FILTER_LABELS: Record<SigningOrderFilter, string> = {
  PARALLEL: 'Parallel signing',
  SEQUENTIAL: 'Sequential signing',
  MIXED: 'Mixed signing',
};

function formatFilterDateRange(from: string, to: string): string {
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return '';
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEnvelopeSearchMatchContext(
  envelope: EsigningEnvelopeListItem,
  query: string
): string | null {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return null;

  if (
    envelope.title.toLocaleLowerCase().includes(needle)
    || envelope.companyName?.toLocaleLowerCase().includes(needle)
  ) {
    return null;
  }

  const matchedDocument = envelope.documents.find((document) =>
    document.fileName.toLocaleLowerCase().includes(needle)
  );
  if (matchedDocument) {
    return `Matched document: ${matchedDocument.fileName}`;
  }

  const matchedRecipient = envelope.recipients.find((recipient) =>
    recipient.name.toLocaleLowerCase().includes(needle)
  );
  if (matchedRecipient) {
    return `Matched recipient: ${matchedRecipient.name}`;
  }

  const matchedEmail = envelope.recipients.find((recipient) =>
    recipient.email?.toLocaleLowerCase().includes(needle)
  );
  if (matchedEmail?.email) {
    return `Matched email: ${matchedEmail.email}`;
  }

  return null;
}

function isStatusDuplicatedByTab(status: StatusFilter, tab: TabKey): boolean {
  const tabStatuses = TAB_STATUSES[tab];
  return tabStatuses.length === 1 && tabStatuses[0] === status;
}

export function EmailDeliveryWarningBadge({ envelope }: { envelope: EsigningEnvelopeListItem }) {
  if (envelope.emailDelivery.status !== 'failed') {
    return null;
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
      title="Some e-signing emails failed to send"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      Email failed
    </span>
  );
}

interface EnvelopeActionsDropdownProps {
  envelope: EsigningEnvelopeListItem;
  onDuplicate: (envelope: EsigningEnvelopeListItem) => void;
  onResend: (envelope: EsigningEnvelopeListItem) => void;
  onDelete: (envelope: EsigningEnvelopeListItem) => void;
  onVoid: (envelope: EsigningEnvelopeListItem) => void;
  onRetryPdf: (envelopeId: string) => void;
  onDownload: (
    envelopeId: string,
    tenantId: string,
    variant: 'documents' | 'documents_with_certificates' | 'certificates'
  ) => void;
}

export function EnvelopeActionsDropdown({
  envelope,
  onDuplicate,
  onResend,
  onDelete,
  onVoid,
  onRetryPdf,
  onDownload,
}: EnvelopeActionsDropdownProps) {
  const hasActions =
    envelope.canResend ||
    envelope.canDelete ||
    envelope.canDuplicate ||
    envelope.canVoid ||
    envelope.canRetryCompletionProcessing ||
    envelope.status === 'COMPLETED';

  if (!hasActions) {
    return null;
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild aria-label={`Actions for ${envelope.title}`}>
        <button className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-background-tertiary hover:text-text-primary">
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={`/esigning/${envelope.id}`}>
          <DropdownItem icon={<ExternalLink className="h-4 w-4" />}>Open envelope</DropdownItem>
        </Link>

        {envelope.status === 'COMPLETED' ? (
          <>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => onDownload(envelope.id, envelope.tenantId, 'documents')}
            >
              Document only
            </DropdownItem>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => onDownload(envelope.id, envelope.tenantId, 'documents_with_certificates')}
            >
              Document + Certificate
            </DropdownItem>
            <DropdownItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => onDownload(envelope.id, envelope.tenantId, 'certificates')}
            >
              Certificate only
            </DropdownItem>
          </>
        ) : null}

        {envelope.canResend ? (
          <DropdownItem
            icon={<Send className="h-4 w-4" />}
            onClick={() => onResend(envelope)}
          >
            Resend active requests
          </DropdownItem>
        ) : null}

        {envelope.canDuplicate ? (
          <DropdownItem
            icon={<Copy className="h-4 w-4" />}
            onClick={() => onDuplicate(envelope)}
          >
            Duplicate envelope
          </DropdownItem>
        ) : null}

        {envelope.canRetryCompletionProcessing ? (
          <DropdownItem
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={() => onRetryPdf(envelope.id)}
          >
            {envelope.pdfGenerationStatus === 'FAILED'
              ? 'Retry processing'
              : 'Resume processing'}
          </DropdownItem>
        ) : null}

        {envelope.canVoid || envelope.canDelete ? <DropdownSeparator /> : null}

        {envelope.canVoid ? (
          <DropdownItem
            destructive
            icon={<XCircle className="h-4 w-4" />}
            onClick={() => onVoid(envelope)}
          >
            Void envelope
          </DropdownItem>
        ) : null}

        {envelope.canDelete ? (
          <DropdownItem
            destructive
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => onDelete(envelope)}
          >
            {envelope.status === 'COMPLETED' ? 'Delete envelope' : 'Delete draft'}
          </DropdownItem>
        ) : null}
      </DropdownMenu>
    </Dropdown>
  );
}

export function EsigningListPage() {
  const searchParams = useSearchParams();
  const taskContext = useMemo(
    () => readTaskLaunchContext(searchParams),
    [searchParams],
  );
  const generatedDocumentId = searchParams.get('generatedDocumentId') ?? undefined;
  const selectedGeneratedDocumentIds = useMemo(
    () => Array.from(new Set(searchParams.getAll('generatedDocumentIds').filter(Boolean))),
    [searchParams],
  );
  const configuredSigningOrder = searchParams.get('signingOrder');
  const signingOrder = (
    configuredSigningOrder
    && ['PARALLEL', 'SEQUENTIAL', 'MIXED'].includes(configuredSigningOrder)
  )
    ? configuredSigningOrder as 'PARALLEL' | 'SEQUENTIAL' | 'MIXED'
    : 'PARALLEL';
  const expiresInDays = Number(searchParams.get('expiresInDays'));
  const { can } = usePermissions();
  const toast = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveWorkspaceId(session?.isSuperAdmin ?? false, session?.tenantId);
  const completionBccPreference = useUserPreference<EsigningCompletionBccPreference>(
    ESIGNING_COMPLETION_BCC_PREFERENCE_KEY,
  );
  const columnWidthPreference = useUserPreference<Partial<Record<EsigningTableColumnId, number>>>(
    ESIGNING_COLUMN_WIDTH_PREF_KEY,
  );
  const saveColumnWidthPreference = useUpsertUserPreference<Record<string, number>>();
  const defaultCompletionBccEmails = useMemo(
    () => parseEsigningCompletionBccPreference(completionBccPreference.data?.value).emails,
    [completionBccPreference.data?.value],
  );
  const wordUploadEnabled = useEsigningWordUploadAvailability(activeTenantId);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isStarting, setIsStarting] = useState(false);
  const [isDraggingOnHero, setIsDraggingOnHero] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortBy, setSortBy] = useState<EnvelopeSortBy>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [companyId, setCompanyId] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<EnvelopeAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [draftFilters, setDraftFilters] = useState<EnvelopeAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [draftCompanyId, setDraftCompanyId] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EsigningEnvelopeListItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<EsigningEnvelopeListItem | null>(null);
  const [retryTargetId, setRetryTargetId] = useState<string | null>(null);
  const [manualLinks, setManualLinks] = useState<EsigningManualLinkDto[]>([]);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const ensuredTaskRef = useRef<string | null>(null);
  const selectedTaskDocumentsRef = useRef<string | null>(null);
  const openedPreparedEnvelopeRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const isResizingColumnRef = useRef(false);
  const [columnWidths, setColumnWidths] = useState<Partial<Record<EsigningTableColumnId, number>>>({});

  useEffect(() => {
    const value = columnWidthPreference.data?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;

    const sanitized = Object.fromEntries(
      ESIGNING_TABLE_COLUMNS.flatMap((columnId) => {
        const width = value[columnId];
        return typeof width === 'number' && Number.isFinite(width)
          ? [[columnId, Math.max(30, width)]]
          : [];
      })
    ) as Partial<Record<EsigningTableColumnId, number>>;
    setColumnWidths(sanitized);
  }, [columnWidthPreference.data?.value]);

  const startColumnResize = useCallback((
    event: React.PointerEvent<HTMLElement>,
    columnId: EsigningTableColumnId,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const header = handle.closest('th') as HTMLTableCellElement | null;
    const startWidth =
      columnWidths[columnId]
      ?? header?.getBoundingClientRect().width
      ?? DEFAULT_ESIGNING_COLUMN_WIDTHS[columnId];
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let latestWidth = startWidth;

    isResizingColumnRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is best-effort; window listeners still handle resizing.
    }

    const onMove = (pointerEvent: globalThis.PointerEvent) => {
      const nextWidth = Math.max(30, startWidth + (pointerEvent.clientX - startX));
      latestWidth = nextWidth;
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Ignore browsers that already released pointer capture.
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      isResizingColumnRef.current = false;

      const nextWidths = { ...columnWidths, [columnId]: latestWidth };
      setColumnWidths(nextWidths);
      saveColumnWidthPreference.mutate({
        key: ESIGNING_COLUMN_WIDTH_PREF_KEY,
        value: nextWidths,
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [columnWidths, saveColumnWidthPreference]);

  const activeStatuses = TAB_STATUSES[activeTab];
  const envelopesQuery = useEsigningEnvelopes({
    query: debouncedQuery || undefined,
    status: appliedFilters.status || undefined,
    statuses: appliedFilters.status
      ? undefined
      : activeStatuses.length > 0
        ? activeStatuses
        : undefined,
    companyId: companyId || undefined,
    documentName: appliedFilters.documentName || undefined,
    recipientQuery: appliedFilters.recipientQuery || undefined,
    recipientStatus: appliedFilters.recipientStatus || undefined,
    signingOrder: appliedFilters.signingOrder || undefined,
    createdFrom: appliedFilters.createdFrom || undefined,
    createdTo: appliedFilters.createdTo || undefined,
    sentFrom: appliedFilters.sentFrom || undefined,
    sentTo: appliedFilters.sentTo || undefined,
    completedFrom: appliedFilters.completedFrom || undefined,
    completedTo: appliedFilters.completedTo || undefined,
    createdBy: appliedFilters.createdBy,
    sortBy,
    sortOrder,
    page,
    limit,
  });
  const createEnvelope = useCreateEsigningEnvelope();
  const deleteEnvelope = useDeleteEsigningEnvelope();
  const duplicateEnvelope = useDuplicateEsigningEnvelope();
  const resendEnvelope = useResendEsigningEnvelope();
  const voidEnvelope = useVoidEsigningEnvelope(voidTarget?.id ?? '');
  const retryProcessing = useRetryEsigningEnvelopeProcessing(retryTargetId ?? '');
  const preparationQuery = useTaskEsigningPreparation(
    taskContext?.taskId ?? '',
    taskContext?.taskStageId ?? '',
  );
  const ensurePreparation = useEnsureTaskEsigningPreparation();
  const retryPreparation = useRetryTaskEsigningPreparation();
  const preparation = ensurePreparation.data ?? preparationQuery.data;

  const envelopes = useMemo(
    () => (envelopesQuery.data?.envelopes ?? []) as EsigningEnvelopeListItem[],
    [envelopesQuery.data?.envelopes]
  );

  const statusCounts = useMemo(
    () =>
      envelopesQuery.data?.statusCounts ?? {
        DRAFT: 0,
        SENT: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        VOIDED: 0,
        DECLINED: 0,
        EXPIRED: 0,
      },
    [envelopesQuery.data?.statusCounts]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  useEffect(() => {
    if (!isFilterPanelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setIsFilterPanelOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFilterPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isFilterPanelOpen]);

  const companyOptions = useMemo(
    () => envelopesQuery.data?.companyOptions ?? [],
    [envelopesQuery.data?.companyOptions]
  );

  const tabCounts = useMemo<Record<TabKey, number>>(
    () => ({
      all: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      attention: statusCounts.DRAFT + statusCounts.DECLINED,
      waiting: statusCounts.SENT + statusCounts.IN_PROGRESS,
      completed: statusCounts.COMPLETED,
      voided: statusCounts.VOIDED + statusCounts.EXPIRED,
    }),
    [statusCounts]
  );

  const totalResults = envelopesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / limit));
  const selectedCompanyName = companyOptions.find((company) => company.id === companyId)?.name ?? '';
  const advancedFilterCount = useMemo(() => {
    let count = companyId ? 1 : 0;
    if (appliedFilters.status) count += 1;
    if (appliedFilters.documentName) count += 1;
    if (appliedFilters.recipientQuery) count += 1;
    if (appliedFilters.recipientStatus) count += 1;
    if (appliedFilters.signingOrder) count += 1;
    if (appliedFilters.createdFrom || appliedFilters.createdTo) count += 1;
    if (appliedFilters.sentFrom || appliedFilters.sentTo) count += 1;
    if (appliedFilters.completedFrom || appliedFilters.completedTo) count += 1;
    if (appliedFilters.createdBy === 'me') count += 1;
    return count;
  }, [appliedFilters, companyId]);

  const hasAppliedFilters = advancedFilterCount > 0;

  const handleSort = (nextSortBy: EnvelopeSortBy) => {
    setSortOrder((currentOrder) =>
      sortBy === nextSortBy
        ? currentOrder === 'asc'
          ? 'desc'
          : 'asc'
        : nextSortBy === 'updatedAt'
          ? 'desc'
          : 'asc'
    );
    setSortBy(nextSortBy);
    setPage(1);
  };

  const renderSortIcon = (column: EnvelopeSortBy) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />;
    }
    return sortOrder === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
      : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />;
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setAppliedFilters((current) => ({ ...current, status: '' }));
    setDraftFilters((current) => ({ ...current, status: '' }));
    setPage(1);
  };

  const handleCompanyChange = (nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    setDraftCompanyId(nextCompanyId);
    setPage(1);
  };

  const openFilterPanel = () => {
    setDraftFilters({ ...appliedFilters });
    setDraftCompanyId(companyId);
    setIsFilterPanelOpen(true);
  };

  const applyFilterPanel = () => {
    const nextFilters = { ...draftFilters };
    if (nextFilters.status) {
      const targetTab = STATUS_TO_TAB[nextFilters.status];
      setActiveTab(targetTab);
      if (isStatusDuplicatedByTab(nextFilters.status, targetTab)) {
        nextFilters.status = '';
      }
    }
    setAppliedFilters(nextFilters);
    setCompanyId(draftCompanyId);
    setPage(1);
    setIsFilterPanelOpen(false);
  };

  const clearAllFilters = () => {
    setCompanyId('');
    setDraftCompanyId('');
    setAppliedFilters({ ...EMPTY_ADVANCED_FILTERS });
    setDraftFilters({ ...EMPTY_ADVANCED_FILTERS });
    setPage(1);
  };

  const applySavedView = (
    tab: TabKey,
    nextFilters: Partial<EnvelopeAdvancedFilters> = {}
  ) => {
    const filters = { ...EMPTY_ADVANCED_FILTERS, ...nextFilters };
    setActiveTab(tab);
    setAppliedFilters(filters);
    setDraftFilters(filters);
    setCompanyId('');
    setDraftCompanyId('');
    setPage(1);
  };

  const applyCompletedThisMonthView = () => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    applySavedView('completed', {
      completedFrom: toDateInputValue(monthStart),
      completedTo: toDateInputValue(today),
    });
  };

  const handleStart = useCallback(async (files?: File[]) => {
    if (isStarting) {
      return;
    }

    const uploadFiles = files ?? [];
    const invalidFile = uploadFiles.find(
      (file) => !isAllowedEsigningUploadFile(file, { wordUploadEnabled })
    );
    if (invalidFile) {
      toast.error(
        wordUploadEnabled
          ? 'Upload PDF, DOCX, or DOC documents.'
          : 'Word upload requires a valid SharePoint or OneDrive connector. Upload PDF documents instead.'
      );
      return;
    }

    let createdEnvelope: { id: string } | null = null;
    try {
      setIsStarting(true);
      const title = uploadFiles[0] ? getEnvelopeTitleFromFile(uploadFiles[0]) : 'New Envelope';
      const expiresAt = Number.isInteger(expiresInDays) && expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
        : undefined;
      createdEnvelope = await createEnvelope.mutateAsync({
        title,
        completionCopyEmails: defaultCompletionBccEmails,
        signingOrder,
        expiresAt,
        taskContext,
        ...(selectedGeneratedDocumentIds.length > 0
          ? { generatedDocumentIds: selectedGeneratedDocumentIds }
          : { generatedDocumentId }),
      });
      const destination = withTaskLaunchContext(
        `/esigning/${createdEnvelope.id}`,
        taskContext
      );

      if (uploadFiles.length > 0) {
        try {
          for (const file of uploadFiles) {
            await uploadEsigningDocumentRequest(createdEnvelope.id, file, activeTenantId);
          }
        } catch (uploadError) {
          let compensationFailed = false;
          try {
            await deleteEnvelope.mutateAsync(createdEnvelope.id);
          } catch (deleteError) {
            compensationFailed = true;
            toast.error(
              deleteError instanceof Error
                ? `Upload failed and the new draft could not be removed: ${deleteError.message}`
                : 'Upload failed and the new draft could not be removed.'
            );
          }

          if (compensationFailed) {
            toast.error(
              uploadError instanceof Error
                ? `Opening the draft so you can recover it. ${uploadError.message}`
                : 'Opening the draft so you can recover it.'
            );
            window.location.assign(destination);
          }
          throw uploadError;
        }
      }

      window.location.assign(destination);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create envelope');
    } finally {
      setIsStarting(false);
    }
  }, [
    activeTenantId,
    createEnvelope,
    defaultCompletionBccEmails,
    deleteEnvelope,
    expiresInDays,
    generatedDocumentId,
    isStarting,
    selectedGeneratedDocumentIds,
    signingOrder,
    taskContext,
    toast,
    wordUploadEnabled,
  ]);

  useEffect(() => {
    if (!taskContext || selectedGeneratedDocumentIds.length > 0 || !can.createEsigning) return;
    const launchKey = `${taskContext.taskId}:${taskContext.taskStageId}`;
    if (ensuredTaskRef.current === launchKey) return;
    ensuredTaskRef.current = launchKey;
    void ensurePreparation.mutateAsync({
      taskId: taskContext.taskId,
      stageId: taskContext.taskStageId,
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to prepare E-signing');
    });
  }, [can.createEsigning, ensurePreparation, selectedGeneratedDocumentIds, taskContext, toast]);

  useEffect(() => {
    if (!taskContext || selectedGeneratedDocumentIds.length === 0 || !can.createEsigning) return;
    const launchKey = `${taskContext.taskId}:${taskContext.taskStageId}:${selectedGeneratedDocumentIds.join(',')}`;
    if (selectedTaskDocumentsRef.current === launchKey) return;
    selectedTaskDocumentsRef.current = launchKey;
    void handleStart();
  }, [can.createEsigning, handleStart, selectedGeneratedDocumentIds, taskContext]);

  useEffect(() => {
    if (
      !taskContext
      || selectedGeneratedDocumentIds.length > 0
      || preparation?.status !== 'READY'
      || !preparation.esigningEnvelopeId
      || openedPreparedEnvelopeRef.current === preparation.esigningEnvelopeId
    ) {
      return;
    }
    openedPreparedEnvelopeRef.current = preparation.esigningEnvelopeId;
    window.location.assign(withTaskLaunchContext(
      `/esigning/${preparation.esigningEnvelopeId}`,
      taskContext,
    ));
  }, [preparation, selectedGeneratedDocumentIds, taskContext]);

  async function handleRetryPdf(envelopeId: string) {
    try {
      setRetryTargetId(envelopeId);
      const targetEnvelope = envelopes.find((envelope) => envelope.id === envelopeId);
      await retryProcessing.mutateAsync();
      toast.success(
        targetEnvelope?.pdfGenerationStatus === 'FAILED'
          ? 'PDF generation retried'
          : 'PDF generation triggered'
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to trigger PDF generation'
      );
    } finally {
      setRetryTargetId(null);
    }
  }

  async function handleDuplicateEnvelope(envelope: EsigningEnvelopeListItem) {
    try {
      const duplicated = await duplicateEnvelope.mutateAsync(envelope.id);
      toast.success('Envelope duplicated');
      window.location.assign(`/esigning/${duplicated.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate envelope');
    }
  }

  function handleDownload(
    envelopeId: string,
    tenantId: string,
    variant: 'documents' | 'documents_with_certificates' | 'certificates'
  ) {
    const queryParams = new URLSearchParams({ variant, tenantId });
    window.open(`/api/esigning/envelopes/${envelopeId}/download?${queryParams.toString()}`, '_blank', 'noreferrer');
  }

  async function handleResendEnvelope(envelope: EsigningEnvelopeListItem) {
    try {
      const result = await resendEnvelope.mutateAsync(envelope.id);
      if (result.manualLinks.length > 0) {
        setManualLinks(result.manualLinks);
        setIsLinksModalOpen(true);
      }

      const signerLabel =
        envelope.resendableRecipientCount === 1 ? '1 signer' : `${envelope.resendableRecipientCount} signers`;
      toast.success(`Resent active signing request to ${signerLabel}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend active signing requests');
    }
  }

  if (!can.readEsigning) {
    return (
      <div className="p-6">
        <Alert variant="error" title="Access denied">
          You do not have permission to view e-signing envelopes.
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-oak-primary">
              E-Signing
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-text-primary">Envelopes</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Prepare, send and track documents for signature.
            </p>
          </div>
          {can.createEsigning && !taskContext ? (
            <Button
              size="md"
              className="self-start sm:self-auto"
              leftIcon={<Plus className="h-4 w-4" />}
              isLoading={isStarting}
              onClick={() => void handleStart()}
            >
              New envelope
            </Button>
          ) : null}
        </header>

        {taskContext ? (
          <section className="rounded-2xl border border-border-primary bg-background-secondary p-5 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-oak-primary/10 text-oak-primary">
              <RefreshCw
                className={cn(
                  'h-5 w-5',
                  (isStarting || !preparation || preparation.status === 'QUEUED' || preparation.status === 'PROCESSING')
                    && 'animate-spin',
                )}
              />
            </div>
            <h2 className="mt-3 text-base font-semibold text-text-primary">
              {selectedGeneratedDocumentIds.length > 0
                ? 'Preparing selected documents'
                : preparation?.status === 'WAITING'
                ? 'E-signing is waiting'
                : preparation?.status === 'FAILED_RETRYABLE'
                  ? 'Preparation needs attention'
                  : preparation?.status === 'FAILED_PERMANENT'
                    ? 'E-signing cannot be prepared'
                    : preparation?.status === 'READY'
                      ? 'Opening prepared envelope'
                      : 'Preparing E-signing'}
            </h2>
            <p className="mx-auto mt-1.5 max-w-xl text-sm text-text-secondary">
              {selectedGeneratedDocumentIds.length > 0
                ? `${selectedGeneratedDocumentIds.length} ${selectedGeneratedDocumentIds.length === 1 ? 'document is' : 'documents are'} being added to a new signing workspace.`
                : preparation?.status === 'WAITING' && preparation.blockingStage
                ? `Complete or skip ${preparation.blockingStage.name} before the generated document is attached.`
                : preparation?.status === 'WAITING'
                  ? 'Finalize the preceding generated document to continue.'
                  : preparation?.lastError
                    ? preparation.lastError
                    : 'The draft envelope and generated document are being prepared in the background.'}
            </p>
            {preparation?.status === 'FAILED_RETRYABLE' ? (
              <Button
                className="mt-3"
                variant="secondary"
                isLoading={retryPreparation.isPending}
                onClick={() => void retryPreparation.mutateAsync({
                  taskId: taskContext.taskId,
                  stageId: taskContext.taskStageId,
                }).catch((error) => {
                  toast.error(error instanceof Error ? error.message : 'Failed to retry preparation');
                })}
              >
                Retry preparation
              </Button>
            ) : null}
          </section>
        ) : can.createEsigning ? (
          <section
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingOnHero(true);
            }}
            onDragLeave={() => setIsDraggingOnHero(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingOnHero(false);
              const files = Array.from(event.dataTransfer.files);
              if (files.length > 0) {
                void handleStart(files);
              }
            }}
            className={cn(
              'flex min-h-[160px] flex-col justify-center gap-3 rounded-2xl border border-dashed px-5 py-6 transition-colors sm:flex-row sm:items-center sm:justify-between',
              isDraggingOnHero
                ? 'border-oak-primary bg-oak-primary/5'
                : 'border-border-secondary bg-background-secondary'
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-oak-primary/10 text-oak-primary">
                <FileSignature className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {wordUploadEnabled
                    ? 'Drop PDF or Word files here to create a new envelope'
                    : 'Drop PDF files here to create a new envelope'}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Files are added to a new draft before you assign recipients.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 self-start sm:self-auto"
              isLoading={isStarting}
              onClick={() => uploadInputRef.current?.click()}
            >
              Browse files
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              aria-label="Upload documents to a new envelope"
              accept={wordUploadEnabled
                ? '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : '.pdf,application/pdf'}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (files.length > 0) {
                  void handleStart(files);
                }
              }}
            />
          </section>
        ) : null}

        {envelopesQuery.error ? (
          <Alert variant="error" title="Unable to load envelopes">
            {envelopesQuery.error instanceof Error ? envelopesQuery.error.message : 'Unknown error'}
          </Alert>
        ) : null}

        <section className="relative">
          <div className="flex overflow-x-auto border-b border-border-primary px-2 sm:px-4">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleTabChange(tab)}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors sm:px-4',
                  activeTab === tab
                    ? 'text-oak-primary after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-oak-primary sm:after:left-4 sm:after:right-4'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <span className="sm:hidden">{TAB_LABELS_SHORT[tab]}</span>
                <span className="hidden sm:inline">{TAB_LABELS[tab]}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    activeTab === tab
                      ? 'bg-oak-primary/10 text-oak-primary'
                      : 'bg-background-tertiary text-text-muted'
                  )}
                >
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 p-3 sm:p-4 lg:flex-row lg:items-center">
            <div className="min-w-0 lg:flex-[1_1_360px]">
              <FormInput
                inputSize="md"
                className="h-10 text-sm"
                aria-label="Search envelopes, documents, recipients or companies"
                placeholder="Search envelopes, documents, recipients or companies..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:flex-nowrap">
              <CompanySearchableSelect
                companies={companyOptions}
                value={companyId}
                onChange={handleCompanyChange}
                placeholder="Company"
                clearable
                size="lg"
                className="col-span-2 w-full sm:col-span-1 sm:w-[440px] sm:max-w-full"
                containerClassName="h-10"
              />

              <div ref={filterPanelRef} className="relative">
                <button
                  type="button"
                  aria-expanded={isFilterPanelOpen}
                  aria-haspopup="dialog"
                  onClick={() => {
                    if (isFilterPanelOpen) {
                      setIsFilterPanelOpen(false);
                    } else {
                      openFilterPanel();
                    }
                  }}
                  className={cn(
                    'flex h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors sm:w-auto',
                    isFilterPanelOpen || advancedFilterCount > 0
                      ? 'border-oak-primary/40 bg-oak-primary/5 text-oak-primary'
                      : 'border-border-primary bg-background-primary text-text-secondary hover:bg-background-tertiary'
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {advancedFilterCount > 0 ? (
                    <span className="rounded-full bg-oak-primary/10 px-1.5 py-0.5 text-[10px] font-semibold">
                      {advancedFilterCount}
                    </span>
                  ) : null}
                </button>

                {isFilterPanelOpen ? (
                  <div
                    role="dialog"
                    aria-label="Envelope filters"
                    className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-border-primary bg-background-secondary shadow-elevation-2 sm:left-auto sm:right-0"
                  >
                    <div className="border-b border-border-primary px-5 py-4">
                      <div className="text-sm font-semibold text-text-primary">Filter envelopes</div>
                      <div className="mt-0.5 text-xs text-text-muted">
                        Filters combine with the selected status tab and search.
                      </div>
                    </div>
                    <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
                      <CompanySearchableSelect
                        companies={companyOptions}
                        value={draftCompanyId}
                        onChange={setDraftCompanyId}
                        placeholder="All companies"
                        label="Company"
                        clearable
                        size="lg"
                        containerClassName="h-10"
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-text-secondary">Status</span>
                          <select
                            aria-label="Filter by envelope status"
                            value={draftFilters.status}
                            onChange={(event) => setDraftFilters((current) => ({
                              ...current,
                              status: event.target.value as StatusFilter | '',
                            }))}
                            className="h-10 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                          >
                            <option value="">Use status tab</option>
                            {(Object.keys(ENVELOPE_STATUS_LABELS) as StatusFilter[]).map((status) => (
                              <option key={status} value={status}>{ENVELOPE_STATUS_LABELS[status]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-text-secondary">Signing mode</span>
                          <select
                            aria-label="Filter by signing mode"
                            value={draftFilters.signingOrder}
                            onChange={(event) => setDraftFilters((current) => ({
                              ...current,
                              signingOrder: event.target.value as SigningOrderFilter | '',
                            }))}
                            className="h-10 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                          >
                            <option value="">Any mode</option>
                            {(Object.keys(SIGNING_ORDER_FILTER_LABELS) as SigningOrderFilter[]).map((mode) => (
                              <option key={mode} value={mode}>{SIGNING_ORDER_FILTER_LABELS[mode]}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <FormInput
                        inputSize="md"
                        label="Document name"
                        placeholder="Filename contains..."
                        value={draftFilters.documentName}
                        onChange={(event) => setDraftFilters((current) => ({
                          ...current,
                          documentName: event.target.value,
                        }))}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormInput
                          inputSize="md"
                          label="Recipient"
                          placeholder="Name or email..."
                          value={draftFilters.recipientQuery}
                          onChange={(event) => setDraftFilters((current) => ({
                            ...current,
                            recipientQuery: event.target.value,
                          }))}
                        />
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium text-text-secondary">Recipient status</span>
                          <select
                            aria-label="Filter by recipient signing status"
                            value={draftFilters.recipientStatus}
                            onChange={(event) => setDraftFilters((current) => ({
                              ...current,
                              recipientStatus: event.target.value as RecipientStatusFilter | '',
                            }))}
                            className="h-9 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                          >
                            <option value="">Any status</option>
                            {(Object.keys(RECIPIENT_STATUS_LABELS) as RecipientStatusFilter[]).map((status) => (
                              <option key={status} value={status}>{RECIPIENT_STATUS_LABELS[status]}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-text-secondary">Created by</span>
                        <select
                          aria-label="Filter by envelope creator"
                          value={draftFilters.createdBy}
                          onChange={(event) => setDraftFilters((current) => ({
                            ...current,
                            createdBy: event.target.value as 'all' | 'me',
                          }))}
                          className="h-10 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                        >
                          <option value="all">All senders</option>
                          <option value="me">Created by me</option>
                        </select>
                      </label>

                      {([
                        ['Created date', 'createdFrom', 'createdTo'],
                        ['Sent date', 'sentFrom', 'sentTo'],
                        ['Completed date', 'completedFrom', 'completedTo'],
                      ] as const).map(([label, fromKey, toKey]) => (
                        <fieldset key={label}>
                          <legend className="mb-1.5 text-xs font-medium text-text-secondary">{label}</legend>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="date"
                              aria-label={`${label} from`}
                              value={draftFilters[fromKey]}
                              onChange={(event) => setDraftFilters((current) => ({
                                ...current,
                                [fromKey]: event.target.value,
                              }))}
                              className="h-10 min-w-0 rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                            />
                            <input
                              type="date"
                              aria-label={`${label} to`}
                              value={draftFilters[toKey]}
                              onChange={(event) => setDraftFilters((current) => ({
                                ...current,
                                [toKey]: event.target.value,
                              }))}
                              className="h-10 min-w-0 rounded-lg border border-border-primary bg-background-primary px-2.5 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
                            />
                          </div>
                        </fieldset>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border-primary px-5 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDraftFilters({ ...EMPTY_ADVANCED_FILTERS });
                          setDraftCompanyId('');
                        }}
                      >
                        Reset
                      </Button>
                      <Button size="sm" onClick={applyFilterPanel}>Apply</Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <Dropdown>
                <DropdownTrigger asChild>
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-primary bg-background-primary px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-background-tertiary sm:w-auto"
                    aria-label="Saved views"
                  >
                    <Bookmark className="h-4 w-4" />
                    <span>Saved views</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownTrigger>
                <DropdownMenu>
                  <DropdownItem onClick={() => applySavedView('waiting', { createdBy: 'me' })}>
                    My active envelopes
                  </DropdownItem>
                  <DropdownItem onClick={() => applySavedView('waiting')}>
                    Awaiting recipients
                  </DropdownItem>
                  <DropdownItem onClick={() => applySavedView('attention')}>
                    Needs attention
                  </DropdownItem>
                  <DropdownItem onClick={applyCompletedThisMonthView}>
                    Completed this month
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>

              <div className="col-span-2 flex h-10 items-center rounded-lg border border-border-primary bg-background-primary p-0.5 sm:col-span-1 sm:ml-auto">
                <button
                  type="button"
                  aria-label="Table view"
                  title="Table view"
                  onClick={() => setViewMode('table')}
                  className={cn(
                    'flex h-8 w-9 items-center justify-center rounded-md transition-colors',
                    viewMode === 'table'
                      ? 'bg-oak-primary/10 text-oak-primary'
                      : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
                  )}
                >
                  <LayoutList className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Card view"
                  title="Card view"
                  onClick={() => setViewMode('card')}
                  className={cn(
                    'flex h-8 w-9 items-center justify-center rounded-md transition-colors',
                    viewMode === 'card'
                      ? 'bg-oak-primary/10 text-oak-primary'
                      : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
                  )}
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {hasAppliedFilters ? (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
              {companyId && selectedCompanyName ? (
                <FilterChip label="Company" value={selectedCompanyName} onRemove={() => handleCompanyChange('')} />
              ) : null}
              {appliedFilters.status && !isStatusDuplicatedByTab(appliedFilters.status, activeTab) ? (
                <FilterChip
                  label="Status"
                  value={ENVELOPE_STATUS_LABELS[appliedFilters.status]}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, status: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.documentName ? (
                <FilterChip
                  label="Document"
                  value={appliedFilters.documentName}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, documentName: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.recipientQuery ? (
                <FilterChip
                  label="Recipient"
                  value={appliedFilters.recipientQuery}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, recipientQuery: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.recipientStatus ? (
                <FilterChip
                  label="Recipient status"
                  value={RECIPIENT_STATUS_LABELS[appliedFilters.recipientStatus]}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, recipientStatus: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.signingOrder ? (
                <FilterChip
                  label="Signing mode"
                  value={SIGNING_ORDER_FILTER_LABELS[appliedFilters.signingOrder]}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, signingOrder: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.createdFrom || appliedFilters.createdTo ? (
                <FilterChip
                  label="Created"
                  value={formatFilterDateRange(appliedFilters.createdFrom, appliedFilters.createdTo)}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, createdFrom: '', createdTo: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.sentFrom || appliedFilters.sentTo ? (
                <FilterChip
                  label="Sent"
                  value={formatFilterDateRange(appliedFilters.sentFrom, appliedFilters.sentTo)}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, sentFrom: '', sentTo: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.completedFrom || appliedFilters.completedTo ? (
                <FilterChip
                  label="Completed"
                  value={formatFilterDateRange(appliedFilters.completedFrom, appliedFilters.completedTo)}
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, completedFrom: '', completedTo: '' }));
                    setPage(1);
                  }}
                />
              ) : null}
              {appliedFilters.createdBy === 'me' ? (
                <FilterChip
                  label="Created by"
                  value="Me"
                  onRemove={() => {
                    setAppliedFilters((current) => ({ ...current, createdBy: 'all' }));
                    setPage(1);
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-1 text-xs font-medium text-text-muted transition-colors hover:text-oak-primary"
              >
                Clear all
              </button>
            </div>
          ) : null}

          <div className="border-t border-border-primary">
            {envelopesQuery.isLoading ? (
              <div className="px-4 py-12 text-center text-sm text-text-secondary">
                Loading e-signing envelopes...
              </div>
            ) : envelopes.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-oak-primary/10 text-oak-primary">
                  <FileSignature className="h-4 w-4" />
                </div>
                <h2 className="mt-3 text-base font-semibold text-text-primary">
                  {query.trim() || hasAppliedFilters || activeTab !== 'all'
                    ? 'No matching envelopes'
                    : 'No envelopes yet'}
                </h2>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">
                  {query.trim() || hasAppliedFilters || activeTab !== 'all'
                    ? 'No envelopes match your current search and filters.'
                    : 'Create a new envelope when you are ready to prepare documents for signature.'}
                </p>
                {query.trim() || hasAppliedFilters || activeTab !== 'all' ? (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {hasAppliedFilters || activeTab !== 'all' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          clearAllFilters();
                          handleTabChange('all');
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : null}
                    {query.trim() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<X className="h-4 w-4" />}
                        onClick={() => {
                          setQuery('');
                          setDebouncedQuery('');
                          setPage(1);
                        }}
                      >
                        Clear search
                      </Button>
                    ) : null}
                  </div>
                ) : can.createEsigning ? (
                  <Button
                    className="mt-4"
                    size="sm"
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => void handleStart()}
                  >
                    New envelope
                  </Button>
                ) : null}
              </div>
            ) : viewMode === 'table' ? (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-max border-collapse">
                    <colgroup>
                      {ESIGNING_TABLE_COLUMNS.map((columnId) => (
                        <col
                          key={columnId}
                          style={{
                            width: `${columnWidths[columnId] ?? DEFAULT_ESIGNING_COLUMN_WIDTHS[columnId]}px`,
                          }}
                        />
                      ))}
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="h-10 border-b border-border-primary bg-background-primary/60 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                        <th
                          className="relative px-4"
                          aria-sort={sortBy === 'status' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('status')}
                            className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                          >
                            <span>Status</span>
                            {renderSortIcon('status')}
                          </button>
                          <div
                            data-testid="esigning-resize-status"
                            onPointerDown={(event) => startColumnResize(event, 'status')}
                            className="absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize touch-none hover:bg-border-secondary/60"
                            title="Drag to resize"
                            aria-hidden="true"
                          />
                        </th>

                        <th
                          className="relative px-4"
                          aria-sort={sortBy === 'title' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('title')}
                            className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                          >
                            <span>Envelope name</span>
                            {renderSortIcon('title')}
                          </button>
                          <div
                            data-testid="esigning-resize-envelope"
                            onPointerDown={(event) => startColumnResize(event, 'envelope')}
                            className="absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize touch-none hover:bg-border-secondary/60"
                            title="Drag to resize"
                            aria-hidden="true"
                          />
                        </th>

                        <th
                          className="relative px-4"
                          aria-sort={sortBy === 'companyName' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('companyName')}
                            className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                          >
                            <span>Company</span>
                            {renderSortIcon('companyName')}
                          </button>
                          <div
                            data-testid="esigning-resize-company"
                            onPointerDown={(event) => startColumnResize(event, 'company')}
                            className="absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize touch-none hover:bg-border-secondary/60"
                            title="Drag to resize"
                            aria-hidden="true"
                          />
                        </th>

                        <th
                          className="relative px-4"
                          aria-sort={sortBy === 'details' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('details')}
                            className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                          >
                            <span>Details</span>
                            {renderSortIcon('details')}
                          </button>
                          <div
                            data-testid="esigning-resize-details"
                            onPointerDown={(event) => startColumnResize(event, 'details')}
                            className="absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize touch-none hover:bg-border-secondary/60"
                            title="Drag to resize"
                            aria-hidden="true"
                          />
                        </th>

                        <th
                          className="relative px-4"
                          aria-sort={sortBy === 'updatedAt' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort('updatedAt')}
                            className="inline-flex items-center gap-1 transition-colors hover:text-text-primary"
                          >
                            <span>Last updated</span>
                            {renderSortIcon('updatedAt')}
                          </button>
                          <div
                            data-testid="esigning-resize-updated"
                            onPointerDown={(event) => startColumnResize(event, 'updated')}
                            className="absolute -right-2 top-0 z-10 h-full w-4 cursor-col-resize touch-none hover:bg-border-secondary/60"
                            title="Drag to resize"
                            aria-hidden="true"
                          />
                        </th>
                        <th className="px-2 text-right"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-primary">
                      {envelopes.map((envelope, index) => {
                        const matchContext = getEnvelopeSearchMatchContext(envelope, debouncedQuery);
                        const isAlternate = index % 2 === 1;
                        const active = envelope.status === 'SENT' || envelope.status === 'IN_PROGRESS';
                        const progress = envelope.signerCount > 0
                          ? Math.round((envelope.completedSignerCount / envelope.signerCount) * 100)
                          : 0;
                        return (
                          <tr
                            key={envelope.id}
                            tabIndex={0}
                            aria-label={`Open ${envelope.title}`}
                            onClick={() => window.location.assign(`/esigning/${envelope.id}`)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                window.location.assign(`/esigning/${envelope.id}`);
                              }
                            }}
                            className={cn(
                              'h-[58px] cursor-pointer text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oak-primary/30',
                              isAlternate
                                ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                                : 'bg-background-secondary hover:bg-background-tertiary/50'
                            )}
                          >
                            <td className="px-4 py-2.5 align-middle">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <EnvelopeStatusBadge status={envelope.status} />
                                <EmailDeliveryWarningBadge envelope={envelope} />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-middle">
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold text-text-primary" title={envelope.title}>
                                  {envelope.title}
                                </div>
                                {matchContext ? (
                                  <div className="mt-0.5 truncate text-[11px] text-text-muted" title={matchContext}>
                                    {matchContext}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-middle">
                              <div className="truncate text-xs text-text-secondary" title={envelope.companyName ?? 'No company'}>
                                {envelope.companyName ?? 'No company'}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 align-middle">
                              {active ? (
                                <div>
                                  <div className="text-xs font-medium text-text-secondary">
                                    {envelope.completedSignerCount} / {envelope.signerCount} signed
                                  </div>
                                  <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-background-tertiary">
                                    <div className="h-full rounded-full bg-oak-primary" style={{ width: `${progress}%` }} />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-text-secondary">
                                  {envelope.documentCount} docs · {envelope.signerCount} signers
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-middle text-xs text-text-muted">
                              {formatEsigningDateTime(envelope.updatedAt)}
                            </td>
                            <td
                              className="px-2 py-2.5 text-right align-middle"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <EnvelopeActionsDropdown
                                envelope={envelope}
                                onDuplicate={(target) => void handleDuplicateEnvelope(target)}
                                onResend={(target) => void handleResendEnvelope(target)}
                                onDelete={setDeleteTarget}
                                onVoid={setVoidTarget}
                                onRetryPdf={(envelopeId) => void handleRetryPdf(envelopeId)}
                                onDownload={handleDownload}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-border-primary md:hidden">
                  {envelopes.map((envelope, index) => {
                    const matchContext = getEnvelopeSearchMatchContext(envelope, debouncedQuery);
                    const isAlternate = index % 2 === 1;
                    const active = envelope.status === 'SENT' || envelope.status === 'IN_PROGRESS';
                    return (
                      <article
                        key={envelope.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open ${envelope.title}`}
                        onClick={() => window.location.assign(`/esigning/${envelope.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            window.location.assign(`/esigning/${envelope.id}`);
                          }
                        }}
                        className={cn(
                          'cursor-pointer px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oak-primary/30',
                          isAlternate
                            ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                            : 'bg-background-secondary hover:bg-background-tertiary/50'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <EnvelopeStatusBadge status={envelope.status} />
                              <EmailDeliveryWarningBadge envelope={envelope} />
                            </div>
                            <h2 className="mt-2 line-clamp-2 text-sm font-semibold text-text-primary">
                              {envelope.title}
                            </h2>
                            {matchContext ? (
                              <p className="mt-0.5 truncate text-[11px] text-text-muted">{matchContext}</p>
                            ) : null}
                            <p className="mt-1 truncate text-xs text-text-secondary">
                              {envelope.companyName ?? 'No company'}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                              <span>{active ? `${envelope.completedSignerCount} / ${envelope.signerCount} signed` : `${envelope.documentCount} docs · ${envelope.signerCount} signers`}</span>
                              <span>{formatEsigningDateTime(envelope.updatedAt)}</span>
                            </div>
                          </div>
                          <div
                            className="-mr-1 shrink-0"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <EnvelopeActionsDropdown
                              envelope={envelope}
                              onDuplicate={(target) => void handleDuplicateEnvelope(target)}
                              onResend={(target) => void handleResendEnvelope(target)}
                              onDelete={setDeleteTarget}
                              onVoid={setVoidTarget}
                              onRetryPdf={(envelopeId) => void handleRetryPdf(envelopeId)}
                              onDownload={handleDownload}
                            />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 items-stretch gap-3 p-3 sm:p-4 lg:grid-cols-2">
                {envelopes.map((envelope) => {
                  const signers = envelope.recipients.filter((recipient) => recipient.type === 'SIGNER');
                  const active = envelope.status === 'SENT' || envelope.status === 'IN_PROGRESS';
                  const progress = envelope.signerCount > 0
                    ? Math.round((envelope.completedSignerCount / envelope.signerCount) * 100)
                    : 0;
                  const matchContext = getEnvelopeSearchMatchContext(envelope, debouncedQuery);
                  return (
                    <article
                      key={envelope.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open ${envelope.title}`}
                      onClick={() => window.location.assign(`/esigning/${envelope.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          window.location.assign(`/esigning/${envelope.id}`);
                        }
                      }}
                      className="flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border-primary bg-background-secondary transition-colors hover:border-oak-primary/40 hover:bg-background-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30"
                    >
                      <div className={cn(
                        'border-t-4 px-4 pb-2.5 pt-3',
                        CARD_STATUS_BORDER_CLASS[envelope.status]
                      )}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="sr-only">
                              {ENVELOPE_STATUS_LABELS[envelope.status as StatusFilter]}
                            </span>
                            <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-text-primary">
                              {envelope.title}
                            </h2>
                            <p className="mt-0.5 truncate text-xs text-text-secondary" title={envelope.companyName ?? 'No company'}>
                              {envelope.companyName ?? 'No company'}
                            </p>
                            {matchContext ? (
                              <p className="mt-0.5 truncate text-[11px] text-text-muted" title={matchContext}>
                                {matchContext}
                              </p>
                            ) : null}
                            {envelope.emailDelivery.status === 'failed' ? (
                              <div className="mt-1.5">
                                <EmailDeliveryWarningBadge envelope={envelope} />
                              </div>
                            ) : null}
                          </div>
                          <div
                            className="-mr-1 -mt-1 shrink-0"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <EnvelopeActionsDropdown
                              envelope={envelope}
                              onDuplicate={(target) => void handleDuplicateEnvelope(target)}
                              onResend={(target) => void handleResendEnvelope(target)}
                              onDelete={setDeleteTarget}
                              onVoid={setVoidTarget}
                              onRetryPdf={(envelopeId) => void handleRetryPdf(envelopeId)}
                              onDownload={handleDownload}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col px-4 pb-3">
                        {active ? (
                          <div className="flex items-center gap-3 border-t border-border-primary pt-2.5">
                            <div className="text-xs font-medium text-text-secondary">
                              {envelope.completedSignerCount} / {envelope.signerCount} signed
                            </div>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-background-tertiary">
                              <div className="h-full rounded-full bg-oak-primary" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        ) : null}

                        <div className={cn(
                          'grid gap-3 pt-2.5 sm:grid-cols-2',
                          active ? '' : 'border-t border-border-primary'
                        )}>
                          <div className="min-w-0">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                              Signers ({signers.length})
                            </div>
                            <div className="space-y-1.5">
                              {signers.length === 0 ? (
                                <div className="text-xs text-text-muted">No signers assigned</div>
                              ) : signers.slice(0, 3).map((recipient) => {
                                const StatusIcon = recipient.status === 'SIGNED'
                                  ? CheckCircle2
                                  : recipient.status === 'DECLINED'
                                    ? XCircle
                                    : recipient.status === 'VIEWED' || recipient.status === 'NOTIFIED'
                                      ? Clock
                                      : Circle;
                                const statusClass = recipient.status === 'SIGNED'
                                  ? 'text-green-600'
                                  : recipient.status === 'DECLINED'
                                    ? 'text-rose-600'
                                    : recipient.status === 'VIEWED'
                                      ? 'text-blue-600'
                                      : recipient.status === 'NOTIFIED'
                                        ? 'text-amber-600'
                                        : 'text-text-muted';
                                const recipientStatusLabel =
                                  RECIPIENT_STATUS_LABELS[recipient.status as RecipientStatusFilter]
                                  ?? recipient.status;
                                return (
                                  <div key={recipient.id} className="flex min-w-0 items-center gap-2">
                                    <StatusIcon
                                      className={cn('h-3.5 w-3.5 shrink-0', statusClass)}
                                      aria-label={recipientStatusLabel}
                                    />
                                    <div className="min-w-0 truncate text-xs font-medium text-text-primary" title={recipient.name}>
                                      {recipient.name}
                                    </div>
                                  </div>
                                );
                              })}
                              {signers.length > 3 ? (
                                <div className="text-[11px] font-medium text-text-muted">+{signers.length - 3} more</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="min-w-0 border-t border-border-primary pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                              Documents ({envelope.documents.length})
                            </div>
                            <div className="space-y-1.5">
                              {envelope.documents.length === 0 ? (
                                <div className="text-xs text-text-muted">No documents added</div>
                              ) : envelope.documents.slice(0, 3).map((document) => (
                                <div key={document.id} className="flex min-w-0 items-center gap-2">
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                                  <span className="truncate text-xs text-text-secondary" title={document.fileName}>
                                    {document.fileName}
                                  </span>
                                </div>
                              ))}
                              {envelope.documents.length > 3 ? (
                                <div className="text-[11px] font-medium text-text-muted">+{envelope.documents.length - 3} more</div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-primary pt-2.5 text-[11px] text-text-muted">
                          <span>{envelope.documentCount} docs · {envelope.signerCount} signers · {ESIGNING_SIGNING_ORDER_LABELS[envelope.signingOrder]}</span>
                          <span>Updated {formatEsigningDateTime(envelope.updatedAt)}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {!envelopesQuery.isLoading && totalResults > 0 ? (
            <div className="border-t border-border-primary px-3 py-3 sm:px-4">
              <Pagination
                page={page}
                totalPages={totalPages}
                total={totalResults}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={(nextLimit) => {
                  setLimit(nextLimit);
                  setPage(1);
                }}
              />
            </div>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }

          try {
            await deleteEnvelope.mutateAsync(deleteTarget.id);
            toast.success(
              deleteTarget.status === 'COMPLETED'
                ? 'Envelope permanently deleted'
                : 'Draft deleted'
            );
            setDeleteTarget(null);
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : deleteTarget.status === 'COMPLETED'
                  ? 'Failed to delete envelope'
                  : 'Failed to delete draft'
            );
          }
        }}
        title={
          deleteTarget?.status === 'COMPLETED'
            ? 'Delete completed envelope?'
            : 'Delete draft envelope?'
        }
        description={
          deleteTarget
            ? deleteTarget.status === 'COMPLETED'
              ? `This permanently removes "${deleteTarget.title}", its signed documents, certificates, and download access.`
              : `This permanently removes "${deleteTarget.title}" and its uploaded source files.`
            : undefined
        }
        confirmLabel={deleteTarget?.status === 'COMPLETED' ? 'Delete envelope' : 'Delete draft'}
        isLoading={deleteEnvelope.isPending}
      />

      <ConfirmDialog
        isOpen={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        onConfirm={async (reason) => {
          if (!voidTarget) {
            return;
          }

          try {
            await voidEnvelope.mutateAsync(reason ?? null);
            toast.success('Envelope voided');
            setVoidTarget(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to void envelope');
          }
        }}
        title="Void envelope?"
        description={
          voidTarget
            ? `Signers will lose access to "${voidTarget.title}" immediately.`
            : undefined
        }
        confirmLabel="Void envelope"
        requireReason
        reasonLabel="Void reason"
        reasonPlaceholder="Explain why the envelope is being cancelled"
        reasonMinLength={3}
        isLoading={voidEnvelope.isPending}
      />

      <Modal
        isOpen={isLinksModalOpen}
        onClose={() => setIsLinksModalOpen(false)}
        title="Manual signing links"
        size="xl"
      >
        <ModalBody className="min-w-0 space-y-3">
          <Alert variant="info">
            Share these links securely with recipients whose access mode uses manual delivery.
          </Alert>
          {manualLinks.map((link) => (
            <div
              key={link.recipientId}
              className="min-w-0 rounded-2xl border border-border-primary bg-background-primary p-4"
            >
              <div className="min-w-0">
                <div className="min-w-0">
                  <div className="font-medium text-text-primary">{link.recipientName}</div>
                  <div className="break-all text-sm text-text-secondary">{link.recipientEmail || 'No email — manual link only'}</div>
                  <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <a
                      href={link.signingUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={link.signingUrl}
                      className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-xs text-text-secondary hover:border-oak-primary/40 hover:text-text-primary"
                    >
                      {link.signingUrl}
                    </a>
                    <Button
                      className="shrink-0"
                      variant="secondary"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(link.signingUrl)
                          .then(() => toast.success('Manual link copied'))
                          .catch(() => toast.error('Clipboard access failed'))
                      }
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => setIsLinksModalOpen(false)}>Done</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
