import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), targetUpdate: vi.fn(),
  actionFindFirst: vi.fn(), activeFindUnique: vi.fn(), learningCreate: vi.fn(),
  backupFindMany: vi.fn(), access: vi.fn(), operationBarrier: vi.fn(), resolveFreshActor: vi.fn(),
  events: [] as string[],
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  businessAssistantActionRequest: { findFirst: mocks.actionFindFirst },
  workspaceBackup: { findMany: mocks.backupFindMany },
  businessAssistantLearningActiveTarget: { findUnique: mocks.activeFindUnique },
  businessAssistantLearningChange: {
    findFirst: mocks.findFirst,
    create: mocks.learningCreate,
  },
} }));
vi.mock('@/lib/prisma-transaction', () => ({ runSerializableTransaction: async (_db: unknown, run: (tx: unknown) => unknown) => run({
  businessAssistantLearningChange: { findFirst: mocks.findFirst, update: mocks.update, create: mocks.learningCreate },
  businessAssistantActionRequest: { findFirst: mocks.actionFindFirst, create: mocks.create },
  businessAssistantLearningActiveTarget: { findUnique: mocks.activeFindUnique, update: mocks.targetUpdate },
  workspaceBackup: { findMany: mocks.backupFindMany },
}) }));
vi.mock('@/lib/business-operation-backup-barrier', () => ({ acquireBusinessOperationBarrier: mocks.operationBarrier }));
vi.mock('@/lib/fresh-authorization', () => ({ resolveFreshActor: mocks.resolveFreshActor }));
vi.mock('@/services/business-assistant/policy.service', () => ({ assertAssistantAdministrativeAccess: mocks.access }));

import {
  applyLearningAction,
  createLearningCandidate,
  getActiveLearningConfiguration,
} from '@/services/business-assistant/learning.service';

