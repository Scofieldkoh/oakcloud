/**
 * Email Service
 *
 * Handles all email sending functionality.
 * Supports two providers:
 * 1. Microsoft Graph API (recommended for M365 users)
 * 2. SMTP via Nodemailer (fallback)
 *
 * Microsoft Graph Environment Variables:
 * - AZURE_TENANT_ID: Azure AD tenant ID
 * - AZURE_CLIENT_ID: Azure AD application (client) ID
 * - AZURE_CLIENT_SECRET: Azure AD client secret
 * - EMAIL_FROM_ADDRESS: Sender email address (must be valid M365 mailbox)
 * - EMAIL_FROM_NAME: Sender display name
 *
 * SMTP Environment Variables (fallback):
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port (default: 587)
 * - SMTP_SECURE: Use TLS (default: false for port 587, true for 465)
 * - SMTP_USER: SMTP authentication username
 * - SMTP_PASSWORD: SMTP authentication password
 * - EMAIL_FROM_ADDRESS: Default sender email address
 * - EMAIL_FROM_NAME: Default sender name (default: Oakcloud)
 */

import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// ============================================================================
// Types
// ============================================================================

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

type EmailProvider = 'graph' | 'smtp' | 'none';

// ============================================================================
// Provider Detection
// ============================================================================

function getEmailProvider(): EmailProvider {
  // Check for Microsoft Graph API (preferred)
  if (
    process.env.AZURE_TENANT_ID &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_CLIENT_SECRET &&
    process.env.EMAIL_FROM_ADDRESS
  ) {
    return 'graph';
  }

  // Check for SMTP
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  ) {
    return 'smtp';
  }

  return 'none';
}

// ============================================================================
// Microsoft Graph API
// ============================================================================

let graphClient: Client | null = null;

function getGraphClient(): Client | null {
  if (graphClient) {
    return graphClient;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

async function sendViaGraph(options: EmailOptions): Promise<SendEmailResult> {
  const client = getGraphClient();
  if (!client) {
    return { success: false, error: 'Microsoft Graph client not initialized' };
  }

  const fromAddress = options.from || process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME || 'Oakcloud';

  // Build recipients
  const toRecipients = (Array.isArray(options.to) ? options.to : [options.to]).map((email) => ({
    emailAddress: { address: email },
  }));

  const ccRecipients = options.cc
    ? (Array.isArray(options.cc) ? options.cc : [options.cc]).map((email) => ({
        emailAddress: { address: email },
      }))
    : undefined;

  const bccRecipients = options.bcc
    ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).map((email) => ({
        emailAddress: { address: email },
      }))
    : undefined;

  const message = {
    subject: options.subject,
    body: {
      contentType: 'HTML',
      content: options.html,
    },
    from: {
      emailAddress: {
        address: fromAddress,
        name: fromName,
      },
    },
    toRecipients,
    ccRecipients,
    bccRecipients,
    replyTo: options.replyTo
      ? [{ emailAddress: { address: options.replyTo } }]
      : undefined,
  };

  try {
    await client.api(`/users/${fromAddress}/sendMail`).post({ message });

    return {
      success: true,
      messageId: `graph-${Date.now()}`,
    };
  } catch (error) {
    console.error('[Email] Microsoft Graph send failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Graph API error',
    };
  }
}

async function verifyGraphConnection(): Promise<boolean> {
  // For Graph API, we just verify that the client can be initialized
  // Actual permission verification happens on first send
  // (We can't read user profile without User.Read.All permission)
  const client = getGraphClient();
  return client !== null;
}

// ============================================================================
// SMTP (Nodemailer)
// ============================================================================

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter | null {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return smtpTransporter;
}

function getFromAddress(): string {
  const fromName = process.env.EMAIL_FROM_NAME || 'Oakcloud';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER;
  return `"${fromName}" <${fromAddress}>`;
}

async function sendViaSmtp(options: EmailOptions): Promise<SendEmailResult> {
  const transport = getSmtpTransporter();
  if (!transport) {
    return { success: false, error: 'SMTP transport not initialized' };
  }

  try {
    const result = await transport.sendMail({
      from: options.from || getFromAddress(),
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      replyTo: options.replyTo,
      subject: options.subject,
      html: options.html,
      text: options.text || stripHtml(options.html),
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('[Email] SMTP send failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown SMTP error',
    };
  }
}

async function verifySmtpConnection(): Promise<boolean> {
  const transport = getSmtpTransporter();
  if (!transport) {
    return false;
  }

  try {
    await transport.verify();
    return true;
  } catch (error) {
    console.error('[Email] SMTP verification failed:', error);
    return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return getEmailProvider() !== 'none';
}

/**
 * Get the current email provider
 */
export function getActiveEmailProvider(): string {
  return getEmailProvider();
}

/**
 * Send an email using the configured provider
 */
export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const provider = getEmailProvider();

  if (provider === 'none') {
    // Log warning in development, but don't fail
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Email] No email provider configured. Email would be sent to:', options.to);
      console.warn('[Email] Subject:', options.subject);
      return {
        success: true,
        messageId: 'dev-mode-no-email',
      };
    }
    return {
      success: false,
      error: 'Email service not configured',
    };
  }

  if (provider === 'graph') {
    return sendViaGraph(options);
  }

  return sendViaSmtp(options);
}

/**
 * Verify email connection (useful for health checks)
 */
export async function verifyEmailConnection(): Promise<boolean> {
  const provider = getEmailProvider();

  if (provider === 'graph') {
    return verifyGraphConnection();
  }

  if (provider === 'smtp') {
    return verifySmtpConnection();
  }

  return false;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Simple HTML to plain text converter
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get the base URL for email links
 */
export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
