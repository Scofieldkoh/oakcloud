import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const smokeUrl = process.env.A4_SMOKE_URL;

function recentAppLogs(): string {
  return execFileSync(
    'docker',
    ['compose', 'logs', '--no-color', '--tail', '300', 'app'],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
}

describe.skipIf(!smokeUrl)('A4 editor production-route smoke', () => {
  it('serves the template editor without server-render errors', async () => {
    const response = await fetch(`${smokeUrl}/template-partials/editor`);
    expect(response.status).toBeLessThan(500);
    await response.text();
  }, 30_000);

  it('keeps the app container free of editor-origin SSR errors', () => {
    const logs = recentAppLogs();
    expect(logs).not.toMatch(/document is not defined/);
    expect(logs).not.toMatch(/2292164445/);
    expect(logs).not.toMatch(/React.*#419|#419.*React/);
  });
});
