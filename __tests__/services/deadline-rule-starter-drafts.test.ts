import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  STARTER_DEFINITIONS,
  createServiceScheduleStarterData,
} from '@/services/deadline-rule/starter-drafts';
import { hashDeadlineRuleDefinition } from '@/services/deadline-rule/canonical';

const tenantId = '11111111-1111-4111-8111-111111111111';

const tx = {
  businessCalendar: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  deadlineRule: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  deadlineRuleVersion: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

describe('deadline rule starter definitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.businessCalendar.findFirst.mockResolvedValue(null);
    tx.businessCalendar.create.mockResolvedValue({ id: 'calendar-1' });
    tx.deadlineRule.findFirst.mockResolvedValue(null);
    tx.deadlineRule.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `${String(data.code).toLowerCase()}-rule`,
      ...data,
    }));
    tx.deadlineRuleVersion.findFirst.mockResolvedValue(null);
    tx.deadlineRuleVersion.create.mockResolvedValue({ id: 'draft-1' });
  });

  it('contains the exact four canonical unpublished starter contents and stable hashes', () => {
    expect(STARTER_DEFINITIONS.map((definition) => definition.code)).toEqual([
      'SG_AGM_DUE',
      'SG_ANNUAL_RETURN',
      'SG_ECI',
      'SG_FORM_C',
    ]);
    expect(STARTER_DEFINITIONS.map((definition) => hashDeadlineRuleDefinition(definition))).toEqual([
      '1d35fb5366ca3e0765d99aa3be8a7b1a3419cd72a59010007d2f28c43c125472',
      '73fd8c37145eec8adea9f1172a6cb7ec2f065fc90cf01b57b291381a3bcead4e',
      '4124dcf4fcc2a1894d4517bc099d5d1c146587b3ad573eae1474cfb8ea134f2b',
      '5f7f8c126d394bcf24e1cb3303e78f9e0508bf39a431b9e049a3ac884fcbe23c',
    ]);

    const [agm, annualReturn, eci, formC] = STARTER_DEFINITIONS;
    expect(agm).toMatchObject({
      name: 'Singapore AGM Due Date',
      description: 'Starter statutory AGM rule sourced from Company.nextAgmDueDate',
      parameters: [],
      milestones: [{
        key: 'agm-due',
        expression: { kind: 'SOURCE', source: { kind: 'COMPANY_FIELD', field: 'nextAgmDueDate' } },
      }],
    });
    expect(annualReturn.milestones[0]?.expression).toEqual({
      kind: 'SOURCE',
      source: { kind: 'COMPANY_FIELD', field: 'nextArDueDate' },
    });
    expect(eci.parameters).toEqual([expect.objectContaining({
      key: 'monthsAfterFye',
      type: 'INTEGER',
      required: true,
    })]);
    expect(formC.milestones[0]?.expression).toEqual({
      kind: 'ADD_MONTHS',
      source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
      amount: { kind: 'INTEGER_PARAMETER', key: 'monthsAfterFye' },
    });
  });

  it('derives all four relational drafts from the canonical objects and leaves them unattached', async () => {
    await createServiceScheduleStarterData(tx as never, tenantId);

    expect(tx.businessCalendar.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        name: 'Singapore Business Calendar',
        jurisdictionCode: 'SG',
        timeZone: 'Asia/Singapore',
        weekendDays: [0, 6],
      }),
    });
    expect(tx.deadlineRule.create).toHaveBeenCalledTimes(4);
    expect(tx.deadlineRuleVersion.create).toHaveBeenCalledTimes(4);
    expect(tx.deadlineRuleVersion.create.mock.calls.map(([arg]) => arg.data.configHash)).toEqual(
      STARTER_DEFINITIONS.map((definition) => hashDeadlineRuleDefinition(definition)),
    );
    for (const [arg] of tx.deadlineRuleVersion.create.mock.calls) {
      expect(arg.data).not.toHaveProperty('serviceVariantDeadlineRule');
      expect(arg.data).toMatchObject({ state: 'DRAFT', version: 0, draftRevision: 1 });
    }
  });

  it('is repeat-idempotent when the calendar and draft rows already exist', async () => {
    tx.businessCalendar.findFirst.mockResolvedValue({ id: 'calendar-1' });
    tx.deadlineRule.findFirst.mockResolvedValue({ id: 'existing-rule' });
    tx.deadlineRuleVersion.findFirst.mockResolvedValue({ id: 'existing-draft' });

    await createServiceScheduleStarterData(tx as never, tenantId);

    expect(tx.businessCalendar.create).not.toHaveBeenCalled();
    expect(tx.deadlineRule.create).not.toHaveBeenCalled();
    expect(tx.deadlineRuleVersion.create).not.toHaveBeenCalled();
  });

  it('does not mutate a pre-existing custom same-code rule', async () => {
    tx.businessCalendar.findFirst.mockResolvedValue({ id: 'calendar-1' });
    tx.deadlineRule.findFirst.mockResolvedValue({
      id: 'custom-rule',
      name: 'Custom AGM',
      description: 'Tenant-authored rule',
      isActive: true,
      archivedAt: null,
      currentVersionId: null,
    });

    await createServiceScheduleStarterData(tx as never, tenantId);

    expect(tx.deadlineRule.create).not.toHaveBeenCalled();
    expect(tx.deadlineRuleVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.deadlineRuleVersion.create).not.toHaveBeenCalled();
  });
});

describe('deadline rule starter migration', () => {
  it('uses the runtime canonical hashes and gates child inserts to exact seeded identities', () => {
    const migration = readFileSync(
      'prisma/migrations/20260817101000_deadline_rule_starter_drafts/migration.sql',
      'utf8',
    );
    for (const definition of STARTER_DEFINITIONS) {
      expect(migration).toContain(hashDeadlineRuleDefinition(definition));
    }
    expect(migration).not.toContain('repeat(md5(');
    expect(migration).toMatch(/NOT EXISTS[\s\S]*SELECT 1\s+FROM\s+"deadline_rule_versions"/);
    expect(migration).toMatch(/r\."archived_at" IS NULL/);
    expect(migration).toContain('v."config_hash" = starter."config_hash"');
  });
});
