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
} from '@prisma/client';

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
  decision: 'NOT_DUPLICATE' | 'IS_DUPLICATE' | 'IS_VERSION',
  duplicateOfId?: string,
  reason?: string
): Promise<{ decisionId: string; duplicateStatus: DuplicateStatus }> {
  const response = await fetch(`/api/processing-documents/${documentId}/duplicate-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, duplicateOfId, reason }),
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
    queryKey: ['processing-documents', params],
    queryFn: () => fetchProcessingDocuments(params),
    staleTime: 30_000, // 30 seconds
  });
}

export function useProcessingDocument(id: string) {
  return useQuery({
    queryKey: ['processing-document', id],
    queryFn: () => fetchProcessingDocument(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useRevisionHistory(documentId: string) {
  return useQuery({
    queryKey: ['revision-history', documentId],
    queryFn: () => fetchRevisionHistory(documentId),
    enabled: !!documentId,
    staleTime: 30_000,
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
      decision,
      duplicateOfId,
      reason,
    }: {
      documentId: string;
      decision: 'NOT_DUPLICATE' | 'IS_DUPLICATE' | 'IS_VERSION';
      duplicateOfId?: string;
      reason?: string;
    }) => recordDuplicateDecision(documentId, decision, duplicateOfId, reason),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['processing-document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['processing-documents'] });
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
  });
}

// Update revision with line item changes
async function updateRevision(
  documentId: string,
  revisionId: string,
  lockVersion: number,
  data: {
    headerUpdates?: Partial<{
      vendorName: string;
      documentNumber: string;
      documentDate: string;
      dueDate: string;
      subtotal: string;
      taxAmount: string;
      totalAmount: string;
      gstTreatment: string;
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
type BulkOperation = 'APPROVE' | 'TRIGGER_EXTRACTION' | 'ARCHIVE';

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
