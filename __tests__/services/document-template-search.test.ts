import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  documentTemplate: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
  computeChanges: vi.fn(() => null),
}));

import { searchDocumentTemplates } from '@/services/document-template.service';

describe('document-template search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.documentTemplate.findMany.mockResolvedValue([]);
    prismaMock.documentTemplate.count.mockResolvedValue(0);
  });

  it('filters OakDoc manager searches by OakDoc metadata', async () => {
    await searchDocumentTemplates(
      {
        editor: 'oakdoc',
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      },
      'tenant-1',
    );

    expect(prismaMock.documentTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          deletedAt: null,
          contentJson: {
            path: ['oakDoc', 'schemaVersion'],
            equals: 1,
          },
        }),
      }),
    );
    expect(prismaMock.documentTemplate.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        contentJson: {
          path: ['oakDoc', 'schemaVersion'],
          equals: 1,
        },
      }),
    });
  });

  it('keeps legacy template searches unfiltered by editor type', async () => {
    await searchDocumentTemplates(
      {
        page: 1,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      },
      'tenant-1',
    );

    const firstCall = prismaMock.documentTemplate.findMany.mock.calls[0]?.[0];
    expect(firstCall.where).not.toHaveProperty('contentJson');
  });

  it('lists archived A4 templates by excluding every Word template', async () => {
    prismaMock.documentTemplate.findMany
      .mockResolvedValueOnce([{ id: 'word-1' }, { id: 'word-2' }])
      .mockResolvedValueOnce([]);

    await searchDocumentTemplates(
      { editor: 'a4', page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' },
      'tenant-1',
    );

    expect(prismaMock.documentTemplate.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-1',
        deletedAt: null,
        contentJson: { path: ['oakDoc', 'schemaVersion'], equals: 1 },
      },
      select: { id: true },
    });
    const listCall = prismaMock.documentTemplate.findMany.mock.calls[1]?.[0];
    expect(listCall.where).toMatchObject({ tenantId: 'tenant-1', id: { notIn: ['word-1', 'word-2'] } });
    expect(listCall.where).not.toHaveProperty('contentJson');
  });
});
