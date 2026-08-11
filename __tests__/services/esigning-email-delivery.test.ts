import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEsigningEmailDeliveryHealth,
  recordEsigningEnvelopeEmailDeliveryResults,
  withEsigningDeliveryTarget,
  type EsigningLedgerDeliverySnapshot,
} from '@/services/esigning-email-delivery.service';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    esigningEmailDelivery: { upsert: mocks.upsert },
    esigningEmailDeliveryAttempt: { create: mocks.create },
  },
}));

function delivery(
  overrides: Partial<EsigningLedgerDeliverySnapshot> = {}
): EsigningLedgerDeliverySnapshot {
  return {
    kind: 'REQUEST',
    targetKey: 'recipient:signer-1',
    toEmail: 'signer-1@example.com',
    subject: 'Signature requested',
    status: 'SUCCEEDED',
    lastError: null,
    lastAttemptedAt: '2026-06-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('e-signing email delivery health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        esigningEmailDelivery: { upsert: mocks.upsert },
        esigningEmailDeliveryAttempt: { create: mocks.create },
      });
    });
    mocks.upsert.mockResolvedValue({ id: 'delivery-1' });
    mocks.create.mockResolvedValue({ id: 'attempt-1' });
  });

  it('does not clear a request failure when a reminder succeeds', () => {
    const health = getEsigningEmailDeliveryHealth([
      delivery({ kind: 'REQUEST', targetKey: 'recipient:signer-1', status: 'FAILED_RETRYABLE', lastError: 'SMTP rejected recipient' }),
      delivery({ kind: 'REMINDER', targetKey: 'recipient:signer-1:reminder:2026-06-30T10:05:00.000Z', status: 'SUCCEEDED' }),
    ], null);

    expect(health.status).toBe('failed');
    expect(health.failures).toEqual([
      expect.objectContaining({ kind: 'request', targetKey: 'recipient:signer-1' }),
    ]);
  });

  it('clears only the matching request failure after a successful retry', () => {
    const health = getEsigningEmailDeliveryHealth([
      delivery({ kind: 'REQUEST', targetKey: 'recipient:signer-1', status: 'SUCCEEDED' }),
      delivery({ kind: 'REQUEST', targetKey: 'recipient:signer-2', toEmail: 'signer-2@example.com', status: 'FAILED_RETRYABLE', lastError: 'SMTP rejected recipient' }),
    ], null);

    expect(health.failures).toEqual([
      expect.objectContaining({ kind: 'request', targetKey: 'recipient:signer-2' }),
    ]);
  });

  it('falls back to legacy metadata failures when the ledger has none', () => {
    const health = getEsigningEmailDeliveryHealth([], {
      emailDelivery: {
        status: 'failed',
        lastFailureAt: '2026-06-29T09:00:00.000Z',
        failures: [
          {
            kind: 'request',
            to: 'signer@example.com',
            subject: 'Signature requested',
            error: 'SMTP rejected recipient',
            attemptedAt: '2026-06-29T09:00:00.000Z',
          },
        ],
      },
    });

    expect(health.status).toBe('failed');
    expect(health.failures[0]).toEqual(expect.objectContaining({
      kind: 'request',
      targetKey: 'legacy:request:signer@example.com',
    }));
  });

  it('records a successful attempt with the provider message id', async () => {
    await recordEsigningEnvelopeEmailDeliveryResults('envelope-1', [
      withEsigningDeliveryTarget({
        ok: true,
        kind: 'request',
        to: 'signer-1@example.com',
        subject: 'Signature requested',
        attemptedAt: '2026-06-30T10:00:00.000Z',
        providerMessageId: 'graph-123',
      }, {
        tenantId: 'tenant-1',
        targetKey: 'recipient:signer-1',
        audience: 'RECIPIENT',
        recipientId: 'signer-1',
      }),
    ]);

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        envelopeId_kind_targetKey: {
          envelopeId: 'envelope-1',
          kind: 'REQUEST',
          targetKey: 'recipient:signer-1',
        },
      },
      create: expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'SUCCEEDED',
        sentAt: new Date('2026-06-30T10:00:00.000Z'),
      }),
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        deliveryId: 'delivery-1',
        succeeded: true,
        providerMessageId: 'graph-123',
      }),
    }));
  });

  it('records a failed attempt with the retained error', async () => {
    await recordEsigningEnvelopeEmailDeliveryResults('envelope-1', [
      withEsigningDeliveryTarget({
        ok: false,
        kind: 'reminder',
        to: 'signer-1@example.com',
        subject: 'Reminder',
        attemptedAt: '2026-06-30T10:05:00.000Z',
        error: 'SMTP rejected recipient',
      }, {
        tenantId: 'tenant-1',
        targetKey: 'recipient:signer-1:reminder:2026-06-30T10:05:00.000Z',
        audience: 'RECIPIENT',
        recipientId: 'signer-1',
      }),
    ]);

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        envelopeId_kind_targetKey: {
          envelopeId: 'envelope-1',
          kind: 'REMINDER',
          targetKey: 'recipient:signer-1:reminder:2026-06-30T10:05:00.000Z',
        },
      },
      create: expect.objectContaining({
        status: 'FAILED_RETRYABLE',
        lastError: 'SMTP rejected recipient',
        sentAt: null,
      }),
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        succeeded: false,
        error: 'SMTP rejected recipient',
      }),
    }));
  });
});
