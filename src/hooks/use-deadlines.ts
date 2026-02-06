import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import type {
  DeadlineCategory,
  DeadlineStatus,
  DeadlineBillingStatus,
  DeadlineGenerationType,
} from '@/generated/prisma';

// ============================================================================
// TYPES
// ============================================================================

export interface DeadlineWithRelations {
  id: string;
  tenantId: string;
  companyId: string;
  contractServiceId: string | null;
  deadlineTemplateId: string | null;
  title: string;
  description: string | null;
  category: DeadlineCategory;
  referenceCode: string | null;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  statutoryDueDate: string;
  extendedDueDate: string | null;
  internalDueDate: string | null;
  eotReference: string | null;
  eotNote: string | null;
  eotGrantedAt: string | null;
  isInScope: boolean;
  scopeNote: string | null;
  isBacklog: boolean;
  backlogNote: string | null;
  status: DeadlineStatus;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  filingDate: string | null;
  filingReference: string | null;
  isBillable: boolean;
  overrideBillable: boolean | null;
  billingStatus: DeadlineBillingStatus | null;
  amount: number | null;
  overrideAmount: number | null;
  currency: string;
  invoiceReference: string | null;
  invoicedAt: string | null;
  assigneeId: string | null;
  assignedAt: string | null;
  generationType: DeadlineGenerationType;
  remindersSent: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  };
  contractService?: {
    id: string;
    name: string;
    contract?: {
      id: string;
      title: string;
    };
  };
  deadlineTemplate?: {
    id: string;
    code: string;
    name: string;
  };
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface DeadlineStats {
  total: number;
  byStatus: Record<DeadlineStatus, number>;
  byCategory: Record<DeadlineCategory, number>;
  overdue: number;
  dueSoon: number;
  unassigned: number;
  billable: {
    pending: number;
    invoiced: number;
    paid: number;
    totalAmount: number;
  };
}

export interface DeadlineSearchParams {
  companyId?: string;
  contractServiceId?: string;
  category?: DeadlineCategory;
  status?: DeadlineStatus | DeadlineStatus[];
  assigneeId?: string | null;
  isInScope?: boolean;
  isBacklog?: boolean;
  billingStatus?: DeadlineBillingStatus;
  dueDateFrom?: string;
  dueDateTo?: string;
  query?: string;
  page?: number;
  limit?: number;
  sortBy?: 'title' | 'statutoryDueDate' | 'status' | 'category' | 'company' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  tenantId?: string; // For SUPER_ADMIN to filter by tenant
}

export interface CreateDeadlineInput {
  companyId: string;
  contractServiceId?: string | null;
  deadlineTemplateId?: string | null;
  title: string;
  description?: string | null;
  category: DeadlineCategory;
  referenceCode?: string | null;
  periodLabel: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  statutoryDueDate: string;
  extendedDueDate?: string | null;
  internalDueDate?: string | null;
  isInScope?: boolean;
  scopeNote?: string | null;
  isBacklog?: boolean;
  backlogNote?: string | null;
  status?: DeadlineStatus;
  isBillable?: boolean;
  amount?: number | null;
  currency?: string;
  assigneeId?: string | null;
}

