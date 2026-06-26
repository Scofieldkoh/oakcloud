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
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import type { AsyncSearchSelectOption } from '@/components/ui/async-search-select';

export interface CompanySearchOption extends AsyncSearchSelectOption {
  id: string;
  name: string;
  label: string;
  description: string;
  uen: string | null;
  primarySsicDescription?: string | null;
  homeCurrency?: string | null;
}

interface CompanySearchResult {
  options: Array<{
    id: string;
    name: string;
    uen: string | null;
    primarySsicDescription?: string | null;
    homeCurrency?: string | null;
  }>;
}

interface UseCompanySearchOptions {
  /** Whether the search query is allowed to run */
  enabled?: boolean;
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
  const { enabled = true, minChars = 2, limit = 10, excludeIds = [] } = options;

  const { data: session } = useSession();
  const activeTenantId = useActiveWorkspaceId(
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
        q: searchQuery,
        limit: String(limit),
      });
      if (activeTenantId) {
        params.set('tenantId', activeTenantId);
      }

      const response = await fetch(`/api/companies/options?${params}`);
      if (!response.ok) {
        throw new Error('Failed to search companies');
      }
      return response.json();
    },
    enabled: enabled && shouldSearch,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Transform to AsyncSearchSelectOption format and filter out excluded IDs
  const companyOptions: CompanySearchOption[] = useMemo(() => {
    if (!data?.options) return [];

    const excludeSet = new Set(excludeIds);

    return data.options
      .filter((company) => !excludeSet.has(company.id))
      .map((company) => ({
        id: company.id,
        name: company.name,
        label: company.name,
        description: company.uen || company.primarySsicDescription || '',
        uen: company.uen,
        primarySsicDescription: company.primarySsicDescription,
        homeCurrency: company.homeCurrency,
      }));
  }, [data?.options, excludeIds]);

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
  const activeTenantId = useActiveWorkspaceId(
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
  const activeTenantId = useActiveWorkspaceId(
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
            q: query,
            limit: String(limit),
          });
          if (activeTenantId) {
            params.set('tenantId', activeTenantId);
          }

          const response = await fetch(`/api/companies/options?${params}`);
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
