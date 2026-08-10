import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const required = ['A4_SMOKE_URL', 'A4_SMOKE_EXISTING_URL'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required smoke environment: ${missing.join(', ')}`);
  process.exit(1);
}

const vitestCli = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url),
);
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', '__tests__/app/a4-editor-route-smoke.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, A4_SMOKE_REQUIRED: '1' },
  },
);
process.exit(result.status ?? 1);
