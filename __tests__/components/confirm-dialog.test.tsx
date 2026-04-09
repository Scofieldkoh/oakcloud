import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    isLoading,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    isLoading?: boolean;
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button disabled={disabled || isLoading} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

describe('ConfirmDialog', () => {
  it('prevents duplicate async confirmations while a submission is in flight', async () => {
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );

    render(
      <ConfirmDialog
        isOpen
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Send Password Reset"
        confirmLabel="Send Reset Email"
      />
    );

    const confirmButton = screen.getByRole('button', { name: /send reset email/i });
    const cancelButton = screen.getByRole('button', { name: /cancel/i });

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    resolveConfirm?.();

    await waitFor(() => {
      expect(confirmButton).not.toBeDisabled();
    });
  });
});
