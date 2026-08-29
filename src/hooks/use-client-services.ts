'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientServiceDeadlineDraftPreview, ClientServiceDeadlineImpact, ClientServiceDto, CompanyServiceActivationDto, DuplicateClientServiceMatches, ManualClientServiceCatalogOptionsResponse, PermanentDeleteClientServiceResult, ServiceAgreementActivationDto } from '@/services/client-service';
import type { ClientServiceDeadlineDraftPreviewInput, ClientServiceDeadlineImpactInput, CreateManualClientServiceRequest, SearchClientServicesInput, UpdateClientServiceInput } from '@/lib/validations/client-service';

type ClientServicesResult = { services: ClientServiceDto[]; total: number; activations: CompanyServiceActivationDto[] };

export interface ErrorResponseBody {
  error?: string;
  code?: string;
  details?: unknown;
  duplicates?: DuplicateClientServiceMatches;
}

export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly details: unknown,
    public readonly body: ErrorResponseBody,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}

export function isHttpRequestError(error: unknown, status?: number): error is HttpRequestError {
  return error instanceof HttpRequestError && (status === undefined || error.status === status);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as ErrorResponseBody;
  if (!response.ok) throw new HttpRequestError(body.error ?? 'Request failed', response.status, body.code, body.details, body);
  return body as T;
}

export function useClientServices(companyId: string, filters: Partial<SearchClientServicesInput> = {}) {
  return useQuery({
    queryKey: ['client-services', companyId, filters],
    queryFn: () => {
      const search = new URLSearchParams();
      if (filters.status) search.set('status', filters.status);
      if (filters.query) search.set('query', filters.query);
      search.set('page', String(filters.page ?? 1));
      search.set('limit', String(filters.limit ?? 50));
      return requestJson<ClientServicesResult>(`/api/companies/${companyId}/services?${search}`);
    },
  });
}

export function useClientService(serviceId: string | null) {
  return useQuery({ queryKey: ['client-service', serviceId], queryFn: () => requestJson<ClientServiceDto>(`/api/client-services/${serviceId}`), enabled: Boolean(serviceId) });
}

/**
 * No-write deadline impact preview. This intentionally bypasses the query
 * cache so debounced editor requests never invalidate workspace views.
 */
export async function previewClientServiceDeadlineImpact(
  id: string,
  input: ClientServiceDeadlineImpactInput,
  signal?: AbortSignal,
): Promise<ClientServiceDeadlineImpact> {
  return requestJson<ClientServiceDeadlineImpact>(`/api/client-services/${id}/deadline-configuration/impact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
}

/**
 * No-write draft deadline projection for the add-service flow. The service
 * does not exist yet, so the request is scoped by company and variant.
 */
export async function previewClientServiceDeadlineDraft(
  input: ClientServiceDeadlineDraftPreviewInput,
  signal?: AbortSignal,
): Promise<ClientServiceDeadlineDraftPreview> {
  return requestJson<ClientServiceDeadlineDraftPreview>('/api/client-services/deadline-configuration/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
}

function useInvalidateClientServices() {
  const client = useQueryClient();
  return async (companyId: string, serviceId?: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['client-services', companyId] }),
      ...(serviceId ? [client.invalidateQueries({ queryKey: ['client-service', serviceId] })] : []),
    ]);
  };
}

export function useUpdateClientService() {
  const invalidate = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ id, companyId: _companyId, data }: { id: string; companyId: string; data: UpdateClientServiceInput }) => requestJson<ClientServiceDto>(`/api/client-services/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: (service, variables) => invalidate(variables.companyId, service.id),
  });
}

export function useManualClientServiceCatalogOptions(companyId: string, enabled = true) {
  return useQuery({
    queryKey: ['client-service-catalog-options', companyId],
    queryFn: () => requestJson<ManualClientServiceCatalogOptionsResponse>(`/api/companies/${companyId}/services/catalog-options`),
    enabled: enabled && Boolean(companyId),
  });
}

export function useCreateManualClientService() {
  const invalidate = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ companyId, data }: { companyId: string; data: CreateManualClientServiceRequest }) =>
      requestJson<ClientServiceDto>(`/api/companies/${companyId}/services`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (service, variables) => invalidate(variables.companyId, service.id),
  });
}

export function useArchiveClientService() {
  const invalidate = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ id, companyId: _companyId, reason }: { id: string; companyId: string; reason: string }) => requestJson<{ id: string; archived: true }>(`/api/client-services/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) }),
    onSuccess: (_result, variables) => invalidate(variables.companyId, variables.id),
  });
}

export function useDeleteClientServicePermanently() {
  const queryClient = useQueryClient();
  const invalidateClientServices = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ id, companyId: _companyId, expectedUpdatedAt, reason }: { id: string; companyId: string; expectedUpdatedAt: string; reason: string }) => requestJson<PermanentDeleteClientServiceResult>(`/api/client-services/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deletionMode: 'PERMANENT', expectedUpdatedAt, reason }),
    }),
    onSuccess: (_result, variables) => Promise.all([
      invalidateClientServices(variables.companyId, variables.id),
      queryClient.invalidateQueries({ queryKey: ['service-roster'] }),
      queryClient.invalidateQueries({ queryKey: ['deadlines'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-occurrences'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-coverage'] }),
    ]),
  });
}

export function useRetryServiceAgreementActivation() {
  const invalidate = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ agreementId }: { agreementId: string; companyId: string }) => requestJson<ServiceAgreementActivationDto>(`/api/service-agreements/${agreementId}/retry-activation`, { method: 'POST' }),
    onSuccess: (_result, variables) => invalidate(variables.companyId),
  });
}
