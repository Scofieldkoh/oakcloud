'use client';

import { useQuery } from '@tanstack/react-query';

export interface CompanyOption {
  id: string;
  name: string;
  uen?: string | null;
  primarySsicDescription?: string | null;
  homeCurrency?: string | null;
}

interface CompanyOptionsResponse {
  options: CompanyOption[];
}

interface UseAllCompanyOptionsOptions {
  enabled?: boolean;
}

/**
 * Compatibility hook for older imports.
 *
 * This intentionally uses the capped `/api/companies/options` endpoint instead
 * of paginating through the full `/api/companies` list.
 */
export function useAllCompanyOptions(
  tenantId?: string | null,
  options: UseAllCompanyOptionsOptions = {}
) {
  return useQuery({
    queryKey: ['company-options', tenantId ?? null, 'compat'],
    queryFn: async ({ signal }): Promise<CompanyOption[]> => {
      const params = new URLSearchParams({ limit: '50' });

      if (tenantId) {
        params.set('tenantId', tenantId);
      }

      const response = await fetch(`/api/companies/options?${params.toString()}`, { signal });

      if (!response.ok) {
        throw new Error('Failed to fetch company options');
      }

      const payload = await response.json() as CompanyOptionsResponse;
      return payload.options;
    },
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
