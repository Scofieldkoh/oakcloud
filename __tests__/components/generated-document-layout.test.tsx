import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: ({
    layout,
  }: {
    layout?: { lineHeight: number; fontFamily: string; fontSize: string };
  }) => (
    <div data-testid="generated-a4-layout">
      {layout?.lineHeight}|{layout?.fontFamily}|{layout?.fontSize}
    </div>
  ),
}));

import { EditStep } from '@/components/documents/document-generation-wizard';

describe('generated document layout', () => {
  it('passes the selected template layout to the preview editor', () => {
    render(
      <EditStep
        content="<p>Preview</p>"
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          fontFamily: 'Georgia, serif',
          fontSize: '14pt',
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

    expect(screen.getByTestId('generated-a4-layout')).toHaveTextContent(
      '1.8|Georgia, serif|14pt',
    );
  });
});
