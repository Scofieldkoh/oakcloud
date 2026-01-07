'use client';

import { use, useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  RefreshCw,
  Play,
  FileStack,
  History,
  Copy,
  Scissors,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  List,
  Save,
  Plus,
  Trash2,
  Pencil,
  XCircle,
  Sparkles,
  Download,
  FileSpreadsheet,
  Building2,
  Link2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useProcessingDocumentView,
  useRevisionHistory,
  useTriggerExtraction,
  useApproveRevision,
  useRecordDuplicateDecision,
  useRevisionWithLineItems,
  useUpdateRevision,
  useDocumentNavigation,
  useDuplicateComparison,
  useUpdatePageRotation,
  useBulkOperation,
  useCreateRevision,
  useDocumentExport,
  usePrefetchNextDocument,
} from '@/hooks/use-processing-documents';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  DocumentPageViewer,
  ResizableSplitView,
  VerticalSplitView,
  ConfidenceDot,
  DuplicateComparisonModal,
  DocumentLinks,
  DocumentTags,
  DocumentSplitterModal,
} from '@/components/processing';
import type { FieldValue } from '@/components/processing/document-page-viewer';
import type { PipelineStatus, DuplicateStatus, RevisionStatus, DocumentCategory, DocumentSubCategory } from '@/generated/prisma';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  CATEGORY_LABELS,
  SUBCATEGORY_LABELS,
  getSubCategoryOptions,
} from '@/lib/document-categories';
import { SUPPORTED_CURRENCIES } from '@/lib/validations/exchange-rate';
import { convertToHomeCurrency } from '@/lib/currency-conversion';
import { useRateLookup } from '@/hooks/use-exchange-rates';
import { useAccountsForSelect } from '@/hooks/use-chart-of-accounts';
import { useCompany } from '@/hooks/use-companies';
import { AIModelSelector, buildFullContext } from '@/components/ui/ai-model-selector';

// Status display configs
const pipelineStatusConfig: Record<
  PipelineStatus,
  { label: string; color: string; bgColor: string }
