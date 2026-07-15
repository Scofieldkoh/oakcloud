import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TemplateEditorPanel } from '@/components/documents/template-editor/template-editor-panel';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

describe('template editor page panel integration', () => {
  it('marks a layout change as unsaved in the extracted panel', () => {
    function TestHarness() {
      const [templateForm, setTemplateForm] = useState({
        name: 'Board resolution',
        description: '',
        category: 'RESOLUTION',
        content: '<p>Body</p>',
        isActive: true,
        layout: DEFAULT_A4_DOCUMENT_LAYOUT,
      });
      const [isDirty, setIsDirty] = useState(false);

      return (
        <TemplateEditorPanel
          mode="template"
          templateForm={templateForm}
          onTemplateChange={(changes) => {
            setTemplateForm((current) => ({ ...current, ...changes }));
            setIsDirty(true);
          }}
          fieldsContent={<div>Fields</div>}
          testPreviewContent={<div>Test data</div>}
          validationIssues={[]}
          onFocusIssue={vi.fn()}
          isDirty={isDirty}
        />
      );
    }

    render(
      <TestHarness />,
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Global font'), {
      target: { value: 'Georgia, serif' },
    });
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Test & Preview' }));
    expect(screen.getByText('Test data')).toBeVisible();
  });
});
