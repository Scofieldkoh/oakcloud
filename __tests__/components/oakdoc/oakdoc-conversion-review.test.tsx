import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/use-oakdoc-conversion', () => ({ useOakDocConversion: () => mutation }));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { OakDocConversionReview } from '@/components/documents/oakdoc/oakdoc-conversion-review';
import { ConvertToOakDocButton } from '@/components/documents/oakdoc/convert-to-oakdoc-button';

const metadata = (status = 'PENDING_REVIEW') => ({
  documentEngine: 'OAKDOC',
  oakDocMigration: {
    schemaVersion: 1,
    kind: 'A4_DRAFT_CONVERSION',
    method: 'a4-html-import/1',
    sourceDocumentId: 'a4-1',
    sourceRevision: 2,
    sourceContentSha256: 'a'.repeat(64),
    status,
    convertedAt: '2026-09-26T00:00:00.000Z',
    convertedById: 'user-1',
    diagnostics: [
      { code: 'OAKDOC_IMPORT_IMAGE_DROPPED', severity: 'error', stage: 'import', message: '1 image cannot be carried over.' },
      { code: 'OAKDOC_IMPORT_LIST_AS_TEXT', severity: 'warning', stage: 'import', message: '1 list will use typed numbers.' },
    ],
  },
});

function renderReview(overrides: Partial<Parameters<typeof OakDocConversionReview>[0]> = {}) {
  const props = {
    documentId: 'copy-1',
    revision: 4,
    metadata: metadata(),
    dirty: false,
    onAccepted: vi.fn(),
    onRejected: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  render(<OakDocConversionReview {...props} />);
  return props;
}

beforeEach(() => {
  mutation.mutateAsync.mockReset();
  push.mockReset();
});

describe('OakDoc conversion review', () => {
  it('only accepts once every problem is confirmed', async () => {
    const props = renderReview();
    const accept = screen.getByRole('button', { name: /Accept copy/ });
    expect(accept).toHaveProperty('disabled', true);
    expect(screen.getByText('1 list will use typed numbers.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/1 image cannot be carried over/));
    expect(accept).toHaveProperty('disabled', false);

    mutation.mutateAsync.mockResolvedValue({ document: { id: 'copy-1', revision: 5 } });
    fireEvent.click(accept);
    await waitFor(() => expect(props.onAccepted).toHaveBeenCalled());
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      action: 'accept',
      expectedRevision: 4,
      acknowledgedCodes: ['OAKDOC_IMPORT_IMAGE_DROPPED'],
    });
  });

  it('blocks acceptance while Word edits are unsaved and hides once accepted', () => {
    renderReview({ dirty: true });
    fireEvent.click(screen.getByLabelText(/1 image cannot be carried over/));
    expect(screen.getByRole('button', { name: /Accept copy/ })).toHaveProperty('disabled', true);
  });

  it('renders nothing for an accepted copy or a normal document', () => {
    const { container } = render(
      <OakDocConversionReview documentId="d" revision={0} metadata={metadata('ACCEPTED')} dirty={false} onAccepted={vi.fn()} onRejected={vi.fn()} onError={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('converts an A4 draft and opens the copy', async () => {
    mutation.mutateAsync.mockResolvedValue({ document: { id: 'copy-9' } });
    render(<ConvertToOakDocButton documentId="a4-1" revision={2} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to OakDoc/ }));
    fireEvent.click(screen.getByRole('button', { name: /Make OakDoc copy/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/generated-documents/copy-9'));
    expect(mutation.mutateAsync).toHaveBeenCalledWith({ action: 'convert', expectedRevision: 2 });
  });
});
