/**
 * Rate Limiting Utility
 *
 * Provides in-memory rate limiting for security-sensitive operations.
 * Supports multiple rate limit configurations per operation type.
 */

import { createLogger } from './logger';

const log = createLogger('rate-limit');

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional: Number of failed attempts before temporary lockout */
  lockoutThreshold?: number;
  /** Optional: Lockout duration in milliseconds (default: 15 minutes) */
  lockoutDurationMs?: number;
}

interface RateLimitEntry {
  /** Number of requests in current window */
  count: number;
  /** Window start timestamp */
  windowStart: number;
  /** Length of this entry's window; cleanup must not drop the entry before it ends */
  windowMs: number;
  /** Number of consecutive failures (for lockout tracking) */
  failures: number;
  /** Lockout expiry timestamp (if locked out) */
  lockedUntil?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in current window */
  remaining: number;
  /** Timestamp when the rate limit resets */
  resetAt: number;
  /** Whether the key is currently locked out */
  isLockedOut: boolean;
  /** Timestamp when lockout expires (if locked out) */
  lockoutExpiresAt?: number;
  /** Reason for denial (if not allowed) */
  reason?: 'rate_limit_exceeded' | 'locked_out';
}

// ============================================================================
// Rate Limit Storage
// ============================================================================

// In-memory storage for rate limits
// In production, consider using Redis for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Start cleanup interval
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of rateLimitStore.entries()) {
      // Remove entries whose own window has ended and that are not locked out. Using the cleanup
      // interval here instead would reset budgets longer than five minutes (access-code and
      // certificate-lookup limits) before their window is over.
      const isExpired = now - entry.windowStart >= entry.windowMs;
      const isLockedOut = entry.lockedUntil && entry.lockedUntil > now;

      if (isExpired && !isLockedOut) {
        rateLimitStore.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug(`Rate limit cleanup: removed ${cleaned} expired entries`);
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup on module load
startCleanup();

// ============================================================================
// Predefined Rate Limit Configurations
// ============================================================================

export const RATE_LIMIT_CONFIGS = {
  /** Share password verification: 5 attempts per 15 minutes, lockout after 10 failures */
  SHARE_PASSWORD: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    lockoutThreshold: 10,
    lockoutDurationMs: 30 * 60 * 1000, // 30 minute lockout
  } as RateLimitConfig,

  /** Password reset request: 3 requests per hour per email */
  PASSWORD_RESET_REQUEST: {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  } as RateLimitConfig,

  /** Password reset token validation: 5 attempts per 15 minutes */
  PASSWORD_RESET_TOKEN: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    lockoutThreshold: 10,
    lockoutDurationMs: 60 * 60 * 1000, // 1 hour lockout
  } as RateLimitConfig,

  /** Login attempts: 5 per 1 minute */
  LOGIN: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
    lockoutThreshold: 15,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minute lockout
  } as RateLimitConfig,

  /** API general: 100 requests per minute */
  API_GENERAL: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public form view: 60 requests per minute per IP+slug */
  FORM_VIEW: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public form submission: 10 per minute per IP+slug */
  FORM_SUBMIT: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public form company name availability check: 20 per minute per IP */
  FORM_NAME_CHECK: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public form file upload: 20 per minute per IP+slug */
  FORM_UPLOAD: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public form draft save: 15 per minute per IP+slug */
  FORM_DRAFT_SAVE: {
    maxRequests: 15,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public form draft resume: 10 per minute per IP+slug */
  FORM_DRAFT_RESUME: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public e-signing session load / token exchange */
  ESIGNING_SIGN_LOAD: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public e-signing access-code verification */
  ESIGNING_SIGN_VERIFY: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    lockoutThreshold: 5,
    lockoutDurationMs: 15 * 60 * 1000,
  } as RateLimitConfig,

  /**
   * Public e-signing access-code verification, per recipient from any address. Sits on top of
   * ESIGNING_SIGN_VERIFY (per address and recipient), so changing the source address does not reset it.
   */
  ESIGNING_SIGN_VERIFY_RECIPIENT: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
    lockoutThreshold: 10,
    lockoutDurationMs: 30 * 60 * 1000,
  } as RateLimitConfig,

  /**
   * Public e-signing autosave and consent. Keyed per recipient. The signing page saves at most twice a
   * second (500 ms debounce), so 120 per minute leaves room for real typing and bursts.
   */
  ESIGNING_SIGN_SAVE: {
    maxRequests: 120,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public e-signing completion */
  ESIGNING_SIGN_COMPLETE: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public e-signing decline */
  ESIGNING_SIGN_DECLINE: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public e-signing downloads */
  ESIGNING_SIGN_DOWNLOAD: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /** Public certificate verification */
  ESIGNING_VERIFY: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  } as RateLimitConfig,

  /**
   * Public certificate lookups across all certificate IDs, per address: the verify page data, the
   * bootstrap lookup and the file check share it, so trying many IDs does not get a fresh allowance.
   */
  ESIGNING_PUBLIC_LOOKUP_AGGREGATE: {
    maxRequests: 60,
    windowMs: 10 * 60 * 1000, // 10 minutes
  } as RateLimitConfig,
} as const;

