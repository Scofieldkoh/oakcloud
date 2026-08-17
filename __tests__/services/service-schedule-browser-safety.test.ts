import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('service schedule public barrel browser safety', () => {
  it('does not expose Node-only imports through the public index/hash graph', () => {
    const root = resolve(process.cwd(), 'src/services/service-schedule');
    const source = ['index.ts', 'hash.ts']
      .map((file) => readFileSync(resolve(root, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/node:/i);
    expect(source).not.toMatch(/from\s+['"](?:node:)?crypto['"]/i);
  });
});
