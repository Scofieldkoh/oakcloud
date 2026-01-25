/**
 * Company Management Hooks
 *
 * React hooks for company CRUD operations, search, and statistics.
 * Uses TanStack Query for caching, optimistic updates, and automatic invalidation.
 *
 * @module hooks/use-companies
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Company, CompanyStatus, EntityType } from '@/generated/prisma';
import type { CreateCompanyInput, UpdateCompanyInput } from '@/lib/validations/company';
import type { CompanyWithRelations, CompanyStats, CompanyLinkInfo } from '@/services/company/types';

interface CompanySearchParams {
  query?: string;
  uen?: string;
  address?: string;
  hasWarnings?: boolean;
  entityType?: EntityType;
  status?: CompanyStatus;
  hasCharges?: boolean;
  financialYearEndMonth?: number;
  homeCurrency?: string;
  paidUpCapitalMin?: number;
  paidUpCapitalMax?: number;
  issuedCapitalMin?: number;
  issuedCapitalMax?: number;
  officersMin?: number;
  officersMax?: number;
  shareholdersMin?: number;
  shareholdersMax?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  tenantId?: string; // For SUPER_ADMIN to filter by tenant
}

interface CompanySearchResult {
  companies: CompanyWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function fetchCompanies(params: CompanySearchParams): Promise<CompanySearchResult> {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  });

  const response = await fetch(`/api/companies?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch companies');
  }
  return response.json();
}

async function fetchCompany(id: string): Promise<CompanyWithRelations> {
  const response = await fetch(`/api/companies/${id}?full=true`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch company');
  }
  return response.json();
}

async function fetchCompanyStats(tenantId?: string): Promise<CompanyStats> {
  const url = tenantId
    ? `/api/companies/stats?tenantId=${tenantId}`
    : '/api/companies/stats';
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch stats');
  }
  return response.json();
}

async function createCompany(data: CreateCompanyInput & { tenantId?: string }): Promise<Company> {
  const response = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create company');
  }
  return response.json();
}

async function updateCompany(id: string, data: UpdateCompanyInput): Promise<Company> {
  const response = await fetch(`/api/companies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update company');
  }
  return response.json();
}

async function deleteCompany(id: string, reason: string): Promise<Company> {
  const response = await fetch(`/api/companies/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete company');
  }
  return response.json();
}

async function bulkDeleteCompanies(ids: string[], reason: string): Promise<{ deleted: number; message: string }> {
  const response = await fetch('/api/companies/bulk', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete companies');
  }
  return response.json();
}

/**
 * Hook to search and list companies with pagination and filters
 *
 * @param params - Search parameters (query, filters, pagination)
 * @returns TanStack Query result with companies array and pagination info
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useCompanies({
 *   query: 'Acme',
 *   entityType: 'PRIVATE_LIMITED',
 *   page: 1,
 *   limit: 20,
 * });
 *
 * if (isLoading) return <Spinner />;
 * return <CompanyTable companies={data.companies} />;
 * ```
 */
export function useCompanies(params: CompanySearchParams = {}) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: () => fetchCompanies(params),
    staleTime: 30 * 1000, // 30 seconds - refetch on navigation after 30s
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    refetchOnMount: 'always', // Always refetch when component mounts
    placeholderData: (previousData) => previousData, // Keep previous data visible while fetching
  });
}

/**
 * Hook to fetch a single company with all relations
 *
 * @param id - Company ID
 * @returns TanStack Query result with company data including officers, shareholders, etc.
 *
 * @example
 * ```tsx
 * const { data: company, isLoading } = useCompany(companyId);
 *
 * if (isLoading) return <Spinner />;
 * return <CompanyDetails company={company} />;
 * ```
 */
