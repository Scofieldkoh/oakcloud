import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { contractKeys, type ContractService } from '@/hooks/use-contracts';
import { deadlineKeys } from '@/hooks/use-deadlines';
import type { ServiceType, ServiceStatus, BillingFrequency } from '@/generated/prisma';
import type { DeadlineExclusionInput, DeadlineRuleInput } from '@/lib/validations/service';

// ============================================================================
// TYPES
// ============================================================================

export type InputServiceType = ServiceType | 'BOTH';
export type CreatedServiceRecord = ContractService & { deadlinesGenerated?: number };

export interface CreateLinkedServicesResponse {
  services: CreatedServiceRecord[];
  linkedServiceIds: string[];
  deadlinesGenerated?: number;
}

export type CreateContractServiceResponse = CreatedServiceRecord | CreateLinkedServicesResponse;

export interface ContractServiceWithRelations extends ContractService {
  deadlineRules?: DeadlineRuleInput[];
  contract?: {
    id: string;
    title: string;
    contractType: string;
    status: string;
    companyId: string;
    company?: {
      id: string;
      name: string;
      uen: string;
    };
  };
}

export interface AllServicesResponse {
  services: ContractServiceWithRelations[];
  total: number;
}

export interface CompanyServicesResponse {
  services: ContractServiceWithRelations[];
  total: number;
}

export interface CreateContractServiceInput {
  name: string;
  serviceType?: InputServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string;
  frequency?: BillingFrequency;
  startDate: string;
  endDate?: string | null;
  scope?: string | null;
  displayOrder?: number;
  // Service template integration for deadline management
  serviceTemplateCode?: string | null;
  deadlineTemplateCodes?: string[] | null;
  deadlineRules?: DeadlineRuleInput[] | null;
  excludedDeadlines?: DeadlineExclusionInput[] | null;
  generateDeadlines?: boolean;
  fyeYearOverride?: number | null;
  oneTimeSuffix?: string | null;
  recurringSuffix?: string | null;
  oneTimeRate?: number | null;
}

export interface UpdateContractServiceInput {
  name?: string;
  serviceType?: ServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string;
  frequency?: BillingFrequency;
  startDate?: string;
  endDate?: string | null;
  scope?: string | null;
  displayOrder?: number;
  serviceTemplateCode?: string | null;
  deadlineRules?: DeadlineRuleInput[] | null;
  excludedDeadlines?: DeadlineExclusionInput[] | null;
  regenerateDeadlines?: boolean;
  fyeYearOverride?: number | null;
}

export interface ServiceSearchParams {
  query?: string;
  status?: ServiceStatus;
  serviceType?: InputServiceType;
  companyId?: string;
  contractId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  rateFrom?: number;
  rateTo?: number;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'startDate' | 'endDate' | 'status' | 'rate' | 'serviceType' | 'company' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const serviceKeys = {
  all: ['services'] as const,
  list: (params?: ServiceSearchParams) => [...serviceKeys.all, 'list', params] as const,
  company: (companyId: string) => [...serviceKeys.all, 'company', companyId] as const,
  contract: (contractId: string) => [...serviceKeys.all, 'contract', contractId] as const,
  detail: (serviceId: string) => [...serviceKeys.all, 'detail', serviceId] as const,
};

function isLinkedServicesResponse(data: CreateContractServiceResponse): data is CreateLinkedServicesResponse {
  return 'services' in data;
}

function getGeneratedDeadlineCount(data: CreateContractServiceResponse): number {
  if (isLinkedServicesResponse(data)) {
    if (typeof data.deadlinesGenerated === 'number') {
      return data.deadlinesGenerated;
    }
    return data.services.reduce((sum, service) => sum + (service.deadlinesGenerated ?? 0), 0);
  }
  return data.deadlinesGenerated ?? 0;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get all services across the tenant (for Services Overview page)
 */
export function useAllServices(params?: ServiceSearchParams) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: serviceKeys.list(params),
    queryFn: async (): Promise<AllServicesResponse> => {
      const searchParams = new URLSearchParams();
      if (activeTenantId) searchParams.set('tenantId', activeTenantId);
      if (params?.query) searchParams.set('query', params.query);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.serviceType) searchParams.set('serviceType', params.serviceType);
      if (params?.companyId) searchParams.set('companyId', params.companyId);
      if (params?.contractId) searchParams.set('contractId', params.contractId);
      if (params?.startDateFrom) searchParams.set('startDateFrom', params.startDateFrom);
      if (params?.startDateTo) searchParams.set('startDateTo', params.startDateTo);
      if (params?.endDateFrom) searchParams.set('endDateFrom', params.endDateFrom);
      if (params?.endDateTo) searchParams.set('endDateTo', params.endDateTo);
      if (params?.rateFrom !== undefined) searchParams.set('rateFrom', params.rateFrom.toString());
      if (params?.rateTo !== undefined) searchParams.set('rateTo', params.rateTo.toString());
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

      const url = `/api/services?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch services');
      }
      return response.json();
    },
  });
}

/**
 * Get services for a specific company (services-first company management).
 */
export function useCompanyServices(
  companyId: string | null,
  params?: Omit<ServiceSearchParams, 'companyId'>
) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: [...serviceKeys.company(companyId ?? ''), activeTenantId ?? '', params],
    queryFn: async (): Promise<CompanyServicesResponse> => {
      const searchParams = new URLSearchParams();
      if (activeTenantId) searchParams.set('tenantId', activeTenantId);
      if (params?.query) searchParams.set('query', params.query);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.serviceType) searchParams.set('serviceType', params.serviceType);
      if (params?.contractId) searchParams.set('contractId', params.contractId);
      if (params?.startDateFrom) searchParams.set('startDateFrom', params.startDateFrom);
      if (params?.startDateTo) searchParams.set('startDateTo', params.startDateTo);
      if (params?.endDateFrom) searchParams.set('endDateFrom', params.endDateFrom);
      if (params?.endDateTo) searchParams.set('endDateTo', params.endDateTo);
      if (params?.rateFrom !== undefined) searchParams.set('rateFrom', params.rateFrom.toString());
      if (params?.rateTo !== undefined) searchParams.set('rateTo', params.rateTo.toString());
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

      const url = `/api/companies/${companyId}/services?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch company services');
      }
      return response.json();
    },
    enabled: !!companyId,
  });
}

