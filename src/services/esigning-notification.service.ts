import { sendEmail } from '@/lib/email';
import { buildEsigningVerificationUrl } from '@/lib/esigning-session';
import { createLogger } from '@/lib/logger';

const log = createLogger('esigning-notifications');

function formatDateTime(date: Date | null | undefined): string | null {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

async function safeSendEmail(input: Parameters<typeof sendEmail>[0]): Promise<void> {
  const result = await sendEmail(input);
  if (!result.success) {
    log.error('Failed to send e-signing email', { to: input.to, subject: input.subject, error: result.error });
  }
}

export async function sendEsigningRequestEmail(input: {
  to: string;
  recipientName: string;
  senderName: string;
  envelopeTitle: string;
  message?: string | null;
  signingUrl: string;
  accessMode: 'EMAIL_LINK' | 'EMAIL_WITH_CODE' | 'MANUAL_LINK';
  expiresAt?: Date | null;
}): Promise<void> {
  const expiresText = formatDateTime(input.expiresAt ?? null);

  await safeSendEmail({
    to: input.to,
    subject: `${input.senderName} has sent you "${input.envelopeTitle}" for signing`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.recipientName)},</p>
        <p><strong>${escapeHtml(input.senderName)}</strong> has requested your signature for <strong>${escapeHtml(input.envelopeTitle)}</strong>.</p>
        ${input.message ? `<p style="white-space: pre-wrap;">${escapeHtml(input.message)}</p>` : ''}
        ${expiresText ? `<p>This request expires on <strong>${escapeHtml(expiresText)}</strong>.</p>` : ''}
        <p><a href="${input.signingUrl}" style="display:inline-block;padding:10px 16px;background:#294d44;color:#ffffff;text-decoration:none;border-radius:8px;">Review and sign</a></p>
        <p style="font-size: 13px; color: #6b7280;">If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(input.signingUrl)}</p>
      </div>
    `,
  });
}

export async function sendEsigningCompletionEmail(input: {
  to: string;
  recipientName: string;
  envelopeTitle: string;
  certificateId: string;
}): Promise<void> {
  const verificationUrl = buildEsigningVerificationUrl(input.certificateId);

  await safeSendEmail({
    to: input.to,
    subject: `Completed: "${input.envelopeTitle}"`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.recipientName)},</p>
        <p>The signing workflow for <strong>${escapeHtml(input.envelopeTitle)}</strong> has been completed.</p>
        <p>Certificate ID: <strong>${escapeHtml(input.certificateId)}</strong></p>
        <p><a href="${verificationUrl}" style="display:inline-block;padding:10px 16px;background:#294d44;color:#ffffff;text-decoration:none;border-radius:8px;">View verification record</a></p>
      </div>
    `,
  });
}

export async function sendEsigningDeclinedEmailToSender(input: {
  to: string;
  senderName: string;
  envelopeTitle: string;
  recipientName: string;
  declineReason?: string | null;
}): Promise<void> {
  await safeSendEmail({
    to: input.to,
    subject: `Declined: "${input.envelopeTitle}"`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.senderName)},</p>
        <p><strong>${escapeHtml(input.recipientName)}</strong> declined to sign <strong>${escapeHtml(input.envelopeTitle)}</strong>.</p>
        ${input.declineReason ? `<p>Reason: ${escapeHtml(input.declineReason)}</p>` : ''}
      </div>
    `,
  });
}

export async function sendEsigningPdfFailureEmailToSender(input: {
  to: string;
  senderName: string;
  envelopeTitle: string;
  errorMessage: string;
}): Promise<void> {
  await safeSendEmail({
    to: input.to,
    subject: `Action required: signed documents could not be prepared`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.senderName)},</p>
        <p>All signatures for <strong>${escapeHtml(input.envelopeTitle)}</strong> were captured, but Oakcloud could not finish preparing the signed PDF package.</p>
        <p>Error: ${escapeHtml(input.errorMessage)}</p>
      </div>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
