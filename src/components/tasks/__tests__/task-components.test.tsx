import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskFormModal } from '@/components/tasks/task-form-modal';
import { TaskList } from '@/components/tasks/task-list';
import { TaskStageModal } from '@/components/tasks/task-stage-modal';
import { TaskStagePipeline } from '@/components/tasks/task-stage-pipeline';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';
import type {
  TaskListItem,
  TaskStageDetail,
  TaskStageSummary,
} from '@/services/tasks/types';

const stages: TaskStageSummary[] = [
  { id: 'stage-1', name: 'Profile', position: 0, actionType: 'COMPANY_PROFILE', icon: 'Building2', isRequired: true, status: 'NOT_STARTED' },
  { id: 'stage-2', name: 'Documents', position: 1, actionType: 'DOCUMENT_GENERATION', icon: 'FileText', isRequired: true, status: 'IN_PROGRESS' },
  { id: 'stage-3', name: 'Waiting review', position: 2, actionType: 'MANUAL', icon: 'CircleCheckBig', isRequired: false, status: 'WAITING' },
  { id: 'stage-4', name: 'Signing', position: 3, actionType: 'ESIGNING', icon: 'PenLine', isRequired: true, status: 'COMPLETED' },
  { id: 'stage-5', name: 'Optional check', position: 4, actionType: 'MANUAL', icon: 'CheckSquare', isRequired: false, status: 'SKIPPED' },
  { id: 'stage-6', name: 'Outcome', position: 5, actionType: 'MANUAL', icon: 'Mail', isRequired: true, status: 'FAILED' },
];

const task: TaskListItem = {
  id: 'task-1',
  title: 'Annual compliance review',
  description: 'Prepare and complete the annual review.',
  status: 'IN_PROGRESS',
  dueDate: '2026-07-30T00:00:00.000Z',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  company: { id: 'company-1', name: 'Acme Pte Ltd' },
  owner: { id: 'owner-1', firstName: 'Sam', lastName: 'Chen', email: 'sam@example.com' },
  pipelineVersion: {
    id: 'version-1',
    version: 2,
    pipeline: { id: 'pipeline-1', name: 'Annual review' },
  },
  stages,
};

const pipeline: TaskPipeline = {
  id: 'pipeline-1',
  name: 'Annual review',
  description: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  versions: [{
    id: 'version-1',
    version: 2,
    publishedAt: '2026-07-01T00:00:00.000Z',
    stages: [],
  }],
};

const stageDetail: TaskStageDetail = {
  ...stages[1],
  taskId: task.id,
  description: 'Generate and link the engagement contract.',
  notes: 'Use the approved terms.',
  skipReason: null,
  startedAt: '2026-07-25T02:30:00.000Z',
  completedAt: null,
  assigneeId: 'owner-1',
  assignee: task.owner,
  checklistItems: [{
    id: 'check-1',
    label: 'Confirm company profile',
    position: 0,
    isCompleted: true,
    completedAt: '2026-07-25T03:00:00.000Z',
  }, {
    id: 'check-2',
    label: 'Confirm signing contact',
    position: 1,
    isCompleted: false,
    completedAt: null,
  }],
  outcome: null,
  blockers: [{ code: 'SIGNER_REQUIRED', message: 'Add a signing contact to continue' }],
  launch: {
    href: '/document-generation',
    context: { taskId: task.id, taskStageId: 'stage-2' },
  },
  outcomeSummary: 'Draft engagement contract (IN_PROGRESS)',
};

describe('TaskList', () => {
  it('renders the exact desktop column order with one whole-table scroll container and every stage icon', () => {
    render(
      <TaskList
        tasks={[task]}
        onSelectStage={vi.fn()}
        onEdit={vi.fn()}
        onStatusAction={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Company', 'Task', 'Stages', 'Owner', 'Due', 'Actions']);
    expect(screen.getByTestId('task-table-scroll')).toHaveClass('overflow-x-auto');
    expect(screen.getByTestId('task-stage-cell')).not.toHaveClass('overflow-x-auto');
    expect(within(screen.getByTestId('task-stage-cell')).getAllByRole('button')).toHaveLength(stages.length);
  });

  it('renders mobile cards with the full stage pipeline below the task summary', () => {
    render(
      <TaskList
        tasks={[task]}
        onSelectStage={vi.fn()}
        onEdit={vi.fn()}
        onStatusAction={vi.fn()}
        onArchive={vi.fn()}
      />,
    );

    const card = screen.getByTestId('task-mobile-card');
    expect(card).toHaveClass('md:hidden');
    expect(within(card).getByText(task.title)).toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: /stage/i })).toHaveLength(stages.length);
  });

  it('offers metadata, pause or resume, cancel, and archive actions', () => {
    const onEdit = vi.fn();
    const onStatusAction = vi.fn();
    const onArchive = vi.fn();
    render(
      <TaskList
        tasks={[task]}
        onSelectStage={vi.fn()}
        onEdit={onEdit}
        onStatusAction={onStatusAction}
        onArchive={onArchive}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: `Edit ${task.title}` })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: `Pause ${task.title}` })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: `Cancel ${task.title}` })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: `Delete ${task.title}` })[0]);
    expect(onEdit).toHaveBeenCalledWith(task);
    expect(onStatusAction).toHaveBeenNthCalledWith(1, task, 'pause');
    expect(onStatusAction).toHaveBeenNthCalledWith(2, task, 'cancel');
    expect(onArchive).toHaveBeenCalledWith(task);
  });
});

