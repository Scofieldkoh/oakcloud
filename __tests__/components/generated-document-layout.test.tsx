import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: ({ layout }: { layout?: { lineHeight: number } }) => (
    <div data-testid="generated-a4-layout">{layout?.lineHeight}</div>
  ),
}));

import { EditStep } from '@/components/documents/document-generation-wizard';

describe('generated document layout', () => {
  it('passes the selected template layout to the preview editor', () => {
    render(
      <EditStep
        content="<p>Preview</p>"
        layout={{
          version: 1,
          lineHeight: 1.8,
          paragraphSpacing: '8px',
          marginsMm: { top: 10, right: 15, bottom: 20, left: 25 },
        }}
        validationResult={null}
        missingPlaceholders={[]}
        missingPartials={[]}
        blockingErrors={[]}
        isLoading={false}
        onChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId('generated-a4-layout')).toHaveTextContent('1.8');
  });
});
