/**
 * User Preferences Hooks
 *
 * Small utilities for persisting per-user UI state.
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface UserPreferenceResponse<T = unknown> {
  key: string;
  value: T | null;
  updatedAt: string | null;
}

async function fetchUserPreference<T>(key: string): Promise<UserPreferenceResponse<T>> {
  const params = new URLSearchParams({ key });
  const response = await fetch(`/api/user-preferences?${params}`);
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error?.message || 'Failed to fetch user preference');
  }
  const result = await response.json();
  return result.data as UserPreferenceResponse<T>;
}

async function upsertUserPreference<T>(key: string, value: T): Promise<UserPreferenceResponse<T>> {
  const response = await fetch('/api/user-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error?.message || 'Failed to save user preference');
  }
  const result = await response.json();
  return result.data as UserPreferenceResponse<T>;
}

export function useUserPreference<T>(key: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['user-preference', key],
    queryFn: () => fetchUserPreference<T>(key),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertUserPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async <T,>({ key, value }: { key: string; value: T }) => upsertUserPreference(key, value),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preference', data.key], { ...data });
    },
  });
}

