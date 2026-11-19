import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  companyFindFirst: vi.fn(),
  resolveOrCreateContact: vi.fn(),
  previewContactIdentity: vi.fn(),
  createCompanyContactRelation: vi.fn(),
  generateBizFileDiff: vi.fn(),
  createAuditLog: vi.fn(),
}));

const tx = {
  $executeRaw: vi.fn(),
  company: { upsert: vi.fn(), update: vi.fn() },
  document: { findUnique: vi.fn(), update: vi.fn() },
  companyFormerName: { deleteMany: vi.fn(), create: vi.fn() },
  companyAddress: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  shareCapital: { deleteMany: vi.fn(), create: vi.fn() },
  companyOfficer: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  companyShareholder: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  companyAuditor: { upsert: vi.fn(), deleteMany: vi.fn() },
  companyCharge: { deleteMany: vi.fn(), create: vi.fn() },
  auditLog: { createMany: vi.fn() },
  processingDocument: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  documentRevision: { create: vi.fn() },
  taskCompanyRecoveryContext: { upsert: vi.fn() },
  serviceScheduleReconciliationRequest: { findUnique: vi.fn(), upsert: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: { company: { findFirst: mocks.companyFindFirst }, $transaction: mocks.transaction },
}));
vi.mock('@/services/contact-identity.service', () => ({
  resolveOrCreateContact: mocks.resolveOrCreateContact,
  previewContactIdentity: mocks.previewContactIdentity,
}));
vi.mock('@/services/contact.service', () => ({ createCompanyContactRelation: mocks.createCompanyContactRelation }));
vi.mock('@/services/bizfile/diff', () => ({ generateBizFileDiff: mocks.generateBizFileDiff }));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock('@/services/document-processing.service', () => ({ prepareDocumentPages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ storage: {} }));

import { normalizeExtractedData } from '@/services/bizfile/normalizer';
import { buildBizFileChangePlan } from '@/services/bizfile/change-plan';
import { buildBizFileContactIdentityCandidates } from '@/components/companies/bizfile-review/bizfile-review-workspace';
import { bizFileReviewSchema, normalizeBizFileReviewDraft, validateBizFileReview, createEmptyBizFileReviewDraft } from '@/lib/validations/bizfile-review';
import type { ExtractedBizFileData } from '@/services/bizfile/types';

const entityDetails = { uen: '202600001A', name: 'Example Pte. Ltd.', entityType: 'PRIVATE_LIMITED', status: 'LIVE' } as const;

function data(extra: Partial<ExtractedBizFileData>): ExtractedBizFileData {
  return { entityDetails: { ...entityDetails }, ...extra } as ExtractedBizFileData;
}

const director = (dateOfBirth?: string) => ({
  name: 'Dana Date', role: 'DIRECTOR', identificationType: 'NRIC', identificationNumber: 'S1234567A',
  nationality: 'Singaporean', ...(dateOfBirth === undefined ? {} : { dateOfBirth }),
});

describe('BizFile date of birth: extraction and normalisation', () => {
  it('keeps a printed, valid date for an officer and an individual shareholder', () => {
    const result = normalizeExtractedData(data({
      officers: [director('1980-01-01') as never],
      shareholders: [{ name: 'Dana Date', type: 'INDIVIDUAL', dateOfBirth: '1975-05-06', shareClass: 'ORDINARY', numberOfShares: 10 } as never],
    }));
    expect(result.officers?.[0].dateOfBirth).toBe('1980-01-01');
    expect(result.shareholders?.[0].dateOfBirth).toBe('1975-05-06');
  });

  it('turns a legacy date-time into its UTC calendar date', () => {
    const result = normalizeExtractedData(data({ officers: [director('1980-01-01T00:00:00.000Z') as never] }));
    expect(result.officers?.[0].dateOfBirth).toBe('1980-01-01');
  });

  it.each([undefined, '', '  ', 'not printed', '1980-02-30', '2999-01-01', '1850-01-01', '01/01/1980'])(
    'drops an absent or invalid date (%j) instead of keeping or clearing anything',
    (bad) => {
      const result = normalizeExtractedData(data({ officers: [director(bad as string | undefined) as never] }));
      expect(result.officers?.[0].dateOfBirth).toBeUndefined();
    },
  );

  it('drops a date on a corporate shareholder', () => {
    const result = normalizeExtractedData(data({
      shareholders: [{ name: 'Acme Pte Ltd', type: 'CORPORATE', dateOfBirth: '1980-01-01', shareClass: 'ORDINARY', numberOfShares: 10 } as never],
    }));
    expect(result.shareholders?.[0].dateOfBirth).toBeUndefined();
  });

  it('never derives a date from the ID number', () => {
    const result = normalizeExtractedData(data({ officers: [director() as never] }));
    expect(result.officers?.[0].dateOfBirth).toBeUndefined();
  });
});

