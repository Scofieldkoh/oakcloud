/**
 * Database Error Handling Utility
 *
 * Provides consistent error handling for Prisma database operations.
 * Uses Prisma error codes for reliable error detection.
 *
 * Reference: https://www.prisma.io/docs/reference/api-reference/error-reference
 */

import { Prisma } from '@/generated/prisma';
import { createLogger } from './logger';

const log = createLogger('db-errors');

// ============================================================================
// Prisma Error Codes
// ============================================================================

/**
 * Common Prisma error codes
 * See: https://www.prisma.io/docs/reference/api-reference/error-reference
 */
export const PRISMA_ERROR_CODES = {
  // Common Errors (P1xxx)
  AUTHENTICATION_FAILED: 'P1000',
  CONNECTION_REFUSED: 'P1001',
  CONNECTION_TIMEOUT: 'P1002',
  DATABASE_NOT_FOUND: 'P1003',

  // Query Engine Errors (P2xxx)
  UNIQUE_CONSTRAINT: 'P2002',
  FOREIGN_KEY_CONSTRAINT: 'P2003',
  CONSTRAINT_FAILED: 'P2004',
  RECORD_NOT_FOUND: 'P2025',
  REQUIRED_VALUE_MISSING: 'P2012',
  INVALID_VALUE: 'P2006',
  INVALID_JSON: 'P2007',
  TOO_MANY_CONNECTIONS: 'P2024',

  // Migration Errors (P3xxx)
  MIGRATION_FAILED: 'P3006',
} as const;

// ============================================================================
// Error Types
// ============================================================================

export interface DatabaseError {
  /** Error code (Prisma error code or custom) */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Affected field(s) if applicable */
  field?: string;
  /** Original error for debugging */
  originalError?: Error;
}

// ============================================================================
// Error Detection Functions
// ============================================================================

/**
 * Check if error is a Prisma known request error
 */
export function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Check if error is a Prisma validation error
 */
export function isPrismaValidationError(error: unknown): error is Prisma.PrismaClientValidationError {
  return error instanceof Prisma.PrismaClientValidationError;
}

/**
 * Check if error is a unique constraint violation
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT;
}

/**
 * Check if error is a foreign key constraint violation
 */
export function isForeignKeyError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PRISMA_ERROR_CODES.FOREIGN_KEY_CONSTRAINT;
}

/**
 * Check if error is a record not found error
 */
export function isRecordNotFoundError(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PRISMA_ERROR_CODES.RECORD_NOT_FOUND;
}

/**
 * Check if error is a connection error
 */
export function isConnectionError(error: unknown): boolean {
  if (!isPrismaKnownError(error)) return false;
  return [
    PRISMA_ERROR_CODES.AUTHENTICATION_FAILED,
    PRISMA_ERROR_CODES.CONNECTION_REFUSED,
    PRISMA_ERROR_CODES.CONNECTION_TIMEOUT,
    PRISMA_ERROR_CODES.TOO_MANY_CONNECTIONS,
  ].includes(error.code as typeof PRISMA_ERROR_CODES.AUTHENTICATION_FAILED);
}

// ============================================================================
// Error Parsing Functions
// ============================================================================

/**
 * Extract field name from unique constraint error
 */
export function getUniqueConstraintField(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = error.meta as { target?: string[] } | undefined;
  return meta?.target?.[0];
}

/**
 * Extract field name from foreign key error
 */
export function getForeignKeyField(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = error.meta as { field_name?: string } | undefined;
  return meta?.field_name;
}

// ============================================================================
// Error Handling Functions
// ============================================================================

/**
 * Convert Prisma error to user-friendly DatabaseError
 */
export function parseDatabaseError(error: unknown): DatabaseError {
  // Handle Prisma known errors
  if (isPrismaKnownError(error)) {
    switch (error.code) {
      case PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT: {
        const field = getUniqueConstraintField(error);
        return {
          code: error.code,
          message: field
            ? `A record with this ${field} already exists`
            : 'A record with this value already exists',
          field,
          originalError: error,
        };
      }

      case PRISMA_ERROR_CODES.FOREIGN_KEY_CONSTRAINT: {
        const field = getForeignKeyField(error);
        return {
          code: error.code,
          message: field
            ? `Invalid reference: ${field} does not exist`
            : 'Invalid reference to related record',
          field,
          originalError: error,
        };
      }

      case PRISMA_ERROR_CODES.RECORD_NOT_FOUND:
        return {
          code: error.code,
          message: 'Record not found',
          originalError: error,
        };

      case PRISMA_ERROR_CODES.CONNECTION_REFUSED:
      case PRISMA_ERROR_CODES.CONNECTION_TIMEOUT:
      case PRISMA_ERROR_CODES.TOO_MANY_CONNECTIONS:
        log.error('Database connection error:', error.message);
        return {
          code: error.code,
          message: 'Database temporarily unavailable. Please try again.',
          originalError: error,
        };

      default:
        log.warn('Unhandled Prisma error code:', error.code, error.message);
        return {
          code: error.code,
          message: 'A database error occurred',
          originalError: error,
        };
    }
  }

  // Handle Prisma validation errors
  if (isPrismaValidationError(error)) {
    log.warn('Prisma validation error:', error.message);
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid data provided',
      originalError: error,
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      code: 'UNKNOWN',
      message: error.message,
      originalError: error,
    };
  }

  return {
    code: 'UNKNOWN',
    message: 'An unexpected error occurred',
  };
}

/**
 * Wrap a database operation with error handling
 * Returns a tuple of [result, error] for easy handling
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>
): Promise<[T | null, DatabaseError | null]> {
  try {
    const result = await operation();
    return [result, null];
  } catch (error) {
    const dbError = parseDatabaseError(error);
    return [null, dbError];
  }
}

/**
 * Handle database error and return appropriate HTTP status code
 */
export function getHttpStatusForDatabaseError(error: DatabaseError): number {
  switch (error.code) {
    case PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT:
      return 409; // Conflict
    case PRISMA_ERROR_CODES.FOREIGN_KEY_CONSTRAINT:
    case PRISMA_ERROR_CODES.REQUIRED_VALUE_MISSING:
    case PRISMA_ERROR_CODES.INVALID_VALUE:
    case 'VALIDATION_ERROR':
      return 400; // Bad Request
    case PRISMA_ERROR_CODES.RECORD_NOT_FOUND:
      return 404; // Not Found
    case PRISMA_ERROR_CODES.CONNECTION_REFUSED:
    case PRISMA_ERROR_CODES.CONNECTION_TIMEOUT:
    case PRISMA_ERROR_CODES.TOO_MANY_CONNECTIONS:
      return 503; // Service Unavailable
    default:
      return 500; // Internal Server Error
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Handle unique constraint error with custom message
 */
export function handleUniqueConstraint(
  error: unknown,
  fieldMessages: Record<string, string>
): string | null {
  if (!isUniqueConstraintError(error)) return null;

  const field = getUniqueConstraintField(error as Prisma.PrismaClientKnownRequestError);
  if (field && fieldMessages[field]) {
    return fieldMessages[field];
  }

  return 'A record with this value already exists';
}

/**
 * Rethrow non-database errors, return database error for handling
 */
export function catchDatabaseError(error: unknown): DatabaseError {
  if (isPrismaKnownError(error) || isPrismaValidationError(error)) {
    return parseDatabaseError(error);
  }

  // Rethrow non-database errors
  throw error;
}
