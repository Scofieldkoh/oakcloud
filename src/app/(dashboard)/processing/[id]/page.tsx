'use client';

import { use, useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText,
  ArrowLeft,
  RefreshCw,
  Play,
  FileStack,
  History,
  Copy,
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
} from 'lucide-react';
import {
  useProcessingDocument,
  useRevisionHistory,
  useTriggerExtraction,
  useApproveRevision,
  useRecordDuplicateDecision,
  useDocumentPages,
  useRevisionWithLineItems,
  useUpdateRevision,
  useDocumentNavigation,
  useDuplicateComparison,
  useUpdatePageRotation,
  useBulkOperation,
  useCreateRevision,
} from '@/hooks/use-processing-documents';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DocumentPageViewer,
  ResizableSplitView,
  ConfidenceDot,
  ConfidenceBadge,
  DuplicateComparisonModal,
  DocumentLinks,
} from '@/components/processing';
import type { FieldValue } from '@/components/processing/document-page-viewer';
import type { PipelineStatus, DuplicateStatus, RevisionStatus, DocumentCategory, DocumentSubCategory } from '@/generated/prisma';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  SUBCATEGORY_LABELS,
  getSubCategoriesForCategory,
  getSubCategoryOptions,
} from '@/lib/document-categories';

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

const currencyOptions = ['SGD', 'USD', 'EUR', 'GBP', 'MYR', 'CNY', 'JPY', 'AUD', 'HKD', 'THB'];

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

const chartOfAccounts = [
  { code: '5000', name: 'Cost of Goods Sold' },
  { code: '5100', name: 'Direct Labor' },
  { code: '5200', name: 'Direct Materials' },
  { code: '6000', name: 'Operating Expenses' },
  { code: '6100', name: 'Advertising & Marketing' },
  { code: '6200', name: 'Bank Charges' },
  { code: '6300', name: 'Depreciation' },
  { code: '6400', name: 'Insurance' },
  { code: '6500', name: 'Office Supplies' },
  { code: '6600', name: 'Professional Fees' },
  { code: '6700', name: 'Rent' },
  { code: '6800', name: 'Repairs & Maintenance' },
  { code: '6900', name: 'Telephone & Internet' },
  { code: '7000', name: 'Travel & Entertainment' },
  { code: '7100', name: 'Utilities' },
  { code: '7200', name: 'Other Expenses' },
];

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

