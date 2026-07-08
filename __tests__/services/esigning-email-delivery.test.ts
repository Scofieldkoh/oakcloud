import { describe, expect, it } from 'vitest';
import {
  applyEsigningEmailDeliveryResults,
  getEsigningEmailDeliveryHealth,
} from '@/services/esigning-email-delivery.service';

describe('e-signing email delivery health', () => {
  it('marks the envelope as failed when any e-signing email fails', () => {
    const metadata = applyEsigningEmailDeliveryResults(null, [
      {
        ok: false,
        kind: 'request',
        to: 'signer@example.com',
        subject: '[Oakcloud] Signature requested',
        error: 'SMTP rejected recipient',
        attemptedAt: '2026-06-30T10:00:00.000Z',
      },
    ]);

    expect(getEsigningEmailDeliveryHealth(metadata)).toEqual({
      status: 'failed',
      lastFailureAt: '2026-06-30T10:00:00.000Z',
      failures: [
        {
          kind: 'request',
          to: 'signer@example.com',
          subject: '[Oakcloud] Signature requested',
          error: 'SMTP rejected recipient',
          attemptedAt: '2026-06-30T10:00:00.000Z',
        },
      ],
    });
  });

  it('clears a previous failure after a successful delivery batch', () => {
    const failedMetadata = applyEsigningEmailDeliveryResults(null, [
      {
        ok: false,
        kind: 'request',
        to: 'signer@example.com',
        subject: '[Oakcloud] Signature requested',
        error: 'SMTP rejected recipient',
        attemptedAt: '2026-06-30T10:00:00.000Z',
      },
    ]);

    const clearedMetadata = applyEsigningEmailDeliveryResults(failedMetadata, [
      {
        ok: true,
        kind: 'request',
        to: 'signer@example.com',
        subject: '[Oakcloud] Signature requested',
        attemptedAt: '2026-06-30T10:05:00.000Z',
      },
    ]);

    expect(getEsigningEmailDeliveryHealth(clearedMetadata)).toEqual({
      status: 'ok',
      lastFailureAt: null,
      failures: [],
    });
  });
});
