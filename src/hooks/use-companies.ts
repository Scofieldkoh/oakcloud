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
  }>;
  officers?: Array<{
    id: string;
    name: string;
    role: string;
    isCurrent: boolean;
    appointmentDate?: Date;
    cessationDate?: Date;
  }>;
  shareholders?: Array<{
    id: string;
    name: string;
    numberOfShares: number;
    percentageHeld: Decimal | null;
    isCurrent: boolean;
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

async function createCompany(data: CreateCompanyInput): Promise<Company> {
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
    mutationFn: createCompany,
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
