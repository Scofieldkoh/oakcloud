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
  await userEvent.keyboard('{Enter}');
}

async function flushLayoutFrames() {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
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
    surface.focus();
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
    surface.focus();
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
    surface.focus();
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

    const addPage = Array.from(host.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Add blank page',
    );
    expect(addPage).toBeTruthy();
    await act(async () => addPage!.click());
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
    secondPage.focus();
    const deletePage = Array.from(host.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Delete current page',
    );
    expect(deletePage).toBeTruthy();
    await act(async () => deletePage!.click());
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
