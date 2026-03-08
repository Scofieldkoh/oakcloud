'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Form, FormStatus } from '@/generated/prisma';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import type { CreateFormInput, FormFieldInput, UpdateFormInput } from '@/lib/validations/form-builder';
import type {
  FormListItem,
  FormListResult,
  FormDetail,
  FormResponsesResult,
  FormResponseDetailResult,
  RecentFormSubmissionItem,
} from '@/services/form-builder.service';

export type { FormListItem, FormListResult, FormDetail, FormResponsesResult, FormResponseDetailResult };

export type RecentFormSubmission = Omit<RecentFormSubmissionItem, 'submittedAt' | 'status'> & {
  submittedAt: string;
  status: string;
};

export interface FormListParams {
  query?: string;
  status?: FormStatus;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

function withTenant(path: string, tenantId?: string | null): string {
  if (!tenantId) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}tenantId=${encodeURIComponent(tenantId)}`;
}

async function fetchForms(params: FormListParams, tenantId?: string | null): Promise<FormListResult> {
  const searchParams = new URLSearchParams();
  if (params.query) searchParams.set('query', params.query);
  if (params.status) searchParams.set('status', params.status);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const basePath = `/api/forms${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(withTenant(basePath, tenantId));

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch forms');
  }

  return response.json();
}

async function fetchForm(id: string, tenantId?: string | null): Promise<FormDetail> {
  const response = await fetch(withTenant(`/api/forms/${id}`, tenantId));
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch form');
  }

  return response.json();
}

async function fetchFormResponses(
  id: string,
  page: number,
  limit: number,
  draftPage: number,
  draftLimit: number,
  tenantId?: string | null
): Promise<FormResponsesResult> {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    draftPage: String(draftPage),
    draftLimit: String(draftLimit),
  });
  const response = await fetch(withTenant(`/api/forms/${id}/responses?${searchParams.toString()}`, tenantId));
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch responses');
  }

  return response.json();
}

async function fetchFormResponse(
  id: string,
  submissionId: string,
  tenantId?: string | null
): Promise<FormResponseDetailResult> {
  const response = await fetch(withTenant(`/api/forms/${id}/responses/${submissionId}`, tenantId));
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch response');
  }

  return response.json();
}

async function fetchRecentFormSubmissions(
  limit: number,
  tenantId?: string | null
): Promise<RecentFormSubmission[]> {
  const response = await fetch(withTenant(`/api/forms/recent-submissions?limit=${limit}`, tenantId));
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch recent submissions');
  }

  const data = await response.json();
  return Array.isArray(data.submissions) ? data.submissions : [];
}

async function createFormRequest(data: CreateFormInput & { tenantId?: string | null }): Promise<Form> {
  const response = await fetch('/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to create form');
  }

  return response.json();
}

async function updateFormRequest(
  id: string,
  data: UpdateFormInput & { fields?: FormFieldInput[]; reason?: string; tenantId?: string | null }
): Promise<FormDetail> {
  const response = await fetch(`/api/forms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update form');
  }

  return response.json();
}

async function duplicateFormRequest(
  id: string,
  title?: string,
  tenantId?: string | null
): Promise<FormDetail> {
  const response = await fetch(`/api/forms/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, tenantId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to duplicate form');
  }

  return response.json();
}

async function deleteFormRequest(id: string, tenantId?: string | null, reason?: string): Promise<Form> {
  const params = new URLSearchParams();
  if (tenantId) params.set('tenantId', tenantId);
  if (reason) params.set('reason', reason);

  const response = await fetch(`/api/forms/${id}${params.toString() ? `?${params.toString()}` : ''}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete form');
  }

  return response.json();
}

export const formKeys = {
  all: ['forms'] as const,
  lists: () => [...formKeys.all, 'list'] as const,
  list: (params: FormListParams, tenantId?: string | null) => [...formKeys.lists(), params, tenantId] as const,
  detail: (id: string, tenantId?: string | null) => [...formKeys.all, 'detail', id, tenantId] as const,
  responses: (id: string, page: number, limit: number, draftPage: number, draftLimit: number, tenantId?: string | null) =>
    [...formKeys.all, 'responses', id, page, limit, draftPage, draftLimit, tenantId] as const,
  responseDetail: (id: string, submissionId: string, tenantId?: string | null) =>
    [...formKeys.all, 'response-detail', id, submissionId, tenantId] as const,
  recentSubmissions: (limit: number, tenantId?: string | null) =>
    [...formKeys.all, 'recent-submissions', limit, tenantId] as const,
};

export function useForms(params: FormListParams = {}) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  const normalizedParams: FormListParams = {
    page: params.page ?? 1,
    limit: params.limit ?? 20,
    sortBy: params.sortBy ?? 'updatedAt',
    sortOrder: params.sortOrder ?? 'desc',
    query: params.query,
    status: params.status,
  };

  return useQuery({
    queryKey: formKeys.list(normalizedParams, activeTenantId),
    queryFn: () => fetchForms(normalizedParams, activeTenantId),
    enabled: session?.isSuperAdmin ? !!activeTenantId : true,
    placeholderData: (previousData) => previousData,
  });
}

export function useForm(id: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useQuery({
    queryKey: formKeys.detail(id || '', activeTenantId),
    queryFn: () => fetchForm(id!, activeTenantId),
    enabled: !!id && (session?.isSuperAdmin ? !!activeTenantId : true),
  });
}

export function useFormResponses(
  id: string | null,
  page: number = 1,
  limit: number = 20,
  draftPage: number = 1,
  draftLimit: number = 20
) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useQuery({
    queryKey: formKeys.responses(id || '', page, limit, draftPage, draftLimit, activeTenantId),
    queryFn: () => fetchFormResponses(id!, page, limit, draftPage, draftLimit, activeTenantId),
    enabled: !!id && (session?.isSuperAdmin ? !!activeTenantId : true),
    placeholderData: (previousData) => previousData,
  });
}

export function useFormResponse(id: string | null, submissionId: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useQuery({
    queryKey: formKeys.responseDetail(id || '', submissionId || '', activeTenantId),
    queryFn: () => fetchFormResponse(id!, submissionId!, activeTenantId),
    enabled: !!id && !!submissionId && (session?.isSuperAdmin ? !!activeTenantId : true),
  });
}

export function useRecentFormSubmissions(limit: number = 8) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useQuery({
    queryKey: formKeys.recentSubmissions(limit, activeTenantId),
    queryFn: () => fetchRecentFormSubmissions(limit, activeTenantId),
    enabled: session?.isSuperAdmin ? !!activeTenantId : true,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateForm() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useMutation({
    mutationFn: (data: CreateFormInput) =>
      createFormRequest({
        ...data,
        tenantId: activeTenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formKeys.all });
    },
  });
}

export function useUpdateForm(id: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useMutation({
    mutationFn: (data: UpdateFormInput & { fields?: FormFieldInput[]; reason?: string }) =>
      updateFormRequest(id, {
        ...data,
        tenantId: activeTenantId,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: formKeys.all });
      queryClient.setQueryData(formKeys.detail(id, activeTenantId), data);
    },
  });
}

export function useDuplicateForm() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) => duplicateFormRequest(id, title, activeTenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formKeys.all });
    },
  });
}

export function useDeleteForm() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(session?.isSuperAdmin ?? false, session?.tenantId);

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => deleteFormRequest(id, activeTenantId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: formKeys.all });
    },
  });
}
