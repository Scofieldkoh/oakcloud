/**
 * Email Templates
 *
 * Professional email templates for all system notifications.
 * All templates follow a consistent design language.
 */

import { getAppBaseUrl } from './email';

// ============================================================================
// Base Template
// ============================================================================

interface BaseTemplateOptions {
  title: string;
  preheader?: string;
  content: string;
  footerText?: string;
}

/**
 * Base email template wrapper with consistent styling
 */
function baseTemplate({ title, preheader, content, footerText }: BaseTemplateOptions): string {
  const baseUrl = getAppBaseUrl();
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100%; }

    /* Base styles */
    .email-wrapper { background-color: #f4f5f7; padding: 40px 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06); }
    .email-header { background-color: #294d44; padding: 32px 40px; text-align: center; }
    .email-header h1 { color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 24px; font-weight: 600; margin: 0; }
    .email-body { padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333333; }
    .email-body h2 { color: #1a1d23; font-size: 20px; font-weight: 600; margin: 0 0 16px 0; }
    .email-body p { margin: 0 0 16px 0; }
    .email-body .greeting { font-size: 16px; margin-bottom: 24px; }
    .email-body .message { margin-bottom: 24px; }

    /* Button styles */
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #294d44; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 6px; transition: background-color 0.2s; }
    .btn:hover { background-color: #1f3a33; }

    /* Info box */
    .info-box { background-color: #f8f9fb; border: 1px solid #e2e4e9; border-radius: 6px; padding: 20px; margin: 24px 0; }
    .info-box p { margin: 0; }
    .info-box .label { font-size: 12px; color: #5c6370; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .info-box .value { font-size: 15px; color: #1a1d23; font-weight: 500; word-break: break-all; }

    /* Credentials box */
    .credentials-box { background-color: #f0f9f6; border: 1px solid #c6e5dc; border-radius: 6px; padding: 20px; margin: 24px 0; }
    .credentials-box .item { margin-bottom: 12px; }
    .credentials-box .item:last-child { margin-bottom: 0; }
    .credentials-box .label { font-size: 12px; color: #5c6370; text-transform: uppercase; letter-spacing: 0.5px; }
    .credentials-box .value { font-size: 15px; color: #1a1d23; font-weight: 600; font-family: 'SF Mono', Monaco, 'Courier New', monospace; }

    /* Warning box */
    .warning-box { background-color: #fef3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 16px; margin: 24px 0; font-size: 13px; color: #856404; }

    /* Footer styles */
    .email-footer { background-color: #f8f9fb; border-top: 1px solid #e2e4e9; padding: 24px 40px; text-align: center; }
    .email-footer p { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #7d838f; margin: 0 0 8px 0; }
    .email-footer a { color: #294d44; text-decoration: none; }
    .email-footer .security-note { font-size: 12px; color: #a0a5b0; margin-top: 16px; }

    /* Preheader - hidden text for email clients */
    .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; mso-hide: all; }

    /* Responsive */
    @media only screen and (max-width: 620px) {
      .email-wrapper { padding: 20px 10px; }
      .email-header, .email-body, .email-footer { padding-left: 24px; padding-right: 24px; }
      .email-body h2 { font-size: 18px; }
    }
  </style>
</head>
<body>
  ${preheader ? `<span class="preheader">${preheader}</span>` : ''}
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <h1>Oakcloud</h1>
      </div>
      <div class="email-body">
        ${content}
      </div>
      <div class="email-footer">
        ${footerText ? `<p>${footerText}</p>` : ''}
        <p>&copy; ${currentYear} Oakcloud. All rights reserved.</p>
        <p class="security-note">
          This email was sent from <a href="${baseUrl}">${baseUrl}</a><br>
          If you didn't request this email, you can safely ignore it.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================================
// Password Reset Email
// ============================================================================

export interface PasswordResetEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  resetUrl: string;
  expiryHours?: number;
}

export function passwordResetEmail(params: PasswordResetEmailParams): { subject: string; html: string } {
  const { firstName, resetUrl, expiryHours = 24 } = params;
  const name = firstName || 'there';

  const content = `
    <p class="greeting">Hi ${name},</p>

    <p class="message">
      We received a request to reset the password for your Oakcloud account.
      Click the button below to create a new password:
    </p>

    <div class="btn-container">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>

    <div class="info-box">
      <p class="label">Or copy this link into your browser:</p>
      <p class="value">${resetUrl}</p>
    </div>

    <div class="warning-box">
      <strong>This link will expire in ${expiryHours} hours.</strong><br>
      If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    </div>

    <p>
      For security reasons, this link can only be used once. If you need to reset your password again,
      please request a new link from the login page.
    </p>
  `;

  return {
    subject: 'Reset your Oakcloud password',
    html: baseTemplate({
      title: 'Password Reset Request',
      preheader: `Reset your password for Oakcloud. This link expires in ${expiryHours} hours.`,
      content,
    }),
  };
}

// ============================================================================
// User Invitation Email
// ============================================================================

export interface UserInvitationEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  tenantName: string;
  invitedByName?: string;
  loginUrl?: string;
}

export function userInvitationEmail(params: UserInvitationEmailParams): { subject: string; html: string } {
  const { firstName, email, temporaryPassword, tenantName, invitedByName, loginUrl } = params;
  const baseUrl = getAppBaseUrl();
  const name = firstName || 'there';
  const inviter = invitedByName ? ` by ${invitedByName}` : '';

  const content = `
    <h2>Welcome to Oakcloud!</h2>

    <p class="greeting">Hi ${name},</p>

    <p class="message">
      You've been invited${inviter} to join <strong>${tenantName}</strong> on Oakcloud,
      a practice management system for accounting firms.
    </p>

    <p>Your account has been created with the following credentials:</p>

    <div class="credentials-box">
      <div class="item">
        <div class="label">Email</div>
        <div class="value">${email}</div>
      </div>
      <div class="item">
        <div class="label">Temporary Password</div>
        <div class="value">${temporaryPassword}</div>
      </div>
    </div>

    <div class="btn-container">
      <a href="${loginUrl || `${baseUrl}/login`}" class="btn">Log In to Oakcloud</a>
    </div>

    <div class="warning-box">
      <strong>Important:</strong> For security reasons, you'll be required to change your password
      when you first log in. Please choose a strong password with at least 8 characters,
      including uppercase, lowercase, and numbers.
    </div>

    <p>
      If you have any questions, please reach out to your administrator or the person who invited you.
    </p>
  `;

  return {
    subject: `You've been invited to join ${tenantName} on Oakcloud`,
    html: baseTemplate({
      title: 'Welcome to Oakcloud',
      preheader: `${invitedByName || 'Someone'} has invited you to join ${tenantName} on Oakcloud.`,
      content,
      footerText: `You received this email because you were invited to ${tenantName} on Oakcloud.`,
    }),
  };
}

// ============================================================================
// Tenant Setup Complete Email (Admin Welcome)
// ============================================================================

export interface TenantSetupEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  tenantName: string;
  loginUrl?: string;
}

export function tenantSetupCompleteEmail(params: TenantSetupEmailParams): { subject: string; html: string } {
  const { firstName, email, temporaryPassword, tenantName, loginUrl } = params;
  const baseUrl = getAppBaseUrl();
  const name = firstName || 'there';

  const content = `
    <h2>Your Oakcloud Account is Ready!</h2>

    <p class="greeting">Hi ${name},</p>

    <p class="message">
      Great news! Your organization <strong>${tenantName}</strong> has been set up on Oakcloud.
      You've been assigned as the Tenant Administrator.
    </p>

    <p>Here are your login credentials:</p>

    <div class="credentials-box">
      <div class="item">
        <div class="label">Email</div>
        <div class="value">${email}</div>
      </div>
      <div class="item">
        <div class="label">Temporary Password</div>
        <div class="value">${temporaryPassword}</div>
      </div>
    </div>

    <div class="btn-container">
      <a href="${loginUrl || `${baseUrl}/login`}" class="btn">Log In to Oakcloud</a>
    </div>

    <div class="warning-box">
      <strong>Security Notice:</strong> You'll be required to change your password on first login.
      Please choose a strong password with at least 8 characters, including uppercase, lowercase, and numbers.
    </div>

    <h2 style="margin-top: 32px;">Getting Started</h2>

    <p>As a Tenant Administrator, you can:</p>
    <ul style="margin: 16px 0; padding-left: 24px;">
      <li>Invite team members to your organization</li>
      <li>Create and manage companies</li>
      <li>Configure roles and permissions</li>
      <li>Upload and extract BizFile documents</li>
      <li>View audit logs and activity</li>
    </ul>

    <p>
      If you have any questions or need assistance, please contact support.
    </p>
  `;

  return {
    subject: `Welcome to Oakcloud - Your ${tenantName} account is ready`,
    html: baseTemplate({
      title: 'Account Ready',
      preheader: `Your ${tenantName} organization is now active on Oakcloud. Log in to get started.`,
      content,
    }),
  };
}

// ============================================================================
// Password Changed Confirmation Email
// ============================================================================

export interface PasswordChangedEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  changedAt: Date;
}

export function passwordChangedEmail(params: PasswordChangedEmailParams): { subject: string; html: string } {
  const { firstName, email, changedAt } = params;
  const baseUrl = getAppBaseUrl();
  const name = firstName || 'there';
  const formattedDate = changedAt.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const content = `
    <h2>Password Changed Successfully</h2>

    <p class="greeting">Hi ${name},</p>

    <p class="message">
      This is a confirmation that the password for your Oakcloud account
      (<strong>${email}</strong>) was successfully changed.
    </p>

    <div class="info-box">
      <p class="label">Password Changed On</p>
      <p class="value">${formattedDate}</p>
    </div>

    <div class="warning-box">
      <strong>Didn't make this change?</strong><br>
      If you didn't change your password, your account may have been compromised.
      Please immediately:
      <ol style="margin: 8px 0 0 0; padding-left: 20px;">
        <li>Reset your password using the <a href="${baseUrl}/forgot-password">forgot password</a> page</li>
        <li>Contact your administrator</li>
      </ol>
    </div>

    <p>
      If you made this change, no further action is required. You can safely ignore this email.
    </p>
  `;

  return {
    subject: 'Your Oakcloud password was changed',
    html: baseTemplate({
      title: 'Password Changed',
      preheader: 'Your Oakcloud password was successfully changed.',
      content,
    }),
  };
}

// ============================================================================
// User Removed from Tenant Email
// ============================================================================

export interface UserRemovedEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  tenantName: string;
  removedByName?: string;
}

export function userRemovedEmail(params: UserRemovedEmailParams): { subject: string; html: string } {
  const { firstName, tenantName, removedByName } = params;
  const name = firstName || 'there';
  const remover = removedByName ? ` by ${removedByName}` : '';

  const content = `
    <h2>Account Access Removed</h2>

    <p class="greeting">Hi ${name},</p>

    <p class="message">
      Your access to <strong>${tenantName}</strong> on Oakcloud has been removed${remover}.
    </p>

    <p>
      You will no longer be able to log in to this organization. If you believe this was done
      in error, please contact your organization's administrator.
    </p>

    <p>
      Thank you for using Oakcloud.
    </p>
  `;

  return {
    subject: `Your access to ${tenantName} has been removed`,
    html: baseTemplate({
      title: 'Access Removed',
      preheader: `Your access to ${tenantName} on Oakcloud has been removed.`,
      content,
    }),
  };
}

// ============================================================================
// Generic Notification Email
// ============================================================================

export interface NotificationEmailParams {
  firstName: string;
  subject: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export function notificationEmail(params: NotificationEmailParams): { subject: string; html: string } {
  const { firstName, subject, title, message, actionUrl, actionText } = params;
  const name = firstName || 'there';

  const content = `
    <h2>${title}</h2>

    <p class="greeting">Hi ${name},</p>

    <div class="message">
      ${message}
    </div>

    ${actionUrl ? `
    <div class="btn-container">
      <a href="${actionUrl}" class="btn">${actionText || 'Take Action'}</a>
    </div>
    ` : ''}
  `;

  return {
    subject,
    html: baseTemplate({
      title,
      content,
    }),
  };
}
