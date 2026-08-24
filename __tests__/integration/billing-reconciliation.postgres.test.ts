import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { reconcileClientServiceBilling } from '@/services/billing';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../prisma/migrations');
const billingTrackingMigration = '20260817110000_billing_tracking';
const describePostgres = testDatabaseUrl ? describe : describe.skip;

if (process.env.CI === 'true' && !testDatabaseUrl) {
  describe('billing reconciliation PostgreSQL configuration', () => {
    it('requires TEST_DATABASE_URL in CI', () => {
      throw new Error('TEST_DATABASE_URL must reference an isolated PostgreSQL test database in CI');
    });
  });
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error(`Unsafe PostgreSQL identifier: ${value}`);
  return `"${value}"`;
}

function isolateMigrationSql(sql: string, schemaName: string): string {
  const schema = quoteIdentifier(schemaName);
  return sql
    .replaceAll('"public".', `${schema}.`)
    .replaceAll("'public.", `'${schemaName}.`)
    .replaceAll('public.', `${schemaName}.`);
}

async function applyMigration(client: PoolClient, schemaName: string, migrationDirectory: string): Promise<void> {
  const sql = readFileSync(resolve(migrationRoot, migrationDirectory, 'migration.sql'), 'utf8');
  const schema = quoteIdentifier(schemaName);
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    await client.query(isolateMigrationSql(sql, schemaName));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function applyMigrationsBefore(client: PoolClient, schemaName: string, target: string): Promise<void> {
  const directories = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const targetIndex = directories.indexOf(target);
  if (targetIndex < 1) throw new Error(`Missing migration ${target}`);
  for (const directory of directories.slice(0, targetIndex)) {
    await applyMigration(client, schemaName, directory);
  }
}

describePostgres('billing reconciliation PostgreSQL integration', () => {
  let setupPool: Pool | undefined;
  let setupClient: PoolClient | undefined;
  let prismaPool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let schemaName: string | undefined;

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaPool?.end();
    if (setupClient && schemaName) await setupClient.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    setupClient?.release();
    await setupPool?.end();
  });

  it('creates one row per billing identity under concurrent retries in an isolated schema', async () => {
    setupPool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
    setupClient = await setupPool.connect();
    schemaName = `billing_reconcile_${randomUUID().replaceAll('-', '')}`;
    const schema = quoteIdentifier(schemaName);
    const table = (name: string) => `${schema}."${name}"`;

    try {
      await setupClient.query(`CREATE SCHEMA ${schema}`);
      await applyMigrationsBefore(setupClient, schemaName, billingTrackingMigration);
      await applyMigration(setupClient, schemaName, billingTrackingMigration);
      await setupClient.query(`
        INSERT INTO ${table('tenants')} ("id", "name", "slug", "status", "updatedAt")
        VALUES ('tenant-reconcile', 'Reconcile Tenant', 'billing-reconcile-${schemaName}', 'ACTIVE', TIMESTAMP '2026-08-18 00:00:00');
        INSERT INTO ${table('users')}
          ("id", "email", "passwordHash", "firstName", "lastName", "updatedAt", "tenantId")
        VALUES ('user-reconcile', 'billing-reconcile-${schemaName}@example.test', 'hash', 'Billing', 'Worker', TIMESTAMP '2026-08-18 00:00:00', 'tenant-reconcile');
        INSERT INTO ${table('template_partials')}
          ("id", "tenant_id", "name", "content", "created_by_id", "updated_at")
        VALUES ('partial-reconcile', 'tenant-reconcile', 'Billing partial', '<p>billing</p>', 'user-reconcile', TIMESTAMP '2026-08-18 00:00:00');
        INSERT INTO ${table('service_families')}
          ("id", "tenant_id", "code", "name", "description", "display_order", "updated_at")
        VALUES ('family-reconcile', 'tenant-reconcile', 'BILLING', 'Billing', 'Billing services', 0, TIMESTAMP '2026-08-18 00:00:00');
        INSERT INTO ${table('service_variants')}
          ("id", "tenant_id", "family_id", "sow_partial_id", "code", "name", "service_cadence", "updated_at")
        VALUES ('variant-reconcile', 'tenant-reconcile', 'family-reconcile', 'partial-reconcile', 'BILLING_MONTHLY', 'Billing monthly', 'MONTHLY', TIMESTAMP '2026-08-18 00:00:00');
        INSERT INTO ${table('companies')}
          ("id", "tenantId", "uen", "name", "updatedAt")
        VALUES ('company-reconcile', 'tenant-reconcile', 'UEN-RECONCILE', 'Reconcile Company', TIMESTAMP '2026-08-18 00:00:00');
        INSERT INTO ${table('client_services')}
          ("id", "tenant_id", "company_id", "source", "service_variant_id", "family_name", "service_name",
           "status", "service_cadence", "start_date", "billing_disposition", "updated_at")
        VALUES ('service-reconcile', 'tenant-reconcile', 'company-reconcile', 'MANUAL', 'variant-reconcile', 'Billing', 'Billing monthly',
                'ACTIVE', 'MONTHLY', DATE '2026-01-01', 'CONFIGURED', TIMESTAMP '2026-08-18 00:00:00');
        INSERT INTO ${table('client_service_fee_lines')}
          ("id", "tenant_id", "client_service_id", "description", "amount", "currency", "billing_frequency", "billing_start_date", "schedule_config", "updated_at")
        VALUES ('fee-reconcile', 'tenant-reconcile', 'service-reconcile', 'Monthly fee', 125.00, 'SGD', 'MONTHLY', DATE '2026-08-01',
          '{"schemaVersion":1,"cadence":"MONTHLY","startDate":"2026-08-01","customInterval":{"unit":"MONTH","count":1},"scheduleEntries":[{"key":"default","label":"Billing date","expression":{"kind":"DAY_OF_MONTH","day":1},"businessDayAdjustment":"NONE"}]}'::jsonb,
          TIMESTAMP '2026-08-18 00:00:00');
      `);

      // pg's options parameter applies search_path to every connection opened
      // by the Prisma adapter, keeping the run isolated from public data.
      prismaPool = new Pool({
        connectionString: testDatabaseUrl,
        max: 4,
        options: `-c search_path=${schemaName},public`,
      });
      prisma = new PrismaClient({ adapter: new PrismaPg(prismaPool) });

      const input = {
        tenantId: 'tenant-reconcile',
        clientServiceId: 'service-reconcile',
        today: '2026-08-18' as const,
        horizonEnd: '2027-08-18' as const,
        writeMode: 'APPLY' as const,
        reconciliationRequestId: 'request-reconcile',
        cancellationActorId: 'user-reconcile',
      };
      const results = await Promise.all([
        reconcileClientServiceBilling(input, prisma),
        reconcileClientServiceBilling(input, prisma),
      ]);

      const occurrences = await prisma.billingOccurrence.findMany({
        where: { tenantId: input.tenantId, clientServiceId: input.clientServiceId },
        select: { billingPeriodKey: true, scheduleEntryKey: true, generationKey: true },
      });
      expect(occurrences).toHaveLength(12);
      expect(results.reduce((total, result) => total + result.created, 0)).toBe(12);

      const duplicateIdentities = await setupClient.query(`
        SELECT "billing_period_key", "schedule_entry_key", "generation_key", count(*)::int AS count
        FROM ${table('billing_occurrences')}
        WHERE "tenant_id" = 'tenant-reconcile' AND "client_service_id" = 'service-reconcile'
        GROUP BY "billing_period_key", "schedule_entry_key", "generation_key"
        HAVING count(*) > 1
      `);
      expect(duplicateIdentities.rows).toEqual([]);
    } finally {
      await prisma?.$disconnect();
      prisma = undefined;
      await prismaPool?.end();
      prismaPool = undefined;
      await setupClient.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      schemaName = undefined;
    }
  });
});
