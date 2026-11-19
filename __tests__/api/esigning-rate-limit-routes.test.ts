// @vitest-environment node
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimitStore } from '@/lib/rate-limit';

/**
 * OAK-011: the public e-signing limits hold when the client changes X-Forwarded-For or the target ID, and
 * signers behind one address do not share a bucket. These tests use the real rate limiter and the real
 * route handlers; only the services behind them are replaced.
 */

const mocks = vi.hoisted(() => ({
  sessionClaims: null as { recipientId: string } | null,
  challengeClaims: null as { recipientId: string } | null,
  verifyAccessCode: vi.fn(),
  saveFieldValues: vi.fn(),
  getVerificationData: vi.fn(),
  findIssuedArtifactMatch: vi.fn(),
}));

vi.mock('@/lib/esigning-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/esigning-session')>()),
  getEsigningSessionClaims: vi.fn(async () => mocks.sessionClaims),
  getEsigningChallengeClaims: vi.fn(async () => mocks.challengeClaims),
}));
vi.mock('@/services/esigning-signing.service', () => ({
  verifyEsigningAccessCode: mocks.verifyAccessCode,
  saveEsigningSigningFieldValues: mocks.saveFieldValues,
}));
vi.mock('@/services/esigning-certificate.service', () => ({
  getEsigningVerificationData: mocks.getVerificationData,
  findIssuedArtifactMatch: mocks.findIssuedArtifactMatch,
}));
vi.mock('@/lib/api/company-query', () => ({
  jsonWithServerTiming: (body: unknown) => Response.json(body),
}));

const PROXY_IP = '203.0.113.9';
const FIELD_ID = '6f1c1d4e-2b8a-4c63-9d8e-0a1b2c3d4e5f';

/** The proxy appends the address it saw as the last entry; everything before it is client-supplied. */
function viaProxy(clientIp: string, spoofedPrefix?: string) {
  return { 'x-forwarded-for': spoofedPrefix ? `${spoofedPrefix}, ${clientIp}` : clientIp };
}

function jsonRequest(path: string, method: string, body: unknown, headers: Record<string, string>) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  __resetRateLimitStore();
  mocks.sessionClaims = null;
  mocks.challengeClaims = null;
  mocks.verifyAccessCode.mockReset().mockRejectedValue(new Error('Invalid access code'));
  mocks.saveFieldValues.mockReset().mockResolvedValue({ ok: true });
  mocks.getVerificationData.mockReset().mockResolvedValue({ certificateId: 'x', documents: [] });
  mocks.findIssuedArtifactMatch.mockReset().mockResolvedValue({ matched: false, fileHash: 'h', documentId: null, artifact: null });
});

describe('access-code verification', () => {
  async function guess(clientIp: string, spoofedPrefix?: string) {
    const { POST } = await import('@/app/api/esigning/sign/session/verify/route');
    return POST(jsonRequest('/api/esigning/sign/session/verify', 'POST', { accessCode: '000000' }, viaProxy(clientIp, spoofedPrefix)));
  }

  it('is limited per address and recipient, and a changed X-Forwarded-For prefix does not reset it', async () => {
    mocks.challengeClaims = { recipientId: 'recipient-1' };
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push((await guess(PROXY_IP, `10.0.0.${attempt}`)).status);
    }

    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect(mocks.verifyAccessCode).toHaveBeenCalledTimes(5);
  });

  it('is limited per recipient from any address: ten failures, then a lockout whatever the source', async () => {
    mocks.challengeClaims = { recipientId: 'recipient-1' };
    const statuses: number[] = [];
    // Two guesses from each of six different addresses stay under the per-address limit.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      statuses.push((await guess(`198.51.100.${Math.floor(attempt / 2) + 1}`)).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400));
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(mocks.verifyAccessCode).toHaveBeenCalledTimes(10);

    // Even a never-seen address is locked out for this recipient, and the answer says why.
    const fresh = await guess('192.0.2.77');
    expect(fresh.status).toBe(429);
    expect((await fresh.json()).error).toBe('Too many attempts');
  });

  it('does not lock out a different recipient', async () => {
    mocks.challengeClaims = { recipientId: 'recipient-1' };
    for (let attempt = 0; attempt < 11; attempt += 1) await guess(`198.51.100.${attempt + 1}`);
    mocks.challengeClaims = { recipientId: 'recipient-2' };

    expect((await guess('192.0.2.50')).status).toBe(400);
  });

  it('accepts the right code after a few wrong ones', async () => {
    mocks.challengeClaims = { recipientId: 'recipient-1' };
    for (let attempt = 0; attempt < 4; attempt += 1) await guess(`198.51.100.${attempt + 1}`);
    mocks.verifyAccessCode.mockResolvedValueOnce(undefined);

    expect((await guess('192.0.2.1')).status).toBe(200);
  });
});

