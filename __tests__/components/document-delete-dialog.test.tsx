import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentDeleteDialog } from '@/components/documents/document-delete-dialog';

function fillReason() {
  fireEvent.change(screen.getByPlaceholderText(/reason for deleting/i), {
    target: { value: 'Generated in error' },
  });
}

describe('DocumentDeleteDialog', () => {
  it('moves to the Recycle Bin by default and hides the permanent option from non-admins', async () => {
    const onConfirm = vi.fn();
    render(<DocumentDeleteDialog isOpen onClose={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.queryByText('Delete permanently')).not.toBeInTheDocument();
    fillReason();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Document' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Generated in error', false));
  });

  it('lets admins delete permanently with a cannot-be-undone warning', async () => {
    const onConfirm = vi.fn();
    render(<DocumentDeleteDialog isOpen onClose={vi.fn()} onConfirm={onConfirm} count={3} canDeletePermanently />);

    fireEvent.click(screen.getByLabelText(/Delete permanently/));
    expect(screen.getByText('Permanently Delete 3 Documents')).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone\. The documents, including finalized ones/)).toBeInTheDocument();

    fillReason();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Permanently' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Generated in error', true));
  });
});
