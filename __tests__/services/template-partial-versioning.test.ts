import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma';

const prismaMock = vi.hoisted(() => ({
  templatePartial: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  computeChanges: vi.fn(
    (): Record<string, { old: unknown; new: unknown }> => ({
      displayName: { old: 'Old name', new: 'Renamed' },
    }),
  ),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import { updateTemplatePartial } from '@/services/template-partial.service';
import {
  editorPlaceholdersToStorage,
  storagePlaceholdersToEditor,
} from '@/lib/template-placeholder-storage';

const actor = { tenantId: 'tenant-1', userId: 'user-1' };
const partial = {
  id: 'partial-1',
  tenantId: actor.tenantId,
  name: 'accounting-sow',
  displayName: 'Old name',
  description: null,
  content: '<p>Scope</p>',
  placeholders: [{ key: 'service.fields.software' }],
  version: 3,
  deletedAt: null,
};

describe('template partial material versioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.templatePartial.findFirst.mockResolvedValue(partial);
  });

  it('does not increment version for metadata-only changes', async () => {
    prismaMock.templatePartial.update.mockResolvedValue({
      ...partial,
      displayName: 'Renamed',
    });

    await updateTemplatePartial(
      { id: partial.id, displayName: 'Renamed' },
      actor,
    );

    expect(prismaMock.templatePartial.update).toHaveBeenCalledWith({
      where: { id: partial.id },
      data: { displayName: 'Renamed' },
    });
  });

  it('refuses content changes to A4 partials now that the editor is retired', async () => {
    await expect(updateTemplatePartial(
      { id: partial.id, content: '<p>Updated scope</p>' },
      actor,
    )).rejects.toMatchObject({ details: { reason: 'A4_EDITOR_RETIRED', operation: 'partial-edit' } });
    expect(prismaMock.templatePartial.update).not.toHaveBeenCalled();
  });

  it('does not increment when a display-name edit resubmits unchanged service placeholders', async () => {
    const stored = [{
      key: 'service.fields.software',
      label: 'Accounting software',
      type: 'textarea',
      source: 'service',
      category: 'service-input',
      path: 'service.fields.software',
      required: true,
    }];
    prismaMock.templatePartial.findFirst.mockResolvedValue({
      ...partial,
      placeholders: stored,
    });
    prismaMock.templatePartial.update.mockResolvedValue({
      ...partial,
      displayName: 'Renamed',
      placeholders: stored,
    });

    await updateTemplatePartial(
      {
        id: partial.id,
        displayName: 'Renamed',
        placeholders: editorPlaceholdersToStorage(
          storagePlaceholdersToEditor(stored),
        ) as Prisma.InputJsonValue,
      },
      actor,
    );

    expect(prismaMock.templatePartial.update).toHaveBeenCalledWith({
      where: { id: partial.id },
      data: {
        displayName: 'Renamed',
        placeholders: stored,
      },
    });
  });

  it('increments exactly once when a service placeholder definition changes', async () => {
    const changed = [{
      key: 'service.fields.software',
      label: 'Preferred accounting software',
      type: 'text',
      source: 'service',
      required: true,
    }];
    prismaMock.templatePartial.update.mockResolvedValue({
      ...partial,
      placeholders: changed,
      version: 4,
    });

    await updateTemplatePartial(
      { id: partial.id, placeholders: changed },
      actor,
    );

    expect(prismaMock.templatePartial.update).toHaveBeenCalledWith({
      where: { id: partial.id },
      data: {
        placeholders: changed,
        version: { increment: 1 },
      },
    });
    expect(prismaMock.templatePartial.update).toHaveBeenCalledOnce();
  });
});
