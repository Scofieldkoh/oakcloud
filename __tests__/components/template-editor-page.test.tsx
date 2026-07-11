import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TemplateEditorPanel } from '@/components/documents/template-editor/template-editor-panel';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

describe('template editor page panel integration', () => {
  it('marks an edited template as unsaved in the extracted panel', () => {
    const onTemplateChange = vi.fn();
    render(
      <TemplateEditorPanel
        mode="template"
        templateForm={{
          name: 'Board resolution',
          description: '',
          category: 'RESOLUTION',
          content: '<p>Body</p>',
          isActive: true,
          layout: DEFAULT_A4_DOCUMENT_LAYOUT,
        }}
        onTemplateChange={onTemplateChange}
        fieldsContent={<div>Fields</div>}
        testPreviewContent={<div>Test data</div>}
        validationIssues={[]}
        onFocusIssue={vi.fn()}
        isDirty
      />,
    );

    expect(screen.getByText('Unsaved changes')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Test & Preview' }));
    expect(screen.getByText('Test data')).toBeVisible();
  });
});
