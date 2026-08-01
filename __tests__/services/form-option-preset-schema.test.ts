import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('form option preset Prisma schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('stores workspace presets and links dropdown fields to them', () => {
    expect(schema).toContain('model FormOptionPreset');
    expect(schema).toContain('optionPresetId');
    expect(schema).toContain('@@unique([tenantId, normalizedKey])');
    expect(schema).toContain('options          Json');
    expect(schema).toContain('onDelete: Restrict');
  });
});
