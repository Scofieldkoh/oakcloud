import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deadline engine schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(process.cwd(), 'prisma/migrations/20260817100000_deadline_rule_engine/migration.sql'),
    'utf8',
  );

  it.each([
    'DeadlineRule', 'DeadlineRuleVersion', 'DeadlineRuleParameterDefinition',
    'DeadlineMilestoneTemplate', 'ServiceVariantDeadlineRule',
    'ClientServiceDeadlineRule', 'BusinessCalendar', 'BusinessHoliday',
    'ServiceCycle', 'DeadlineOccurrence', 'ServiceScheduleReconciliationRequest',
  ])('defines model %s', (name) => expect(schema).toContain(`model ${name}`));

  it('uses partial indexes for one draft and queue claims', () => {
    expect(migration).toContain('deadline_rule_versions_one_draft_idx');
    expect(migration).toContain('service_schedule_reconciliation_claim_idx');
    expect(migration).toContain("WHERE \"state\" = 'DRAFT'");
    expect(migration).toContain("WHERE \"status\" IN ('PENDING', 'FAILED')");
  });
});
