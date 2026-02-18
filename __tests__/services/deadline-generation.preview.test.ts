import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { previewDeadlinesFromRuleInputs } from '@/services/deadline-generation.service';
import type { DeadlineRuleInput } from '@/lib/validations/service';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

describe('previewDeadlinesFromRuleInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes one-time SERVICE_START relative deadlines before service start', async () => {
    vi.mocked(prisma.company.findFirst).mockResolvedValue({
      id: 'company-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      financialYearEndMonth: 12,
      financialYearEndDay: 31,
      incorporationDate: null,
      isGstRegistered: false,
      gstFilingFrequency: null,
      isRegisteredCharity: false,
      isIPC: false,
      ipcExpiryDate: null,
      agmDispensed: false,
      isDormant: false,
      dormantTaxExemptionApproved: false,
      entityType: 'PRIVATE_LIMITED',
    } as never);

    const rules: DeadlineRuleInput[] = [
      {
        taskName: 'Setup Pack Collection',
        description: null,
        category: 'ACCOUNTING',
        ruleType: 'RULE_BASED',
        anchorType: 'SERVICE_START',
        offsetMonths: 0,
        offsetDays: -30,
        offsetBusinessDays: false,
        fixedMonth: null,
        fixedDay: null,
        specificDate: null,
        isRecurring: false,
        frequency: 'ONE_TIME',
        generateUntilDate: null,
        generateOccurrences: null,
        isBillable: false,
        amount: null,
        currency: 'SGD',
        displayOrder: 0,
        sourceTemplateCode: null,
      },
    ];

    const result = await previewDeadlinesFromRuleInputs(
      'company-1',
      rules,
      { tenantId: 'tenant-1', userId: 'user-1' },
      {
        serviceStartDate: '2026-08-01',
        monthsAhead: 18,
      }
    );

    expect(result.warnings).toEqual([]);
    expect(result.deadlines).toHaveLength(1);

    const startDate = new Date(2026, 7, 1);
    const dueDate = result.deadlines[0].statutoryDueDate;
    const dayDiff = (startOfDay(startDate).getTime() - startOfDay(dueDate).getTime()) / DAY_MS;

    expect(dayDiff).toBe(30);
  });
});

