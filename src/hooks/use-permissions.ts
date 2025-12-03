'use client';

import { useQuery } from '@tanstack/react-query';

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