function formatCurrency(amount: string | number | null, currency: string): string {
  if (amount === null || amount === undefined || amount === '') return '-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formatted = new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: currency || 'SGD',
    minimumFractionDigits: 2,
  }).format(absNum);

  return isNegative ? `(${formatted})` : formatted;
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
  const { success, error: toastError } = useToast();
  const { can } = usePermissions();

  // Check if we should auto-open compare modal from query param
  const shouldAutoCompare = searchParams.get('compare') === 'true';

  // Data fetching
  const { data, isLoading, error, refetch } = useProcessingDocument(id);
  const { data: revisions, isLoading: revisionsLoading } = useRevisionHistory(id);
  const { data: pagesData, isLoading: pagesLoading } = useDocumentPages(id);
  const { data: navData } = useDocumentNavigation(id);

  // Current revision data
  const currentRevisionId = data?.currentRevision?.id || null;

  // Snapshot viewing state - when viewing a historical revision
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [viewingSnapshotNumber, setViewingSnapshotNumber] = useState<number | null>(null);

  // Determine which revision to display - snapshot or current
  const displayRevisionId = viewingSnapshotId || currentRevisionId;
  const isViewingSnapshot = viewingSnapshotId !== null;

  const { data: revisionWithLineItems, isLoading: lineItemsLoading, refetch: refetchLineItems } = useRevisionWithLineItems(id, displayRevisionId);

  // Duplicate comparison (only fetch when needed)
  const { data: duplicateData } = useDuplicateComparison(
    id,
    data?.document?.duplicateStatus === 'SUSPECTED'
  );

  // Mutations
  const triggerExtraction = useTriggerExtraction();
  const approveRevision = useApproveRevision();
  const recordDuplicateDecision = useRecordDuplicateDecision();
  const updateRevision = useUpdateRevision();
  const updatePageRotation = useUpdatePageRotation();
  const bulkOperation = useBulkOperation();
  const createRevision = useCreateRevision();

  // UI State
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  // Initialize edit form when revision data changes
  useEffect(() => {
    if (revisionWithLineItems && !isEditing) {
      setEditFormData({
        documentCategory: revisionWithLineItems.documentCategory || '',
        documentSubCategory: revisionWithLineItems.documentSubCategory || '',
        vendorName: revisionWithLineItems.vendorName || '',
        documentNumber: revisionWithLineItems.documentNumber || '',
        documentDate: revisionWithLineItems.documentDate || '',
        dueDate: revisionWithLineItems.dueDate || '',
        currency: revisionWithLineItems.currency || 'SGD',
        subtotal: revisionWithLineItems.subtotal || '',
        taxAmount: revisionWithLineItems.taxAmount || '',
        totalAmount: revisionWithLineItems.totalAmount || '',
        supplierGstNo: '',
      });
      setEditLineItems(
        revisionWithLineItems.lineItems?.map((item) => ({
          id: item.id,
          lineNo: item.lineNo,
          description: item.description,
          quantity: item.quantity || '',
          unitPrice: item.unitPrice || '',
          amount: item.amount,
          gstAmount: item.gstAmount || '',
          taxCode: item.taxCode || '',
          accountCode: item.accountCode || '',
        })) || []
      );
    }
  }, [revisionWithLineItems, isEditing]);

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
    if (!navData || navData.currentIndex <= 0) return;
    const prevDoc = navData.documents[navData.currentIndex - 1];
    if (prevDoc) router.push(`/processing/${prevDoc.id}`);
  }, [navData, router]);

  const handleNavigateNext = useCallback(() => {
    if (!navData || navData.currentIndex >= navData.total - 1) return;
    const nextDoc = navData.documents[navData.currentIndex + 1];
    if (nextDoc) router.push(`/processing/${nextDoc.id}`);
  }, [navData, router]);

  // Keyboard navigation
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
  const handleTriggerExtraction = async () => {
    try {
      await triggerExtraction.mutateAsync(id);
      success('Extraction triggered successfully');
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to trigger extraction');
    }
  };

  const handleApproveRevision = async () => {
    if (!data?.document || !data?.currentRevision) return;
    try {
      await approveRevision.mutateAsync({
        documentId: id,
        revisionId: data.currentRevision.id,
        lockVersion: data.document.lockVersion,
      });
      success('Revision approved');
      setShowApproveDialog(false);
      refetch();
      // Auto-advance to next document after approval
      if (navData && navData.currentIndex < navData.total - 1) {
        const nextDoc = navData.documents[navData.currentIndex + 1];
        if (nextDoc) router.push(`/processing/${nextDoc.id}`);
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to approve revision');
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
  const handleStartEdit = () => {
    if (revisionWithLineItems) {
      setEditFormData({
        documentCategory: revisionWithLineItems.documentCategory || '',
        documentSubCategory: revisionWithLineItems.documentSubCategory || '',
        vendorName: revisionWithLineItems.vendorName || '',
        documentNumber: revisionWithLineItems.documentNumber || '',
        documentDate: revisionWithLineItems.documentDate || '',
        dueDate: revisionWithLineItems.dueDate || '',
        currency: revisionWithLineItems.currency || 'SGD',
        subtotal: revisionWithLineItems.subtotal || '',
        taxAmount: revisionWithLineItems.taxAmount || '',
        totalAmount: revisionWithLineItems.totalAmount || '',
        supplierGstNo: '',
      });
      setEditLineItems(
        revisionWithLineItems.lineItems?.map((item) => ({
          id: item.id,
          lineNo: item.lineNo,
          description: item.description,
          quantity: item.quantity || '',
          unitPrice: item.unitPrice || '',
          amount: item.amount,
          gstAmount: item.gstAmount || '',
          taxCode: item.taxCode || '',
          accountCode: item.accountCode || '',
        })) || []
      );
      setDeletedLineItemIds([]); // Reset deleted items when starting edit
    }
    setIsEditing(true);
  };

  // Create a new draft revision from an approved one, then enter edit mode
  const handleEditApproved = async () => {
    if (!data?.document || !currentRevisionId) return;
    try {
      // Create a new revision based on the approved one (with no changes initially)
      const result = await createRevision.mutateAsync({
        documentId: id,
        lockVersion: data.document.lockVersion,
        input: {
          basedOnRevisionId: currentRevisionId,
          reason: 'Edit approved document',
        },
      });
      success(`Created new draft revision #${result.revision.revisionNumber}`);
      // Refetch to get the new revision data
      await refetch();
      await refetchLineItems();
      // Enter edit mode after data is refreshed
      setTimeout(() => {
        setIsEditing(true);
      }, 100);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to create new revision');
    }
  };

  const handleSaveEdit = async () => {
    if (!data?.document || !currentRevisionId) return;
    try {
      await updateRevision.mutateAsync({
        documentId: id,
        revisionId: currentRevisionId,
        lockVersion: data.document.lockVersion,
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
          },
          itemsToUpsert: editLineItems.map((item) => ({
            id: item.id,
            lineNo: item.lineNo,
            description: item.description,
            quantity: item.quantity || undefined,
            unitPrice: item.unitPrice || undefined,
            amount: item.amount,
            gstAmount: item.gstAmount || undefined,
            taxCode: item.taxCode || undefined,
            accountCode: item.accountCode || undefined,
          })),
          itemsToDelete: deletedLineItemIds.length > 0 ? deletedLineItemIds : undefined,
        },
      });
      success('Changes saved successfully');
      setIsEditing(false);
      setDeletedLineItemIds([]); // Reset deleted items tracking
      refetch();
      refetchLineItems();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

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

    // Auto-calculate amount when qty or unitPrice changes
    if (field === 'quantity' || field === 'unitPrice') {
      const qty = parseFloat(field === 'quantity' ? value : updated[index].quantity) || 0;
      const unitPrice = parseFloat(field === 'unitPrice' ? value : updated[index].unitPrice) || 0;
      if (qty > 0 && unitPrice > 0) {
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
      updated[index].gstAmount = gstAmount > 0 ? gstAmount.toFixed(2) : '';
    }

    setEditLineItems(updated);
  };

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
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary bg-background-primary flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/processing" className="btn-ghost btn-sm p-2" title="Back to list">
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Document Navigation */}
          {navData && navData.total > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleNavigatePrev}
                disabled={navData.currentIndex <= 0}
                className="btn-ghost btn-xs p-1.5"
                title="Previous document (Alt+Left)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-text-secondary whitespace-nowrap">
                {navData.currentIndex + 1} / {navData.total}
              </span>
              <button
                onClick={handleNavigateNext}
                disabled={navData.currentIndex >= navData.total - 1}
                className="btn-ghost btn-xs p-1.5"
                title="Next document (Alt+Right)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-border-primary mx-1" />

          <h1 className="text-sm font-medium text-text-primary truncate max-w-[300px]">
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
              onClick={handleTriggerExtraction}
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
          {!isViewingSnapshot && isEditing ? (
            <>
              <button onClick={() => { setIsEditing(false); setDeletedLineItemIds([]); }} className="btn-ghost btn-sm">
                Cancel
              </button>
              <button
                onClick={handleTriggerExtraction}
                disabled={triggerExtraction.isPending}
                className="btn-secondary btn-sm"
                title="Re-run AI extraction to replace current data"
              >
                {triggerExtraction.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                Re-extract
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updateRevision.isPending}
                className="btn-primary btn-sm"
              >
                {updateRevision.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                )}
                Save
              </button>
            </>
          ) : !isViewingSnapshot ? (
            <>
              {/* Edit button for DRAFT revisions - edits directly */}
              {currentRevision?.status === 'DRAFT' && can.updateDocument && (
                <button onClick={handleStartEdit} className="btn-secondary btn-sm">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </button>
              )}
              {/* Edit button for APPROVED revisions - creates new draft revision */}
              {currentRevision?.status === 'APPROVED' && can.updateDocument && (
                <button
                  onClick={handleEditApproved}
                  disabled={createRevision.isPending}
                  className="btn-secondary btn-sm"
                  title="Create a new draft revision from the approved document"
                >
                  {createRevision.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Edit
                </button>
              )}
              {canApprove && can.updateDocument && (
                <button onClick={() => setShowApproveDialog(true)} className="btn-primary btn-sm">
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Approve
                </button>
              )}
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

      {/* Main Content - Split View */}
      <div className="flex-1 overflow-hidden">
        <ResizableSplitView
          leftPanel={
            pagesLoading ? (
              <div className="flex items-center justify-center h-full bg-background-secondary">
                <RefreshCw className="w-6 h-6 animate-spin text-text-muted" />
              </div>
            ) : (
              <DocumentPageViewer
                documentId={id}
                highlights={highlights}
                fieldValues={fieldValues}
                className="h-full"
                onRotationChange={handleRotationChange}
              />
            )
          }
          rightPanel={
            <div className="h-full overflow-y-auto bg-background-primary p-4 pb-6">
              {/* Extracted Data Section */}
              {!currentRevision ? (
                <NoExtractionPlaceholder
                  canTrigger={canTriggerExtraction}
                  isPending={triggerExtraction.isPending}
                  pipelineStatus={doc.pipelineStatus}
                  onTrigger={handleTriggerExtraction}
                />
              ) : (
                <div className="space-y-6">
                  {/* Header Fields */}
                  <ExtractedHeaderFields
                    revision={revisionWithLineItems || currentRevision}
                    isEditing={isEditing}
                    editFormData={editFormData}
                    setEditFormData={setEditFormData}
                    focusedField={focusedField}
                    setFocusedField={setFocusedField}
                    getFieldConfidence={getFieldConfidence}
                    categoryLabels={categoryLabels}
                    currencyOptions={currencyOptions}
                  />

                  {/* Validation Status */}
                  {revisionWithLineItems?.validationStatus && revisionWithLineItems.validationStatus !== 'PENDING' && (
                    <ValidationStatusSection
                      status={revisionWithLineItems.validationStatus}
                      issues={(revisionWithLineItems.validationIssues as { issues?: ValidationIssue[] })?.issues}
                    />
                  )}

                  {/* Line Items */}
                  <LineItemsSection
                    lineItems={isEditing ? editLineItems : revisionWithLineItems?.lineItems}
                    isEditing={isEditing}
                    isLoading={lineItemsLoading}
                    currency={revisionWithLineItems?.currency || currentRevision.currency}
                    chartOfAccounts={chartOfAccounts}
                    onAdd={handleAddLineItem}
                    onRemove={handleRemoveLineItem}
                    onChange={handleLineItemChange}
                  />

                  {/* Document Links - Only show when not viewing a snapshot */}
                  {!isViewingSnapshot && (
                    <DocumentLinks
                      documentId={id}
                      canUpdate={can.updateDocument}
                    />
                  )}
                </div>
              )}
            </div>
          }
          defaultLeftWidth={45}
          minLeftWidth={30}
          maxLeftWidth={70}
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
        description={`Are you sure you want to approve Revision #${currentRevision?.revisionNumber}? This will mark it as the official record.`}
        confirmLabel="Approve"
        variant="info"
        isLoading={approveRevision.isPending}
      />

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

      {/* Duplicate Comparison Modal */}
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
        <button onClick={onTrigger} disabled={isPending} className="btn-primary btn-sm">
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
  focusedField,
  setFocusedField,
  getFieldConfidence,
  categoryLabels,
  currencyOptions,
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
  }>>;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  getFieldConfidence: (key: string) => number | undefined;
  categoryLabels: Record<DocumentCategory, string>;
  currencyOptions: string[];
}) {
  const handleFieldFocus = (fieldKey: string) => setFocusedField(fieldKey);
  const handleFieldBlur = () => setFocusedField(null);

  if (isEditing) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <FileStack className="w-4 h-4" />
          Extracted Data
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Category</label>
            <select
              value={editFormData.documentCategory}
              onChange={(e) => setEditFormData({
                ...editFormData,
                documentCategory: e.target.value,
                documentSubCategory: '', // Reset sub-category when category changes
              })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
            >
              <option value="">Select...</option>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Sub-Category</label>
            <select
              value={editFormData.documentSubCategory}
              onChange={(e) => setEditFormData({ ...editFormData, documentSubCategory: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
              disabled={!editFormData.documentCategory}
            >
              <option value="">Select...</option>
              {editFormData.documentCategory &&
                getSubCategoryOptions(editFormData.documentCategory as DocumentCategory).map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))
              }
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Vendor</label>
            <input
              type="text"
              value={editFormData.vendorName}
              onChange={(e) => setEditFormData({ ...editFormData, vendorName: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
              placeholder="Vendor name"
            />
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
          <div>
            <label className="block text-xs text-text-muted mb-1">Document Date</label>
            <input
              type="date"
              value={editFormData.documentDate}
              onChange={(e) => setEditFormData({ ...editFormData, documentDate: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Due Date</label>
            <input
              type="date"
              value={editFormData.dueDate}
              onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Currency</label>
            <select
              value={editFormData.currency}
              onChange={(e) => setEditFormData({ ...editFormData, currency: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
            >
              {currencyOptions.map((curr) => (
                <option key={curr} value={curr}>{curr}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Subtotal</label>
            <input
              type="number"
              step="0.01"
              value={editFormData.subtotal}
              onChange={(e) => setEditFormData({ ...editFormData, subtotal: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Tax Amount</label>
            <input
              type="number"
              step="0.01"
              value={editFormData.taxAmount}
              onChange={(e) => setEditFormData({ ...editFormData, taxAmount: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Total Amount</label>
            <input
              type="number"
              step="0.01"
              value={editFormData.totalAmount}
              onChange={(e) => setEditFormData({ ...editFormData, totalAmount: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm font-semibold bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
        <FileStack className="w-4 h-4" />
        Extracted Data
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <FieldDisplay
          label="Category"
          value={revision.documentCategory ? categoryLabels[revision.documentCategory] : '-'}
          fieldKey="documentCategory"
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
        <FieldDisplay
          label="Sub-Category"
          value={revision.documentSubCategory ? SUBCATEGORY_LABELS[revision.documentSubCategory as DocumentSubCategory] : '-'}
          fieldKey="documentSubCategory"
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
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
        <FieldDisplay
          label="Currency"
          value={revision.currency}
          fieldKey="currency"
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
        <FieldDisplay
          label="Subtotal"
          value={formatCurrency(revision.subtotal || null, revision.currency)}
          fieldKey="subtotal"
          confidence={getFieldConfidence('subtotal')}
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
        <FieldDisplay
          label="Tax Amount"
          value={formatCurrency(revision.taxAmount || null, revision.currency)}
          fieldKey="taxAmount"
          confidence={getFieldConfidence('taxAmount')}
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
        />
        <FieldDisplay
          label="Total Amount"
          value={formatCurrency(revision.totalAmount, revision.currency)}
          fieldKey="totalAmount"
          confidence={getFieldConfidence('totalAmount')}
          focusedField={focusedField}
          onFocus={handleFieldFocus}
          onBlur={handleFieldBlur}
          highlight
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
}: {
  label: string;
  value: string | null;
  fieldKey: string;
  confidence?: number;
  focusedField: string | null;
  onFocus: (key: string) => void;
  onBlur: () => void;
  highlight?: boolean;
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
      <dd className={cn('text-sm', highlight ? 'font-semibold text-text-primary' : 'text-text-primary')}>
        {value || '-'}
      </dd>
    </div>
  );
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
                    {issue.message}
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
  chartOfAccounts,
  onAdd,
  onRemove,
  onChange,
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
  }>;
  isEditing: boolean;
  isLoading: boolean;
  currency: string;
  chartOfAccounts: Array<{ code: string; name: string }>;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: string, value: string) => void;
}) {
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

  if (isLoading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="p-4 border-b border-border-primary flex items-center justify-between">
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
                <th className="text-left text-xs font-medium text-text-secondary px-4 py-2.5 w-12">#</th>
                <th className="text-left text-xs font-medium text-text-secondary px-4 py-2.5">Description</th>
                <th className="text-left text-xs font-medium text-text-secondary px-4 py-2.5 w-24">Account</th>
                <th className="text-right text-xs font-medium text-text-secondary px-4 py-2.5 w-20">Qty</th>
                <th className="text-right text-xs font-medium text-text-secondary px-4 py-2.5 w-24">
                  Unit Price
                </th>
                <th className="text-right text-xs font-medium text-text-secondary px-4 py-2.5 w-24">Amount</th>
                <th className="text-left text-xs font-medium text-text-secondary px-2 py-2.5 w-32">GST</th>
                <th className="text-right text-xs font-medium text-text-secondary px-4 py-2.5 w-20">
                  GST Amt
                </th>
                {isEditing && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary">
              {lineItems.map((item, index) => {
                const account = chartOfAccounts.find((a) => a.code === item.accountCode);
                const gstCode = gstTaxCodes.find((g) => g.code === item.taxCode);
                const lineConfidence = getLineItemConfidence(item.evidenceJson || null);
                return (
                  <tr key={item.id || `new-${index}`} className="hover:bg-background-tertiary/50">
                    <td className="px-4 py-2.5 text-text-muted">
                      <span className="flex items-center gap-1.5">
                        {item.lineNo}
                        {lineConfidence !== undefined && !isEditing && (
                          <ConfidenceDot confidence={lineConfidence} size="sm" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-primary">
                      {isEditing ? (
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => onChange(index, 'description', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
                        />
                      ) : (
                        <span
                          className="truncate block max-w-[200px] cursor-default"
                          title={item.description}
                        >
                          {item.description}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary text-xs">
                      {isEditing ? (
                        <select
                          value={item.accountCode || ''}
                          onChange={(e) => onChange(index, 'accountCode', e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none"
                        >
                          <option value="">-</option>
                          {chartOfAccounts.map((acc) => (
                            <option key={acc.code} value={acc.code}>
                              {acc.code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="cursor-default"
                          title={account ? `${account.code} - ${account.name}` : item.accountCode || ''}
                        >
                          {account?.code || item.accountCode || '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">
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
                    <td className="px-4 py-2.5 text-right text-text-secondary">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice || ''}
                          onChange={(e) => onChange(index, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatNumber(item.unitPrice || null)
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-primary">
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
                    <td className="px-2 py-2.5 text-left text-text-secondary text-xs">
                      {isEditing ? (
                        <select
                          value={item.taxCode || ''}
                          onChange={(e) => onChange(index, 'taxCode', e.target.value)}
                          className="w-full px-2 py-1 text-xs bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-left"
                        >
                          <option value="">-</option>
                          {gstTaxCodes.map((gst) => (
                            <option key={gst.code} value={gst.code}>
                              {gst.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        gstCode?.label || item.taxCode || '-'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={item.gstAmount || ''}
                          onChange={(e) => onChange(index, 'gstAmount', e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-background-secondary border border-border-primary rounded focus:border-oak-light focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      ) : (
                        formatCurrency(item.gstAmount || '0', currency)
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
              <tr>
                <td colSpan={5} className="px-4 py-2 text-right text-text-secondary">
                  Subtotal
                </td>
                <td className="px-4 py-2 text-right text-text-primary">
                  {formatCurrency(calculatedSubtotal.toFixed(2), currency)}
                </td>
                <td colSpan={isEditing ? 3 : 2}></td>
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-2 text-right text-text-secondary">
                  Tax
                </td>
                <td className="px-4 py-2 text-right text-text-primary">
                  {formatCurrency(calculatedTax.toFixed(2), currency)}
                </td>
                <td colSpan={isEditing ? 3 : 2}></td>
              </tr>
              <tr className="font-semibold">
                <td colSpan={5} className="px-4 py-2 text-right text-text-primary">
                  Total
                </td>
                <td className="px-4 py-2 text-right text-text-primary">
                  {formatCurrency(calculatedTotal.toFixed(2), currency)}
                </td>
                <td colSpan={isEditing ? 3 : 2}></td>
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