const actor = { userId: 'user', tenantId: 'workspace', requestId: 'request' };
const candidate = {
  id: 'change', targetKey: 'assistant.response_detail', targetKind: 'PREFERENCE',
  risk: 'LOW', baselineVersion: '1', candidateVersion: '2', candidateValue: 'concise',
  evidence: {}, evaluation: null, state: 'CANDIDATE', expectedVersion: 1,
  approvedById: null, approvedAt: null, promotedAt: null, rollbackTarget: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const request = (action: string) => ({ action, expectedVersion: 1, clientRequestId: '1d0fd7b2-16ec-4111-a0f9-6319cc5f9e75' });

describe('learning evaluation provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.access.mockResolvedValue({ isAdmin: true });
    mocks.operationBarrier.mockResolvedValue(undefined);
    mocks.resolveFreshActor.mockResolvedValue({ isWorkspaceAdmin: true, isSuperAdmin: false, internalRole: 'ADMIN' });
    mocks.actionFindFirst.mockResolvedValue(null);
    mocks.activeFindUnique.mockResolvedValue(null);
    mocks.backupFindMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(candidate);
    mocks.update.mockImplementation(({ data }) => ({ ...candidate, ...data, expectedVersion: 2 }));
    mocks.learningCreate.mockImplementation(({ data }) => ({ ...candidate, ...data }));
  });

  it('reports schema checks honestly and does not offer approval', async () => {
    const result = await applyLearningAction(actor, 'change', request('EVALUATE'));
    expect(result.evaluation).toMatchObject({ source: 'STATIC_VALIDATION', staticChecksPassed: true,
      behavioralEvaluation: 'NOT_RUN', promotionEligible: false, passed: false });
    expect(result.evaluation).not.toHaveProperty('safetyRate');
    expect(result.allowedActions).toEqual(['EVALUATE', 'REJECT']);
  });

  it.each(['APPROVE', 'PROMOTE'])('rejects %s even for an old falsely passing evaluation', async (action) => {
    mocks.findFirst.mockResolvedValue({ ...candidate, state: action === 'APPROVE' ? 'EVALUATED' : 'APPROVED',
      evaluation: { source: 'SERVER_HELD_OUT_CASES', passed: true, safetyRate: 1 } });
    await expect(applyLearningAction(actor, 'change', request(action))).rejects.toThrow('held-out behavioral evaluation');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.targetUpdate).not.toHaveBeenCalled();
  });

  it('rejects a learning mutation when fresh workspace-admin authority is revoked', async () => {
    mocks.access.mockResolvedValue({ isAdmin: false });

    await expect(applyLearningAction(actor, 'change', request('EVALUATE')))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.actionFindFirst).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a non-admin learning candidate before creating tenant configuration', async () => {
    mocks.access.mockResolvedValue({ isAdmin: false });

    await expect(createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail',
      targetKind: 'PREFERENCE',
      baselineVersion: '1',
      candidateVersion: '2',
      candidateValue: 'detailed',
      evidence: {},
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.activeFindUnique).not.toHaveBeenCalled();
    expect(mocks.learningCreate).not.toHaveBeenCalled();
  });

  it('takes the business barrier before transaction authorization and candidate writes', async () => {
    mocks.operationBarrier.mockImplementation(async () => { mocks.events.push('business-barrier'); });
    mocks.resolveFreshActor.mockImplementation(async () => {
      mocks.events.push('fresh-authorization');
      return { isWorkspaceAdmin: true, isSuperAdmin: false, internalRole: 'ADMIN' };
    });
    mocks.activeFindUnique.mockImplementation(async () => {
      mocks.events.push('active-target-read');
      return null;
    });
    mocks.learningCreate.mockImplementation(async ({ data }) => {
      mocks.events.push('candidate-write');
      return { ...candidate, ...data };
    });

    await createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail',
      targetKind: 'PREFERENCE',
      baselineVersion: '1',
      candidateVersion: '2',
      candidateValue: 'detailed',
      evidence: {},
    });

    expect(mocks.events).toEqual(['business-barrier', 'fresh-authorization', 'active-target-read', 'candidate-write']);
    expect(mocks.operationBarrier).toHaveBeenCalledWith(expect.anything(), 'workspace', 'shared');
  });

  it('denies a candidate when authority is revoked after the preflight check', async () => {
    mocks.resolveFreshActor.mockResolvedValue({ isWorkspaceAdmin: false, isSuperAdmin: false, internalRole: 'STAFF' });

    await expect(createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail',
      targetKind: 'PREFERENCE',
      baselineVersion: '1',
      candidateVersion: '2',
      candidateValue: 'detailed',
      evidence: {},
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.activeFindUnique).not.toHaveBeenCalled();
    expect(mocks.learningCreate).not.toHaveBeenCalled();
  });

  it('denies an action when authority is revoked after the preflight check', async () => {
    mocks.resolveFreshActor.mockResolvedValue({ isWorkspaceAdmin: false, isSuperAdmin: false, internalRole: 'STAFF' });

    await expect(applyLearningAction(actor, 'change', request('EVALUATE')))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.actionFindFirst).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rechecks the restore pause marker before creating tenant configuration', async () => {
    mocks.backupFindMany.mockResolvedValue([{ status: 'RESTORING', errorDetails: null }]);

    await expect(createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail',
      targetKind: 'PREFERENCE',
      baselineVersion: '1',
      candidateVersion: '2',
      candidateValue: 'detailed',
      evidence: {},
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.activeFindUnique).not.toHaveBeenCalled();
    expect(mocks.learningCreate).not.toHaveBeenCalled();
  });

  it('blocks a non-admin candidate owner from rolling back the tenant active target', async () => {
    mocks.access.mockResolvedValue({ isAdmin: false });
    mocks.findFirst.mockResolvedValue({
      ...candidate,
      state: 'PROMOTED',
      rollbackTarget: '1',
    });

    await expect(applyLearningAction(actor, 'change', request('ROLLBACK')))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.activeFindUnique).not.toHaveBeenCalled();
    expect(mocks.targetUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'warm', maxSentences: 3, includeCitations: true }],
    ['assistant.prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'direct', maxSentences: 5, includeCitations: false }],
    ['preference.prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'warm', maxSentences: 2, includeCitations: false }],
    ['assistant.preference.prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'direct', maxSentences: 6, includeCitations: true }],
    ['preference.response_detail', 'assistant.response_detail', 'PREFERENCE', 'detailed'],
    ['assistant.preference.response_detail', 'assistant.response_detail', 'PREFERENCE', 'standard'],
  ] as const)('canonicalizes %s to one allowlisted active target key', async (targetKey, canonicalTargetKey, targetKind, candidateValue) => {
    const result = await createLearningCandidate(actor, {
      targetKey,
      targetKind,
      baselineVersion: '1',
      candidateVersion: '2',
      candidateValue,
      evidence: {},
    });

    expect(mocks.activeFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_targetKey: { tenantId: 'workspace', targetKey: canonicalTargetKey } },
    }));
    expect(mocks.learningCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ targetKey: canonicalTargetKey, targetKind }),
    }));
    expect(result.targetKey).toBe(canonicalTargetKey);
  });

  it('reads an active target through its canonical alias', async () => {
    mocks.activeFindUnique.mockResolvedValue({ activeVersion: '2', activeValue: 'detailed' });

    await expect(getActiveLearningConfiguration('workspace', 'assistant.preference.response_detail'))
      .resolves.toEqual({ version: '2', value: 'detailed' });
    expect(mocks.activeFindUnique).toHaveBeenCalledWith({
      where: { tenantId_targetKey: { tenantId: 'workspace', targetKey: 'assistant.response_detail' } },
      select: { activeVersion: true, activeValue: true },
    });
  });
});