describe('TaskStagePipeline', () => {
  it('uses pastel status surfaces and a visible non-colour marker with accessible tooltips and mobile targets', () => {
    render(<TaskStagePipeline stages={stages} onSelectStage={vi.fn()} />);

    const buttons = screen.getAllByRole('button', { name: /stage/i });
    expect(buttons).toHaveLength(stages.length);
    expect(buttons.map((button) => button.getAttribute('data-status'))).toEqual(stages.map((stage) => stage.status));
    expect(buttons[0]).toHaveClass('bg-slate-100', 'min-h-[44px]', 'min-w-[44px]');
    expect(buttons[1]).toHaveClass('bg-blue-100');
    expect(buttons[2]).toHaveClass('bg-amber-100');
    expect(buttons[3]).toHaveClass('bg-emerald-100');
    expect(buttons[4]).toHaveClass('bg-slate-100');
    expect(buttons[5]).toHaveClass('bg-red-100');
    buttons.forEach((button) => {
      expect(button).toHaveAttribute('title');
      expect(within(button).getByTestId('stage-status-marker')).toBeVisible();
    });
  });
});

describe('TaskFilters', () => {
  it('emits search, pipeline, company, owner, status, and due-bucket filters', () => {
    const onChange = vi.fn();
    render(
      <TaskFilters
        value={{}}
        pipelines={[pipeline]}
        companies={[task.company!]}
        owners={[task.owner!]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tasks' }), { target: { value: 'annual' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Pipeline' }), { target: { value: 'pipeline-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Company' }), { target: { value: 'company-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Owner' }), { target: { value: 'owner-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Task status' }), { target: { value: 'PAUSED' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Due' }), { target: { value: 'overdue' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ query: 'annual' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pipelineId: 'pipeline-1' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-1' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'owner-1' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'PAUSED' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dueBucket: 'overdue' }));
  });
});

describe('TaskFormModal', () => {
  it('requires only title and pipeline and omits untouched optional metadata', () => {
    const onSubmit = vi.fn();
    render(
      <TaskFormModal
        isOpen
        mode="create"
        pipelines={[pipeline]}
        companies={[task.company!]}
        owners={[task.owner!]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(screen.getByText('Pipeline is required')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Prepare annual return' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Pipeline' }), { target: { value: 'version-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare annual return',
      pipelineVersionId: 'version-1',
    });
  });
});

describe('TaskStageModal', () => {
  it('keeps inspection available, shows all detail, and exposes exactly one blocked primary action', () => {
    render(
      <TaskStageModal
        isOpen
        stage={stageDetail}
        onClose={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onTransition={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('In progress')).toBeInTheDocument();
    expect(within(dialog).getByText(stageDetail.description!)).toBeInTheDocument();
    expect(within(dialog).getByText('Sam Chen')).toBeInTheDocument();
    expect(within(dialog).getByText('Confirm company profile')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(stageDetail.notes!)).toBeInTheDocument();
    expect(within(dialog).getByText(stageDetail.outcomeSummary!)).toBeInTheDocument();
    expect(within(dialog).getByText(/25 Jul 2026/)).toBeInTheDocument();
    expect(within(dialog).getByText('Add a signing contact to continue')).toBeInTheDocument();
    const primaryActions = within(dialog).getAllByTestId('stage-primary-action');
    expect(primaryActions).toHaveLength(1);
    expect(primaryActions[0]).toBeDisabled();
  });

  it('launches an existing workspace with task context and a /tasks return URL', () => {
    const readyStage = { ...stageDetail, blockers: [] };
    render(
      <TaskStageModal
        isOpen
        stage={readyStage}
        onClose={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onTransition={vi.fn()}
      />,
    );

    expect(screen.getByTestId('stage-primary-action')).toHaveAttribute(
      'href',
      '/document-generation?taskId=task-1&taskStageId=stage-2&returnTo=%2Ftasks',
    );
  });

  it('requires a reason to skip optional stages and never offers skip for required stages', () => {
    const onTransition = vi.fn();
    const optionalStage = {
      ...stageDetail,
      actionType: 'MANUAL' as const,
      isRequired: false,
      launch: { href: null, context: stageDetail.launch.context },
      blockers: [],
    };
    const { rerender } = render(
      <TaskStageModal
        isOpen
        stage={optionalStage}
        onClose={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onTransition={onTransition}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip stage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm skip' }));
    expect(screen.getByText('Skip reason is required')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Skip reason' }), { target: { value: 'Not needed for this engagement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm skip' }));
    expect(onTransition).toHaveBeenCalledWith({
      action: 'skip',
      reason: 'Not needed for this engagement',
    });

    rerender(
      <TaskStageModal
        isOpen
        stage={stageDetail}
        onClose={vi.fn()}
        onUpdateMetadata={vi.fn()}
        onTransition={onTransition}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Skip stage' })).not.toBeInTheDocument();
  });
});
