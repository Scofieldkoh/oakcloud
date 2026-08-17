import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = {
  id: 'user-1',
  tenantId: 'tenant-1',
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
      body: JSON.stringify({ ...draft, tenantId: 'tenant-1' }),
    }));
    expect(response.status).toBe(201);
    expect(mocks.createDeadlineRule).toHaveBeenCalledWith(expect.objectContaining({ code: 'SG_ECI' }), {
      tenantId: session.tenantId,
      userId: session.id,
    });
  });

  it('loads and updates one tenant-scoped draft', async () => {
    mocks.getDeadlineRule.mockResolvedValue({ id: 'rule-1' });
    mocks.updateDeadlineRuleDraft.mockResolvedValue({ id: 'rule-1' });
    const getResponse = await getOne(
      new NextRequest('http://localhost/api/service-catalog/deadline-rules/rule-1'),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );
    const patchResponse = await PATCH(
      new NextRequest('http://localhost/api/service-catalog/deadline-rules/rule-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, expectedDraftRevision: 1 }),
      }),
      { params: Promise.resolve({ id: 'rule-1' }) },
    );
    expect(getResponse.status).toBe(200);
    expect(patchResponse.status).toBe(200);
  });
});
