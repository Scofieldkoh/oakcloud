import { Prisma } from '@/generated/prisma';
import type { CanonicalDeadlineRuleDefinition } from './canonical';
import { hashDeadlineRuleDefinition } from './canonical';

export const STARTER_CALENDAR_NAME = 'Singapore Business Calendar';

const annualRecurrence = {
  schemaVersion: 1,
  kind: 'ANNUALLY',
} as const;

const applicability = {
  schemaVersion: 1 as const,
  kind: 'ALL' as const,
  conditions: [],
};

/**
 * The single source of truth for the four statutory starter drafts. Rule
 * rows, version rows, relational children, and hashes are all derived from
 * these complete canonical objects.
 */
export const STARTER_DEFINITIONS: CanonicalDeadlineRuleDefinition[] = [
  {
    schemaVersion: 1,
    code: 'SG_AGM_DUE',
    name: 'Singapore AGM Due Date',
    description: 'Starter statutory AGM rule due one month before Company.accountsDueDate',
    recurrence: annualRecurrence,
    applicability,
    parameters: [],
    milestones: [{
      key: 'agm-due',
      name: 'AGM due date',
      description: null,
      type: 'STATUTORY',
      generationMode: 'ONCE_PER_CYCLE',
      expression: {
        kind: 'ADD_MONTHS',
        source: { kind: 'COMPANY_FIELD', field: 'accountsDueDate' },
        amount: -1,
      },
      businessDayAdjustment: 'NONE',
      displayOrder: 0,
      isActive: true,
    }],
  },
  {
    schemaVersion: 1,
    code: 'SG_ANNUAL_RETURN',
    name: 'Singapore Annual Return',
    description: 'Starter statutory Annual Return rule sourced from Company.accountsDueDate',
    recurrence: annualRecurrence,
    applicability,
    parameters: [],
    milestones: [{
      key: 'annual-return-due',
      name: 'Annual Return due date',
      description: null,
      type: 'STATUTORY',
      generationMode: 'ONCE_PER_CYCLE',
      expression: {
        kind: 'SOURCE',
        source: { kind: 'COMPANY_FIELD', field: 'accountsDueDate' },
      },
      businessDayAdjustment: 'NONE',
      displayOrder: 0,
      isActive: true,
    }],
  },
  {
    schemaVersion: 1,
    code: 'SG_ECI',
    name: 'Singapore ECI',
    description: 'Starter statutory ECI rule requiring monthsAfterFye',
    recurrence: annualRecurrence,
    applicability,
    parameters: [{
      key: 'monthsAfterFye',
      label: 'Months after FYE',
      description: null,
      type: 'INTEGER',
      required: true,
    }],
    milestones: [{
      key: 'eci-due',
      name: 'ECI due date',
      description: null,
      type: 'STATUTORY',
      generationMode: 'ONCE_PER_CYCLE',
      expression: {
        kind: 'ADD_MONTHS',
        source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
        amount: { kind: 'INTEGER_PARAMETER', key: 'monthsAfterFye' },
      },
      businessDayAdjustment: 'NONE',
      displayOrder: 0,
      isActive: true,
    }],
  },
  {
    schemaVersion: 1,
    code: 'SG_FORM_C',
    name: 'Singapore Form C',
    description: 'Starter statutory Form C rule requiring monthsAfterFye',
    recurrence: annualRecurrence,
    applicability,
    parameters: [{
      key: 'monthsAfterFye',
      label: 'Months after FYE',
      description: null,
      type: 'INTEGER',
      required: true,
    }],
    milestones: [{
      key: 'form-c-due',
      name: 'Form C due date',
      description: null,
      type: 'STATUTORY',
      generationMode: 'ONCE_PER_CYCLE',
      expression: {
        kind: 'ADD_MONTHS',
        source: { kind: 'COMPANY_FIELD', field: 'financialYearEnd' },
        amount: { kind: 'INTEGER_PARAMETER', key: 'monthsAfterFye' },
      },
      businessDayAdjustment: 'NONE',
      displayOrder: 0,
      isActive: true,
    }],
  },
];

function createVersionData(
  tenantId: string,
  ruleId: string,
  definition: CanonicalDeadlineRuleDefinition,
): Prisma.DeadlineRuleVersionCreateInput {
  return {
    tenant: { connect: { id: tenantId } },
    rule: { connect: { id: ruleId } },
    version: 0,
    state: 'DRAFT',
    schemaVersion: definition.schemaVersion,
    recurrence: definition.recurrence,
    applicability: definition.applicability,
    configHash: hashDeadlineRuleDefinition(definition),
    draftRevision: 1,
    parameterDefinitions: {
      create: definition.parameters.map((parameter, index) => ({
        tenant: { connect: { id: tenantId } },
        key: parameter.key,
        label: parameter.label,
        type: parameter.type,
        isRequired: parameter.required,
        defaultValue: Prisma.DbNull,
        validation: parameter.options === undefined
          ? Prisma.DbNull
          : { options: parameter.options },
        helpText: parameter.description,
        displayOrder: index,
      })),
    },
    milestoneTemplates: {
      create: definition.milestones.map((milestone) => ({
        tenant: { connect: { id: tenantId } },
        milestoneKey: milestone.key,
        name: milestone.name,
        description: milestone.description,
        type: milestone.type,
        generationMode: milestone.generationMode,
        dateExpression: milestone.expression,
        businessDayAdjustment: milestone.businessDayAdjustment,
        displayOrder: milestone.displayOrder,
        isActive: milestone.isActive,
      })),
    },
  };
}

async function ensureStarterRule(
  tx: Prisma.TransactionClient,
  tenantId: string,
  definition: CanonicalDeadlineRuleDefinition,
): Promise<void> {
  let rule = await tx.deadlineRule.findFirst({
    where: { tenantId, code: definition.code },
  });
  if (!rule) {
    rule = await tx.deadlineRule.create({
      data: {
        tenantId,
        code: definition.code,
        name: definition.name,
        description: definition.description,
        isActive: true,
      },
    });
  } else if (
    rule.name !== definition.name
    || rule.description !== definition.description
    || rule.isActive === false
    || rule.archivedAt !== null && rule.archivedAt !== undefined
  ) {
    // A pre-existing custom same-code rule is never mutated by provisioning.
    return;
  }

  const draft = await tx.deadlineRuleVersion.findFirst({
    where: { tenantId, ruleId: rule.id, state: 'DRAFT' },
  });
  if (draft || rule.currentVersionId) return;

  await tx.deadlineRuleVersion.create({
    data: createVersionData(tenantId, rule.id, definition),
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

  for (const definition of STARTER_DEFINITIONS) {
    await ensureStarterRule(tx, tenantId, definition);
  }
}
