import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEsigningEnvelopeCompletion } from '@/services/esigning-signing.service';

const serviceAgreementMock = vi.hoisted(() => ({
  processQueuedServiceAgreementActivations: vi.fn(),
  queueServiceAgreementActivationsForEnvelope: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/services/service-agreement', () => serviceAgreementMock);

function makeEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: 'envelope-1',
    tenantId: 'tenant-1',
    title: 'NDA',
    companyId: 'company-1',
    createdById: 'user-1',
    recipients: [
      { id: 'recipient-1', email: 'signer@example.com', accessMode: 'EMAIL_LINK' },
      { id: 'recipient-2', email: 'cc@example.com', accessMode: 'EMAIL_WITH_CODE' },
      { id: 'recipient-3', email: 'manual@example.com', accessMode: 'MANUAL_LINK' },
    ],
    createdBy: { email: 'sender@example.com' },
    ...overrides,
  };
}

function makeTx(envelope = makeEnvelope()) {
  return {
    esigningEnvelope: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(envelope),
      update: vi.fn().mockResolvedValue({}),
    },
    esigningEnvelopeEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    esigningEmailDelivery: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    esigningEnvelopeDocument: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    serviceAgreement: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('e-signing completion queueing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues one completion delivery for every recipient plus the sender', async () => {
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const tx = makeTx();

    await expect(finalizeEsigningEnvelopeCompletion(tx as never, {
      tenantId: 'tenant-1',
      envelopeId: 'envelope-1',
      currentStatus: 'IN_PROGRESS',
      remainingSignerCount: 0,
      completedAt,
    })).resolves.toBe(true);

    expect(tx.esigningEmailDelivery.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: 'COMPLETION',
          targetKey: 'recipient:recipient-1',
          status: 'PENDING',
          availableAt: completedAt,
        }),
        expect.objectContaining({
          kind: 'COMPLETION',
          targetKey: 'recipient:recipient-2',
          status: 'PENDING',
        }),
        expect.objectContaining({
          kind: 'COMPLETION',
          targetKey: 'sender:user-1',
          status: 'PENDING',
          toEmail: 'sender@example.com',
        }),
      ]),
      skipDuplicates: true,
    });

    const queuedData = tx.esigningEmailDelivery.createMany.mock.calls[0][0].data as unknown[];
    expect(queuedData).toHaveLength(3);
    expect(queuedData).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetKey: 'recipient:recipient-3' }),
      ])
    );

    expect(tx.esigningEnvelope.update).toHaveBeenCalledWith({
      where: { id: 'envelope-1' },
      data: expect.objectContaining({
        autoFilingStatus: 'PENDING',
        autoFilingAvailableAt: completedAt,
      }),
    });
  });

  it('marks auto-filing as NOT_REQUIRED for envelopes without a company', async () => {
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const tx = makeTx(makeEnvelope({ companyId: null }));

    await expect(finalizeEsigningEnvelopeCompletion(tx as never, {
      tenantId: 'tenant-1',
      envelopeId: 'envelope-1',
      currentStatus: 'IN_PROGRESS',
      remainingSignerCount: 0,
      completedAt,
    })).resolves.toBe(true);

    expect(tx.esigningEnvelope.update).toHaveBeenCalledWith({
      where: { id: 'envelope-1' },
      data: { autoFilingStatus: 'NOT_REQUIRED' },
    });
  });

  it('does not create duplicate work when a repeated completion call loses the race', async () => {
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const tx = makeTx();
    tx.esigningEnvelope.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await finalizeEsigningEnvelopeCompletion(tx as never, {
      tenantId: 'tenant-1',
      envelopeId: 'envelope-1',
      currentStatus: 'IN_PROGRESS',
      remainingSignerCount: 0,
      completedAt,
    });
    await finalizeEsigningEnvelopeCompletion(tx as never, {
      tenantId: 'tenant-1',
      envelopeId: 'envelope-1',
      currentStatus: 'IN_PROGRESS',
      remainingSignerCount: 0,
      completedAt,
    });

    expect(tx.esigningEmailDelivery.createMany).toHaveBeenCalledTimes(1);
  });

  it('propagates a delivery-queue failure so the completion transaction rolls back', async () => {
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const tx = makeTx();
    tx.esigningEmailDelivery.createMany.mockRejectedValue(new Error('database unavailable'));

    await expect(finalizeEsigningEnvelopeCompletion(tx as never, {
      tenantId: 'tenant-1',
      envelopeId: 'envelope-1',
      currentStatus: 'IN_PROGRESS',
      remainingSignerCount: 0,
      completedAt,
    })).rejects.toThrow('database unavailable');
  });
});