// ============================================================================
// Rate Limit Functions
// ============================================================================

/**
 * Generate a rate limit key combining operation type and identifier
 */
export function getRateLimitKey(operation: string, identifier: string): string {
  return `${operation}:${identifier}`;
}

/**
 * Check if a request is allowed under the rate limit
 *
 * @param key - Unique identifier for the rate limit (e.g., "share_password:192.168.1.1:share123")
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and metadata
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Check for lockout first
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.lockedUntil,
      isLockedOut: true,
      lockoutExpiresAt: entry.lockedUntil,
      reason: 'locked_out',
    };
  }

  // No existing entry or window expired - create new
  if (!entry || now - entry.windowStart >= config.windowMs) {
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
      windowMs: config.windowMs,
      failures: entry?.failures ?? 0, // Preserve failure count across windows
    });

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
      isLockedOut: false,
    };
  }

  // Within window - check limit
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + config.windowMs,
      isLockedOut: false,
      reason: 'rate_limit_exceeded',
    };
  }

  // Increment and allow
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
    isLockedOut: false,
  };
}

/**
 * Record a failed attempt (for lockout tracking)
 * Call this when an operation fails (e.g., wrong password)
 */
export function recordFailure(key: string, config: RateLimitConfig): void {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    rateLimitStore.set(key, {
      count: 0,
      windowStart: now,
      windowMs: config.windowMs,
      failures: 1,
    });
    return;
  }

  entry.failures++;

  // Check if we should trigger lockout
  if (config.lockoutThreshold && entry.failures >= config.lockoutThreshold) {
    const lockoutDuration = config.lockoutDurationMs ?? 15 * 60 * 1000;
    entry.lockedUntil = now + lockoutDuration;
    log.warn(`Rate limit lockout triggered for key: ${key}, failures: ${entry.failures}`);
  }

  rateLimitStore.set(key, entry);
}

/**
 * Record a successful attempt (resets failure count)
 */
export function recordSuccess(key: string): void {
  const entry = rateLimitStore.get(key);
  if (entry) {
    entry.failures = 0;
    rateLimitStore.set(key, entry);
  }
}

/**
 * Clear rate limit entry for a key (e.g., after successful authentication)
 */
export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

/**
 * Get current rate limit status without incrementing
 */
