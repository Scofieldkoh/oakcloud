import type { EmailAttachment } from '@/lib/email';
import { getAppBaseUrl, sendEmail } from '@/lib/email';
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
  kind?: 'request' | 'reminder';
}): Promise<void> {
  const expiresText = formatDateTime(input.expiresAt ?? null);
  const isReminder = input.kind === 'reminder';

  await safeSendEmail({
    to: input.to,
    subject: isReminder
      ? `Reminder: "${input.envelopeTitle}" still needs your signature`
      : `${input.senderName} has sent you "${input.envelopeTitle}" for signing`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.recipientName)},</p>
        <p>
          <strong>${escapeHtml(input.senderName)}</strong>
          ${
            isReminder
              ? ` is following up on your signature for <strong>${escapeHtml(input.envelopeTitle)}</strong>.`
              : ` has requested your signature for <strong>${escapeHtml(input.envelopeTitle)}</strong>.`
          }
        </p>
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
  documentLinks: Array<{
    label: string;
    signedUrl: string;
    certificateUrl?: string | null;
  }>;
  attachments?: EmailAttachment[];
  actorType?: 'recipient' | 'sender';
}): Promise<void> {
  const verificationUrl = buildEsigningVerificationUrl(input.certificateId);
  const hasAttachments = Boolean(input.attachments?.length);
  const actorLead =
    input.actorType === 'sender'
      ? `The signing workflow for <strong>${escapeHtml(input.envelopeTitle)}</strong> is complete.`
      : `The signing workflow for <strong>${escapeHtml(input.envelopeTitle)}</strong> has been completed.`;

  await safeSendEmail({
    to: input.to,
    subject: `Completed: "${input.envelopeTitle}"`,
    attachments: input.attachments,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.recipientName)},</p>
        <p>${actorLead}</p>
        <p>Certificate ID: <strong>${escapeHtml(input.certificateId)}</strong></p>
        <p>${hasAttachments ? 'The signed PDF package is attached to this email and available online below.' : 'Download the completed package below.'}</p>
        <ul style="padding-left: 20px; margin: 12px 0;">
          ${input.documentLinks
            .map(
              (documentLink) => `
                <li style="margin-bottom: 8px;">
                  <a href="${documentLink.signedUrl}">${escapeHtml(documentLink.label)}</a>
                  ${
                    documentLink.certificateUrl
                      ? ` &middot; <a href="${documentLink.certificateUrl}">Certificate</a>`
                      : ''
                  }
                </li>
              `
            )
            .join('')}
        </ul>
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

export async function sendEsigningReminderEmail(input: {
  to: string;
  recipientName: string;
  senderName: string;
  envelopeTitle: string;
  message?: string | null;
  signingUrl: string;
  accessMode: 'EMAIL_LINK' | 'EMAIL_WITH_CODE' | 'MANUAL_LINK';
  expiresAt?: Date | null;
}): Promise<void> {
  await sendEsigningRequestEmail({
    ...input,
    kind: 'reminder',
  });
}

export async function sendEsigningExpiryWarningEmailToSender(input: {
  to: string;
  senderName: string;
  envelopeTitle: string;
  daysUntilExpiry: number;
  pendingRecipients: Array<{ name: string; email: string }>;
  envelopeId: string;
}): Promise<void> {
  const envelopeUrl = `${getAppBaseUrl()}/esigning/${encodeURIComponent(input.envelopeId)}`;

  await safeSendEmail({
    to: input.to,
    subject: `Expiry warning: "${input.envelopeTitle}" expires in ${input.daysUntilExpiry} day${input.daysUntilExpiry === 1 ? '' : 's'}`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.senderName)},</p>
        <p><strong>${escapeHtml(input.envelopeTitle)}</strong> is due to expire in <strong>${input.daysUntilExpiry} day${input.daysUntilExpiry === 1 ? '' : 's'}</strong>.</p>
        ${
          input.pendingRecipients.length > 0
            ? `<p>Still pending:</p>
               <ul style="padding-left: 20px; margin: 12px 0;">
                 ${input.pendingRecipients
                   .map(
                     (recipient) =>
                       `<li>${escapeHtml(recipient.name)} (${escapeHtml(recipient.email)})</li>`
                   )
                   .join('')}
               </ul>`
            : ''
        }
        <p><a href="${envelopeUrl}" style="display:inline-block;padding:10px 16px;background:#294d44;color:#ffffff;text-decoration:none;border-radius:8px;">Open envelope</a></p>
      </div>
    `,
  });
}

export async function sendEsigningExpiredEmailToSender(input: {
  to: string;
  senderName: string;
  envelopeTitle: string;
  expiredAt: Date;
  pendingRecipients: Array<{ name: string; email: string }>;
  envelopeId: string;
}): Promise<void> {
  const envelopeUrl = `${getAppBaseUrl()}/esigning/${encodeURIComponent(input.envelopeId)}`;
  const expiredText = formatDateTime(input.expiredAt);

  await safeSendEmail({
    to: input.to,
    subject: `Expired: "${input.envelopeTitle}"`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
        <p>Hello ${escapeHtml(input.senderName)},</p>
        <p><strong>${escapeHtml(input.envelopeTitle)}</strong> expired${expiredText ? ` on <strong>${escapeHtml(expiredText)}</strong>` : ''} before all signatures were completed.</p>
        ${
          input.pendingRecipients.length > 0
            ? `<p>Pending recipients at expiry:</p>
               <ul style="padding-left: 20px; margin: 12px 0;">
                 ${input.pendingRecipients
                   .map(
                     (recipient) =>
                       `<li>${escapeHtml(recipient.name)} (${escapeHtml(recipient.email)})</li>`
                   )
                   .join('')}
               </ul>`
            : ''
        }
        <p><a href="${envelopeUrl}" style="display:inline-block;padding:10px 16px;background:#294d44;color:#ffffff;text-decoration:none;border-radius:8px;">Review envelope</a></p>
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
