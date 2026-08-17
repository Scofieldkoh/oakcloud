import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (process.env.CI === 'true' && !testDatabaseUrl) {
  describe('deadline engine migration PostgreSQL configuration', () => {
    it('requires TEST_DATABASE_URL in CI', () => {
      throw new Error('TEST_DATABASE_URL must reference an isolated PostgreSQL test database in CI');
    });
  });
}

const describePostgres = testDatabaseUrl ? describe : describe.skip;
const migrationSql = readFileSync(
  resolve(process.cwd(), 'prisma/migrations/20260817100000_deadline_rule_engine/migration.sql'),
  'utf8',
);

describePostgres('deadline engine migration PostgreSQL integration', () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  let schemaName: string | undefined;

  afterAll(async () => {
    if (client && schemaName) {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    client?.release();
    await pool?.end();
  });

  it('applies to the prior schema, preserves records, seeds calendars, and enforces invariants', async () => {
    pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
    client = await pool.connect();
    schemaName = `deadline_engine_${randomUUID().replaceAll('-', '')}`;
    const schema = `"${schemaName}"`;
    const table = (name: string) => `${schema}."${name}"`;

    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`
        CREATE TABLE ${table('tenants')} (id TEXT PRIMARY KEY, name TEXT NOT NULL);
        CREATE TABLE ${table('users')} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
        CREATE TABLE ${table('companies')} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL);
        CREATE TABLE ${table('service_variants')} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL);
        CREATE TABLE ${table('client_services')} (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, company_id TEXT NOT NULL, service_variant_id TEXT NOT NULL, service_name TEXT NOT NULL);
      `);

      await client.query(`
        INSERT INTO ${table('tenants')} (id, name) VALUES ('tenant-a', 'Tenant A'), ('tenant-b', 'Tenant B');
        INSERT INTO ${table('users')} (id, tenant_id) VALUES ('user-a', 'tenant-a');
        INSERT INTO ${table('companies')} (id, tenant_id, name) VALUES ('company-a', 'tenant-a', 'Company A');
        INSERT INTO ${table('service_variants')} (id, tenant_id, name) VALUES ('variant-a', 'tenant-a', 'Variant A');
        INSERT INTO ${table('client_services')} (id, tenant_id, company_id, service_variant_id, service_name)
        VALUES ('client-service-a', 'tenant-a', 'company-a', 'variant-a', 'Service A');
      `);

      const beforeTenants = await client.query(`SELECT id, name FROM ${table('tenants')} ORDER BY id`);
      const beforeCompanies = await client.query(`SELECT id, tenant_id, name FROM ${table('companies')} ORDER BY id`);
      const beforeVariants = await client.query(`SELECT id, tenant_id, name FROM ${table('service_variants')} ORDER BY id`);
      const beforeClientServices = await client.query(`
        SELECT id, tenant_id, company_id, service_variant_id, service_name
        FROM ${table('client_services')} ORDER BY id
      `);

      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${schema}, public`);
      await client.query(migrationSql);
      await client.query('COMMIT');
      await client.query(`SET search_path TO ${schema}, public`);

      await expect(client.query(`SELECT id, name FROM ${table('tenants')} ORDER BY id`)).resolves.toMatchObject({ rows: beforeTenants.rows });
      await expect(client.query(`SELECT id, tenant_id, name FROM ${table('companies')} ORDER BY id`)).resolves.toMatchObject({ rows: beforeCompanies.rows });
      await expect(client.query(`SELECT id, tenant_id, name FROM ${table('service_variants')} ORDER BY id`)).resolves.toMatchObject({ rows: beforeVariants.rows });
      await expect(client.query(`
        SELECT id, tenant_id, company_id, service_variant_id, service_name
        FROM ${table('client_services')} ORDER BY id
      `)).resolves.toMatchObject({ rows: beforeClientServices.rows });

      const indexes = await client.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename IN ('deadline_rule_versions', 'service_schedule_reconciliation_requests')`,
        [schemaName],
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
        'deadline_rule_versions_one_draft_idx',
        'service_schedule_reconciliation_claim_idx',
        'service_schedule_reconciliation_expired_lease_idx',
      ]));

      const constraints = await client.query(
        `SELECT conname FROM pg_constraint WHERE connamespace = $1::regnamespace`,
        [schemaName],
      );
      expect(constraints.rows.map((row) => row.conname)).toEqual(expect.arrayContaining([
        'deadline_occurrences_override_consistency',
        'deadline_occurrences_completion_consistency',
        'deadline_occurrences_waiver_consistency',
        'deadline_occurrences_cancellation_consistency',
        'deadline_occurrences_stable_keys_nonempty',
        'service_cycles_generation_key_nonempty',
      ]));

      const calendars = await client.query(`
        SELECT tenant_id, time_zone, revision, weekend_days, is_active
        FROM ${table('business_calendars')}
        WHERE is_active = TRUE
        ORDER BY tenant_id
      `);
      expect(calendars.rows).toEqual([
        { tenant_id: 'tenant-a', time_zone: 'Asia/Singapore', revision: 1, weekend_days: [0, 6], is_active: true },
        { tenant_id: 'tenant-b', time_zone: 'Asia/Singapore', revision: 1, weekend_days: [0, 6], is_active: true },
      ]);
      expect((await client.query(`SELECT count(*)::int AS count FROM ${table('business_holidays')}`)).rows[0].count).toBe(0);

      const ruleId = 'rule-a';
      await client.query(`
        INSERT INTO ${table('deadline_rules')} (id, tenant_id, code, name) VALUES ($1, 'tenant-a', 'RULE_A', 'Rule A');
        INSERT INTO ${table('deadline_rule_versions')}
          (id, tenant_id, rule_id, version, state, schema_version, recurrence, applicability, config_hash)
        VALUES ('version-draft-1', 'tenant-a', $1, 1, 'DRAFT', 1, '{}', '{}', 'hash-a')
      `, [ruleId]);
      await expect(
        client.query(`
          INSERT INTO ${table('deadline_rule_versions')}
            (id, tenant_id, rule_id, version, state, schema_version, recurrence, applicability, config_hash)
          VALUES ('version-draft-2', 'tenant-a', $1, 2, 'DRAFT', 1, '{}', '{}', 'hash-b')
        `, [ruleId]),
      ).rejects.toThrow();

      const occurrenceBase = {
        id: 'occurrence-a', tenantId: 'tenant-a', companyId: 'company-a', clientServiceId: 'client-service-a',
        cycleId: 'cycle-a', ruleVersionId: 'version-draft-1', deadlineType: 'CLIENT',
        calculatedDueDate: '2026-08-20', operativeDueDate: '2026-08-20', status: 'OPEN',
      };
      await client.query(`
        INSERT INTO ${table('service_cycles')}
          (id, tenant_id, company_id, client_service_id, rule_id, rule_version_id, period_key, period_start, period_end, generation_key, origin, recurrence_anchor, source_snapshot, evaluation_hash)
        VALUES ('cycle-a', 'tenant-a', 'company-a', 'client-service-a', 'rule-a', 'version-draft-1', '2026', '2026-01-01', '2026-12-31', 'generation-a', 'RULE', '{}', '{}', 'hash-cycle')
      `);
      await expect(
        client.query(`
          INSERT INTO ${table('deadline_occurrences')}
            (id, tenant_id, company_id, client_service_id, cycle_id, rule_version_id, milestone_key, schedule_entry_key, deadline_type, calculated_due_date, operative_due_date, status)
          VALUES ('occurrence-invalid', $1, $2, $3, $4, $5, '', '', $6, $7, $7, $8)
        `, [occurrenceBase.tenantId, occurrenceBase.companyId, occurrenceBase.clientServiceId, occurrenceBase.cycleId, occurrenceBase.ruleVersionId, occurrenceBase.deadlineType, occurrenceBase.calculatedDueDate, occurrenceBase.status]),
      ).rejects.toThrow();

      await expect(
        client.query(`
          INSERT INTO ${table('deadline_occurrences')}
            (id, tenant_id, company_id, client_service_id, cycle_id, rule_version_id, milestone_key, schedule_entry_key, deadline_type, calculated_due_date, operative_due_date, status)
          VALUES ('occurrence-completed-invalid', $1, $2, $3, $4, $5, 'milestone-a', '', $6, $7, $7, 'COMPLETED')
        `, [occurrenceBase.tenantId, occurrenceBase.companyId, occurrenceBase.clientServiceId, occurrenceBase.cycleId, occurrenceBase.ruleVersionId, occurrenceBase.deadlineType, occurrenceBase.calculatedDueDate]),
      ).rejects.toThrow();

      await client.query(`
        INSERT INTO ${table('service_schedule_reconciliation_requests')}
          (id, tenant_id, scope_type, scope_id, trigger_type, correlation_id, dedupe_key, status, next_attempt_at)
        VALUES ('request-a', 'tenant-a', 'TENANT', 'tenant-a', 'TEST', 'correlation-a', 'dedupe-a', 'PENDING', CURRENT_TIMESTAMP)
      `);
      await expect(
        client.query(`
          INSERT INTO ${table('service_schedule_reconciliation_requests')}
            (id, tenant_id, scope_type, scope_id, trigger_type, correlation_id, dedupe_key, status, next_attempt_at)
          VALUES ('request-duplicate', 'tenant-a', 'TENANT', 'tenant-a', 'TEST', 'correlation-b', 'dedupe-a', 'PENDING', CURRENT_TIMESTAMP)
        `),
      ).rejects.toThrow();
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      schemaName = undefined;
    }
  });
});
