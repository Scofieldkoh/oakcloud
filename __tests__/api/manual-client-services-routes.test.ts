import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

const session = { id: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false };
const authMock = vi.hoisted(() => ({ requireAuth: vi.fn() }));
const rbacMock = vi.hoisted(() => ({ requirePermission: vi.fn(), hasPermission: vi.fn() }));
const serviceMock = vi.hoisted(() => ({ getManualClientServiceCatalogOptions: vi.fn() }));
vi.mock('@/lib/auth', () => authMock);
vi.mock('@/lib/rbac', () => rbacMock);
vi.mock('@/services/client-service', () => serviceMock);

import { GET as getCatalogOptions } from '@/app/api/companies/[id]/services/catalog-options/route';

describe('manual client service catalog options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireAuth.mockResolvedValue(session);
    rbacMock.requirePermission.mockResolvedValue(undefined);
    serviceMock.getManualClientServiceCatalogOptions.mockResolvedValue({ variants: [] });
  });

  it('serves minimal options to a company update-only user without document permissions', async () => {
    const response = await getCatalogOptions(
      new NextRequest('http://localhost/api/companies/company-1/services/catalog-options'),
      { params: Promise.resolve({ id: 'company-1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ variants: [] });
    expect(rbacMock.requirePermission).toHaveBeenCalledWith(session, 'company', 'update', 'company-1');
    expect(rbacMock.hasPermission).not.toHaveBeenCalled();
    expect(serviceMock.getManualClientServiceCatalogOptions).toHaveBeenCalledWith('company-1', { tenantId: 'tenant-1', userId: 'user-1' });
  });

  it('returns a non-revealing 404 for unavailable or cross-workspace companies', async () => {
    serviceMock.getManualClientServiceCatalogOptions.mockRejectedValueOnce(new NotFoundError('Company not found'));

    const response = await getCatalogOptions(
      new NextRequest('http://localhost/api/companies/missing/services/catalog-options'),
      { params: Promise.resolve({ id: 'missing' }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires company update permission before projecting options', async () => {
    rbacMock.requirePermission.mockRejectedValueOnce(new ForbiddenError());

    const response = await getCatalogOptions(
      new NextRequest('http://localhost/api/companies/company-1/services/catalog-options'),
      { params: Promise.resolve({ id: 'company-1' }) },
    );

    expect(response.status).toBe(403);
    expect(serviceMock.getManualClientServiceCatalogOptions).not.toHaveBeenCalled();
  });
});
