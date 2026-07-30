import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  serviceFamily: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  serviceVariant: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  serviceVariantFeeTemplate: {
    deleteMany: vi.fn(),
  },
  templatePartial: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import {
  createServiceFamily,
  createServiceVariant,
  getServiceVariant,
  getSelectableServiceVariants,
  listServiceCatalog,
  updateServiceVariant,
} from '@/services/service-catalog';

const actor = { tenantId: 'tenant-1', userId: 'user-1' };

const existingVariant = {
  id: 'variant-1',
  tenantId: actor.tenantId,
  familyId: 'family-1',
  sowPartialId: 'partial-1',
  code: 'ACCOUNTING',
  name: 'Monthly Accounting',
  description: null,
  serviceCadence: 'MONTHLY',
  customCadenceLabel: null,
  displayOrder: 0,
  version: 1,
  isActive: true,
  deletedAt: null,
  sowPartial: {
    id: 'partial-1',
    name: 'accounting-sow',
    displayName: 'Accounting SOW',
    version: 1,
    placeholders: [],
  },
  defaultFeeTemplates: [
    {
      id: 'fee-1',
      description: 'Accounting',
      defaultAmount: { toString: () => '200.00' },
      currency: 'SGD',
      billingFrequency: 'MONTHLY',
      customFrequencyLabel: null,
      displayOrder: 0,
    },
  ],
};

