import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), workspace: vi.fn(), duplicate: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/rbac', () => ({ requirePermission: mocks.permission }));
vi.mock('@/lib/api-helpers', async () => {
  const real = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return { ...real, resolveWorkspaceId: mocks.workspace };
});
vi.mock('@/services/form-builder.service', () => ({ duplicateForm: mocks.duplicate }));

const request = (asRevision?: boolean) => new Request(
  'http://localhost/api/forms/form-1/duplicate',
  { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: 'tenant-1', ...(asRevision !== undefined ? { asRevision } : {}) }) },
) as NextRequest;

describe('Published form draft revision route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' });
    mocks.workspace.mockReturnValue('tenant-1');
    mocks.permission.mockResolvedValue(undefined);
    mocks.duplicate.mockResolvedValue({ id: 'new-draft', status: 'DRAFT' });
  });

  it('creates an editable revision only with create and update permissions', async () => {
    const { POST } = await import('@/app/api/forms/[id]/duplicate/route');
    const response = await POST(request(true), { params: Promise.resolve({ id: 'form-1' }) });
    expect(response.status).toBe(201);
    expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'document', 'create');
    expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'document', 'update');
    expect(mocks.duplicate).toHaveBeenCalledWith(
      'form-1', { tenantId: 'tenant-1', userId: 'user-1' }, undefined, true,
    );
  });

  it('retains ordinary duplication behaviour without elevated update access', async () => {
    const { POST } = await import('@/app/api/forms/[id]/duplicate/route');
    const response = await POST(request(), { params: Promise.resolve({ id: 'form-1' }) });
    expect(response.status).toBe(201);
    expect(mocks.permission).toHaveBeenCalledTimes(1);
    expect(mocks.duplicate).toHaveBeenCalledWith(
      'form-1', { tenantId: 'tenant-1', userId: 'user-1' }, undefined, false,
    );
  });

  it('rejects invalid asRevision values before copying anything', async () => {
    const { POST } = await import('@/app/api/forms/[id]/duplicate/route');
    const response = await POST(new Request(
      'http://localhost/api/forms/form-1/duplicate',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: 'tenant-1', asRevision: 'yes' }) },
    ) as NextRequest, { params: Promise.resolve({ id: 'form-1' }) });
    expect(response.status).toBe(400);
    expect(mocks.duplicate).not.toHaveBeenCalled();
  });
});
