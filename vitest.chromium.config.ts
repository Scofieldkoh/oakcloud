import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Browser-driven tests that need a real Chrome (`npm run test:chromium`). They are excluded from
 * `npm run test:run`, which has no browser requirement.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: { TZ: 'Asia/Singapore' },
    include: ['__tests__/chromium/**/*.chromium.test.ts'],
    maxWorkers: 1,
    testTimeout: 90_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
