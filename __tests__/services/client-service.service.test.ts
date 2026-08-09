import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  clientService: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  clientServiceFeeLine: { deleteMany: vi.fn(), createMany: vi.fn() },
  serviceAgreement: { findMany: vi.fn() },
  serviceAgreementFeeLine: { update: vi.fn() },
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn(), computeChanges: vi.fn(() => null) }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);

import { archiveClientService, getClientService, listCompanyServices, updateClientService } from '@/services/client-service';

const actor = { tenantId: 'tenant-1', userId: 'user-1' };
const record = {
  id: 'service-1', tenantId: actor.tenantId, companyId: 'company-1', agreementId: 'agreement-1',
  agreementItemId: 'item-1', source: 'AGREEMENT', serviceVariantId: 'variant-1', familyName: 'Corporate Services',
  serviceName: 'Corporate Secretarial Services', status: 'ACTIVE', serviceCadence: 'ANNUALLY',
  customCadenceLabel: null, startDate: new Date('2026-07-30'), endDate: null, fieldValues: {},
  createdAt: new Date('2026-07-30T00:00:00Z'), updatedAt: new Date('2026-07-30T00:00:00Z'),
  deletedAt: null, deletedReason: null,
  feeLines: [{ id: 'fee-1', sourceAgreementFeeLineId: 'agreement-fee-1', description: 'Annual fee', amount: { toString: () => '500.00', toFixed: () => '500.00' }, currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: null, billingStartDate: new Date('2026-07-30'), displayOrder: 0 }],
  agreement: { status: 'EFFECTIVE', activationStatus: 'COMPLETED', generatedDocument: { id: 'document-1', title: 'Service Agreement' } },
};

describe('client service service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.serviceAgreement.findMany.mockResolvedValue([]);
    prismaMock.clientService.updateMany.mockResolvedValue({ count: 1 });
  });

  it('tenant-scopes company lists and returns fixed-point fees without legal wording', async () => {
    prismaMock.clientService.findMany.mockResolvedValue([record]);
    prismaMock.clientService.count.mockResolvedValue(1);
    const result = await listCompanyServices('company-1', { page: 1, limit: 20 }, actor);
    expect(prismaMock.clientService.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: actor.tenantId, companyId: 'company-1', deletedAt: null }) }));
    expect(result.services[0].feeLines[0].amount).toBe('500.00');
    expect(JSON.stringify(result.services[0])).not.toContain('partialContent');
  });

  it('updates operational fees without mutating agreement fees', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    prismaMock.clientService.findFirst
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, feeLines: [{ ...record.feeLines[0], description: 'Revised annual fee', amount: { toString: () => '650.00', toFixed: () => '650.00' } }] });
    await updateClientService(record.id, { updatedAt: record.updatedAt.toISOString(), feeLines: [{ id: 'fee-1', description: 'Revised annual fee', amount: '650.00', currency: 'SGD', billingFrequency: 'ANNUALLY', billingStartDate: '2026-07-30', displayOrder: 0 }] }, actor);
    expect(prismaMock.clientServiceFeeLine.deleteMany).toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ sourceAgreementFeeLineId: 'agreement-fee-1' })] }));
    expect(prismaMock.serviceAgreementFeeLine.update).not.toHaveBeenCalled();
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'ClientService', action: 'UPDATE' }), prismaMock);
  });

  it('rejects a stale competing editor before replacing fees', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    await expect(updateClientService(record.id, {
      updatedAt: '2026-07-29T00:00:00.000Z',
      status: 'PAUSED',
    }, actor)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.clientService.update).not.toHaveBeenCalled();
    expect(prismaMock.clientServiceFeeLine.deleteMany).not.toHaveBeenCalled();
  });

  it('archives within the tenant and records the reason', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    prismaMock.clientService.update.mockResolvedValue(record);
    await expect(archiveClientService(record.id, 'Client requested termination', actor)).resolves.toEqual({ id: record.id, archived: true });
    expect(prismaMock.clientService.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deletedReason: 'Client requested termination' }) }));
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE' }), prismaMock);
  });

  it('rejects a service from another tenant', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(null);
    await expect(getClientService(record.id, actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('maps agreement services with the generated document link', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue(record);
    const result = await getClientService(record.id, actor);
    expect(result.agreement?.href).toBe('/generated-documents/document-1');
  });

  it('maps manual services with null agreement lineage and no summary', async () => {
    prismaMock.clientService.findFirst.mockResolvedValue({
      ...record,
      id: 'service-manual',
      source: 'MANUAL',
      agreementId: null,
      agreementItemId: null,
      agreement: null,
    });
    const result = await getClientService('service-manual', actor);
    expect(result).toMatchObject({ source: 'MANUAL', agreementId: null, agreementItemId: null, agreement: null });
  });
});
