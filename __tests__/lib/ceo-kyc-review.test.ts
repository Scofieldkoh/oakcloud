import { describe, expect, it } from 'vitest';
import {
  isCeoKycRequired, parseKycSubmissionReference, readCeoKycReview,
} from '@/lib/forms/ceo-kyc-review';

const KYC_FORM = '11111111-1111-4111-8111-111111111111';
const KYC_RESPONSE = '22222222-2222-4222-8222-222222222222';

describe('CEO KYC/CDD handoff', () => {
  it('requires a separate response only for an unlisted new CEO', () => {
    expect(isCeoKycRequired({
      prefill_source: 'company_record', ceo_role_listed: 'No',
      ceo_exists: 'Yes', ceo_source: 'New individual',
    })).toBe(true);
    expect(isCeoKycRequired({
      prefill_source: 'company_record', ceo_role_listed: 'No',
      ceo_exists: 'Yes', ceo_source: 'Existing listed officer',
    })).toBe(false);
    expect(isCeoKycRequired({ ceo_exists: 'Yes' })).toBe(true);
    expect(isCeoKycRequired({ ceo_exists: 'No' })).toBe(false);
    expect(isCeoKycRequired({ ceo_exists: 'Yes', ceo_role_listed: 'Yes' })).toBe(false);
  });

  it('accepts a response ID or an internal staff response URL, not a public form URL', () => {
    expect(parseKycSubmissionReference(KYC_RESPONSE)).toEqual({ submissionId: KYC_RESPONSE });
    expect(parseKycSubmissionReference(`https://service.oakcloud.app/forms/${KYC_FORM}/responses/${KYC_RESPONSE}`))
      .toEqual({ formId: KYC_FORM, submissionId: KYC_RESPONSE });
    expect(parseKycSubmissionReference('https://service.oakcloud.app/forms/f/kyccdd-individual')).toBeNull();
    expect(parseKycSubmissionReference('not an ID')).toBeNull();
  });

  it('reads only server-shaped KYC review metadata', () => {
    expect(readCeoKycReview({ ceoKycReview: { status: 'REVIEWED' } })).toBeNull();
    expect(readCeoKycReview({ ceoKycReview: {
      status: 'RECEIVED', linkedSubmissionId: KYC_RESPONSE,
      linkedFormId: KYC_FORM, linkedAt: '2026-11-15T00:00:00Z', linkedById: 'staff-1',
    } })).toMatchObject({ status: 'RECEIVED', linkedSubmissionId: KYC_RESPONSE });
  });
});
