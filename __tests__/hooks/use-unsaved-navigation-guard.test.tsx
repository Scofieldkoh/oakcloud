import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { useUnsavedNavigationGuard } from '@/hooks/use-unsaved-navigation-guard';

function Harness({ dirty = true }: { dirty?: boolean }) {
  const guard = useUnsavedNavigationGuard(dirty);

  return (
    <>
      <a href="/generated-documents">Documents</a>
      <button type="button" onClick={guard.disarm}>Disarm</button>
      {guard.dialog}
    </>
  );
}

describe('useUnsavedNavigationGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/generated-documents/generate');
  });

  it('uses beforeunload only while dirty and armed', () => {
    const { rerender } = render(<Harness />);
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Disarm' }));
    const disarmedEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(disarmedEvent);
    expect(disarmedEvent.defaultPrevented).toBe(false);

    rerender(<Harness dirty={false} />);
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });

  it('defers same-origin link navigation until the user confirms', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('link', { name: 'Documents' }));
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(routerPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Documents' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    });
    expect(routerPush).toHaveBeenCalledWith('/generated-documents');
  });

  it('defers browser back navigation and executes it once after confirmation', async () => {
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    render(<Harness />);

    fireEvent.popState(window);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Unsaved changes')).toBeVisible();

    // The browser emits a second popstate when history.forward() restores the guarded page.
    fireEvent.popState(window);

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(back).not.toHaveBeenCalled();

    fireEvent.popState(window);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
    });
    expect(back).toHaveBeenCalledTimes(1);
  });
});
