import { describe, expect, it } from 'vitest';
import {
  getCreateServiceBillingAlignmentError,
  type CreateContractServiceInput,
} from '@/lib/validations/contract';
import type { DeadlineRuleInput } from '@/lib/validations/service';

function buildRule(overrides: Partial<DeadlineRuleInput> = {}): DeadlineRuleInput {
  return {
    taskName: 'Default task',
    description: null,
    category: 'OTHER',
    ruleType: 'RULE_BASED',
    anchorType: 'FYE',
    offsetMonths: 0,
    offsetDays: 0,
    offsetBusinessDays: false,
    fixedMonth: null,
    fixedDay: null,
    specificDate: null,
    isRecurring: true,
    frequency: 'ANNUALLY',
    generateUntilDate: null,
    generateOccurrences: null,
    isBillable: true,
    amount: 0,
    currency: 'SGD',
    displayOrder: 0,
    sourceTemplateCode: null,
    ...overrides,
  };
}

function buildBaseInput(overrides: Partial<CreateContractServiceInput> = {}): CreateContractServiceInput {
  return {
    name: 'Service',
    serviceType: 'RECURRING',
    status: 'ACTIVE',
    rate: 100,
    currency: 'SGD',
    frequency: 'ANNUALLY',
    startDate: '2026-01-01',
    endDate: null,
    scope: null,
    displayOrder: 0,
    deadlineRules: [],
    ...overrides,
  };
}

describe('getCreateServiceBillingAlignmentError', () => {
  it('returns an error when recurring billable totals do not match recurring rate', () => {
    const input = buildBaseInput({
      serviceType: 'RECURRING',
      rate: 100,
      deadlineRules: [
        buildRule({ taskName: 'Recurring task', isRecurring: true, frequency: 'ANNUALLY', amount: 75 }),
      ],
    });

    const error = getCreateServiceBillingAlignmentError(input);

    expect(error).toContain('Recurring billable deadlines');
  });

  it('returns an error when BOTH has one-time billable deadlines without a one-time rate', () => {
    const input = buildBaseInput({
      serviceType: 'BOTH',
      rate: 500,
      oneTimeRate: null,
      deadlineRules: [
        buildRule({ taskName: 'Setup task', isRecurring: false, frequency: 'ONE_TIME', amount: 300 }),
        buildRule({ taskName: 'Recurring task', isRecurring: true, frequency: 'ANNUALLY', amount: 500, displayOrder: 1 }),
      ],
    });

    const error = getCreateServiceBillingAlignmentError(input);

    expect(error).toContain('no one-time rate is set');
  });

  it('returns null when BOTH one-time and recurring totals are aligned with rates', () => {
    const input = buildBaseInput({
      serviceType: 'BOTH',
      rate: 500,
      oneTimeRate: 300,
      deadlineRules: [
        buildRule({ taskName: 'Setup task', isRecurring: false, frequency: 'ONE_TIME', amount: 300 }),
        buildRule({ taskName: 'Recurring task', isRecurring: true, frequency: 'ANNUALLY', amount: 500, displayOrder: 1 }),
      ],
    });

    const error = getCreateServiceBillingAlignmentError(input);

    expect(error).toBeNull();
  });
});

