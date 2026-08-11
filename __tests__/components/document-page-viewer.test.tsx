import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentPageViewer } from '@/components/processing/document-page-viewer';

vi.mock('@/hooks/use-processing-documents', () => ({
  useDocumentPages: () => ({ data: null, isLoading: false, error: null, refetch: vi.fn() }),
  useAppendPages: () => ({ appendPages: vi.fn(), isAppending: false }),
  useReorderPages: () => ({ reorderPages: vi.fn(), isReordering: false }),
  useDeletePages: () => ({ deletePages: vi.fn(), isDeleting: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
}));

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: pdfMocks.getDocument,
}));

function makeFakePdf() {
  const page = {
    getViewport: () => ({ width: 800, height: 1000 }),
    render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    getTextContent: async () => ({ items: [] }),
  };
  return {
    numPages: 2,
    getPage: vi.fn(async () => page),
    destroy: vi.fn(),
  };
}

function scrollContainer(): HTMLElement {
  const container = document.querySelector<HTMLElement>('[data-document-scroll-container="true"]');
  if (!container) throw new Error('Scroll container missing');
  return container;
}

function dispatchKey(target: EventTarget, key: string, defaultPrevented = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  if (defaultPrevented) {
    event.preventDefault();
  }
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('DocumentPageViewer keyboard shortcut scope', () => {
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    vi.clearAllMocks();
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    const context2d = {} as CanvasRenderingContext2D;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => context2d,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }))
    );
    pdfMocks.getDocument.mockReturnValue({ promise: Promise.resolve(makeFakePdf()) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: originalGetContext,
    });
  });

  async function renderViewer(scope: 'global' | 'focused' | 'disabled' = 'global') {
    const onPageChange = vi.fn();
    render(
      <DocumentPageViewer
        pdfUrl="/test.pdf"
        keyboardShortcutScope={scope}
        onPageChange={onPageChange}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole('spinbutton')).toHaveValue(1);
    });
    await waitFor(() => {
      expect(screen.getByText('/ 2')).toBeInTheDocument();
    });
    onPageChange.mockClear();
    return { onPageChange };
  }

  it('does not intercept body arrow keys in focused mode', async () => {
    await renderViewer('focused');

    const left = dispatchKey(document.body, 'ArrowLeft');
    const right = dispatchKey(document.body, 'ArrowRight');
    const pageUp = dispatchKey(document.body, 'PageUp');
    const pageDown = dispatchKey(document.body, 'PageDown');

    expect(left.defaultPrevented).toBe(false);
    expect(right.defaultPrevented).toBe(false);
    expect(pageUp.defaultPrevented).toBe(false);
    expect(pageDown.defaultPrevented).toBe(false);
    expect(screen.getByRole('spinbutton')).toHaveValue(1);
  });

  it('handles page keys when focus is inside the scroll container in focused mode', async () => {
    await renderViewer('focused');
    scrollContainer().focus();

    const event = dispatchKey(scrollContainer(), 'ArrowRight');
    await act(async () => {});

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('spinbutton')).toHaveValue(2);
  });

  it('ignores events already handled by another keyboard owner', async () => {
    const { onPageChange } = await renderViewer('global');

    const event = dispatchKey(document.body, 'ArrowRight', true);

    expect(event.defaultPrevented).toBe(true);
    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton')).toHaveValue(1);
  });

  it('does not consume any keys in disabled scope', async () => {
    const { onPageChange } = await renderViewer('disabled');

    const right = dispatchKey(document.body, 'ArrowRight');
    const pageDown = dispatchKey(document.body, 'PageDown');

    expect(right.defaultPrevented).toBe(false);
    expect(pageDown.defaultPrevented).toBe(false);
    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton')).toHaveValue(1);
  });

  it('retains global scope as the default for existing consumers', async () => {
    const { onPageChange } = await renderViewer();

    const right = dispatchKey(document.body, 'ArrowRight');
    await act(async () => {});

    expect(right.defaultPrevented).toBe(true);
    expect(screen.getByRole('spinbutton')).toHaveValue(2);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
