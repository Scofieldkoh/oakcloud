import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requirePermission: vi.fn(),
  requireServicesWorkspaceEnabled: vi.fn(),
  getClientService: vi.fn(),
  previewManualDeadlineCycle: vi.fn(),
  createManualDeadlineCycle: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/rbac', () => ({ requirePermission: mocks.requirePermission }));
vi.mock('@/services/schedule-reconciliation', () => ({ requireServicesWorkspaceEnabled: mocks.requireServicesWorkspaceEnabled }));
vi.mock('@/services/client-service', () => ({ getClientService: mocks.getClientService }));
vi.mock('@/services/deadline', () => ({
  previewManualDeadlineCycle: mocks.previewManualDeadlineCycle,
  createManualDeadlineCycle: mocks.createManualDeadlineCycle,
}));

import { POST as previewPOST } from '@/app/api/client-services/[id]/deadline-cycles/preview/route';
import { POST as applyPOST } from '@/app/api/client-services/[id]/deadline-cycles/route';

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const serviceId = '33333333-3333-4333-8333-333333333333';
const session = { id: 'user-1', tenantId, isSuperAdmin: false, hasAllCompaniesAccess: false, companyIds: [companyId] };
const body = {
  ruleVersionId: '44444444-4444-4444-8444-444444444444',
  periodKey: '2024',
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  parameterOverrides: {},
  scheduleEntries: [],
};

describe('manual deadline cycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(session);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.requireServicesWorkspaceEnabled.mockResolvedValue(undefined);
    mocks.getClientService.mockResolvedValue({ id: serviceId, companyId });
    mocks.previewManualDeadlineCycle.mockResolvedValue({ milestones: [], previewFingerprint: 'a'.repeat(64) });
    mocks.createManualDeadlineCycle.mockResolvedValue({ cycleId: 'cycle-1', occurrenceIds: [] });
  });

  it('tenant-validates the service, checks company:update, and previews without applying', async () => {
    const response = await previewPOST(new NextRequest(`http://localhost/api/client-services/${serviceId}/deadline-cycles/preview`, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: serviceId }) });

    expect(response.status).toBe(200);
    expect(mocks.requireServicesWorkspaceEnabled).toHaveBeenCalledWith(tenantId);
    expect(mocks.getClientService).toHaveBeenCalledWith(serviceId, expect.objectContaining({ tenantId, accessibleCompanyIds: [companyId] }));
    expect(mocks.requirePermission).toHaveBeenCalledWith(session, 'company', 'update', companyId);
    expect(mocks.previewManualDeadlineCycle).toHaveBeenCalledWith(serviceId, expect.objectContaining(body), expect.objectContaining({ tenantId, userId: session.id }));
    expect(mocks.createManualDeadlineCycle).not.toHaveBeenCalled();
  });

  it('applies only after company:update and forwards the preview fingerprint/selections', async () => {
    const applyBody = { ...body, previewFingerprint: 'a'.repeat(64), notes: 'Historical work', selections: [{ milestoneKey: 'client-records', scheduleEntryKey: '', include: true, operativeDueDate: '2024-02-01', status: 'OPEN' }] };
    const response = await applyPOST(new NextRequest(`http://localhost/api/client-services/${serviceId}/deadline-cycles`, { method: 'POST', body: JSON.stringify(applyBody) }), { params: Promise.resolve({ id: serviceId }) });

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(session, 'company', 'update', companyId);
    expect(mocks.createManualDeadlineCycle).toHaveBeenCalledWith(serviceId, expect.objectContaining(applyBody), expect.objectContaining({ tenantId, userId: session.id }));
  });

  it('returns validation errors before calling the service for a non-UUID route id', async () => {
    const response = await previewPOST(new NextRequest('http://localhost/api/client-services/not-a-uuid/deadline-cycles/preview', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'not-a-uuid' }) });
    expect(response.status).toBe(400);
    expect(mocks.previewManualDeadlineCycle).not.toHaveBeenCalled();
  });
});
