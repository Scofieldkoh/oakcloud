import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), workspace: vi.fn(),
  update: vi.fn(), saveFields: vi.fn(), get: vi.fn(), delete: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/rbac', () => ({ requirePermission: mocks.permission }));
vi.mock('@/lib/api-helpers', async () => {
  const real = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return { ...real, resolveWorkspaceId: mocks.workspace };
});
vi.mock('@/services/form-builder.service', () => ({
  updateForm: mocks.update, saveFormFields: mocks.saveFields,
  getFormById: mocks.get, deleteForm: mocks.delete,
}));

describe('Form publishing with field changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: 'staff-1', tenantId: 'tenant-1' });
    mocks.permission.mockResolvedValue(undefined);
    mocks.workspace.mockReturnValue('tenant-1');
    mocks.get.mockResolvedValue({ id: 'form-1', status: 'PUBLISHED' });
    mocks.saveFields.mockResolvedValue([]);
    mocks.update.mockResolvedValue({ id: 'form-1', status: 'PUBLISHED' });
  });

  it('saves draft questions before locking the definition on publish', async () => {
    const operations: string[] = [];
    mocks.saveFields.mockImplementation(async () => { operations.push('fields'); return []; });
    mocks.update.mockImplementation(async () => { operations.push('publish'); return { status: 'PUBLISHED' }; });
    const { PATCH } = await import('@/app/api/forms/[id]/route');
    const response = await PATCH(new Request('http://localhost/api/forms/form-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: 'tenant-1', status: 'PUBLISHED', fields: [] }),
    }) as NextRequest, { params: Promise.resolve({ id: 'form-1' }) });
    expect(response.status).toBe(200);
    expect(operations).toEqual(['fields', 'publish']);
  });
});