export function useCompany(id: string) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => fetchCompany(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch company statistics for the current tenant
 *
 * @param tenantId - Optional tenant ID for SUPER_ADMIN to filter by specific tenant
 * @returns TanStack Query result with company statistics
 *
 * @example
 * ```tsx
 * const { data: stats } = useCompanyStats();
 *
 * return (
 *   <div>
 *     <span>Total: {stats?.total}</span>
 *     <span>Active: {stats?.byStatus.LIVE}</span>
 *   </div>
 * );
 * ```
 */
export function useCompanyStats(tenantId?: string) {
  return useQuery({
    queryKey: ['company-stats', tenantId],
    queryFn: () => fetchCompanyStats(tenantId),
    staleTime: 30 * 60 * 1000, // 30 minutes - stats change infrequently
    gcTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Prefetch a single company's data on hover for faster navigation
 */
export function usePrefetchCompany() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['company', id],
      queryFn: () => fetchCompany(id),
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  };
}

/**
 * Prefetch companies list data
 */
export function usePrefetchCompanies() {
  const queryClient = useQueryClient();

  return (params: CompanySearchParams = {}) => {
    queryClient.prefetchQuery({
      queryKey: ['companies', params],
      queryFn: () => fetchCompanies(params),
      staleTime: 5 * 60 * 1000, // 5 minutes
    });
  };
}

/**
 * Hook to create a new company
 *
 * Automatically invalidates company list and stats caches on success.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const createCompany = useCreateCompany();
 *
 * const handleSubmit = (data: CreateCompanyInput) => {
 *   createCompany.mutate(data, {
 *     onSuccess: () => toast.success('Company created'),
 *     onError: (error) => toast.error(error.message),
 *   });
 * };
 * ```
 */
export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompanyInput & { tenantId?: string }) => createCompany(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company-stats'] });
    },
  });
}

/**
 * Hook to update an existing company
 *
 * Automatically invalidates both company list and specific company caches on success.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const updateCompany = useUpdateCompany();
 *
 * const handleSave = (data: UpdateCompanyInput) => {
 *   updateCompany.mutate({ id: companyId, data }, {
 *     onSuccess: () => toast.success('Company updated'),
 *   });
 * };
 * ```
 */
export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCompanyInput }) =>
      updateCompany(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company', id] });
    },
  });
}

/**
 * Hook to delete a company (soft delete)
 *
 * Requires a reason for audit logging.
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const deleteCompany = useDeleteCompany();
 *
 * const handleDelete = () => {
 *   deleteCompany.mutate(
 *     { id: companyId, reason: 'Company no longer active' },
 *     { onSuccess: () => router.push('/companies') }
 *   );
 * };
 * ```
 */
export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteCompany(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company-stats'] });
    },
  });
}

/**
 * Hook to bulk delete multiple companies
 *
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const bulkDelete = useBulkDeleteCompanies();
 *
 * const handleBulkDelete = () => {
 *   bulkDelete.mutate(
 *     { ids: selectedIds, reason: 'Batch cleanup' },
 *     { onSuccess: (result) => toast.success(`Deleted ${result.deleted} companies`) }
 *   );
 * };
 * ```
 */
export function useBulkDeleteCompanies() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason: string }) =>
      bulkDeleteCompanies(ids, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company-stats'] });
    },
  });
}

// ============================================================================
// Company Link Info (for delete confirmation)
// ============================================================================

// Re-export for backward compatibility
export type { CompanyLinkInfo } from '@/services/company/types';

async function fetchCompanyLinkInfo(id: string): Promise<CompanyLinkInfo> {
  const res = await fetch(`/api/companies/${id}/links`);
  if (!res.ok) {
    throw new Error('Failed to fetch company link info');
  }
  return res.json();
}

export function useCompanyLinkInfo(id: string | null) {
  return useQuery({
    queryKey: ['company-links', id],
    queryFn: () => fetchCompanyLinkInfo(id!),
    enabled: !!id,
    staleTime: 30000, // Cache for 30 seconds
  });
}

// ============================================================================
// Officer Link Management
// ============================================================================

async function linkOfficer(companyId: string, officerId: string, contactId: string): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/officers/${officerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to link officer');
  }
}

async function unlinkOfficer(companyId: string, officerId: string): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/officers/${officerId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId: null }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to unlink officer');
  }
}

