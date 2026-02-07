import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import type {
  ContractType,
  ContractStatus,
  ServiceType,
  ServiceStatus,
  BillingFrequency,
} from '@/generated/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface ContractService {
  id: string;
  tenantId: string;
  contractId: string;
  name: string;
  serviceType: ServiceType;
  status: ServiceStatus;
  rate: number | null;
  currency: string;
  frequency: BillingFrequency;
  startDate: string;
  endDate: string | null;
  scope: string | null;
  serviceTemplateCode?: string | null;
  hasCustomDeadlines?: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDocument {
  id: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}

export interface Contract {
  id: string;
  tenantId: string;
  companyId: string;
  title: string;
  contractType: ContractType;
  status: ContractStatus;
  startDate: string;
  signedDate: string | null;
  documentId: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  services: ContractService[];
  document?: ContractDocument | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  };
}

export interface ContractsResponse {
  contracts: Contract[];
  total: number;
}

export interface CreateContractInput {
  title: string;
  contractType?: ContractType;
  status?: ContractStatus;
  startDate: string;
  signedDate?: string | null;
  documentId?: string | null;
  internalNotes?: string | null;
}

export interface UpdateContractInput {
  title?: string;
  contractType?: ContractType;
  status?: ContractStatus;
  startDate?: string;
  signedDate?: string | null;
  documentId?: string | null;
  internalNotes?: string | null;
}

export interface ContractSearchParams {
  query?: string;
  status?: ContractStatus;
  contractType?: ContractType;
  page?: number;
  limit?: number;
  sortBy?: 'title' | 'startDate' | 'status' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const contractKeys = {
  all: ['contracts'] as const,
  company: (companyId: string) => [...contractKeys.all, 'company', companyId] as const,
  detail: (companyId: string, contractId: string) =>
    [...contractKeys.company(companyId), contractId] as const,
  allServices: ['all-services'] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get all contracts for a company
 */
export function useCompanyContracts(
  companyId: string | null,
  params?: ContractSearchParams
) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: [...contractKeys.company(companyId ?? ''), params],
    queryFn: async (): Promise<ContractsResponse> => {
      const searchParams = new URLSearchParams();
      if (activeTenantId) searchParams.set('tenantId', activeTenantId);
      if (params?.query) searchParams.set('query', params.query);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.contractType) searchParams.set('contractType', params.contractType);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

      const url = `/api/companies/${companyId}/contracts?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch contracts');
      }
      return response.json();
    },
    enabled: !!companyId,
  });
}

/**
 * Prefetch contracts for a company (for background loading)
 */
export function usePrefetchCompanyContracts(
  companyId: string | null,
  enabled: boolean = true
) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  useQuery({
    queryKey: contractKeys.company(companyId ?? ''),
    queryFn: async (): Promise<ContractsResponse> => {
      const url = activeTenantId
        ? `/api/companies/${companyId}/contracts?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/contracts`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch contracts');
      }
      return response.json();
    },
    enabled: !!companyId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get a single contract with its services
 */
export function useContract(companyId: string | null, contractId: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: contractKeys.detail(companyId ?? '', contractId ?? ''),
    queryFn: async (): Promise<Contract> => {
      const url = activeTenantId
        ? `/api/companies/${companyId}/contracts/${contractId}?tenantId=${activeTenantId}`
        : `/api/companies/${companyId}/contracts/${contractId}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch contract');
      }
      return response.json();
    },
    enabled: !!companyId && !!contractId,
  });
}

/**
 * Create a new contract
 */
export function useCreateContract(companyId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: CreateContractInput) => {
      const response = await fetch(`/api/companies/${companyId}/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenantId: activeTenantId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create contract');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      success(`Contract "${data.title}" created successfully`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Update a contract
 */
export function useUpdateContract(companyId: string, contractId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: UpdateContractInput) => {
      const response = await fetch(
        `/api/companies/${companyId}/contracts/${contractId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, tenantId: activeTenantId }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update contract');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      queryClient.invalidateQueries({
        queryKey: contractKeys.detail(companyId, contractId),
      });
      success(`Contract "${data.title}" updated successfully`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Delete a contract
 */
export function useDeleteContract(companyId: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async ({ contractId, reason }: { contractId: string; reason: string }) => {
      const response = await fetch(
        `/api/companies/${companyId}/contracts/${contractId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, tenantId: activeTenantId }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete contract');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.company(companyId) });
      success('Contract deleted successfully');
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}
