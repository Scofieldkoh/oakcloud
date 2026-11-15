import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), updateMany: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { formSubmission: { findFirst: mocks.findFirst, updateMany: mocks.updateMany } },
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit }));

const AR = '11111111-1111-4111-8111-111111111111';
const KYC = '22222222-2222-4222-8222-222222222222';
const KYCFORM = '33333333-3333-4333-8333-333333333333';
const params = { tenantId: 'tenant-1', userId: 'staff-1' };
const annual = {
  id: AR, formId: 'form-ar', tenantId: 'tenant-1',
  respondentName: 'Company director', respondentEmail: null,
  updatedAt: new Date('2026-11-15T00:00:00Z'), metadata: { responseTags: ['urgent'] },
  answers: {
    prefill_source: 'company_record', ceo_role_listed: 'No',
    ceo_exists: 'Yes', ceo_source: 'New individual',
  },
  form: {
    title: 'Annual Return Declaration',
    settings: { template: { key: 'sg_annual_return_declaration', version: 4 } },
  },
};

describe('staff CEO KYC/CDD response linkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockReset();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue(undefined);
  });

  it('links only a completed KYC response in the same tenant and audits receipt', async () => {
    mocks.findFirst.mockResolvedValueOnce(annual)
      .mockResolvedValueOnce({ id: KYC, formId: KYCFORM });
    const { updateCeoKycReview } = await import('@/services/form-submission/ceo-kyc');
    const result = await updateCeoKycReview('form-ar', AR, { action: 'LINK', reference: KYC }, params);
    expect(result.ceoKycReview).toMatchObject({
      status: 'RECEIVED', linkedSubmissionId: KYC, linkedFormId: KYCFORM, linkedById: 'staff-1',
    });
    expect(mocks.findFirst.mock.calls[1][0].where).toMatchObject({
      id: KYC, tenantId: 'tenant-1', status: 'COMPLETED', deletedAt: null,
      form: { slug: 'kyccdd-individual', deletedAt: null },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: AR, tenantId: 'tenant-1', updatedAt: annual.updatedAt }),
      data: { metadata: expect.objectContaining({ responseTags: ['urgent'], ceoKycReview: expect.any(Object) }) },
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ event: 'form_response_ceo_kyc_review_updated', status: 'RECEIVED' }),
    }));
  });

  it('rejects missing or unrelated KYC submissions and never records receipt', async () => {
    mocks.findFirst.mockResolvedValueOnce(annual).mockResolvedValueOnce(null);
    const { updateCeoKycReview } = await import('@/services/form-submission/ceo-kyc');
    await expect(updateCeoKycReview('form-ar', AR, { action: 'LINK', reference: KYC }, params))
      .rejects.toThrow('No completed individual KYC/CDD response');
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to review before receipt, or without an applicable new-CEO declaration', async () => {
    const { updateCeoKycReview } = await import('@/services/form-submission/ceo-kyc');
    mocks.findFirst.mockResolvedValueOnce(annual);
    await expect(updateCeoKycReview('form-ar', AR, { action: 'REVIEW' }, params))
      .rejects.toThrow('Link a completed');
    mocks.findFirst.mockResolvedValueOnce({
      ...annual, answers: { ceo_exists: 'No', ceo_source: 'New individual' },
    });
    await expect(updateCeoKycReview('form-ar', AR, { action: 'LINK', reference: KYC }, params))
      .rejects.toThrow('not required');
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('marks a linked completed KYC reviewed and clears it without changing answers', async () => {
    const previous = {
      status: 'RECEIVED', linkedSubmissionId: KYC, linkedFormId: KYCFORM,
      linkedAt: '2026-11-15T00:01:00Z', linkedById: 'staff-1',
    };
    const { updateCeoKycReview } = await import('@/services/form-submission/ceo-kyc');
    mocks.findFirst.mockResolvedValueOnce({ ...annual, metadata: { ceoKycReview: previous } })
      .mockResolvedValueOnce({ id: KYC, formId: KYCFORM });
    const reviewed = await updateCeoKycReview('form-ar', AR, { action: 'REVIEW' }, params);
    expect(reviewed.ceoKycReview).toMatchObject({
      status: 'REVIEWED', reviewedById: 'staff-1', linkedSubmissionId: KYC,
    });
    mocks.findFirst.mockResolvedValueOnce({ ...annual, metadata: { ceoKycReview: previous } });
    const cleared = await updateCeoKycReview('form-ar', AR, { action: 'CLEAR' }, params);
    expect(cleared.ceoKycReview).toBeNull();
    expect(mocks.updateMany.mock.calls[1][0].data.metadata).not.toHaveProperty('ceoKycReview');
    expect(mocks.updateMany.mock.calls[1][0].data).not.toHaveProperty('answers');
  });

  it('requires reopening the Annual Return review before replacing or clearing a linked KYC response', async () => {
    const { updateCeoKycReview } = await import('@/services/form-submission/ceo-kyc');
    const reviewed = { ...annual, metadata: { responseReviewStatus: 'reviewed' } };
    for (const action of [{ action: 'LINK', reference: KYC } as const, { action: 'CLEAR' } as const]) {
      mocks.findFirst.mockResolvedValueOnce(reviewed);
      await expect(updateCeoKycReview('form-ar', AR, action, params))
        .rejects.toThrow('Needs follow-up');
    }
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('fails rather than overwriting another staff member concurrent update', async () => {
    mocks.findFirst.mockResolvedValueOnce(annual).mockResolvedValueOnce({ id: KYC, formId: KYCFORM });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const { updateCeoKycReview } = await import('@/services/form-submission/ceo-kyc');
    await expect(updateCeoKycReview('form-ar', AR, { action: 'LINK', reference: KYC }, params))
      .rejects.toThrow('Refresh before updating');
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
