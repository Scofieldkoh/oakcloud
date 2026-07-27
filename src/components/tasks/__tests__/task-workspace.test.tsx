import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskWorkspace } from '@/components/tasks/task-workspace';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';
import type { TaskListItem, TaskStageDetail } from '@/services/tasks/types';

const hookMocks = vi.hoisted(() => ({
  archive: vi.fn(),
  create: vi.fn(),
  stageTransition: vi.fn(),
  stageUpdate: vi.fn(),
  status: vi.fn(),
  update: vi.fn(),
  useArchiveTask: vi.fn(),
  useCompanies: vi.fn(),
  useCreateTask: vi.fn(),
  useCurrentWorkspaceUsers: vi.fn(),
  useTaskPipelines: vi.fn(),
  useTaskStage: vi.fn(),
  useTaskStageTransition: vi.fn(),
  useTaskStatusMutation: vi.fn(),
  useTasks: vi.fn(),
  useUpdateTask: vi.fn(),
  useUpdateTaskStage: vi.fn(),
}));

vi.mock('@/hooks/use-tasks', () => ({
  useArchiveTask: hookMocks.useArchiveTask,
  useCreateTask: hookMocks.useCreateTask,
  useTaskStage: hookMocks.useTaskStage,
  useTaskStageTransition: hookMocks.useTaskStageTransition,
  useTaskStatusMutation: hookMocks.useTaskStatusMutation,
  useTasks: hookMocks.useTasks,
  useUpdateTask: hookMocks.useUpdateTask,
  useUpdateTaskStage: hookMocks.useUpdateTaskStage,
}));
vi.mock('@/hooks/use-task-pipelines', () => ({
  useTaskPipelines: hookMocks.useTaskPipelines,
}));
vi.mock('@/hooks/use-companies', () => ({
  useCompanies: hookMocks.useCompanies,
}));
vi.mock('@/hooks/use-admin', () => ({
  useCurrentWorkspaceUsers: hookMocks.useCurrentWorkspaceUsers,
}));

const task: TaskListItem = {
  id: 'task-1',
  title: 'Annual compliance review',
  description: null,
  status: 'IN_PROGRESS',
  dueDate: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  company: { id: 'company-1', name: 'Acme Pte Ltd' },
  owner: { id: 'owner-1', firstName: 'Sam', lastName: 'Chen', email: 'sam@example.com' },
  pipelineVersion: { id: 'version-1', version: 1, pipeline: { id: 'pipeline-1', name: 'Annual review' } },
  stages: [{
    id: 'stage-1',
    name: 'Review',
    position: 0,
    actionType: 'MANUAL',
    icon: 'CircleCheckBig',
    isRequired: true,
    status: 'IN_PROGRESS',
  }],
};
const pipeline: TaskPipeline = {
  id: 'pipeline-1',
  name: 'Annual review',
  description: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  versions: [{ id: 'version-1', version: 1, publishedAt: '2026-07-01T00:00:00.000Z', stages: [] }],
};
const stage: TaskStageDetail = {
  ...task.stages[0],
  taskId: task.id,
  description: 'Review records.',
  notes: null,
  skipReason: null,
  startedAt: null,
  completedAt: null,
  assigneeId: null,
  assignee: null,
  checklistItems: [],
  outcome: null,
  blockers: [],
  launch: { href: null, context: { taskId: task.id, taskStageId: 'stage-1' } },
  outcomeSummary: null,
};

function useMutationMock(mutation: (variables: unknown) => Promise<unknown>) {
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [variables, setVariables] = useState<unknown>();

  const mutateAsync = async (nextVariables: unknown) => {
    setError(null);
    setIsPending(true);
    setVariables(nextVariables);
    try {
      return await mutation(nextVariables);
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError : new Error('Mutation failed');
      setError(nextError);
      throw nextError;
    } finally {
      setIsPending(false);
    }
  };

  return {
    error,
    isPending,
    mutate: (nextVariables: unknown) => { void mutateAsync(nextVariables).catch(() => undefined); },
    mutateAsync,
    reset: () => setError(null),
    variables,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hookMocks.useTasks.mockReturnValue({
    data: { tasks: [task], total: 1, page: 1, limit: 20, totalPages: 1 },
    error: null,
    isLoading: false,
  });
  hookMocks.useTaskPipelines.mockReturnValue({ data: [pipeline], error: null, isLoading: false });
  hookMocks.useCompanies.mockReturnValue({ data: { companies: [task.company] }, error: null, isLoading: false });
  hookMocks.useCurrentWorkspaceUsers.mockReturnValue({ data: { users: [task.owner] }, error: null, isLoading: false });
  hookMocks.useTaskStage.mockReturnValue({ data: stage, error: null, isLoading: false });
  hookMocks.archive.mockResolvedValue(task);
  hookMocks.create.mockResolvedValue(task);
  hookMocks.stageTransition.mockResolvedValue(task);
  hookMocks.stageUpdate.mockResolvedValue(task);
  hookMocks.status.mockResolvedValue(task);
  hookMocks.update.mockResolvedValue(task);
  hookMocks.useArchiveTask.mockImplementation(() => useMutationMock(hookMocks.archive));
  hookMocks.useCreateTask.mockImplementation(() => useMutationMock(hookMocks.create));
  hookMocks.useTaskStageTransition.mockImplementation(() => useMutationMock(hookMocks.stageTransition));
  hookMocks.useUpdateTaskStage.mockImplementation(() => useMutationMock(hookMocks.stageUpdate));
  hookMocks.useTaskStatusMutation.mockImplementation(() => useMutationMock(hookMocks.status));
  hookMocks.useUpdateTask.mockImplementation(() => useMutationMock(hookMocks.update));
});

