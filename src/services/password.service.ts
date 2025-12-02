/**
 * Password Service
 *
 * Handles password reset, change, and validation logic.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface RequestResetResult {
  success: boolean;
  message: string;
  // Only returned in development for testing
  resetToken?: string;
  resetUrl?: string;
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
}

export interface ChangePasswordResult {
  success: boolean;
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const RESET_TOKEN_EXPIRY_HOURS = 24;
const MIN_PASSWORD_LENGTH = 8;

// ============================================================================
// Password Validation
// ============================================================================

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Request Password Reset
// ============================================================================

export async function requestPasswordReset(email: string): Promise<RequestResetResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase(), deletedAt: null },
  });

  // Always return success to prevent email enumeration
  if (!user || !user.isActive) {
    return {
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.',
    };
  }

  // Generate secure reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Set expiry time
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Save token to database
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expiresAt,
    },
  });

  // Log the reset request
  await createAuditLog({
    tenantId: user.tenantId || undefined,
    userId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: user.id,
    changeSource: 'MANUAL',
    metadata: { email: user.email },
  });

  // In production, send email here
  // await sendPasswordResetEmail(user.email, resetToken);

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  // Return token only in development for testing
  if (process.env.NODE_ENV === 'development') {
    return {
      success: true,
      message: 'Password reset link generated.',
      resetToken,
      resetUrl,
    };
  }

  return {
    success: true,
    message: 'If an account exists with this email, you will receive a password reset link.',
  };
}

// ============================================================================
// Reset Password with Token
// ============================================================================

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  // Validate password
  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.errors.join('. '),
    };
  }

  // Hash the provided token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid token
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: { gt: new Date() },
      deletedAt: null,
    },
  });

  if (!user) {
    return {
      success: false,
      message: 'Invalid or expired reset token. Please request a new password reset.',
    };
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update user
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  // Log the password reset
  await createAuditLog({
    tenantId: user.tenantId || undefined,
    userId: user.id,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'User',
    entityId: user.id,
    changeSource: 'MANUAL',
    metadata: { email: user.email },
  });

  return {
    success: true,
    message: 'Password has been reset successfully. You can now log in with your new password.',
  };
}

// ============================================================================
// Change Password (for logged-in users)
// ============================================================================

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    return {
      success: false,
      message: 'User not found.',
    };
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValidPassword) {
    return {
      success: false,
      message: 'Current password is incorrect.',
    };
  }

  // Validate new password
  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.errors.join('. '),
    };
  }

  // Ensure new password is different from current
  const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (isSamePassword) {
    return {
      success: false,
      message: 'New password must be different from current password.',
    };
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  // Log the password change
  await createAuditLog({
    tenantId: user.tenantId || undefined,
    userId: user.id,
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: user.id,
    changeSource: 'MANUAL',
    metadata: { email: user.email },
  });

  return {
    success: true,
    message: 'Password changed successfully.',
  };
}

// ============================================================================
// Force Password Change Check
// ============================================================================

export async function checkMustChangePassword(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { mustChangePassword: true },
  });

  return user?.mustChangePassword ?? false;
}

// ============================================================================
// Set Must Change Password Flag
// ============================================================================

export async function setMustChangePassword(
  userId: string,
  mustChange: boolean,
  updatedByUserId?: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
  });

  if (!user) {
    throw new Error('User not found');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: mustChange },
  });

  if (updatedByUserId) {
    await createAuditLog({
      tenantId: user.tenantId || undefined,
      userId: updatedByUserId,
      action: mustChange ? 'PASSWORD_CHANGE_REQUIRED' : 'PASSWORD_CHANGE_CLEARED',
      entityType: 'User',
      entityId: userId,
      changeSource: 'MANUAL',
      metadata: { email: user.email, targetUserId: userId },
    });
  }
}