/**
 * Get one service for a company by service ID.
 */
export function useCompanyService(companyId: string | null, serviceId: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: [...serviceKeys.company(companyId ?? ''), 'detail', serviceId ?? '', activeTenantId ?? ''],
    queryFn: async (): Promise<ContractServiceWithRelations> => {
      const url = activeTenantId
        ? `/api/companies/${companyId}/services/${serviceId}?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/services/${serviceId}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch service');
      }
      return response.json();
    },
    enabled: !!companyId && !!serviceId,
  });
}

/**
 * Get services for a specific contract
 */
export function useContractServices(companyId: string | null, contractId: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: serviceKeys.contract(contractId ?? ''),
    queryFn: async (): Promise<{ services: ContractService[] }> => {
      const url = activeTenantId
        ? `/api/companies/${companyId}/contracts/${contractId}/services?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/contracts/${contractId}/services`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch services');
      }
      return response.json();
    },
    enabled: !!companyId && !!contractId,
  });
}

/**
 * Create a new service under a contract
 */
export function useCreateContractService(companyId: string, contractId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: CreateContractServiceInput): Promise<CreateContractServiceResponse> => {
      const response = await fetch(
        `/api/companies/${companyId}/contracts/${contractId}/services`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, tenantId: activeTenantId }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create service');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate contract queries to refresh services
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({
        queryKey: contractKeys.detail(companyId, contractId),
      });
      queryClient.invalidateQueries({ queryKey: serviceKeys.contract(contractId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      // If deadlines were generated, also invalidate deadline queries
      const generatedDeadlines = getGeneratedDeadlineCount(data);
      if (generatedDeadlines > 0) {
        queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      }
      // Only show basic toast if no deadlines were generated (custom message handled by caller)
      if (!isLinkedServicesResponse(data) && !data.deadlinesGenerated) {
        success(`Service "${data.name}" created successfully`);
      }
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Update a service
 */
export function useUpdateContractService(
  companyId: string,
  contractId: string,
  serviceId: string
) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: UpdateContractServiceInput) => {
      const response = await fetch(
        `/api/companies/${companyId}/contracts/${contractId}/services/${serviceId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, tenantId: activeTenantId }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update service');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({
        queryKey: contractKeys.detail(companyId, contractId),
      });
      queryClient.invalidateQueries({ queryKey: serviceKeys.contract(contractId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      success(`Service "${data.name}" updated successfully`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Delete a service
 */
export function useDeleteContractService(companyId: string, contractId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (serviceId: string) => {
      const url = activeTenantId
        ? `/api/companies/${companyId}/contracts/${contractId}/services/${serviceId}?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/contracts/${contractId}/services/${serviceId}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({
        queryKey: contractKeys.detail(companyId, contractId),
      });
      queryClient.invalidateQueries({ queryKey: serviceKeys.contract(contractId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success('Service deleted successfully');
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Create a service directly under a company (contract handled by API).
 */
export function useCreateCompanyService(companyId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (
      data: CreateContractServiceInput & { contractId?: string | null }
    ): Promise<CreateContractServiceResponse> => {
      const response = await fetch(`/api/companies/${companyId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenantId: activeTenantId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create service');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.list() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      const generatedDeadlines = getGeneratedDeadlineCount(data);
      if (generatedDeadlines > 0) {
        queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      }
      if (!isLinkedServicesResponse(data) && !data.deadlinesGenerated) {
        success(`Service "${data.name}" created successfully`);
      }
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Update a service directly under a company.
 */
export function useUpdateCompanyService(companyId: string, serviceId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: UpdateContractServiceInput) => {
      const response = await fetch(`/api/companies/${companyId}/services/${serviceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenantId: activeTenantId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update service');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.list() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Service "${data.name}" updated successfully`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Delete a service directly under a company.
 */
export function useDeleteCompanyService(companyId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (serviceId: string) => {
      const url = activeTenantId
        ? `/api/companies/${companyId}/services/${serviceId}?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/services/${serviceId}`;
      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete service');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.company(companyId) });
      queryClient.invalidateQueries({ queryKey: serviceKeys.list() });
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success('Service deleted successfully');
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Bulk update end date for services (Services Overview)
 */
export function useBulkUpdateServiceEndDate() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: { serviceIds: string[]; endDate: string }) => {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-end-date', tenantId: activeTenantId, ...data }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update service end dates');
      }
      return response.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Updated end date for ${data.count} services`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Bulk hard delete services (permanent)
 */
export function useBulkHardDeleteServices() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (serviceIds: string[]) => {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-hard-delete', tenantId: activeTenantId, serviceIds }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete services');
      }
      return response.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Deleted ${data.count} services`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}