describe('autosave and other session routes', () => {
  async function save(clientIp: string) {
    const { PUT } = await import('@/app/api/esigning/sign/session/fields/route');
    return PUT(jsonRequest('/api/esigning/sign/session/fields', 'PUT', { values: [{ fieldDefinitionId: FIELD_ID, value: 'x' }] }, viaProxy(clientIp)));
  }

  it('allows real typing: 100 saves in a minute from one recipient', async () => {
    mocks.sessionClaims = { recipientId: 'recipient-1' };
    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect((await save(PROXY_IP)).status, `save ${attempt + 1}`).toBe(200);
    }
  });

  it('limits one recipient to 120 saves a minute', async () => {
    mocks.sessionClaims = { recipientId: 'recipient-1' };
    let last = 200;
    for (let attempt = 0; attempt < 121; attempt += 1) last = (await save(PROXY_IP)).status;

    expect(last).toBe(429);
    expect(mocks.saveFieldValues).toHaveBeenCalledTimes(120);
  });

  it('gives each recipient behind one office address their own allowance', async () => {
    mocks.sessionClaims = { recipientId: 'recipient-1' };
    for (let attempt = 0; attempt < 121; attempt += 1) await save(PROXY_IP);
    expect((await save(PROXY_IP)).status).toBe(429);

    mocks.sessionClaims = { recipientId: 'recipient-2' };
    expect((await save(PROXY_IP)).status).toBe(200);
  });

  it('is not reset by a changed X-Forwarded-For', async () => {
    mocks.sessionClaims = { recipientId: 'recipient-1' };
    for (let attempt = 0; attempt < 120; attempt += 1) await save(`198.51.100.${(attempt % 200) + 1}`);

    expect((await save('192.0.2.200')).status).toBe(429);
  });

  it('without a session falls back to the address, so a signed-out client is still limited', async () => {
    let last = 200;
    for (let attempt = 0; attempt < 121; attempt += 1) last = (await save(PROXY_IP)).status;
    expect(last).toBe(429);
    expect((await save('192.0.2.1')).status).toBe(200);
  });
});

describe('public certificate lookups', () => {
  async function lookup(kind: 'data' | 'bootstrap' | 'check', certificateId: string, clientIp: string, spoofedPrefix?: string) {
    const headers = viaProxy(clientIp, spoofedPrefix);
    const params = { params: Promise.resolve({ certificateId }) };
    if (kind === 'data') {
      const { GET } = await import('@/app/api/esigning/verify/[certificateId]/route');
      return GET(new Request(`http://localhost/api/esigning/verify/${certificateId}`, { headers }) as NextRequest, params);
    }
    if (kind === 'bootstrap') {
      const { GET } = await import('@/app/api/public-bootstrap/verify/[certificateId]/route');
      return GET(new Request(`http://localhost/api/public-bootstrap/verify/${certificateId}`, { headers }) as NextRequest, params);
    }
    const form = new FormData();
    form.set('file', new File(['%PDF'], 'a.pdf'));
    const serialised = new Response(form);
    const { POST } = await import('@/app/api/esigning/verify/[certificateId]/check/route');
    return POST(
      new Request(`http://localhost/api/esigning/verify/${certificateId}/check`, {
        method: 'POST',
        headers: { ...headers, 'content-type': serialised.headers.get('content-type') as string },
        body: new Uint8Array(await serialised.arrayBuffer()),
      }) as NextRequest,
      params
    );
  }

  it('limits one address across different certificate IDs (60 per 10 minutes)', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 62; index += 1) {
      statuses.push((await lookup('data', `OAK-ES-${index}`, PROXY_IP)).status);
    }

    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
    expect(mocks.getVerificationData).toHaveBeenCalledTimes(60);
  });

  it('is not reset by changing the X-Forwarded-For prefix as well as the ID', async () => {
    let last = 200;
    for (let index = 0; index < 61; index += 1) {
      last = (await lookup('data', `OAK-ES-${index}`, PROXY_IP, `10.1.${index}.1`)).status;
    }
    expect(last).toBe(429);
  });

  it('shares one allowance between the data, bootstrap and file-check routes', async () => {
    for (let index = 0; index < 20; index += 1) await lookup('data', `OAK-ES-A${index}`, PROXY_IP);
    for (let index = 0; index < 20; index += 1) await lookup('bootstrap', `OAK-ES-B${index}`, PROXY_IP);
    for (let index = 0; index < 20; index += 1) await lookup('check', `OAK-ES-C${index}`, PROXY_IP);

    expect((await lookup('data', 'OAK-ES-D', PROXY_IP)).status).toBe(429);
    expect((await lookup('bootstrap', 'OAK-ES-E', PROXY_IP)).status).toBe(429);
    expect((await lookup('check', 'OAK-ES-F', PROXY_IP)).status).toBe(429);
  });

  it('keeps the per-ID limit of 20 a minute', async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 22; index += 1) statuses.push((await lookup('data', 'OAK-ES-SAME', PROXY_IP, `10.2.${index}.1`)).status);

    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it('does not slow down other addresses', async () => {
    for (let index = 0; index < 61; index += 1) await lookup('data', `OAK-ES-${index}`, PROXY_IP);

    expect((await lookup('data', 'OAK-ES-0', '192.0.2.44')).status).toBe(200);
  });
});
