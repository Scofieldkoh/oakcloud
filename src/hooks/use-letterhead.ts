'use client';

import { useQuery } from '@tanstack/react-query';
import type { PageMargins } from '@/lib/constants/a4';

// ============================================================================
// Types
// ============================================================================

export interface Letterhead {
  id: string;
  headerHtml: string | null;
  footerHtml: string | null;
  headerImageUrl: string | null;
  footerImageUrl: string | null;
  logoUrl: string | null;
  pageMargins: PageMargins;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LetterheadApiResponse {
  exists: boolean;
  letterhead: Letterhead | null;
  defaults?: {
    pageMargins: PageMargins;
  };
}

export interface UseLetterheadResult {
  letterhead: Letterhead | null;
  exists: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch tenant letterhead configuration
 *
 * @param tenantId - Optional tenant ID (required for super admins viewing other tenants)
 * @returns Letterhead data, loading state, and error
 *
 * @example
 * ```tsx
 * const { letterhead, exists, isLoading } = useLetterhead(tenantId);
 *
 * if (isLoading) return <Spinner />;
 *
 * if (exists && letterhead?.isEnabled) {
 *   // Show actual letterhead
 * } else {
 *   // Show placeholder
 * }
 * ```
 */
export function useLetterhead(tenantId?: string): UseLetterheadResult {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<LetterheadApiResponse>({
    queryKey: ['letterhead', tenantId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantId) {
        params.set('tenantId', tenantId);
      }

      const url = `/api/letterhead${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch letterhead' }));
        throw new Error(error.error || 'Failed to fetch letterhead');
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 1,
  });

  return {
    letterhead: data?.letterhead ?? null,
    exists: data?.exists ?? false,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Check if letterhead has any displayable content
 */
export function hasLetterheadContent(letterhead: Letterhead | null): boolean {
  if (!letterhead || !letterhead.isEnabled) return false;

  return !!(
    letterhead.headerHtml ||
    letterhead.footerHtml ||
    letterhead.headerImageUrl ||
    letterhead.footerImageUrl ||
    letterhead.logoUrl
  );
}

/**
 * Check if letterhead has header content
 */
export function hasHeaderContent(letterhead: Letterhead | null): boolean {
  if (!letterhead || !letterhead.isEnabled) return false;

  return !!(
    letterhead.headerHtml ||
    letterhead.headerImageUrl ||
    letterhead.logoUrl
  );
}

/**
 * Check if letterhead has footer content
 */
export function hasFooterContent(letterhead: Letterhead | null): boolean {
  if (!letterhead || !letterhead.isEnabled) return false;

  return !!(letterhead.footerHtml || letterhead.footerImageUrl);
}
