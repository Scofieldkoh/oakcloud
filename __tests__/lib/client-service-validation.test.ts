import { describe, expect, it } from 'vitest';
import {
  markServiceAgreementEffectiveSchema,
  searchClientServicesSchema,
  updateClientServiceSchema,
} from '@/lib/validations/client-service';

describe('client service validation', () => {
  it('requires an optimistic timestamp and at least one mutation', () => {
    expect(updateClientServiceSchema.safeParse({ status: 'PAUSED' }).success).toBe(false);
    expect(updateClientServiceSchema.safeParse({ updatedAt: '2026-07-30T00:00:00.000Z' }).success).toBe(false);
    expect(updateClientServiceSchema.safeParse({ updatedAt: '2026-07-30T00:00:00.000Z', status: 'PAUSED' }).success).toBe(true);
  });

  it('requires custom cadence labels and valid merged date input', () => {
    expect(updateClientServiceSchema.safeParse({
      serviceCadence: 'CUSTOM',
      customCadenceLabel: null,
    }).success).toBe(false);

    expect(updateClientServiceSchema.safeParse({
      startDate: '2026-08-01',
      endDate: '2026-07-31',
    }).success).toBe(false);
  });

  it('requires an audit-quality reason for manual activation', () => {
    expect(markServiceAgreementEffectiveSchema.safeParse({
      signedAt: '2026-07-30T00:00:00.000Z',
      effectiveDate: '2026-07-30',
      reason: 'External',
    }).success).toBe(false);
  });

  it('normalizes list pagination and supports status filtering', () => {
    expect(searchClientServicesSchema.parse({ status: 'PAUSED', page: '2', limit: '25' }))
      .toEqual({ status: 'PAUSED', query: undefined, page: 2, limit: 25 });
  });
});
