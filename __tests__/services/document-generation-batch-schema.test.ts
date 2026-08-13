import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const migration = readFileSync(
  'prisma/migrations/20260812010000_document_generation_batches/migration.sql',
  'utf8',
);

describe('document generation batch schema', () => {
  it('defines aggregate, item, status, ordering, and unique output ownership', () => {
    expect(schema).toContain('model DocumentGenerationBatch {');
    expect(schema).toContain('model DocumentGenerationBatchItem {');
    expect(schema).toContain('@@unique([batchId, templateId])');
    expect(schema).toContain('generatedDocumentId String');
    expect(schema).toContain('@unique @map("generated_document_id")');
    expect(schema).toContain('enum DocumentGenerationBatchItemStatus');
    expect(migration).toContain('CREATE TABLE "document_generation_batches"');
    expect(migration).toContain('CREATE TABLE "document_generation_batch_items"');
  });
});
