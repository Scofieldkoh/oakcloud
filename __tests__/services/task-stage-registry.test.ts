import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TaskStageActionType,
  TaskStageStatus,
  TaskStatus,
} from '@/generated/prisma';

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  transaction: vi.fn(),
  versionFindFirst: vi.fn(),
  taskCreate: vi.fn(),
  taskFindFirst: vi.fn(),
  taskUpdate: vi.fn(),
  stageCreate: vi.fn(),
  stageFindFirst: vi.fn(),
  stageFindMany: vi.fn(),
  stageUpdate: vi.fn(),
  checklistCreateMany: vi.fn(),
  outcomeUpsert: vi.fn(),
  companyFindFirst: vi.fn(),
  documentFindFirst: vi.fn(),
  envelopeFindFirst: vi.fn(),
  recoveryFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  checklistFindFirst: vi.fn(),
  checklistUpdate: vi.fn(),
  rawQuery: vi.fn(),
}));

const tx = {
  taskPipelineVersion: { findFirst: mocks.versionFindFirst },
  task: {
    create: mocks.taskCreate,
    findFirst: mocks.taskFindFirst,
    update: mocks.taskUpdate,
  },
  taskStage: {
    create: mocks.stageCreate,
    findFirst: mocks.stageFindFirst,
    findMany: mocks.stageFindMany,
    update: mocks.stageUpdate,
  },
  taskStageOutcome: { upsert: mocks.outcomeUpsert },
  company: { findFirst: mocks.companyFindFirst },
  generatedDocument: { findFirst: mocks.documentFindFirst },
  esigningEnvelope: { findFirst: mocks.envelopeFindFirst },
  user: { findFirst: mocks.userFindFirst },
  taskStageChecklistItem: {
    createMany: mocks.checklistCreateMany,
    findFirst: mocks.checklistFindFirst,
    update: mocks.checklistUpdate,
  },
  $queryRaw: mocks.rawQuery,
};

function expectTaskLock(taskId = 'task-1', tenantId = 'tenant-a') {
  const query = mocks.rawQuery.mock.calls
    .map(([value]) => value as { sql?: string; values?: unknown[] })
    .find((value) => value.sql?.includes('FROM tasks')) as {
    sql?: string;
    values?: unknown[];
  } | undefined;
  expect(query?.sql).toContain('FOR UPDATE');
  expect(query?.sql).toContain('tenant_id');
  expect(query?.values).toEqual([taskId, tenantId]);
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    taskStage: { findFirst: mocks.stageFindFirst },
    generatedDocument: { findFirst: mocks.documentFindFirst },
    company: { findFirst: mocks.companyFindFirst },
    taskCompanyRecoveryContext: { findFirst: mocks.recoveryFindFirst },
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: mocks.audit,
}));

import {
  getStageActionAdapter,
  resolveStageActionOutcome,
} from '@/services/tasks/action-registry';
import { createTask } from '@/services/tasks/task.service';
import {
  archiveTask,
  cancelTask,
  pauseTask,
  resumeTask,
  updateTaskMetadata,
} from '@/services/tasks/task.service';
import {
  completeTaskStage,
  getTaskStageDetail,
  linkTaskStageOutcome,
  reconcileTaskStageOutcome,
  reopenTaskStage,
  skipTaskStage,
  updateTaskStageChecklistItem,
  updateTaskStageMetadata,
  recoverTaskStageOutcomeFromDurableContext,
} from '@/services/tasks/stage.service';

describe('Company recovery ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.companyFindFirst.mockResolvedValue(null);
  });

  it('ignores a recovery row whose task does not own the requested stage', async () => {
    mocks.recoveryFindFirst.mockResolvedValue({
      taskId: 'task-other',
      company: { id: 'company-b' },
    });

    await expect(recoverTaskStageOutcomeFromDurableContext('tenant-a', {
      id: 'stage-1',
      taskId: 'task-1',
      actionType: TaskStageActionType.COMPANY_PROFILE,
    })).resolves.toBe(false);

    expect(mocks.recoveryFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        taskId: 'task-1',
        taskStageId: 'stage-1',
        taskStage: {
          actionType: TaskStageActionType.COMPANY_PROFILE,
          taskId: 'task-1',
          tenantId: 'tenant-a',
        },
        company: { deletedAt: null, tenantId: 'tenant-a' },
      },
      select: {
        taskId: true,
        company: { select: { id: true } },
      },
    });
    expect(mocks.outcomeUpsert).not.toHaveBeenCalled();
  });
});

