import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email', () => ({
  getAppBaseUrl: () => 'https://app.example.com',
  sendEmail,
}));
vi.mock('@/lib/esigning-session', () => ({
  buildEsigningVerificationUrl: (certificateId: string) => `https://app.example.com/verify/${certificateId}`,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { sendEsigningRequestEmail } from '@/services/esigning-notification.service';

describe('e-signing email subject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmail.mockResolvedValue({ success: true, messageId: 'message-1' });
  });

  it('uses the independent email subject for request and reminder messages', async () => {
    const input = {
      to: 'client@example.com',
      recipientName: 'Client',
      senderName: 'Sender',
      envelopeTitle: 'Internal envelope name',
      emailSubject: 'Please sign the client agreement',
      message: 'Please review this document.',
      signingUrl: 'https://app.example.com/sign/token-1',
      accessMode: 'EMAIL_LINK' as const,
      kind: 'request' as const,
    };

    await sendEsigningRequestEmail(input);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: '[Oakcloud] "Please sign the client agreement" — signature requested by Sender',
    }));

    await sendEsigningRequestEmail({ ...input, kind: 'reminder' });

    expect(sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({
      subject: '[Oakcloud] Reminder: "Please sign the client agreement" awaits your signature',
    }));
  });
});
