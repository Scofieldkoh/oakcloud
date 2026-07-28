import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskList } from '@/components/tasks/task-list';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';
import type { TaskListItem } from '@/services/tasks/types';

vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreferences: () => ({
    data: {
      'tasks:list:columns:v1': {
        key: 'tasks:list:columns:v1',
        value: {},
        updatedAt: null,
      },
    },
  }),
  useUpsertUserPreference: () => ({ mutate: vi.fn() }),
}));

const pipeline: TaskPipeline = {
  id: 'pipeline-1',
  name: 'Client onboarding',
  description: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  deletedAt: null,
  versions: [{
    id: 'version-1',
    version: 1,
    publishedAt: '2026-07-01T00:00:00.000Z',
    stages: [],
  }],
};

const task: TaskListItem = {
  id: 'task-1',
  title: 'Onboarding',
  description: null,
  status: 'NOT_STARTED',
  dueDate: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  company: null,
  owner: null,
  pipelineVersion: {
    id: 'version-1',
    version: 1,
    pipeline: { id: pipeline.id, name: pipeline.name },
  },
  stages: [],
};

const commonProps = {
  filters: {},
  pipelines: [pipeline],
  companies: [],
  owners: [],
  onFiltersChange: vi.fn(),
  onUpdateMetadata: vi.fn().mockResolvedValue(undefined),
  onSelectStage: vi.fn(),
  onEdit: vi.fn(),
  onStatusAction: vi.fn(),
  onArchive: vi.fn(),
};

describe('TaskList desktop columns', () => {
  it('renders task status in its own filtered and resizable column', () => {
    render(<TaskList tasks={[task]} {...commonProps} />);

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getAllByRole('columnheader').map((header) => header.textContent))
      .toEqual(['Company', 'Task', 'Status', 'Pipeline', 'Stages', 'Owner', 'Due', 'Actions']);
    expect(table).not.toHaveClass('w-full');
    expect(table).toHaveStyle({ width: '1422px', minWidth: '1422px' });
    expect(table).toHaveClass('relative', 'z-[1]');

    const scrollContainer = screen.getByTestId('task-table-scroll');
    expect(scrollContainer).toHaveClass('relative');
    const headerBaseBand = screen.getByTestId('task-column-header-band');
    const filterRowBand = screen.getByTestId('task-filter-row-band');
    expect(headerBaseBand).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-x-0',
      'top-0',
      'h-[94px]',
      'bg-background-tertiary',
    );
    expect(filterRowBand).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-x-0',
      'top-0',
      'h-14',
      'bg-background-secondary/50',
    );
    expect(headerBaseBand.compareDocumentPosition(filterRowBand))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rows[0]).toHaveClass('h-14');
    expect(rows[1]).toHaveClass('h-[38px]');

    const filterCells = rows[0].querySelectorAll('th');
    const statusFilter = within(rows[0]).getByRole('combobox', { name: 'All statuses' });
    expect(filterCells[1]).not.toContainElement(statusFilter);
    expect(filterCells[2]).toContainElement(statusFilter);

    const dataCells = within(rows[2]).getAllByRole('cell');
    expect(dataCells[1]).toHaveTextContent('Onboarding');
    expect(dataCells[1]).not.toHaveTextContent('Not started');
    expect(dataCells[2]).toHaveTextContent('Not started');
    expect(screen.getByRole('separator', { name: 'Resize Status column' })).toBeInTheDocument();
  });

  it('omits Unscheduled from an undated Due cell', () => {
    render(<TaskList tasks={[task]} {...commonProps} />);

    const table = screen.getByRole('table');
    expect(within(table).getByText('No due date')).toBeVisible();
    expect(within(table).queryByText('Unscheduled')).not.toBeInTheDocument();
  });

  it('spans the empty message across all eight columns', () => {
    render(<TaskList tasks={[]} {...commonProps} />);

    expect(screen.getByRole('cell', { name: 'No tasks found' })).toHaveAttribute('colspan', '8');
  });
});
