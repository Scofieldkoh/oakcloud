import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.hoisted(() => ({ requireAuth: vi.fn() }));
const rbacMock = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const serviceMock = vi.hoisted(() => ({
  getClientService: vi.fn(),
  previewClientServiceDeadlineConfiguration: vi.fn(),
}));
vi.mock('@/lib/auth', () => authMock);
vi.mock('@/lib/rbac', () => rbacMock);
vi.mock('@/services/client-service', () => serviceMock);

import { POST } from '@/app/api/client-services/[id]/deadline-configuration/impact/route';

const serviceId = '11111111-1111-4111-8111-111111111111';
const session = {
  id: 'user-1',
  tenantId: 'tenant-1',
  isSuperAdmin: false,
  hasAllCompaniesAccess: false,
  companyIds: ['company-1'],
};
const body = {
  expectedUpdatedAt: '2026-07-30T00:00:00.000Z',
  deadlineRules: [],
  scheduleSnapshot: {
    status: 'ACTIVE',
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
    startDate: '2026-08-01',
    endDate: null,
    fieldValues: {},
  },
};

describe('client-service impact route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireAuth.mockResolvedValue(session);
    rbacMock.requirePermission.mockResolvedValue(undefined);
    serviceMock.getClientService.mockResolvedValue({ id: serviceId, companyId: 'company-1' });
    serviceMock.previewClientServiceDeadlineConfiguration.mockResolvedValue({
      clientServiceId: serviceId,
      expectedUpdatedAt: body.expectedUpdatedAt,
      proposedConfigHash: 'a'.repeat(64),
      previewFingerprint: 'f'.repeat(64),
      counts: { created: 0, recalculated: 0, cancelled: 0, preserved: 0, inapplicable: 0, missingInput: 0, conflicts: 0, warnings: 0 },
      samples: [],
      warnings: [],
    });
  });

  it('rejects unknown and duplicate query entries before loading the service', async () => {
    const unknown = await POST(new NextRequest(`http://localhost/api/client-services/${serviceId}/deadline-configuration/impact?unexpected=value`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: serviceId }) });
    expect(unknown.status).toBe(400);
    const duplicate = await POST(new NextRequest(`http://localhost/api/client-services/${serviceId}/deadline-configuration/impact?unexpected=one&unexpected=two`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: serviceId }) });
    expect(duplicate.status).toBe(400);
    expect(serviceMock.getClientService).not.toHaveBeenCalled();
  });

  it('fails closed when an impact implementation returns no fingerprint', async () => {
    serviceMock.previewClientServiceDeadlineConfiguration.mockResolvedValueOnce({
      clientServiceId: serviceId,
      expectedUpdatedAt: body.expectedUpdatedAt,
      proposedConfigHash: 'a'.repeat(64),
      previewFingerprint: '',
      counts: { created: 0, recalculated: 0, cancelled: 0, preserved: 0, inapplicable: 0, missingInput: 0, conflicts: 0, warnings: 0 },
      samples: [],
      warnings: [],
    });
    const response = await POST(new NextRequest(`http://localhost/api/client-services/${serviceId}/deadline-configuration/impact`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: serviceId }) });
    expect(response.status).toBe(400);
  });

  it('resolves the scoped company query before requiring company update permission', async () => {
    const response = await POST(new NextRequest(`http://localhost/api/client-services/${serviceId}/deadline-configuration/impact`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: serviceId }) });
    expect(response.status).toBe(200);
    expect(serviceMock.getClientService).toHaveBeenCalledWith(serviceId, {
      tenantId: 'tenant-1',
      userId: 'user-1',
      accessibleCompanyIds: ['company-1'],
      allCompaniesAccess: false,
    });
    expect(rbacMock.requirePermission).toHaveBeenCalledWith(session, 'company', 'update', 'company-1');
  });
});