describe('stage action registry', () => {
  it('provides curated defaults, blockers, and launch context', () => {
    const adapter = getStageActionAdapter(TaskStageActionType.COMPANY_PROFILE);
    const context = {
      tenantId: 'tenant-a',
      stage: {
        id: 'stage-1',
        tenantId: 'tenant-a',
        taskId: 'task-1',
        actionType: TaskStageActionType.COMPANY_PROFILE,
        actionConfig: null,
        status: TaskStageStatus.NOT_STARTED,
        task: { companyId: null },
      },
    };

    expect(adapter.defaultIcon).toBe('Building2');
    expect(adapter.blockers(context)).toEqual([
      expect.objectContaining({ code: 'COMPANY_REQUIRED' }),
    ]);
    expect(adapter.launch(context)).toEqual({
      href: '/companies/new',
      context: { taskId: 'task-1', taskStageId: 'stage-1' },
    });
  });

  it('derives authoritative company and document outcomes', () => {
    const company = resolveStageActionOutcome(TaskStageActionType.COMPANY_PROFILE, {
      type: 'COMPANY',
      entity: { kind: 'company', id: 'company-1', name: 'Acme' },
    });
    const draft = resolveStageActionOutcome(TaskStageActionType.DOCUMENT_GENERATION, {
      type: 'GENERATED_DOCUMENT',
      entity: { kind: 'generatedDocument', id: 'document-1', title: 'Resolution', status: 'DRAFT' },
    });
    const finalized = resolveStageActionOutcome(TaskStageActionType.DOCUMENT_GENERATION, {
      type: 'GENERATED_DOCUMENT',
      entity: { kind: 'generatedDocument', id: 'document-1', title: 'Resolution', status: 'FINALIZED' },
    });

    expect(company.status).toBe(TaskStageStatus.COMPLETED);
    expect(draft.status).toBe(TaskStageStatus.IN_PROGRESS);
    expect(finalized.status).toBe(TaskStageStatus.COMPLETED);
  });

  it('fails terminal e-signing outcomes and completes only when all required signatures complete', () => {
    const adapter = getStageActionAdapter(TaskStageActionType.ESIGNING);
    const envelope = (status: string, completedSignatures: number, requiredSignatures = 2) => ({
      type: 'ESIGNING_ENVELOPE' as const,
      entity: {
        kind: 'esigningEnvelope' as const,
        id: 'envelope-1',
        title: 'Engagement letter',
        status,
        requiredSignatures,
        completedSignatures,
      },
    });

    expect(adapter.deriveStatus(envelope('IN_PROGRESS', 1))).toBe(TaskStageStatus.IN_PROGRESS);
    expect(adapter.deriveStatus(envelope('COMPLETED', 2))).toBe(TaskStageStatus.COMPLETED);
    expect(adapter.deriveStatus(envelope('DECLINED', 1))).toBe(TaskStageStatus.FAILED);
    expect(adapter.deriveStatus(envelope('EXPIRED', 0))).toBe(TaskStageStatus.FAILED);
    expect(adapter.deriveStatus(envelope('VOIDED', 0))).toBe(TaskStageStatus.FAILED);
  });
});

