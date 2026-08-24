import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('billing tracking schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migrationPath = resolve(
    process.cwd(),
    'prisma/migrations/20260817110000_billing_tracking/migration.sql',
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

  const enumMembers = (name: string): string[] => {
    const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
    return match?.[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean) ?? [];
  };

  it('defines the billing disposition and occurrence models', () => {
    expect(schema).toContain('enum BillingDisposition');
    expect(schema).toContain('model BillingOccurrence');
    expect(schema).toContain('model BillingCoverageIssue');
    expect(schema).toContain('billingDisposition');
    expect(schema).toContain('scheduleConfig');
    expect(migration).toContain('billing_occurrences_identity_key');
    expect(migration).toContain('billing_coverage_issues_open_issue_key');
  });

  it.each([
    ['BillingDisposition', ['CONFIGURED', 'NOT_REQUIRED', 'UNREVIEWED']],
    ['BillingOccurrenceStatus', ['OPEN', 'BILLED', 'WAIVED', 'CANCELLED']],
    ['BillingCoverageIssueSeverity', ['ERROR', 'WARNING']],
    [
      'BillingCoverageIssueType',
      [
        'MISSING_DISPOSITION',
        'MISSING_FEE_LINES',
        'MISSING_START_DATE',
        'INVALID_CUSTOM_SCHEDULE',
        'MISSING_SCHEDULE_PARAMETER',
        'OCCURRENCE_GAP',
        'INVALID_AMOUNT_OR_CURRENCY',
      ],
    ],
  ] as const)('defines exact %s members', (name, expected) => {
    expect(enumMembers(name)).toEqual(expected);
  });

  it('preserves mapped fields, inverse relations, and identity indexes', () => {
    expect(schema).toMatch(/billingDisposition\s+BillingDisposition\s+@default\(UNREVIEWED\)\s+@map\("billing_disposition"\)/);
    expect(schema).toMatch(/billingNotRequiredReason\s+String\?\s+@map\("billing_not_required_reason"\)\s+@db\.VarChar\(500\)/);
    expect(schema).toMatch(/scheduleConfig\s+Json\?\s+@map\("schedule_config"\)/);
    expect(schema).toMatch(/isActive\s+Boolean\s+@default\(true\)\s+@map\("is_active"\)/);
    expect(schema).toMatch(/deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/);
    expect(schema).toMatch(/deletedReason\s+String\?\s+@map\("deleted_reason"\)\s+@db\.VarChar\(1000\)/);
    expect(schema).toMatch(/billingPeriodKey\s+String\s+@map\("billing_period_key"\)\s+@db\.VarChar\(100\)/);
    expect(schema).toMatch(/billedDate\s+DateTime\?\s+@map\("billed_date"\)\s+@db\.Date/);
    expect(schema).toMatch(/details\s+Json\s+@default\("\{\}"\)/);
    expect(schema).toMatch(/billingOccurrences\s+BillingOccurrence\[\]/);
    expect(schema).toMatch(/billingCoverageIssues\s+BillingCoverageIssue\[\]/);
    expect(schema).toContain('@@unique([tenantId, feeLineId, billingPeriodKey, scheduleEntryKey, generationKey], map: "billing_occurrences_identity_key")');
    expect(schema).toContain('@@index([tenantId, operativeExpectedDate, status])');
    expect(schema).toContain('@@index([tenantId, companyId, operativeExpectedDate, status])');
    expect(schema).toContain('@@index([tenantId, clientServiceId, operativeExpectedDate])');
    expect(schema).not.toContain('billing_coverage_issues_open_issue_key');
  });

  it('uses partial open-issue uniqueness and migration-only consistency checks', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "billing_coverage_issues_open_issue_key"\s+ON "billing_coverage_issues" \("tenant_id", "issue_key"\)\s+WHERE "resolved_at" IS NULL;/,
    );
    expect(migration).toContain('billing_occurrences_date_override_consistency');
    expect(migration).toContain('billing_occurrences_value_override_consistency');
    expect(migration).toContain('billing_occurrences_billed_consistency');
    expect(migration).toContain('billing_occurrences_waiver_consistency');
    expect(migration).toContain('billing_occurrences_cancellation_consistency');
    expect(migration).toContain('billing_occurrences_currency_codes');
    expect(migration).toContain('billing_occurrences_nonnegative_amounts');
    expect(migration).not.toMatch(/@@index.*billing_coverage_issues_open_issue_key/);
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
  });

  it('keeps source lineage restrictive and user actors nullable', () => {
    expect(schema).toMatch(/feeLine\s+ClientServiceFeeLine\s+@relation\(fields:\s*\[feeLineId\], references:\s*\[id\], onDelete:\s*Restrict\)/);
    expect(schema).toMatch(/clientService\s+ClientService\s+@relation\(fields:\s*\[clientServiceId\], references:\s*\[id\], onDelete:\s*Restrict\)/);
    expect(schema).toMatch(/company\s+Company\s+@relation\(fields:\s*\[companyId\], references:\s*\[id\], onDelete:\s*Restrict\)/);
    expect(migration).toMatch(/billing_occurrences_fee_line_id_fkey[\s\S]*?ON DELETE RESTRICT/);
    expect(migration).toMatch(/billing_coverage_issues_fee_line_id_fkey[\s\S]*?ON DELETE RESTRICT/);
    expect(schema).toContain('@relation("BillingOccurrenceDateOverrideActor"');
    expect(schema).toContain('@relation("BillingOccurrenceValueOverrideActor"');
    expect(schema).toContain('@relation("BillingOccurrenceBilledActor"');
    expect(schema).toContain('@relation("BillingOccurrenceWaiverActor"');
    expect(schema).toContain('@relation("BillingOccurrenceCancellationActor"');
  });
});
