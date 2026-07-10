import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cdp, page as vitestPage } from 'vitest/browser';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';

let mouseX = 0;
let mouseY = 0;
let mousePressed = false;

const page = Object.assign(vitestPage, {
  mouse: {
    async move(x: number, y: number, options: { steps?: number } = {}) {
      const steps = Math.max(1, options.steps ?? 1);
      for (let step = 1; step <= steps; step += 1) {
        const nextX = mouseX + ((x - mouseX) * step) / steps;
        const nextY = mouseY + ((y - mouseY) * step) / steps;
        await cdp().send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: nextX,
          y: nextY,
          button: mousePressed ? 'left' : 'none',
          buttons: mousePressed ? 1 : 0,
        });
      }
      mouseX = x;
      mouseY = y;
    },
    async down() {
      mousePressed = true;
      await cdp().send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: mouseX,
        y: mouseY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
    },
    async up() {
      await cdp().send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: mouseX,
        y: mouseY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      mousePressed = false;
    },
  },
});

function viewportPoint(rect: DOMRect, edge: 'start' | 'end') {
  let x = edge === 'start' ? rect.left + 1 : rect.right - 1;
  let y = rect.top + rect.height / 2;
  let currentWindow: Window = window;

  while (currentWindow.frameElement) {
    const frameElement = currentWindow.frameElement as HTMLElement;
    const frameRect = frameElement.getBoundingClientRect();
    const scaleX = frameElement.clientWidth
      ? frameRect.width / frameElement.clientWidth
      : 1;
    const scaleY = frameElement.clientHeight
      ? frameRect.height / frameElement.clientHeight
      : 1;
    x = frameRect.left + x * scaleX;
    y = frameRect.top + y * scaleY;
    currentWindow = currentWindow.parent;
  }

  return { x, y };
}

describe('A4PageEditor real layout pagination', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.height = '1400px';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('flows forward and backward without serializing soft pages', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const longDocument = Array.from(
      { length: 90 },
      (_, index) => `<p>Line ${index + 1}: deterministic pagination content.</p>`,
    ).join('');

    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={longDocument} />);
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]').length).toBeGreaterThan(1);
      });
    });

    const canonical = editorRef.current?.getContent() ?? '';
    expect(canonical).not.toContain('<!-- PAGE_BREAK -->');
    expect(canonical).not.toContain('data-flow-id');
    expect((new DOMParser().parseFromString(canonical, 'text/html').body.textContent ?? '')).toContain(
      'Line 90',
    );

    act(() => editorRef.current?.setContent('<p>Short document</p>'));
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]').length).toBe(1);
      });
    });
    expect(editorRef.current?.getContent()).toBe('<p>Short document</p>');
  });

  it('preserves the logical caret and keeps table rows intact', async () => {
    const rows = Array.from(
      { length: 80 },
      (_, index) => `<tr><td>Row ${index + 1}</td><td>Value ${index + 1}</td></tr>`,
    ).join('');

    await act(async () => {
      root.render(
        <A4PageEditor
          value={`<p>Intro</p><table><tbody>${rows}</tbody></table>`}
        />,
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]').length).toBeGreaterThan(1);
      });
    });
    expect(host.querySelectorAll('tbody tr')).toHaveLength(80);

    const lastEditor = Array.from(
      host.querySelectorAll<HTMLDivElement>('[data-testid^="a4-page-content-"]'),
    ).at(-1)!;
    const lastCellText = lastEditor.querySelector('td')?.firstChild;
    expect(lastCellText).toBeTruthy();
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(lastCellText!, 3);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    await act(async () => {
      lastEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(window.getSelection()?.anchorOffset).toBe(3);
      });
    });
    expect(host.querySelectorAll('tbody tr')).toHaveLength(80);
  });

  it('keeps a native mouse selection spanning two physical pages', async () => {
    host.style.zoom = '0.25';
    await page.viewport(1280, 900);
    await act(async () => {
      root.render(
        <A4PageEditor
          value={'<p>First page text</p><div class="page-break" data-break-type="hard"></div><p>Second page text</p>'}
        />,
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]')).toHaveLength(2);
      });
    });

    const contents = host.querySelectorAll<HTMLElement>(
      '[data-testid^="a4-page-content-"]',
    );
    const firstText = contents[0].querySelector('p')!.firstChild!;
    const secondText = contents[1].querySelector('p')!.firstChild!;
    const startRange = document.createRange();
    startRange.setStart(firstText, 0);
    startRange.setEnd(firstText, 1);
    const endRange = document.createRange();
    endRange.setStart(secondText, 0);
    endRange.setEnd(secondText, 6);
    const start = viewportPoint(startRange.getBoundingClientRect(), 'start');
    const end = viewportPoint(endRange.getBoundingClientRect(), 'end');

    await act(async () => {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 20 });
      await page.mouse.up();
    });

    const selectedText = window.getSelection()?.toString() ?? '';
    expect(selectedText).toContain('First page text');
    expect(selectedText).toContain('Second');
  });
});
  beforeAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = false;
  });