describe('task snapshots and stage mutations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      status: TaskStatus.NOT_STARTED,
      title: 'Annual return',
      companyId: null,
    }]);
  });

  describe('stage-authoritative Company callback ordering', () => {
    const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let recoveryCompanyId = companyA;

    beforeEach(() => {
      mocks.stageFindFirst.mockResolvedValue({
        id: 'stage-1',
        tenantId: 'tenant-a',
        taskId: 'task-1',
        actionType: TaskStageActionType.COMPANY_PROFILE,
        status: TaskStageStatus.NOT_STARTED,
        startedAt: null,
        task: {
          id: 'task-1',
          status: TaskStatus.NOT_STARTED,
          companyId: null,
          deletedAt: null,
        },
        outcome: null,
        checklistItems: [],
      });
      mocks.rawQuery.mockImplementation((query: { sql?: string }) => {
        if (query.sql?.includes('task_company_recovery_contexts')) {
          return Promise.resolve([{
            taskId: 'task-1',
            companyId: recoveryCompanyId,
          }]);
        }
        return Promise.resolve([{
          id: 'task-1',
          tenantId: 'tenant-a',
          status: TaskStatus.NOT_STARTED,
          title: 'Onboarding',
          companyId: null,
        }]);
      });
      mocks.companyFindFirst.mockImplementation(({ where }: {
        where: { id: string };
      }) => Promise.resolve({ id: where.id, name: `Company ${where.id}` }));
      mocks.outcomeUpsert.mockResolvedValue({ id: 'outcome-1' });
      mocks.stageUpdate.mockResolvedValue({ id: 'stage-1' });
      mocks.stageFindMany.mockResolvedValue([{ status: TaskStageStatus.COMPLETED }]);
      mocks.taskUpdate.mockResolvedValue({ id: 'task-1' });
    });

    it('does not let delayed Company A overwrite Company B after B recovery commits', async () => {
      recoveryCompanyId = companyB;

      const result = await linkTaskStageOutcome('tenant-a', 'stage-1', {
        type: 'COMPANY',
        companyId: companyA,
      }, 'user-1');

      expect(result).toEqual(expect.objectContaining({
        stale: true,
        authoritativeCompanyId: companyB,
      }));
      expect(mocks.outcomeUpsert).not.toHaveBeenCalled();
      expect(mocks.taskUpdate).not.toHaveBeenCalled();
      expect(mocks.stageUpdate).not.toHaveBeenCalled();
    });

    it('lets Company B win when A links before the B recovery commit', async () => {
      recoveryCompanyId = companyA;
      await linkTaskStageOutcome('tenant-a', 'stage-1', {
        type: 'COMPANY',
        companyId: companyA,
      }, 'user-1');

      recoveryCompanyId = companyB;
      await linkTaskStageOutcome('tenant-a', 'stage-1', {
        type: 'COMPANY',
        companyId: companyB,
      }, 'user-1');

      expect(mocks.outcomeUpsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
        update: expect.objectContaining({ companyId: companyA }),
      }));
      expect(mocks.outcomeUpsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
        update: expect.objectContaining({ companyId: companyB }),
      }));
      expect(mocks.taskUpdate).toHaveBeenLastCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.COMPLETED },
      });
    });

    it('links the same authoritative Company idempotently', async () => {
      recoveryCompanyId = companyB;

      await linkTaskStageOutcome('tenant-a', 'stage-1', {
        type: 'COMPANY',
        companyId: companyB,
      }, 'user-1');
      await linkTaskStageOutcome('tenant-a', 'stage-1', {
        type: 'COMPANY',
        companyId: companyB,
      }, 'user-1');

      expect(mocks.outcomeUpsert).toHaveBeenCalledTimes(2);
      expect(mocks.outcomeUpsert).toHaveBeenLastCalledWith(expect.objectContaining({
        update: expect.objectContaining({ companyId: companyB }),
      }));
    });
  });

  describe('Company outcome self-healing on stage reads', () => {
    const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let currentOutcome: {
      id: string;
      type: 'COMPANY';
      companyId: string | null;
      generatedDocumentId: null;
      esigningEnvelopeId: null;
    } | null;
    let recoveryCompanyId: string | null;
    let hasRecovery: boolean;
    let deletedCompanyId: string | null;
    let taskCompanyId: string | null;
    let currentStageStatus: TaskStageStatus;
    let currentTaskStatus: TaskStatus;
    let currentCompletedAt: Date | null;

    beforeEach(() => {
      currentOutcome = {
        id: 'outcome-1',
        type: 'COMPANY',
        companyId: companyA,
        generatedDocumentId: null,
        esigningEnvelopeId: null,
      };
      recoveryCompanyId = companyB;
      hasRecovery = true;
      deletedCompanyId = null;
      taskCompanyId = companyA;
      currentStageStatus = TaskStageStatus.COMPLETED;
      currentTaskStatus = TaskStatus.COMPLETED;
      currentCompletedAt = new Date();
      mocks.stageFindFirst.mockImplementation(() => Promise.resolve({
        id: 'stage-1',
        tenantId: 'tenant-a',
        taskId: 'task-1',
        actionType: TaskStageActionType.COMPANY_PROFILE,
        actionConfig: null,
        status: currentStageStatus,
        isRequired: true,
        startedAt: new Date(),
        completedAt: currentCompletedAt,
        task: {
          id: 'task-1',
          status: currentTaskStatus,
          companyId: taskCompanyId,
          deletedAt: null,
        },
        outcome: currentOutcome,
        checklistItems: [],
      }));
      mocks.rawQuery.mockImplementation((query: { sql?: string }) => {
        if (query.sql?.includes('task_company_recovery_contexts')) {
          return Promise.resolve(hasRecovery ? [{
            taskId: 'task-1',
            companyId: recoveryCompanyId,
          }] : []);
        }
        return Promise.resolve([{
          id: 'task-1',
          tenantId: 'tenant-a',
          status: currentTaskStatus,
          title: 'Onboarding',
          companyId: taskCompanyId,
        }]);
      });
      mocks.companyFindFirst.mockImplementation(({ where }: {
        where: { id: string; deletedAt?: null };
      }) => {
        if (where.deletedAt === null && where.id === deletedCompanyId) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: where.id,
          name: where.id === companyB ? 'Company B' : 'Company A',
          deletedAt: where.id === deletedCompanyId ? new Date() : null,
        });
      });
      mocks.outcomeUpsert.mockImplementation(({ update }: {
        update: { companyId: string | null };
      }) => {
        currentOutcome = {
          id: currentOutcome?.id ?? 'outcome-1',
          type: 'COMPANY',
          companyId: update.companyId,
          generatedDocumentId: null,
          esigningEnvelopeId: null,
        };
        return Promise.resolve(currentOutcome);
      });
      mocks.stageUpdate.mockImplementation(({ data }: {
        data: { status?: TaskStageStatus; completedAt?: Date | null };
      }) => {
        if (data.status) currentStageStatus = data.status;
        if ('completedAt' in data) currentCompletedAt = data.completedAt ?? null;
        return Promise.resolve({ id: 'stage-1' });
      });
      mocks.stageFindMany.mockImplementation(() => Promise.resolve([
        { status: currentStageStatus },
      ]));
      mocks.taskUpdate.mockImplementation(({ data }: {
        data: { companyId?: string | null; status?: TaskStatus };
      }) => {
        if ('companyId' in data) taskCompanyId = data.companyId ?? null;
        if (data.status) currentTaskStatus = data.status;
        return Promise.resolve({ id: 'task-1' });
      });
    });

    it('replaces stored Company A with recovery Company B when B callback was missed', async () => {
      const detail = await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');

      expect(mocks.outcomeUpsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ companyId: companyB }),
      }));
      expect(mocks.taskUpdate).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { companyId: companyB },
      });
      expect(detail.outcomeSummary).toBe('Linked company: Company B');
      expect(mocks.audit).toHaveBeenCalledTimes(1);
      const taskLockOrder = mocks.rawQuery.mock.calls.findIndex(
        ([query]) => (query as { sql?: string }).sql?.includes('FROM tasks'),
      );
      const recoveryLockOrder = mocks.rawQuery.mock.calls.findIndex(
        ([query]) => (query as { sql?: string }).sql?.includes('task_company_recovery_contexts'),
      );
      expect(taskLockOrder).toBeLessThan(recoveryLockOrder);
    });

    it('does not rewrite a matching recovery outcome or a manual outcome without recovery', async () => {
      recoveryCompanyId = companyA;
      await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');
      expect(mocks.outcomeUpsert).not.toHaveBeenCalled();

      vi.clearAllMocks();
      hasRecovery = false;
      await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');
      expect(mocks.outcomeUpsert).not.toHaveBeenCalled();
    });

    it('replaces stale A with deleted recovery B and persists attention state', async () => {
      deletedCompanyId = companyB;

      const detail = await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');

      expect(mocks.outcomeUpsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ companyId: companyB }),
      }));
      expect(mocks.stageUpdate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: TaskStageStatus.FAILED }),
      }));
      expect(detail.status).toBe(TaskStageStatus.FAILED);
    });

    it.each([
      ['stale Company A outcome', true],
      ['no stored outcome', false],
    ])('persists a hard-delete tombstone with %s', async (_label, hasStoredOutcome) => {
      currentOutcome = hasStoredOutcome ? currentOutcome : null;
      recoveryCompanyId = null;

      const first = await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');
      const second = await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');

      expect(mocks.outcomeUpsert).toHaveBeenCalledWith(expect.objectContaining({
        update: expect.objectContaining({ companyId: null }),
      }));
      expect(mocks.taskUpdate).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { companyId: null },
      });
      expect(first.status).toBe(TaskStageStatus.FAILED);
      expect(second.status).toBe(TaskStageStatus.FAILED);
    });

    it('replaces a hard-delete tombstone with a later Company C recovery', async () => {
      const companyC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      recoveryCompanyId = null;
      await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');

      recoveryCompanyId = companyC;
      const detail = await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');

      expect(mocks.outcomeUpsert).toHaveBeenLastCalledWith(expect.objectContaining({
        update: expect.objectContaining({ companyId: companyC }),
      }));
      expect(detail.status).toBe(TaskStageStatus.COMPLETED);
    });

    it('attributes hard-delete tombstone self-heal audits to the deleter', async () => {
      recoveryCompanyId = null;

      await getTaskStageDetail(
        'tenant-a',
        'task-1',
        'stage-1',
        'deleter-user',
      );

      expect(mocks.audit).toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledTimes(1);
      expect(mocks.audit.mock.calls.every(
        ([entry]) => (entry as { userId?: string }).userId === 'deleter-user',
      )).toBe(true);
    });

    it('allows detail-read recovery to audit without an explicit actor', async () => {
      recoveryCompanyId = null;

      await getTaskStageDetail('tenant-a', 'task-1', 'stage-1');

      expect(mocks.audit).toHaveBeenCalled();
      expect(mocks.audit.mock.calls.every(
        ([entry]) => (entry as { userId?: string }).userId === undefined,
      )).toBe(true);
    });

    it('does not re-audit an unchanged Company correction on later reads', async () => {
      await getTaskStageDetail('tenant-a', 'task-1', 'stage-1', 'deleter-user');
      expect(mocks.audit).toHaveBeenCalledTimes(1);

      mocks.audit.mockClear();
      await getTaskStageDetail('tenant-a', 'task-1', 'stage-1', 'deleter-user');

      expect(mocks.audit).not.toHaveBeenCalled();
    });
  });

  it('locks a task snapshot only after stages and checklist items are inserted', async () => {
    mocks.versionFindFirst.mockResolvedValue({
      id: 'version-1',
      tenantId: 'tenant-a',
      publishedAt: new Date(),
      stages: [{
        id: 'pipeline-stage-1',
        name: 'Manual review',
        description: null,
        position: 0,
        actionType: 'MANUAL',
        icon: 'CircleCheckBig',
        isRequired: true,
        actionConfig: {
          checklistItems: [
            { label: 'Review documents', position: 0 },
            { label: 'Confirm approval', position: 1 },
          ],
        },
      }],
    });
    mocks.taskCreate.mockResolvedValue({
      id: 'task-1',
      title: 'Annual return',
      status: TaskStatus.NOT_STARTED,
      snapshotLockedAt: null,
    });
    mocks.stageCreate.mockResolvedValue({ id: 'stage-1' });
    mocks.checklistCreateMany.mockResolvedValue({ count: 2 });
    mocks.taskUpdate.mockResolvedValue({
      id: 'task-1',
      title: 'Annual return',
      snapshotLockedAt: new Date(),
    });

    await createTask('tenant-a', {
      title: 'Annual return',
      pipelineVersionId: '7ff3c11a-4a8e-45c7-a201-56df360db96c',
    }, 'user-1');

    expect(mocks.taskCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        snapshotLockedAt: null,
      }),
    });
    expect(mocks.checklistCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ taskStageId: 'stage-1', label: 'Review documents', position: 0 }),
        expect.objectContaining({ taskStageId: 'stage-1', label: 'Confirm approval', position: 1 }),
      ],
    });
    expect(mocks.taskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { snapshotLockedAt: expect.any(Date) },
      include: expect.any(Object),
    });
    expect(mocks.checklistCreateMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.taskUpdate.mock.invocationCallOrder[0]);
  });

  it('rejects an outcome type that does not match the stage adapter', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      actionType: 'COMPANY_PROFILE',
      task: { id: 'task-1', status: 'NOT_STARTED', deletedAt: null },
    });

    await expect(linkTaskStageOutcome('tenant-a', 'stage-1', {
      type: 'GENERATED_DOCUMENT',
      generatedDocumentId: '25e3bf9a-25b3-469b-a797-0c754303f7bd',
    }, 'user-1')).rejects.toThrow('does not match');
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });

  it('rejects manual completion and reopening for integrated stages', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      actionType: 'DOCUMENT_GENERATION',
      status: 'IN_PROGRESS',
      isRequired: true,
      startedAt: new Date(),
      task: { id: 'task-1', status: 'IN_PROGRESS', companyId: null, deletedAt: null },
    });
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1' });

    await expect(completeTaskStage('tenant-a', 'stage-1', 'user-1'))
      .rejects.toThrow('MANUAL');
    await expect(reopenTaskStage('tenant-a', 'stage-1', 'user-1'))
      .rejects.toThrow('MANUAL');
    expect(mocks.stageUpdate).not.toHaveBeenCalled();
  });

  it('uses the authoritative entity to reconcile stage and task status', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      actionType: 'DOCUMENT_GENERATION',
      task: { id: 'task-1', status: 'NOT_STARTED', deletedAt: null },
    });
    mocks.documentFindFirst.mockResolvedValue({
      id: 'document-1',
      title: 'Resolution',
      status: 'FINALIZED',
    });
    mocks.outcomeUpsert.mockResolvedValue({ id: 'outcome-1' });
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'COMPLETED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await linkTaskStageOutcome('tenant-a', 'stage-1', {
      type: 'GENERATED_DOCUMENT',
      generatedDocumentId: '25e3bf9a-25b3-469b-a797-0c754303f7bd',
    }, 'user-1');

    expect(mocks.documentFindFirst).toHaveBeenCalledWith({
      where: { id: '25e3bf9a-25b3-469b-a797-0c754303f7bd', tenantId: 'tenant-a', deletedAt: null },
      select: { id: true, title: true, status: true },
    });
    expect(mocks.stageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
    expect(mocks.taskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'COMPLETED' },
    });
  });

  it('atomically syncs the parent task company when linking a company outcome', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Company profile',
      actionType: 'COMPANY_PROFILE',
      status: 'NOT_STARTED',
      startedAt: null,
      task: { id: 'task-1', status: 'NOT_STARTED', companyId: null, deletedAt: null },
    });
    mocks.companyFindFirst.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', name: 'Acme' });
    mocks.outcomeUpsert.mockResolvedValue({ id: 'outcome-1' });
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'COMPLETED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await linkTaskStageOutcome('tenant-a', 'stage-1', {
      type: 'COMPANY',
      companyId: '33333333-3333-4333-8333-333333333333',
    }, 'user-1');

    expect(mocks.taskUpdate).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { companyId: '33333333-3333-4333-8333-333333333333' },
    });
    expect(mocks.outcomeUpsert.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.taskUpdate.mock.invocationCallOrder[0]);
  });

  it('marks a SetNull outcome failed and keeps stage detail readable', async () => {
    const invalidOutcomeStage = {
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Generate contract',
      description: null,
      position: 1,
      icon: 'FileText',
      isRequired: true,
      actionType: 'DOCUMENT_GENERATION',
      actionConfig: null,
      status: 'COMPLETED',
      startedAt: new Date(),
      assignee: null,
      checklistItems: [],
      task: { id: 'task-1', status: 'COMPLETED', companyId: null, deletedAt: null },
      outcome: {
        id: 'outcome-1',
        type: 'GENERATED_DOCUMENT',
        companyId: null,
        generatedDocumentId: null,
        esigningEnvelopeId: null,
      },
    };
    mocks.stageFindFirst.mockResolvedValue(invalidOutcomeStage);
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'FAILED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'FAILED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' });

    await expect(getTaskStageDetail('tenant-a', 'task-1', 'stage-1'))
      .resolves.toMatchObject({
        id: 'stage-1',
        status: 'FAILED',
        outcomeSummary: null,
      });
    await expect(reconcileTaskStageOutcome('tenant-a', 'stage-1'))
      .resolves.toMatchObject({ status: 'FAILED' });
    expect(mocks.documentFindFirst).not.toHaveBeenCalled();
  });

  it('marks a soft-deleted authoritative outcome failed during detail and reconciliation', async () => {
    const missingDocumentStage = {
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Generate contract',
      description: null,
      position: 1,
      icon: 'FileText',
      isRequired: true,
      actionType: 'DOCUMENT_GENERATION',
      actionConfig: null,
      status: 'COMPLETED',
      startedAt: new Date(),
      assignee: null,
      checklistItems: [],
      task: { id: 'task-1', status: 'COMPLETED', companyId: null, deletedAt: null },
      outcome: {
        id: 'outcome-1',
        type: 'GENERATED_DOCUMENT',
        companyId: null,
        generatedDocumentId: '33333333-3333-4333-8333-333333333333',
        esigningEnvelopeId: null,
      },
    };
    mocks.stageFindFirst.mockResolvedValue(missingDocumentStage);
    mocks.documentFindFirst.mockResolvedValue(null);
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'FAILED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'FAILED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' });

    await expect(getTaskStageDetail('tenant-a', 'task-1', 'stage-1'))
      .resolves.toMatchObject({ status: 'FAILED', outcomeSummary: null });
    await expect(reconcileTaskStageOutcome('tenant-a', 'stage-1'))
      .resolves.toMatchObject({ status: 'FAILED' });
  });

  it('requires a reason to skip and audits manual completion', async () => {
    await expect(skipTaskStage('tenant-a', 'stage-1', ' ', 'user-1')).rejects.toThrow();

    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      actionType: 'MANUAL',
      status: 'NOT_STARTED',
      task: { id: 'task-1', status: 'NOT_STARTED', deletedAt: null },
    });
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'COMPLETED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await completeTaskStage('tenant-a', 'stage-1', 'user-1');

    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a',
      userId: 'user-1',
      action: 'UPDATE',
      entityType: 'TaskStage',
      entityId: 'stage-1',
    }), tx);
  });

  it('rejects required-stage skipping and persists a reason for optional stages', async () => {
    mocks.stageFindFirst.mockResolvedValueOnce({
      id: 'required-stage',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Required',
      actionType: 'MANUAL',
      status: 'NOT_STARTED',
      isRequired: true,
      task: { id: 'task-1', status: 'NOT_STARTED', companyId: null, deletedAt: null },
    }).mockResolvedValueOnce({
      id: 'optional-stage',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Optional',
      actionType: 'MANUAL',
      status: 'NOT_STARTED',
      isRequired: false,
      task: { id: 'task-1', status: 'NOT_STARTED', companyId: null, deletedAt: null },
    });
    mocks.stageUpdate.mockResolvedValue({ id: 'optional-stage', status: 'SKIPPED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'SKIPPED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await expect(skipTaskStage('tenant-a', 'required-stage', 'Not applicable', 'user-1'))
      .rejects.toThrow('Required task stages');
    await skipTaskStage('tenant-a', 'optional-stage', 'Not applicable', 'user-1');

    expect(mocks.stageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'optional-stage' },
      data: expect.objectContaining({ status: 'SKIPPED', skipReason: 'Not applicable' }),
    }));
    expectTaskLock();
  });

  it('reopens manual stages while holding the parent task lock', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Manual review',
      actionType: 'MANUAL',
      status: 'COMPLETED',
      isRequired: true,
      startedAt: new Date(),
      task: { id: 'task-1', status: 'COMPLETED', companyId: null, deletedAt: null },
    });
    mocks.rawQuery.mockResolvedValueOnce([{
      id: 'task-1',
      tenantId: 'tenant-a',
      status: 'COMPLETED',
      title: 'Annual return',
      companyId: null,
    }]);
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'NOT_STARTED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'NOT_STARTED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'NOT_STARTED' });

    await reopenTaskStage('tenant-a', 'stage-1', 'user-1');

    expect(mocks.stageUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'NOT_STARTED',
        startedAt: null,
        completedAt: null,
      }),
    }));
    expect(mocks.rawQuery.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.stageUpdate.mock.invocationCallOrder[0]);
  });

  it('validates and stores optional task company, owner, due date, and stage assignee', async () => {
    const dueDate = new Date('2026-09-30T00:00:00.000Z');
    mocks.versionFindFirst.mockResolvedValue({
      id: 'version-1',
      tenantId: 'tenant-a',
      publishedAt: new Date(),
      stages: [],
    });
    mocks.companyFindFirst.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mocks.userFindFirst.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222' });
    mocks.taskCreate.mockResolvedValue({
      id: 'task-1',
      title: 'Annual return',
      companyId: '11111111-1111-4111-8111-111111111111',
      ownerId: '22222222-2222-4222-8222-222222222222',
      dueDate,
    });
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1' });

    await createTask('tenant-a', {
      title: 'Annual return',
      pipelineVersionId: '7ff3c11a-4a8e-45c7-a201-56df360db96c',
      companyId: '11111111-1111-4111-8111-111111111111',
      ownerId: '22222222-2222-4222-8222-222222222222',
      dueDate,
    }, 'user-1');

    expect(mocks.taskCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: '11111111-1111-4111-8111-111111111111',
        ownerId: '22222222-2222-4222-8222-222222222222',
        dueDate,
      }),
    });

    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Manual review',
      actionType: 'MANUAL',
      status: 'NOT_STARTED',
      task: { id: 'task-1', status: 'NOT_STARTED', companyId: null, deletedAt: null },
    });
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1' });

    await updateTaskStageMetadata('tenant-a', 'stage-1', {
      assigneeId: '22222222-2222-4222-8222-222222222222',
    }, 'user-1');

    expect(mocks.userFindFirst).toHaveBeenLastCalledWith({
      where: {
        id: '22222222-2222-4222-8222-222222222222',
        tenantId: 'tenant-a',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    expect(mocks.rawQuery).toHaveBeenCalled();
  });

  it('guards pause, resume, and cancellation state transitions', async () => {
    mocks.taskFindFirst.mockResolvedValue({
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'COMPLETED',
      stages: [{ status: 'COMPLETED' }],
    });
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'COMPLETED',
    }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1' });

    await expect(pauseTask('tenant-a', 'task-1', 'user-1')).rejects.toThrow('COMPLETED');
    await expect(cancelTask('tenant-a', 'task-1', 'user-1')).rejects.toThrow('COMPLETED');

    mocks.taskFindFirst.mockResolvedValue({
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'CANCELLED',
      stages: [{ status: 'IN_PROGRESS' }],
    });
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'CANCELLED',
    }]);

    await expect(resumeTask('tenant-a', 'task-1', 'user-1')).rejects.toThrow('PAUSED');

    mocks.taskFindFirst.mockResolvedValue({
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'PAUSED',
      stages: [{ status: 'IN_PROGRESS' }],
    });
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'PAUSED',
    }]);
    mocks.stageFindMany.mockResolvedValue([{ status: 'IN_PROGRESS' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'IN_PROGRESS' });

    await resumeTask('tenant-a', 'task-1', 'user-1');

    expect(mocks.taskUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { status: 'IN_PROGRESS' },
    }));
    expectTaskLock();
  });

  it('updates task metadata, soft deletion, checklist state, and audits each mutation', async () => {
    mocks.taskFindFirst.mockResolvedValue({
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Old title',
      companyId: null,
      status: 'NOT_STARTED',
      stages: [],
    });
    mocks.taskUpdate.mockResolvedValue({
      id: 'task-1',
      title: 'New title',
      companyId: null,
    });

    await updateTaskMetadata('tenant-a', 'task-1', { title: 'New title' }, 'user-1');
    await archiveTask('tenant-a', 'task-1', 'Duplicate task', 'user-1');

    mocks.checklistFindFirst.mockResolvedValue({
      id: 'checklist-1',
      tenantId: 'tenant-a',
      taskStageId: 'stage-1',
      label: 'Verify filing',
      taskStage: { taskId: 'task-1', task: { companyId: null } },
    });
    mocks.checklistUpdate.mockResolvedValue({ id: 'checklist-1', isCompleted: true });
    await updateTaskStageChecklistItem(
      'tenant-a',
      'checklist-1',
      { isCompleted: true },
      'user-1',
    );

    expect(mocks.taskUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { deletedAt: expect.any(Date), deletedReason: 'Duplicate task' },
    }));
    expect(mocks.checklistUpdate).toHaveBeenCalledWith({
      where: { id: 'checklist-1' },
      data: { isCompleted: true, completedAt: expect.any(Date) },
    });
    expect(mocks.audit).toHaveBeenCalledTimes(3);
    expect(mocks.rawQuery).toHaveBeenCalled();
  });

  it('reconciles authoritative outcomes under lock without overwriting pause', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Generate resolution',
      actionType: 'DOCUMENT_GENERATION',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      task: { id: 'task-1', status: 'IN_PROGRESS', companyId: null, deletedAt: null },
      outcome: {
        id: 'outcome-1',
        type: 'GENERATED_DOCUMENT',
        companyId: null,
        generatedDocumentId: '25e3bf9a-25b3-469b-a797-0c754303f7bd',
        esigningEnvelopeId: null,
      },
    });
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'PAUSED',
    }]);
    mocks.documentFindFirst.mockResolvedValue({
      id: '25e3bf9a-25b3-469b-a797-0c754303f7bd',
      title: 'Resolution',
      status: 'FINALIZED',
    });
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'COMPLETED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'PAUSED' });

    const result = await reconcileTaskStageOutcome('tenant-a', 'stage-1', 'user-1');

    expect(result.taskStatus).toBe('PAUSED');
    expect(mocks.taskUpdate).not.toHaveBeenCalled();
    expect(mocks.rawQuery.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.stageUpdate.mock.invocationCallOrder[0]);
  });

  it('reloads the stage and outcome only after locking the parent task', async () => {
    const staleStage = {
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Generate resolution',
      actionType: 'DOCUMENT_GENERATION',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      task: { id: 'task-1', status: 'IN_PROGRESS', companyId: null, deletedAt: null },
      outcome: {
        id: 'outcome-1',
        type: 'GENERATED_DOCUMENT',
        companyId: null,
        generatedDocumentId: '11111111-1111-4111-8111-111111111111',
        esigningEnvelopeId: null,
      },
    };
    const currentStage = {
      ...staleStage,
      outcome: {
        ...staleStage.outcome,
        generatedDocumentId: '22222222-2222-4222-8222-222222222222',
      },
    };
    mocks.stageFindFirst
      .mockResolvedValueOnce(staleStage)
      .mockResolvedValueOnce(currentStage);
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'IN_PROGRESS',
    }]);
    mocks.documentFindFirst.mockImplementation(async ({ where }: {
      where: { id: string };
    }) => ({
      id: where.id,
      title: 'Resolution',
      status: where.id === '22222222-2222-4222-8222-222222222222'
        ? 'FINALIZED'
        : 'DRAFT',
    }));
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'COMPLETED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'COMPLETED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    const result = await reconcileTaskStageOutcome('tenant-a', 'stage-1', 'user-1');

    expect(result.status).toBe('COMPLETED');
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: '22222222-2222-4222-8222-222222222222',
      }),
    }));
    expect(mocks.stageFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'stage-1',
        tenantId: 'tenant-a',
        task: { deletedAt: null },
      },
      select: { taskId: true },
    });
    expect(mocks.stageFindFirst.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.rawQuery.mock.invocationCallOrder[0]);
    expect(mocks.rawQuery.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.stageFindFirst.mock.invocationCallOrder[1]);
  });

  it('leaves completed MANUAL stages unchanged during outcome self-healing', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: 'stage-1',
      tenantId: 'tenant-a',
      taskId: 'task-1',
      name: 'Manual review',
      actionType: 'MANUAL',
      status: 'COMPLETED',
      startedAt: new Date(),
      completedAt: new Date(),
      task: { id: 'task-1', status: 'COMPLETED', companyId: null, deletedAt: null },
      outcome: null,
      checklistItems: [],
    });
    mocks.rawQuery.mockResolvedValue([{
      id: 'task-1',
      tenantId: 'tenant-a',
      title: 'Annual return',
      companyId: null,
      status: 'COMPLETED',
    }]);
    mocks.stageUpdate.mockResolvedValue({ id: 'stage-1', status: 'NOT_STARTED' });
    mocks.stageFindMany.mockResolvedValue([{ status: 'NOT_STARTED' }]);
    mocks.taskUpdate.mockResolvedValue({ id: 'task-1', status: 'NOT_STARTED' });

    const result = await reconcileTaskStageOutcome('tenant-a', 'stage-1', 'user-1');

    expect(result).toEqual({
      status: 'COMPLETED',
      summary: null,
      taskStatus: 'COMPLETED',
    });
    expect(mocks.stageUpdate).not.toHaveBeenCalled();
    expect(mocks.taskUpdate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
