import { NextResponse } from 'next/server';
import { HTTP_STATUS } from './constants/application';
import { ApiError } from './errors';

/**
 * Error mapping shared by route handlers that throw plain `Error`s from
 * services. It keeps each route's own response contract while removing the
 * copy-pasted auth/permission branches:
 *
 * - `ApiError` below 500 → its own status, message, code and details;
 * - "Unauthorized" → 401, "Forbidden" or "Permission denied..." → 403;
 * - messages listed in `notFound` / `conflict` → 404 / 409 with the message
 *   (`notFound: 'any'` matches any message containing "not found");
 * - any other `Error` → 400 with its message when `fallback` is
 *   'bad-request', otherwise 500 "Internal server error";
 * - anything else → 500.
 *
 * Validation errors (Zod) keep their route-specific payloads and are handled
 * by the route before calling this.
 */
export interface RouteErrorOptions {
  notFound?: readonly string[] | 'any';
  conflict?: readonly string[];
  /** What an unrecognised `Error` becomes. Defaults to 'server-error'. */
  fallback?: 'bad-request' | 'server-error';
  /** Logged with the error whenever the response is a 500. */
  logLabel?: string;
}

const INTERNAL_ERROR = 'Internal server error';

export function routeErrorResponse(error: unknown, options: RouteErrorOptions = {}): NextResponse {
  if (error instanceof ApiError && error.statusCode < HTTP_STATUS.SERVER_ERROR) {
    return NextResponse.json({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    }, { status: error.statusCode });
  }

  if (error instanceof Error) {
    const { message } = error;
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: HTTP_STATUS.UNAUTHORIZED });
    }
    if (message === 'Forbidden' || message.startsWith('Permission denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: HTTP_STATUS.FORBIDDEN });
    }
    const notFound = options.notFound === 'any'
      ? message.includes('not found')
      : options.notFound?.includes(message) ?? false;
    if (notFound) {
      return NextResponse.json({ error: message }, { status: HTTP_STATUS.NOT_FOUND });
    }
    if (options.conflict?.includes(message)) {
      return NextResponse.json({ error: message }, { status: HTTP_STATUS.CONFLICT });
    }
    if (options.fallback === 'bad-request') {
      return NextResponse.json({ error: message }, { status: HTTP_STATUS.BAD_REQUEST });
    }
  }

  if (options.logLabel) console.error(options.logLabel, error);
  return NextResponse.json({ error: INTERNAL_ERROR }, { status: HTTP_STATUS.SERVER_ERROR });
}
