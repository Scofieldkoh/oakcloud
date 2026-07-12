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
    const normalized = normalizeBizFileReviewDraft(draft);
    expect(normalized).toMatchObject({ entityDetails: draft.entityDetails });
    expect(Object.hasOwn(normalized, 'mailingAddress')).toBe(false);
    expect(Object.hasOwn(normalized, 'auditor')).toBe(false);
  });

  it('omits empty optional arrays while preserving populated arrays', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '202626103M', name: 'Example Pte. Ltd.', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
    draft.officers = [];
    draft.charges = [];
    draft.shareholders = [{ name: 'Owner', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1 }];
    const normalized = normalizeBizFileReviewDraft(draft);
    expect(normalized).toEqual(expect.objectContaining({ shareholders: draft.shareholders }));
    expect(Object.hasOwn(normalized, 'officers')).toBe(false);
    expect(Object.hasOwn(normalized, 'charges')).toBe(false);
  });

  it('rejects invalid dates, percentages, and non-finite numbers', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '202626103M', name: 'Example', entityType: 'PRIVATE_LIMITED', status: 'LIVE', incorporationDate: 'not-a-date' };
    draft.shareholders = [{ name: 'A', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1, percentageHeld: 101 }];
    const paths = validateBizFileReview(draft).issues.map((issue) => issue.path);
    expect(paths).toContain('entityDetails.incorporationDate');
    expect(paths).toContain('shareholders.0.percentageHeld');
  });

  it.each([[30, 2], [31, 2], [31, 4]])('rejects impossible financial year end %i/%i', (endDay, endMonth) => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '202626103M', name: 'Example', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
    draft.financialYear = { endDay, endMonth };
    expect(validateBizFileReview(draft).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'financialYear.endDay' }),
    ]));
  });

  it.each([
    ['entityDetails.entityType', { entityDetails: { uen: '1', name: 'X', entityType: 'MADE_UP', status: 'LIVE' } }],
    ['entityDetails.status', { entityDetails: { uen: '1', name: 'X', entityType: 'PRIVATE_LIMITED', status: 'MADE_UP' } }],
    ['officers.0.role', { officers: [{ name: 'A', role: 'MADE_UP' }] }],
    ['officers.0.identificationType', { officers: [{ name: 'A', role: 'DIRECTOR', identificationType: 'MADE_UP' }] }],
  ])('rejects unsupported enum at %s', (path, override) => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '1', name: 'X', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
    Object.assign(draft, override);
    expect(validateBizFileReview(draft).issues.map((issue) => issue.path)).toContain(path);
  });

  it('accepts supported extraction aliases', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '1', name: 'X', entityType: 'PRIVATE COMPANY LIMITED BY SHARES', status: 'LIVE COMPANY' };
    draft.officers = [{ name: 'A', role: 'COMPANY SECRETARY', identificationType: 'PASSPORT' }];
    expect(validateBizFileReview(draft).isValid).toBe(true);
    expect(normalizeBizFileReviewDraft(draft)).toMatchObject({
      entityDetails: { entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
      officers: [{ role: 'SECRETARY', identificationType: 'PASSPORT' }],
    });
  });

  it('normalizes cleared optional identification types to absent keys', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '1', name: 'X', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
    draft.officers = [{ name: 'A', role: 'DIRECTOR', identificationType: '' }];
    draft.shareholders = [{ name: 'B', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1, identificationType: '' }];
    const normalized = normalizeBizFileReviewDraft(draft);
    expect(normalized.officers?.[0]).not.toHaveProperty('identificationType');
    expect(normalized.shareholders?.[0]).not.toHaveProperty('identificationType');
    expect(validateBizFileReview(draft).isValid).toBe(true);
  });

  it('truly omits undefined normalized keys', () => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { uen: '1', name: 'X', entityType: 'PRIVATE_LIMITED', status: 'LIVE' };
    draft.officers = [];
    const normalized = normalizeBizFileReviewDraft(draft);
    expect(Object.hasOwn(normalized, 'officers')).toBe(false);
  });
});
