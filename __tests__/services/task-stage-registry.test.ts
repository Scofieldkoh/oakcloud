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
  taskStageChecklistItem: { createMany: mocks.checklistCreateMany },
  taskStageOutcome: { upsert: mocks.outcomeUpsert },
  company: { findFirst: mocks.companyFindFirst },
  generatedDocument: { findFirst: mocks.documentFindFirst },
  esigningEnvelope: { findFirst: mocks.envelopeFindFirst },
};

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: mocks.transaction },
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
  completeTaskStage,
  linkTaskStageOutcome,
  skipTaskStage,
} from '@/services/tasks/stage.service';

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
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
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
});
