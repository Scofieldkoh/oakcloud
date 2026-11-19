// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));

const MINUTE = 60 * 1000;

type RateLimitModule = typeof import('@/lib/rate-limit');
let limits: RateLimitModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T00:00:00Z'));
  // Load the module under fake timers so its five-minute cleanup interval is the fake one too.
  vi.resetModules();
  limits = await import('@/lib/rate-limit');
  limits.__resetRateLimitStore();
});

afterEach(() => {
  vi.useRealTimers();
});

function exhaust(key: string, config: { maxRequests: number; windowMs: number }) {
  for (let i = 0; i < config.maxRequests; i += 1) {
    expect(limits.checkRateLimit(key, config as never).allowed).toBe(true);
  }
  expect(limits.checkRateLimit(key, config as never).allowed).toBe(false);
}

describe('failure history keeps its established retention (login lockout)', () => {
  const SECOND = 1000;
  const login = () => limits.RATE_LIMIT_CONFIGS.LOGIN; // 5 per minute, lockout at 15 failures, 15 minutes

  /** One failed attempt every `gapSeconds`, the way a slow guesser spreads attempts over cleanup ticks. */
  function failTimes(key: string, count: number, gapSeconds: number) {
    for (let i = 0; i < count; i += 1) {
      vi.advanceTimersByTime(gapSeconds * SECOND);
      limits.checkRateLimit(key, login());
      limits.recordFailure(key, login());
    }
  }

  it('slow failures that cross the five-minute cleanup ticks still reach the configured lockout', () => {
    const key = limits.getRateLimitKey('login_email', 'someone@example.test');
    // 15 failures, 100 s apart: every attempt opens a new one-minute window and the cleanup ticks
    // (every 5 minutes) land between attempts, when the entry is 1 to 2 minutes old.
    failTimes(key, 15, 100);
    expect(limits.checkRateLimit(key, login())).toMatchObject({ allowed: false, isLockedOut: true });
  });

  it('keeps failures at least five minutes, up to the first cleanup tick after that, then forgets them', () => {
    const key = limits.getRateLimitKey('login_email', 'someone-else@example.test');
    failTimes(key, 14, 10); // 14 failures within about two and a half minutes
    // Still remembered 7 minutes later: the cleanup tick at 5 minutes sees an entry younger than 5 minutes.
    vi.advanceTimersByTime(7 * MINUTE);
    limits.checkRateLimit(key, login());
    limits.recordFailure(key, login());
    expect(limits.checkRateLimit(key, login()).isLockedOut).toBe(true);

    // A separate key left alone for 11 minutes is forgotten: the 15th failure then does not lock out.
    const other = limits.getRateLimitKey('login_email', 'idle@example.test');
    failTimes(other, 14, 10);
    vi.advanceTimersByTime(11 * MINUTE);
    limits.checkRateLimit(other, login());
    limits.recordFailure(other, login());
    expect(limits.checkRateLimit(other, login()).isLockedOut).toBe(false);
  });
});

describe('windows longer than the five-minute cleanup keep their full length', () => {
  it('the per-recipient access-code budget (15 minutes) is not reset by cleanup before it ends', () => {
    const config = limits.RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY_RECIPIENT;
    const key = limits.getRateLimitKey('esigning_verify_recipient', 'recipient-1');
    // Start the window just before a cleanup tick so the entry is "old" at the next ones.
    vi.advanceTimersByTime(4 * MINUTE);
    const start = Date.now();
    exhaust(key, config);

    // Step through the cleanup ticks (at 5, 10 and 15 minutes) and check the budget stays spent.
    for (const elapsed of [MINUTE, 6 * MINUTE, 11 * MINUTE, 15 * MINUTE - 1000]) {
      vi.advanceTimersByTime(start + elapsed - Date.now());
      expect(limits.checkRateLimit(key, config).allowed, `still limited ${elapsed / 1000}s in`).toBe(false);
    }
    vi.advanceTimersByTime(1000);
    expect(limits.checkRateLimit(key, config).allowed).toBe(true);
  });

  it('the aggregate certificate lookup budget (10 minutes) lasts 10 minutes, then resets', () => {
    const config = limits.RATE_LIMIT_CONFIGS.ESIGNING_PUBLIC_LOOKUP_AGGREGATE;
    const key = limits.getRateLimitKey('esigning_lookup_aggregate', '203.0.113.9');
    vi.advanceTimersByTime(4 * MINUTE);
    const start = Date.now();
    exhaust(key, config);

    // Let the real cleanup interval run through the whole window.
    vi.advanceTimersByTime(10 * MINUTE - 1000);
    expect(Date.now() - start).toBe(10 * MINUTE - 1000);
    expect(limits.checkRateLimit(key, config).allowed).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(limits.checkRateLimit(key, config).allowed).toBe(true);
  });

  it('a 15 minute budget survives the cleanup ticks at 5 and 10 minutes, and ends at 15', () => {
    const config = limits.RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY_RECIPIENT;
    const key = limits.getRateLimitKey('esigning_verify_recipient', 'recipient-2');
    exhaust(key, config);
    vi.advanceTimersByTime(14 * MINUTE + 59 * 1000);
    expect(limits.checkRateLimit(key, config).allowed).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(limits.checkRateLimit(key, config).allowed).toBe(true);
  });

  it('a lockout outlives its window and cleanup, and an expired short window is still cleaned up', () => {
    const config = limits.RATE_LIMIT_CONFIGS.ESIGNING_SIGN_VERIFY_RECIPIENT;
    const key = limits.getRateLimitKey('esigning_verify_recipient', 'recipient-3');
    for (let i = 0; i < config.lockoutThreshold!; i += 1) {
      limits.checkRateLimit(key, config);
      limits.recordFailure(key, config);
    }
    vi.advanceTimersByTime(29 * MINUTE);
    expect(limits.checkRateLimit(key, config)).toMatchObject({ allowed: false, isLockedOut: true });
    vi.advanceTimersByTime(MINUTE + 1000);
    expect(limits.checkRateLimit(key, config).isLockedOut).toBe(false);

    // One-minute windows are removed once over (the store does not grow without bound).
    const short = { maxRequests: 1, windowMs: MINUTE };
    limits.checkRateLimit('short:key', short);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(limits.getRateLimitStatus('short:key', short).remaining).toBe(1);
  });
});
