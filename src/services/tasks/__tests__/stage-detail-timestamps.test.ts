import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getStageActionAdapter: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskStage: { findFirst: mocks.findFirst },
  },
}));

vi.mock('@/services/tasks/action-registry', () => ({
  getStageActionAdapter: mocks.getStageActionAdapter,
  resolveStageActionOutcome: vi.fn(),
}));

import { getTaskStageDetail } from '@/services/tasks/stage.service';
import type { TaskStageDetail } from '@/services/tasks/types';

describe('getTaskStageDetail timestamps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStageActionAdapter.mockReturnValue({
      blockers: () => [],
      launch: () => ({
        href: null,
        context: { taskId: 'task-1', taskStageId: 'stage-1' },
      }),
      outcomeSummary: () => null,
    });
  });

  it('returns tenant-scoped stage timestamps as nullable ISO fields', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'stage-1',
      taskId: 'task-1',
      tenantId: 'workspace-1',
      name: 'Review records',
      description: null,
      position: 0,
      actionType: 'MANUAL',
      icon: 'CircleCheckBig',
      isRequired: true,
      status: 'IN_PROGRESS',
      notes: null,
      skipReason: null,
      assigneeId: null,
      assignee: null,
      checklistItems: [],
      outcome: null,
      startedAt: new Date('2026-07-26T02:30:00.000Z'),
      completedAt: null,
      task: {
        id: 'task-1',
        status: 'IN_PROGRESS',
        companyId: null,
        deletedAt: null,
      },
    });

    const detail = await getTaskStageDetail(
      'workspace-1',
      'task-1',
      'stage-1',
    );
    const timestamps: Pick<TaskStageDetail, 'startedAt' | 'completedAt'> = detail;

    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'stage-1',
        taskId: 'task-1',
        tenantId: 'workspace-1',
      }),
    }));
    expect(timestamps.startedAt).toBe('2026-07-26T02:30:00.000Z');
    expect(timestamps.completedAt).toBeNull();
  });
});
