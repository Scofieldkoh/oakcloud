import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BatchReviewWorkspace,
  type BatchReviewWorkspaceProps,
} from '@/components/documents/generation-batch/batch-review-workspace';
import type { EditableBatchItem } from '@/components/documents/generation-batch/batch-workspace-state';

vi.mock('@/components/documents/a4-page-editor', () => ({
  A4PageEditor: ({ value, onChange, readOnly }: {
    value: string;
    onChange?: (html: string) => void;
    readOnly?: boolean;
  }) => (
    <div>
      <div data-testid="preview-content">{value}</div>
      {!readOnly && (
        <button type="button" onClick={() => onChange?.('<p>edited</p>')}>
          mock-edit
        </button>
      )}
    </div>
  ),
}));

function item(overrides: Partial<EditableBatchItem> = {}): EditableBatchItem {
  return {
    key: 'item-1',
    id: 'item-1',
    templateId: 'template-a',
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
    previewContent: '<p>Preview content</p>',
    editedContent: null,
    editedContentJson: null,
    previewFingerprint: 'preview-hash',
    reviewedFingerprint: 'reviewed-hash',
    validationDiagnostics: null,
    lastError: null,
    ...overrides,
  };
}

function props(overrides: Partial<BatchReviewWorkspaceProps> = {}): BatchReviewWorkspaceProps {
  return {
    items: [item(), item({ key: 'item-2', id: 'item-2', templateName: 'KYC Checklist', reviewedFingerprint: null, status: 'NEEDS_INPUT' })],
    activeItemId: 'item-1',
    onSelect: vi.fn(),
    onPreview: vi.fn(),
    onReview: vi.fn(),
    onEditContent: vi.fn(),
    onGenerateAll: vi.fn(),
    canGenerate: true,
    ...overrides,
  };
}

describe('BatchReviewWorkspace', () => {
  it('requires every remaining item to be reviewed before Generate All', () => {
    const p = props({ canGenerate: false });
    const { unmount } = render(<BatchReviewWorkspace {...p} />);
    expect(screen.getByRole('button', { name: /generate all/i })).toBeDisabled();
    expect(screen.getByText(/1 document still needs review/i)).toBeInTheDocument();
    unmount();
  });

  it('does not overwrite edited content when a preview becomes stale', async () => {
    const user = userEvent.setup();
    const p = props({
      items: [item({
        editedContent: '<p>manual</p>',
        previewContent: '<p>auto</p>',
        previewFingerprint: 'stale-hash',
        reviewedFingerprint: null,
      })],
    });
    const { unmount } = render(<BatchReviewWorkspace {...p} />);

    await user.click(screen.getByRole('button', { name: /refresh preview/i }));
    expect(screen.getByRole('dialog', { name: /replace manual edits/i })).toBeInTheDocument();
    expect(p.onPreview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /replace edits/i }));
    expect(p.onPreview).toHaveBeenCalledWith('item-1', true);
    unmount();
  });

  it('persists edits through the content callback', () => {
    const p = props();
    const { unmount } = render(<BatchReviewWorkspace {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /mock-edit/i }));
    expect(p.onEditContent).toHaveBeenCalledWith('item-1', '<p>edited</p>', null);
    unmount();
  });

  it('renders the active preview and shows reviewed state as non-editable', () => {
    const p = props();
    const { unmount } = render(<BatchReviewWorkspace {...p} />);
    expect(screen.getByTestId('preview-content')).toHaveTextContent('Preview content');
    expect(screen.getByRole('button', { name: /^reviewed$/i })).toBeDisabled();
    unmount();
  });

  it('enables approving a freshly previewed document', async () => {
    const user = userEvent.setup();
    const p = props({
      items: [item({ reviewedFingerprint: null, status: 'PREVIEWED' })],
    });
    const { unmount } = render(<BatchReviewWorkspace {...p} />);
    const approve = screen.getByRole('button', { name: /approve for generation/i });
    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(p.onReview).toHaveBeenCalledWith('item-1');
    unmount();
  });

  it('requires a refresh when the preview is stale', () => {
    const p = props({
      items: [item({ previewFingerprint: null, reviewedFingerprint: null, status: 'NEEDS_INPUT' })],
    });
    const { unmount } = render(<BatchReviewWorkspace {...p} />);
    expect(screen.getByRole('button', { name: /approve for generation/i })).toBeDisabled();
    unmount();
  });
});
