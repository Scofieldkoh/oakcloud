'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TemplatePartial } from '@/generated/prisma';
import type {
  CreateTemplatePartialInput,
  UpdateTemplatePartialInput,
  SearchTemplatePartialsInput,
} from '@/lib/validations/template-partial';

// ============================================================================
// Types
// ============================================================================

export interface TemplatePartialWithRelations extends TemplatePartial {
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    usedInTemplates: number;
  };
}

export interface SearchPartialsResult {
  partials: TemplatePartialWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PartialUsageInfo {
  templateId: string;
  templateName: string;
  category: string;
}

export interface PartialUsageResult {
  partialId: string;
  usageCount: number;
  templates: PartialUsageInfo[];
}

// ============================================================================
// Query Keys
// ============================================================================

export const partialKeys = {
  all: ['template-partials'] as const,
  lists: () => [...partialKeys.all, 'list'] as const,
  list: (params: SearchTemplatePartialsInput) => [...partialKeys.lists(), params] as const,
  allList: () => [...partialKeys.all, 'all'] as const,
  details: () => [...partialKeys.all, 'detail'] as const,
  detail: (id: string) => [...partialKeys.details(), id] as const,
  usage: (id: string) => [...partialKeys.all, 'usage', id] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchPartials(
  params: SearchTemplatePartialsInput,
  tenantId?: string
): Promise<SearchPartialsResult> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (tenantId) searchParams.set('tenantId', tenantId);

  const response = await fetch(`/api/template-partials?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch partials');
  }
  return response.json();
}

async function fetchAllPartials(tenantId?: string): Promise<{ partials: Pick<TemplatePartial, 'id' | 'name' | 'displayName' | 'description' | 'placeholders'>[] }> {
  const searchParams = new URLSearchParams({ all: 'true' });
  if (tenantId) searchParams.set('tenantId', tenantId);
  const response = await fetch(`/api/template-partials?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch partials');
  }
  return response.json();
}

async function fetchPartial(id: string, tenantId?: string): Promise<TemplatePartialWithRelations> {
  const searchParams = new URLSearchParams({ includeUsage: 'true' });
  if (tenantId) searchParams.set('tenantId', tenantId);
  const response = await fetch(`/api/template-partials/${id}?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch partial');
  }
  return response.json();
}

async function fetchPartialUsage(id: string, tenantId?: string): Promise<PartialUsageResult> {
  const searchParams = new URLSearchParams();
  if (tenantId) searchParams.set('tenantId', tenantId);
  const queryStr = searchParams.toString();
  const response = await fetch(`/api/template-partials/${id}/usage${queryStr ? `?${queryStr}` : ''}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch partial usage');
  }
  return response.json();
}

async function createPartial(data: CreateTemplatePartialInput & { tenantId?: string }): Promise<TemplatePartial> {
  const response = await fetch('/api/template-partials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create partial');
  }
  return response.json();
}

async function updatePartial(
  data: UpdateTemplatePartialInput & { reason?: string; tenantId?: string }
): Promise<TemplatePartial> {
  const { id, reason, tenantId, ...updates } = data;
  const response = await fetch(`/api/template-partials/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...updates, reason, tenantId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update partial');
  }
  return response.json();
}

async function deletePartial(id: string, reason?: string, tenantId?: string): Promise<void> {
  const searchParams = new URLSearchParams();
  if (reason) searchParams.set('reason', reason);
  if (tenantId) searchParams.set('tenantId', tenantId);
  const queryStr = searchParams.toString();
  const response = await fetch(`/api/template-partials/${id}${queryStr ? `?${queryStr}` : ''}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete partial');
  }
}

async function duplicatePartial(id: string, name: string, tenantId?: string): Promise<TemplatePartial> {
  const response = await fetch(`/api/template-partials/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tenantId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to duplicate partial');
  }
  return response.json();
}

// ============================================================================
// Hooks
// ============================================================================

export interface UseTemplatePartialsOptions extends Partial<SearchTemplatePartialsInput> {
  tenantId?: string;
}

export function useTemplatePartials(options: UseTemplatePartialsOptions = {}) {
  const { tenantId, ...params } = options;
  const fullParams: SearchTemplatePartialsInput = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    sortBy: params.sortBy ?? 'name',
    sortOrder: params.sortOrder ?? 'asc',
    search: params.search,
  };

  return useQuery({
    queryKey: [...partialKeys.list(fullParams), tenantId],
    queryFn: () => fetchPartials(fullParams, tenantId),
    enabled: tenantId !== undefined ? !!tenantId : true,
  });
}

export function useAllTemplatePartials(tenantId?: string) {
  return useQuery({
    queryKey: [...partialKeys.allList(), tenantId],
    queryFn: () => fetchAllPartials(tenantId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: tenantId !== undefined ? !!tenantId : true,
  });
}

export function useTemplatePartial(id: string | null, tenantId?: string) {
  return useQuery({
    queryKey: [...partialKeys.detail(id || ''), tenantId],
    queryFn: () => fetchPartial(id!, tenantId),
    enabled: !!id && (tenantId !== undefined ? !!tenantId : true),
  });
}

export function usePartialUsage(id: string | null, tenantId?: string) {
  return useQuery({
    queryKey: [...partialKeys.usage(id || ''), tenantId],
    queryFn: () => fetchPartialUsage(id!, tenantId),
    enabled: !!id && (tenantId !== undefined ? !!tenantId : true),
  });
}

export function useCreatePartial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPartial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partialKeys.all });
    },
  });
}

export function useUpdatePartial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePartial,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: partialKeys.all });
      queryClient.setQueryData(partialKeys.detail(data.id), data);
    },
  });
}

export function useDeletePartial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason, tenantId }: { id: string; reason?: string; tenantId?: string }) =>
      deletePartial(id, reason, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partialKeys.all });
    },
  });
}

export function useDuplicatePartial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, tenantId }: { id: string; name: string; tenantId?: string }) =>
      duplicatePartial(id, name, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: partialKeys.all });
    },
  });
}
