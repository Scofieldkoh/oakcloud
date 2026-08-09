'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientServiceDto, CompanyServiceActivationDto, DuplicateClientServiceMatches, ServiceAgreementActivationDto } from '@/services/client-service';
import type { SearchClientServicesInput, UpdateClientServiceInput } from '@/lib/validations/client-service';

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

export function useArchiveClientService() {
  const invalidate = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ id, companyId: _companyId, reason }: { id: string; companyId: string; reason: string }) => requestJson<{ id: string; archived: true }>(`/api/client-services/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) }),
    onSuccess: (_result, variables) => invalidate(variables.companyId, variables.id),
  });
}

export function useRetryServiceAgreementActivation() {
  const invalidate = useInvalidateClientServices();
  return useMutation({
    mutationFn: ({ agreementId }: { agreementId: string; companyId: string }) => requestJson<ServiceAgreementActivationDto>(`/api/service-agreements/${agreementId}/retry-activation`, { method: 'POST' }),
    onSuccess: (_result, variables) => invalidate(variables.companyId),
  });
}