export interface UpdateDeadlineInput {
  title?: string;
  description?: string | null;
  category?: DeadlineCategory;
  referenceCode?: string | null;
  periodLabel?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  extendedDueDate?: string | null;
  internalDueDate?: string | null;
  eotReference?: string | null;
  eotNote?: string | null;
  isInScope?: boolean;
  scopeNote?: string | null;
  isBacklog?: boolean;
  backlogNote?: string | null;
  status?: DeadlineStatus;
  isBillable?: boolean;
  overrideBillable?: boolean | null;
  amount?: number | null;
  overrideAmount?: number | null;
  currency?: string;
  assigneeId?: string | null;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

export const deadlineKeys = {
  all: ['deadlines'] as const,
  list: (params?: DeadlineSearchParams) => [...deadlineKeys.all, 'list', params] as const,
  company: (companyId: string, options?: { status?: DeadlineStatus | DeadlineStatus[]; category?: DeadlineCategory; limit?: number }) =>
    [...deadlineKeys.all, 'company', companyId, options] as const,
  detail: (id: string) => [...deadlineKeys.all, 'detail', id] as const,
  stats: (companyId?: string, assigneeId?: string) => [...deadlineKeys.all, 'stats', { companyId, assigneeId }] as const,
  upcoming: (daysAhead?: number, options?: { companyId?: string; assigneeId?: string; category?: DeadlineCategory; limit?: number }) =>
    [...deadlineKeys.all, 'upcoming', daysAhead, options] as const,
  overdue: (options?: { companyId?: string; assigneeId?: string; limit?: number }) =>
    [...deadlineKeys.all, 'overdue', options] as const,
  templates: () => [...deadlineKeys.all, 'templates'] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get all deadlines with search/filter support
 */
export function useDeadlines(params?: DeadlineSearchParams) {
  return useQuery({
    queryKey: deadlineKeys.list(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.tenantId) searchParams.set('tenantId', params.tenantId);
      if (params?.companyId) searchParams.set('companyId', params.companyId);
      if (params?.contractServiceId) searchParams.set('contractServiceId', params.contractServiceId);
      if (params?.category) searchParams.set('category', params.category);
      if (params?.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        statuses.forEach(s => searchParams.append('status', s));
      }
      if (params?.assigneeId !== undefined) {
        searchParams.set('assigneeId', params.assigneeId || '');
      }
      if (params?.isInScope !== undefined) searchParams.set('isInScope', String(params.isInScope));
      if (params?.isBacklog !== undefined) searchParams.set('isBacklog', String(params.isBacklog));
      if (params?.billingStatus) searchParams.set('billingStatus', params.billingStatus);
      if (params?.dueDateFrom) searchParams.set('dueDateFrom', params.dueDateFrom);
      if (params?.dueDateTo) searchParams.set('dueDateTo', params.dueDateTo);
      if (params?.query) searchParams.set('query', params.query);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

      const url = `/api/deadlines?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch deadlines');
      }
      return response.json() as Promise<{
        deadlines: DeadlineWithRelations[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>;
    },
    enabled: params?.tenantId !== undefined || true,
  });
}

/**
 * Get deadlines for a specific company
 */
export function useCompanyDeadlines(companyId: string | null, options?: {
  status?: DeadlineStatus | DeadlineStatus[];
  category?: DeadlineCategory;
  limit?: number;
  tenantId?: string;
}) {
  return useQuery({
    queryKey: deadlineKeys.company(companyId ?? '', options),
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('companyId', companyId!);
      if (options?.tenantId) searchParams.set('tenantId', options.tenantId);
      if (options?.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        statuses.forEach(s => searchParams.append('status', s));
      }
      if (options?.category) searchParams.set('category', options.category);
      if (options?.limit) searchParams.set('limit', options.limit.toString());
      searchParams.set('sortBy', 'statutoryDueDate');
      searchParams.set('sortOrder', 'asc');

      const url = `/api/deadlines?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch deadlines');
      }
      const data = await response.json();
      return data.deadlines as DeadlineWithRelations[];
    },
    enabled: !!companyId,
  });
}

/**
 * Get a single deadline by ID
 */
export function useDeadline(id: string | null) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useQuery({
    queryKey: deadlineKeys.detail(id ?? ''),
    queryFn: async () => {
      const url = activeTenantId
        ? `/api/deadlines/${id}?tenantId=${activeTenantId}`
        : `/api/deadlines/${id}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch deadline');
      }
      return response.json() as Promise<DeadlineWithRelations>;
    },
    enabled: !!id,
  });
}

/**
 * Get deadline statistics
 */
export function useDeadlineStats(tenantId?: string, companyId?: string, assigneeId?: string) {
  return useQuery({
    queryKey: deadlineKeys.stats(companyId, assigneeId),
    queryFn: async () => {
      const searchParams = new URLSearchParams({ action: 'stats' });
      if (tenantId) searchParams.set('tenantId', tenantId);
      if (companyId) searchParams.set('companyId', companyId);
      if (assigneeId) searchParams.set('assigneeId', assigneeId);

      const url = `/api/deadlines?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch deadline stats');
      }
      return response.json() as Promise<DeadlineStats>;
    },
  });
}

/**
 * Get upcoming deadlines
 */
