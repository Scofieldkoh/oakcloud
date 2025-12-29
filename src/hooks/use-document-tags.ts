/**
 * Document Tags Hooks
 *
 * React hooks for document tag operations, including
 * listing, creating, updating, deleting tags, and managing
 * document-tag associations.
 *
 * @module hooks/use-document-tags
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TagColor } from '@/generated/prisma';

// ============================================================================
// Types
// ============================================================================

export type TagScope = 'tenant' | 'company';

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
  description: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  companyId: string | null; // null = tenant tag, uuid = company tag
  scope: TagScope; // 'tenant' or 'company' for UI
}

export interface DocumentTag {
  id: string;
  tagId: string;
  name: string;
  color: TagColor;
  addedAt: string;
  addedById: string;
  scope: TagScope; // 'tenant' or 'company'
}

// ============================================================================
// API Functions
// ============================================================================

// --- Tenant Tags ---

async function fetchTenantTags(): Promise<Tag[]> {
  const response = await fetch('/api/tags');
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch tenant tags');
  }
  const result = await response.json();
  return result.tags;
}

async function createTenantTagApi(data: {
  name: string;
  color?: TagColor;
  description?: string;
}): Promise<Tag> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create tenant tag');
  }
  const result = await response.json();
  return result.tag;
}

async function updateTenantTagApi(
  tagId: string,
  data: { name?: string; color?: TagColor; description?: string | null }
): Promise<Tag> {
  const response = await fetch(`/api/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update tenant tag');
  }
  const result = await response.json();
  return result.tag;
}

async function deleteTenantTagApi(tagId: string): Promise<void> {
  const response = await fetch(`/api/tags/${tagId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete tenant tag');
  }
}

// --- Available Tags (Tenant + Company) ---

async function fetchAvailableTags(companyId?: string): Promise<Tag[]> {
  const url = companyId
    ? `/api/tags/available?companyId=${companyId}`
    : '/api/tags/available';
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch available tags');
  }
  const result = await response.json();
  return result.tags;
}

async function fetchAvailableRecentTags(companyId?: string): Promise<Tag[]> {
  const url = companyId
    ? `/api/tags/available?companyId=${companyId}&recent=true`
    : '/api/tags/available?recent=true';
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch recent tags');
  }
  const result = await response.json();
  return result.tags;
}

async function searchAvailableTags(companyId: string | undefined, query: string): Promise<Tag[]> {
  const url = companyId
    ? `/api/tags/available?companyId=${companyId}&query=${encodeURIComponent(query)}`
    : `/api/tags/available?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to search tags');
  }
  const result = await response.json();
  return result.tags;
}

// --- Company Tags ---

async function fetchCompanyTags(companyId: string): Promise<Tag[]> {
  const response = await fetch(`/api/companies/${companyId}/tags`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch tags');
  }
  const result = await response.json();
  return result.tags;
}

async function fetchRecentTags(companyId: string): Promise<Tag[]> {
  const response = await fetch(`/api/companies/${companyId}/tags?recent=true`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch recent tags');
  }
  const result = await response.json();
  return result.tags;
}

async function searchCompanyTags(companyId: string, query: string): Promise<Tag[]> {
  const response = await fetch(
    `/api/companies/${companyId}/tags?query=${encodeURIComponent(query)}`
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to search tags');
  }
  const result = await response.json();
  return result.tags;
}

async function fetchDocumentTags(documentId: string): Promise<DocumentTag[]> {
  const response = await fetch(`/api/processing-documents/${documentId}/tags`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch document tags');
  }
  const result = await response.json();
  return result.tags;
}

async function createTag(
  companyId: string,
  data: { name: string; color?: TagColor; description?: string }
): Promise<Tag> {
  const response = await fetch(`/api/companies/${companyId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create tag');
  }
  const result = await response.json();
  return result.tag;
}

async function updateTag(
  companyId: string,
  tagId: string,
  data: { name?: string; color?: TagColor; description?: string | null }
): Promise<Tag> {
  const response = await fetch(`/api/companies/${companyId}/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update tag');
  }
  const result = await response.json();
  return result.tag;
}

async function deleteTag(companyId: string, tagId: string): Promise<void> {
  const response = await fetch(`/api/companies/${companyId}/tags/${tagId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete tag');
  }
}

async function addTagToDocument(
  documentId: string,
  data: { tagId: string } | { name: string; color?: TagColor }
): Promise<DocumentTag> {
  const response = await fetch(`/api/processing-documents/${documentId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to add tag');
  }
  const result = await response.json();
  return result.tag;
}

async function removeTagFromDocument(documentId: string, tagId: string): Promise<void> {
  const response = await fetch(`/api/processing-documents/${documentId}/tags/${tagId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to remove tag');
  }
}

// ============================================================================
// Hooks - Tenant Tags (Shared across all companies)
// ============================================================================

/**
 * Fetch all tenant (shared) tags
 */
export function useTenantTags() {
  return useQuery({
    queryKey: ['tenant-tags'],
    queryFn: fetchTenantTags,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Create a tenant (shared) tag - admin only
 */
export function useCreateTenantTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      color,
      description,
    }: {
      name: string;
      color?: TagColor;
      description?: string;
    }) => createTenantTagApi({ name, color, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-tags'] });
      queryClient.invalidateQueries({ queryKey: ['available-tags'] });
    },
  });
}

/**
 * Update a tenant (shared) tag - admin only
 */
