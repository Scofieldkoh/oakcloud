'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Company, CompanyStatus, EntityType } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';
import type { CreateCompanyInput, UpdateCompanyInput } from '@/lib/validations/company';

interface CompanyWithRelations extends Company {
  addresses?: Array<{
    id: string;
    addressType: string;
    fullAddress: string;
    isCurrent: boolean;
    effectiveFrom?: Date | null;
  }>;
  officers?: Array<{
    id: string;
    name: string;
    role: string;
    designation?: string | null;
    nationality?: string | null;
    address?: string | null;
    appointmentDate?: Date | null;
    cessationDate?: Date | null;
    isCurrent: boolean;
    contactId?: string | null;
    contact?: {
      id: string;
      email?: string | null;
      phone?: string | null;
    } | null;
  }>;
  shareholders?: Array<{
    id: string;
    name: string;
    shareholderType?: string | null;
    nationality?: string | null;
    placeOfOrigin?: string | null;
    address?: string | null;
    shareClass?: string | null;
    numberOfShares: number;
    percentageHeld: Decimal | null;
    currency?: string | null;
    allotmentDate?: Date | null;
    isCurrent: boolean;
    contactId?: string | null;
    contact?: {
      id: string;
      email?: string | null;
      phone?: string | null;
    } | null;
  }>;
  charges?: Array<{
    id: string;
    chargeNumber?: string | null;
    chargeType?: string | null;
    description?: string | null;
    chargeHolderName: string;
    amountSecured?: Decimal | null;
    amountSecuredText?: string | null;
    currency?: string | null;
    registrationDate?: Date | null;
    dischargeDate?: Date | null;
    isFullyDischarged: boolean;
  }>;
  _count?: {
    documents: number;
    officers: number;
    shareholders: number;
    charges: number;
  };
}

interface CompanySearchParams {
  query?: string;
  entityType?: EntityType;
  status?: CompanyStatus;
  hasCharges?: boolean;
  financialYearEndMonth?: number;
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

interface CompanyStats {
  total: number;
  byStatus: Record<string, number>;
  byEntityType: Record<string, number>;
  recentlyAdded: number;
  withOverdueFilings: number;
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

async function fetchCompanyStats(): Promise<CompanyStats> {
  const response = await fetch('/api/companies/stats');
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

export function useCompanies(params: CompanySearchParams = {}) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: () => fetchCompanies(params),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => fetchCompany(id),
    enabled: !!id,
  });
}

export function useCompanyStats() {
  return useQuery({
    queryKey: ['company-stats'],
    queryFn: fetchCompanyStats,
  });
}

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
