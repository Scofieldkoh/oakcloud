import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma';

const prismaMock = vi.hoisted(() => ({
  serviceAgreement: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  clientService: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
  clientServiceFeeLine: { createMany: vi.fn() },
  generatedDocument: { updateMany: vi.fn() },
  esigningEnvelopeDocument: { findMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/audit', () => auditMock);
vi.mock('@/lib/logger', () => ({ createLogger: () => loggerMock }));

import { processServiceAgreementActivation, queueServiceAgreementActivationsForEnvelope, requestManualServiceAgreementActivation, retryServiceAgreementActivation } from '@/services/service-agreement';

const agreement = {
  id: 'agreement-1', tenantId: 'tenant-1', generatedDocumentId: 'document-1', status: 'DRAFT',
  activationStatus: 'PROCESSING', activationAttemptCount: 0, activationSource: 'ESIGNING', effectiveDate: null,
  activationClaimToken: 'claim-1', activationRequestedById: null, activationReason: null,
  generatedDocument: { id: 'document-1', status: 'DRAFT', metadata: null },
  entities: [
    { id: 'entity-1', companyId: 'company-1' },
    { id: 'entity-2', companyId: 'company-2' },
  ],
  items: [{
    id: 'item-1', serviceVariantId: 'variant-1', familyNameSnapshot: 'Corporate Services',
    variantNameSnapshot: 'Corporate Secretarial Services', serviceCadence: 'ANNUALLY', customCadenceLabel: null,
    startDate: new Date('2026-07-30'), endDate: null, fieldValues: {},
    entityLinks: [{ agreementEntityId: 'entity-1', agreementEntity: { companyId: 'company-1' } }, { agreementEntityId: 'entity-2', agreementEntity: { companyId: 'company-2' } }],
    feeLines: [{ id: 'agreement-fee-1', agreementEntityId: 'entity-1', description: 'Annual fee', amount: '500.00', currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: null, billingStartDate: null, displayOrder: 0 }],
  }],
};

describe('service agreement activation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.clientService.findUnique.mockResolvedValue(null);
    prismaMock.clientService.create.mockImplementation(async ({ data }) => ({ id: `service-${data.companyId}`, ...data, createdAt: new Date(), updatedAt: new Date() }));
    prismaMock.clientService.count.mockResolvedValue(2);
    prismaMock.serviceAgreement.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.generatedDocument.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.serviceAgreement.update.mockResolvedValue({ ...agreement, activationStatus: 'COMPLETED', activationAttemptCount: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates one client service per item/entity and copies only matching fees', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue(agreement);
    const result = await processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' });
    expect(result).toEqual({ status: 'completed', clientServiceCount: 2 });
    expect(prismaMock.clientService.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ sourceAgreementFeeLineId: 'agreement-fee-1' })] }));
  });

  it('returns without modifying operational rows after completion', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({ ...agreement, activationStatus: 'COMPLETED' });
    await expect(processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' })).resolves.toEqual({ status: 'already-completed', clientServiceCount: 2 });
    expect(prismaMock.clientService.create).not.toHaveBeenCalled();
  });

  it('queues only generated documents attached to an envelope', async () => {
    prismaMock.esigningEnvelopeDocument.findMany.mockResolvedValue([{ generatedDocumentId: 'document-1' }]);
    prismaMock.serviceAgreement.findMany.mockResolvedValue([{ id: agreement.id, tenantId: agreement.tenantId, effectiveDate: null }]);
    prismaMock.serviceAgreement.updateMany.mockResolvedValue({ count: 1 });
    await expect(queueServiceAgreementActivationsForEnvelope(prismaMock as unknown as Prisma.TransactionClient, 'envelope-1', new Date('2026-07-30'))).resolves.toBe(1);
    expect(prismaMock.serviceAgreement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ activationStatus: 'NOT_READY', status: 'DRAFT' }) }));
  });

  it('derives an automatic effective date from envelope completion in Singapore and preserves an existing date', async () => {
    prismaMock.esigningEnvelopeDocument.findMany.mockResolvedValue([{ generatedDocumentId: 'document-1' }]);
    prismaMock.serviceAgreement.findMany.mockResolvedValueOnce([{ id: agreement.id, tenantId: agreement.tenantId, effectiveDate: null }]);
    await queueServiceAgreementActivationsForEnvelope(prismaMock as unknown as Prisma.TransactionClient, 'envelope-1', new Date('2026-07-30T16:30:00.000Z'));
    expect(prismaMock.serviceAgreement.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ effectiveDate: new Date('2026-07-31T00:00:00.000Z') }) }));
    const existing = new Date('2026-08-05T00:00:00.000Z');
    prismaMock.serviceAgreement.findMany.mockResolvedValueOnce([{ id: agreement.id, tenantId: agreement.tenantId, effectiveDate: existing }]);
    await queueServiceAgreementActivationsForEnvelope(prismaMock as unknown as Prisma.TransactionClient, 'envelope-1', new Date('2026-07-30T16:30:00.000Z'));
    expect(prismaMock.serviceAgreement.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ effectiveDate: existing }) }));
  });

  it('allows a permanent failure to be explicitly retried', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({ ...agreement, activationStatus: 'FAILED_PERMANENT' });
    prismaMock.serviceAgreement.update.mockResolvedValue({ ...agreement, activationStatus: 'PENDING', activationAttemptCount: 0, activationLastError: null });
    await expect(retryServiceAgreementActivation(agreement.id, { tenantId: 'tenant-1', userId: 'user-1' })).resolves.toMatchObject({ activationStatus: 'PENDING' });
  });

  it.each(['missingPlaceholders', 'missingPartials', 'circularPartials', 'syntaxErrors', 'unknownPlaceholders'])('blocks activation for %s diagnostics before creating services', async (diagnostic) => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({
      ...agreement,
      activationStatus: 'PROCESSING',
      generatedDocument: { ...agreement.generatedDocument, metadata: { [diagnostic]: ['problem'] } },
    });
    await expect(processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' })).resolves.toMatchObject({ status: 'permanent-failure' });
    expect(prismaMock.clientService.create).not.toHaveBeenCalled();
    expect(prismaMock.generatedDocument.updateMany).not.toHaveBeenCalled();
  });

  it('writes creation and activation audits through the active transaction with the manual actor', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({ ...agreement, activationStatus: 'PROCESSING', activationSource: 'MANUAL', activationRequestedById: 'user-1' });
    await processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' });
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', userId: 'user-1' }), prismaMock);
    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'ServiceAgreement', userId: 'user-1' }), prismaMock);
  });

  it('queues a manual activation only from draft and not-ready in one transaction', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue(agreement);
    prismaMock.serviceAgreement.updateMany.mockResolvedValue({ count: 0 });
    await expect(requestManualServiceAgreementActivation(agreement.id, {
      signedAt: '2026-07-30T00:00:00.000Z', effectiveDate: '2026-07-30', reason: 'Externally signed by client',
    }, { tenantId: agreement.tenantId, userId: 'user-1' })).rejects.toMatchObject({ statusCode: 409 });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('audits manual signing dates and activation state changes', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({
      ...agreement,
      signedAt: null,
      effectiveDate: null,
      activationStatus: 'NOT_READY',
      activationSource: null,
    });

    await requestManualServiceAgreementActivation(agreement.id, {
      signedAt: '2026-07-30T09:15:00.000Z',
      effectiveDate: '2026-07-31',
      reason: 'Externally signed by the client',
    }, { tenantId: agreement.tenantId, userId: 'user-1' });

    expect(auditMock.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      reason: 'Externally signed by the client',
      changes: {
        signedAt: { old: null, new: '2026-07-30T09:15:00.000Z' },
        effectiveDate: { old: null, new: '2026-07-31' },
        activationStatus: { old: 'NOT_READY', new: 'PENDING' },
        activationSource: { old: null, new: 'MANUAL' },
      },
    }), prismaMock);
  });

  it('exits a stale worker without writing success or failure state', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({ ...agreement, activationClaimToken: 'newer-claim' });
    await expect(processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'expired-claim' })).resolves.toEqual({ status: 'stale-worker' });
    expect(prismaMock.clientService.create).not.toHaveBeenCalled();
  });

  it('does not requeue an activation that completed during a retry request', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue({ ...agreement, activationStatus: 'FAILED_RETRYABLE' });
    prismaMock.serviceAgreement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(retryServiceAgreementActivation(agreement.id, { tenantId: agreement.tenantId, userId: 'user-1' })).rejects.toMatchObject({ statusCode: 409 });
    expect(auditMock.createAuditLog).not.toHaveBeenCalled();
  });

  it('persists only a stable public error with a correlation reference', async () => {
    prismaMock.serviceAgreement.findFirst.mockResolvedValue(agreement);
    prismaMock.clientService.create.mockRejectedValueOnce(new Error('relation secret_internal_table does not exist for tenant-1'));
    const result = await processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' });
    expect(result).toMatchObject({ status: 'retryable-failure' });
    expect(JSON.stringify(result)).not.toContain('secret_internal_table');
    expect(prismaMock.serviceAgreement.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ activationLastError: expect.stringMatching(/^Service activation is temporarily unavailable.*Reference:/) }) }));
  });

  it('backs off a first retryable failure by one minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    prismaMock.serviceAgreement.findFirst
      .mockResolvedValueOnce(agreement)
      .mockResolvedValueOnce({ activationAttemptCount: 0 });
    prismaMock.clientService.create.mockRejectedValueOnce(new Error('temporary dependency failure'));

    await expect(processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' }))
      .resolves.toMatchObject({ status: 'retryable-failure' });
    expect(prismaMock.serviceAgreement.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activationStatus: 'FAILED_RETRYABLE',
        activationAttemptCount: 1,
        activationAvailableAt: new Date('2026-08-01T00:01:00.000Z'),
      }),
    }));
  });

  it('stops retrying after the fifth failed attempt', async () => {
    prismaMock.serviceAgreement.findFirst
      .mockResolvedValueOnce(agreement)
      .mockResolvedValueOnce({ activationAttemptCount: 4 });
    prismaMock.clientService.create.mockRejectedValueOnce(new Error('persistent dependency failure'));

    await expect(processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' }))
      .resolves.toMatchObject({ status: 'permanent-failure' });
    expect(prismaMock.serviceAgreement.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activationStatus: 'FAILED_PERMANENT',
        activationAttemptCount: 5,
        activationAvailableAt: null,
      }),
    }));
  });

  it('does not persist a failure after the worker loses its claim', async () => {
    prismaMock.serviceAgreement.findFirst
      .mockResolvedValueOnce(agreement)
      .mockResolvedValueOnce(null);
    prismaMock.clientService.create.mockRejectedValueOnce(new Error('temporary dependency failure'));

    await expect(processServiceAgreementActivation({ agreementId: agreement.id, tenantId: agreement.tenantId, claimToken: 'claim-1' }))
      .resolves.toEqual({ status: 'stale-worker' });
    expect(prismaMock.serviceAgreement.updateMany).not.toHaveBeenCalled();
  });
});
