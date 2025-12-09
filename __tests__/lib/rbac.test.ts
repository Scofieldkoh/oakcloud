import { describe, it, expect } from 'vitest';
import { canAccessAuditLogs } from '@/lib/rbac';

describe('RBAC', () => {
  describe('canAccessAuditLogs', () => {
    it('should allow SUPER_ADMIN to access audit logs', () => {
      const session = {
        id: 'user-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        tenantId: 'tenant-1',
        isSuperAdmin: true,
        isTenantAdmin: false,
        companyIds: [],
        hasAllCompaniesAccess: false,
      };

      expect(canAccessAuditLogs(session)).toBe(true);
    });

    it('should allow TENANT_ADMIN to access audit logs', () => {
      const session = {
        id: 'user-2',
        email: 'tenant@test.com',
        firstName: 'Tenant',
        lastName: 'Admin',
        tenantId: 'tenant-1',
        isSuperAdmin: false,
        isTenantAdmin: true,
        companyIds: ['company-1'],
        hasAllCompaniesAccess: true,
      };

      expect(canAccessAuditLogs(session)).toBe(true);
    });

    it('should deny regular users access to audit logs', () => {
      const session = {
        id: 'user-3',
        email: 'user@test.com',
        firstName: 'Regular',
        lastName: 'User',
        tenantId: 'tenant-1',
        isSuperAdmin: false,
        isTenantAdmin: false,
        companyIds: ['company-1'],
        hasAllCompaniesAccess: false,
      };

      expect(canAccessAuditLogs(session)).toBe(false);
    });
  });
});
