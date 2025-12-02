/**
 * Admin hooks for user, tenant, role, and audit log management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from './use-auth';

// ============================================================================
// Types
// ============================================================================

export interface TenantUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  companyId: string | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
}

export interface TenantUsersResponse {
  users: TenantUser[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactEmail: string | null;
  contactPhone: string | null;
  maxUsers: number;
  maxCompanies: number;
  maxStorageMb: number;
  createdAt: string;
  _count?: {
    users: number;
    companies: number;
  };
}

export interface TenantsResponse {
  tenants: Tenant[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLog {
  id: string;
  tenantId: string | null;
  userId: string | null;
  companyId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changeSource: string;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogsParams {
  action?: string;
  actions?: string;
  entityType?: string;
  entityTypes?: string;
  userId?: string;
  companyId?: string;
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  permissions: Array<{
    permission: {
      id: string;
      resource: string;
      action: string;
    };
  }>;
  _count: {
    users: number;
  };
}

export interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId?: string;
}

// ============================================================================
// User Management Hooks
// ============================================================================

export function useTenantUsers(
  tenantId: string | undefined,
  params?: { query?: string; role?: string; page?: number; limit?: number }
) {
  return useQuery<TenantUsersResponse>({
    queryKey: ['tenant-users', tenantId, params],
    queryFn: async () => {
      if (!tenantId) throw new Error('Tenant ID required');

      const searchParams = new URLSearchParams();
      if (params?.query) searchParams.set('query', params.query);
      if (params?.role) searchParams.set('role', params.role);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const res = await fetch(`/api/tenants/${tenantId}/users?${searchParams}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch users');
      }
      return res.json();
    },
    enabled: !!tenantId,
  });
}

export function useCurrentTenantUsers(params?: { query?: string; role?: string; page?: number; limit?: number }) {
  const { data: session } = useSession();
  return useTenantUsers(session?.tenantId || undefined, params);
}

export function useInviteUser(tenantId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUserData) => {
      if (!tenantId) throw new Error('Tenant ID required');

      const res = await fetch(`/api/tenants/${tenantId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to invite user');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
    },
  });
}

// ============================================================================
// Tenant Management Hooks
// ============================================================================

export function useTenants(params?: {
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<TenantsResponse>({
    queryKey: ['tenants', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.query) searchParams.set('query', params.query);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());

      const res = await fetch(`/api/tenants?${searchParams}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch tenants');
      }
      return res.json();
    },
  });
}

export function useTenant(id: string | undefined) {
  return useQuery<Tenant>({
    queryKey: ['tenant', id],
    queryFn: async () => {
      if (!id) throw new Error('Tenant ID required');
      const res = await fetch(`/api/tenants/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch tenant');
      }
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      slug: string;
      contactEmail?: string;
      maxUsers?: number;
      maxCompanies?: number;
    }) => {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create tenant');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
  });
}

export function useUpdateTenant(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Tenant>) => {
      if (!id) throw new Error('Tenant ID required');

      const res = await fetch(`/api/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update tenant');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
    },
  });
}

// ============================================================================
// Audit Log Hooks
// ============================================================================

export function useAuditLogs(params?: AuditLogsParams) {
  return useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.action) searchParams.set('action', params.action);
      if (params?.actions) searchParams.set('actions', params.actions);
      if (params?.entityType) searchParams.set('entityType', params.entityType);
      if (params?.entityTypes) searchParams.set('entityTypes', params.entityTypes);
      if (params?.userId) searchParams.set('userId', params.userId);
      if (params?.companyId) searchParams.set('companyId', params.companyId);
      if (params?.tenantId) searchParams.set('tenantId', params.tenantId);
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);

      const res = await fetch(`/api/audit-logs?${searchParams}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch audit logs');
      }
      return res.json();
    },
  });
}

export function useAuditLogStats(params?: { startDate?: string; endDate?: string; tenantId?: string }) {
  return useQuery({
    queryKey: ['audit-log-stats', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);
      if (params?.tenantId) searchParams.set('tenantId', params.tenantId);

      const res = await fetch(`/api/audit-logs/stats?${searchParams}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch audit stats');
      }
      return res.json();
    },
  });
}

// ============================================================================
// Role Management Hooks
// ============================================================================

export function useTenantRoles(tenantId: string | undefined) {
  return useQuery<Role[]>({
    queryKey: ['tenant-roles', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('Tenant ID required');
      const res = await fetch(`/api/tenants/${tenantId}/roles`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch roles');
      }
      return res.json();
    },
    enabled: !!tenantId,
  });
}

export function useCurrentTenantRoles() {
  const { data: session } = useSession();
  return useTenantRoles(session?.tenantId || undefined);
}

// ============================================================================
// User Company Assignment Hooks
// ============================================================================

export interface UserCompanyAssignment {
  id: string;
  userId: string;
  companyId: string;
  accessLevel: 'VIEW' | 'EDIT' | 'MANAGE';
  isPrimary: boolean;
  createdAt: string;
  company: {
    id: string;
    name: string;
    uen: string;
  };
}

export function useUserCompanyAssignments(userId: string | undefined) {
  return useQuery<{ assignments: UserCompanyAssignment[] }>({
    queryKey: ['user-company-assignments', userId],
    queryFn: async () => {
      if (!userId) throw new Error('User ID required');
      const res = await fetch(`/api/users/${userId}/companies`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch company assignments');
      }
      return res.json();
    },
    enabled: !!userId,
  });
}

export function useAssignUserToCompany(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      companyId: string;
      accessLevel?: 'VIEW' | 'EDIT' | 'MANAGE';
      isPrimary?: boolean;
    }) => {
      if (!userId) throw new Error('User ID required');
      const res = await fetch(`/api/users/${userId}/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to assign company');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-company-assignments', userId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] });
    },
  });
}

export function useUpdateCompanyAssignment(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      assignmentId: string;
      accessLevel?: 'VIEW' | 'EDIT' | 'MANAGE';
      isPrimary?: boolean;
    }) => {
      if (!userId) throw new Error('User ID required');
      const res = await fetch(`/api/users/${userId}/companies`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update assignment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-company-assignments', userId] });
    },
  });
}

export function useRemoveCompanyAssignment(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!userId) throw new Error('User ID required');
      const res = await fetch(`/api/users/${userId}/companies`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to remove assignment');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-company-assignments', userId] });
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] });
    },
  });
}
