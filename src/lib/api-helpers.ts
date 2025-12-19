/**
 * API Route Helpers
 *
 * Common utility functions for API routes to ensure consistent
 * handling of tenant context, error responses, and validation.
 */

import { NextResponse } from 'next/server';
import type { SessionUser } from './auth';
import { prisma } from './prisma';
import { HTTP_STATUS } from './constants/application';

// ============================================================================
// Tenant Context Helpers
// ============================================================================

/**
 * Resolve effective tenant ID for API operations
 *
 * Rules:
 * - SUPER_ADMIN can specify tenantId via parameter (must be validated)
 * - Regular users always use their session tenant
 * - Returns null if no valid tenant context
 *
 * @param session - Current user session
 * @param requestedTenantId - Optional tenant ID from request
 * @returns Effective tenant ID or null
 */
export async function resolveEffectiveTenantId(
  session: SessionUser,
  requestedTenantId?: string | null
): Promise<{ tenantId: string | null; error?: string }> {
  // Regular users always use their session tenant
  if (!session.isSuperAdmin) {
    if (!session.tenantId) {
      return { tenantId: null, error: 'Tenant context required' };
    }
    return { tenantId: session.tenantId };
  }

  // SUPER_ADMIN with requested tenant ID - validate it exists
  if (requestedTenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: requestedTenantId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!tenant) {
      return { tenantId: null, error: 'Tenant not found' };
    }

    return { tenantId: tenant.id };
  }

  // SUPER_ADMIN without tenant ID - use session tenant if available
  if (session.tenantId) {
    return { tenantId: session.tenantId };
  }

  // SUPER_ADMIN without any tenant context - some operations may allow this
  return { tenantId: null };
}

/**
 * Require tenant context - returns error response if not available
 */
export async function requireTenantContext(
  session: SessionUser,
  requestedTenantId?: string | null
): Promise<{ tenantId: string; error?: never } | { tenantId?: never; error: NextResponse }> {
  const result = await resolveEffectiveTenantId(session, requestedTenantId);

  if (result.error) {
    return {
      error: NextResponse.json(
        { error: result.error },
        { status: HTTP_STATUS.BAD_REQUEST }
      ),
    };
  }

  if (!result.tenantId) {
    return {
      error: NextResponse.json(
        { error: 'Tenant context required' },
        { status: HTTP_STATUS.BAD_REQUEST }
      ),
    };
  }

  return { tenantId: result.tenantId };
}

// ============================================================================
// Error Response Helpers
// ============================================================================

/**
 * Standard error response codes
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = 'Internal server error'
): NextResponse {
  if (error instanceof Error) {
    const message = error.message;

    // Auth errors
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_STATUS.UNAUTHORIZED });
    }

    // Permission errors
    if (message === 'Forbidden' || message.startsWith('Permission denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: HTTP_STATUS.FORBIDDEN });
    }

    // Not found errors
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: HTTP_STATUS.NOT_FOUND });
    }

    // Invalid ID format
    if (message.includes('Invalid') && message.includes('format')) {
      return NextResponse.json({ error: message }, { status: HTTP_STATUS.BAD_REQUEST });
    }

    // Validation/business logic errors
    return NextResponse.json({ error: message }, { status: HTTP_STATUS.BAD_REQUEST });
  }

  // Unknown error
  return NextResponse.json({ error: defaultMessage }, { status: HTTP_STATUS.SERVER_ERROR });
}

/**
 * Create success response with optional status code
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = HTTP_STATUS.OK
): NextResponse {
  return NextResponse.json(data, { status });
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Parse query parameters safely
 */
export function parseQueryParams<T>(
  searchParams: URLSearchParams,
  schema: { parse: (data: unknown) => T }
): T {
  const params: Record<string, string | undefined> = {};

  searchParams.forEach((value, key) => {
    params[key] = value || undefined;
  });

  return schema.parse(params);
}

/**
 * Parse numeric query parameter
 */
export function parseNumericParam(value: string | null, defaultValue?: number): number | undefined {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean query parameter
 */
export function parseBooleanParam(value: string | null, defaultValue?: boolean): boolean | undefined {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}
