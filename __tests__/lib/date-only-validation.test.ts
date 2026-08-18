import { describe, expect, it } from 'vitest';
import { createCompanySchema, updateCompanySchema } from '@/lib/validations/company';
import { complianceSectionSchema } from '@/lib/validations/company-profile';

const companyBase = { uen: '202400001A', name: 'Example Pte Ltd' };
const updateBase = { id: '00000000-0000-0000-0000-000000000001' };

describe('authoritative company DateOnly validation', () => {
  it.each([
    '2026-08-18T12:34:00Z',
    'August 18, 2026',
    '2026-02-31',
    '2026-13-01',
  ])('rejects invalid date-only value %s in create, update, and Compliance schemas', (value) => {
    expect(createCompanySchema.safeParse({ ...companyBase, nextAgmDueDate: value }).success).toBe(false);
    expect(updateCompanySchema.safeParse({ ...updateBase, nextArDueDate: value }).success).toBe(false);
    expect(complianceSectionSchema.safeParse({
      financialYearEndDay: null,
      financialYearEndMonth: null,
      nextAgmDueDate: value,
      nextArDueDate: null,
      fyeAsAtLastAr: null,
      homeCurrency: 'SGD',
      lastAgmDate: null,
      lastArFiledDate: null,
      accountsDueDate: null,
    }).success).toBe(false);
  });

  it('preserves nullable and optional DateOnly values without timestamp coercion', () => {
    const created = createCompanySchema.parse({ ...companyBase, nextAgmDueDate: '2026-08-18', nextArDueDate: null });
    const updated = updateCompanySchema.parse({ ...updateBase, nextAgmDueDate: '2026-08-18' });
    const compliance = complianceSectionSchema.parse({
      financialYearEndDay: null,
      financialYearEndMonth: null,
      nextAgmDueDate: '2026-08-18',
      nextArDueDate: null,
      fyeAsAtLastAr: null,
      homeCurrency: 'SGD',
      lastAgmDate: null,
      lastArFiledDate: null,
      accountsDueDate: null,
    });

    expect(created.nextAgmDueDate).toBe('2026-08-18');
    expect(created.nextArDueDate).toBeNull();
    expect(updated.nextAgmDueDate).toBe('2026-08-18');
    expect(compliance.nextAgmDueDate).toBe('2026-08-18');
  });
});
