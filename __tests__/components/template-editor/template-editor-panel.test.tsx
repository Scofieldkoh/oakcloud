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

  it('commits a valid margin only after the user finishes editing', () => {
    const onTemplateChange = vi.fn();
    render(<TemplateEditorPanel {...defaultProps} onTemplateChange={onTemplateChange} />);

    const input = screen.getByLabelText('Top margin');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '4' } });
    expect(onTemplateChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '40' } });
    expect(onTemplateChange).not.toHaveBeenCalled();
    fireEvent.blur(input);

    expect(onTemplateChange).toHaveBeenCalledWith(expect.objectContaining({
      layout: expect.objectContaining({
        marginsMm: expect.objectContaining({ top: 40 }),
      }),
    }));
  });

  it('updates global font and font size through the template layout', () => {
    const onTemplateChange = vi.fn();
    render(<TemplateEditorPanel {...defaultProps} onTemplateChange={onTemplateChange} />);

    fireEvent.change(screen.getByLabelText('Global font'), {
      target: { value: 'Georgia, serif' },
    });
    expect(onTemplateChange).toHaveBeenLastCalledWith({
      layout: { ...DEFAULT_A4_DOCUMENT_LAYOUT, fontFamily: 'Georgia, serif' },
    });

    fireEvent.change(screen.getByLabelText('Font size'), {
      target: { value: '14pt' },
    });
    expect(onTemplateChange).toHaveBeenLastCalledWith({
      layout: { ...DEFAULT_A4_DOCUMENT_LAYOUT, fontSize: '14pt' },
    });
  });

  it('shows an inline error for an out-of-range margin without overwriting the draft', () => {
    const onTemplateChange = vi.fn();
    render(<TemplateEditorPanel {...defaultProps} onTemplateChange={onTemplateChange} />);
    const input = screen.getByLabelText('Top margin');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.blur(input);
    expect(input).toHaveValue(4);
    expect(screen.getByText('Enter a value from 5 to 60 mm.')).toBeVisible();
    expect(onTemplateChange).not.toHaveBeenCalled();
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
