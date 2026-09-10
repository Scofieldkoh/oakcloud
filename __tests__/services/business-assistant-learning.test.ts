import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), actionCreate: vi.fn(),
  activeUpdate: vi.fn(), activeFindUnique: vi.fn(), learningCreate: vi.fn(),
  backupFindMany: vi.fn(), access: vi.fn(), operationBarrier: vi.fn(), resolveFreshActor: vi.fn(),
  events: [] as string[],
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
  businessAssistantActionRequest: { findFirst: vi.fn() },
  workspaceBackup: { findMany: mocks.backupFindMany },
  businessAssistantLearningActiveTarget: { findUnique: mocks.activeFindUnique },
  businessAssistantLearningChange: { findMany: mocks.findMany, findFirst: mocks.findFirst, create: mocks.learningCreate },
} }));
vi.mock('@/lib/prisma-transaction', () => ({ runSerializableTransaction: async (_db: unknown, run: (tx: unknown) => unknown) => run({
  businessAssistantLearningChange: { findFirst: mocks.findFirst, update: mocks.update, create: mocks.learningCreate },
  businessAssistantActionRequest: { findFirst: vi.fn().mockResolvedValue(null), create: mocks.actionCreate },
  businessAssistantLearningActiveTarget: { findUnique: mocks.activeFindUnique, update: mocks.activeUpdate },
  workspaceBackup: { findMany: mocks.backupFindMany },
}) }));
vi.mock('@/lib/business-operation-backup-barrier', () => ({ acquireBusinessOperationBarrier: mocks.operationBarrier }));
vi.mock('@/lib/fresh-authorization', () => ({ resolveFreshActor: mocks.resolveFreshActor }));
vi.mock('@/services/business-assistant/policy.service', () => ({ assertAssistantAdministrativeAccess: mocks.access }));

import {
  applyLearningAction,
  createLearningCandidate,
  getActiveLearningConfiguration,
  listLearningChanges,
} from '@/services/business-assistant/learning.service';
import { evaluateLearningCandidateBehavior } from '@/services/business-assistant/learning-behavioral-evaluator';
import { resolveLearningTarget } from '@/services/business-assistant/learning-targets';

const actor = { userId: 'user', tenantId: 'workspace', requestId: 'request' };
const candidate = {
  id: 'change', targetKey: 'assistant.response_detail', targetKind: 'PREFERENCE',
  risk: 'LOW', baselineVersion: '1', candidateVersion: '2', candidateValue: 'concise',
  evidence: {}, evaluation: null, state: 'CANDIDATE', expectedVersion: 1,
  approvedById: null, approvedAt: null, promotedAt: null, rollbackTarget: null,
  createdAt: new Date('2026-09-10T10:00:00.000Z'), updatedAt: new Date('2026-09-10T10:00:00.000Z'),
};
const request = (action: string) => ({ action, expectedVersion: 1, clientRequestId: '1d0fd7b2-16ec-4111-a0f9-6319cc5f9e75' });