describe('service catalog service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
  });

  it('scopes variant lookups to the tenant and excludes archived rows', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue(existingVariant);

    await getServiceVariant(existingVariant.id, actor);

    expect(prismaMock.serviceVariant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: existingVariant.id,
          tenantId: actor.tenantId,
          deletedAt: null,
        }),
      }),
    );
  });

  it('rejects duplicate normalized family codes within the tenant', async () => {
    prismaMock.serviceFamily.findFirst.mockResolvedValue({ id: 'family-existing' });

    await expect(
      createServiceFamily(
        {
          code: 'CORP-SEC',
          name: 'Corporate Secretarial',
          description: null,
          displayOrder: 0,
          isActive: true,
        },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(prismaMock.serviceFamily.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: actor.tenantId,
        code: 'CORP-SEC',
        deletedAt: null,
      },
    });
  });

  it('increments a variant once when material fields or fee templates change', async () => {
    const updated = {
      ...existingVariant,
      name: 'Quarterly Accounting',
      serviceCadence: 'QUARTERLY',
      version: 2,
      defaultFeeTemplates: [
        {
          ...existingVariant.defaultFeeTemplates[0],
          defaultAmount: { toString: () => '300.00' },
          billingFrequency: 'QUARTERLY',
        },
      ],
    };
    prismaMock.serviceVariant.findFirst.mockResolvedValue(existingVariant);
    prismaMock.serviceVariant.update.mockResolvedValue(updated);

    await updateServiceVariant(
      existingVariant.id,
      {
        name: 'Quarterly Accounting',
        serviceCadence: 'QUARTERLY',
        customCadenceLabel: null,
        feeTemplates: [
          {
            description: 'Accounting',
            defaultAmount: '300.00',
            currency: 'SGD',
            billingFrequency: 'QUARTERLY',
            customFrequencyLabel: null,
            displayOrder: 0,
          },
        ],
      },
      actor,
    );

    expect(prismaMock.serviceVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
    expect(prismaMock.serviceVariant.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.serviceVariantFeeTemplate.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('tenant-scopes every nested catalog relation and variant match', async () => {
    prismaMock.serviceFamily.findMany.mockResolvedValue([]);
    prismaMock.serviceFamily.count.mockResolvedValue(0);

    await listServiceCatalog(
      {
        query: 'quarterly',
        isActive: false,
        page: 1,
        limit: 20,
        sortBy: 'displayOrder',
        sortOrder: 'asc',
      },
      actor,
    );

    const listArgs = prismaMock.serviceFamily.findMany.mock.calls[0][0];
    expect(listArgs.where).toMatchObject({
      tenantId: actor.tenantId,
      deletedAt: null,
    });
    expect(listArgs.where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            variants: {
              some: expect.objectContaining({
                tenantId: actor.tenantId,
                deletedAt: null,
              }),
            },
          }),
        ]),
      }),
    ]));
    expect(listArgs.include.variants.where).toMatchObject({
      tenantId: actor.tenantId,
      deletedAt: null,
      sowPartial: { tenantId: actor.tenantId, deletedAt: null },
    });
    expect(listArgs.include.variants.include.defaultFeeTemplates.where).toEqual({
      tenantId: actor.tenantId,
    });
  });

  it('applies the same tenant boundary to setup and selectable variant reads', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue(existingVariant);
    prismaMock.serviceVariant.findMany.mockResolvedValue([]);

    await getServiceVariant(existingVariant.id, actor);
    await getSelectableServiceVariants(actor.tenantId);

    expect(prismaMock.serviceVariant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: actor.tenantId,
          family: { tenantId: actor.tenantId, deletedAt: null },
          sowPartial: { tenantId: actor.tenantId, deletedAt: null },
        }),
        include: expect.objectContaining({
          defaultFeeTemplates: expect.objectContaining({
            where: { tenantId: actor.tenantId },
          }),
        }),
      }),
    );
    expect(prismaMock.serviceVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          defaultFeeTemplates: expect.objectContaining({
            where: { tenantId: actor.tenantId },
          }),
        }),
      }),
    );
  });

  it('creates a family and its audit in the same transaction', async () => {
    prismaMock.serviceFamily.findFirst.mockResolvedValue(null);
    prismaMock.serviceFamily.create.mockResolvedValue({
      id: 'family-2',
      tenantId: actor.tenantId,
      code: 'TAX',
      name: 'Tax',
      description: null,
      displayOrder: 0,
      isActive: true,
      deletedAt: null,
      variants: [],
    });

    await createServiceFamily(
      {
        code: 'TAX',
        name: 'Tax',
        description: null,
        displayOrder: 0,
        isActive: true,
      },
      actor,
    );

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'family-2' }),
      prismaMock,
    );
  });

  it('audits the actual version returned by a material variant update', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue(existingVariant);
    prismaMock.serviceVariant.update.mockResolvedValue({
      ...existingVariant,
      name: 'Updated Accounting',
      version: 4,
    });

    await updateServiceVariant(
      existingVariant.id,
      { name: 'Updated Accounting', customCadenceLabel: null },
      actor,
    );

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { oldVersion: 1, newVersion: 4 },
      }),
      prismaMock,
    );
  });

  it('does not increment a variant for description-only maintenance', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue(existingVariant);
    prismaMock.serviceVariant.update.mockResolvedValue({
      ...existingVariant,
      description: 'Updated internal description',
    });

    await updateServiceVariant(
      existingVariant.id,
      {
        description: 'Updated internal description',
        customCadenceLabel: null,
      },
      actor,
    );

    expect(prismaMock.serviceVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ version: expect.anything() }),
      }),
    );
  });

  it('validates the SOW partial after the serializable create transaction starts', async () => {
    prismaMock.serviceFamily.findFirst.mockResolvedValue({ id: 'family-1' });
    prismaMock.templatePartial.findFirst.mockResolvedValue({ id: 'partial-1' });
    prismaMock.serviceVariant.findFirst.mockResolvedValue(null);
    prismaMock.serviceVariant.create.mockResolvedValue(existingVariant);

    await createServiceVariant(
      {
        familyId: 'family-1',
        sowPartialId: 'partial-1',
        code: 'ACCOUNTING',
        name: 'Monthly Accounting',
        description: null,
        serviceCadence: 'MONTHLY',
        customCadenceLabel: null,
        displayOrder: 0,
        isActive: true,
        feeTemplates: [],
      },
      actor,
    );

    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(prismaMock.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.templatePartial.findFirst.mock.invocationCallOrder[0],
    );
  });
});
