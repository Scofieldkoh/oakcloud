// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The prompt is a module-private constant; read the source so a reword cannot drop the guard rails.
const source = readFileSync(join(process.cwd(), 'src/services/bizfile/extractor.ts'), 'utf8');

describe('BizFile extraction prompt: date of birth', () => {
  it('asks for a date of birth only when printed, and never from the ID number', () => {
    expect(source).toContain('ONLY if a date of birth is explicitly printed for this individual');
    expect(source).toContain('ONLY if a date of birth is explicitly printed for this person');
    expect(source).toMatch(/Never (derive|infer)[^\n]*(NRIC|ID number)/);
    expect(source).toMatch(/Omit it when it is not printed/);
    expect(source.match(/"dateOfBirth": "YYYY-MM-DD/g)).toHaveLength(2);
  });
});
