import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import { BatchReviewWorkspace } from '@/components/documents/generation-batch';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: ({ value }: { value: string }) => (
    <div data-testid="preview-content">{value}</div>
  ),
}));

describe('generated document layout', () => {
  it('keeps the A4 editor layout defaults stable for previews and exports', () => {
    expect(DEFAULT_A4_DOCUMENT_LAYOUT).toMatchObject({
      fontFamily: expect.any(String),
      fontSize: expect.any(String),
      lineHeight: expect.any(Number),
      marginsMm: {
        top: expect.any(Number),
        right: expect.any(Number),
        bottom: expect.any(Number),
        left: expect.any(Number),
      },
    });
  });

  it('renders the persisted batch preview content in the review workspace', () => {
    const { unmount } = render(
      <BatchReviewWorkspace
        items={[{
          key: 'item-1',
          id: 'item-1',
          templateId: 'template-1',
          templateName: 'Engagement Letter',
          templateKind: 'STANDARD',
          templateVersion: 1,
          status: 'READY',
          configuration: {
            version: 1,
            title: 'Engagement Letter',
            contactIds: [],
            selectedDirectorId: null,
            selectedShareholderId: null,
            selectedContactId: null,
            itemValues: {},
            masterOverrides: {},
            useLetterhead: true,
            serviceAgreement: null,
          },
          previewContent: '<p>Layout preview</p>',
          editedContent: null,
          editedContentJson: null,
          previewFingerprint: 'fp',
          reviewedFingerprint: 'rv',
          validationDiagnostics: null,
          lastError: null,
        }]}
        activeItemId="item-1"
        onSelect={() => undefined}
        onPreview={() => Promise.resolve()}
        onReview={() => Promise.resolve()}
        onEditContent={() => undefined}
        onGenerateAll={() => Promise.resolve()}
        canGenerate
      />,
    );
    expect(screen.getByTestId('preview-content')).toHaveTextContent('Layout preview');
    unmount();
  });
});
