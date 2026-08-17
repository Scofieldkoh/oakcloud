import { ZodError } from 'zod';
import { createErrorResponse, handleApiError } from '@/lib/api-error-handler';
import { ApiError, ErrorCodes } from '@/lib/errors';

export function businessCalendarErrorResponse(error: unknown, context: string) {
  if (error instanceof ZodError) {
    return createErrorResponse(
      ErrorCodes.VALIDATION_ERROR,
      error.issues[0]?.message ?? 'Invalid business calendar request',
      400,
      error.flatten(),
    );
  }
  if (error instanceof ApiError) {
    return createErrorResponse(error.code, error.message, error.statusCode, error.details);
  }
  return handleApiError(error, context);
}
