import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), workspace: vi.fn(), updateKyc: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }));
vi.mock('@/lib/rbac', () => ({ requirePermission: mocks.permission }));
vi.mock('@/lib/api-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-helpers')>('@/lib/api-helpers');
  return { ...actual, resolveWorkspaceId: mocks.workspace };
});
vi.mock('@/services/form-submission/ceo-kyc', () => ({
  updateCeoKycReview: mocks.updateKyc,
}));
vi.mock('@/services/form-builder.service', () => ({
  getFormResponseById: vi.fn(), updateFormResponseTags: vi.fn(),
  updateFormResponseReviewStatus: vi.fn(), deleteFormResponse: vi.fn(),
}));
const path = 'http://localhost/api/forms/form-ar/responses/response-ar?tenantId=tenant-1';
const request = (command: unknown) => new Request(path, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ceoKyc: command }),
}) as NextRequest;

describe('staff CEO KYC/CDD response PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: 'staff-1', tenantId: 'tenant-1' });
    mocks.permission.mockResolvedValue(undefined);
    mocks.workspace.mockReturnValue('tenant-1');
    mocks.updateKyc.mockResolvedValue({ id: 'response-ar', ceoKycReview: { status: 'RECEIVED' } });
  });

  it('requires document update permission and tenant scope', async () => {
    const { PATCH } = await import('@/app/api/forms/[id]/responses/[submissionId]/route');
    const command = { action: 'LINK', reference: '22222222-2222-4222-8222-222222222222' };
    const response = await PATCH(request(command), {
      params: Promise.resolve({ id: 'form-ar', submissionId: 'response-ar' }),
    });
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith(expect.any(Object), 'document', 'update');
    expect(mocks.updateKyc).toHaveBeenCalledWith('form-ar', 'response-ar', command, {
      tenantId: 'tenant-1', userId: 'staff-1',
    });
  });

  it('rejects malformed or oversized link input before service invocation', async () => {
    const { PATCH } = await import('@/app/api/forms/[id]/responses/[submissionId]/route');
    for (const command of [{ action: 'LINK', reference: 123 }, { action: 'LINK', reference: 'x'.repeat(2049) }, { action: 'FAKE' }]) {
      const response = await PATCH(request(command), {
        params: Promise.resolve({ id: 'form-ar', submissionId: 'response-ar' }),
      });
      expect(response.status).toBe(400);
    }
    expect(mocks.updateKyc).not.toHaveBeenCalled();
  });
});
