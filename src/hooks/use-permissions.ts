'use client';

import { useQuery, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

interface PermissionsResponse {
  permissions: string[];
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

async function fetchPermissions(companyId?: string): Promise<PermissionsResponse> {
  const url = companyId
    ? `/api/auth/permissions?companyId=${companyId}`
    : '/api/auth/permissions';

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 401) {
      return { permissions: [], isSuperAdmin: false, isTenantAdmin: false };
    }
    throw new Error('Failed to fetch permissions');
  }
  return response.json();
}

/**
 * Hook to get current user's permissions
 *
 * @param companyId - Optional company ID to check permissions for a specific company
 * @returns Object with permissions array and helper functions
 */
export function usePermissions(companyId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['permissions', companyId],
    queryFn: () => fetchPermissions(companyId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  const permissions = data?.permissions || [];
  const isSuperAdmin = data?.isSuperAdmin || false;
  const isTenantAdmin = data?.isTenantAdmin || false;

  /**
   * Check if user has a specific permission
   * Format: "resource:action" (e.g., "company:create", "document:delete")
   */
  const hasPermission = (resource: string, action: string): boolean => {
    if (isSuperAdmin || isTenantAdmin) return true;
    return permissions.includes(`${resource}:${action}`) || permissions.includes(`${resource}:manage`);
  };

  /**
   * Check if user has any of the specified permissions
   */
  const hasAnyPermission = (checks: Array<{ resource: string; action: string }>): boolean => {
    if (isSuperAdmin || isTenantAdmin) return true;
    return checks.some(({ resource, action }) => hasPermission(resource, action));
  };

  /**
   * Check if user has all of the specified permissions
   */
  const hasAllPermissions = (checks: Array<{ resource: string; action: string }>): boolean => {
    if (isSuperAdmin || isTenantAdmin) return true;
    return checks.every(({ resource, action }) => hasPermission(resource, action));
  };

  // Convenience permission checks for common operations
  const can = {
    // Company permissions
    createCompany: hasPermission('company', 'create'),
    readCompany: hasPermission('company', 'read'),
    updateCompany: hasPermission('company', 'update'),
    deleteCompany: hasPermission('company', 'delete'),
    exportCompany: hasPermission('company', 'export'),
    importCompany: hasPermission('company', 'import'),

    // Document permissions
    createDocument: hasPermission('document', 'create'),
    readDocument: hasPermission('document', 'read'),
    updateDocument: hasPermission('document', 'update'),
    deleteDocument: hasPermission('document', 'delete'),
    exportDocument: hasPermission('document', 'export'),

    // Contact permissions
    createContact: hasPermission('contact', 'create'),
    readContact: hasPermission('contact', 'read'),
    updateContact: hasPermission('contact', 'update'),
    deleteContact: hasPermission('contact', 'delete'),

    // Officer permissions
    createOfficer: hasPermission('officer', 'create'),
    readOfficer: hasPermission('officer', 'read'),
    updateOfficer: hasPermission('officer', 'update'),
    deleteOfficer: hasPermission('officer', 'delete'),

    // Shareholder permissions
    createShareholder: hasPermission('shareholder', 'create'),
    readShareholder: hasPermission('shareholder', 'read'),
    updateShareholder: hasPermission('shareholder', 'update'),
    deleteShareholder: hasPermission('shareholder', 'delete'),

    // User permissions
    createUser: hasPermission('user', 'create'),
    readUser: hasPermission('user', 'read'),
    updateUser: hasPermission('user', 'update'),
    deleteUser: hasPermission('user', 'delete'),

    // Role permissions
    createRole: hasPermission('role', 'create'),
    readRole: hasPermission('role', 'read'),
    updateRole: hasPermission('role', 'update'),
    deleteRole: hasPermission('role', 'delete'),

    // Tenant permissions
    readTenant: hasPermission('tenant', 'read'),
    updateTenant: hasPermission('tenant', 'update'),

    // Audit log permissions
    readAuditLog: hasPermission('audit_log', 'read'),
    exportAuditLog: hasPermission('audit_log', 'export'),
  };

  return {
    permissions,
    isSuperAdmin,
    isTenantAdmin,
    isLoading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    can,
  };
}

/**
 * Hook to get permissions for multiple companies at once
 * Returns a map of companyId -> permissions check functions
 *
 * @param companyIds - Array of company IDs to check permissions for
 * @returns Object with permission check functions per company
 */
export function useCompanyPermissions(companyIds: string[]) {
  // First get base permissions (for SUPER_ADMIN/TENANT_ADMIN check)
  const { isSuperAdmin, isTenantAdmin, isLoading: baseLoading } = usePermissions();

  // Fetch permissions for each company
  const queries = useQueries({
    queries: companyIds.map((companyId) => ({
      queryKey: ['permissions', companyId],
      queryFn: () => fetchPermissions(companyId),
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: false,
      // Skip fetching if user is admin (they have all permissions)
      enabled: !isSuperAdmin && !isTenantAdmin,
    })),
  });

  const isLoading = baseLoading || queries.some((q) => q.isLoading);

  // Build permission map: companyId -> { canEdit, canDelete, ... }
  const permissionsByCompany = useMemo(() => {
    const map: Record<string, {
      canEdit: boolean;
      canDelete: boolean;
      canRead: boolean;
      canExport: boolean;
    }> = {};

    companyIds.forEach((companyId, index) => {
      // Admins have all permissions
      if (isSuperAdmin || isTenantAdmin) {
        map[companyId] = {
          canEdit: true,
          canDelete: true,
          canRead: true,
          canExport: true,
        };
        return;
      }

      const queryResult = queries[index];
      const permissions = queryResult.data?.permissions || [];

      const hasPermission = (resource: string, action: string): boolean => {
        return permissions.includes(`${resource}:${action}`) || permissions.includes(`${resource}:manage`);
      };

      map[companyId] = {
        canEdit: hasPermission('company', 'update'),
        canDelete: hasPermission('company', 'delete'),
        canRead: hasPermission('company', 'read'),
        canExport: hasPermission('company', 'export'),
      };
    });

    return map;
  }, [companyIds, queries, isSuperAdmin, isTenantAdmin]);

  /**
   * Check if user can perform an action on a specific company
   */
  const canEditCompany = (companyId: string): boolean => {
    if (isSuperAdmin || isTenantAdmin) return true;
    return permissionsByCompany[companyId]?.canEdit ?? false;
  };

  const canDeleteCompany = (companyId: string): boolean => {
    if (isSuperAdmin || isTenantAdmin) return true;
    return permissionsByCompany[companyId]?.canDelete ?? false;
  };

  return {
    isLoading,
    isSuperAdmin,
    isTenantAdmin,
    permissionsByCompany,
    canEditCompany,
    canDeleteCompany,
  };
}
