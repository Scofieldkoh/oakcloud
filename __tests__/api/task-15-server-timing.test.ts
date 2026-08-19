import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requirePermission: vi.fn(),
  requireServicesWorkspaceEnabled: vi.fn(),
  getCompanyReadScope: vi.fn(),
  listServiceRoster: vi.fn(),
  listDeadlines: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/rbac', () => ({ requirePermission: mocks.requirePermission }));
vi.mock('@/services/schedule-reconciliation', () => ({
  requireServicesWorkspaceEnabled: mocks.requireServicesWorkspaceEnabled,
}));
vi.mock('@/lib/api/company-query', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/company-query')>('@/lib/api/company-query');
  return { ...actual, getCompanyReadScope: mocks.getCompanyReadScope };
});
vi.mock('@/services/service-roster', () => ({ listServiceRoster: mocks.listServiceRoster }));
vi.mock('@/services/deadline', () => ({ listDeadlines: mocks.listDeadlines }));

import { GET as rosterGET } from '@/app/api/client-services/route';
import { GET as deadlineGET } from '@/app/api/deadlines/route';

const tenantId = '11111111-1111-4111-8111-111111111111';
const companyId = '22222222-2222-4222-8222-222222222222';
const session = {
  id: 'user-1',
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  tenantId,
  isSuperAdmin: false,
  isWorkspaceAdmin: false,
  hasAllCompaniesAccess: false,
  companyIds: [companyId],
};

describe('Task 15 list response timing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(session);
    mocks.requirePermission.mockResolvedValue(undefined);
    mocks.requireServicesWorkspaceEnabled.mockResolvedValue(undefined);
    mocks.getCompanyReadScope.mockReturnValue({ tenantId, options: { companyIds: [companyId] } });
    mocks.listServiceRoster.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mocks.listDeadlines.mockResolvedValue({ mode: 'TABLE', items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
  });

  it('adds Server-Timing to the roster response without changing its body or status', async () => {
    const response = await rosterGET(new NextRequest('http://localhost/api/client-services'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    expect(String(response.headers.get('Server-Timing'))).toMatch(/^app;dur=\d+\.\d$/);
    expect(String(response.headers.get('X-Response-Time-Ms'))).toMatch(/^\d+\.\d$/);
  });

  it('adds Server-Timing to the deadline response without changing its body or status', async () => {
    const response = await deadlineGET(new NextRequest('http://localhost/api/deadlines?from=2026-08-01&to=2026-08-31'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: 'TABLE', items: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    expect(String(response.headers.get('Server-Timing'))).toMatch(/^app;dur=\d+\.\d$/);
    expect(String(response.headers.get('X-Response-Time-Ms'))).toMatch(/^\d+\.\d$/);
  });
});
