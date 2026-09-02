'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type SharePointPickerMode = 'browse' | 'client-folder' | 'destination';

export interface SharePointFolderOption {
  id: string;
  driveId: string;
  name: string;
  webUrl: string;
  childCount: number;
  parentItemId: string;
}

export interface SharePointFolderPage {
  folders: SharePointFolderOption[];
  nextCursor?: string;
  total: number;
}

interface UseSharePointFoldersInput {
  connectorId?: string;
  parentItemId?: string;
  mode?: SharePointPickerMode;
  query?: string;
  cursor?: string;
  rootItemId?: string;
  enabled?: boolean;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'SharePoint folder request failed');
  return body as T;
}

export function useSharePointFolders(input: UseSharePointFoldersInput) {
  const params = new URLSearchParams();
  if (input.connectorId) params.set('connectorId', input.connectorId);
  if (input.parentItemId) params.set('parentItemId', input.parentItemId);
  if (input.mode) params.set('mode', input.mode);
  if (input.query) params.set('query', input.query);
  if (input.cursor) params.set('cursor', input.cursor);
  if (input.rootItemId) params.set('rootItemId', input.rootItemId);
  params.set('pageSize', '100');
  return useQuery<SharePointFolderPage>({
    queryKey: ['sharepoint-folders', input.connectorId, input.parentItemId, input.mode ?? 'browse', input.query ?? '', input.cursor ?? '', input.rootItemId ?? ''],
    queryFn: async () => readJson<SharePointFolderPage>(await fetch(`/api/sharepoint/folders?${params.toString()}`)),
    enabled: Boolean(input.enabled !== false && input.connectorId && input.parentItemId),
    staleTime: 30_000,
  });
}

export function useCreateSharePointFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectorId: string; parentItemId: string; name: string; mode?: SharePointPickerMode; rootItemId?: string }) => readJson<SharePointFolderOption>(await fetch('/api/sharepoint/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })),
    onSuccess: (_folder, input) => {
      queryClient.invalidateQueries({ queryKey: ['sharepoint-folders', input.connectorId, input.parentItemId] });
    },
  });
}

export function useSharePointFilingSettings(connectorId?: string) {
  return useQuery({
    queryKey: ['sharepoint-filing-settings', connectorId],
    queryFn: async () => readJson<Record<string, unknown>>(await fetch(`/api/settings/sharepoint-filing?connectorId=${encodeURIComponent(connectorId!)}`)),
    enabled: Boolean(connectorId),
    staleTime: 30_000,
  });
}

export function useUpdateSharePointFilingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => readJson<Record<string, unknown>>(await fetch('/api/settings/sharepoint-filing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })),
    onSuccess: (_data, input) => queryClient.invalidateQueries({ queryKey: ['sharepoint-filing-settings', input.connectorId] }),
  });
}

