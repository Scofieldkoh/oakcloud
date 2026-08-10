import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cdp, page as vitestPage, userEvent } from 'vitest/browser';
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
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

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

async function pressEnter() {
  await act(async () => {
    await userEvent.keyboard('{Enter}');
  });
}

async function flushLayoutFrames() {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

async function flushPendingEditorUpdates() {
  await act(async () => {
    await flushLayoutFrames();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await flushLayoutFrames();
  });
}

function selectedParagraphText(): string | null {
  const anchorNode = window.getSelection()?.anchorNode;
  const anchorElement =
    anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode?.parentElement;
  return anchorElement?.closest('p')?.textContent ?? null;
}

function logicalCaretOffset(root: HTMLElement): number | null {
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode;
  if (!selection || !anchorNode) return null;
  const anchorElement =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;
  const anchorPage = anchorElement?.closest<HTMLElement>(
    '[data-testid^="a4-page-content-"]',
  );
  if (!anchorPage) return null;

  const range = document.createRange();
  range.setStart(anchorPage, 0);
  range.setEnd(anchorNode, selection.anchorOffset);
  const pages = Array.from(
    root.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
  );
  return pages
    .slice(0, pages.indexOf(anchorPage))
    .reduce((length, pageContent) => length + (pageContent.textContent?.length ?? 0), 0)
    + range.toString().length;
}

describe('A4PageEditor real layout pagination', () => {
  let host: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  const waitForEditorIdle = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await act(async () => {
        await flushLayoutFrames();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      const surface = host.querySelector<HTMLElement>(
        '[data-testid="a4-document-surface"]',
      );
      if (surface?.getAttribute('aria-busy') === 'false') return;
    }
    throw new Error('A4 editor never reached an idle reflow state');
  };

  beforeEach(() => {
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
    });
    host = document.createElement('div');
    host.style.height = '1400px';
    document.body.appendChild(host);
    root = createRoot(host);
    consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args.map(String).join(' ');
      if (message.includes('not wrapped in act')) {
        throw new Error(`Unexpected React act warning: ${message}`);
      }
      if (message.includes('download the React DevTools')) return;
      throw new Error(`Unexpected console.error: ${message}`);
    });
  });

  afterEach(async () => {
    await flushPendingEditorUpdates();
    consoleError.mockRestore();
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
    await act(flushLayoutFrames);
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

  it('reflows after typography changes without losing document text', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const paragraphs = Array.from(
      { length: 48 },
      (_, index) =>
        `<p>Typography line ${index + 1}: deterministic pagination content with enough words to wrap differently when the normalized document font family and size change.</p>`,
    );
    const expectedText = paragraphs
      .map((paragraph) =>
        new DOMParser().parseFromString(paragraph, 'text/html').body.textContent,
      )
      .join('');

    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={paragraphs.join('')}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '11pt',
          }}
        />,
      );
    });
    await act(flushLayoutFrames);
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]').length).toBeGreaterThan(1);
      });
    });
    const initialPageDistribution = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
      (pageContent) => pageContent.textContent,
    );

    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={paragraphs.join('')}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            fontFamily: 'Georgia, serif',
            fontSize: '14pt',
          }}
        />,
      );
    });
    await act(flushLayoutFrames);
    await act(async () => {
      await vi.waitFor(() => {
        const firstPage = host.querySelector<HTMLElement>(
          '[data-testid="a4-page-content-1"]',
        );
        expect(firstPage?.style.fontFamily).toBe('Georgia, serif');
        expect(firstPage?.style.fontSize).toBe('14pt');
      });
    });
    await act(async () => {
      await vi.waitFor(() => {
        const pages = host.querySelectorAll<HTMLElement>(
          '[data-testid^="a4-page-content-"]',
        );
        expect(
          Array.from(
            pages,
            (pageContent) => pageContent.textContent,
          ).join('|'),
        ).not.toBe(initialPageDistribution.join('|'));
      });
    });

    const canonical = editorRef.current?.getContent() ?? '';
    expect(
      new DOMParser().parseFromString(canonical, 'text/html').body.textContent,
    ).toBe(expectedText);
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
    await act(flushLayoutFrames);
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

  it('keeps an Enter-created paragraph and restores the caret there', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>AlphaBeta</p>" />);
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelector('p')?.textContent).toBe('AlphaBeta');
      });
    });

    const pageContent = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const surface = host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!;
    const text = pageContent.querySelector('p')!.firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 5);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => pressEnter());
    await act(flushLayoutFrames);

    await act(async () => {
      await vi.waitFor(() => {
        const canonical = new DOMParser().parseFromString(
          editorRef.current?.getContent() ?? '',
          'text/html',
        );
        expect(Array.from(canonical.body.querySelectorAll('p'), (p) => p.textContent)).toEqual([
          'Alpha',
          'Beta',
        ]);
        expect(selectedParagraphText()).toBe('Beta');
        expect(window.getSelection()?.anchorOffset).toBe(0);
      }, { timeout: 3000 });
    });
  });

  it('types the first two lines in document order', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => root.render(<A4PageEditor ref={editorRef} value="" />));
    await act(flushLayoutFrames);

    const paragraph = host.querySelector<HTMLParagraphElement>(
      '[data-testid="a4-page-content-1"] p',
    )!;
    await act(async () => {
      host.querySelector<HTMLElement>(
        '[data-testid="a4-document-surface"]',
      )!.focus();
    });
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    await act(async () => {
      await cdp().send('Input.insertText', { text: 'Alpha' });
    });
    await act(flushLayoutFrames);
    await pressEnter();
    await act(flushLayoutFrames);
    await act(async () => {
      await cdp().send('Input.insertText', { text: 'Beta' });
    });
    await act(flushLayoutFrames);
    await flushPendingEditorUpdates();

    const canonical = new DOMParser().parseFromString(
      editorRef.current!.getContent(),
      'text/html',
    );
    expect(Array.from(canonical.body.querySelectorAll('p'), (p) => p.textContent))
      .toEqual(['Alpha', 'Beta']);
  });

  it('pastes a long plain-text draft once', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    await act(async () => root.render(
      <A4PageEditor ref={editorRef} value="<p>Start</p>" onChange={onChange} />,
    ));
    await act(flushLayoutFrames);
    await flushPendingEditorUpdates();

    const lines = Array.from({ length: 120 }, (_, index) => `Draft line ${index + 1}`);
    const pageContent = host.querySelector<HTMLElement>('[data-testid="a4-page-content-1"]')!;
    const text = pageContent.querySelector('p')!.firstChild!;
    await act(async () => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, text.textContent!.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', lines.join('\n'));
    await act(async () => {
      pageContent.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
    });
    await act(flushLayoutFrames);
    await flushPendingEditorUpdates();

    const textContent = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body.textContent ?? '';
    expect(textContent.match(/Draft line 34/g)).toHaveLength(1);
    expect(textContent.match(/Draft line 120/g)).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps an Enter-created line near the page bottom without jumping scroll', async () => {
    host.style.height = '500px';
    const editorRef = createRef<A4PageEditorRef>();
    const paragraphs = Array.from(
      { length: 90 },
      (_, index) =>
        `<p>Line ${index + 1}: bottom pagination marker with deterministic content.</p>`,
    ).join('');
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={paragraphs} />);
    });
    await act(flushLayoutFrames);
    await waitForEditorIdle();
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]').length).toBeGreaterThan(1);
      }, { timeout: 3000 });
    });

    const firstPage = host.querySelector<HTMLElement>('[data-testid="a4-page-content-1"]')!;
    const target = Array.from(firstPage.querySelectorAll('p')).at(-1)!;
    const targetText = target.firstChild!;
    const splitOffset = Math.floor((targetText.textContent?.length ?? 0) / 2);
    const expectedBefore = targetText.textContent!.slice(0, splitOffset);
    const expectedAfter = targetText.textContent!.slice(splitOffset);
    const surface = host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(targetText, splitOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    const expectedCaretOffset = logicalCaretOffset(host);

    const scrollContainer = surface.parentElement!.parentElement!;
    scrollContainer.scrollTop = 240;
    const previousScrollTop = scrollContainer.scrollTop;

    await act(async () => pressEnter());

    await act(async () => {
      await vi.waitFor(() => {
        const canonical = new DOMParser().parseFromString(
          editorRef.current?.getContent() ?? '',
          'text/html',
        );
        const texts = Array.from(canonical.body.querySelectorAll('p'), (p) => p.textContent);
        expect(texts).toContain(expectedBefore);
        expect(texts).toContain(expectedAfter);
        expect(scrollContainer.scrollTop).toBe(previousScrollTop);
        expect(logicalCaretOffset(host)).toBe(expectedCaretOffset);
      });
    });
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
    for (let frame = 0; frame < 4; frame += 1) {
      await act(flushLayoutFrames);
    }

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

  it('prevents text insertion at an inter-page editing-host boundary', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      if (!String(args[0]).includes('not wrapped in act')) {
        throw new Error(args.map(String).join(' '));
      }
    });
    await act(async () => {
      root.render(
        <A4PageEditor
          value={'<p>First page</p><div class="page-break" data-break-type="hard"></div><p>Second page</p>'}
        />,
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]')).toHaveLength(2);
      });
    });

    const surface = host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!;
    const firstPageContent = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const paperContainer = firstPageContent.parentElement!;
    await act(async () => {
      surface.focus();
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(paperContainer, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => {
      await cdp().send('Input.insertText', { text: 'ROGUE_BOUNDARY_TEXT' });
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(surface.textContent).not.toContain('ROGUE_BOUNDARY_TEXT');
        expect(
          Array.from(surface.childNodes).some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              node.textContent?.includes('ROGUE_BOUNDARY_TEXT'),
          ),
        ).toBe(false);
      });
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    consoleError.mockRestore();
  });

  it('adds and removes a persistent blank page with one action', async () => {
    await act(async () => {
      root.render(<A4PageEditor value="<p>First page</p>" />);
    });
    for (let frame = 0; frame < 4; frame += 1) {
      await act(flushLayoutFrames);
    }

    const addPage = Array.from(host.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Add blank page',
    );
    expect(addPage).toBeTruthy();
    await act(async () => userEvent.click(addPage!));
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]')).toHaveLength(2);
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(host.querySelectorAll('[data-testid^="a4-page-content-"]')).toHaveLength(2);

    const secondPage = host.querySelector<HTMLElement>('[data-testid="a4-page-content-2"]')!;
    await act(async () => {
      secondPage.focus();
    });
    const deletePage = Array.from(host.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Delete current page',
    );
    expect(deletePage).toBeTruthy();
    await act(async () => userEvent.click(deletePage!));
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]')).toHaveLength(1);
      });
    });
  });

  it('routes native cross-page text replacement through the canonical document', async () => {
    host.style.zoom = '0.25';
    await page.viewport(1280, 900);
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={'<p>Alpha</p><div class="page-break" data-break-type="hard"></div><p>Beta</p>'}
          onChange={onChange}
        />,
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('[data-testid^="a4-page-content-"]')).toHaveLength(2);
      });
    });
    for (let frame = 0; frame < 4; frame += 1) {
      await act(flushLayoutFrames);
    }

    const contents = host.querySelectorAll<HTMLElement>(
      '[data-testid^="a4-page-content-"]',
    );
    const firstText = contents[0].querySelector('p')!.firstChild!;
    const secondText = contents[1].querySelector('p')!.firstChild!;
    const startRange = document.createRange();
    startRange.setStart(firstText, 2);
    startRange.setEnd(firstText, 3);
    const endRange = document.createRange();
    endRange.setStart(secondText, 1);
    endRange.setEnd(secondText, 2);
    const start = viewportPoint(startRange.getBoundingClientRect(), 'start');
    const end = viewportPoint(endRange.getBoundingClientRect(), 'end');

    await act(async () => {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 20 });
      await page.mouse.up();
    });
    const selectedText = window.getSelection()?.toString() ?? '';
    expect(selectedText).toContain('pha');
    expect(selectedText).toContain('Be');

    await act(async () => {
      await cdp().send('Input.insertText', { text: 'X' });
    });

    await act(async () => {
      await vi.waitFor(() => {
        const canonical = editorRef.current?.getContent() ?? '';
        const text = new DOMParser()
          .parseFromString(canonical, 'text/html')
          .body.textContent ?? '';
        expect(text).toBe('AlXta');
        expect(onChange).toHaveBeenCalled();
      });
    });
    expect(
      Array.from(
        host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
      ).some((content) => content.textContent?.includes('X')),
    ).toBe(true);
    expect(
      Array.from(
        host.querySelectorAll<HTMLElement>('[data-testid="a4-document-surface"] > *'),
      ).some((wrapper) =>
        Array.from(wrapper.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.includes('X'),
        ),
      ),
    ).toBe(false);

    await act(async () => {
      await vi.waitFor(() => {
        const replacementSelection = window.getSelection()!;
        expect(replacementSelection.isCollapsed).toBe(true);
        const anchorNode = replacementSelection.anchorNode!;
        const anchorPage =
          (anchorNode.nodeType === Node.ELEMENT_NODE
            ? (anchorNode as HTMLElement)
            : anchorNode.parentElement
          )?.closest<HTMLElement>('[data-testid^="a4-page-content-"]') ?? null;
        expect(anchorPage).toBeTruthy();
        const currentPageRange = document.createRange();
        currentPageRange.setStart(anchorPage!, 0);
        currentPageRange.setEnd(
          anchorNode,
          replacementSelection.anchorOffset,
        );
        const pageContents = Array.from(
          host.querySelectorAll<HTMLElement>(
            '[data-testid^="a4-page-content-"]',
          ),
        );
        const precedingTextLength = pageContents
          .slice(0, pageContents.indexOf(anchorPage!))
          .reduce((length, content) => length + (content.textContent?.length ?? 0), 0);
        expect(precedingTextLength + currentPageRange.toString().length).toBe(3);
      });
    });

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    await act(async () => {
      surface.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await act(async () => {
      await vi.waitFor(() => {
        const canonical = editorRef.current?.getContent() ?? '';
        const text = new DOMParser()
          .parseFromString(canonical, 'text/html')
          .body.textContent ?? '';
        expect(text).toBe('AlphaBeta');
      });
    });
  });

  it('keeps repeated full-document formatting idempotent without growing markup', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const paragraphs = Array.from(
      { length: 24 },
      (_, index) =>
        `<p>Formatting marker line ${index + 1} with enough words to exercise a whole-document selection.</p>`,
    ).join('');

    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={paragraphs} />);
    });
    await act(flushLayoutFrames);

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    await act(async () => {
      surface.focus();
    });

    const formatsButton = () =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Formats',
      )!;
    const selectAll = () => {
      surface.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'a',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    };
    const applyFormatting = async () => {
      await act(async () => {
        selectAll();
        const button = formatsButton();
        if (button.getAttribute('aria-expanded') !== 'true') {
          await userEvent.click(button);
        }
        await flushLayoutFrames();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      await waitForEditorIdle();
      const fontFamily = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Font family"]',
      )!;
      const fontSize = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Font size"]',
      )!;
      await act(async () => {
        await userEvent.selectOptions(fontFamily, 'Georgia, serif');
        await flushLayoutFrames();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        await flushLayoutFrames();
      });
      await waitForEditorIdle();
      await act(async () => {
        await userEvent.selectOptions(fontSize, '14pt');
        await flushLayoutFrames();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        await flushLayoutFrames();
      });
      await waitForEditorIdle();
    };

    await applyFormatting();
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('span[style]').length).toBeGreaterThan(0);
      });
    });
    const afterFirst = host.querySelectorAll('span[style]').length;
    const textAfterFirst =
      new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body.textContent ?? '';

    await applyFormatting();
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelectorAll('span[style]')).toHaveLength(afterFirst);
      });
    });

    expect(host.querySelectorAll('span > p')).toHaveLength(0);
    const canonical = editorRef.current!.getContent();
    expect(
      new DOMParser().parseFromString(canonical, 'text/html').body.textContent,
    ).toBe(textAfterFirst);
    expect(canonical.length).toBeLessThan(30_000);
  });

  it('exposes a stable reflow busy state while repaginating', async () => {
    const longDocument = Array.from(
      { length: 120 },
      (_, index) => `<p>Busy marker ${index + 1}</p>`,
    ).join('');
    await act(async () => {
      root.render(
        <A4PageEditor
          value={longDocument}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
          }}
        />,
      );
    });

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    expect(surface.getAttribute('aria-busy')).toBe('true');
    expect(
      host.querySelector('[data-testid="a4-editor-status"]')?.textContent,
    ).toBe('Repaginating…');

    for (let frame = 0; frame < 4; frame += 1) {
      await act(flushLayoutFrames);
    }
    expect(surface.getAttribute('aria-busy')).toBe('false');
    expect(
      host.querySelector('[data-testid="a4-editor-status"]')?.textContent,
    ).toBe('Editing');

    await act(async () => {
      root.render(
        <A4PageEditor
          value={longDocument}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            marginsMm: { top: 60, right: 20, bottom: 20, left: 20 },
          }}
        />,
      );
    });
    expect(surface.getAttribute('aria-busy')).toBe('true');
    for (let frame = 0; frame < 4; frame += 1) {
      await act(flushLayoutFrames);
    }
    expect(surface.getAttribute('aria-busy')).toBe('false');
  });

  it('keeps ordinary line breaks and the marker page aligned in print media', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const content = Array.from(
      { length: 70 },
      (_, index) =>
        `<p>Print marker line ${index + 1}<br>Second break ${index + 1}</p>`,
    ).join('');
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={content} />);
    });
    for (let frame = 0; frame < 4; frame += 1) {
      await act(flushLayoutFrames);
    }

    const editPages = host.querySelectorAll<HTMLElement>(
      '[data-testid^="a4-page-content-"]',
    );
    expect(editPages.length).toBeGreaterThan(1);
    const marker = 'Print marker line 42';
    const editMarkerPage = Array.from(editPages).findIndex((page) =>
      page.textContent?.includes(marker),
    );
    expect(editMarkerPage).toBeGreaterThanOrEqual(0);

    await cdp().send('Emulation.setEmulatedMedia', { media: 'print' });
    await act(async () => {
      const print = Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Print',
      )!;
      await userEvent.click(print);
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });

    const frame = document.querySelector('iframe')!;
    expect(frame).toBeTruthy();
    const frameDoc = frame.contentDocument!;
    const printPages = Array.from(frameDoc.querySelectorAll('.print-page'));
    expect(printPages.length).toBeGreaterThan(1);
    const printMarkerPage = printPages.findIndex((page) =>
      page.textContent?.includes(marker),
    );
    expect(printMarkerPage).toBe(editMarkerPage);
    expect(
      printPages.filter((page) => page.textContent?.includes(marker)),
    ).toHaveLength(1);

    await act(async () => {
      await vi.waitFor(() => {
        expect(document.querySelector('iframe')).toBeNull();
      }, { timeout: 3000 });
    });
    await cdp().send('Emulation.setEmulatedMedia', { media: 'screen' });
  });

  it('Enter replaces a non-collapsed selection before splitting (IR-01)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>SELCASECASE</p>" />);
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const text = page.querySelector('p')!.firstChild!;
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    await act(async () => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, 3);
      range.setEnd(text, 7);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await pressEnter();
    await act(async () => {
      await flushLayoutFrames();
    });
    await waitForEditorIdle();

    const paragraphs = Array.from(
      new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body.querySelectorAll('p'),
      (paragraph) => paragraph.textContent,
    );
    expect(paragraphs).toEqual(['SEL', 'CASE']);
  });

  it('rich paste strips flow metadata and never nests blocks (IR-02)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>AlphaBeta</p>" />);
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const text = page.querySelector('p')!.firstChild!;
    await act(async () => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, 5);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    const clipboardData = new DataTransfer();
    clipboardData.setData(
      'text/html',
      '<p data-flow-id="f1" data-flow-continuation="true">One</p>' +
        '<p data-flow-id="f1" data-flow-oversized="true">Two</p>',
    );
    await act(async () => {
      page.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      );
    });
    await waitForEditorIdle();

    const canonical = editorRef.current!.getContent();
    expect(canonical).not.toContain('data-flow-id');
    expect(canonical).not.toContain('data-flow-continuation');
    expect(canonical).not.toContain('data-flow-oversized');
    const body = new DOMParser().parseFromString(canonical, 'text/html').body;
    expect(body.querySelector('p p, p h1, p blockquote, p table, p ul, p ol')).toBeNull();
    expect(canonical.match(/One/g)).toHaveLength(1);
    expect(canonical.match(/Two/g)).toHaveLength(1);
  });

  it('insertion APIs refuse stale bookmarks without touching content (IR-03)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>Alpha</p>" />);
    });
    await waitForEditorIdle();

    await act(async () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.getSelection()?.removeAllRanges();
    });
    await act(async () => {
      editorRef.current!.insertHtmlAtCursor('<p>Dropped</p>');
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(
      Array.from(host.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes(
          'Selection moved after repagination; choose the text again.',
        ),
      ),
    ).toBe(true);
    expect(editorRef.current!.getContent()).toBe('<p>Alpha</p>');
  });

  it('applies and toggles bold for collapsed-caret typing with real pointer clicks (IR-04)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>Alpha</p>" />);
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const text = page.querySelector('p')!.firstChild!;
    await act(async () => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, 5);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    await act(async () => {
      await userEvent.click(
        Array.from(host.querySelectorAll('button')).find(
          (button) => button.getAttribute('aria-label') === 'Bold',
        )!,
      );
    });
    await act(async () => {
      await cdp().send('Input.insertText', { text: 'X' });
    });
    await waitForEditorIdle();
    expect(
      host.querySelector('[data-testid="a4-page-content-1"] span')?.textContent,
    ).toBe('X');

    const boldSpan = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"] span',
    )!;
    await act(async () => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(boldSpan.firstChild!, 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await act(async () => {
      await userEvent.click(
        Array.from(host.querySelectorAll('button')).find(
          (button) => button.getAttribute('aria-label') === 'Bold',
        )!,
      );
    });
    await act(async () => {
      await cdp().send('Input.insertText', { text: 'Y' });
    });
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.textContent).toBe('AlphaXY');
    expect(body.querySelector('p')?.lastChild?.textContent).toBe('Y');
  });

  it('toggles selected bold off and on with real pointer clicks while preserving colour and italic (VR2-01)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={
            '<p><span style="font-weight:bold;color:rgb(255, 0, 0);font-style:italic">abcdef</span></p>'
          }
        />,
      );
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const boldButton = () =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'Bold',
      )!;
    const selectSpan = () => {
      const text = page.querySelector('span')!.firstChild!;
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, text.textContent!.length);
      selection.removeAllRanges();
      selection.addRange(range);
    };

    await act(async () => {
      selectSpan();
    });
    await act(async () => {
      await userEvent.click(boldButton());
    });
    await waitForEditorIdle();

    await act(async () => {
      selectSpan();
    });
    await act(async () => {
      await userEvent.click(boldButton());
    });
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.textContent).toBe('abcdef');
    const boldSpan = Array.from(body.querySelectorAll('span')).find(
      (candidate) => candidate.style.fontWeight === 'bold',
    )!;
    expect(boldSpan.textContent).toBe('abcdef');
    expect(boldSpan.style.fontStyle).toBe('italic');
    expect(boldSpan.style.color).toBe('rgb(255, 0, 0)');
    expect(window.getSelection()?.toString()).toBe('abcdef');
  });

  it('toggles pending bold off and on before typing in the middle of a wrapper (VR2-01)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={'<p><span style="font-weight:bold">abc</span></p>'}
        />,
      );
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const pageContent = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const placeCaret = async () => {
      const text = pageContent.querySelector('span')!.firstChild!;
      await act(async () => {
        surface.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(text, 1);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    };
    await placeCaret();

    const boldButton = () =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'Bold',
      )!;
    await act(async () => {
      await userEvent.click(boldButton());
    });
    await placeCaret();
    await act(async () => {
      await userEvent.click(boldButton());
    });
    await placeCaret();
    expect(window.getSelection()?.anchorOffset).toBe(1);
    await act(async () => {
      await cdp().send('Input.insertText', { text: 'X' });
    });
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.textContent).toBe('aXbc');
    const boldSpan = Array.from(body.querySelectorAll('span')).find(
      (candidate) => candidate.style.fontWeight === 'bold',
    )!;
    expect(boldSpan.textContent).toBe('aXbc');
    const selection = window.getSelection()!;
    expect(selection.isCollapsed).toBe(true);
    expect(selection.anchorNode?.textContent).toBe('aXbc');
    expect(selection.anchorOffset).toBe(2);
  });

  it('keeps list items editable through creation, alignment, indent, type switch, and toggle-off (VR2-02)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>One</p><p>Two</p>" />);
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const buttonByLabel = (label: string) =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === label,
      )!;
    const selectBoth = () => {
      const paragraphs = Array.from(
        host.querySelectorAll('[data-testid="a4-page-content-1"] p'),
      );
      expect(paragraphs).toHaveLength(2);
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(paragraphs[0].firstChild!, 0);
      range.setEnd(
        paragraphs[1].firstChild!,
        paragraphs[1].textContent!.length,
      );
      selection.removeAllRanges();
      selection.addRange(range);
    };

    await act(async () => {
      selectBoth();
    });
    await act(async () => {
      await userEvent.click(buttonByLabel('Bulleted list'));
    });
    await waitForEditorIdle();
    let body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.querySelectorAll('ul')).toHaveLength(1);
    expect(body.querySelectorAll('ul > li > p')).toHaveLength(2);

    await act(async () => {
      selectBoth();
    });
    await act(async () => {
      await userEvent.click(buttonByLabel('Align center'));
    });
    await waitForEditorIdle();
    body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(
      Array.from(body.querySelectorAll<HTMLElement>('ul > li > p')).every(
        (paragraph) => paragraph.style.textAlign === 'center',
      ),
    ).toBe(true);

    await act(async () => {
      selectBoth();
    });
    await act(async () => {
      await userEvent.click(buttonByLabel('Increase indent'));
    });
    await waitForEditorIdle();
    body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(
      Array.from(body.querySelectorAll<HTMLElement>('ul > li > p')).every(
        (paragraph) => paragraph.style.marginLeft === '2em',
      ),
    ).toBe(true);

    await act(async () => {
      selectBoth();
    });
    await act(async () => {
      await userEvent.click(buttonByLabel('Numbered list'));
    });
    await waitForEditorIdle();
    body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.querySelectorAll('ol')).toHaveLength(1);
    expect(body.querySelectorAll('ul')).toHaveLength(0);
    expect(body.querySelectorAll('ol > li > p')).toHaveLength(2);

    await act(async () => {
      selectBoth();
    });
    await act(async () => {
      await userEvent.click(buttonByLabel('Numbered list'));
    });
    await waitForEditorIdle();
    body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.querySelectorAll('ol, ul')).toHaveLength(0);
    expect(
      Array.from(body.children, (node) => node.tagName),
    ).toEqual(['P', 'P']);
    expect(
      new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body.textContent,
    ).toBe('OneTwo');
  });

  it('pastes block-rich lists and tables, then types, undoes, and redoes without duplicates (VR2-03)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>AlphaBeta</p>" />);
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const placeCaret = async () => {
      const text = page.querySelector('p')!.firstChild!;
      await act(async () => {
        surface.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(text, 5);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    };
    const pasteHtml = async (html: string) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', html);
      await act(async () => {
        page.dispatchEvent(
          new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData,
          }),
        );
      });
      await waitForEditorIdle();
    };
    const canonicalBody = () =>
      new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body;
    const undo = async () => {
      await act(async () => {
        surface.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'z',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await waitForEditorIdle();
    };

    await placeCaret();
    await pasteHtml('<ul><li>One</li><li>Two</li></ul>');
    let body = canonicalBody();
    expect(body.querySelector('p ul, p ol, p table')).toBeNull();
    expect(body.textContent).toBe('AlphaOneTwoBeta');
    expect(body.querySelectorAll('ul')).toHaveLength(1);
    expect(editorRef.current!.getContent().match(/One/g)).toHaveLength(1);
    expect(editorRef.current!.getContent().match(/Two/g)).toHaveLength(1);

    const trailingText = Array.from(page.querySelectorAll('p')).at(-1)!
      .firstChild!;
    await act(async () => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(trailingText, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await act(async () => {
      await cdp().send('Input.insertText', { text: 'X' });
    });
    await waitForEditorIdle();
    body = canonicalBody();
    expect(body.textContent).toBe('AlphaOneTwoXBeta');

    await undo();
    expect(canonicalBody().textContent).toBe('AlphaOneTwoBeta');
    await undo();
    expect(canonicalBody().textContent).toBe('AlphaBeta');
    await act(async () => {
      surface.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'y',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await waitForEditorIdle();
    expect(canonicalBody().textContent).toBe('AlphaOneTwoBeta');

    await undo();
    expect(canonicalBody().textContent).toBe('AlphaBeta');
    await placeCaret();
    await pasteHtml(
      '<table><tbody><tr><td>Cell</td></tr></tbody></table>',
    );
    body = canonicalBody();
    expect(body.querySelector('p ul, p ol, p table')).toBeNull();
    expect(body.textContent).toBe('AlphaCellBeta');
    expect(body.querySelectorAll('table')).toHaveLength(1);
    expect(editorRef.current!.getContent().match(/Cell/g)).toHaveLength(1);
    expect(
      Array.from(body.children, (node) => node.tagName),
    ).toEqual(['P', 'TABLE', 'P']);

    await undo();
    expect(canonicalBody().textContent).toBe('AlphaBeta');
  });

  it('clears formatting only inside a partial selection (IR-05)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value='<p><span style="font-weight: bold">abcdef</span></p>'
        />,
      );
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const text = page.querySelector('span')!.firstChild!;
    await act(async () => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, 2);
      range.setEnd(text, 4);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    await act(async () => {
      const formats = Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Formats',
      )!;
      await userEvent.click(formats);
    });
    await act(async () => {
      const clear = Array.from(document.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'Clear formatting',
      )!;
      await userEvent.click(clear);
    });
    await waitForEditorIdle();

    const spans = Array.from(
      new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body.querySelectorAll('span'),
    );
    expect(spans.map((span) => span.textContent)).toEqual(['ab', 'ef']);
    expect(editorRef.current!.getContent()).toContain('>cd<');
  });

  it('normalizes selected colours for the controlled colour input (IR-06)', async () => {
    await act(async () => {
      root.render(
        <A4PageEditor
          value='<p><span style="color: rgb(255, 0, 0)">Red</span></p>'
        />,
      );
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const text = page.querySelector('span')!.firstChild!;
    await act(async () => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(text, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await act(async () => {
      const formats = Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Formats',
      )!;
      await userEvent.click(formats);
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const colorInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Text color"]',
    )!;
    expect(colorInput.value).toBe('#ff0000');
  });

  it('applies a paragraph style to every intersected block and keeps the selection (IR-07)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value="<p>One</p><p>Two</p>" />);
    });
    await waitForEditorIdle();

    const page = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const paragraphs = Array.from(page.querySelectorAll('p'));
    const firstText = paragraphs[0].firstChild!;
    const secondText = paragraphs[1].firstChild!;
    await act(async () => {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(firstText, 1);
      range.setEnd(secondText, 1);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    await act(async () => {
      const formats = Array.from(host.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Formats',
      )!;
      await userEvent.click(formats);
    });
    const styleSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Paragraph style"]',
    )!;
    await act(async () => {
      await userEvent.selectOptions(styleSelect, 'h1');
    });
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.querySelectorAll('h1')).toHaveLength(2);
    const selection = window.getSelection()!;
    expect(selection.isCollapsed).toBe(false);
    expect(selection.anchorNode?.textContent).toBe('One');
    expect(selection.focusNode?.textContent).toBe('Two');
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