describe('BizFile date of birth: review form validation', () => {
  const draftWith = (dateOfBirth: string | undefined) => {
    const draft = createEmptyBizFileReviewDraft();
    draft.entityDetails = { ...entityDetails } as never;
    draft.officers = [{ name: 'Dana Date', role: 'DIRECTOR', ...(dateOfBirth === undefined ? {} : { dateOfBirth }) } as never];
    return draft;
  };

  it('accepts a real date or none, and keeps the date through normalisation', () => {
    expect(validateBizFileReview(draftWith('1980-01-01')).isValid).toBe(true);
    expect(validateBizFileReview(draftWith(undefined)).isValid).toBe(true);
    expect(validateBizFileReview(draftWith('')).isValid).toBe(true);
    expect(normalizeBizFileReviewDraft(draftWith('1980-01-01')).officers?.[0].dateOfBirth).toBe('1980-01-01');
    expect(normalizeBizFileReviewDraft(draftWith('')).officers?.[0]).not.toHaveProperty('dateOfBirth');
  });

  it.each(['1980-02-30', '2999-01-01', 'soon', '1980-01-01T00:00:00Z'])('rejects %j on an officer', (bad) => {
    const result = validateBizFileReview(draftWith(bad));
    expect(result.isValid).toBe(false);
    expect(result.issuesBySection.officers?.map((issue) => issue.path)).toContain('officers.0.dateOfBirth');
  });

  it('is accepted on shareholders by the schema', () => {
    const parsed = bizFileReviewSchema.safeParse({
      entityDetails,
      shareholders: [{ name: 'Dana', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1, dateOfBirth: '1980-01-01' }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('BizFile date of birth: contact candidates and the review plan', () => {
  it('the review screen passes a valid date to contact matching, and nothing otherwise', () => {
    const withDob = buildBizFileContactIdentityCandidates({ officers: [director('1980-01-01') as never] } as never, ['officers']);
    expect(withDob[0]).toMatchObject({ source: 'BIZFILE', sourceRecordId: 'officers.0', dateOfBirth: '1980-01-01' });
    for (const bad of [undefined, 'junk', '2999-01-01']) {
      const candidate = buildBizFileContactIdentityCandidates({ officers: [director(bad) as never] } as never, ['officers'])[0];
      expect(candidate).not.toHaveProperty('dateOfBirth');
    }
  });

  const baselineWith = (row: Record<string, unknown>) => ({
    company: { id: 'company-1', tenantId: 'tenant-1', uen: entityDetails.uen, name: entityDetails.name, entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
    addresses: [], formerNames: [], shareCapital: [], officers: [row], shareholders: [], auditor: null, charges: [],
    expectedAggregateRevision: 1,
  });
  const storedOfficer = { id: 'officer-1', name: 'Dana Date', role: 'DIRECTOR', identificationType: 'NRIC', identificationNumber: 'S1234567A', nationality: 'Singaporean' };

  const plan = (officer: Record<string, unknown>) => buildBizFileChangePlan({
    mode: 'UPDATE', tenantId: 'tenant-1', documentId: 'document-1', targetCompanyId: 'company-1',
    reviewedData: normalizeExtractedData(data({ officers: [officer as never] })),
    baseline: baselineWith(storedOfficer) as never,
    sourceVersion: 0,
  });

  it('a printed date makes the person a reviewable change, shown with the date', () => {
    const officerChange = plan(director('1980-01-01')).changes.find((change) => change.path === 'officers');
    expect(officerChange?.operation).toBe('UPDATE');
    expect((officerChange?.after as { dateOfBirth?: string }).dateOfBirth).toBe('1980-01-01');
  });

  it('no printed date and an invalid one add nothing to the plan for an unchanged person', () => {
    expect(plan(director()).changes.filter((change) => change.path === 'officers')).toEqual([]);
    expect(plan(director('2999-01-01')).changes.filter((change) => change.path === 'officers')).toEqual([]);
  });
});

describe('BizFile date of birth: the apply step hands the date to the contact resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.companyFindFirst.mockResolvedValue(null);
    mocks.previewContactIdentity.mockResolvedValue(null);
    mocks.resolveOrCreateContact.mockResolvedValue({ contact: { id: 'contact-1' } });
    tx.company.upsert.mockResolvedValue({ id: 'company-1' });
    tx.$executeRaw.mockResolvedValue(0);
    tx.companyAddress.findFirst.mockResolvedValue(null);
    tx.processingDocument.create.mockResolvedValue({ id: 'processing-1' });
    tx.documentRevision.create.mockResolvedValue({ id: 'revision-1' });
    tx.processingDocument.findUnique.mockResolvedValue({ id: 'processing-existing' });
    tx.companyShareholder.findMany.mockResolvedValue([]);
    tx.serviceScheduleReconciliationRequest.findUnique.mockResolvedValue(null);
    tx.serviceScheduleReconciliationRequest.upsert.mockResolvedValue({ id: 'reconciliation-1' });
  });

  it('sends a valid date, sends none when absent or invalid, and never one for a corporate shareholder', async () => {
    const { processBizFileExtraction } = await import('@/services/bizfile/processor');
    await processBizFileExtraction('doc-1', data({
      officers: [director('1980-01-01') as never, { ...director(), name: 'No Date', identificationNumber: 'S7654321B' } as never],
      shareholders: [
        { name: 'Acme Pte Ltd', type: 'CORPORATE', identificationType: 'UEN', identificationNumber: '202400001A', dateOfBirth: '1980-01-01', shareClass: 'ORDINARY', numberOfShares: 1 } as never,
      ],
    }), 'user-1', 'tenant-1');

    const calls = mocks.resolveOrCreateContact.mock.calls.map(([candidate]) => candidate);
    expect(calls[0]).toMatchObject({ source: 'BIZFILE', sourceRecordId: 'officers.0', dateOfBirth: '1980-01-01' });
    expect(calls[1]).not.toHaveProperty('dateOfBirth');
    expect(calls[2]).toMatchObject({ contactType: 'CORPORATE' });
    expect(calls[2]).not.toHaveProperty('dateOfBirth');
  });
});
