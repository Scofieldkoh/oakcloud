'use client';

import { useQuery } from '@tanstack/react-query';

export interface CompanyOption {
  id: string;
  name: string;
}

interface CompaniesPageResponse {
  companies: Array<{
    id: string;
    name: string;
  }>;
  totalPages: number;
}

const PAGE_LIMIT = 200;

export function useAllCompanyOptions(tenantId?: string | null) {
  return useQuery({
    queryKey: ['all-company-options', tenantId ?? null],
    queryFn: async ({ signal }): Promise<CompanyOption[]> => {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        sortBy: 'name',
        sortOrder: 'asc',
      });

      if (tenantId) {
        params.set('tenantId', tenantId);
      }

      const byId = new Map<string, string>();
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        params.set('page', String(page));
        const response = await fetch(`/api/companies?${params.toString()}`, { signal });

        if (!response.ok) {
          throw new Error('Failed to fetch company filter options');
        }

        const payload = await response.json() as CompaniesPageResponse;

        for (const company of payload.companies) {
          byId.set(company.id, company.name);
        }

        totalPages = Math.max(payload.totalPages || 1, 1);
        page += 1;
      }

      return Array.from(byId.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

