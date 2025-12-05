'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export type EntityType = 'company' | 'contact';

export interface NoteTab {
  id: string;
  title: string;
  content: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface CreateNoteTabInput {
  title?: string;
  content?: string;
}

interface UpdateNoteTabInput {
  title?: string;
  content?: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchNoteTabs(
  entityType: EntityType,
  entityId: string
): Promise<NoteTab[]> {
  const baseUrl = entityType === 'company' ? 'companies' : 'contacts';
  const response = await fetch(`/api/${baseUrl}/${entityId}/notes`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch notes');
  }

  return response.json();
}

async function createNoteTab(
  entityType: EntityType,
  entityId: string,
  data: CreateNoteTabInput
): Promise<NoteTab> {
  const baseUrl = entityType === 'company' ? 'companies' : 'contacts';
  const response = await fetch(`/api/${baseUrl}/${entityId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create note tab');
  }

  return response.json();
}

async function updateNoteTab(
  entityType: EntityType,
  entityId: string,
  tabId: string,
  data: UpdateNoteTabInput
): Promise<NoteTab> {
  const baseUrl = entityType === 'company' ? 'companies' : 'contacts';
  const response = await fetch(`/api/${baseUrl}/${entityId}/notes/${tabId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update note tab');
  }

  return response.json();
}

async function deleteNoteTab(
  entityType: EntityType,
  entityId: string,
  tabId: string
): Promise<void> {
  const baseUrl = entityType === 'company' ? 'companies' : 'contacts';
  const response = await fetch(`/api/${baseUrl}/${entityId}/notes/${tabId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete note tab');
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to fetch note tabs for an entity
 */
export function useNoteTabs(entityType: EntityType, entityId: string) {
  return useQuery({
    queryKey: ['notes', entityType, entityId],
    queryFn: () => fetchNoteTabs(entityType, entityId),
    enabled: !!entityId,
  });
}

/**
 * Hook to create a new note tab
 */
export function useCreateNoteTab(entityType: EntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateNoteTabInput) =>
      createNoteTab(entityType, entityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notes', entityType, entityId],
      });
    },
  });
}

/**
 * Hook to update a note tab
 */
export function useUpdateNoteTab(entityType: EntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tabId, data }: { tabId: string; data: UpdateNoteTabInput }) =>
      updateNoteTab(entityType, entityId, tabId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notes', entityType, entityId],
      });
    },
  });
}

/**
 * Hook to delete a note tab
 */
export function useDeleteNoteTab(entityType: EntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tabId: string) => deleteNoteTab(entityType, entityId, tabId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['notes', entityType, entityId],
      });
    },
  });
}
