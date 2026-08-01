import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('client service activation schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260730110000_client_services_activation/migration.sql'), 'utf8');

  it('defines idempotent entity-level operational services', () => {
    expect(schema).toContain('enum ClientServiceStatus');
    expect(schema).toContain('enum ServiceAgreementActivationStatus');
    expect(schema).toContain('model ClientService');
    expect(schema).toContain('model ClientServiceFeeLine');
    expect(schema).toContain('@@unique([agreementItemId, companyId])');
    expect(schema).toContain('activationStatus');
    expect(schema).toContain('ServiceAgreementActivationStatus');
    expect(schema).toContain('activationClaimToken');
  });

  it('keeps queue indexes partial and migration-managed', () => {
    expect(schema).not.toContain('@@index([activationStatus, activationAvailableAt])');
    expect(schema).not.toContain('@@index([activationStatus, activationLeaseExpiresAt])');
    expect(migration).toContain('CREATE INDEX "service_agreements_activation_available_claim_idx" ON "service_agreements"("activation_available_at", "id") WHERE "activation_status" IN (\'PENDING\', \'FAILED_RETRYABLE\');');
    expect(migration).toContain('CREATE INDEX "service_agreements_activation_expired_lease_idx" ON "service_agreements"("activation_lease_expires_at", "id") WHERE "activation_status" = \'PROCESSING\';');
  });
});