describe('governed Business Assistant learning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.access.mockResolvedValue({ isAdmin: true });
    mocks.operationBarrier.mockResolvedValue(undefined);
    mocks.resolveFreshActor.mockResolvedValue({ isWorkspaceAdmin: true, isSuperAdmin: false, internalRole: 'ADMIN' });
    mocks.activeFindUnique.mockResolvedValue(null);
    mocks.backupFindMany.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(candidate);
    mocks.update.mockImplementation(({ data }) => ({
      ...candidate,
      ...data,
      expectedVersion: candidate.expectedVersion + 1,
      updatedAt: new Date(),
    }));
    mocks.learningCreate.mockImplementation(({ data }) => ({ ...candidate, ...data }));
    mocks.actionCreate.mockResolvedValue({ id: 'audit-request' });
  });

  it('runs server-owned held-out runtime behavior cases and keeps release eligibility separate', async () => {
    const result = await applyLearningAction(actor, 'change', request('EVALUATE'));
    expect(result.evaluation).toMatchObject({
      source: 'SERVER_HELD_OUT_BEHAVIORAL_CASES',
      staticChecksPassed: true,
      behavioralEvaluation: 'PASSED',
      promotionEligible: false,
      releaseState: 'GATED_PENDING_RELEASE_REQUIREMENTS',
      passed: true,
      cases: 6,
      passedChecks: 6,
    });
    expect(result.allowedActions).toEqual(['EVALUATE', 'APPROVE', 'REJECT']);
  });

  it('authorizes approval only when the evaluation is cryptographically bound to this candidate', async () => {
    const evaluation = evaluateLearningCandidateBehavior(candidate);
    mocks.findFirst.mockResolvedValue({ ...candidate, state: 'EVALUATED', evaluation });
    mocks.update.mockImplementation(({ data }) => ({ ...candidate, state: 'EVALUATED', evaluation, ...data, expectedVersion: 2, updatedAt: new Date() }));

    const result = await applyLearningAction(actor, 'change', request('APPROVE'));
    expect(result.state).toBe('APPROVED');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ approvedById: 'user', approvedAt: expect.any(Date) }),
    }));
  });

  it('rejects schema-only or copied evaluation evidence', async () => {
    mocks.findFirst.mockResolvedValue({
      ...candidate,
      state: 'EVALUATED',
      evaluation: { source: 'STATIC_VALIDATION', staticChecksPassed: true, passed: true },
    });
    await expect(applyLearningAction(actor, 'change', request('APPROVE'))).rejects.toThrow('held-out behavioral evaluation');

    const evaluation = evaluateLearningCandidateBehavior(candidate);
    mocks.findFirst.mockResolvedValue({ ...candidate, state: 'EVALUATED', candidateValue: 'detailed', evaluation });
    await expect(applyLearningAction(actor, 'change', request('APPROVE'))).rejects.toThrow('held-out behavioral evaluation');
  });

  it('keeps production promotion blocked after valid behavioral evaluation and approval', async () => {
    const evaluation = evaluateLearningCandidateBehavior(candidate);
    mocks.findFirst.mockResolvedValue({ ...candidate, state: 'APPROVED', evaluation, approvedById: 'user', approvedAt: new Date() });
    await expect(applyLearningAction(actor, 'change', request('PROMOTE'))).rejects.toThrow('remains gated');
    expect(mocks.activeUpdate).not.toHaveBeenCalled();
  });

  it('rejects arbitrary runtime, code, and database learning targets', async () => {
    for (const targetKey of ['runtime.provider.model', 'database.url', 'code.worker.dispatch']) {
      await expect(createLearningCandidate(actor, {
        targetKey,
        targetKind: 'PREFERENCE',
        baselineVersion: '1',
        candidateVersion: '2',
        candidateValue: 'concise',
        evidence: {},
      })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    expect(mocks.learningCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'warm', maxSentences: 3, includeCitations: true }],
    ['assistant.prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'direct', maxSentences: 5, includeCitations: false }],
    ['preference.prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'warm', maxSentences: 2, includeCitations: false }],
    ['assistant.preference.prompt_profile', 'assistant.prompt_profile', 'PROMPT_PROFILE', { tone: 'direct', maxSentences: 6, includeCitations: true }],
    ['preference.response_detail', 'assistant.response_detail', 'PREFERENCE', 'detailed'],
    ['assistant.preference.response_detail', 'assistant.response_detail', 'PREFERENCE', 'standard'],
  ] as const)('resolves explicit legacy alias %s to %s', async (targetKey, canonicalTargetKey, targetKind, candidateValue) => {
    const resolved = resolveLearningTarget(targetKey);
    expect(resolved).toMatchObject({ canonicalKey: canonicalTargetKey, aliasUsed: targetKey !== canonicalTargetKey });
    const result = await createLearningCandidate(actor, {
      targetKey, targetKind, baselineVersion: '1', candidateVersion: '2', candidateValue, evidence: {},
    });
    expect(mocks.learningCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ targetKey: canonicalTargetKey, targetKind }),
    }));
    expect(result.targetKey).toBe(canonicalTargetKey);
  });

  it('does not normalize unlisted aliases by prefix stripping', () => {
    expect(resolveLearningTarget('assistant.preference.database.url')).toBeUndefined();
    expect(resolveLearningTarget('preference.runtime.provider')).toBeUndefined();
    expect(resolveLearningTarget('assistant.assistant.response_detail')).toBeUndefined();
  });

  it('takes the business barrier before fresh authorization and candidate writes', async () => {
    mocks.operationBarrier.mockImplementation(async () => { mocks.events.push('business-barrier'); });
    mocks.resolveFreshActor.mockImplementation(async () => {
      mocks.events.push('fresh-authorization');
      return { isWorkspaceAdmin: true, isSuperAdmin: false, internalRole: 'ADMIN' };
    });
    mocks.activeFindUnique.mockImplementation(async () => { mocks.events.push('active-target-read'); return null; });
    mocks.learningCreate.mockImplementation(async ({ data }) => { mocks.events.push('candidate-write'); return { ...candidate, ...data }; });

    await createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail', targetKind: 'PREFERENCE', baselineVersion: '1', candidateVersion: '2', candidateValue: 'detailed', evidence: {},
    });
    expect(mocks.events).toEqual(['business-barrier', 'fresh-authorization', 'active-target-read', 'candidate-write']);
  });

  it('requires real administrator access even for listing learning candidates', async () => {
    mocks.access.mockResolvedValue({ isAdmin: false });
    await expect(listLearningChanges(actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('denies a candidate when authority is revoked after preflight', async () => {
    mocks.resolveFreshActor.mockResolvedValue({ isWorkspaceAdmin: false, isSuperAdmin: false, internalRole: 'STAFF' });
    await expect(createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail', targetKind: 'PREFERENCE', baselineVersion: '1', candidateVersion: '2', candidateValue: 'detailed', evidence: {},
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.learningCreate).not.toHaveBeenCalled();
  });

  it('rechecks the restore pause marker before tenant configuration writes', async () => {
    mocks.backupFindMany.mockResolvedValue([{ status: 'RESTORING', errorDetails: null }]);
    await expect(createLearningCandidate(actor, {
      targetKey: 'assistant.response_detail', targetKind: 'PREFERENCE', baselineVersion: '1', candidateVersion: '2', candidateValue: 'detailed', evidence: {},
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.learningCreate).not.toHaveBeenCalled();
  });

  it('reads an active target only through its explicitly registered canonical alias', async () => {
    mocks.activeFindUnique.mockResolvedValue({ activeVersion: '2', activeValue: 'detailed' });
    await expect(getActiveLearningConfiguration('workspace', 'assistant.preference.response_detail'))
      .resolves.toEqual({ version: '2', value: 'detailed' });
    expect(mocks.activeFindUnique).toHaveBeenCalledWith({
      where: { tenantId_targetKey: { tenantId: 'workspace', targetKey: 'assistant.response_detail' } },
      select: { activeVersion: true, activeValue: true },
    });
  });
});
