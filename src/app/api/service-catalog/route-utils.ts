import { ZodError } from 'zod';
import {
  createErrorResponse,
  handleApiError,
} from '@/lib/api-error-handler';
import { ApiError, ErrorCodes } from '@/lib/errors';

export function serviceCatalogErrorResponse(error: unknown, context: string) {
  if (error instanceof ZodError) {
    return createErrorResponse(
      ErrorCodes.VALIDATION_ERROR,
      error.errors[0]?.message ?? 'Invalid service catalog request',
      400,
      error.flatten(),
    );
  }
  if (error instanceof ApiError) {
    return createErrorResponse(error.code, error.message, error.statusCode, error.details);
  }
  return handleApiError(error, context);
}
