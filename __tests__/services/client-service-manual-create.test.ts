import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  company: { findFirst: vi.fn() },
  serviceVariant: { findFirst: vi.fn() },
  clientService: { create: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  clientServiceFeeLine: { createMany: vi.fn() },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import {
  ClientServiceWriteConflictError,
  createManualClientService,
  DuplicateClientServiceError,
} from '@/services/client-service';

const params = { tenantId: 'tenant-1', userId: 'user-1' };
const input = {
  serviceVariantId: 'variant-1',
  status: 'ACTIVE' as const,
  serviceCadence: 'ANNUALLY' as const,
  customCadenceLabel: null,
  startDate: '2026-08-01',
  endDate: null,
  fieldValues: { filingMonth: 'July' },
  feeLines: [{
    description: 'Annual service fee',
    amount: '1200.00',
    currency: 'SGD',
    billingFrequency: 'ANNUALLY' as const,
    customFrequencyLabel: null,
    billingStartDate: null,
  }],
  confirmDuplicate: false,
};
const variant = { id: 'variant-1', name: 'Corporate Secretarial (Latest)', family: { name: 'Corporate Services' } };
const createdRecord = {
  id: 'service-1',
  tenantId: params.tenantId,
  companyId: 'company-1',
  source: 'MANUAL',
  agreementId: null,
  agreementItemId: null,
  serviceVariantId: 'variant-1',
  familyName: 'Corporate Services',
  serviceName: 'Corporate Secretarial (Latest)',
  status: 'ACTIVE',
  serviceCadence: 'ANNUALLY',
  customCadenceLabel: null,
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: null,
  fieldValues: { filingMonth: 'July' },
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
  deletedReason: null,
  feeLines: [{
    id: 'fee-1',
    sourceAgreementFeeLineId: null,
    description: 'Annual service fee',
    amount: { toFixed: () => '1200.00' },
    currency: 'SGD',
    billingFrequency: 'ANNUALLY',
    customFrequencyLabel: null,
    billingStartDate: new Date('2026-08-01T00:00:00.000Z'),
    displayOrder: 0,
  }],
  agreement: null,
};

describe('manual client service creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.company.findFirst.mockResolvedValue({ id: 'company-1' });
    prismaMock.serviceVariant.findFirst.mockResolvedValue(variant);
    prismaMock.clientService.create.mockImplementation(async ({ data }) => ({ id: 'service-1', ...data, createdAt: new Date(), updatedAt: new Date() }));
    prismaMock.clientService.findFirst.mockResolvedValue(createdRecord);
    prismaMock.clientServiceFeeLine.createMany.mockResolvedValue({ count: 1 });
    prismaMock.clientService.count.mockResolvedValue(0);
    prismaMock.clientService.findMany.mockResolvedValue([]);
  });

  it('creates with server-owned names, manual lineage, array-order fees, and audit without field values', async () => {
    const result = await createManualClientService('company-1', input, params);

    expect(prismaMock.clientService.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        source: 'MANUAL',
        agreementId: null,
        agreementItemId: null,
        serviceVariantId: 'variant-1',
        familyName: 'Corporate Services',
        serviceName: 'Corporate Secretarial (Latest)',
      }),
    }));
    expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ sourceAgreementFeeLineId: null, displayOrder: 0 })],
    }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE',
      changeSource: 'MANUAL',
      summary: 'Added manual operational service with 1 fee line(s)',
    }), prismaMock);
    expect(JSON.stringify(auditMock.createAuditLog.mock.calls[0][0].changes)).not.toContain('fieldValues');
    expect(result).toMatchObject({ id: 'service-1', source: 'MANUAL', serviceName: 'Corporate Secretarial (Latest)' });
  });

  it('normalizes fee display order from request array position', async () => {
    const twoFees = [
      { ...input.feeLines[0], description: 'First fee' },
      { ...input.feeLines[0], description: 'Second fee' },
    ];
    await createManualClientService('company-1', { ...input, feeLines: twoFees }, params);

    expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({ description: 'First fee', displayOrder: 0 }),
        expect.objectContaining({ description: 'Second fee', displayOrder: 1 }),
      ],
    }));
  });

  it('rejects inactive or unavailable catalog variants without writing', async () => {
    prismaMock.serviceVariant.findFirst.mockResolvedValue(null);

    await expect(createManualClientService('company-1', input, params)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.clientService.create).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects unconfirmed duplicates with a capped stable summary and no writes', async () => {
    prismaMock.clientService.count.mockResolvedValue(3);
    prismaMock.clientService.findMany.mockResolvedValue([
      { id: 'service-3', serviceName: 'Third', startDate: new Date('2026-08-01T00:00:00.000Z'), status: 'ENDED', source: 'MANUAL' },
      { id: 'service-2', serviceName: 'Second', startDate: new Date('2026-08-01T00:00:00.000Z'), status: 'PAUSED', source: 'AGREEMENT' },
      { id: 'service-1', serviceName: 'First', startDate: new Date('2026-08-01T00:00:00.000Z'), status: 'ACTIVE', source: 'AGREEMENT' },
    ]);

    const failure = createManualClientService('company-1', input, params);
    await expect(failure).rejects.toBeInstanceOf(DuplicateClientServiceError);
    await expect(failure).rejects.toMatchObject({ statusCode: 409, code: 'DUPLICATE_CLIENT_SERVICE', duplicates: { total: 3 } });
    expect(prismaMock.clientService.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        serviceVariantId: 'variant-1',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        deletedAt: null,
      }),
    }));
    expect(prismaMock.clientService.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    }));
    expect(prismaMock.clientService.create).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.createMany).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('ignores archived rows in the duplicate predicate', async () => {
    prismaMock.clientService.count.mockResolvedValue(0);
    await expect(createManualClientService('company-1', input, params)).resolves.toMatchObject({ id: 'service-1' });
    expect(prismaMock.clientService.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deletedAt: null }),
    }));
  });

  it('creates after an explicit duplicate override and audits the confirmation', async () => {
    await createManualClientService('company-1', { ...input, confirmDuplicate: true }, params);

    expect(prismaMock.clientService.count).not.toHaveBeenCalled();
    expect(prismaMock.clientService.findMany).not.toHaveBeenCalled();
    expect(prismaMock.clientService.create).toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ duplicateConfirmed: { old: false, new: true } }),
    }), prismaMock);
  });

  it('rolls back when fee writes fail and writes no audit', async () => {
    prismaMock.clientServiceFeeLine.createMany.mockRejectedValueOnce(new Error('fee write failed'));

    await expect(createManualClientService('company-1', input, params)).rejects.toThrow('fee write failed');
    expect(prismaMock.clientService.create).toHaveBeenCalledTimes(1);
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('rolls back when the audit write fails', async () => {
    auditMock.createAuditLog.mockRejectedValueOnce(new Error('audit write failed'));

    await expect(createManualClientService('company-1', input, params)).rejects.toThrow('audit write failed');
  });

  it('maps exhausted serialization retries to a retriable conflict', async () => {
    prismaMock.$transaction.mockRejectedValue({ code: 'P2034' });

    await expect(createManualClientService('company-1', input, params)).rejects.toBeInstanceOf(ClientServiceWriteConflictError);
    await expect(createManualClientService('company-1', input, params)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CLIENT_SERVICE_WRITE_CONFLICT',
      details: { retriable: true },
    });
  });
});
