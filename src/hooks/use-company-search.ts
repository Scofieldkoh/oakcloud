/**
 * Company Search Hook for Async Search Select
 *
 * Provides a lightweight company search with debouncing for use with AsyncSearchSelect.
 * Returns companies in a format compatible with the AsyncSearchSelectOption interface.
 *
 * @module hooks/use-company-search
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import type { AsyncSearchSelectOption } from '@/components/ui/async-search-select';

export interface CompanySearchOption extends AsyncSearchSelectOption {
  id: string;
  label: string;
  description: string;
  uen: string;
}

interface CompanySearchResult {
  companies: Array<{
    id: string;
    name: string;
    uen: string;
    status: string;
  }>;
  total: number;
}

interface UseCompanySearchOptions {
  /** Minimum characters before search triggers */
  minChars?: number;
  /** Maximum results to return */
  limit?: number;
  /** Debounce delay in ms */
  debounceMs?: number;
  /** Filter out specific company IDs (e.g., companies already linked) */
  excludeIds?: string[];
}

/**
 * Hook for searching companies with debounced input
 *
 * @example
 * ```tsx
 * const {
 *   searchQuery,
 *   setSearchQuery,
 *   options,
 *   isLoading,
 *   selectedCompany,
 *   setSelectedCompany,
 * } = useCompanySearch({ excludeIds: existingCompanyIds });
 *
 * return (
 *   <AsyncSearchSelect
 *     value={selectedCompany?.id ?? ''}
 *     onChange={(id, item) => setSelectedCompany(item)}
 *     options={options}
 *     isLoading={isLoading}
 *     searchQuery={searchQuery}
 *     onSearchChange={setSearchQuery}
 *   />
 * );
 * ```
 */
export function useCompanySearch(options: UseCompanySearchOptions = {}) {
  const { minChars = 2, limit = 10, excludeIds = [] } = options;

  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanySearchOption | null>(null);

  // Only search if query meets minimum length
  const shouldSearch = searchQuery.length >= minChars;

  const { data, isLoading } = useQuery({
    queryKey: ['company-search', searchQuery, activeTenantId, limit],
    queryFn: async (): Promise<CompanySearchResult> => {
      const params = new URLSearchParams({
        query: searchQuery,
        limit: String(limit),
      });
      if (activeTenantId) {
        params.set('tenantId', activeTenantId);
      }

      const response = await fetch(`/api/companies?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search companies');
      }
      return response.json();
    },
    enabled: shouldSearch,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Transform to AsyncSearchSelectOption format and filter out excluded IDs
  const companyOptions: CompanySearchOption[] = useMemo(() => {
    if (!data?.companies) return [];

    const excludeSet = new Set(excludeIds);

    return data.companies
      .filter((company) => !excludeSet.has(company.id))
      .map((company) => ({
        id: company.id,
        label: company.name,
        description: company.uen,
        uen: company.uen,
      }));
  }, [data?.companies, excludeIds]);

  // Clear selection handler
  const clearSelection = useCallback(() => {
    setSelectedCompany(null);
    setSearchQuery('');
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    options: companyOptions,
    isLoading: shouldSearch && isLoading,
    selectedCompany,
    setSelectedCompany,
    clearSelection,
  };
}

/**
 * Hook to get companies linked to a contact (for exclusion or display)
 */
export function useContactLinkedCompanies(contactId: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: ['contact-linked-companies', contactId, activeTenantId],
    queryFn: async (): Promise<Array<{ id: string; name: string; uen: string }>> => {
      const url = activeTenantId
        ? `/api/contacts/${contactId}/companies?tenantId=${activeTenantId}`
        : `/api/contacts/${contactId}/companies`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch linked companies');
      }
      return response.json();
    },
    enabled: !!contactId,
  });
}

/**
 * Prefetch company data for quick access
 */
export function usePrefetchCompanySearch() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useCallback(
    (query: string, limit: number = 10) => {
      if (query.length < 2) return;

      queryClient.prefetchQuery({
        queryKey: ['company-search', query, activeTenantId, limit],
        queryFn: async () => {
          const params = new URLSearchParams({
            query,
            limit: String(limit),
          });
          if (activeTenantId) {
            params.set('tenantId', activeTenantId);
          }

          const response = await fetch(`/api/companies?${params}`);
          if (!response.ok) {
            throw new Error('Failed to search companies');
          }
          return response.json();
        },
        staleTime: 30 * 1000,
      });
    },
    [queryClient, activeTenantId]
  );
}
