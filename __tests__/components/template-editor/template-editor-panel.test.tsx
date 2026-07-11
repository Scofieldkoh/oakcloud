import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TemplateEditorPanel } from '@/components/documents/template-editor/template-editor-panel';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

const templateForm = {
  name: 'Board resolution',
  description: 'A board resolution',
  category: 'RESOLUTION',
  content: '<p>{{company.unknown}}</p>',
  isActive: true,
  layout: DEFAULT_A4_DOCUMENT_LAYOUT,
};

const defaultProps = {
  mode: 'template' as const,
  templateForm,
  onTemplateChange: vi.fn(),
  fieldsContent: <div>Fields content</div>,
  testPreviewContent: <div>Test data</div>,
  validationIssues: [],
  onFocusIssue: vi.fn(),
};

describe('TemplateEditorPanel', () => {
  it('exposes the three task-oriented tabs for templates', () => {
    render(<TemplateEditorPanel {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Template' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Fields' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Test & Preview' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: 'AI' })).not.toBeInTheDocument();
  });

  it('keeps layout controls synchronized with the editor', () => {
    const onTemplateChange = vi.fn();
    render(<TemplateEditorPanel {...defaultProps} onTemplateChange={onTemplateChange} />);

    fireEvent.change(screen.getByLabelText('Top margin'), { target: { value: '24' } });

    expect(onTemplateChange).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({
        marginsMm: expect.objectContaining({ top: 24 }),
      }),
    }));
  });

  it('lists syntax issues and focuses their flow block', () => {
    const onFocusIssue = vi.fn();
    const issue = {
      id: 'issue-1',
      severity: 'error' as const,
      code: 'unknown-placeholder' as const,
      message: 'Placeholder "company.unknown" is not available.',
      flowId: 'flow-12',
    };
    render(
      <TemplateEditorPanel
        {...defaultProps}
        validationIssues={[issue]}
        onFocusIssue={onFocusIssue}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Test & Preview' }));
    fireEvent.click(screen.getByRole('button', { name: issue.message }));

    expect(onFocusIssue).toHaveBeenCalledWith(issue.flowId);
  });
});
