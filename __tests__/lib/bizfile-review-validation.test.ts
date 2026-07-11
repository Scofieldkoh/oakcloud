import { describe, expect, it } from 'vitest';
import {
  createEmptyBizFileReviewDraft,
  normalizeBizFileReviewDraft,
  validateBizFileReview,
} from '@/lib/validations/bizfile-review';

describe('BizFile review validation', () => {
  it('maps nested issues to sections', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails.name = '';
    draft.shareholders = [{
      name: '', type: 'INDIVIDUAL', shareClass: '', numberOfShares: -1,
    }];
    const result = validateBizFileReview(draft);
    expect(result.isValid).toBe(false);
    expect(result.issuesBySection.entity).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'entityDetails.name' }),
    ]));
    expect(result.issuesBySection.shareholders).toHaveLength(3);
  });

  it('omits wholly blank optional groups while preserving entered values', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '202626103M', name: 'Example Pte. Ltd.', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
    draft.mailingAddress = { streetName: '', postalCode: '' };
    draft.auditor = { name: '', address: '', appointmentDate: '' };
    expect(normalizeBizFileReviewDraft(draft)).toMatchObject({
      entityDetails: draft.entityDetails,
      mailingAddress: undefined,
      auditor: undefined,
    });
  });

  it('rejects invalid dates, percentages, and non-finite numbers', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '202626103M', name: 'Example', entityType: 'PRIVATE_LIMITED', status: 'LIVE', incorporationDate: 'not-a-date' };
    draft.shareholders = [{ name: 'A', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1, percentageHeld: 101 }];
    const paths = validateBizFileReview(draft).issues.map((issue) => issue.path);
    expect(paths).toContain('entityDetails.incorporationDate');
    expect(paths).toContain('shareholders.0.percentageHeld');
  });
});
