import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PipelineBuilder, pipelineToDraft } from '@/components/tasks/pipelines/pipeline-builder';
import { PipelineList } from '@/components/tasks/pipelines/pipeline-list';
import type { TaskPipeline } from '@/hooks/use-task-pipelines';

const pipeline: TaskPipeline = {
  id: 'pipeline-1', name: 'Annual review', description: 'Annual statutory review',
  createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', deletedAt: null,
  versions: [{ id: 'version-1', version: 2, publishedAt: '2026-07-01T00:00:00.000Z', stages: [{
    id: 'stage-1', name: 'Prepare documents', description: null, position: 0,
    actionType: 'DOCUMENT_GENERATION', icon: 'FileText', isRequired: true,
    actionConfig: { checklistItems: [{ label: 'Verify records', position: 0 }], templateId: 'template-1' },
  }] }],
};

describe('PipelineList', () => {
  it('offers create, edit, duplicate, and archive actions', () => {
    const onCreate = vi.fn(); const onEdit = vi.fn(); const onDuplicate = vi.fn(); const onArchive = vi.fn();
    render(<PipelineList pipelines={[pipeline]} onCreate={onCreate} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create pipeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Annual review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Annual review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive Annual review' }));
    expect(onCreate).toHaveBeenCalledOnce(); expect(onEdit).toHaveBeenCalledWith(pipeline);
    expect(onDuplicate).toHaveBeenCalledWith(pipeline); expect(onArchive).toHaveBeenCalledWith(pipeline);
  });
});

describe('PipelineBuilder', () => {
  it('edits required state, checklist, icon search, and document-template configuration', () => {
    const onSave = vi.fn();
    render(<PipelineBuilder initialDraft={pipelineToDraft(pipeline)} templates={[{ id: 'template-1', name: 'Annual return' }]} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Required stage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add checklist item' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search icons' }), { target: { value: 'mail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mail' })); fireEvent.click(screen.getByRole('button', { name: 'Save pipeline' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ stages: [expect.objectContaining({
      isRequired: false, icon: 'Mail', actionConfig: expect.objectContaining({ templateId: 'template-1' }),
      checklistItems: expect.arrayContaining([expect.objectContaining({ label: 'Verify records' })]),
    })] }));
  });

  it('validates a full definition and supports keyboard-accessible reordering', () => {
    const onSave = vi.fn();
    render(<PipelineBuilder initialDraft={{ name: '', description: '', stages: [] }} templates={[]} onCancel={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save pipeline' }));
    expect(screen.getByText('Pipeline name is required')).toBeInTheDocument();
    expect(screen.getByText('Add at least one stage')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' })); fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Move stage up' })[1]);
    expect(screen.getAllByTestId('pipeline-stage-name').map((node) => node.textContent)).toEqual(['Stage 2', 'Stage 1']);
  });
});
