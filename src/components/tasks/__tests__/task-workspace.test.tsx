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

function mutationMock(mutateAsync: (variables: unknown) => Promise<unknown>) {
  return {
    error: null,
    isPending: false,
    mutate: (variables: unknown) => { void mutateAsync(variables); },
    mutateAsync,
    reset: vi.fn(),
    variables: undefined,
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
  hookMocks.useArchiveTask.mockReturnValue(mutationMock(hookMocks.archive));
  hookMocks.useCreateTask.mockReturnValue(mutationMock(hookMocks.create));
  hookMocks.useTaskStageTransition.mockReturnValue(mutationMock(hookMocks.stageTransition));
  hookMocks.useUpdateTaskStage.mockReturnValue(mutationMock(hookMocks.stageUpdate));
  hookMocks.useTaskStatusMutation.mockReturnValue(mutationMock(hookMocks.status));
  hookMocks.useUpdateTask.mockReturnValue(mutationMock(hookMocks.update));
});

describe('TaskWorkspace', () => {
  it('renders primary navigation and passes all due filters to the reviewed list hook', async () => {
    render(<TaskWorkspace />);
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage pipelines' })).toHaveAttribute('href', '/pipelines');
    fireEvent.change(screen.getByRole('combobox', { name: 'Due' }), { target: { value: 'overdue' } });
    await waitFor(() => expect(hookMocks.useTasks).toHaveBeenLastCalledWith(expect.objectContaining({ dueBucket: 'overdue' })));
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
});
