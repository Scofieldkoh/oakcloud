import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TemplateEditorPanel } from '@/components/documents/template-editor/template-editor-panel';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import {
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_FONT_SIZE_OPTIONS,
} from '@/components/documents/document-typography';

const templateForm = {
  name: 'Board resolution',
  description: 'A board resolution',
  category: 'RESOLUTION',
  compositionType: 'STANDARD' as const,
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

    expect(screen.getByText('Global setting')).toBeVisible();
    const globalFont = screen.getByLabelText('Global font');
    const fontSize = screen.getByLabelText('Font size');
    expect(within(globalFont).getAllByRole('option')).toHaveLength(DOCUMENT_FONT_OPTIONS.length);
    expect(within(fontSize).getAllByRole('option')).toHaveLength(DOCUMENT_FONT_SIZE_OPTIONS.length);
    for (const option of DOCUMENT_FONT_OPTIONS) {
      expect(within(globalFont).getByRole('option', { name: option.label })).toHaveValue(option.value);
    }
    for (const size of DOCUMENT_FONT_SIZE_OPTIONS) {
      expect(within(fontSize).getByRole('option', { name: size.replace('pt', '') })).toHaveValue(size);
    }

    fireEvent.change(globalFont, {
      target: { value: 'Georgia, serif' },
    });
    expect(onTemplateChange).toHaveBeenLastCalledWith({
      layout: { ...DEFAULT_A4_DOCUMENT_LAYOUT, fontFamily: 'Georgia, serif' },
    });

    fireEvent.change(fontSize, {
      target: { value: '14pt' },
    });
    expect(onTemplateChange).toHaveBeenLastCalledWith({
      layout: { ...DEFAULT_A4_DOCUMENT_LAYOUT, fontSize: '14pt' },
    });
  });

  it('loads and updates the persisted composition type', () => {
    const onTemplateChange = vi.fn();
    render(<TemplateEditorPanel {...defaultProps} onTemplateChange={onTemplateChange} />);

    const composition = screen.getByLabelText('Composition');
    expect(composition).toHaveValue('STANDARD');

    fireEvent.change(composition, { target: { value: 'SERVICE_AGREEMENT' } });

    expect(onTemplateChange).toHaveBeenCalledWith({
      compositionType: 'SERVICE_AGREEMENT',
    });
  });

  it('never renders template typography controls in partial mode', () => {
    const partialForm = {
      name: 'director-details',
      displayName: 'Director details',
      description: '',
      content: '<p>Director</p>',
    };
    const { rerender } = render(
      <TemplateEditorPanel
        {...defaultProps}
        mode="partial"
        partialForm={partialForm}
        onPartialChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Global font')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Font size')).not.toBeInTheDocument();

    rerender(<TemplateEditorPanel {...defaultProps} mode="partial" />);

    expect(screen.queryByLabelText('Global font')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Font size')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Partial details are unavailable.');
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

  it('opens validation when agreement composition slots block saving', () => {
    render(
      <TemplateEditorPanel
        {...defaultProps}
        validationIssues={[{
          id: 'agreement-feeTable-missing-agreement-slot',
          severity: 'error',
          code: 'missing-agreement-slot',
          message: 'Service Agreement template must contain exactly one feeTable slot.',
        }]}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Test & Preview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/exactly one feeTable slot/)).toBeVisible();
  });
});
