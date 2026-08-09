import { describe, expect, it } from 'vitest';
import {
  createManualClientServiceSchema,
  markServiceAgreementEffectiveSchema,
  searchClientServicesSchema,
  updateClientServiceSchema,
} from '@/lib/validations/client-service';

const variantId = '11111111-1111-4111-8111-111111111111';

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

  describe('createManualClientServiceSchema', () => {
    const validInput = {
      serviceVariantId: variantId,
      serviceCadence: 'ANNUALLY',
      startDate: '2026-08-01',
      feeLines: [{ description: 'Annual service fee', amount: '1200.00', currency: 'sgd', billingFrequency: 'ANNUALLY' }],
    };

    it('applies server defaults and normalizes optional values', () => {
      expect(createManualClientServiceSchema.parse(validInput)).toMatchObject({
        status: 'ACTIVE',
        fieldValues: {},
        confirmDuplicate: false,
        customCadenceLabel: null,
        endDate: null,
        feeLines: [{ currency: 'SGD', customFrequencyLabel: null, billingStartDate: null }],
      });
    });

    it.each(['serviceVariantId', 'serviceCadence', 'startDate'])('requires %s', (field) => {
      const rest = Object.fromEntries(Object.entries(validInput).filter(([key]) => key !== field));
      expect(createManualClientServiceSchema.safeParse(rest).success).toBe(false);
    });

    it('rejects an end date before the start date and accepts equality', () => {
      expect(createManualClientServiceSchema.safeParse({ ...validInput, endDate: '2026-07-31' }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, endDate: '2026-08-01' }).success).toBe(true);
    });

    it('requires a custom cadence label and clears it for other cadences', () => {
      expect(createManualClientServiceSchema.safeParse({ ...validInput, serviceCadence: 'CUSTOM', customCadenceLabel: null }).success).toBe(false);
      expect(createManualClientServiceSchema.parse({ ...validInput, serviceCadence: 'CUSTOM', customCadenceLabel: 'Every 18 months' })).toMatchObject({ serviceCadence: 'CUSTOM', customCadenceLabel: 'Every 18 months' });
      expect(createManualClientServiceSchema.parse({ ...validInput, customCadenceLabel: 'Ignored' })).toMatchObject({ customCadenceLabel: null });
    });

    it('accepts missing and additional operational fields', () => {
      expect(createManualClientServiceSchema.safeParse(validInput).success).toBe(true);
      expect(createManualClientServiceSchema.parse({ ...validInput, fieldValues: { filingMonth: 'July', 'custom.flag': 'true' } }))
        .toMatchObject({ fieldValues: { filingMonth: 'July', 'custom.flag': 'true' } });
    });

    it('limits field keys to 100 and values to 10,000 characters', () => {
      const manyFields = Object.fromEntries(Array.from({ length: 101 }, (_entry, index) => [`key-${index}`, 'value']));
      expect(createManualClientServiceSchema.safeParse({ ...validInput, fieldValues: manyFields }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, fieldValues: { key: 'x'.repeat(10_001) } }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, fieldValues: { key: 'x'.repeat(10_000) } }).success).toBe(true);
    });

    it('requires between one and one hundred fee rows', () => {
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [] }).success).toBe(false);
      const manyFees = Array.from({ length: 101 }, () => validInput.feeLines[0]);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: manyFees }).success).toBe(false);
      const oneHundredFees = Array.from({ length: 100 }, () => validInput.feeLines[0]);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: oneHundredFees }).success).toBe(true);
    });

    it('requires an explicit fee frequency and a label for custom frequency', () => {
      const { billingFrequency: _omitted, ...feeWithoutFrequency } = validInput.feeLines[0];
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [feeWithoutFrequency] }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], billingFrequency: 'CUSTOM' }] }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], billingFrequency: 'CUSTOM', customFrequencyLabel: 'Every 18 months' }] }).success).toBe(true);
    });

    it('normalizes currencies and rejects malformed codes', () => {
      expect(createManualClientServiceSchema.parse(validInput).feeLines[0].currency).toBe('SGD');
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], currency: 'US' }] }).success).toBe(false);
    });

    it('rejects blank or negative amounts and accepts explicit zero', () => {
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], amount: '' }] }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], amount: '-1.00' }] }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], amount: '1.234' }] }).success).toBe(false);
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], amount: '0.00' }] }).success).toBe(true);
    });

    it.each(['source', 'agreementId', 'agreementItemId', 'familyName', 'serviceName'])('rejects client-owned %s', (field) => {
      expect(createManualClientServiceSchema.safeParse({ ...validInput, [field]: 'value' }).success).toBe(false);
    });

    it.each(['id', 'sourceAgreementFeeLineId', 'displayOrder'])('rejects client-owned fee %s', (field) => {
      expect(createManualClientServiceSchema.safeParse({ ...validInput, feeLines: [{ ...validInput.feeLines[0], [field]: field === 'displayOrder' ? 0 : 'fee-1' }] }).success).toBe(false);
    });
  });

  it('rejects immutable identity fields on updates instead of stripping them', () => {
    const base = { updatedAt: '2026-07-30T00:00:00.000Z', status: 'PAUSED' };
    expect(updateClientServiceSchema.safeParse(base).success).toBe(true);
    expect(updateClientServiceSchema.safeParse({ ...base, source: 'MANUAL' }).success).toBe(false);
    expect(updateClientServiceSchema.safeParse({ ...base, serviceVariantId: variantId }).success).toBe(false);
    expect(updateClientServiceSchema.safeParse({ ...base, agreementId: 'agreement-1' }).success).toBe(false);
    expect(updateClientServiceSchema.safeParse({ ...base, agreementItemId: 'item-1' }).success).toBe(false);
  });
});
