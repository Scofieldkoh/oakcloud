/**
 * Processing Documents Hooks
 *
 * React hooks for document processing operations, including
 * listing, viewing, extraction, revision management, and duplicate handling.
 *
 * @module hooks/use-processing-documents
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PipelineStatus,
  DuplicateStatus,
  RevisionStatus,
  DocumentCategory,
} from '@/generated/prisma';

// Types
export interface ProcessingDocumentListItem {
  id: string;
  documentId: string;
  isContainer: boolean;
  parentProcessingDocId: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  pageCount: number | null;
  pipelineStatus: PipelineStatus;
  duplicateStatus: DuplicateStatus;
  currentRevisionId: string | null;
  lockVersion: number;
  createdAt: string;
  document: {
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    companyId: string | null;
    company?: {
      id: string;
      name: string;
    };
  };
  currentRevision?: {
    id: string;
    revisionNumber: number;
    status: RevisionStatus;
    documentCategory: DocumentCategory | null;
    vendorName: string | null;
    documentNumber: string | null;
    documentDate: string | null;
    totalAmount: string;
    currency: string;
  };
}

export interface ProcessingDocumentDetail {
  id: string;
  documentId: string;
  isContainer: boolean;
  parentDocumentId: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  pageCount: number | null;
  pipelineStatus: PipelineStatus;
  duplicateStatus: DuplicateStatus;
  currentRevisionId: string | null;
  lockVersion: number;
  createdAt: string;
  pages: number;
  // Versioning
  version: number;
  rootDocumentId: string | null;
  // File details
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  // Company info
  company?: {
    id: string;
    name: string;
  };
}

export interface RevisionSummary {
  id: string;
  revisionNumber: number;
  status: RevisionStatus;
  documentCategory: DocumentCategory | null;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  totalAmount: string;
  currency: string;
  homeEquivalent: string | null;
  validationStatus: string;
  lineItemCount: number;
}

export interface ProcessingDocumentSearchParams {
  pipelineStatus?: PipelineStatus;
  duplicateStatus?: DuplicateStatus;
  isContainer?: boolean;
  companyId?: string;
  tenantId?: string; // For SUPER_ADMIN to filter by specific tenant
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProcessingDocumentSearchResult {
  documents: ProcessingDocumentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// API functions
async function fetchProcessingDocuments(
  params: ProcessingDocumentSearchParams
): Promise<ProcessingDocumentSearchResult> {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(`/api/processing-documents?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch processing documents');
  }
  const result = await response.json();
  return result.data;
}

async function fetchProcessingDocument(id: string): Promise<{
  document: ProcessingDocumentDetail;
  currentRevision: RevisionSummary | null;
}> {
  const response = await fetch(`/api/processing-documents/${id}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch processing document');
  }
  const result = await response.json();
  return result.data;
}

async function fetchRevisionHistory(documentId: string): Promise<{
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
  supersededAt: string | null;
}[]> {
  const response = await fetch(`/api/processing-documents/${documentId}/revisions`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch revision history');
  }
  const result = await response.json();
  return result.data.revisions;
}

async function triggerExtraction(documentId: string): Promise<{ extractionId: string }> {
  const response = await fetch(`/api/processing-documents/${documentId}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to trigger extraction');
  }
  const result = await response.json();
  return result.data;
}

async function acquireLock(
  documentId: string,
  lockVersion: number
): Promise<{ lockedAt: string; lockVersion: number }> {
  const response = await fetch(`/api/processing-documents/${documentId}/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': lockVersion.toString(),
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to acquire lock');
  }
  const result = await response.json();
  return result.data;
}

async function releaseLock(
  documentId: string,
  lockVersion: number
): Promise<{ lockVersion: number }> {
  const response = await fetch(`/api/processing-documents/${documentId}/unlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': lockVersion.toString(),
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to release lock');
  }
  const result = await response.json();
  return result.data;
}

async function approveRevision(
  documentId: string,
  revisionId: string,
  lockVersion: number
): Promise<{ revisionId: string; lockVersion: number }> {
  const response = await fetch(
    `/api/processing-documents/${documentId}/revisions/${revisionId}/approve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': lockVersion.toString(),
      },
    }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to approve revision');
  }
  const result = await response.json();
  return result.data;
}

async function recordDuplicateDecision(
  documentId: string,
  suspectedOfId: string,
  decision: 'CONFIRM_DUPLICATE' | 'REJECT_DUPLICATE' | 'MARK_AS_NEW_VERSION',
  reason?: string
): Promise<{ documentId: string; suspectedOfId: string; decision: string }> {
  const response = await fetch(`/api/processing-documents/${documentId}/duplicate-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suspectedOfId, decision, reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to record duplicate decision');
  }
  const result = await response.json();
  return result.data;
}

// Hooks
export function useProcessingDocuments(params: ProcessingDocumentSearchParams = {}) {
  return useQuery({
    queryKey: [
      'processing-documents',
      params.pipelineStatus,
      params.duplicateStatus,
      params.isContainer,
      params.companyId,
      params.tenantId,
      params.page,
      params.limit,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: () => fetchProcessingDocuments(params),
    staleTime: 30 * 1000, // 30 seconds - refetch on navigation after 30s
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}

export function useProcessingDocument(id: string) {
  return useQuery({
    queryKey: ['processing-document', id],
    queryFn: () => fetchProcessingDocument(id),
    enabled: !!id,
    staleTime: 30_000, // 30 seconds - shorter to show fresher data
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnMount: 'always', // Always refetch when component mounts (page navigation)
  });
}

export function useRevisionHistory(documentId: string) {
  return useQuery({
    queryKey: ['revision-history', documentId],
    queryFn: () => fetchRevisionHistory(documentId),
    enabled: !!documentId,
    staleTime: 30_000,
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}

export function useTriggerExtraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => triggerExtraction(documentId),
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['processing-documents'] });
    },
  });
}

export function useAcquireLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, lockVersion }: { documentId: string; lockVersion: number }) =>
      acquireLock(documentId, lockVersion),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
    },
  });
}

export function useReleaseLock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, lockVersion }: { documentId: string; lockVersion: number }) =>
      releaseLock(documentId, lockVersion),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
    },
  });
}

export function useApproveRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      revisionId,
      lockVersion,
    }: {
      documentId: string;
      revisionId: string;
      lockVersion: number;
    }) => approveRevision(documentId, revisionId, lockVersion),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['revision-history', documentId] });
      queryClient.invalidateQueries({ queryKey: ['processing-documents'] });
    },
  });
}

export function useRecordDuplicateDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      suspectedOfId,
      decision,
      reason,
    }: {
      documentId: string;
      suspectedOfId: string;
      decision: 'CONFIRM_DUPLICATE' | 'REJECT_DUPLICATE' | 'MARK_AS_NEW_VERSION';
      reason?: string;
    }) => recordDuplicateDecision(documentId, suspectedOfId, decision, reason),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['processing-documents'] });
      queryClient.invalidateQueries({ queryKey: ['duplicate-comparison', documentId] });
    },
  });
}

// Page types
export interface DocumentPageInfo {
  id: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  dpi: number;
  imageUrl: string;
  fingerprint: string | null;
  ocrProvider: string | null;
  textAcquisition: string | null;
  createdAt: string;
}

export interface DocumentPagesResult {
  documentId: string;
  pageCount: number;
  pages: DocumentPageInfo[];
  // PDF-specific fields for client-side rendering
  isPdf: boolean;
  pdfUrl: string | null;
}

// Fetch document pages
async function fetchDocumentPages(documentId: string): Promise<DocumentPagesResult> {
  const response = await fetch(`/api/processing-documents/${documentId}/pages`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch document pages');
  }
  const result = await response.json();
  return result.data;
}

export function useDocumentPages(documentId: string) {
  return useQuery({
    queryKey: ['document-pages', documentId],
    queryFn: () => fetchDocumentPages(documentId),
    enabled: !!documentId,
    staleTime: 60_000, // 1 minute - pages don't change often
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}

// Line item types
export interface LineItemData {
  id: string;
  lineNo: number;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  gstAmount: string | null;
  taxCode: string | null;
  accountCode: string | null;
  evidenceJson: Record<string, unknown> | null;
}

export interface RevisionWithLineItems {
  id: string;
  revisionNumber: number;
  status: RevisionStatus;
  documentCategory: DocumentCategory | null;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: string | null;
  taxAmount: string | null;
  totalAmount: string;
  gstTreatment: string | null;
  validationStatus: string;
  validationIssues: Record<string, unknown> | null;
  headerEvidenceJson: Record<string, unknown> | null;
  lineItems: LineItemData[];
}

// Fetch revision with line items
async function fetchRevisionWithLineItems(
  documentId: string,
  revisionId: string
): Promise<RevisionWithLineItems> {
  const response = await fetch(`/api/processing-documents/${documentId}/revisions/${revisionId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch revision');
  }
  const result = await response.json();
  return result.data;
}

export function useRevisionWithLineItems(documentId: string, revisionId: string | null) {
  return useQuery({
    queryKey: ['revision-line-items', documentId, revisionId],
    queryFn: () => fetchRevisionWithLineItems(documentId, revisionId!),
    enabled: !!documentId && !!revisionId,
    staleTime: 30_000,
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}

// Update revision with line item changes
async function updateRevision(
  documentId: string,
  revisionId: string,
  lockVersion: number,
  data: {
    headerUpdates?: Partial<{
      documentCategory: string;
      vendorName: string;
      documentNumber: string;
      documentDate: string;
      dueDate: string;
      currency: string;
      subtotal: string;
      taxAmount: string;
      totalAmount: string;
      gstTreatment: string;
      supplierGstNo: string;
    }>;
    itemsToUpsert?: Array<{
      id?: string;
      lineNo: number;
      description: string;
      quantity?: string;
      unitPrice?: string;
      amount: string;
      gstAmount?: string;
      taxCode?: string;
      accountCode?: string;
    }>;
    itemsToDelete?: string[];
  }
): Promise<{ revisionId: string; lockVersion: number }> {
  const response = await fetch(`/api/processing-documents/${documentId}/revisions/${revisionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': lockVersion.toString(),
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update revision');
  }
  const result = await response.json();
  return result.data;
}

export function useUpdateRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      revisionId,
      lockVersion,
      data,
    }: {
      documentId: string;
      revisionId: string;
      lockVersion: number;
      data: Parameters<typeof updateRevision>[3];
    }) => updateRevision(documentId, revisionId, lockVersion, data),
    onSuccess: (_, { documentId, revisionId }) => {
      queryClient.invalidateQueries({ queryKey: ['revision-line-items', documentId, revisionId] });
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['revision-history', documentId] });
    },
  });
}

// Bulk operations
type BulkOperation = 'APPROVE' | 'TRIGGER_EXTRACTION' | 'DELETE';

interface BulkResult {
  documentId: string;
  success: boolean;
  error?: string;
}

interface BulkOperationResponse {
  operation: BulkOperation;
  results: BulkResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

async function executeBulkOperation(
  operation: BulkOperation,
  documentIds: string[]
): Promise<BulkOperationResponse> {
  const response = await fetch('/api/processing-documents/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, documentIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to execute bulk operation');
  }
  const result = await response.json();
  return result.data;
}

export function useBulkOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ operation, documentIds }: { operation: BulkOperation; documentIds: string[] }) =>
      executeBulkOperation(operation, documentIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processing-documents'] });
    },
  });
}

// Bulk download types and hook
interface DownloadInfo {
  documentId: string;
  fileName: string;
  downloadUrl: string;
  mimeType: string;
  fileSize: number;
}

interface BulkDownloadResponse {
  downloads: DownloadInfo[];
  errors: { documentId: string; error: string }[];
  summary: {
    total: number;
    available: number;
    failed: number;
  };
}

async function fetchBulkDownloadInfo(documentIds: string[]): Promise<BulkDownloadResponse> {
  const response = await fetch('/api/processing-documents/bulk-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentIds }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to get download info');
  }
  const result = await response.json();
  return result.data;
}

export function useBulkDownload() {
  return useMutation({
    mutationFn: (documentIds: string[]) => fetchBulkDownloadInfo(documentIds),
  });
}

// ============================================================================
// Document Navigation (for review workflow)
// ============================================================================

export interface DocumentNavigationResult {
  documents: Array<{
    id: string;
    fileName: string;
    pipelineStatus: PipelineStatus;
    duplicateStatus: DuplicateStatus;
    approvalStatus: string;
    overallConfidence?: number;
  }>;
  total: number;
  currentIndex: number;
}

/**
 * Hook for navigating between documents that need review
 * Filters by: DRAFT status, suspected duplicate, or low confidence
 */
