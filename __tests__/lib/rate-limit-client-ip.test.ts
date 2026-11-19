// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logMocks = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => logMocks }));

import { __resetTrustedProxyWarning, getClientIp, getTrustedProxyConfig } from '@/lib/rate-limit';

function requestWith(headers: Record<string, string>) {
  return new Request('http://localhost/x', { headers });
}

const saved = { mode: process.env.TRUSTED_PROXY, hops: process.env.TRUSTED_PROXY_HOPS };

beforeEach(() => {
  delete process.env.TRUSTED_PROXY;
  delete process.env.TRUSTED_PROXY_HOPS;
  __resetTrustedProxyWarning();
  vi.clearAllMocks();
});

afterEach(() => {
  if (saved.mode === undefined) delete process.env.TRUSTED_PROXY;
  else process.env.TRUSTED_PROXY = saved.mode;
  if (saved.hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
  else process.env.TRUSTED_PROXY_HOPS = saved.hops;
});

describe('getClientIp with the default setting (X-Forwarded-For, one trusted hop)', () => {
  it('takes the entry the proxy appended, the last one', () => {
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(getClientIp(requestWith({ 'x-forwarded-for': '198.51.100.1, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('ignores what the client put on the left: changing the leftmost entry does not change the address', () => {
    const a = getClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }));
    const b = getClientIp(requestWith({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3, 203.0.113.9' }));
    expect(a).toBe('203.0.113.9');
    expect(b).toBe('203.0.113.9');
  });

  it('does not read X-Real-IP or CF-Connecting-IP', () => {
    expect(getClientIp(requestWith({ 'x-real-ip': '198.51.100.7' }))).toBe('unknown');
    expect(getClientIp(requestWith({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('unknown');
    expect(
      getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.7' }))
    ).toBe('203.0.113.9');
  });

  it('answers unknown without a header, and for an entry that is not an address', () => {
    expect(getClientIp(requestWith({}))).toBe('unknown');
    expect(getClientIp(requestWith({ 'x-forwarded-for': 'not an ip' }))).toBe('unknown');
    expect(getClientIp(requestWith({ 'x-forwarded-for': `${'a'.repeat(5000)}` }))).toBe('unknown');
    expect(getClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1, <script>' }))).toBe('unknown');
  });

  it('accepts IPv6 addresses', () => {
    expect(getClientIp(requestWith({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('warns once that the proxy setting is not configured', () => {
    getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }));
    getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }));

    expect(logMocks.warn).toHaveBeenCalledTimes(1);
    expect(String(logMocks.warn.mock.calls[0][0])).toContain('TRUSTED_PROXY');
  });
});

describe('TRUSTED_PROXY_HOPS', () => {
  it('counts that many entries from the right', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(getClientIp(requestWith({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9');
  });

  it('answers unknown, not the nearest entry, when the request has fewer entries than the configured hops', () => {
    process.env.TRUSTED_PROXY_HOPS = '3';
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }))).toBe('unknown');
    expect(getClientIp(requestWith({ 'x-forwarded-for': '198.51.100.1, 203.0.113.9' }))).toBe('unknown');
    // A complete chain still resolves the entry the outermost trusted proxy wrote.
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.9');
  });

  it('a chain one entry short of two hops is not trusted, whatever the one entry says', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }))).toBe('unknown');
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('a short chain cannot be used to pick a client address: every spoofed single entry is the same unknown', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    const a = getClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1' }));
    const b = getClientIp(requestWith({ 'x-forwarded-for': '2.2.2.2' }));
    expect([a, b]).toEqual(['unknown', 'unknown']);
  });

  it.each(['0', '6', '-1', '1.5', 'two', ''])('falls back to the defaults and logs an error for %j', (hops) => {
    process.env.TRUSTED_PROXY = 'xff';
    process.env.TRUSTED_PROXY_HOPS = hops;
    const config = getTrustedProxyConfig();

    if (hops === '') {
      expect(config).toEqual({ mode: 'xff', hops: 1 });
    } else {
      expect(config).toEqual({ mode: 'xff', hops: 1 });
      expect(logMocks.error).toHaveBeenCalledTimes(1);
    }
  });
});

describe('TRUSTED_PROXY=cloudflare', () => {
  beforeEach(() => {
    process.env.TRUSTED_PROXY = 'cloudflare';
  });

  it('uses CF-Connecting-IP and ignores X-Forwarded-For', () => {
    expect(
      getClientIp(requestWith({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))
    ).toBe('203.0.113.9');
  });

  it('answers unknown when the header is missing or not an address, never falling back to X-Forwarded-For', () => {
    expect(getClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1' }))).toBe('unknown');
    expect(getClientIp(requestWith({ 'cf-connecting-ip': 'garbage value' }))).toBe('unknown');
  });

  it('does not warn about a missing setting', () => {
    getClientIp(requestWith({ 'cf-connecting-ip': '203.0.113.9' }));
    expect(logMocks.warn).not.toHaveBeenCalled();
  });
});

describe('an invalid TRUSTED_PROXY', () => {
  it('logs an error once and uses the defaults', () => {
    process.env.TRUSTED_PROXY = 'nginx';
    expect(getClientIp(requestWith({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }))).toBe('203.0.113.9');
    getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }));

    expect(logMocks.error).toHaveBeenCalledTimes(1);
  });
});
