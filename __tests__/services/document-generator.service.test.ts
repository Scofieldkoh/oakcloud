import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    generatedDocument: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
  computeChanges: vi.fn(),
}));

vi.mock('@/lib/placeholder-resolver', () => ({
  resolvePlaceholders: vi.fn(),
  prepareCompanyContext: vi.fn(),
  extractPartialReferences: vi.fn(() => []),
}));

vi.mock('@/services/template-partial.service', () => ({
  getPartialsUsedInTemplate: vi.fn(),
}));

vi.mock('@/services/company.service', () => ({
  getCompanyById: vi.fn(),
}));

vi.mock('@/lib/encryption', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { searchGeneratedDocuments } from '@/services/document-generator.service';

describe('Document generator service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.generatedDocument.findMany).mockResolvedValue([]);
    vi.mocked(prisma.generatedDocument.count).mockResolvedValue(0);
  });

  it('requires a workspace id for generated document search', async () => {
    await expect(
      searchGeneratedDocuments(
        {
          page: 1,
          limit: 20,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
        ''
      )
    ).rejects.toThrow('Tenant ID is required for generated documents search');

    expect(prisma.generatedDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.generatedDocument.count).not.toHaveBeenCalled();
  });

  it('applies the workspace filter to list and count queries', async () => {
    await searchGeneratedDocuments(
      {
        query: 'minutes',
        page: 2,
        limit: 10,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
      'workspace-1'
    );

    expect(prisma.generatedDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'workspace-1',
          deletedAt: null,
          OR: expect.any(Array),
        }),
        skip: 10,
        take: 10,
      })
    );
    expect(prisma.generatedDocument.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: 'workspace-1',
        deletedAt: null,
      }),
    });
  });
});