export function useUpdateTenantTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tagId,
      name,
      color,
      description,
    }: {
      tagId: string;
      name?: string;
      color?: TagColor;
      description?: string | null;
    }) => updateTenantTagApi(tagId, { name, color, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-tags'] });
      queryClient.invalidateQueries({ queryKey: ['available-tags'] });
      queryClient.invalidateQueries({ queryKey: ['document-tags'] });
    },
  });
}

/**
 * Delete a tenant (shared) tag - admin only
 */
export function useDeleteTenantTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId }: { tagId: string }) => deleteTenantTagApi(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-tags'] });
      queryClient.invalidateQueries({ queryKey: ['available-tags'] });
      queryClient.invalidateQueries({ queryKey: ['document-tags'] });
    },
  });
}

// ============================================================================
// Hooks - Available Tags (Tenant + Company combined)
// ============================================================================

/**
 * Fetch all available tags (tenant tags + company tags if companyId provided)
 * This is the main hook for UI that needs to show all applicable tags
 */
export function useAvailableTags(companyId?: string | null) {
  return useQuery({
    queryKey: ['available-tags', companyId ?? null],
    queryFn: () => fetchAvailableTags(companyId || undefined),
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Fetch recent available tags (from both scopes)
 */
export function useAvailableRecentTags(companyId?: string | null) {
  return useQuery({
    queryKey: ['available-recent-tags', companyId ?? null],
    queryFn: () => fetchAvailableRecentTags(companyId || undefined),
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Search available tags by name (across both scopes)
 */
export function useSearchAvailableTags(companyId: string | null | undefined, query: string) {
  return useQuery({
    queryKey: ['search-available-tags', companyId ?? null, query],
    queryFn: () => searchAvailableTags(companyId || undefined, query),
    enabled: query.length > 0,
    staleTime: 30_000, // 30 seconds
  });
}

// ============================================================================
// Hooks - Company Tags (Company-specific only)
// ============================================================================

/**
 * Fetch all tags for a company (excludes tenant tags)
 */
export function useCompanyTags(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['company-tags', companyId],
    queryFn: () => fetchCompanyTags(companyId!),
    enabled: !!companyId,
    staleTime: 60_000, // 1 minute
  });
}

/**
 * Fetch recent tags for a company (for autocomplete)
 */
export function useRecentTags(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['recent-tags', companyId],
    queryFn: () => fetchRecentTags(companyId!),
    enabled: !!companyId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Search tags by name (for autocomplete)
 */
export function useSearchTags(companyId: string | null | undefined, query: string) {
  return useQuery({
    queryKey: ['search-tags', companyId, query],
    queryFn: () => searchCompanyTags(companyId!, query),
    enabled: !!companyId && query.length > 0,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Create a new tag
 */
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      name,
      color,
      description,
    }: {
      companyId: string;
      name: string;
      color?: TagColor;
      description?: string;
    }) => createTag(companyId, { name, color, description }),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['company-tags', companyId] });
    },
  });
}

/**
 * Update an existing tag
 */
export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      tagId,
      name,
      color,
      description,
    }: {
      companyId: string;
      tagId: string;
      name?: string;
      color?: TagColor;
      description?: string | null;
    }) => updateTag(companyId, tagId, { name, color, description }),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['company-tags', companyId] });
      queryClient.invalidateQueries({ queryKey: ['recent-tags', companyId] });
      queryClient.invalidateQueries({ queryKey: ['search-tags', companyId] });
    },
  });
}

/**
 * Delete a tag
 */
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, tagId }: { companyId: string; tagId: string }) =>
      deleteTag(companyId, tagId),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['company-tags', companyId] });
      queryClient.invalidateQueries({ queryKey: ['recent-tags', companyId] });
      queryClient.invalidateQueries({ queryKey: ['search-tags', companyId] });
      // Also invalidate document tags since removed tag won't appear anymore
      queryClient.invalidateQueries({ queryKey: ['document-tags'] });
    },
  });
}

// ============================================================================
// Hooks - Document Tags
// ============================================================================

/**
 * Fetch tags for a document
 */
export function useDocumentTags(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['document-tags', documentId],
    queryFn: () => fetchDocumentTags(documentId!),
    enabled: !!documentId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Add a tag to a document
 */
export function useAddDocumentTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tagId,
    }: {
      documentId: string;
      tagId: string;
      companyId?: string; // For cache invalidation
    }) => addTagToDocument(documentId, { tagId }),
    onSuccess: (_, { documentId, companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['document-tags', documentId] });
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: ['recent-tags', companyId] });
        queryClient.invalidateQueries({ queryKey: ['company-tags', companyId] });
      }
    },
  });
}

/**
 * Create a new tag and add it to a document
 */
export function useCreateAndAddTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      name,
      color,
    }: {
      documentId: string;
      name: string;
      color?: TagColor;
      companyId?: string; // For cache invalidation
    }) => addTagToDocument(documentId, { name, color }),
    onSuccess: (_, { documentId, companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['document-tags', documentId] });
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: ['recent-tags', companyId] });
        queryClient.invalidateQueries({ queryKey: ['company-tags', companyId] });
        queryClient.invalidateQueries({ queryKey: ['search-tags', companyId] });
      }
    },
  });
}

/**
 * Remove a tag from a document
 */
export function useRemoveDocumentTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tagId,
    }: {
      documentId: string;
      tagId: string;
    }) => removeTagFromDocument(documentId, tagId),
    onSuccess: (_, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['document-tags', documentId] });
    },
  });
}
