'use client';

import { useQuery } from '@tanstack/react-query';

export interface ContactOption {
  id: string;
  name: string;
}

interface ContactsPageResponse {
  contacts: Array<{
    id: string;
    fullName: string | null;
  }>;
  totalPages: number;
}

const PAGE_LIMIT = 200;

export function useAllContactOptions(tenantId?: string | null) {
  return useQuery({
    queryKey: ['all-contact-options', tenantId ?? null],
    queryFn: async ({ signal }): Promise<ContactOption[]> => {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        sortBy: 'fullName',
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
        const response = await fetch(`/api/contacts?${params.toString()}`, { signal });

        if (!response.ok) {
          throw new Error('Failed to fetch contact filter options');
        }

        const payload = await response.json() as ContactsPageResponse;

        for (const contact of payload.contacts) {
          if (!contact.fullName) continue;
          byId.set(contact.id, contact.fullName);
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