describe('TaskWorkspace', () => {
  it('renders primary navigation and passes all due filters to the reviewed list hook', async () => {
    render(<TaskWorkspace />);
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage pipelines' })).toHaveAttribute('href', '/pipelines');
    fireEvent.change(screen.getByRole('combobox', { name: 'Due' }), { target: { value: 'overdue' } });
    await waitFor(() => expect(hookMocks.useTasks).toHaveBeenLastCalledWith(expect.objectContaining({ dueBucket: 'overdue' })));
  });

  it('explains pipeline, company, and owner option query failures', () => {
    hookMocks.useTaskPipelines.mockReturnValue({
      data: undefined,
      error: new Error('Pipeline options failed'),
      isLoading: false,
    });
    hookMocks.useCompanies.mockReturnValue({
      data: undefined,
      error: new Error('Company options failed'),
      isLoading: false,
    });
    hookMocks.useCurrentWorkspaceUsers.mockReturnValue({
      data: undefined,
      error: new Error('Owner options failed'),
      isLoading: false,
    });

    render(<TaskWorkspace />);

    const alert = screen.getByRole('alert', { name: 'Task options unavailable' });
    expect(alert).toHaveTextContent('Pipelines: Pipeline options failed');
    expect(alert).toHaveTextContent('Companies: Company options failed');
    expect(alert).toHaveTextContent('Owners: Owner options failed');
  });

  it('creates a task with title and pipeline only', async () => {
    render(<TaskWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Title' }), { target: { value: 'Prepare annual return' } });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Pipeline' }), { target: { value: 'version-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(hookMocks.create).toHaveBeenCalledWith({
      title: 'Prepare annual return',
      pipelineVersionId: 'version-1',
    }));
  });

  it('runs pause and confirmed cancel status controls', async () => {
    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: `Pause ${task.title}` })[0]);
    await waitFor(() => expect(hookMocks.status).toHaveBeenCalledWith({ id: task.id, action: 'pause' }));
    fireEvent.click(screen.getAllByRole('button', { name: `Cancel ${task.title}` })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel task' }));
    await waitFor(() => expect(hookMocks.status).toHaveBeenCalledWith({ id: task.id, action: 'cancel' }));
  });

  it('requires a reason before soft-deleting a task', async () => {
    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: `Delete ${task.title}` })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    expect(within(dialog).getByText('Reason is required')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Created in error' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    await waitFor(() => expect(hookMocks.archive).toHaveBeenCalledWith({ id: task.id, reason: 'Created in error' }));
  });

  it('opens any selected stage through the reviewed detail hook', async () => {
    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: /Review stage/i })[0]);
    await waitFor(() => expect(hookMocks.useTaskStage).toHaveBeenLastCalledWith(task.id, 'stage-1'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Review records.');
  });

  it('keeps a failed stage transition visible in the modal and retries it', async () => {
    hookMocks.stageTransition
      .mockRejectedValueOnce(new Error('Stage transition failed'))
      .mockResolvedValueOnce(task);

    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: /Review stage/i })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete stage' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Stage transition failed');
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete stage' }));
    await waitFor(() => expect(hookMocks.stageTransition).toHaveBeenCalledTimes(2));
  });

  it('retains stage notes after an update failure and retries them from the modal', async () => {
    hookMocks.stageUpdate
      .mockRejectedValueOnce(new Error('Stage update failed'))
      .mockResolvedValueOnce(task);

    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: /Review stage/i })[0]);
    const dialog = screen.getByRole('dialog');
    const notes = within(dialog).getByRole('textbox', { name: 'Notes' });
    fireEvent.change(notes, { target: { value: 'Keep this note for retry' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save notes' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Stage update failed');
    expect(notes).toHaveValue('Keep this note for retry');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save notes' }));
    await waitFor(() => {
      expect(hookMocks.stageUpdate).toHaveBeenCalledTimes(2);
      expect(hookMocks.stageUpdate).toHaveBeenLastCalledWith({
        taskId: task.id,
        stageId: stage.id,
        payload: { notes: 'Keep this note for retry' },
      });
    });
  });

  it('keeps a failed cancellation visible in its confirmation dialog and retries it', async () => {
    hookMocks.status
      .mockRejectedValueOnce(new Error('Cancellation failed'))
      .mockResolvedValueOnce(task);

    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: `Cancel ${task.title}` })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel task' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cancellation failed');
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel task' }));
    await waitFor(() => expect(hookMocks.status).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('retains the archive reason after failure and retries it from the confirmation dialog', async () => {
    hookMocks.archive
      .mockRejectedValueOnce(new Error('Archive failed'))
      .mockResolvedValueOnce(task);

    render(<TaskWorkspace />);
    fireEvent.click(screen.getAllByRole('button', { name: `Delete ${task.title}` })[0]);
    const dialog = screen.getByRole('dialog');
    const reason = within(dialog).getByRole('textbox', { name: 'Reason' });
    fireEvent.change(reason, { target: { value: 'Created in error' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Archive failed');
    expect(reason).toHaveValue('Created in error');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    await waitFor(() => {
      expect(hookMocks.archive).toHaveBeenCalledTimes(2);
      expect(hookMocks.archive).toHaveBeenLastCalledWith({ id: task.id, reason: 'Created in error' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