export function useDocumentNavigation(
  currentDocumentId: string,
  filter: 'all' | 'needs-review' = 'needs-review'
) {
  return useQuery({
    queryKey: ['document-navigation', currentDocumentId, filter],
    queryFn: async (): Promise<DocumentNavigationResult> => {
      // Fetch documents needing review (DRAFT status or suspected duplicate)
      const params = new URLSearchParams();
      params.set('limit', '100'); // Get enough for navigation
      params.set('sortBy', 'createdAt');
      params.set('sortOrder', 'desc');

      const response = await fetch(`/api/processing-documents?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents for navigation');
      }
      const result = await response.json();
      const allDocs = result.data.documents || [];

      // Filter documents based on criteria
      const filteredDocs = filter === 'needs-review'
        ? allDocs.filter((doc: ProcessingDocumentListItem) =>
            doc.currentRevision?.status === 'DRAFT' ||
            doc.duplicateStatus === 'SUSPECTED'
          )
        : allDocs;

      const currentIndex = filteredDocs.findIndex(
        (doc: ProcessingDocumentListItem) => doc.id === currentDocumentId
      );

      return {
        documents: filteredDocs.map((doc: ProcessingDocumentListItem) => ({
          id: doc.id,
          fileName: doc.document?.fileName || 'Unknown',
          pipelineStatus: doc.pipelineStatus,
          duplicateStatus: doc.duplicateStatus,
          approvalStatus: doc.currentRevision?.status || 'N/A',
        })),
        total: filteredDocs.length,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
      };
    },
    enabled: !!currentDocumentId,
    staleTime: 30_000,
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}

// ============================================================================
// Duplicate Comparison
// ============================================================================

export interface DuplicateComparisonData {
  currentDocument: {
    id: string;
    fileName?: string;
    pipelineStatus: string;
    approvalStatus: string;
    createdAt: string;
    revision: RevisionWithLineItems | null;
    pdfUrl: string;
    pages: Array<{
      pageNumber: number;
      imageUrl: string;
      width: number;
      height: number;
    }>;
  };
  duplicateDocument: {
    id: string;
    fileName?: string;
    pipelineStatus: string;
    approvalStatus: string;
    createdAt: string;
    revision: RevisionWithLineItems | null;
    pdfUrl: string;
    pages: Array<{
      pageNumber: number;
      imageUrl: string;
      width: number;
      height: number;
    }>;
  };
  comparison: {
    duplicateScore: number | null;
    duplicateReason: string | null;
    fieldComparison: Array<{
      field: string;
      currentValue: string | null;
      duplicateValue: string | null;
      isMatch: boolean;
    }>;
  };
}

async function fetchDuplicateComparison(documentId: string): Promise<DuplicateComparisonData> {
  const response = await fetch(`/api/processing-documents/${documentId}/duplicate-of`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to fetch duplicate comparison');
  }
  const result = await response.json();
  return result.data;
}

/**
 * Hook for fetching duplicate comparison data for side-by-side view
 */
export function useDuplicateComparison(documentId: string, enabled = true) {
  return useQuery({
    queryKey: ['duplicate-comparison', documentId],
    queryFn: () => fetchDuplicateComparison(documentId),
    enabled: enabled && !!documentId,
    staleTime: 30_000,
    retry: false, // Don't retry if no duplicate exists
  });
}