export function getRateLimitStatus(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Check for lockout
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.lockedUntil,
      isLockedOut: true,
      lockoutExpiresAt: entry.lockedUntil,
      reason: 'locked_out',
    };
  }

  // No entry or expired window
  if (!entry || now - entry.windowStart >= config.windowMs) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + config.windowMs,
      isLockedOut: false,
    };
  }

  // Within window
  const remaining = Math.max(0, config.maxRequests - entry.count);
  return {
    allowed: remaining > 0,
    remaining,
    resetAt: entry.windowStart + config.windowMs,
    isLockedOut: false,
    reason: remaining === 0 ? 'rate_limit_exceeded' : undefined,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Which proxy in front of the app is trusted to tell us the client address.
 *
 * - `TRUSTED_PROXY=xff` (default): the address is the entry `TRUSTED_PROXY_HOPS` places from the RIGHT
 *   of `X-Forwarded-For` (default 1). Each trusted proxy appends the address it received the request
 *   from, so the right-hand entries are written by our own infrastructure. The left-hand entries are
 *   whatever the client sent, and are never used.
 * - `TRUSTED_PROXY=cloudflare`: the address is `CF-Connecting-IP`.
 *
 * `X-Real-IP` is not read. With no proxy at all there is no trustworthy address: a client can send any
 * `X-Forwarded-For`, so limits that must hold regardless (per recipient, per certificate lookup
 * aggregate) do not rely on it.
 *
 * Fail closed: `X-Forwarded-For` with fewer entries than `TRUSTED_PROXY_HOPS`, or a trusted entry that is
 * not an address, gives `unknown`. Every request that cannot be attributed shares one `unknown` allowance.
 * `TRUSTED_PROXY_HOPS` must equal the real number of proxies: a larger value lets a client pad the header
 * so the selected position is an entry it wrote.
 */
export type TrustedProxyMode = 'xff' | 'cloudflare';

export interface TrustedProxyConfig {
  mode: TrustedProxyMode;
  hops: number;
}

const DEFAULT_TRUSTED_PROXY_CONFIG: TrustedProxyConfig = { mode: 'xff', hops: 1 };
const MAX_TRUSTED_PROXY_HOPS = 5;
/** Longest textual IPv6 address with an IPv4 tail. Anything longer is not an address. */
const MAX_IP_LENGTH = 45;
const IP_CHARACTERS = /^[0-9A-Fa-f:.]+$/;

let proxyConfigWarning: 'unset' | 'invalid' | null = null;

export function getTrustedProxyConfig(env: NodeJS.ProcessEnv = process.env): TrustedProxyConfig {
  const rawMode = env.TRUSTED_PROXY?.trim().toLowerCase();
  const rawHops = env.TRUSTED_PROXY_HOPS?.trim();

  if (!rawMode && !rawHops) {
    if (proxyConfigWarning !== 'unset') {
      proxyConfigWarning = 'unset';
      log.warn(
        'TRUSTED_PROXY is not set: using the last X-Forwarded-For entry (one proxy hop). Set TRUSTED_PROXY=cloudflare behind Cloudflare, or TRUSTED_PROXY_HOPS to the number of proxies in front of the app.'
      );
    }
    return DEFAULT_TRUSTED_PROXY_CONFIG;
  }

  const mode: TrustedProxyMode | null = !rawMode || rawMode === 'xff' ? 'xff' : rawMode === 'cloudflare' ? 'cloudflare' : null;
  const hops = rawHops === undefined || rawHops === '' ? 1 : /^\d+$/.test(rawHops) ? Number(rawHops) : NaN;

  if (!mode || !Number.isInteger(hops) || hops < 1 || hops > MAX_TRUSTED_PROXY_HOPS) {
    if (proxyConfigWarning !== 'invalid') {
      proxyConfigWarning = 'invalid';
      log.error(
        `Invalid TRUSTED_PROXY (${rawMode ?? ''}) or TRUSTED_PROXY_HOPS (${rawHops ?? ''}): expected xff or cloudflare, and a number from 1 to ${MAX_TRUSTED_PROXY_HOPS}. Using the defaults.`
      );
    }
    return DEFAULT_TRUSTED_PROXY_CONFIG;
  }

  return { mode, hops };
}

function plausibleIp(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > MAX_IP_LENGTH || !IP_CHARACTERS.test(candidate)) {
    return null;
  }
  return candidate;
}

/**
 * Extract the client IP from the request headers according to the trusted proxy setting.
 * Returns `unknown` when no trustworthy address is present.
 */
export function getClientIp(request: Request): string {
  const config = getTrustedProxyConfig();

  if (config.mode === 'cloudflare') {
    return plausibleIp(request.headers.get('cf-connecting-ip')) ?? 'unknown';
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) {
    return 'unknown';
  }

  const entries = forwardedFor.split(',').map((entry) => entry.trim());
  // The configured number of trusted proxies must all have appended an entry. Fewer entries means the
  // request did not pass through the whole chain (or the chain is configured wrongly), and the entries
  // that are there may be what the client sent: fail closed instead of taking the nearest one.
  if (entries.length < config.hops) {
    return 'unknown';
  }
  return plausibleIp(entries[entries.length - config.hops]) ?? 'unknown';
}

/** For tests: forget that a proxy configuration warning was already logged. */
export function __resetTrustedProxyWarning(): void {
  proxyConfigWarning = null;
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
    ...(result.isLockedOut && result.lockoutExpiresAt
      ? { 'X-RateLimit-Lockout-Expires': Math.ceil(result.lockoutExpiresAt / 1000).toString() }
      : {}),
  };
}

// ============================================================================
// For Testing - DO NOT USE IN PRODUCTION
// ============================================================================

export function __resetRateLimitStore(): void {
  rateLimitStore.clear();
}
