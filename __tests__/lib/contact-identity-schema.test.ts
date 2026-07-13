import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('contact identity Prisma schema', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const migration = readFileSync(
    'prisma/migrations/20260714090000_contact_identity_and_merge/migration.sql',
    'utf8',
  );

  it('stores canonical names, counterparty identity, decisions, and merge ledgers', () => {
    expect(schema).toContain('canonicalName');
    expect(schema).toContain('counterpartyIdentity');
    expect(schema).toContain('model ContactDuplicateDecision');
    expect(schema).toContain('model ContactMergeOperation');
    expect(schema).toMatch(/enum AuditAction[\s\S]*\bMERGE\b/);
  });

  it('uses the mapped database names and adds the merge audit action', () => {
    expect(migration).toMatch(/ALTER TABLE "contacts" ADD COLUMN "canonicalName" TEXT/);
    expect(migration).toMatch(
      /ALTER TABLE "document_revisions" ADD COLUMN "counterparty_identity" JSONB/,
    );
    expect(migration).toMatch(/CREATE TABLE "contact_duplicate_decisions"/);
    expect(migration).toMatch(/CREATE TABLE "contact_merge_operations"/);
    expect(migration).toMatch(/ALTER TYPE "AuditAction" ADD VALUE 'MERGE'/);
  });

  it('installs exact and fuzzy canonical-name indexes', () => {
    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    expect(migration).toMatch(
      /CREATE INDEX "contacts_tenantId_contactType_deletedAt_canonicalName_idx"\s+ON "contacts"\("tenantId", "contactType", "deletedAt", "canonicalName"\)/,
    );
    expect(migration).toMatch(
      /CREATE INDEX "contacts_canonicalName_active_trgm_idx"\s+ON "contacts" USING GIN \("canonicalName" gin_trgm_ops\)\s+WHERE "deletedAt" IS NULL AND "canonicalName" IS NOT NULL/,
    );
  });

  it('enforces tenant-scoped decision and idempotency keys', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "contact_duplicate_decisions_tenantId_leftContactId_rightContactId_key"\s+ON "contact_duplicate_decisions"\("tenantId", "leftContactId", "rightContactId"\)/,
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "contact_merge_operations_tenantId_idempotencyKey_key"\s+ON "contact_merge_operations"\("tenantId", "idempotencyKey"\)/,
    );
  });

  it('makes the merge ledger append-only at the database boundary', () => {
    expect(migration).toMatch(
      /CREATE FUNCTION "prevent_contact_merge_operation_mutation"\(\)\s+RETURNS TRIGGER/,
    );
    expect(migration).toMatch(
      /CREATE FUNCTION "prevent_contact_merge_operation_mutation"\(\)[\s\S]*RAISE EXCEPTION 'contact_merge_operations is append-only'/,
    );
    expect(migration).toMatch(
      /CREATE TRIGGER "contact_merge_operations_append_only"\s+BEFORE UPDATE OR DELETE ON "contact_merge_operations"\s+FOR EACH ROW\s+EXECUTE FUNCTION "prevent_contact_merge_operation_mutation"\(\)/,
    );
  });
});
