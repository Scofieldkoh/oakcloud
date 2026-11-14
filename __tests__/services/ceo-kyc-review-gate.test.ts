import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { formSubmission: { findFirst: mocks.findFirst, update: mocks.update } },
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit }));

const metadata = {
  ceoKycReview: {
    status: 'REVIEWED', linkedSubmissionId: '22222222-2222-4222-8222-222222222222',
    linkedFormId: '33333333-3333-4333-8333-333333333333',
    linkedAt: '2026-11-15T00:00:00Z', linkedById: 'staff-1',
    reviewedAt: '2026-11-15T00:01:00Z', reviewedById: 'staff-1',
  },
};
const base = {
  id: 'response-ar', formId: 'form-ar', tenantId: 'tenant-1',
  respondentName: 'Director', respondentEmail: null,
  answers: { prefill_source: 'company_record', ceo_role_listed: 'No', ceo_exists: 'Yes', ceo_source: 'New individual' },
  metadata: {}, form: { title: 'Annual Return Declaration',
    settings: { template: { key: 'sg_annual_return_declaration', version: 4 } } },
};
const params = { tenantId: 'tenant-1', userId: 'staff-1' };

describe('Annual Return reviewed-status KYC prerequisite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockReset();
    mocks.update.mockResolvedValue({ id: 'response-ar' });
    mocks.audit.mockResolvedValue(undefined);
  });

  it('blocks marking a new CEO Annual Return reviewed without completed linked KYC', async () => {
    mocks.findFirst.mockResolvedValueOnce(base);
    const { updateFormResponseReviewStatus } = await import('@/services/form-submission/responses');
    await expect(updateFormResponseReviewStatus('form-ar', 'response-ar', 'reviewed', params))
      .rejects.toThrow('Review and link the completed');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('preserves the review workflow for older published Annual Return versions', async () => {
    mocks.findFirst.mockResolvedValueOnce({
      ...base,
      form: { ...base.form, settings: { template: { key: 'sg_annual_return_declaration', version: 3 } } },
    });
    const { updateFormResponseReviewStatus } = await import('@/services/form-submission/responses');
    await updateFormResponseReviewStatus('form-ar', 'response-ar', 'reviewed', params);
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalled();
  });

  it('allows Needs follow-up even while KYC is pending', async () => {
    mocks.findFirst.mockResolvedValueOnce(base);
    const { updateFormResponseReviewStatus } = await import('@/services/form-submission/responses');
    await updateFormResponseReviewStatus('form-ar', 'response-ar', 'needs_follow_up', params);
    expect(mocks.update).toHaveBeenCalled();
  });

  it('allows Reviewed only if the linked KYC response is still complete and tenant scoped', async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...base, metadata })
      .mockResolvedValueOnce({ id: metadata.ceoKycReview.linkedSubmissionId });
    const { updateFormResponseReviewStatus } = await import('@/services/form-submission/responses');
    await updateFormResponseReviewStatus('form-ar', 'response-ar', 'reviewed', params);
    expect(mocks.findFirst.mock.calls[1][0].where).toMatchObject({
      tenantId: 'tenant-1', status: 'COMPLETED', deletedAt: null,
      formId: metadata.ceoKycReview.linkedFormId,
      form: { slug: 'kyccdd-individual' },
    });
    expect(mocks.update).toHaveBeenCalled();
  });

  it('blocks Reviewed when the linked KYC was removed after staff review', async () => {
    mocks.findFirst.mockResolvedValueOnce({ ...base, metadata }).mockResolvedValueOnce(null);
    const { updateFormResponseReviewStatus } = await import('@/services/form-submission/responses');
    await expect(updateFormResponseReviewStatus('form-ar', 'response-ar', 'reviewed', params))
      .rejects.toThrow('no longer available');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
