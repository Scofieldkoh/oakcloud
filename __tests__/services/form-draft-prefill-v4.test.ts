import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormField } from '@/generated/prisma';
import { createPrefilledFormDraft, sanitizePublicAnswers } from '@/services/form-draft.service';

const mocks = vi.hoisted(() => ({
  formFindFirst: vi.fn(),
  draftCreate: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    form: { findFirst: mocks.formFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit }));
vi.mock('@/lib/email', () => ({
  getAppBaseUrl: () => 'https://app.example.test',
  sendEmail: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({ storage: { delete: vi.fn() } }));

const tenantId = 'tenant-1';
const userId = 'staff-1';
const formId = '22222222-2222-4222-8222-222222222222';
const companyId = '11111111-1111-4111-8111-111111111111';
const fields = [
  { key: 'prefill_source', type: 'HIDDEN', inputType: null, condition: null },
  { key: 'people_section', type: 'PAGE_BREAK', inputType: 'repeat_start', condition: null },
  { key: 'person_record_id', type: 'HIDDEN', inputType: null, condition: null },
  { key: 'person_shareholding', label: 'Shareholdings by class',
    type: 'SHORT_TEXT', inputType: 'shareholding_list', condition: null },
  { key: 'people_end', type: 'PAGE_BREAK', inputType: 'repeat_end', condition: null },
] as FormField[];
const answers = {
  prefill_source: 'company_record',
  person_record_id: ['person:director-1', 'person:director-2'],
  person_shareholding: [
    [{ shareClass: 'ORDINARY', shares: '00012' }, { shareClass: 'PREFERENCE', shares: '3' }],
    [],
  ],
};
const metadata = {
  companyId, companyAggregateRevision: 12,
  createdAt: '2026-11-15T00:00:00.000Z', createdById: userId,
  baseline: answers,
  repeatSectionCounts: { people_section: 2 },
};
const params = { tenantId, userId };

const published = (version: number, formFields = fields) => ({
  id: formId, tenantId, slug: 'annual-return-v4', status: 'PUBLISHED', deletedAt: null,
  settings: {
    template: { key: 'sg_annual_return_declaration', version, installedAt: '',
      lockedAt: '2026-11-15T00:00:00.000Z', definitionHash: null },
    drafts: { enabled: true, autoDeleteDays: 30 },
  },
  fields: formFields,
});

describe('Annual Return prefilled drafts support published template revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formFindFirst.mockResolvedValue(published(4));
    mocks.draftCreate.mockResolvedValue({ id: 'draft-id', code: 'AbC12' });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ formDraft: { create: mocks.draftCreate } }));
    mocks.audit.mockResolvedValue(undefined);
  });

  it('creates a private v4 prefilled draft and preserves structured share classes and quantities', async () => {
    const result = await createPrefilledFormDraft(formId, answers, metadata, params);
    expect(result.resumeUrl).toContain('/forms/f/annual-return-v4?draft=');
    expect(result.resumeUrl).toContain('resume=');
    expect(mocks.formFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: formId, tenantId, status: 'PUBLISHED', deletedAt: null },
    }));
    expect(mocks.draftCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        formId, tenantId,
        answers: expect.objectContaining({
          person_record_id: ['person:director-1', 'person:director-2'],
          person_shareholding: [
            [{ shareClass: 'ORDINARY', shares: '12' }, { shareClass: 'PREFERENCE', shares: '3' }],
            [],
          ],
        }),
      }),
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, userId, entityType: 'FormDraft',
    }));
  });

  it('retains structured shareholdings when a respondent saves a repeated-person draft', () => {
    expect(sanitizePublicAnswers(fields, answers, new Set()).person_shareholding).toEqual([
      [{ shareClass: 'ORDINARY', shares: '12' }, { shareClass: 'PREFERENCE', shares: '3' }],
      [],
    ]);
  });

  it('accepts the combined people section in published v3 revisions', async () => {
    mocks.formFindFirst.mockResolvedValue(published(3));
    await expect(createPrefilledFormDraft(formId, answers, metadata, params))
      .resolves.toHaveProperty('draftId', 'draft-id');
  });

  it('continues to accept legacy v2 officer sections', async () => {
    mocks.formFindFirst.mockResolvedValue(published(2, [
      { key: 'officers_section', type: 'PAGE_BREAK', inputType: 'repeat_start' },
    ] as FormField[]));
    await expect(createPrefilledFormDraft(formId, answers, metadata, params))
      .resolves.toHaveProperty('draftId', 'draft-id');
  });

  it('rejects a published v4 form without the required people section', async () => {
    mocks.formFindFirst.mockResolvedValue(published(4, [
      { key: 'officers_section', type: 'PAGE_BREAK', inputType: 'repeat_start' },
    ] as FormField[]));
    await expect(createPrefilledFormDraft(formId, answers, metadata, params))
      .rejects.toThrow('Publish a compatible Annual Return Declaration form');
    expect(mocks.draftCreate).not.toHaveBeenCalled();
  });

  it('rejects unpublished, missing, or cross-tenant forms via the scoped query', async () => {
    mocks.formFindFirst.mockResolvedValue(null);
    await expect(createPrefilledFormDraft(formId, answers, metadata, params))
      .rejects.toThrow('Publish a compatible Annual Return Declaration form');
    expect(mocks.draftCreate).not.toHaveBeenCalled();
  });
});
