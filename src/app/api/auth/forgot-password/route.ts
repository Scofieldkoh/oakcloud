/**
 * Forgot Password API Route
 *
 * POST /api/auth/forgot-password - Request password reset email
 */

import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/services/password.service';
import { z } from 'zod';
import { createLogger, safeErrorMessage } from '@/lib/logger';

const log = createLogger('auth:forgot-password');

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    const result = await requestPasswordReset(email);

    return NextResponse.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    log.error('Forgot password error:', safeErrorMessage(error));
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
