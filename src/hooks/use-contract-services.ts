import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { contractKeys, type ContractService } from '@/hooks/use-contracts';
import { deadlineKeys } from '@/hooks/use-deadlines';
import type { ServiceType, ServiceStatus, BillingFrequency } from '@/generated/prisma';
import type { DeadlineRuleInput } from '@/lib/validations/service';

// ============================================================================
// TYPES
// ============================================================================

export interface ContractServiceWithRelations extends ContractService {
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

export interface CreateContractServiceInput {
  name: string;
  serviceType?: ServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string;
  frequency?: BillingFrequency;
  startDate: string;
  endDate?: string | null;
  nextBillingDate?: string | null;
  scope?: string | null;
  autoRenewal?: boolean;
  renewalPeriodMonths?: number | null;
  displayOrder?: number;
  // Service template integration for deadline management
  serviceTemplateCode?: string | null;
  deadlineTemplateCodes?: string[] | null;
  deadlineRules?: DeadlineRuleInput[] | null;
  generateDeadlines?: boolean;
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
  nextBillingDate?: string | null;
  scope?: string | null;
  autoRenewal?: boolean;
  renewalPeriodMonths?: number | null;
  displayOrder?: number;
}

export interface ServiceSearchParams {
  query?: string;
  status?: ServiceStatus;
  serviceType?: ServiceType;
  companyId?: string;
  contractId?: string;
  endDateFrom?: string;
  endDateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'startDate' | 'endDate' | 'status' | 'rate' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const serviceKeys = {
  all: ['services'] as const,
  list: (params?: ServiceSearchParams) => [...serviceKeys.all, 'list', params] as const,
  contract: (contractId: string) => [...serviceKeys.all, 'contract', contractId] as const,
  detail: (serviceId: string) => [...serviceKeys.all, 'detail', serviceId] as const,
};

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
      if (params?.endDateFrom) searchParams.set('endDateFrom', params.endDateFrom);
      if (params?.endDateTo) searchParams.set('endDateTo', params.endDateTo);
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
    mutationFn: async (data: CreateContractServiceInput): Promise<ContractService & { deadlinesGenerated?: number }> => {
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
      if (data.deadlinesGenerated && data.deadlinesGenerated > 0) {
        queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      }
      // Only show basic toast if no deadlines were generated (custom message handled by caller)
      if (!data.deadlinesGenerated) {
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
      success('Service deleted successfully');
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}
