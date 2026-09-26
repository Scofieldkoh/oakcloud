// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const convertA4DraftToOakDoc = vi.fn();
const reviewA4DraftConversion = vi.fn();
const requirePermission = vi.fn(async () => undefined);

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', tenantId: 'tenant-1', isSuperAdmin: false })),
}));
vi.mock('@/lib/rbac', () => ({ requirePermission: (...args: unknown[]) => requirePermission(...(args as [])) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/services/oakdoc-draft-conversion.service', () => ({
  convertA4DraftToOakDoc: (...args: unknown[]) => convertA4DraftToOakDoc(...args),
  reviewA4DraftConversion: (...args: unknown[]) => reviewA4DraftConversion(...args),
}));

const { POST } = await import('@/app/api/generated-documents/[id]/oakdoc-conversion/route');

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/generated-documents/doc-1/oakdoc-conversion', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ id: 'doc-1' }) },
  );
}

beforeEach(() => {
  convertA4DraftToOakDoc.mockReset();
  reviewA4DraftConversion.mockReset();
  requirePermission.mockClear();
});

describe('generated document OakDoc conversion route', () => {
  it('converts one draft with create permission', async () => {
    convertA4DraftToOakDoc.mockResolvedValue({ document: { id: 'copy-1' }, reused: false });
    const response = await post({ action: 'convert', expectedRevision: 3 });

    expect(response.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'document', 'create');
    expect(convertA4DraftToOakDoc).toHaveBeenCalledWith(
      { documentId: 'doc-1', expectedRevision: 3 },
      { tenantId: 'tenant-1', userId: 'user-1' },
    );
  });

  it('passes acknowledgements through on accept and needs update permission', async () => {
    reviewA4DraftConversion.mockResolvedValue({ decision: 'accept' });
    const response = await post({ action: 'accept', expectedRevision: 0, acknowledgedCodes: ['OAKDOC_IMPORT_IMAGE_DROPPED'] });

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'document', 'update');
    expect(reviewA4DraftConversion).toHaveBeenCalledWith(
      {
        documentId: 'doc-1',
        expectedRevision: 0,
        decision: 'accept',
        acknowledgedCodes: ['OAKDOC_IMPORT_IMAGE_DROPPED'],
      },
      { tenantId: 'tenant-1', userId: 'user-1' },
    );
  });

  it('requires a revision', async () => {
    const response = await post({ action: 'convert' });
    expect(response.status).toBe(400);
    expect(convertA4DraftToOakDoc).not.toHaveBeenCalled();
  });
});