export function useLinkOfficer(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ officerId, contactId }: { officerId: string; contactId: string }) =>
      linkOfficer(companyId, officerId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

export function useUnlinkOfficer(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (officerId: string) => unlinkOfficer(companyId, officerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

async function updateOfficer(
  companyId: string,
  officerId: string,
  data: { appointmentDate?: string | null; cessationDate?: string | null }
): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/officers/${officerId}?action=update`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update officer');
  }
}

export function useUpdateOfficer(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      officerId,
      data,
    }: {
      officerId: string;
      data: { appointmentDate?: string | null; cessationDate?: string | null };
    }) => updateOfficer(companyId, officerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

async function removeOfficerFn(companyId: string, officerId: string): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/officers/${officerId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to remove officer');
  }
}

export function useRemoveOfficer(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (officerId: string) => removeOfficerFn(companyId, officerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

// ============================================================================
// Shareholder Link Management
// ============================================================================

async function linkShareholder(companyId: string, shareholderId: string, contactId: string): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/shareholders/${shareholderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to link shareholder');
  }
}

async function unlinkShareholder(companyId: string, shareholderId: string): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/shareholders/${shareholderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId: null }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to unlink shareholder');
  }
}

export function useLinkShareholder(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shareholderId, contactId }: { shareholderId: string; contactId: string }) =>
      linkShareholder(companyId, shareholderId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

export function useUnlinkShareholder(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareholderId: string) => unlinkShareholder(companyId, shareholderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

async function updateShareholderFn(
  companyId: string,
  shareholderId: string,
  data: { numberOfShares?: number; shareClass?: string }
): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/shareholders/${shareholderId}?action=update`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update shareholder');
  }
}

export function useUpdateShareholder(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      shareholderId,
      data,
    }: {
      shareholderId: string;
      data: { numberOfShares?: number; shareClass?: string };
    }) => updateShareholderFn(companyId, shareholderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

async function removeShareholderFn(companyId: string, shareholderId: string): Promise<void> {
  const res = await fetch(`/api/companies/${companyId}/shareholders/${shareholderId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to remove shareholder');
  }
}

export function useRemoveShareholder(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareholderId: string) => removeShareholderFn(companyId, shareholderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

// ============================================================================
// BizFile Availability Check
// ============================================================================

interface BizFileInfo {
  processingDocumentId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  documentDate: string | null;
  receiptNo: string | null;
  pdfUrl: string;
}

async function fetchCompanyBizFile(companyId: string): Promise<BizFileInfo> {
  const res = await fetch(`/api/companies/${companyId}/bizfile`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('NOT_FOUND');
    }
    throw new Error('Failed to fetch BizFile');
  }
  return res.json();
}

/**
 * Hook to check if a company has a BizFile available
 *
 * @param companyId - Company ID to check
 * @returns Query result with BizFile info if available, or null if not found
 */
export function useCompanyBizFile(companyId: string) {
  return useQuery({
    queryKey: ['company-bizfile', companyId],
    queryFn: () => fetchCompanyBizFile(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false, // Don't retry on 404
  });
}

// ============================================================================
// FYE Retrieval from ACRA
// ============================================================================

export interface FYERetrievalResult {
  financialYearEndDay: number;
  financialYearEndMonth: number;
}

async function retrieveFYE(companyId: string): Promise<FYERetrievalResult> {
  const res = await fetch(`/api/companies/${companyId}/retrieve-fye`);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to retrieve FYE from ACRA');
  }
  return res.json();
}

/**
 * Hook to retrieve Financial Year End from ACRA data
 *
 * Fetches account_due_date from data.gov.sg and calculates FYE based on company type.
 *
 * @param companyId - Company ID to retrieve FYE for
 * @returns Mutation object with mutate/mutateAsync functions
 *
 * @example
 * ```tsx
 * const retrieveFYE = useRetrieveFYE(companyId);
 *
 * const handleRetrieve = async () => {
 *   const result = await retrieveFYE.mutateAsync();
 *   setValue('financialYearEndDay', result.financialYearEndDay);
 *   setValue('financialYearEndMonth', result.financialYearEndMonth);
 * };
 * ```
 */
export function useRetrieveFYE(companyId: string) {
  return useMutation({
    mutationFn: () => retrieveFYE(companyId),
  });
}