> = {
  UPLOADED: { label: 'Uploaded', color: 'text-text-secondary', bgColor: 'bg-background-tertiary' },
  QUEUED: { label: 'Queued', color: 'text-status-info', bgColor: 'bg-status-info/10' },
  PROCESSING: { label: 'Processing', color: 'text-status-info', bgColor: 'bg-status-info/10' },
  SPLIT_PENDING: { label: 'Split Pending', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  SPLIT_DONE: { label: 'Split Done', color: 'text-status-success', bgColor: 'bg-status-success/10' },
  EXTRACTION_DONE: { label: 'Extracted', color: 'text-status-success', bgColor: 'bg-status-success/10' },
  FAILED_RETRYABLE: { label: 'Failed (Retry)', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  FAILED_PERMANENT: { label: 'Failed', color: 'text-status-error', bgColor: 'bg-status-error/10' },
  DEAD_LETTER: { label: 'Dead Letter', color: 'text-status-error', bgColor: 'bg-status-error/10' },
};

const duplicateStatusConfig: Record<
  DuplicateStatus,
  { label: string; color: string; bgColor: string }
> = {
  NONE: { label: 'Not Checked', color: 'text-text-muted', bgColor: 'bg-background-tertiary' },
  SUSPECTED: { label: 'Suspected Duplicate', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  CONFIRMED: { label: 'Confirmed Duplicate', color: 'text-status-error', bgColor: 'bg-status-error/10' },
  REJECTED: { label: 'Not Duplicate', color: 'text-status-success', bgColor: 'bg-status-success/10' },
};

const revisionStatusConfig: Record<
  RevisionStatus,
  { label: string; color: string; bgColor: string }
> = {
  DRAFT: { label: 'Draft', color: 'text-status-warning', bgColor: 'bg-status-warning/10' },
  APPROVED: { label: 'Approved', color: 'text-status-success', bgColor: 'bg-status-success/10' },
  SUPERSEDED: { label: 'Superseded', color: 'text-text-muted', bgColor: 'bg-background-tertiary' },
};

// Use category labels from our utility
const categoryLabels = CATEGORY_LABELS;

// Use all supported currencies from exchange rate validation (spread to convert readonly to mutable array)
const currencyOptions = [...SUPPORTED_CURRENCIES];

// GST tax codes with their rates
const gstTaxCodes = [
  { code: 'SR', label: 'SR (9%)', rate: 0.09 },
  { code: 'SR8', label: 'SR (8%)', rate: 0.08 },
  { code: 'SR7', label: 'SR (7%)', rate: 0.07 },
  { code: 'ZR', label: 'ZR (0%)', rate: 0 },
  { code: 'ES', label: 'ES (Exempt)', rate: 0 },
  { code: 'OS', label: 'OS (Out of Scope)', rate: 0 },
  { code: 'NA', label: 'N/A', rate: 0 },
];

// Helper to get GST rate from tax code
function getGstRate(taxCode: string | null | undefined): number {
  if (!taxCode) return 0;
  const gstCode = gstTaxCodes.find((g) => g.code === taxCode);
  return gstCode?.rate ?? 0;
}

// Chart of accounts is now fetched from database via useAccountsForSelect hook

// Bounding box type for highlight integration
interface BoundingBox {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
  fieldKey?: string;
}

// Highlight colors - mild pastel shades for cleaner appearance
const HIGHLIGHT_COLOR_DEFAULT = '#93C5FD'; // Pastel blue - subtle highlight
const HIGHLIGHT_COLOR_FOCUS = '#FCD34D'; // Pastel yellow/gold - focused field

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
  NZD: 'NZ$',
  CAD: 'C$',
  CHF: 'CHF ',
  MYR: 'RM',
  THB: 'à¸¿',
  IDR: 'Rp',
  PHP: 'â‚±',
  INR: 'â‚¹',
  KRW: 'â‚©',
  TWD: 'NT$',
  VND: 'â‚«',
};

function formatCurrency(amount: string | number | null, currency: string): string {
  if (amount === null || amount === undefined || amount === '') return '-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formatted = new Intl.NumberFormat('en-SG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absNum);

  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;

  return isNegative ? `(${symbol}${formatted})` : `${symbol}${formatted}`;
}

function formatNumber(value: string | number | null, decimals: number = 2): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formatted = absNum.toLocaleString('en-SG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return isNegative ? `(${formatted})` : formatted;
}

// Type for validation issues
interface ValidationIssue {
  code: string;
  severity: 'WARN' | 'ERROR';
  message: string;
  field?: string;
}

// Evidence type from backend
interface FieldEvidence {
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  containerPageNumber?: number;
  confidence?: number;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProcessingDocumentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();
  const { can } = usePermissions();
  const { data: session } = useSession();

  // Get active tenant ID (from store for SUPER_ADMIN, from session for others)
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Check if we should auto-open compare modal from query param
  const shouldAutoCompare = searchParams.get('compare') === 'true';

  // UI State for controlling data fetching
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // Data fetching - consolidated API for initial load
  // This replaces multiple hooks: useProcessingDocument, useDocumentPages, useRevisionWithLineItems, useDocumentTags
  const { data: viewData, isLoading, error, refetch } = useProcessingDocumentView(id);

  // Extract data from consolidated response
  const currentRevisionFromView = viewData?.currentRevision;
  const pagesData = viewData?.pages;
  const initialTags = viewData?.tags;

  // Compatibility layer for existing code that expects data.document and data.currentRevision
  const data = viewData ? {
    document: viewData.document,
    currentRevision: viewData.currentRevision ? {
      id: viewData.currentRevision.id,
      revisionNumber: viewData.currentRevision.revisionNumber,
      status: viewData.currentRevision.status,
      documentCategory: viewData.currentRevision.documentCategory,
      vendorName: viewData.currentRevision.vendorName,
      documentNumber: viewData.currentRevision.documentNumber,
      documentDate: viewData.currentRevision.documentDate,
      totalAmount: viewData.currentRevision.totalAmount,
      currency: viewData.currentRevision.currency,
      homeEquivalent: viewData.currentRevision.homeEquivalent,
      validationStatus: viewData.currentRevision.validationStatus,
      lineItemCount: viewData.currentRevision.lineItems.length,
    } : null,
  } : undefined;

  // Only fetch revision history when needed (when dropdown is shown or might be shown)
  // Always fetch if document has DRAFT status (user might need to see history)
  const shouldFetchHistory = showHistoryDropdown || data?.currentRevision?.status === 'DRAFT';
  const { data: revisions, isLoading: revisionsLoading } = useRevisionHistory(id, shouldFetchHistory);

  // Only fetch navigation when document is in a reviewable state
  const isReviewable = data?.document?.pipelineStatus === 'EXTRACTION_DONE' && data?.currentRevision?.status === 'DRAFT';
  const { data: navData } = useDocumentNavigation(
    id,
    'needs-review',
    {
      tenantId: activeTenantId,
      companyId: data?.document?.company?.id || undefined,
    },
    isReviewable
  );

  // Auto-refresh every 10 seconds if document is being processed
  useEffect(() => {
    const isExtracting = data?.document?.pipelineStatus === 'QUEUED' ||
                        data?.document?.pipelineStatus === 'PROCESSING';

    if (isExtracting) {
      const interval = setInterval(() => {
        refetch();
      }, 10000); // 10 seconds

      return () => clearInterval(interval);
    }
  }, [data?.document?.pipelineStatus, refetch]);

  // Prefetch next document for faster navigation during approval workflow
  const prefetchNextDocument = usePrefetchNextDocument();
  useEffect(() => {
    // Only prefetch when current document is fully loaded and we have navigation data
    if (!isLoading && navData?.nextId) {
      prefetchNextDocument(navData.nextId);
    }
  }, [isLoading, navData?.nextId, prefetchNextDocument]);

  // Current revision data
  const currentRevisionId = data?.currentRevision?.id || null;

  // Snapshot viewing state - when viewing a historical revision
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [viewingSnapshotNumber, setViewingSnapshotNumber] = useState<number | null>(null);

  // Determine which revision to display - snapshot or current
  const displayRevisionId = viewingSnapshotId || currentRevisionId;
  const isViewingSnapshot = viewingSnapshotId !== null;

  // Only fetch revision separately when viewing a snapshot (historical revision)
  // For current revision, use data from consolidated view
  const { data: snapshotRevision, isLoading: snapshotLoading, refetch: refetchSnapshot } = useRevisionWithLineItems(
    id,
    isViewingSnapshot ? viewingSnapshotId : null, // Only fetch when viewing snapshot
    false
  );

  // Use snapshot data when viewing snapshot, otherwise use consolidated view data
  const revisionWithLineItems = isViewingSnapshot ? snapshotRevision : currentRevisionFromView;
  const lineItemsLoading = isViewingSnapshot ? snapshotLoading : isLoading;
  const refetchLineItems = isViewingSnapshot ? refetchSnapshot : refetch;

  // Duplicate comparison (only fetch when needed)
  const { data: duplicateData } = useDuplicateComparison(
    id,
    data?.document?.duplicateStatus === 'SUSPECTED'
  );

  // Exchange rate lookup for home currency conversion
  // Only lookup if document currency differs from home currency and no rate is stored
  const docCurrency = revisionWithLineItems?.currency || 'SGD';
  const homeCurrency = revisionWithLineItems?.homeCurrency || 'SGD';
  const needsRateLookup = docCurrency !== homeCurrency && docCurrency !== 'SGD' && !revisionWithLineItems?.homeExchangeRate;
  const rateDate = revisionWithLineItems?.documentDate || new Date().toISOString().split('T')[0];

  const { data: rateLookupData } = useRateLookup(
    needsRateLookup ? docCurrency : '',
    needsRateLookup ? rateDate : '',
    data?.document?.tenantId
  );

  // Chart of accounts for line item assignment
  // Only fetch when user can edit and document has line items or is in editable state
  const canEdit = can.updateDocument && data?.currentRevision?.status === 'DRAFT';
  const shouldFetchAccounts = canEdit && data?.document?.pipelineStatus === 'EXTRACTION_DONE';
  const { data: accountsData } = useAccountsForSelect(
    {
      tenantId: data?.document?.tenantId,
      companyId: data?.document?.company?.id || undefined,
    },
    shouldFetchAccounts
  );

  // Transform accounts to the format expected by LineItemsSection
  const chartOfAccounts = useMemo(() => {
    if (!accountsData) return [];
    return accountsData.map((account) => ({
      code: account.code,
      name: account.name,
    }));
  }, [accountsData]);

  // Mutations
  const triggerExtraction = useTriggerExtraction();
  const approveRevision = useApproveRevision();
  const recordDuplicateDecision = useRecordDuplicateDecision();
  const updateRevision = useUpdateRevision();
  const updatePageRotation = useUpdatePageRotation();
  const bulkOperation = useBulkOperation();
  const createRevision = useCreateRevision();

  // Export hook
  const documentExport = useDocumentExport();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  // UI State (showHistoryDropdown already declared above for data fetching optimization)
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSplitterModal, setShowSplitterModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isReExtraction, setIsReExtraction] = useState(false);
  const [skipAliasLearning, setSkipAliasLearning] = useState(false);
  const [isResolvingAlias, setIsResolvingAlias] = useState(false);

  // AI context state (matching upload page)
  const [aiContext, setAiContext] = useState('');
  const [selectedStandardContexts, setSelectedStandardContexts] = useState<string[]>([]);

  // Fetch company details for context
  const companyId = data?.document?.company?.id;
  const { data: companyData } = useCompany(companyId || '');

  // Build company context (matching upload page format)
  const companyContext = useMemo(() => {
    const company = companyData;
    if (!company) return '';

    const contextParts: string[] = [];
    contextParts.push(`Uploading Company: ${company.name}`);
    if (company.primarySsicDescription) {
      contextParts.push(`Business Nature: ${company.primarySsicDescription}`);
    }
    if (company.homeCurrency) {
      contextParts.push(`Home Currency: ${company.homeCurrency}`);
    }
    contextParts.push('');
    contextParts.push('IMPORTANT BUSINESS CONTEXT:');
    contextParts.push(`- "${company.name}" is uploading this document for processing`);
    contextParts.push(`- For ACCOUNTS_PAYABLE (vendor invoices/bills): "${company.name}" is the BUYER/RECIPIENT - the vendor/supplier name must be a DIFFERENT company`);
    contextParts.push(`- For ACCOUNTS_RECEIVABLE (sales invoices): "${company.name}" is the SELLER/ISSUER - extract the customer name as the other party`);

    return contextParts.join('\n');
  }, [companyData]);

  // Fetch available AI models (no longer using the custom hook - AIModelSelector handles this)

  // Handler to view a historical revision snapshot
  const handleViewSnapshot = useCallback((revisionId: string, revisionNumber: number) => {
    setViewingSnapshotId(revisionId);
    setViewingSnapshotNumber(revisionNumber);
    setShowHistoryDropdown(false);
  }, []);

  // Handler to return to current revision
  const handleExitSnapshot = useCallback(() => {
    setViewingSnapshotId(null);
    setViewingSnapshotNumber(null);
  }, []);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  // Track if we're editing an approved document (need to create revision on save)
  const [isEditingApproved, setIsEditingApproved] = useState(false);
  const [editFormData, setEditFormData] = useState<{
    documentCategory: string;
    documentSubCategory: string;
    vendorName: string;
    documentNumber: string;
    documentDate: string;
    dueDate: string;
    currency: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    supplierGstNo: string;
    // Phase 2: Home currency fields
    homeCurrency: string;
    homeExchangeRate: string;
    homeSubtotal: string;
    homeTaxAmount: string;
    homeTotal: string;
    isHomeExchangeRateOverride: boolean;
  }>({
    documentCategory: '',
    documentSubCategory: '',
    vendorName: '',
    documentNumber: '',
    documentDate: '',
    dueDate: '',
    currency: 'SGD',
    subtotal: '',
    taxAmount: '',
    totalAmount: '',
    supplierGstNo: '',
    // Phase 2: Home currency defaults
    homeCurrency: 'SGD',
    homeExchangeRate: '1',
    homeSubtotal: '',
    homeTaxAmount: '',
    homeTotal: '',
    isHomeExchangeRateOverride: false,
  });
  const [editLineItems, setEditLineItems] = useState<Array<{
    id?: string;
    lineNo: number;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    gstAmount: string;
    taxCode: string;
    accountCode: string;
    // Phase 2: Home currency line item fields
    homeAmount: string;
    homeGstAmount: string;
    isHomeAmountOverride: boolean;
    isHomeGstOverride: boolean;
  }>>([]);
  const [deletedLineItemIds, setDeletedLineItemIds] = useState<string[]>([]);

  // Auto-open compare modal if query param is set
  useEffect(() => {
    if (shouldAutoCompare && duplicateData && !showDuplicateModal) {
      setShowDuplicateModal(true);
      // Remove the query param to prevent re-opening on navigation
      router.replace(`/processing/${id}`, { scroll: false });
    }
  }, [shouldAutoCompare, duplicateData, id, router, showDuplicateModal]);

  // Helper function to initialize form data from revision with home currency calculation
  const initializeFormDataFromRevision = useCallback((revision: typeof revisionWithLineItems, fetchedRate?: string) => {
    if (!revision) return;

    const docCurrency = revision.currency || 'SGD';
    const homeCurrency = revision.homeCurrency || 'SGD';
    const isSameCurrency = docCurrency === homeCurrency;

    // Get exchange rate - use stored rate, fetched rate, or default to 1
    // Priority: stored rate > fetched rate > default 1
    const storedRate = revision.homeExchangeRate;
    const rateToUse = isSameCurrency
      ? '1'
      : storedRate || fetchedRate || '1';
    const exchangeRate = parseFloat(rateToUse) || 1;

    // Calculate home currency amounts if not already provided
    let homeSubtotal = revision.homeSubtotal || '';
    let homeTaxAmount = revision.homeTaxAmount || '';

    // If home amounts are empty but we have document amounts, calculate them
    if (!homeSubtotal && revision.subtotal) {
      const subtotal = parseFloat(revision.subtotal);
      if (!isNaN(subtotal)) {
        homeSubtotal = isSameCurrency
          ? revision.subtotal
          : convertToHomeCurrency(subtotal, exchangeRate).toFixed(2);
      }
    }

    if (!homeTaxAmount && revision.taxAmount) {
      const taxAmount = parseFloat(revision.taxAmount);
      if (!isNaN(taxAmount)) {
        homeTaxAmount = isSameCurrency
          ? revision.taxAmount
          : convertToHomeCurrency(taxAmount, exchangeRate).toFixed(2);
      }
    }

    // Always calculate homeTotal as sum of homeSubtotal + homeTaxAmount for consistency
    // This ensures the displayed total always matches its components
    let homeTotal = '';
    const homeSubtotalNum = parseFloat(homeSubtotal) || 0;
    const homeTaxNum = parseFloat(homeTaxAmount) || 0;
    if (homeSubtotal || homeTaxAmount) {
      homeTotal = (homeSubtotalNum + homeTaxNum).toFixed(2);
    } else if (revision.totalAmount) {
      // Fallback: calculate from document total if no components available
      const totalAmount = parseFloat(revision.totalAmount);
      if (!isNaN(totalAmount)) {
        homeTotal = isSameCurrency
          ? revision.totalAmount
          : convertToHomeCurrency(totalAmount, exchangeRate).toFixed(2);
      }
    }

    setEditFormData({
      documentCategory: revision.documentCategory || '',
      documentSubCategory: revision.documentSubCategory || '',
      vendorName: revision.vendorName || '',
      documentNumber: revision.documentNumber || '',
      documentDate: revision.documentDate || '',
      dueDate: revision.dueDate || '',
      currency: docCurrency,
      subtotal: revision.subtotal || '',
      taxAmount: revision.taxAmount || '',
      totalAmount: revision.totalAmount || '',
      supplierGstNo: '',
      // Phase 2: Home currency fields
      homeCurrency: homeCurrency,
      homeExchangeRate: rateToUse,
      homeSubtotal: homeSubtotal,
      homeTaxAmount: homeTaxAmount,
      homeTotal: homeTotal,
      isHomeExchangeRateOverride: revision.isHomeExchangeRateOverride || false,
    });

    // Calculate line item home amounts if not provided
    setEditLineItems(
      revision.lineItems?.map((item) => {
        let homeAmount = item.homeAmount || '';
        let homeGstAmount = item.homeGstAmount || '';

        // Calculate if not provided
        if (!homeAmount && item.amount) {
          const amount = parseFloat(item.amount);
          if (!isNaN(amount)) {
            homeAmount = isSameCurrency
              ? item.amount
              : convertToHomeCurrency(amount, exchangeRate).toFixed(2);
          }
        }

        if (!homeGstAmount && item.gstAmount) {
          const gstAmount = parseFloat(item.gstAmount);
          if (!isNaN(gstAmount)) {
            homeGstAmount = isSameCurrency
              ? item.gstAmount
              : convertToHomeCurrency(gstAmount, exchangeRate).toFixed(2);
          }
        }

        return {
          id: item.id,
          lineNo: item.lineNo,
          description: item.description,
          quantity: item.quantity || '',
          unitPrice: item.unitPrice || '',
          amount: item.amount,
          gstAmount: item.gstAmount || '',
          taxCode: item.taxCode || '',
          accountCode: item.accountCode || '',
          // Phase 2: Home currency line item fields
          homeAmount: homeAmount,
          homeGstAmount: homeGstAmount,
          isHomeAmountOverride: item.isHomeAmountOverride || false,
          isHomeGstOverride: item.isHomeGstOverride || false,
        };
      }) || []
    );
  }, []);

  // Initialize edit form when revision data changes or rate lookup completes
  useEffect(() => {
    if (revisionWithLineItems && !isEditing) {
      // Pass the fetched rate if available
      const fetchedRate = rateLookupData?.rate;
      initializeFormDataFromRevision(revisionWithLineItems, fetchedRate);
    }
  }, [revisionWithLineItems, isEditing, initializeFormDataFromRevision, rateLookupData]);

  // Convert evidence JSON to highlights for DocumentPageViewer
  const highlights = useMemo((): BoundingBox[] => {
    if (!revisionWithLineItems?.headerEvidenceJson) return [];

    const evidence = revisionWithLineItems.headerEvidenceJson as Record<string, FieldEvidence>;
    const boxes: BoundingBox[] = [];

    // Field keys that have evidence
    const fieldKeys = ['vendorName', 'documentNumber', 'documentDate', 'totalAmount', 'subtotal', 'taxAmount', 'supplierGstNo'];

    // Debug: log raw evidence
    if (process.env.NODE_ENV === 'development') {
      console.log('[ProcessingDetail] Raw evidence JSON:', evidence);
    }

    fieldKeys.forEach((key) => {
      const fieldEvidence = evidence[key];
      if (fieldEvidence?.bbox) {
        const { x0, y0, x1, y1 } = fieldEvidence.bbox;
        const isFocused = focusedField === key;

        // Debug: log individual field evidence
        if (process.env.NODE_ENV === 'development') {
          console.log(`[ProcessingDetail] Field "${key}" bbox:`, { x0, y0, x1, y1 });
        }

        boxes.push({
          pageNumber: fieldEvidence.containerPageNumber || 1,
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
          label: isFocused ? key : undefined,
          color: isFocused ? HIGHLIGHT_COLOR_FOCUS : HIGHLIGHT_COLOR_DEFAULT,
          fieldKey: key,
        });
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('[ProcessingDetail] Generated highlights:', boxes);
    }

    return boxes;
  }, [revisionWithLineItems?.headerEvidenceJson, focusedField]);

  // Get confidence for a field from evidence
  const getFieldConfidence = useCallback((fieldKey: string): number | undefined => {
    if (!revisionWithLineItems?.headerEvidenceJson) return undefined;
    const evidence = revisionWithLineItems.headerEvidenceJson as Record<string, FieldEvidence>;
    return evidence[fieldKey]?.confidence;
  }, [revisionWithLineItems?.headerEvidenceJson]);

  // Create fieldValues for text layer search (more accurate bounding boxes)
  const fieldValues = useMemo((): FieldValue[] => {
    if (!revisionWithLineItems) return [];

    const values: FieldValue[] = [];
    const isFocusedColor = HIGHLIGHT_COLOR_FOCUS;
    const defaultColor = HIGHLIGHT_COLOR_DEFAULT;

    // Add field values that we want to highlight
    if (revisionWithLineItems.vendorName) {
      values.push({
        label: 'vendorName',
        value: revisionWithLineItems.vendorName,
        color: focusedField === 'vendorName' ? isFocusedColor : defaultColor,
      });
    }
    if (revisionWithLineItems.documentNumber) {
      values.push({
        label: 'documentNumber',
        value: revisionWithLineItems.documentNumber,
        color: focusedField === 'documentNumber' ? isFocusedColor : defaultColor,
      });
    }
    if (revisionWithLineItems.totalAmount) {
      values.push({
        label: 'totalAmount',
        value: revisionWithLineItems.totalAmount,
        color: focusedField === 'totalAmount' ? isFocusedColor : defaultColor,
      });
    }
    if (revisionWithLineItems.subtotal) {
      values.push({
        label: 'subtotal',
        value: revisionWithLineItems.subtotal,
        color: focusedField === 'subtotal' ? isFocusedColor : defaultColor,
      });
    }
    if (revisionWithLineItems.taxAmount) {
      values.push({
        label: 'taxAmount',
        value: revisionWithLineItems.taxAmount,
        color: focusedField === 'taxAmount' ? isFocusedColor : defaultColor,
      });
    }
    if (revisionWithLineItems.currency) {
      values.push({
        label: 'currency',
        value: revisionWithLineItems.currency,
        color: focusedField === 'currency' ? isFocusedColor : defaultColor,
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[ProcessingDetail] Field values for text layer search:', values);
    }

    return values;
  }, [revisionWithLineItems, focusedField]);

  // Navigation handlers
  const handleNavigatePrev = useCallback(() => {
    if (!navData?.prevId) return;
    router.push(`/processing/${navData.prevId}`);
  }, [navData, router]);

  const handleNavigateNext = useCallback(() => {
    if (!navData?.nextId) return;
    router.push(`/processing/${navData.nextId}`);
  }, [navData, router]);

  // Keyboard navigation (basic - before handlers are defined)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && e.altKey) {
        handleNavigatePrev();
      } else if (e.key === 'ArrowRight' && e.altKey) {
        handleNavigateNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigatePrev, handleNavigateNext]);

  // Action handlers
  const handleTriggerExtraction = async (model?: string, context?: string) => {
    try {
      await triggerExtraction.mutateAsync({ documentId: id, model, context });
      success('Extraction triggered successfully');
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to trigger extraction');
    }
  };

  // Handler to show model selector modal for extraction/re-extraction
  const handleShowModelSelector = useCallback((reExtract: boolean = false) => {
    setSelectedModel(''); // Reset selection
    setAiContext(''); // Reset context
    setSelectedStandardContexts([]); // Reset standard contexts
    setIsReExtraction(reExtract);
    setShowModelSelector(true);
  }, []);

  // Handler to confirm extraction with selected model and context
  const handleConfirmExtraction = async () => {
    setShowModelSelector(false);

    // Build full context including company context, standard contexts, and custom context
    const fullContext = [
      companyContext,
      buildFullContext(selectedStandardContexts, aiContext),
    ].filter(Boolean).join('\n\n');

    await handleTriggerExtraction(selectedModel || undefined, fullContext || undefined);

    // Reset state
    setSelectedModel('');
    setAiContext('');
    setSelectedStandardContexts([]);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/processing-documents/${id}/download`);
      if (!response.ok) {
        throw new Error('Failed to download document');
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = doc?.fileName || 'document';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          fileName = decodeURIComponent(match[1]);
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      success('Document downloaded');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to download');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await documentExport.mutateAsync({ documentId: id, includeLinked: false });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `export-${dateStr}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      success('Document exported');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to export');
    }
  };

  // Handle split document
  const handleSplitDocument = async (ranges: { pageFrom: number; pageTo: number; label: string }[]) => {
    try {
      const response = await fetch(`/api/processing-documents/${id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranges }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to split document');
      }
      const result = await response.json();
      success(`Document split into ${result.data.splitCount} parts`);
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to split document');
      throw err;
    }
  };

  const handleApproveRevision = useCallback(async () => {
    if (!data?.document || !data?.currentRevision) return;
    try {
      const isReceivable = data.currentRevision.documentCategory === 'ACCOUNTS_RECEIVABLE';
      const body = {
        aliasLearning: isReceivable
          ? { customer: (skipAliasLearning ? 'SKIP' : 'AUTO') as 'SKIP' | 'AUTO' }
          : { vendor: (skipAliasLearning ? 'SKIP' : 'AUTO') as 'SKIP' | 'AUTO' },
      };
      await approveRevision.mutateAsync({
        documentId: id,
        revisionId: data.currentRevision.id,
        lockVersion: data.document.lockVersion,
        body,
      });
      success('Revision approved');
      setShowApproveDialog(false);
      refetch();
      // Auto-advance to next document after approval
      if (navData?.nextId) {
        router.push(`/processing/${navData.nextId}`);
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to approve revision');
    }
  }, [data, skipAliasLearning, id, approveRevision, success, refetch, navData?.nextId, router, toastError]);

  const handleResolveCounterpartyAlias = async () => {
    if (!data?.document || !data?.currentRevision) return;
    const rawName = editFormData.vendorName?.trim();
    if (!rawName) {
      toastError('Please enter a vendor/customer name first');
      return;
    }

    try {
      setIsResolvingAlias(true);
      const res = await fetch(
        `/api/processing-documents/${id}/revisions/${data.currentRevision.id}/resolve-alias`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawName }),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Failed to resolve alias');
      }

      if (json?.data?.matched && json?.data?.canonicalName) {
        setEditFormData({ ...editFormData, vendorName: json.data.canonicalName });
        success('Applied saved contact name');
      } else {
        toastError('No saved match found for this name');
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to resolve alias');
    } finally {
      setIsResolvingAlias(false);
    }
  };

  const handleDeleteDocument = async () => {
    try {
      await bulkOperation.mutateAsync({
        operation: 'DELETE',
        documentIds: [id],
      });
      success('Document deleted');
      setShowDeleteDialog(false);
      // Navigate back to list
      router.push('/processing');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const handleDuplicateDecision = async (decision: 'REJECT_DUPLICATE' | 'CONFIRM_DUPLICATE' | 'MARK_AS_NEW_VERSION') => {
    if (!duplicateData?.duplicateDocument?.id) {
      toastError('No duplicate document found');
      return;
    }
    try {
      await recordDuplicateDecision.mutateAsync({
        documentId: id,
        suspectedOfId: duplicateData.duplicateDocument.id,
        decision,
      });
      success('Duplicate decision recorded');
      setShowDuplicateModal(false);
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to record decision');
    }
  };

  const handleRotationChange = useCallback(async (rotation: number, pageNumber: number) => {
    try {
      await updatePageRotation.mutateAsync({
        documentId: id,
        pageNumber,
        rotation,
      });
      // No need to show success toast for rotation - it's a quick action
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save rotation');
    }
  }, [id, updatePageRotation, toastError]);

  // Start editing a draft revision directly
  const handleStartEdit = useCallback(() => {
    if (revisionWithLineItems) {
      initializeFormDataFromRevision(revisionWithLineItems, rateLookupData?.rate);
      setDeletedLineItemIds([]); // Reset deleted items when starting edit
    }
    setIsEditing(true);
  }, [revisionWithLineItems, rateLookupData?.rate, initializeFormDataFromRevision]);

  // Start editing an approved document - only enter edit mode, don't create revision yet
  const handleEditApproved = useCallback(() => {
    if (!data?.document || !currentRevisionId || !revisionWithLineItems) return;
    // Initialize form data from current revision (with home currency calculation)
    initializeFormDataFromRevision(revisionWithLineItems, rateLookupData?.rate);
    setDeletedLineItemIds([]);
    // Mark that we're editing an approved document (revision will be created on save)
    setIsEditingApproved(true);
    setIsEditing(true);
  }, [data?.document, currentRevisionId, revisionWithLineItems, rateLookupData?.rate, initializeFormDataFromRevision]);

  const handleSaveEdit = useCallback(async () => {
    if (!data?.document || !currentRevisionId) return;
    try {
      let targetRevisionId = currentRevisionId;
      let lockVersion = data.document.lockVersion;

      // If editing an approved document, create a new revision first
      if (isEditingApproved) {
        const result = await createRevision.mutateAsync({
          documentId: id,
          lockVersion,
          input: {
            basedOnRevisionId: currentRevisionId,
            reason: 'Edit approved document',
          },
        });
        targetRevisionId = result.revision.id;
        lockVersion = result.document.lockVersion;
        success(`Created new draft revision #${result.revision.revisionNumber}`);
      }

      // Now update the revision with the changes
      // For new revisions from approved docs, we need to exclude item IDs since they're new copies
      await updateRevision.mutateAsync({
        documentId: id,
        revisionId: targetRevisionId,
        lockVersion,
        data: {
          headerUpdates: {
            documentCategory: editFormData.documentCategory || undefined,
            documentSubCategory: editFormData.documentSubCategory || undefined,
            vendorName: editFormData.vendorName || undefined,
            documentNumber: editFormData.documentNumber || undefined,
            documentDate: editFormData.documentDate || undefined,
            dueDate: editFormData.dueDate || undefined,
            currency: editFormData.currency || undefined,
            subtotal: editFormData.subtotal || undefined,
            taxAmount: editFormData.taxAmount || undefined,
            totalAmount: editFormData.totalAmount || undefined,
            // Phase 2: Home currency header fields
            homeCurrency: editFormData.homeCurrency || undefined,
            homeExchangeRate: editFormData.homeExchangeRate || undefined,
            homeSubtotal: editFormData.homeSubtotal || undefined,
            homeTaxAmount: editFormData.homeTaxAmount || undefined,
            homeEquivalent: editFormData.homeTotal || undefined,
            isHomeExchangeRateOverride: editFormData.isHomeExchangeRateOverride,
          },
          itemsToUpsert: editLineItems.map((item) => ({
            // For new revisions from approved docs, don't pass old IDs
            id: isEditingApproved ? undefined : item.id,
            lineNo: item.lineNo,
            description: item.description,
            quantity: item.quantity || undefined,
            unitPrice: item.unitPrice || undefined,
            amount: item.amount,
            gstAmount: item.gstAmount || undefined,
            taxCode: item.taxCode || undefined,
            accountCode: item.accountCode || undefined,
            // Phase 2: Home currency line item fields
            homeAmount: item.homeAmount || undefined,
            homeGstAmount: item.homeGstAmount || undefined,
            isHomeAmountOverride: item.isHomeAmountOverride,
            isHomeGstOverride: item.isHomeGstOverride,
          })),
          // For new revisions, don't pass deleted items since they're fresh copies
          itemsToDelete: isEditingApproved ? undefined : (deletedLineItemIds.length > 0 ? deletedLineItemIds : undefined),
        },
      });
      success('Changes saved successfully');
      setIsEditing(false);
      setIsEditingApproved(false);
      setDeletedLineItemIds([]); // Reset deleted items tracking
      refetch();
      refetchLineItems();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  }, [
    data?.document,
    currentRevisionId,
    isEditingApproved,
    id,
    editFormData,
    editLineItems,
    deletedLineItemIds,
    createRevision,
    updateRevision,
    success,
    toastError,
    refetch,
    refetchLineItems,
  ]);

  const handleRevalidate = useCallback(async () => {
    if (!displayRevisionId) return;
    try {
      setIsRevalidating(true);
      const response = await fetch(`/api/processing-documents/${id}/revisions/${displayRevisionId}?revalidate=true`);
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error?.message || 'Failed to revalidate');
      }
      const result = await response.json();
      const updated = result.data;

      queryClient.setQueryData(['revision-line-items', id, displayRevisionId, false], updated);
      queryClient.setQueryData(['revision-line-items', id, displayRevisionId, true], updated);

      success('Revalidation complete');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to revalidate');
    } finally {
      setIsRevalidating(false);
    }
  }, [displayRevisionId, id, queryClient, success, toastError]);

  const handleAddLineItem = () => {
    const maxLineNo = editLineItems.reduce((max, item) => Math.max(max, item.lineNo), 0);
    setEditLineItems([
      ...editLineItems,
      {
        lineNo: maxLineNo + 1,
        description: '',
        quantity: '',
        unitPrice: '',
        amount: '0',
        gstAmount: '',
        taxCode: 'SR', // Default to 9% GST
        accountCode: '',
        // Phase 2: Home currency defaults for new line items
        homeAmount: '',
        homeGstAmount: '',
        isHomeAmountOverride: false,
        isHomeGstOverride: false,
      },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    const itemToRemove = editLineItems[index];
    // Track the deleted item ID if it exists (i.e., it was saved before)
    if (itemToRemove.id) {
      setDeletedLineItemIds((prev) => [...prev, itemToRemove.id!]);
    }
    const updated = editLineItems.filter((_, i) => i !== index);
    setEditLineItems(updated);
  };

  const handleLineItemChange = (index: number, field: string, value: string) => {
    const updated = [...editLineItems];
    updated[index] = { ...updated[index], [field]: value };

    const exchangeRate = parseFloat(editFormData.homeExchangeRate) || 1;
    const isSameCurrency = editFormData.currency === editFormData.homeCurrency;

    // Auto-calculate amount when qty or unitPrice changes
    if (field === 'quantity' || field === 'unitPrice') {
      const qty = parseFloat(field === 'quantity' ? value : updated[index].quantity) || 0;
      const unitPrice = parseFloat(field === 'unitPrice' ? value : updated[index].unitPrice) || 0;
      // Allow negative unitPrice for credit notes (qty=1, unitPrice=-5.12 => amount=-5.12)
      if (qty !== 0 && unitPrice !== 0) {
        const calculatedAmount = qty * unitPrice;
        updated[index].amount = calculatedAmount.toFixed(2);
      }
    }

    // Auto-calculate GST amount when amount or taxCode changes
    if (field === 'amount' || field === 'taxCode' || field === 'quantity' || field === 'unitPrice') {
      const amount = parseFloat(updated[index].amount) || 0;
      const taxCode = field === 'taxCode' ? value : updated[index].taxCode;
      const rate = getGstRate(taxCode);
      const gstAmount = amount * rate;
      // Use !== 0 to handle negative amounts (credit notes) correctly
      updated[index].gstAmount = gstAmount !== 0 ? gstAmount.toFixed(2) : '';
    }

    // Auto-calculate home currency amounts when document currency amounts change
    // (unless user has manually overridden home amounts)
    if (!isSameCurrency) {
      if (field === 'amount' || field === 'quantity' || field === 'unitPrice') {
        // Only auto-calculate if not manually overridden
        if (!updated[index].isHomeAmountOverride) {
          const amount = parseFloat(updated[index].amount) || 0;
          updated[index].homeAmount = (amount * exchangeRate).toFixed(2);
        }
      }
      if (field === 'gstAmount' || field === 'amount' || field === 'taxCode' || field === 'quantity' || field === 'unitPrice') {
        // Only auto-calculate if not manually overridden
        if (!updated[index].isHomeGstOverride) {
          const gstAmount = parseFloat(updated[index].gstAmount) || 0;
          updated[index].homeGstAmount = (gstAmount * exchangeRate).toFixed(2);
        }
      }
      // When user manually edits home amounts, set override flag
      if (field === 'homeAmount') {
        updated[index].isHomeAmountOverride = true;
      }
      if (field === 'homeGstAmount') {
        updated[index].isHomeGstOverride = true;
      }
    }

    setEditLineItems(updated);
  };

  // Recalculate all line items when exchange rate changes
  // Note: editLineItems is intentionally excluded from deps to prevent infinite loops
  // The hasChanges check prevents unnecessary re-renders
  useEffect(() => {
    if (!isEditing || editLineItems.length === 0) return;

    const exchangeRate = parseFloat(editFormData.homeExchangeRate) || 1;
    const isSameCurrency = editFormData.currency === editFormData.homeCurrency;

    if (isSameCurrency) return;

    // Recalculate home amounts for all line items that aren't manually overridden
    const updated = editLineItems.map((item) => {
      const newItem = { ...item };
      if (!item.isHomeAmountOverride) {
        const amount = parseFloat(item.amount) || 0;
        newItem.homeAmount = (amount * exchangeRate).toFixed(2);
      }
      if (!item.isHomeGstOverride) {
        const gstAmount = parseFloat(item.gstAmount) || 0;
        newItem.homeGstAmount = (gstAmount * exchangeRate).toFixed(2);
      }
      return newItem;
    });

    // Only update if there are actual changes to prevent infinite loops
    const hasChanges = updated.some((item, idx) =>
      item.homeAmount !== editLineItems[idx].homeAmount ||
      item.homeGstAmount !== editLineItems[idx].homeGstAmount
    );

    if (hasChanges) {
      setEditLineItems(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFormData.homeExchangeRate, editFormData.currency, editFormData.homeCurrency, isEditing]);

  // Recalculate header totals when line items change
  // This ensures subtotal, taxAmount, homeSubtotal, and homeTaxAmount stay in sync with line items
  useEffect(() => {
    if (!isEditing || editLineItems.length === 0) return;

    // Sum up line item amounts and GST amounts (document currency)
    const subtotalSum = editLineItems.reduce((sum, item) => {
      const amount = parseFloat(item.amount) || 0;
      return sum + amount;
    }, 0);

    const taxSum = editLineItems.reduce((sum, item) => {
      const gstAmount = parseFloat(item.gstAmount) || 0;
      return sum + gstAmount;
    }, 0);

    // Sum up line item home amounts and home GST amounts
    const homeSubtotalSum = editLineItems.reduce((sum, item) => {
      const homeAmount = parseFloat(item.homeAmount) || 0;
      return sum + homeAmount;
    }, 0);

    const homeTaxSum = editLineItems.reduce((sum, item) => {
      const homeGstAmount = parseFloat(item.homeGstAmount) || 0;
      return sum + homeGstAmount;
    }, 0);

    const newSubtotal = subtotalSum.toFixed(2);
    const newTaxAmount = taxSum.toFixed(2);
    const newTotalAmount = (subtotalSum + taxSum).toFixed(2);
    const newHomeSubtotal = homeSubtotalSum.toFixed(2);
    const newHomeTaxAmount = homeTaxSum.toFixed(2);
    const newHomeTotal = (homeSubtotalSum + homeTaxSum).toFixed(2);

    // Use functional update to compare with current state and avoid stale closures
    setEditFormData((prev) => {
      // Only update if values have changed to prevent infinite loops
      if (newSubtotal !== prev.subtotal ||
          newTaxAmount !== prev.taxAmount ||
          newTotalAmount !== prev.totalAmount ||
          newHomeSubtotal !== prev.homeSubtotal ||
          newHomeTaxAmount !== prev.homeTaxAmount ||
          newHomeTotal !== prev.homeTotal) {
        return {
          ...prev,
          subtotal: newSubtotal,
          taxAmount: newTaxAmount,
          totalAmount: newTotalAmount,
          homeSubtotal: newHomeSubtotal,
          homeTaxAmount: newHomeTaxAmount,
          homeTotal: newHomeTotal,
        };
      }
      return prev; // Return same reference if no changes
    });
  }, [editLineItems, isEditing]);

  // Hotkeys effect (after all handler definitions)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip hotkeys when typing in inputs (except for Escape and modal hotkeys)
      const isInInput = e.target instanceof HTMLInputElement ||
                        e.target instanceof HTMLSelectElement ||
                        e.target instanceof HTMLTextAreaElement;

      // Handle approval modal hotkeys first (F1 to confirm, Escape to cancel)
      if (showApproveDialog) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowApproveDialog(false);
          return;
        }
        if (e.key === 'F1' && !approveRevision.isPending) {
          e.preventDefault();
          handleApproveRevision();
          return;
        }
        return; // Block other hotkeys when modal is open
      }

      // Escape - Cancel editing (works even in input fields)
      if (e.key === 'Escape' && isEditing) {
        e.preventDefault();
        setIsEditing(false);
        setIsEditingApproved(false);
        setDeletedLineItemIds([]);
        return;
      }

      // Escape - Go back to processing page (when not editing, not in modal, not in input)
      if (e.key === 'Escape' && !isEditing && !isInInput) {
        e.preventDefault();
        router.push('/processing');
        return;
      }

      // Skip other hotkeys when in input fields
      if (isInInput) return;

      // Skip action hotkeys if data not loaded
      if (!data) return;

      const currentRev = data.currentRevision;
      const doc = data.document;
      const canApproveNow = currentRev?.status === 'DRAFT' &&
        (doc.duplicateStatus === 'NONE' || doc.duplicateStatus === 'REJECTED');

      // F1 - Approve (when viewing, not editing)
      if (e.key === 'F1') {
        e.preventDefault();
        if (!isEditing && !isViewingSnapshot && canApproveNow && can.updateDocument) {
          setSkipAliasLearning(false);
          setShowApproveDialog(true);
        }
      }

      // F2 - Edit
      if (e.key === 'F2') {
        e.preventDefault();
        if (!isViewingSnapshot && !isEditing && can.updateDocument) {
          if (currentRev?.status === 'DRAFT') {
            handleStartEdit();
          } else if (currentRev?.status === 'APPROVED') {
            handleEditApproved();
          }
        }
      }

      // F3 - Save (when editing)
      if (e.key === 'F3') {
        e.preventDefault();
        if (isEditing && !updateRevision.isPending) {
          handleSaveEdit();
        }
      }

      // F4 - Re-extract (when editing)
      if (e.key === 'F4') {
        e.preventDefault();
        if (isEditing && !triggerExtraction.isPending) {
          handleShowModelSelector(true);
        }
      }
    };
    // Use capture phase to intercept F3/F4 before browser handles them
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    isEditing,
    isViewingSnapshot,
    data,
    can.updateDocument,
    updateRevision.isPending,
    triggerExtraction.isPending,
    handleStartEdit,
    handleEditApproved,
    handleSaveEdit,
    handleShowModelSelector,
    showApproveDialog,
    approveRevision.isPending,
    handleApproveRevision,
    router,
  ]);

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-6 h-6 animate-spin text-oak-light" />
        <span className="ml-3 text-text-secondary">Loading document...</span>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="p-6">
        <div className="card p-6 border-status-error bg-status-error/5">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load document'}</p>
          </div>
          <Link href="/processing" className="btn-secondary btn-sm mt-4 inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </Link>
        </div>
      </div>
    );
  }

  const { document: doc, currentRevision } = data;
  const pipelineConfig = pipelineStatusConfig[doc.pipelineStatus];
  const duplicateConfig = duplicateStatusConfig[doc.duplicateStatus];

  const canTriggerExtraction =
    doc.pipelineStatus === 'UPLOADED' ||
    doc.pipelineStatus === 'QUEUED' ||
    doc.pipelineStatus === 'FAILED_RETRYABLE';

  const canApprove =
    currentRevision?.status === 'DRAFT' &&
    (doc.duplicateStatus === 'NONE' || doc.duplicateStatus === 'REJECTED');

  const needsDuplicateDecision = doc.duplicateStatus === 'SUSPECTED' && currentRevision?.status === 'DRAFT';

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-background-primary flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/processing" className="btn-ghost btn-sm p-2" title="Back to list (Esc)">
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Document Navigation */}
          {navData && navData.total > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleNavigatePrev}
                disabled={!navData.prevId}
                className="btn-ghost btn-xs p-1.5"
                title="Previous document (Alt+Left)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-text-secondary whitespace-nowrap" title="Documents pending approval">
                {navData.currentIndex + 1} / {navData.total} Pending approval
              </span>
              <button
                onClick={handleNavigateNext}
                disabled={!navData.nextId}
                className="btn-ghost btn-xs p-1.5"
                title="Next document (Alt+Right)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-border-primary mx-1" />

          <h1 className="text-sm font-medium text-text-primary truncate flex-1 min-w-0" title={doc.fileName}>
            {doc.fileName || 'Processing Document'}
          </h1>
          {doc.version > 1 && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-status-info/10 text-status-info">
              v{doc.version}
            </span>
          )}
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', pipelineConfig.bgColor, pipelineConfig.color)}>
            {pipelineConfig.label}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Hide action buttons when viewing snapshot - only show Exit Snapshot in banner */}
          {!isViewingSnapshot && canTriggerExtraction && can.updateDocument && (
            <button
              onClick={() => handleShowModelSelector(false)}
              disabled={triggerExtraction.isPending}
              className="btn-secondary btn-sm"
            >
              {triggerExtraction.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              Extract
            </button>
          )}
          {/* Split button - only show for multi-page documents */}
          {!isViewingSnapshot && (data?.document?.pageCount || 0) > 1 && can.updateDocument && (
            <button
              onClick={() => setShowSplitterModal(true)}
              className="btn-secondary btn-sm"
              title="Split document into multiple parts"
            >
              <Scissors className="w-3.5 h-3.5 mr-1.5" />
              Split
            </button>
          )}
          {!isViewingSnapshot && isEditing ? (
            <>
              <button onClick={() => { setIsEditing(false); setIsEditingApproved(false); setDeletedLineItemIds([]); }} className="btn-ghost btn-sm" title="Cancel editing (Esc)">
                Cancel (Esc)
              </button>
              <button
                onClick={() => handleShowModelSelector(true)}
                disabled={triggerExtraction.isPending}
                className="btn-secondary btn-sm"
                title="Re-run AI extraction with model selection (F4)"
              >
                {triggerExtraction.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                Re-extract (F4)
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updateRevision.isPending}
                className="btn-primary btn-sm"
                title="Save changes (F3)"
              >
                {updateRevision.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                )}
                Save (F3)
              </button>
            </>
          ) : !isViewingSnapshot ? (
            <>
              {/* Edit button for DRAFT revisions - edits directly */}
              {currentRevision?.status === 'DRAFT' && can.updateDocument && (
                <button onClick={handleStartEdit} className="btn-secondary btn-sm" title="Edit document (F2)">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit (F2)
                </button>
              )}
              {/* Edit button for APPROVED revisions - creates new draft revision */}
              {currentRevision?.status === 'APPROVED' && can.updateDocument && (
                <button
                  onClick={handleEditApproved}
                  disabled={createRevision.isPending}
                  className="btn-secondary btn-sm"
                  title="Create a new draft revision from the approved document (F2)"
                >
                  {createRevision.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Edit (F2)
                </button>
              )}
              {canApprove && can.updateDocument && (
                <button
                  onClick={() => {
                    setSkipAliasLearning(false);
                    setShowApproveDialog(true);
                  }}
                  className="btn-primary btn-sm"
                  title="Approve document (F1)"
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Approve (F1)
                </button>
              )}
              {/* Download and Export buttons */}
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="btn-ghost btn-sm"
                title="Download document"
              >
                {isDownloading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleExport}
                disabled={documentExport.isPending}
                className="btn-ghost btn-sm"
                title="Export to Excel"
              >
                {documentExport.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
              </button>
            </>
          ) : null}
          {!isViewingSnapshot && can.deleteDocument && (
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="btn-ghost btn-sm text-status-error hover:bg-status-error/10"
              title="Delete document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => refetch()} className="btn-ghost btn-sm p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Duplicate Warning Banner */}
      {needsDuplicateDecision && !isViewingSnapshot && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              This document is suspected to be a duplicate
            </span>
          </div>
          <button
            onClick={() => setShowDuplicateModal(true)}
            className="btn-secondary btn-sm border-yellow-500 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Compare
          </button>
        </div>
      )}

      {/* Snapshot Viewing Banner */}
      {isViewingSnapshot && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Viewing Historical Snapshot: Revision #{viewingSnapshotNumber}
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400">
              (Read-only)
            </span>
          </div>
          <button
            onClick={handleExitSnapshot}
            className="btn-secondary btn-sm border-blue-500 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
          >
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Exit Snapshot
          </button>
        </div>
      )}

      {/* Main Content - Vertical Split: Top (Preview + Header) | Bottom (Line Items) */}
      <div className="flex-1 overflow-hidden">
        <VerticalSplitView
          defaultTopHeight={75}
          minTopHeight={40}
          maxTopHeight={85}
          topPanel={
            <ResizableSplitView
              leftPanel={
                <DocumentPageViewer
                  documentId={id}
                  pdfUrl={pagesData?.pdfUrl || undefined}
                  highlights={highlights}
                  fieldValues={fieldValues}
                  className="h-full"
                  onRotationChange={handleRotationChange}
                  documentStatus={currentRevision?.status}
                  onPagesChanged={refetch}
                />
              }
              rightPanel={
                <div className="h-full overflow-y-auto bg-background-primary p-4">
                  {/* Header Information Section */}
                  {!currentRevision ? (
                    <NoExtractionPlaceholder
                      canTrigger={canTriggerExtraction}
                      isPending={triggerExtraction.isPending}
                      pipelineStatus={doc.pipelineStatus}
                      onTrigger={handleTriggerExtraction}
                    />
                  ) : (
                    <div className="space-y-4">
                      {/* Section Header - Company Name - Full width like PDF toolbar */}
                      <div className="-mx-4 -mt-4 px-4 py-3 bg-background-tertiary border-b border-border-primary">
                        <span className="text-sm font-medium text-text-primary">
                          {doc.company?.name || 'Unassigned Company'}
                        </span>
                      </div>

                      {/* Tags Section - Above document type, always editable */}
                      <div className="pt-2">
                        <DocumentTags
                          documentId={id}
                          companyId={doc.company?.id || null}
                          tenantId={activeTenantId}
                          initialTags={initialTags}
                        />
                      </div>

                      {/* Header Fields */}
                      <div className="max-w-2xl space-y-4">
                      <ExtractedHeaderFields
                        revision={revisionWithLineItems || currentRevision}
                        isEditing={isEditing}
                        editFormData={editFormData}
                        setEditFormData={setEditFormData}
                        onResolveAlias={handleResolveCounterpartyAlias}
                        isResolvingAlias={isResolvingAlias}
                        disableResolveAlias={approveRevision.isPending}
                        focusedField={focusedField}
                        setFocusedField={setFocusedField}
                        getFieldConfidence={getFieldConfidence}
                        categoryLabels={categoryLabels}
                      />

                      {/* Amounts Section - Combined document and home currency */}
                      <AmountsSection
                        documentCurrency={revisionWithLineItems?.currency || currentRevision.currency}
                        documentSubtotal={revisionWithLineItems?.subtotal || null}
                        documentTaxAmount={revisionWithLineItems?.taxAmount || null}
                        documentTotalAmount={revisionWithLineItems?.totalAmount || currentRevision.totalAmount}
                        isEditing={isEditing}
                        editFormData={editFormData}
                        setEditFormData={setEditFormData}
                        currencyOptions={currencyOptions}
                        focusedField={focusedField}
                        setFocusedField={setFocusedField}
                        getFieldConfidence={getFieldConfidence}
                        tenantId={data?.document?.tenantId}
                        validationIssues={(revisionWithLineItems?.validationIssues as { issues?: ValidationIssue[] })?.issues}
                      />

                      {/* Validation Status */}
                      {revisionWithLineItems?.validationStatus && revisionWithLineItems.validationStatus !== 'PENDING' && (
                        <div className="pt-2">
                          <ValidationStatusSection
                            status={revisionWithLineItems.validationStatus}
                            issues={(revisionWithLineItems.validationIssues as { issues?: ValidationIssue[] })?.issues}
                          />
                        </div>
                      )}

                      {/* Document Links - Only show when not viewing a snapshot */}
                      {!isViewingSnapshot && (
                        <DocumentLinks
                          documentId={id}
                          canUpdate={can.updateDocument}
                        />
                      )}
                      </div>
                    </div>
                  )}
                </div>
              }
              defaultLeftWidth={70}
              minLeftWidth={50}
              maxLeftWidth={80}
            />
          }
          bottomPanel={
            <div className="overflow-auto bg-background-primary">
              {currentRevision && (
                <LineItemsSection
                  lineItems={isEditing ? editLineItems : revisionWithLineItems?.lineItems}
                  isEditing={isEditing}
                  isLoading={lineItemsLoading}
                  currency={isEditing ? editFormData.currency : (revisionWithLineItems?.currency || currentRevision.currency)}
                  homeCurrency={isEditing ? editFormData.homeCurrency : (revisionWithLineItems?.homeCurrency || 'SGD')}
                  exchangeRate={parseFloat(editFormData.homeExchangeRate) || 1}
                  chartOfAccounts={chartOfAccounts}
                  onAdd={handleAddLineItem}
                  onRemove={handleRemoveLineItem}
                  onChange={handleLineItemChange}
                  fullWidth
                  validationIssues={(revisionWithLineItems?.validationIssues as { issues?: ValidationIssue[] })?.issues}
                />
              )}
            </div>
          }
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border-primary bg-background-tertiary text-xs flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="text-text-muted">Pipeline:</span>
            <span className={cn('font-medium', pipelineConfig.color)}>{pipelineConfig.label}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-text-muted">Duplicate:</span>
            <span className={cn('font-medium', duplicateConfig.color)}>{duplicateConfig.label}</span>
          </span>
          {currentRevision && (
            <span className="flex items-center gap-1.5">
              <span className="text-text-muted">Revision:</span>
              <span className={cn('font-medium', revisionStatusConfig[currentRevision.status].color)}>
                #{currentRevision.revisionNumber} {revisionStatusConfig[currentRevision.status].label}
              </span>
            </span>
          )}
        </div>

        {/* History Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
          >
            <History className="w-3.5 h-3.5" />
            <span>History</span>
            <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', showHistoryDropdown && 'rotate-90')} />
          </button>

          {showHistoryDropdown && (
            <HistoryDropdown
              revisions={revisions}
              isLoading={revisionsLoading}
              onClose={() => setShowHistoryDropdown(false)}
              categoryLabels={categoryLabels}
              currentRevisionId={currentRevisionId}
              viewingSnapshotId={viewingSnapshotId}
              onViewSnapshot={handleViewSnapshot}
              onExitSnapshot={handleExitSnapshot}
            />
          )}
        </div>
      </div>

      {/* Approve Dialog */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        onClose={() => setShowApproveDialog(false)}
        onConfirm={handleApproveRevision}
        title="Approve Revision"
        description={(
          <>
            Are you sure you want to approve Revision #{currentRevision?.revisionNumber}?
            <br />
            This will mark it as the official record.
          </>
        )}
        confirmLabel="Approve (F1)"
        cancelLabel="Cancel (Esc)"
        variant="info"
        isLoading={approveRevision.isPending}
      >
        <Toggle
          size="sm"
          checked={skipAliasLearning}
          onChange={setSkipAliasLearning}
          disabled={approveRevision.isPending}
          label="Don't learn this contact name correction"
          className="pt-1"
        />
      </ConfirmDialog>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDeleteDocument}
        title="Delete Document"
        description={`Are you sure you want to delete "${doc.fileName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={bulkOperation.isPending}
      />

      {/* AI Model Selector Modal - Matching Upload Page */}
      <Modal
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        title={isReExtraction ? 'Re-extract Document' : 'Extract Document'}
        description={isReExtraction
          ? 'Re-run AI extraction on this document. This will replace the current extraction results.'
          : 'Run AI extraction to automatically extract data from this document.'
        }
        size="2xl"
      >
        <ModalBody>
          <div className="space-y-4">
            {/* Company Context - Auto-populated, read-only */}
            <div className="card p-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <label className="label mb-1 text-sm">Company Context</label>
                  <textarea
                    value={companyContext}
                    readOnly
                    disabled
                    rows={3}
                    placeholder="Loading company context..."
                    className="input w-full text-sm resize-none mt-2 px-3 py-2.5 bg-background-tertiary cursor-default"
                  />
                  <p className="text-xs text-text-muted mt-2.5 leading-relaxed">
                    Auto-populated from the selected company. This information helps the AI understand the business context.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Model Selector - Matching Upload Page */}
            <AIModelSelector
              value={selectedModel}
              onChange={setSelectedModel}
              label="AI Model for Extraction"
              helpText="Select the AI model to use for extracting invoice/receipt data."
              jsonModeOnly
              showContextInput
              contextValue={aiContext}
              onContextChange={setAiContext}
              contextLabel="Additional Context (Optional)"
              contextPlaceholder="E.g., 'Focus on line items and totals' or 'This is a foreign currency invoice'"
              contextHelpText="Provide your own hints to help the AI extract data more accurately."
              showStandardContexts
              selectedStandardContexts={selectedStandardContexts}
              onStandardContextsChange={setSelectedStandardContexts}
              tenantId={activeTenantId || undefined}
              className="mb-0"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowModelSelector(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirmExtraction}
            isLoading={triggerExtraction.isPending}
          >
            {isReExtraction ? (
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5" />
            )}
            {isReExtraction ? 'Re-extract' : 'Extract'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Duplicate Comparison Modal */}
      {/* Document Splitter Modal */}
      {showSplitterModal && data?.document && (
        <DocumentSplitterModal
          isOpen={showSplitterModal}
          onClose={() => setShowSplitterModal(false)}
          onConfirm={handleSplitDocument}
          documentId={id}
          fileName={data?.document?.fileName || 'Document'}
          totalPages={data?.document?.pageCount || 1}
        />
      )}

      {showDuplicateModal && duplicateData && (
        <DuplicateComparisonModal
          isOpen={showDuplicateModal}
          onClose={() => setShowDuplicateModal(false)}
          currentDocument={{
            id: duplicateData.currentDocument.id,
            fileName: duplicateData.currentDocument.fileName,
            pipelineStatus: duplicateData.currentDocument.pipelineStatus,
            approvalStatus: duplicateData.currentDocument.approvalStatus,
            createdAt: duplicateData.currentDocument.createdAt,
            pdfUrl: duplicateData.currentDocument.pdfUrl,
            pages: duplicateData.currentDocument.pages,
          }}
          duplicateDocument={{
            id: duplicateData.duplicateDocument.id,
            fileName: duplicateData.duplicateDocument.fileName,
            pipelineStatus: duplicateData.duplicateDocument.pipelineStatus,
            approvalStatus: duplicateData.duplicateDocument.approvalStatus,
            createdAt: duplicateData.duplicateDocument.createdAt,
            pdfUrl: duplicateData.duplicateDocument.pdfUrl,
            pages: duplicateData.duplicateDocument.pages,
          }}
          duplicateScore={duplicateData.comparison.duplicateScore || undefined}
          duplicateReason={duplicateData.comparison.duplicateReason || undefined}
          fieldComparison={duplicateData.comparison.fieldComparison}
          onDecision={handleDuplicateDecision}
          isSubmitting={recordDuplicateDecision.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function NoExtractionPlaceholder({
  canTrigger,
  isPending,
  pipelineStatus,
  onTrigger,
}: {
  canTrigger: boolean;
  isPending: boolean;
  pipelineStatus: string;
  onTrigger: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <AlertCircle className="w-12 h-12 text-text-muted opacity-50 mb-4" />
      <h3 className="text-lg font-semibold text-text-primary mb-2">No Extracted Data</h3>
      <p className="text-sm text-text-muted mb-6 max-w-sm">
        {canTrigger
          ? 'This document has not been extracted yet. Click the button below to extract data from this document.'
          : pipelineStatus === 'PROCESSING'
          ? 'Extraction is currently in progress...'
          : 'Extraction is not available for this document status.'}
      </p>
      {canTrigger && (
        <button onClick={() => onTrigger()} disabled={isPending} className="btn-primary btn-sm">
          {isPending ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
              Extracting...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Trigger Extraction
            </>
          )}
        </button>
      )}
    </div>
  );
}

function ExtractedHeaderFields({
  revision,
  isEditing,
  editFormData,
  setEditFormData,
  onResolveAlias,
  isResolvingAlias,
  disableResolveAlias,
  focusedField,
  setFocusedField,
  getFieldConfidence,
  categoryLabels,
}: {
  revision: {
    documentCategory: DocumentCategory | null;
    documentSubCategory?: string | null;
    vendorName: string | null;
    documentNumber: string | null;
    documentDate: string | null;
    dueDate?: string | null;
    currency: string;
    subtotal?: string | null;
    taxAmount?: string | null;
    totalAmount: string;
  };
  isEditing: boolean;
  editFormData: {
    documentCategory: string;
    documentSubCategory: string;
    vendorName: string;
    documentNumber: string;
    documentDate: string;
    dueDate: string;
    currency: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    supplierGstNo: string;
    homeCurrency: string;
    homeExchangeRate: string;
    homeSubtotal: string;
    homeTaxAmount: string;
    homeTotal: string;
    isHomeExchangeRateOverride: boolean;
  };
  setEditFormData: React.Dispatch<React.SetStateAction<{
    documentCategory: string;
    documentSubCategory: string;
    vendorName: string;
    documentNumber: string;
    documentDate: string;
    dueDate: string;
    currency: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    supplierGstNo: string;
    homeCurrency: string;
    homeExchangeRate: string;
    homeSubtotal: string;
    homeTaxAmount: string;
    homeTotal: string;
    isHomeExchangeRateOverride: boolean;
  }>>;
  onResolveAlias?: () => void;
  isResolvingAlias?: boolean;
  disableResolveAlias?: boolean;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  getFieldConfidence: (key: string) => number | undefined;
  categoryLabels: Record<DocumentCategory, string>;
}) {
  const handleFieldFocus = (fieldKey: string) => setFocusedField(fieldKey);
  const handleFieldBlur = () => setFocusedField(null);

  if (isEditing) {
    return (
      <div className="card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <FileStack className="w-4 h-4" />
          Extracted Data
        </h3>

        {/* Classification */}
        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border-secondary">
          <div>
            <label className="block text-xs text-text-muted mb-1">Category</label>
            <SearchableSelect
              options={Object.entries(categoryLabels).map(([key, label]) => ({
                value: key,
                label: label,
              }))}
              value={editFormData.documentCategory}
              onChange={(value) => setEditFormData({
                ...editFormData,
                documentCategory: value,
                documentSubCategory: '',
              })}
              placeholder="Select category..."
              clearable={false}
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Sub-category</label>
            <SearchableSelect
              options={editFormData.documentCategory
                ? getSubCategoryOptions(editFormData.documentCategory as DocumentCategory).map(({ value, label }) => ({
                    value,
                    label,
                  }))
                : []
              }
              value={editFormData.documentSubCategory}
              onChange={(value) => setEditFormData({ ...editFormData, documentSubCategory: value })}
              placeholder="Select sub-category..."
              disabled={!editFormData.documentCategory}
              clearable={false}
            />
          </div>
        </div>

        {/* Key Identification */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">
              {editFormData.documentCategory === 'ACCOUNTS_RECEIVABLE' ? 'Customer' : 'Vendor'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editFormData.vendorName}
                onChange={(e) => setEditFormData({ ...editFormData, vendorName: e.target.value })}
                className="flex-1 w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
                placeholder={editFormData.documentCategory === 'ACCOUNTS_RECEIVABLE' ? 'Customer name' : 'Vendor name'}
              />
              <button
                type="button"
                onClick={onResolveAlias}
                disabled={!onResolveAlias || !!isResolvingAlias || !!disableResolveAlias}
                className="btn-ghost btn-sm"
                title="Apply saved contact name"
              >
                <Link2 className={cn('w-4 h-4', isResolvingAlias && 'animate-pulse')} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Document #</label>
            <input
              type="text"
              value={editFormData.documentNumber}
              onChange={(e) => setEditFormData({ ...editFormData, documentNumber: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
              placeholder="INV-001"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Document date</label>
            <input
              type="date"
              value={editFormData.documentDate}
              onChange={(e) => setEditFormData({ ...editFormData, documentDate: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Due date</label>
            <input
              type="date"
              value={editFormData.dueDate}
              onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
            />
          </div>
        </div>
      </div>
    );
  }

  // Format document type as "Category - Subcategory"
  const documentType = revision.documentCategory
    ? revision.documentSubCategory
      ? `${categoryLabels[revision.documentCategory]} - ${SUBCATEGORY_LABELS[revision.documentSubCategory as DocumentSubCategory]}`
      : categoryLabels[revision.documentCategory]
    : 'Uncategorized';

  return (
    <div className="space-y-3">
      {/* Document Type - Full Row */}
      <FieldDisplay
        label="Document Type"
        value={documentType}
        fieldKey="documentType"
        focusedField={focusedField}
        onFocus={handleFieldFocus}
        onBlur={handleFieldBlur}
      />

      {/* Vendor and Document # */}
      <div className="grid grid-cols-2 gap-3">
        <FieldDisplay
          label="Vendor"
          value={revision.vendorName}
          fieldKey="vendorName"
          confidence={getFieldConfidence('vendorName')}
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
        <FieldDisplay
          label="Document #"
          value={revision.documentNumber}
          fieldKey="documentNumber"
          confidence={getFieldConfidence('documentNumber')}
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <FieldDisplay
          label="Document Date"
          value={formatDate(revision.documentDate)}
          fieldKey="documentDate"
          confidence={getFieldConfidence('documentDate')}
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
        <FieldDisplay
          label="Due Date"
          value={formatDate(revision.dueDate || null)}
          fieldKey="dueDate"
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
      </div>
    </div>
  );
}

function FieldDisplay({
  label,
  value,
  fieldKey,
  confidence,
  focusedField,
  onFocus,
  onBlur,
  highlight = false,
  size = 'md',
}: {
  label: string;
  value: string | null;
  fieldKey: string;
  confidence?: number;
  focusedField: string | null;
  onFocus: (key: string) => void;
  onBlur: () => void;
  highlight?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const isFocused = focusedField === fieldKey;

  return (
    <div
      className={cn(
        'py-1.5 px-2 rounded cursor-pointer transition-colors',
        isFocused ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'hover:bg-background-tertiary'
      )}
      onMouseEnter={() => onFocus(fieldKey)}
      onMouseLeave={onBlur}
    >
      <dt className="text-xs text-text-muted mb-0.5 flex items-center gap-1.5">
        {label}
        {confidence !== undefined && <ConfidenceDot confidence={confidence} size="sm" />}
      </dt>
      <dd className={cn(
        size === 'lg' ? 'text-base font-medium' : 'text-sm',
        highlight ? 'font-semibold text-text-primary' : 'text-text-primary'
      )}>
        {value || '-'}
      </dd>
    </div>
  );
}

// ============================================================================
// AmountsSection Component - Combined document and home currency amounts
// ============================================================================

interface AmountsSectionProps {
  documentCurrency: string;
  documentSubtotal: string | null;
  documentTaxAmount: string | null;
  documentTotalAmount: string;
  isEditing: boolean;
  editFormData: {
    currency: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    homeCurrency: string;
    homeExchangeRate: string;
    homeSubtotal: string;
    homeTaxAmount: string;
    homeTotal: string;
    isHomeExchangeRateOverride: boolean;
    documentDate: string;
  };
  setEditFormData: React.Dispatch<React.SetStateAction<{
    documentCategory: string;
    documentSubCategory: string;
    vendorName: string;
    documentNumber: string;
    documentDate: string;
    dueDate: string;
    currency: string;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    supplierGstNo: string;
    homeCurrency: string;
    homeExchangeRate: string;
    homeSubtotal: string;
    homeTaxAmount: string;
    homeTotal: string;
    isHomeExchangeRateOverride: boolean;
  }>>;
  currencyOptions: string[];
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  getFieldConfidence: (key: string) => number | undefined;
  tenantId?: string;
  validationIssues?: ValidationIssue[];
}

function AmountsSection({
  documentCurrency,
  documentSubtotal,
  documentTaxAmount,
  documentTotalAmount,
  isEditing,
  editFormData,
  setEditFormData,
  currencyOptions,
  focusedField,
  setFocusedField,
  getFieldConfidence,
  tenantId,
  validationIssues = [],
}: AmountsSectionProps) {
  // Use editFormData.currency for dynamic updates during editing
  const isSameCurrency = (isEditing ? editFormData.currency : documentCurrency) === editFormData.homeCurrency;

  // Helper to get validation issue for a specific field
  const getFieldValidationIssue = (fieldName: string): ValidationIssue | undefined => {
    return validationIssues.find((issue) => issue.field === fieldName);
  };

  // Check for header-level validation issues that affect amounts
  const subtotalIssue = getFieldValidationIssue('subtotal');
  const taxAmountIssue = getFieldValidationIssue('taxAmount');
  const totalAmountIssue = getFieldValidationIssue('totalAmount');
  const homeSubtotalIssue = getFieldValidationIssue('homeSubtotal');
  const homeTaxAmountIssue = getFieldValidationIssue('homeTaxAmount');
  const homeEquivalentIssue = getFieldValidationIssue('homeEquivalent');

  // Format amount helper with currency symbol (uses parentheses for negative numbers)
  const formatAmount = (value: string | null, currency?: string): string => {
    if (!value || value === '') return '-';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    const isNegative = num < 0;
    const absNum = Math.abs(num);
    const formatted = new Intl.NumberFormat('en-SG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(absNum);
    if (currency) {
      const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
      return isNegative ? `(${symbol}${formatted})` : `${symbol}${formatted}`;
    }
    return isNegative ? `(${formatted})` : formatted;
  };

  // Format exchange rate with 6 decimal places
  const formatExchangeRate = (rate: string | null | undefined): string => {
    if (!rate) return '1.000000';
    const num = parseFloat(rate);
    if (isNaN(num)) return rate;
    return num.toFixed(6);
  };

  const handleFieldFocus = (fieldKey: string) => setFocusedField(fieldKey);
  const handleFieldBlur = () => setFocusedField(null);

  // Handler for currency change - looks up exchange rate
  const handleCurrencyChange = useCallback(async (newCurrency: string) => {
    const homeCurrency = editFormData.homeCurrency;
    const isSame = newCurrency === homeCurrency;

    if (isSame) {
      // Same currency - reset exchange rate to 1 and clear home amounts
      setEditFormData((prev) => ({
        ...prev,
        currency: newCurrency,
        homeExchangeRate: '1.000000',
        isHomeExchangeRateOverride: false,
        homeSubtotal: '',
        homeTaxAmount: '',
        homeTotal: '',
      }));
      return;
    }

    // Different currency - lookup rate
    const rateDate = editFormData.documentDate || new Date().toISOString().split('T')[0];

    try {
      const searchParams = new URLSearchParams({
        currency: newCurrency,
        date: rateDate,
      });
      if (tenantId) searchParams.set('tenantId', tenantId);

      const response = await fetch(`/api/admin/exchange-rates/lookup?${searchParams}`);

      if (response.ok) {
        const rateData = await response.json();
        const rate = parseFloat(rateData.rate) || 1;
        const subtotal = parseFloat(editFormData.subtotal) || 0;
        const tax = parseFloat(editFormData.taxAmount) || 0;
        const total = subtotal + tax;

        setEditFormData((prev) => ({
          ...prev,
          currency: newCurrency,
          homeExchangeRate: rate.toFixed(6),
          isHomeExchangeRateOverride: false,
          homeSubtotal: (subtotal * rate).toFixed(2),
          homeTaxAmount: (tax * rate).toFixed(2),
          homeTotal: (total * rate).toFixed(2),
        }));
      } else {
        // Rate lookup failed - just update currency, keep rate as 1
        setEditFormData((prev) => ({
          ...prev,
          currency: newCurrency,
          homeExchangeRate: '1.000000',
          isHomeExchangeRateOverride: false,
        }));
      }
    } catch {
      // Error - just update currency
      setEditFormData((prev) => ({
        ...prev,
        currency: newCurrency,
      }));
    }
  }, [editFormData.homeCurrency, editFormData.documentDate, editFormData.subtotal, editFormData.taxAmount, tenantId, setEditFormData]);

  // Edit mode - CSS class for hiding number input spinners
  const numberInputClass = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  if (isEditing) {
    return (
      <div className="border border-border-primary rounded-lg overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-0 text-xs font-medium text-text-muted bg-background-tertiary border-b border-border-primary">
          <div className="px-3 py-2 border-r border-border-primary"></div>
          <div className="px-3 py-2 text-right border-r border-border-primary">
            <div className="text-text-muted mb-1">Document Amount</div>
            <div className="flex items-center justify-end">
              <div className="w-36 text-text-primary">
                <SearchableSelect
                  options={currencyOptions.map((curr) => ({
                    value: curr,
                    label: curr,
                  }))}
                  value={editFormData.currency}
                  onChange={handleCurrencyChange}
                  placeholder="Currency"
                  clearable={false}
                  size="sm"
                  showKeyboardHints={false}
                />
              </div>
            </div>
          </div>
          <div className={cn(
            'px-3 py-2 text-right',
            isSameCurrency && 'bg-background-secondary/50'
          )}>
            <div className={cn('text-text-muted mb-1', isSameCurrency && 'opacity-50')}>Home Amount</div>
            <div className={cn(
              'flex items-center justify-end gap-2 text-sm',
              isSameCurrency ? 'text-text-muted' : 'text-text-primary'
            )}>
              <span className="font-medium">{editFormData.homeCurrency}</span>
              {!isSameCurrency && (
                <>
                  <span>@</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={editFormData.homeExchangeRate}
                    onChange={(e) => {
                      const newRate = e.target.value;
                      const rate = parseFloat(newRate) || 1;
                      setEditFormData((prev) => ({
                        ...prev,
                        homeExchangeRate: newRate,
                        isHomeExchangeRateOverride: true,
                        // Recalculate home amounts based on new exchange rate
                        homeSubtotal: prev.subtotal ? (parseFloat(prev.subtotal) * rate).toFixed(2) : '',
                        homeTaxAmount: prev.taxAmount ? (parseFloat(prev.taxAmount) * rate).toFixed(2) : '',
                        homeTotal: prev.totalAmount ? (parseFloat(prev.totalAmount) * rate).toFixed(2) : '',
                      }));
                    }}
                    className={cn(
                      'w-24 px-1.5 py-0.5 text-sm font-mono bg-background-primary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right',
                      numberInputClass
                    )}
                    placeholder="1.000000"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Subtotal row */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-0 border-b border-border-primary">
          <div className="px-3 py-2 text-sm text-text-secondary border-r border-border-primary bg-background-secondary">
            Subtotal
          </div>
          <div className="px-3 py-1.5 border-r border-border-primary">
            <input
              type="number"
              step="0.01"
              value={editFormData.subtotal}
              onChange={(e) => {
                const newSubtotal = e.target.value;
                const subtotal = parseFloat(newSubtotal) || 0;
                const tax = parseFloat(editFormData.taxAmount) || 0;
                const newTotal = (subtotal + tax).toFixed(2);
                const rate = parseFloat(editFormData.homeExchangeRate) || 1;
                setEditFormData((prev) => ({
                  ...prev,
                  subtotal: newSubtotal,
                  totalAmount: newTotal,
                  homeSubtotal: !isSameCurrency ? (subtotal * rate).toFixed(2) : '',
                  homeTotal: !isSameCurrency ? ((subtotal + tax) * rate).toFixed(2) : '',
                }));
              }}
              className={cn(
                'w-full px-2 py-1 text-sm text-right tabular-nums bg-background-primary border border-border-primary rounded focus:border-oak-light focus:outline-none',
                numberInputClass
              )}
              placeholder="0.00"
            />
          </div>
          <div className={cn(
            'px-3 py-1.5',
            isSameCurrency && 'bg-background-secondary/50'
          )}>
            {isSameCurrency ? (
              <div className="w-full px-2 py-1 text-sm text-right tabular-nums text-text-muted">
                {editFormData.subtotal ? parseFloat(editFormData.subtotal).toFixed(2) : '-'}
              </div>
            ) : (
              <input
                type="number"
                step="0.01"
                value={editFormData.homeSubtotal}
                onChange={(e) => {
                  const newHomeSubtotal = e.target.value;
                  const homeSubtotal = parseFloat(newHomeSubtotal) || 0;
                  const homeTax = parseFloat(editFormData.homeTaxAmount) || 0;
                  setEditFormData((prev) => ({
                    ...prev,
                    homeSubtotal: newHomeSubtotal,
                    homeTotal: (homeSubtotal + homeTax).toFixed(2),
                  }));
                }}
                className={cn(
                  'w-full px-2 py-1 text-sm text-right tabular-nums bg-background-primary border border-border-primary rounded focus:border-oak-light focus:outline-none',
                  numberInputClass
                )}
                placeholder="0.00"
              />
            )}
          </div>
        </div>

        {/* Tax row */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-0 border-b border-border-primary">
          <div className="px-3 py-2 text-sm text-text-secondary border-r border-border-primary bg-background-secondary">
            Tax
          </div>
          <div className="px-3 py-1.5 border-r border-border-primary">
            <input
              type="number"
              step="0.01"
              value={editFormData.taxAmount}
              onChange={(e) => {
                const newTax = e.target.value;
                const subtotal = parseFloat(editFormData.subtotal) || 0;
                const tax = parseFloat(newTax) || 0;
                const newTotal = (subtotal + tax).toFixed(2);
                const rate = parseFloat(editFormData.homeExchangeRate) || 1;
                setEditFormData((prev) => ({
                  ...prev,
                  taxAmount: newTax,
                  totalAmount: newTotal,
                  homeTaxAmount: !isSameCurrency ? (tax * rate).toFixed(2) : '',
                  homeTotal: !isSameCurrency ? ((subtotal + tax) * rate).toFixed(2) : '',
                }));
              }}
              className={cn(
                'w-full px-2 py-1 text-sm text-right tabular-nums bg-background-primary border border-border-primary rounded focus:border-oak-light focus:outline-none',
                numberInputClass
              )}
              placeholder="0.00"
            />
          </div>
          <div className={cn(
            'px-3 py-1.5',
            isSameCurrency && 'bg-background-secondary/50'
          )}>
            {isSameCurrency ? (
              <div className="w-full px-2 py-1 text-sm text-right tabular-nums text-text-muted">
                {editFormData.taxAmount ? parseFloat(editFormData.taxAmount).toFixed(2) : '-'}
              </div>
            ) : (
              <input
                type="number"
                step="0.01"
                value={editFormData.homeTaxAmount}
                onChange={(e) => {
                  const newHomeTax = e.target.value;
                  const homeSubtotal = parseFloat(editFormData.homeSubtotal) || 0;
                  const homeTax = parseFloat(newHomeTax) || 0;
                  setEditFormData((prev) => ({
                    ...prev,
                    homeTaxAmount: newHomeTax,
                    homeTotal: (homeSubtotal + homeTax).toFixed(2),
                  }));
                }}
                className={cn(
                  'w-full px-2 py-1 text-sm text-right tabular-nums bg-background-primary border border-border-primary rounded focus:border-oak-light focus:outline-none',
                  numberInputClass
                )}
                placeholder="0.00"
              />
            )}
          </div>
        </div>

        {/* Total row - calculated, not editable */}
        <div className="grid grid-cols-[140px_1fr_1fr] gap-0 bg-background-tertiary">
          <div className="px-3 py-2 text-sm font-semibold text-text-primary border-r border-border-primary">
            Total
          </div>
          <div className="px-3 py-1.5 border-r border-border-primary bg-background-secondary/30">
            <div className="w-full px-2 py-1 text-sm text-right tabular-nums font-semibold text-text-secondary">
              {editFormData.totalAmount ? parseFloat(editFormData.totalAmount).toFixed(2) : '-'}
            </div>
          </div>
          <div className={cn(
            'px-3 py-1.5 bg-background-secondary/30',
            isSameCurrency && 'bg-background-secondary/50'
          )}>
            <div className={cn(
              'w-full px-2 py-1 text-sm text-right tabular-nums font-semibold',
              isSameCurrency ? 'text-text-muted' : 'text-text-secondary'
            )}>
              {isSameCurrency
                ? (editFormData.totalAmount ? parseFloat(editFormData.totalAmount).toFixed(2) : '-')
                : (editFormData.homeTotal ? parseFloat(editFormData.homeTotal).toFixed(2) : '-')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // View mode - clean table layout
  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[140px_1fr_1fr] gap-0 text-xs font-medium text-text-muted bg-background-tertiary border-b border-border-primary">
        <div className="px-3 py-2 border-r border-border-primary"></div>
        <div className="px-3 py-2 text-right border-r border-border-primary">
          <div className="text-text-muted">Document Amount</div>
        </div>
        <div className={cn(
          'px-3 py-2 text-right',
          isSameCurrency && 'bg-background-secondary/50'
        )}>
          <div className={cn('text-text-muted', isSameCurrency && 'opacity-50')}>Home Amount</div>
          {!isSameCurrency && (
            <div className="text-xs text-text-muted mt-0.5">
              @{formatExchangeRate(editFormData.homeExchangeRate)}
            </div>
          )}
        </div>
      </div>

      {/* Subtotal row */}
      <div
        className={cn(
          'grid grid-cols-[140px_1fr_1fr] gap-0 border-b border-border-primary transition-colors cursor-pointer',
          focusedField === 'subtotal' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'hover:bg-background-secondary/50'
        )}
        onMouseEnter={() => handleFieldFocus('subtotal')}
        onMouseLeave={handleFieldBlur}
      >
        <div className="px-3 py-2.5 text-sm text-text-secondary border-r border-border-primary flex items-center gap-1.5">
          Subtotal
          {getFieldConfidence('subtotal') !== undefined && (
            <ConfidenceDot confidence={getFieldConfidence('subtotal')!} size="sm" />
          )}
        </div>
        <div className={cn(
          'px-3 py-2.5 text-sm tabular-nums text-right border-r border-border-primary',
          subtotalIssue ? 'text-status-warning' : 'text-text-primary'
        )}>
          <span className="flex items-center justify-end gap-1">
            {subtotalIssue && (
              <span title={subtotalIssue.message}>
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
              </span>
            )}
            {formatAmount(documentSubtotal, documentCurrency)}
          </span>
        </div>
        <div className={cn(
          'px-3 py-2.5 text-sm tabular-nums text-right',
          homeSubtotalIssue ? 'text-status-warning' : isSameCurrency ? 'text-text-muted bg-background-secondary/50' : 'text-text-primary'
        )}>
          <span className="flex items-center justify-end gap-1">
            {homeSubtotalIssue && (
              <span title={homeSubtotalIssue.message}>
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
              </span>
            )}
            {formatAmount(isSameCurrency ? documentSubtotal : editFormData.homeSubtotal, editFormData.homeCurrency)}
          </span>
        </div>
      </div>

      {/* Tax row */}
      <div
        className={cn(
          'grid grid-cols-[140px_1fr_1fr] gap-0 border-b border-border-primary transition-colors cursor-pointer',
          focusedField === 'taxAmount' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'hover:bg-background-secondary/50'
        )}
        onMouseEnter={() => handleFieldFocus('taxAmount')}
        onMouseLeave={handleFieldBlur}
      >
        <div className="px-3 py-2.5 text-sm text-text-secondary border-r border-border-primary flex items-center gap-1.5">
          Tax
          {getFieldConfidence('taxAmount') !== undefined && (
            <ConfidenceDot confidence={getFieldConfidence('taxAmount')!} size="sm" />
          )}
        </div>
        <div className={cn(
          'px-3 py-2.5 text-sm tabular-nums text-right border-r border-border-primary',
          taxAmountIssue ? 'text-status-warning' : 'text-text-primary'
        )}>
          <span className="flex items-center justify-end gap-1">
            {taxAmountIssue && (
              <span title={taxAmountIssue.message}>
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
              </span>
            )}
            {formatAmount(documentTaxAmount, documentCurrency)}
          </span>
        </div>
        <div className={cn(
          'px-3 py-2.5 text-sm tabular-nums text-right',
          homeTaxAmountIssue ? 'text-status-warning' : isSameCurrency ? 'text-text-muted bg-background-secondary/50' : 'text-text-primary'
        )}>
          <span className="flex items-center justify-end gap-1">
            {homeTaxAmountIssue && (
              <span title={homeTaxAmountIssue.message}>
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
              </span>
            )}
            {formatAmount(isSameCurrency ? documentTaxAmount : editFormData.homeTaxAmount, editFormData.homeCurrency)}
          </span>
        </div>
      </div>

      {/* Total row - emphasized */}
      <div
        className={cn(
          'grid grid-cols-[140px_1fr_1fr] gap-0 bg-background-tertiary transition-colors cursor-pointer',
          focusedField === 'totalAmount' ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''
        )}
        onMouseEnter={() => handleFieldFocus('totalAmount')}
        onMouseLeave={handleFieldBlur}
      >
        <div className="px-3 py-2.5 text-sm font-semibold text-text-primary border-r border-border-primary flex items-center gap-1.5">
          Total
          {getFieldConfidence('totalAmount') !== undefined && (
            <ConfidenceDot confidence={getFieldConfidence('totalAmount')!} size="sm" />
          )}
        </div>
        <div className={cn(
          'px-3 py-2.5 text-sm tabular-nums text-right font-semibold border-r border-border-primary',
          totalAmountIssue ? 'text-status-warning' : 'text-text-primary'
        )}>
          <span className="flex items-center justify-end gap-1">
            {totalAmountIssue && (
              <span title={totalAmountIssue.message}>
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
              </span>
            )}
            {formatAmount(documentTotalAmount, documentCurrency)}
          </span>
        </div>
        <div className={cn(
          'px-3 py-2.5 text-sm tabular-nums text-right font-semibold',
          homeEquivalentIssue ? 'text-status-warning' : isSameCurrency ? 'text-text-muted bg-background-secondary/50' : 'text-text-primary'
        )}>
          <span className="flex items-center justify-end gap-1">
            {homeEquivalentIssue && (
              <span title={homeEquivalentIssue.message}>
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
              </span>
            )}
            {formatAmount(isSameCurrency ? documentTotalAmount : editFormData.homeTotal, editFormData.homeCurrency)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Helper to format validation message with colored "Header" (blue) and "Line item" (green) text
function formatValidationMessage(message: string): React.ReactNode {
  // Split message by "Header" and "line item" keywords and colorize them
  const parts: React.ReactNode[] = [];
  const remaining = message;
  let key = 0;

  // Patterns to match (case-insensitive matching, preserve original case)
  const patterns = [
    { regex: /(Header\s+\w+)/gi, className: 'text-blue-600 dark:text-blue-400 font-medium' },
    { regex: /(line item\s+\w+)/gi, className: 'text-green-600 dark:text-green-400 font-medium' },
  ];

  // Process each pattern
  for (const { regex, className } of patterns) {
    const newParts: React.ReactNode[] = [];
    for (const part of parts.length === 0 ? [remaining] : parts) {
      if (typeof part !== 'string') {
        newParts.push(part);
        continue;
      }

      let lastIndex = 0;
      let match;
      regex.lastIndex = 0; // Reset regex state

      while ((match = regex.exec(part)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          newParts.push(part.slice(lastIndex, match.index));
        }
        // Add colored match
        newParts.push(
          <span key={key++} className={className}>
            {match[1]}
          </span>
        );
        lastIndex = regex.lastIndex;
      }
      // Add remaining text
      if (lastIndex < part.length) {
        newParts.push(part.slice(lastIndex));
      }
    }
    parts.length = 0;
    parts.push(...newParts);
  }

  return parts.length > 0 ? parts : message;
}

function ValidationStatusSection({
  status,
  issues,
}: {
  status: string;
  issues?: ValidationIssue[];
}) {
  if (status === 'VALID') {
    return (
      <div className="flex items-center gap-2 text-status-success px-4 py-2 bg-status-success/10 rounded-lg">
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Validation Passed</span>
      </div>
    );
  }

  const isError = status === 'INVALID';

  return (
    <div className={cn(
      'p-4 rounded-lg',
      isError ? 'bg-status-error/10' : 'bg-status-warning/10'
    )}>
      <div className="flex items-start gap-2">
        {isError ? (
          <XCircle className="w-4 h-4 text-status-error flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-status-warning flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <h4 className={cn('text-sm font-medium mb-2', isError ? 'text-status-error' : 'text-status-warning')}>
            {isError ? 'Validation Errors' : 'Validation Warnings'}
          </h4>
          {issues && issues.length > 0 ? (
            <ul className="space-y-1.5">
              {issues.map((issue, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0',
                    issue.severity === 'ERROR' ? 'bg-status-error/20 text-status-error' : 'bg-status-warning/20 text-status-warning'
                  )}>
                    {issue.severity}
                  </span>
                  <span className="text-text-secondary">
                    {formatValidationMessage(issue.message)}
                    {issue.field && <span className="text-text-muted ml-1">({issue.field})</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-secondary">No detailed validation messages available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to extract confidence from line item evidence
function getLineItemConfidence(evidenceJson: Record<string, unknown> | null): number | undefined {
  if (!evidenceJson) return undefined;
  // Check for description confidence (main confidence indicator)
  const descEvidence = evidenceJson.description as { confidence?: number } | undefined;
  const amountEvidence = evidenceJson.amount as { confidence?: number } | undefined;
  // Return average of available confidences
  const confidences: number[] = [];
  if (descEvidence?.confidence !== undefined) confidences.push(descEvidence.confidence);
  if (amountEvidence?.confidence !== undefined) confidences.push(amountEvidence.confidence);
  if (confidences.length === 0) return undefined;
  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

function LineItemsSection({
  lineItems,
  isEditing,
  isLoading,
  currency,
  homeCurrency,
  exchangeRate,
  chartOfAccounts,
  onAdd,
  onRemove,
  onChange,
  fullWidth = false,
  validationIssues = [],
}: {
  lineItems?: Array<{
    id?: string;
    lineNo: number;
    description: string;
    quantity?: string | null;
    unitPrice?: string | null;
    amount: string;
    gstAmount?: string | null;
    taxCode?: string | null;
    accountCode?: string | null;
    evidenceJson?: Record<string, unknown> | null;
    homeAmount?: string | null;
    homeGstAmount?: string | null;
  }>;
  isEditing: boolean;
  isLoading: boolean;
  currency: string;
  homeCurrency: string;
  exchangeRate: number;
  chartOfAccounts: Array<{ code: string; name: string }>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: string, value: string) => void;
  fullWidth?: boolean;
  validationIssues?: ValidationIssue[];
}) {
  const isSameCurrency = currency === homeCurrency;

  // Helper to check if a line item has GST validation issue
  const getLineItemGstIssue = (lineNo: number): ValidationIssue | undefined => {
    return validationIssues.find(
      (issue) =>
        issue.code === 'GST_CODE_AMOUNT_MISMATCH' &&
        issue.message.includes(`Line ${lineNo}:`)
    );
  };

  // Helper to get validation issue for footer totals
  const getFooterValidationIssue = (code: string): ValidationIssue | undefined => {
    return validationIssues.find((issue) => issue.code === code);
  };

  // Check for footer-level validation issues
  const lineSubtotalIssue = getFooterValidationIssue('LINE_SUM_MISMATCH');
  const lineTaxIssue = getFooterValidationIssue('LINE_GST_SUM_MISMATCH');
  const homeSubtotalIssue = getFooterValidationIssue('HOME_AMOUNT_SUM_MISMATCH');
  const homeTaxIssue = getFooterValidationIssue('HOME_GST_SUM_MISMATCH');
  const homeTotalIssue = getFooterValidationIssue('HEADER_HOME_LINE_TOTAL_MISMATCH');

  // Helper to get home amount for display (calculate if not stored)
  const getDisplayHomeAmount = (item: { amount: string; homeAmount?: string | null }): string => {
    if (isSameCurrency) return item.amount;
    if (item.homeAmount) return item.homeAmount;
    // Calculate from document amount if not stored
    const amount = parseFloat(item.amount) || 0;
    return (amount * exchangeRate).toFixed(2);
  };

  // Helper to get home GST amount for display (calculate if not stored)
  const getDisplayHomeGstAmount = (item: { gstAmount?: string | null; homeGstAmount?: string | null }): string => {
    if (isSameCurrency) return item.gstAmount || '0';
    if (item.homeGstAmount) return item.homeGstAmount;
    // Calculate from document GST amount if not stored
    const gstAmount = parseFloat(item.gstAmount || '0') || 0;
    return (gstAmount * exchangeRate).toFixed(2);
  };

  // Calculate totals from line items (authoritative source)
  const calculatedSubtotal = lineItems?.reduce((sum, item) => {
    const amount = parseFloat(item.amount) || 0;
    return sum + amount;
  }, 0) ?? 0;

  const calculatedTax = lineItems?.reduce((sum, item) => {
    const gstAmount = parseFloat(item.gstAmount || '0') || 0;
    return sum + gstAmount;
  }, 0) ?? 0;

  const calculatedTotal = calculatedSubtotal + calculatedTax;

  // Calculate home currency totals (use stored values or calculate)
  const calculatedHomeSubtotal = lineItems?.reduce((sum, item) => {
    const homeAmount = parseFloat(getDisplayHomeAmount(item)) || 0;
    return sum + homeAmount;
  }, 0) ?? 0;

  const calculatedHomeTax = lineItems?.reduce((sum, item) => {
    const homeGstAmount = parseFloat(getDisplayHomeGstAmount(item)) || 0;
    return sum + homeGstAmount;
  }, 0) ?? 0;

  const calculatedHomeTotal = calculatedHomeSubtotal + calculatedHomeTax;

  if (isLoading) {
    return (
      <div className={cn(fullWidth ? 'p-4' : 'card p-8', 'flex items-center justify-center')}>
        <RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  // Calculate amount including tax for each item
  const getAmountInclTax = (item: { amount: string; gstAmount?: string | null }) => {
    const amount = parseFloat(item.amount) || 0;
    const gst = parseFloat(item.gstAmount || '0') || 0;
    return amount + gst;
  };

  // Calculate home amount including tax for each item (use stored or calculated values)
  const getHomeAmountInclTax = (item: { amount: string; gstAmount?: string | null; homeAmount?: string | null; homeGstAmount?: string | null }) => {
    const homeAmount = parseFloat(getDisplayHomeAmount(item)) || 0;
    const homeGst = parseFloat(getDisplayHomeGstAmount(item)) || 0;
    return homeAmount + homeGst;
  };

  return (
    <div className={cn(fullWidth ? 'flex flex-col' : 'card')}>
      <div className={cn(
        'flex items-center justify-between flex-shrink-0',
        fullWidth ? 'px-4 py-3 border-b border-border-primary bg-background-secondary' : 'p-4 border-b border-border-primary'
      )}>
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <List className="w-4 h-4" />
          Line Items ({lineItems?.length || 0})
        </h3>
        {isEditing && (
          <button onClick={onAdd} className="btn-secondary btn-xs flex items-center gap-1">
            <Plus className="w-3 h-3" />
            Add Item
          </button>
        )}
      </div>

      {lineItems && lineItems.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background-tertiary">
              <tr>
                <th className="text-left text-xs font-medium text-text-secondary px-3 py-2.5 w-10">#</th>
                <th className="text-left text-xs font-medium text-text-secondary px-3 py-2.5">Description</th>
                <th className="text-left text-xs font-medium text-text-secondary px-3 py-2.5 w-96">Account</th>
                <th className="text-right text-xs font-medium text-text-secondary px-3 py-2.5 w-14">Qty</th>
                <th className="text-right text-xs font-medium text-text-secondary px-3 py-2.5 w-24">Unit Price</th>
                <th className="text-right text-xs font-medium text-text-secondary px-3 py-2.5 w-28">
                  <div>Amount</div>
                  {isEditing && <div className="font-normal text-text-muted">({currency})</div>}
                </th>
                <th className="text-right text-xs font-medium text-text-secondary px-3 py-2.5 w-24">
                  <div>GST Amt</div>
                  {isEditing && <div className="font-normal text-text-muted">({currency})</div>}
                </th>
                <th className="text-right text-xs font-medium text-text-secondary px-3 py-2.5 w-28">
                  <div>Amt Incl Tax</div>
                  {isEditing && <div className="font-normal text-text-muted">({currency})</div>}
                </th>
                {/* Home Currency Headers - always shown */}
                <th className="w-px bg-border-primary"></th>
                <th className={cn(
                  "text-right text-xs font-medium px-3 py-2.5 w-28",
                  isSameCurrency ? "text-text-muted bg-background-secondary/60" : "text-text-secondary"
                )}>
                  <div>Amount</div>
                  {isEditing && <div className="font-normal text-text-muted">({homeCurrency})</div>}
                </th>
                <th className={cn(
                  "text-right text-xs font-medium px-3 py-2.5 w-24",
                  isSameCurrency ? "text-text-muted bg-background-secondary/60" : "text-text-secondary"
                )}>
                  <div>GST Amt</div>
                  {isEditing && <div className="font-normal text-text-muted">({homeCurrency})</div>}
                </th>
                <th className={cn(
                  "text-right text-xs font-medium px-3 py-2.5 w-28",
                  isSameCurrency ? "text-text-muted bg-background-secondary/60" : "text-text-secondary"
                )}>
                  <div>Amt Incl Tax</div>
                  {isEditing && <div className="font-normal text-text-muted">({homeCurrency})</div>}
                </th>
                <th className={cn(
                  "text-right text-xs font-medium text-text-secondary px-3 py-2.5 w-32",
                  !isEditing && "pr-8"
                )}>GST</th>
                {isEditing && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {lineItems.map((item, index) => {
                const account = chartOfAccounts.find((a) => a.code === item.accountCode);
                const gstCode = gstTaxCodes.find((g) => g.code === item.taxCode);
                const lineConfidence = getLineItemConfidence(item.evidenceJson || null);
                const amountInclTax = getAmountInclTax(item);
                const homeAmountInclTax = getHomeAmountInclTax(item);
                const gstIssue = getLineItemGstIssue(item.lineNo);
                return (
                  <tr key={item.id || `new-${index}`} className="hover:bg-background-tertiary/50">
                    <td className="px-3 py-2.5 text-sm text-text-muted">
                      <span className="flex items-center gap-1.5">
                        {item.lineNo}
                        {lineConfidence !== undefined && !isEditing && (
                          <ConfidenceDot confidence={lineConfidence} size="sm" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-text-primary">
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => onChange(index, 'description', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
                        />
                      ) : (
                        <span className="block" title={item.description}>
                          {item.description}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-text-primary">
                      {isEditing ? (
                        <SearchableSelect
                          options={chartOfAccounts.map((acc) => ({
                            value: acc.code,
                            label: `${acc.code} - ${acc.name}`,
                          }))}
                          value={item.accountCode || ''}
                          onChange={(value) => onChange(index, 'accountCode', value)}
                          placeholder="Select account..."
                          size="sm"
                          showKeyboardHints={false}
                        />
                      ) : (
                        <span
                          className="cursor-default"
                          title={account ? `${account.code} - ${account.name}` : item.accountCode || ''}
                        >
                          {account?.name || item.accountCode || '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-text-primary tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          step="1"
                          value={item.quantity || ''}
                          onChange={(e) => onChange(index, 'quantity', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatNumber(item.quantity || null, 0)
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-right text-text-primary tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice || ''}
                          onChange={(e) => onChange(index, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatCurrency(item.unitPrice || '0', currency)
                      )}
                    </td>
                    {/* Amount (document currency) */}
                    <td className="px-3 py-2.5 text-sm text-right text-text-primary tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount}
                          onChange={(e) => onChange(index, 'amount', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatCurrency(item.amount, currency)
                      )}
                    </td>
                    {/* GST Amount (document currency) */}
                    <td className={cn(
                      "px-3 py-2.5 text-sm text-right tabular-nums",
                      gstIssue ? "text-status-warning" : "text-text-primary"
                    )}>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.gstAmount || ''}
                          onChange={(e) => onChange(index, 'gstAmount', e.target.value)}
                          className={cn(
                            "w-full px-2 py-1 text-sm bg-background-secondary border rounded focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                            gstIssue ? "border-status-warning focus:border-status-warning" : "border-border-primary focus:border-oak-light"
                          )}
                        />
                      ) : (
                        <span className="flex items-center justify-end gap-1">
                          {gstIssue && (
                            <span title={gstIssue.message}>
                              <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                            </span>
                          )}
                          {formatCurrency(item.gstAmount || '0', currency)}
                        </span>
                      )}
                    </td>
                    {/* Amt Incl Tax (document currency) */}
                    <td className="px-3 py-2.5 text-sm text-right text-text-primary tabular-nums">
                      {formatCurrency(amountInclTax.toFixed(2), currency)}
                    </td>
                    {/* Home Currency Columns - always shown */}
                    {/* Divider */}
                    <td className="w-px bg-border-primary"></td>
                    {/* Amount (home currency) */}
                    <td className={cn(
                      "px-3 py-2.5 text-sm text-right tabular-nums",
                      isSameCurrency ? "text-text-muted bg-background-secondary/40" : "text-text-primary"
                    )}>
                      {isEditing && !isSameCurrency ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.homeAmount || ''}
                          onChange={(e) => onChange(index, 'homeAmount', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatCurrency(getDisplayHomeAmount(item), homeCurrency)
                      )}
                    </td>
                    {/* GST Amount (home currency) */}
                    <td className={cn(
                      "px-3 py-2.5 text-sm text-right tabular-nums",
                      isSameCurrency ? "text-text-muted bg-background-secondary/40" : "text-text-primary"
                    )}>
                      {isEditing && !isSameCurrency ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.homeGstAmount || ''}
                          onChange={(e) => onChange(index, 'homeGstAmount', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatCurrency(getDisplayHomeGstAmount(item), homeCurrency)
                      )}
                    </td>
                    {/* Amt Incl Tax (home currency) */}
                    <td className={cn(
                      "px-3 py-2.5 text-sm text-right tabular-nums",
                      isSameCurrency ? "text-text-muted bg-background-secondary/40" : "text-text-primary"
                    )}>
                      {formatCurrency(isSameCurrency ? amountInclTax.toFixed(2) : homeAmountInclTax.toFixed(2), homeCurrency)}
                    </td>
                    {/* GST Code (last column) */}
                    <td className={cn(
                      "px-3 py-2.5 text-sm text-right",
                      gstIssue ? "text-status-warning" : "text-text-primary",
                      !isEditing && "pr-8"
                    )}>
                      {isEditing ? (
                        <select
                          value={item.taxCode || ''}
                          onChange={(e) => onChange(index, 'taxCode', e.target.value)}
                          className={cn(
                            "w-full px-2 py-1 text-sm bg-background-secondary border rounded focus:outline-none text-right min-w-[100px]",
                            gstIssue ? "border-status-warning focus:border-status-warning" : "border-border-primary focus:border-oak-light"
                          )}
                        >
                          <option value="">-</option>
                          {gstTaxCodes.map((gst) => (
                            <option key={gst.code} value={gst.code}>
                              {gst.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="flex items-center justify-end gap-1">
                          {gstIssue && (
                            <span title={gstIssue.message}>
                              <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                            </span>
                          )}
                          {gstCode?.label || item.taxCode || '-'}
                        </span>
                      )}
                    </td>
                    {isEditing && (
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => onRemove(index)}
                          className="p-1 text-status-error hover:bg-status-error/10 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-background-tertiary border-t border-border-primary">
              <tr className="font-semibold">
                <td colSpan={5} className="px-3 py-2.5 text-sm text-right text-text-primary">
                  Total
                </td>
                {/* Document currency totals */}
                <td className={cn(
                  "px-3 py-2.5 text-sm text-right tabular-nums",
                  lineSubtotalIssue ? "text-status-warning" : "text-text-primary"
                )}>
                  <span className="flex items-center justify-end gap-1">
                    {lineSubtotalIssue && (
                      <span title={lineSubtotalIssue.message}>
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                      </span>
                    )}
                    {formatCurrency(calculatedSubtotal.toFixed(2), currency)}
                  </span>
                </td>
                <td className={cn(
                  "px-3 py-2.5 text-sm text-right tabular-nums",
                  lineTaxIssue ? "text-status-warning" : "text-text-primary"
                )}>
                  <span className="flex items-center justify-end gap-1">
                    {lineTaxIssue && (
                      <span title={lineTaxIssue.message}>
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                      </span>
                    )}
                    {formatCurrency(calculatedTax.toFixed(2), currency)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sm text-right text-text-primary tabular-nums">
                  {formatCurrency(calculatedTotal.toFixed(2), currency)}
                </td>
                {/* Home currency totals - always shown */}
                <td className="w-px bg-border-primary"></td>
                <td className={cn(
                  "px-3 py-2.5 text-sm text-right tabular-nums",
                  homeSubtotalIssue ? "text-status-warning" : isSameCurrency ? "text-text-muted bg-background-secondary/60" : "text-text-primary"
                )}>
                  <span className="flex items-center justify-end gap-1">
                    {homeSubtotalIssue && (
                      <span title={homeSubtotalIssue.message}>
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                      </span>
                    )}
                    {formatCurrency(isSameCurrency ? calculatedSubtotal.toFixed(2) : calculatedHomeSubtotal.toFixed(2), homeCurrency)}
                  </span>
                </td>
                <td className={cn(
                  "px-3 py-2.5 text-sm text-right tabular-nums",
                  homeTaxIssue ? "text-status-warning" : isSameCurrency ? "text-text-muted bg-background-secondary/60" : "text-text-primary"
                )}>
                  <span className="flex items-center justify-end gap-1">
                    {homeTaxIssue && (
                      <span title={homeTaxIssue.message}>
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                      </span>
                    )}
                    {formatCurrency(isSameCurrency ? calculatedTax.toFixed(2) : calculatedHomeTax.toFixed(2), homeCurrency)}
                  </span>
                </td>
                <td className={cn(
                  "px-3 py-2.5 text-sm text-right tabular-nums",
                  homeTotalIssue ? "text-status-warning" : isSameCurrency ? "text-text-muted bg-background-secondary/60" : "text-text-primary"
                )}>
                  <span className="flex items-center justify-end gap-1">
                    {homeTotalIssue && (
                      <span title={homeTotalIssue.message}>
                        <AlertTriangle className="w-3.5 h-3.5 text-status-warning flex-shrink-0" />
                      </span>
                    )}
                    {formatCurrency(isSameCurrency ? calculatedTotal.toFixed(2) : calculatedHomeTotal.toFixed(2), homeCurrency)}
                  </span>
                </td>
                {/* Empty cell for GST column */}
                <td className={cn("px-3 py-2.5", !isEditing && "pr-8")}></td>
                {isEditing && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-text-muted">
          <List className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No line items extracted</p>
        </div>
      )}
    </div>
  );
}

function HistoryDropdown({
  revisions,
  isLoading,
  onClose,
  categoryLabels,
  currentRevisionId,
  viewingSnapshotId,
  onViewSnapshot,
  onExitSnapshot,
}: {
  revisions?: Array<{
    id: string;
    revisionNumber: number;
    status: RevisionStatus;
    revisionType: string;
    documentCategory: DocumentCategory | null;
    vendorName: string | null;
    totalAmount: string;
    currency: string;
    createdAt: string;
    approvedAt: string | null;
  }>;
  isLoading: boolean;
  onClose: () => void;
  categoryLabels: Record<DocumentCategory, string>;
  currentRevisionId: string | null;
  viewingSnapshotId: string | null;
  onViewSnapshot: (revisionId: string, revisionNumber: number) => void;
  onExitSnapshot: () => void;
}) {
  useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div
      className="absolute bottom-full right-0 mb-2 w-80 bg-background-secondary border border-border-primary rounded-lg shadow-lg z-50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3 border-b border-border-primary">
        <h4 className="text-sm font-medium text-text-primary">Revision History</h4>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-text-muted" />
          </div>
        ) : revisions && revisions.length > 0 ? (
          <div className="p-2 space-y-2">
            {revisions.map((rev) => {
              const isCurrentRevision = rev.id === currentRevisionId;
              const isViewingThis = viewingSnapshotId === rev.id;
              return (
                <div
                  key={rev.id}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-all group relative',
                    isViewingThis
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/30'
                      : isCurrentRevision
                      ? 'border-oak-primary/50 bg-oak-primary/5'
                      : rev.status === 'APPROVED'
                      ? 'border-status-success/30 bg-status-success/5 hover:border-status-success/50'
                      : rev.status === 'DRAFT'
                      ? 'border-status-warning/30 bg-status-warning/5 hover:border-status-warning/50'
                      : 'border-border-primary bg-background-tertiary hover:border-border-secondary'
                  )}
                  onClick={() => {
                    if (isCurrentRevision) {
                      onExitSnapshot();
                    } else {
                      onViewSnapshot(rev.id, rev.revisionNumber);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">#{rev.revisionNumber}</span>
                      {isCurrentRevision && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-oak-primary/20 text-oak-primary">
                          Current
                        </span>
                      )}
                      {isViewingThis && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400">
                          Viewing
                        </span>
                      )}
                    </div>
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', revisionStatusConfig[rev.status].bgColor, revisionStatusConfig[rev.status].color)}>
                      {revisionStatusConfig[rev.status].label}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary space-y-0.5">
                    <div>{rev.documentCategory ? categoryLabels[rev.documentCategory] : '-'}</div>
                    <div>{formatCurrency(rev.totalAmount, rev.currency)}</div>
                    <div className="text-text-muted">{formatDateTime(rev.createdAt)}</div>
                  </div>
                  {/* Hover hint */}
                  {!isCurrentRevision && !isViewingThis && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background-primary/80 rounded-lg">
                      <span className="text-xs font-medium text-text-secondary flex items-center gap-1">
                        <History className="w-3 h-3" />
                        View Snapshot
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-center text-text-muted text-sm">
            No revision history
          </div>
        )}
      </div>
    </div>
  );
}
