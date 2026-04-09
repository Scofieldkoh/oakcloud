import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadGetAppBaseUrl(): Promise<() => string> {
  vi.resetModules();
  const mod = await import('@/lib/email');
  if ('getAppBaseUrl' in mod && typeof mod.getAppBaseUrl === 'function') {
    return mod.getAppBaseUrl;
  }
  return mod.default.getAppBaseUrl as () => string;
}

describe('getAppBaseUrl', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('honors EMAIL_APP_URL even when it points to localhost', async () => {
    process.env.NODE_ENV = 'development';
    process.env.EMAIL_APP_URL = 'http://localhost:3001/';
    process.env.NEXT_PUBLIC_APP_URL = 'https://service.oakcloud.app';

    const getAppBaseUrl = await loadGetAppBaseUrl();

    expect(getAppBaseUrl()).toBe('http://localhost:3001');
  });

  it('allows localhost NEXT_PUBLIC_APP_URL in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.EMAIL_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001/';

    const getAppBaseUrl = await loadGetAppBaseUrl();

    expect(getAppBaseUrl()).toBe('http://localhost:3001');
  });

  it('falls back to the production domain for localhost public URLs outside development', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001/';

    const getAppBaseUrl = await loadGetAppBaseUrl();

    expect(getAppBaseUrl()).toBe('https://service.oakcloud.app');
  });
});
