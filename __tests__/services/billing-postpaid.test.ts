import { describe, expect, it } from 'vitest';
import { postpaidBillableYears } from '@/services/billing/postpaid';
import { clientServiceFeeLineInputSchema } from '@/lib/validations/client-service';
import { serviceVariantFeeTemplateSchema } from '@/lib/validations/service-catalog';

const filed = (obligationCode: string, yearOfAssessment: number, completedAt: string) => ({
  obligationCode,
  yearOfAssessment,
  completedAt: new Date(completedAt),
});

describe('postpaidBillableYears', () => {
  const service = { startDate: new Date('2026-04-01T00:00:00.000Z'), engagementStartYearOfAssessment: 2026 };

  it('bills each YA once, on the day its first trigger filing was set to Filed (Singapore date)', () => {
    const years = postpaidBillableYears(service, 'SG_ECI_OR_FORM_C_FILED', [
      filed('SG_FORM_C', 2027, '2027-11-20T02:00:00.000Z'),
      // 23:30 UTC on 2 March is 3 March in Singapore.
      filed('SG_ECI', 2027, '2027-03-02T23:30:00.000Z'),
      filed('SG_FORM_C', 2026, '2026-11-10T02:00:00.000Z'),
    ]);
    expect([...years.entries()]).toEqual([[2027, '2027-03-03'], [2026, '2026-11-10']]);
  });

  it('only counts the trigger filing and YAs from the engagement start', () => {
    const years = postpaidBillableYears(service, 'SG_FORM_C_FILED', [
      filed('SG_ECI', 2027, '2027-03-01T02:00:00.000Z'),
      filed('SG_FORM_C', 2025, '2026-05-01T02:00:00.000Z'),
    ]);
    expect(years.size).toBe(0);
  });

  it('without an engagement start YA, bills filings made on or after the service start', () => {
    const years = postpaidBillableYears({ ...service, engagementStartYearOfAssessment: null }, 'SG_ECI_FILED', [
      filed('SG_ECI', 2026, '2026-03-20T02:00:00.000Z'),
      filed('SG_ECI', 2027, '2026-04-02T02:00:00.000Z'),
    ]);
    expect([...years.keys()]).toEqual([2027]);
  });

  it('ignores an unknown trigger', () => {
    expect(postpaidBillableYears(service, null, [filed('SG_ECI', 2027, '2027-03-01T02:00:00.000Z')]).size).toBe(0);
  });
});

describe('fee line billing basis validation', () => {
  const fee = { description: 'Tax filing', amount: '800.00', currency: 'SGD', billingFrequency: 'ONE_TIME', displayOrder: 0 };

  it('requires a trigger for a postpaid fee line', () => {
    expect(clientServiceFeeLineInputSchema.safeParse({ ...fee, billingTiming: 'POSTPAID' }).success).toBe(false);
    expect(clientServiceFeeLineInputSchema.safeParse({ ...fee, billingTiming: 'POSTPAID', postpaidTrigger: 'SG_ECI_OR_FORM_C_FILED' }).success).toBe(true);
    expect(clientServiceFeeLineInputSchema.safeParse(fee).success).toBe(true);
  });

  it('requires a trigger for a postpaid fee template', () => {
    const template = { description: 'Tax filing', currency: 'SGD', billingFrequency: 'ANNUALLY', displayOrder: 0 };
    expect(serviceVariantFeeTemplateSchema.safeParse({ ...template, billingTiming: 'POSTPAID' }).success).toBe(false);
    expect(serviceVariantFeeTemplateSchema.safeParse({ ...template, billingTiming: 'POSTPAID', postpaidTrigger: 'SG_FORM_C_FILED' }).success).toBe(true);
  });
});
