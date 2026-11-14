import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), access: vi.fn(), workspace: vi.fn(),
  company: vi.fn(), create: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.auth, canAccessCompany: mocks.access,
}));
vi.mock('@/lib/rbac', () => ({ requirePermission: mocks.permission }));
vi.mock('@/lib/api-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return { ...actual, resolveWorkspaceId: mocks.workspace };
});
vi.mock('@/services/company.service', () => ({ getCompanyFullDetails: mocks.company }));
vi.mock('@/services/form-draft.service', () => ({ createPrefilledFormDraft: mocks.create }));

const formId = '22222222-2222-4222-8222-222222222222';
const companyId = '11111111-1111-4111-8111-111111111111';
const makeRequest = (body: unknown) => new Request(
  'http://localhost/api/forms/' + formId + '/drafts',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
) as NextRequest;

describe('staff Annual Return company-prefill endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: 'staff-1', tenantId: 'tenant-1', isSuperAdmin: false });
    mocks.permission.mockResolvedValue(undefined);
    mocks.access.mockResolvedValue(true);
    mocks.workspace.mockReturnValue('tenant-1');
    mocks.company.mockResolvedValue({
      id: companyId, tenantId: 'tenant-1', name: 'Example Pte Ltd',
      uen: '202612345A', entityType: 'PRIVATE_LIMITED', status: 'LIVE',
      aggregateRevision: 12, officers: [], shareholders: [], shareCapital: [],
    });
    mocks.create.mockResolvedValue({ draftId: 'draft-1', resumeUrl: 'https://app.test/forms/f/slug?draft=x&resume=secret', expiresAt: new Date('2026-12-14') });
  });

  it('requires document update and company read permissions, then generates a tenant-scoped draft', async () => {
    const { POST } = await import('@/app/api/forms/[id]/drafts/route');
    const response = await POST(makeRequest({ companyId }), { params: Promise.resolve({ id: formId }) });
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.resumeUrl).toContain('resume=');
    expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'document', 'update');
    expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'company', 'read', companyId);
    expect(mocks.company).toHaveBeenCalledWith(companyId, 'tenant-1');
    expect(mocks.create).toHaveBeenCalledWith(formId, expect.objectContaining({
      prefill_source: 'company_record', company_name: 'Example Pte Ltd',
    }), expect.objectContaining({
      companyId, companyAggregateRevision: 12,
      createdById: 'staff-1', baseline: expect.objectContaining({ company_name: 'Example Pte Ltd' }),
    }), { tenantId: 'tenant-1', userId: 'staff-1' });
  });

  it('refuses a company outside the staff scope', async () => {
    mocks.access.mockResolvedValue(false);
    const { POST } = await import('@/app/api/forms/[id]/drafts/route');
    const response = await POST(makeRequest({ companyId }), { params: Promise.resolve({ id: formId }) });
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not load an absent company from another tenant', async () => {
    mocks.company.mockResolvedValue(null);
    const { POST } = await import('@/app/api/forms/[id]/drafts/route');
    const response = await POST(makeRequest({ companyId }), { params: Promise.resolve({ id: formId }) });
    expect(response.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant company even if a faulty lookup returns it', async () => {
    mocks.company.mockResolvedValue({
      id: companyId, tenantId: 'other-tenant', name: 'Wrong Company', entityType: 'PRIVATE_LIMITED',
    });
    const { POST } = await import('@/app/api/forms/[id]/drafts/route');
    const response = await POST(makeRequest({ companyId }), { params: Promise.resolve({ id: formId }) });
    expect(response.status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
