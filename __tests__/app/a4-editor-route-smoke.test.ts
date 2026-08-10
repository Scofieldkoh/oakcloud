import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const smokeUrl = process.env.A4_SMOKE_URL;
const existingUrl = process.env.A4_SMOKE_EXISTING_URL;
const smokeRequired = process.env.A4_SMOKE_REQUIRED === '1';

function recentAppLogs(): string {
  return execFileSync(
    'docker',
    ['compose', 'logs', '--no-color', '--tail', '300', 'app'],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
}

function requireSmokeEnvironment(): void {
  if (!smokeRequired) return;
  const missing = ['A4_SMOKE_URL', 'A4_SMOKE_EXISTING_URL'].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    throw new Error(`Missing required smoke environment: ${missing.join(', ')}`);
  }
}

describe.skipIf(!smokeUrl && !smokeRequired)(
  'A4 editor production-route smoke',
  () => {
  it('serves the template editor without server-render errors', async () => {
    requireSmokeEnvironment();
    const response = await fetch(`${smokeUrl}/template-partials/editor`);
    expect(response.status).toBeLessThan(500);
    await response.text();
    if (existingUrl) {
      const existingResponse = await fetch(existingUrl);
      expect(existingResponse.status).toBeLessThan(500);
      await existingResponse.text();
    }
  }, 30_000);

  it('keeps the app container free of editor-origin SSR errors', () => {
    requireSmokeEnvironment();
    const logs = recentAppLogs();
    expect(logs).not.toMatch(/document is not defined/);
    expect(logs).not.toMatch(/2292164445/);
    expect(logs).not.toMatch(/React.*#419|#419.*React/);
    expect(logs).not.toMatch(/ReferenceError/);
    expect(logs).not.toMatch(/TypeError/);
  });
  },
);
