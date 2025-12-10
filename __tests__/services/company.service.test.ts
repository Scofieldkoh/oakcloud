/**
 * Company Service Tests
 *
 * Tests for company CRUD operations, multi-tenancy isolation,
 * and business logic validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock audit logging
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
  computeChanges: vi.fn(() => []),
}));

// Mock tenant utilities
vi.mock('@/lib/tenant', () => ({
  canAddCompany: vi.fn(() => Promise.resolve(true)),
}));

import { prisma } from '@/lib/prisma';
import {
  getCompanyById,
  getCompanyByUen,
  searchCompanies,
  createCompany,
} from '@/services/company.service';

describe('Company Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCompanyById', () => {
    it('should require tenantId for non-admin queries', async () => {
      await expect(
        getCompanyById('company-1', null)
      ).rejects.toThrow('tenantId is required');
    });

    it('should allow skipTenantFilter for SUPER_ADMIN', async () => {
      const mockCompany = {
        id: 'company-1',
        name: 'Test Company',
        uen: '202312345A',
        tenantId: 'tenant-1',
      };

      vi.mocked(prisma.company.findFirst).mockResolvedValue(mockCompany as never);

      const result = await getCompanyById('company-1', null, { skipTenantFilter: true });

      expect(result).toEqual(mockCompany);
      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'company-1',
          }),
        })
      );
    });

    it('should filter by tenantId for regular queries', async () => {
      const mockCompany = {
        id: 'company-1',
        name: 'Test Company',
        uen: '202312345A',
        tenantId: 'tenant-1',
      };

      vi.mocked(prisma.company.findFirst).mockResolvedValue(mockCompany as never);

      await getCompanyById('company-1', 'tenant-1');

      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'company-1',
            tenantId: 'tenant-1',
          }),
        })
      );
    });

    it('should exclude soft-deleted companies by default', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue(null);

      await getCompanyById('company-1', 'tenant-1');

      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });

    it('should include soft-deleted when requested', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue(null);

      await getCompanyById('company-1', 'tenant-1', { includeDeleted: true });

      // Should NOT have deletedAt: null in where clause
      const call = vi.mocked(prisma.company.findFirst).mock.calls[0][0];
      expect(call?.where).not.toHaveProperty('deletedAt');
    });
  });

  describe('getCompanyByUen', () => {
    it('should find company by UEN within tenant', async () => {
      const mockCompany = {
        id: 'company-1',
        name: 'Test Company',
        uen: '202312345A',
        tenantId: 'tenant-1',
      };

      vi.mocked(prisma.company.findFirst).mockResolvedValue(mockCompany as never);

      const result = await getCompanyByUen('202312345A', 'tenant-1');

      expect(result).toEqual(mockCompany);
      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            uen: '202312345A',
            tenantId: 'tenant-1',
          }),
        })
      );
    });

    it('should return null for non-existent UEN', async () => {
      vi.mocked(prisma.company.findFirst).mockResolvedValue(null);

      const result = await getCompanyByUen('NOTEXIST', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('searchCompanies', () => {
    it('should filter by tenantId', async () => {
      vi.mocked(prisma.company.findMany).mockResolvedValue([]);
      vi.mocked(prisma.company.count).mockResolvedValue(0);

      // searchCompanies(params, tenantId, options)
      await searchCompanies({}, 'tenant-1');

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        })
      );
    });

    it('should search by query string (name, UEN, SSIC)', async () => {
      vi.mocked(prisma.company.findMany).mockResolvedValue([]);
      vi.mocked(prisma.company.count).mockResolvedValue(0);

      await searchCompanies({ query: 'test' }, 'tenant-1');

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.anything() }),
              expect.objectContaining({ uen: expect.anything() }),
            ]),
          }),
        })
      );
    });

    it('should filter by entity type', async () => {
      vi.mocked(prisma.company.findMany).mockResolvedValue([]);
      vi.mocked(prisma.company.count).mockResolvedValue(0);

      await searchCompanies({ entityType: 'PRIVATE_LIMITED' }, 'tenant-1');

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'PRIVATE_LIMITED',
          }),
        })
      );
    });

    it('should filter by status', async () => {
      vi.mocked(prisma.company.findMany).mockResolvedValue([]);
      vi.mocked(prisma.company.count).mockResolvedValue(0);

      await searchCompanies({ status: 'LIVE' }, 'tenant-1');

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'LIVE',
          }),
        })
      );
    });

    it('should paginate results', async () => {
      vi.mocked(prisma.company.findMany).mockResolvedValue([]);
      vi.mocked(prisma.company.count).mockResolvedValue(100);

      const result = await searchCompanies({ page: 2, limit: 20 }, 'tenant-1');

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (page - 1) * limit = (2 - 1) * 20
          take: 20,
        })
      );
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(5); // 100 / 20
    });

    it('should restrict to companyIds for company-scoped users', async () => {
      vi.mocked(prisma.company.findMany).mockResolvedValue([]);
      vi.mocked(prisma.company.count).mockResolvedValue(0);

      await searchCompanies({}, 'tenant-1', { companyIds: ['company-1', 'company-2'] });

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['company-1', 'company-2'] },
          }),
        })
      );
    });
  });

  describe('createCompany', () => {
    it('should create company with tenantId', async () => {
      const mockCompany = {
        id: 'new-company',
        name: 'New Company Pte Ltd',
        uen: '202400001A',
        tenantId: 'tenant-1',
      };

      // Mock findFirst to return null (no existing UEN)
      vi.mocked(prisma.company.findFirst).mockResolvedValue(null);
      // Mock create to return new company
      vi.mocked(prisma.company.create).mockResolvedValue(mockCompany as never);

      const result = await createCompany(
        {
          name: 'New Company Pte Ltd',
          uen: '202400001A',
          entityType: 'PRIVATE_LIMITED',
          status: 'LIVE',
        },
        { tenantId: 'tenant-1', userId: 'user-1' }
      );

      expect(result.name).toBe('New Company Pte Ltd');
    });

    it('should reject duplicate UEN within tenant', async () => {
      const existingCompany = {
        id: 'existing-company',
        name: 'Existing Company',
        uen: '202400001A',
        tenantId: 'tenant-1',
      };

      // Mock findFirst to return existing company (UEN already exists)
      vi.mocked(prisma.company.findFirst).mockResolvedValue(existingCompany as never);

      await expect(
        createCompany(
          {
            name: 'Duplicate Company',
            uen: '202400001A',
            entityType: 'PRIVATE_LIMITED',
            status: 'LIVE',
          },
          { tenantId: 'tenant-1', userId: 'user-1' }
        )
      ).rejects.toThrow('already exists');
    });
  });

  describe('Multi-tenancy Isolation', () => {
    it('should not return companies from other tenants', async () => {
      // Company exists in tenant-2 but we query tenant-1
      vi.mocked(prisma.company.findFirst).mockResolvedValue(null);

      const result = await getCompanyById('company-from-tenant-2', 'tenant-1');

      expect(result).toBeNull();
      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        })
      );
    });

    it('should allow same UEN in different tenants', async () => {
      // Same UEN can exist in different tenants
      const tenant1Company = {
        id: 'company-t1',
        name: 'Company in Tenant 1',
        uen: '202400001A',
        tenantId: 'tenant-1',
      };

      vi.mocked(prisma.company.findFirst).mockResolvedValue(tenant1Company as never);

      const result = await getCompanyByUen('202400001A', 'tenant-1');

      expect(result?.tenantId).toBe('tenant-1');
    });
  });
});
