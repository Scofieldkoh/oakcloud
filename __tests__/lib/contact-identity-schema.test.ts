import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('contact identity Prisma schema', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');

  it('stores canonical names, counterparty identity, decisions, and merge ledgers', () => {
    expect(schema).toContain('canonicalName');
    expect(schema).toContain('counterpartyIdentity');
    expect(schema).toContain('model ContactDuplicateDecision');
    expect(schema).toContain('model ContactMergeOperation');
    expect(schema).toMatch(/enum AuditAction[\s\S]*\bMERGE\b/);
  });
});
