import { Prisma } from '@/generated/prisma';
import { hashConfiguration } from '@/services/service-schedule/hash';

const STARTER_CALENDAR_NAME = 'Singapore Business Calendar';

type StarterDefinition = {
  code: string;
  name: string;
  description: string;
  parameters: Array<{
    key: string;
    label: string;
    type: 'INTEGER';
    required: true;
  }>;
  milestones: Array<{
    key: string;
    name: string;
    expression: Prisma.InputJsonValue;
  }>;
};

const annualRecurrence = {
  schemaVersion: 1,
  kind: 'ANNUALLY',
} as const;

const applicability = {
  schemaVersion: 1,
  kind: 'ALL',
  conditions: [],
} as const;

const STARTERS: StarterDefinition[] = [
  {
    code: 'SG_AGM_DUE',
    name: 'Singapore AGM Due Date',
    description: 'Starter statutory AGM deadline sourced from the Company next AGM due date.',
    parameters: [],
    milestones: [{
      key: 'agm-due',
      name: 'AGM due date',
      expression: {
        kind: 'SOURCE',
        source: { kind: 'COMPANY_FIELD', field: 'nextAgmDueDate' },
      },
    }],
  },
  {
    code: 'SG_ANNUAL_RETURN',
    name: 'Singapore Annual Return',
    description: 'Starter statutory Annual Return deadline sourced from the Company next AR due date.',
    parameters: [],
    milestones: [{
      key: 'annual-return-due',
      name: 'Annual Return due date',
      expression: {
        kind: 'SOURCE',
        source: { kind: 'COMPANY_FIELD', field: 'nextArDueDate' },
      },
    }],
  },
  {
    code: 'SG_ECI',
    name: 'Singapore ECI',
    description: 'Starter statutory ECI deadline based on Company FYE and a required month parameter.',
    parameters: [{
      key: 'monthsAfterFye',
      label: 'Months after FYE',
      type: 'INTEGER',
      required: true,
    }],
    milestones: [{
      key: 'eci-due',
      name: 'ECI due date',
      expression: {
        kind: 'ADD_MONTHS',
        source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
        amount: { kind: 'INTEGER_PARAMETER', key: 'monthsAfterFye' },
      },
    }],
  },
  {
    code: 'SG_FORM_C',
    name: 'Singapore Form C',
    description: 'Starter statutory Form C deadline based on Company FYE and a required month parameter.',
    parameters: [{
      key: 'monthsAfterFye',
      label: 'Months after FYE',
      type: 'INTEGER',
      required: true,
    }],
    milestones: [{
      key: 'form-c-due',
      name: 'Form C due date',
      expression: {
        kind: 'ADD_MONTHS',
        source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
        amount: { kind: 'INTEGER_PARAMETER', key: 'monthsAfterFye' },
      },
    }],
  },
];

function createVersionData(
  tenantId: string,
  ruleId: string,
  starter: StarterDefinition,
): Prisma.DeadlineRuleVersionCreateInput {
  const config = {
    schemaVersion: 1,
    recurrence: annualRecurrence,
    applicability,
    parameters: starter.parameters,
    milestones: starter.milestones,
  };
  return {
    tenant: { connect: { id: tenantId } },
    rule: { connect: { id: ruleId } },
    version: 0,
    state: 'DRAFT',
    schemaVersion: 1,
    recurrence: annualRecurrence,
    applicability,
    configHash: hashConfiguration(config),
    draftRevision: 1,
    parameterDefinitions: {
      create: starter.parameters.map((parameter, index) => ({
        tenant: { connect: { id: tenantId } },
        key: parameter.key,
        label: parameter.label,
        type: parameter.type,
        isRequired: parameter.required,
        defaultValue: Prisma.JsonNull,
        validation: Prisma.JsonNull,
        helpText: null,
        displayOrder: index,
      })),
    },
    milestoneTemplates: {
      create: starter.milestones.map((milestone, index) => ({
        tenant: { connect: { id: tenantId } },
        milestoneKey: milestone.key,
        name: milestone.name,
        description: null,
        type: 'STATUTORY',
        generationMode: 'ONCE_PER_CYCLE',
        dateExpression: milestone.expression,
        businessDayAdjustment: 'NONE',
        displayOrder: index,
        isActive: true,
      })),
    },
  };
}

async function ensureStarterRule(
  tx: Prisma.TransactionClient,
  tenantId: string,
  starter: StarterDefinition,
): Promise<void> {
  let rule = await tx.deadlineRule.findFirst({
    where: { tenantId, code: starter.code },
  });
  if (!rule) {
    rule = await tx.deadlineRule.create({
      data: {
        tenantId,
        code: starter.code,
        name: starter.name,
        description: starter.description,
        isActive: true,
      },
    });
  }

  const draft = await tx.deadlineRuleVersion.findFirst({
    where: { tenantId, ruleId: rule.id, state: 'DRAFT' },
  });
  if (draft) return;

  await tx.deadlineRuleVersion.create({
    data: createVersionData(tenantId, rule.id, starter),
  });
}

/**
 * Provision the schedule foundation for a newly-created workspace. Every
 * operation is performed against the caller's transaction client so a tenant
 * cannot become visible without its calendar and four unpublished drafts.
 */
export async function createServiceScheduleStarterData(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const calendar = await tx.businessCalendar.findFirst({
    where: { tenantId, name: STARTER_CALENDAR_NAME },
  });
  if (!calendar) {
    await tx.businessCalendar.create({
      data: {
        tenantId,
        name: STARTER_CALENDAR_NAME,
        jurisdictionCode: 'SG',
        timeZone: 'Asia/Singapore',
        weekendDays: [0, 6],
        revision: 1,
        isActive: true,
      },
    });
  }

  for (const starter of STARTERS) {
    await ensureStarterRule(tx, tenantId, starter);
  }
}

export { STARTER_CALENDAR_NAME };
