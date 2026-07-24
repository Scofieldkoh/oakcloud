import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  taskPipelineKeys,
  useCreateTaskPipeline,
  useTaskPipelines,
} from '@/hooks/use-task-pipelines';
import {
  taskKeys,
  useTaskStageTransition,
  useTasks,
} from '@/hooks/use-tasks';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('task query hooks', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes pipeline and task list parameters into stable list queries', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({
        tasks: [],
        total: 0,
        page: 2,
        limit: 25,
        totalPages: 0,
      }));
    const { wrapper } = createHarness();

    renderHook(
      () => useTaskPipelines({ includeArchived: true }),
      { wrapper },
    );
    renderHook(
      () => useTasks({
        query: 'annual',
        pipelineId: 'pipeline-1',
        dueBucket: 'overdue',
        page: 2,
        limit: 25,
        sortBy: 'dueDate',
        sortOrder: 'desc',
      }),
      { wrapper },
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/task-pipelines?includeArchived=true',
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/tasks?q=annual&pipeline=pipeline-1&dueBucket=overdue&page=2&limit=25&sortBy=dueDate&sortOrder=desc',
    );
  });

  it('invalidates only pipeline lists after creating a pipeline', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'pipeline-1' }, 201));
    const { queryClient, wrapper } = createHarness();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateTaskPipeline(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Onboarding',
        stages: [{ name: 'Manual review', actionType: 'MANUAL' }],
      });
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: taskPipelineKeys.lists(),
    });
  });

  it('invalidates the changed stage, parent task detail, and task lists after transition', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'stage-1' }));
    const { queryClient, wrapper } = createHarness();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useTaskStageTransition(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        taskId: 'task-1',
        stageId: 'stage-1',
        transition: { action: 'complete' },
      });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: taskKeys.stage('task-1', 'stage-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: taskKeys.detail('task-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: taskKeys.lists(),
    });
  });
});
