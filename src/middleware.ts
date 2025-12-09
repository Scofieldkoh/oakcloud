import { NextRequest, NextResponse } from 'next/server';

/**
 * CSRF Protection Middleware
 *
 * Validates the Origin header for state-changing requests (POST, PUT, DELETE, PATCH)
 * to prevent Cross-Site Request Forgery attacks.
 *
 * Allows requests from:
 * - Same origin (Origin header matches host)
 * - No Origin header (same-site navigation, curl, etc.)
 * - Allowed origins list (for configured external integrations)
 *
 * Exemptions:
 * - Public API endpoints that need external access (share endpoints)
 * - Webhook endpoints
 */

// Methods that require CSRF protection
const PROTECTED_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

// API paths that are exempt from CSRF protection (public endpoints)
const CSRF_EXEMPT_PATHS = [
  '/api/share/', // Public share document endpoints
  '/api/webhooks/', // Webhook endpoints
  '/api/auth/login', // Login endpoint (needs to work from external forms)
  '/api/auth/forgot-password', // Password reset
  '/api/auth/reset-password', // Password reset
];

/**
 * Check if the path is exempt from CSRF protection
 */
function isExemptPath(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some((exemptPath) => pathname.startsWith(exemptPath));
}

/**
 * Get allowed origins from environment or use defaults
 */
function getAllowedOrigins(host: string): string[] {
  const origins: string[] = [];

  // Allow same origin (both http and https for local development)
  origins.push(`http://${host}`);
  origins.push(`https://${host}`);

  // Allow localhost variants for development
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    origins.push('http://localhost:3000');
    origins.push('http://127.0.0.1:3000');
    origins.push('https://localhost:3000');
  }

  // Add any additional allowed origins from environment
  const additionalOrigins = process.env.ALLOWED_ORIGINS;
  if (additionalOrigins) {
    origins.push(...additionalOrigins.split(',').map((o) => o.trim()));
  }

  return origins;
}

/**
 * Validate origin for CSRF protection
 */
function isValidOrigin(origin: string | null, host: string): boolean {
  // No origin header - likely same-site navigation or non-browser client
  // This is acceptable as browsers always send Origin for cross-origin requests
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins(host);
  return allowedOrigins.some((allowed) => origin === allowed || origin.startsWith(allowed));
}

export function middleware(request: NextRequest) {
  const { method, headers, nextUrl } = request;

  // Only check API routes
  if (!nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Only check protected methods
  if (!PROTECTED_METHODS.includes(method)) {
    return NextResponse.next();
  }

  // Check if path is exempt
  if (isExemptPath(nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Get origin and host
  const origin = headers.get('origin');
  const host = headers.get('host') || 'localhost:3000';

  // Validate origin
  if (!isValidOrigin(origin, host)) {
    console.warn(`[CSRF] Blocked request from origin: ${origin} to ${nextUrl.pathname}`);
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: 'Invalid request origin',
      },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
  ],
};