export function useUpcomingDeadlines(daysAhead = 30, options?: {
  companyId?: string;
  assigneeId?: string;
  category?: DeadlineCategory;
  limit?: number;
}) {
  return useQuery({
    queryKey: deadlineKeys.upcoming(daysAhead, options),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        action: 'upcoming',
        daysAhead: daysAhead.toString(),
      });
      if (options?.companyId) searchParams.set('companyId', options.companyId);
      if (options?.assigneeId) searchParams.set('assigneeId', options.assigneeId);
      if (options?.category) searchParams.set('category', options.category);
      if (options?.limit) searchParams.set('limit', options.limit.toString());

      const url = `/api/deadlines?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch upcoming deadlines');
      }
      return response.json() as Promise<DeadlineWithRelations[]>;
    },
  });
}

/**
 * Get overdue deadlines
 */
export function useOverdueDeadlines(options?: {
  companyId?: string;
  assigneeId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: deadlineKeys.overdue(options),
    queryFn: async () => {
      const searchParams = new URLSearchParams({ action: 'overdue' });
      if (options?.companyId) searchParams.set('companyId', options.companyId);
      if (options?.assigneeId) searchParams.set('assigneeId', options.assigneeId);
      if (options?.limit) searchParams.set('limit', options.limit.toString());

      const url = `/api/deadlines?${searchParams.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch overdue deadlines');
      }
      return response.json() as Promise<DeadlineWithRelations[]>;
    },
  });
}

/**
 * Create a new deadline
 */
export function useCreateDeadline() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: CreateDeadlineInput) => {
      const response = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenantId: activeTenantId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create deadline');
      }
      return response.json() as Promise<DeadlineWithRelations>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Deadline "${data.title}" created successfully`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Update a deadline
 */
export function useUpdateDeadline(id: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: UpdateDeadlineInput) => {
      const url = activeTenantId
        ? `/api/deadlines/${id}?tenantId=${activeTenantId}`
        : `/api/deadlines/${id}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, tenantId: activeTenantId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update deadline');
      }
      return response.json() as Promise<DeadlineWithRelations>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Deadline "${data.title}" updated successfully`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Complete a deadline
 */
export function useCompleteDeadline(id: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: {
      completionNote?: string | null;
      filingDate?: string | null;
      filingReference?: string | null;
    }) => {
      const url = activeTenantId
        ? `/api/deadlines/${id}?tenantId=${activeTenantId}`
        : `/api/deadlines/${id}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', tenantId: activeTenantId, ...data }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to complete deadline');
      }
      return response.json() as Promise<DeadlineWithRelations>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Deadline "${data.title}" marked as completed`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Reopen a completed deadline
 */
export function useReopenDeadline(id: string) {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async () => {
      const url = activeTenantId
        ? `/api/deadlines/${id}?tenantId=${activeTenantId}`
        : `/api/deadlines/${id}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen', tenantId: activeTenantId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to reopen deadline');
      }
      return response.json() as Promise<DeadlineWithRelations>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Deadline "${data.title}" reopened`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Delete a deadline
 */
export function useDeleteDeadline() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (id: string) => {
      const url = activeTenantId
        ? `/api/deadlines/${id}?tenantId=${activeTenantId}`
        : `/api/deadlines/${id}`;
      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete deadline');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success('Deadline deleted successfully');
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Generate deadlines for a company
 */
export function useGenerateDeadlines() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: {
      companyId: string;
      templateCodes?: string[];
      monthsAhead?: number;
      serviceId?: string;
    }) => {
      const response = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', tenantId: activeTenantId, ...data }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate deadlines');
      }
      return response.json() as Promise<{ success: boolean; created: number; skipped: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`Generated ${data.created} deadlines (${data.skipped} already existed)`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Bulk assign deadlines to a user
 */
export function useBulkAssignDeadlines() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: { deadlineIds: string[]; assigneeId: string | null }) => {
      const response = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-assign', tenantId: activeTenantId, ...data }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to assign deadlines');
      }
      return response.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`${data.count} deadlines assigned`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Bulk update deadline status
 */
export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (data: { deadlineIds: string[]; status: DeadlineStatus }) => {
      const response = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-status', tenantId: activeTenantId, ...data }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update deadlines');
      }
      return response.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`${data.count} deadlines updated`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}

/**
 * Bulk delete deadlines
 */
export function useBulkDeleteDeadlines() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  return useMutation({
    mutationFn: async (deadlineIds: string[]) => {
      const response = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-delete', tenantId: activeTenantId, deadlineIds }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete deadlines');
      }
      return response.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: deadlineKeys.all });
      success(`${data.count} deadlines deleted`);
    },
    onError: (err: Error) => {
      error(err.message);
    },
  });
}
