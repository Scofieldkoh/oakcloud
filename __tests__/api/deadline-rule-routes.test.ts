import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  isSuperAdmin: false,
  isWorkspaceAdmin: true,
};

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireServiceAdministrator: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  listDeadlineRules: vi.fn(),
  getDeadlineRule: vi.fn(),
  createDeadlineRule: vi.fn(),
  updateDeadlineRuleDraft: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/service-administration-auth', () => ({ requireServiceAdministrator: mocks.requireServiceAdministrator }));
vi.mock('@/lib/api-helpers', () => ({ resolveWorkspaceId: mocks.resolveWorkspaceId }));
vi.mock('@/services/deadline-rule', () => ({
  listDeadlineRules: mocks.listDeadlineRules,
  getDeadlineRule: mocks.getDeadlineRule,
  createDeadlineRule: mocks.createDeadlineRule,
  updateDeadlineRuleDraft: mocks.updateDeadlineRuleDraft,
}));

import { GET, POST } from '@/app/api/service-catalog/deadline-rules/route';
import { GET as getOne, PATCH } from '@/app/api/service-catalog/deadline-rules/[id]/route';

const draft = {
  code: 'SG_ECI',
  name: 'ECI',
  description: null,
  recurrence: { schemaVersion: 1, kind: 'ANNUALLY' },
  applicability: { schemaVersion: 1, kind: 'ALL', conditions: [] },
  parameters: [],
  milestones: [{
    key: 'eci-due',
    name: 'ECI due',
    description: null,
    type: 'STATUTORY',
    generationMode: 'ONCE_PER_CYCLE',
    expression: { kind: 'SOURCE', source: { kind: 'CYCLE_END' } },
    businessDayAdjustment: 'NONE',
    displayOrder: 0,
    isActive: true,
  }],
};

describe('deadline rule routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue(session);
    mocks.resolveWorkspaceId.mockReturnValue(session.tenantId);
  });

  it('lists tenant-scoped rules as a service administrator', async () => {
    mocks.listDeadlineRules.mockResolvedValue({ rules: [], total: 0 });
    const response = await GET(new NextRequest('http://localhost/api/service-catalog/deadline-rules'));
    expect(response.status).toBe(200);
    expect(mocks.requireServiceAdministrator).toHaveBeenCalledWith(session);
    expect(mocks.listDeadlineRules).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }), {
      tenantId: session.tenantId,
      userId: session.id,
    });
  });

  it('parses and creates a strict draft payload', async () => {
    mocks.createDeadlineRule.mockResolvedValue({ id: 'rule-1' });
    const response = await POST(new NextRequest('http://localhost/api/service-catalog/deadline-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, tenantId: session.tenantId }),
    }));
    expect(response.status).toBe(201);
    expect(mocks.createDeadlineRule).toHaveBeenCalledWith(expect.objectContaining({ code: 'SG_ECI' }), {
      tenantId: session.tenantId,
      userId: session.id,
    });
  });

  it('loads and updates one tenant-scoped draft', async () => {
    const ruleId = '33333333-3333-4333-8333-333333333333';
    mocks.getDeadlineRule.mockResolvedValue({ id: ruleId });
    mocks.updateDeadlineRuleDraft.mockResolvedValue({ id: ruleId });
    const getResponse = await getOne(
      new NextRequest(`http://localhost/api/service-catalog/deadline-rules/${ruleId}`),
      { params: Promise.resolve({ id: ruleId }) },
    );
    const patchResponse = await PATCH(
      new NextRequest(`http://localhost/api/service-catalog/deadline-rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, expectedDraftRevision: 1 }),
      }),
      { params: Promise.resolve({ id: ruleId }) },
    );
    expect(getResponse.status).toBe(200);
    expect(patchResponse.status).toBe(200);
  });

  it('returns validation errors for malformed JSON, non-object JSON, invalid UUIDs, and tenant mismatches', async () => {
    const invalidJson = await POST(new NextRequest('http://localhost/api/service-catalog/deadline-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"code":',
    }));
    expect(invalidJson.status).toBe(400);

    const nonObject = await POST(new NextRequest('http://localhost/api/service-catalog/deadline-rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    }));
    expect(nonObject.status).toBe(400);

    const invalidQueryTenant = await GET(new NextRequest(
      'http://localhost/api/service-catalog/deadline-rules?tenantId=tenant-1',
    ));
    expect(invalidQueryTenant.status).toBe(400);

    const invalidId = await getOne(
      new NextRequest('http://localhost/api/service-catalog/deadline-rules/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(invalidId.status).toBe(400);

    const mismatchedTenant = await POST(new NextRequest(
      `http://localhost/api/service-catalog/deadline-rules?tenantId=${session.tenantId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, tenantId: '44444444-4444-4444-8444-444444444444' }),
      },
    ));
    expect(mismatchedTenant.status).toBe(400);
    expect(mocks.createDeadlineRule).not.toHaveBeenCalled();

    const invalidPatchTenant = await PATCH(new NextRequest(
      `http://localhost/api/service-catalog/deadline-rules/${'33333333-3333-4333-8333-333333333333'}?tenantId=${session.tenantId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, tenantId: 'not-a-uuid' }),
      },
    ), { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) });
    expect(invalidPatchTenant.status).toBe(400);

    const mismatchedPatchTenant = await PATCH(new NextRequest(
      `http://localhost/api/service-catalog/deadline-rules/${'33333333-3333-4333-8333-333333333333'}?tenantId=${session.tenantId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, tenantId: '44444444-4444-4444-8444-444444444444' }),
      },
    ), { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) });
    expect(mismatchedPatchTenant.status).toBe(400);
    expect(mocks.updateDeadlineRuleDraft).not.toHaveBeenCalled();
  });
});
