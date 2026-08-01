import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('service agreement draft schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('stores normalized draft selections beside generated documents', () => {
    for (const model of [
      'ServiceAgreement',
      'ServiceAgreementEntity',
      'ServiceAgreementItem',
      'ServiceAgreementItemEntity',
      'ServiceAgreementFeeLine',
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toContain('generatedDocumentId String @unique');
    expect(schema).toContain('@@unique([itemId, agreementEntityId])');
  });
});
