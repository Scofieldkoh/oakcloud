import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  documentTemplate: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
  computeChanges: vi.fn(() => null),
}));

import {
  createDocumentTemplate,
  duplicateDocumentTemplate,
  updateDocumentTemplate,
} from '@/services/document-template.service';

const actor = { tenantId: 'tenant-1', userId: 'user-1' };
const validAgreementContent = [
  '{{@agreement.serviceSections}}',
  '{{@agreement.feeTable}}',
  '{{@agreement.entityAppendix}}',
].join('\n');

const existingAgreement = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: actor.tenantId,
  name: 'Service Agreement',
  description: null,
  category: 'CONTRACT',
  compositionType: 'SERVICE_AGREEMENT',
  content: validAgreementContent,
  contentJson: null,
  placeholders: [],
  isActive: true,
  version: 1,
  createdById: actor.userId,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('document-template service agreement composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects creation when a required agreement slot is missing', async () => {
    prismaMock.documentTemplate.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentTemplate(
        {
          name: 'Invalid Agreement',
          description: null,
          category: 'CONTRACT',
          compositionType: 'SERVICE_AGREEMENT',
          content:
            '{{@agreement.serviceSections}}\n{{@agreement.feeTable}}',
          placeholders: [],
          isActive: true,
        },
        actor,
      ),
    ).rejects.toThrow(
      'Service Agreement template must contain exactly one entityAppendix slot.',
    );

    expect(prismaMock.documentTemplate.create).not.toHaveBeenCalled();
  });

  it('rejects creation when an agreement slot is duplicated', async () => {
    prismaMock.documentTemplate.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentTemplate(
        {
          name: 'Invalid Agreement',
          description: null,
          category: 'CONTRACT',
          compositionType: 'SERVICE_AGREEMENT',
          content: `${validAgreementContent}\n{{@agreement.feeTable}}`,
          placeholders: [],
          isActive: true,
        },
        actor,
      ),
    ).rejects.toThrow(
      'Service Agreement template must contain exactly one feeTable slot.',
    );
  });

  it('validates the merged persisted state when updating content only', async () => {
    prismaMock.documentTemplate.findFirst.mockResolvedValue(existingAgreement);

    await expect(
      updateDocumentTemplate(
        {
          id: existingAgreement.id,
          content:
            '{{@agreement.serviceSections}}\n{{@agreement.entityAppendix}}',
        },
        actor,
      ),
    ).rejects.toThrow(
      'Service Agreement template must contain exactly one feeTable slot.',
    );

    expect(prismaMock.documentTemplate.update).not.toHaveBeenCalled();
  });

  it('rejects changing a standard template to an agreement until slots exist', async () => {
    prismaMock.documentTemplate.findFirst.mockResolvedValue({
      ...existingAgreement,
      compositionType: 'STANDARD',
      content: '<p>Standard contract</p>',
    });

    await expect(
      updateDocumentTemplate(
        {
          id: existingAgreement.id,
          compositionType: 'SERVICE_AGREEMENT',
        },
        actor,
      ),
    ).rejects.toThrow('Service Agreement template must contain exactly one');
  });

  it('keeps standard template writes unaffected', async () => {
    prismaMock.documentTemplate.findFirst.mockResolvedValue(null);
    prismaMock.documentTemplate.create.mockResolvedValue({
      ...existingAgreement,
      compositionType: 'STANDARD',
      content: '<p>Standard contract</p>',
    });

    await createDocumentTemplate(
      {
        name: 'Standard Contract',
        description: null,
        category: 'CONTRACT',
        compositionType: 'STANDARD',
        content: '<p>Standard contract</p>',
        placeholders: [],
        isActive: true,
      },
      actor,
    );

    expect(prismaMock.documentTemplate.create).toHaveBeenCalledOnce();
  });

  it('refuses to duplicate a persisted invalid agreement', async () => {
    prismaMock.documentTemplate.findFirst
      .mockResolvedValueOnce({
        ...existingAgreement,
        content: '{{@agreement.serviceSections}}',
      })
      .mockResolvedValueOnce(null);

    await expect(
      duplicateDocumentTemplate(
        { id: existingAgreement.id, name: 'Agreement copy' },
        actor,
      ),
    ).rejects.toThrow('Service Agreement template must contain exactly one');

    expect(prismaMock.documentTemplate.create).not.toHaveBeenCalled();
  });
});
