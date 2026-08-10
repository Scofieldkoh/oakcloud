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

  it('never cuts a word across page boundaries when a paragraph exceeds the page', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const sentence =
      'i)\tAttending to reporting of information and submitting documents and forms with other government agencies;';
    const paragraph = Array.from({ length: 60 }, () => sentence).join(' ');

    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={`<p>${paragraph}</p>`} />);
    });
    await waitForEditorIdle();

    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);

    pageContents.slice(0, -1).forEach((pageContent, index) => {
      const text = pageContent.textContent ?? '';
      const nextText = pageContents[index + 1].textContent ?? '';
      expect(text, `page ${index + 1} ends mid-word`).toMatch(/\s$/);
      expect(nextText, `page ${index + 2} starts mid-word`).toMatch(/^\S/);
    });
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

  it('splits a numbered list item into two numbered items on Enter', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor ref={editorRef} value="<ol><li><p>ABCD</p></li></ol>" />,
      );
    });
    await waitForEditorIdle();

    const pageContent = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const text = pageContent.querySelector('ol li p')!.firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => pressEnter());
    await act(flushLayoutFrames);

    await act(async () => {
      await vi.waitFor(() => {
        const body = new DOMParser()
          .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
          .body;
        expect(body.querySelectorAll('ol > li > p')).toHaveLength(2);
        expect(
          Array.from(
            body.querySelectorAll('ol > li > p'),
            (p) => p.textContent,
          ),
        ).toEqual(['AB', 'CD']);
        expect(selectedParagraphText()).toBe('CD');
      }, { timeout: 3000 });
    });
  });

  it('exits the numbered list when Enter is pressed on the empty second item', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor ref={editorRef} value="<ol><li><p>ABCD</p></li></ol>" />,
      );
    });
    await waitForEditorIdle();

    const pageContent = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const text = pageContent.querySelector('ol li p')!.firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => pressEnter());
    await act(flushLayoutFrames);
    await act(async () => {
      await vi.waitFor(() => {
        const body = new DOMParser()
          .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
          .body;
        expect(body.querySelectorAll('ol > li > p')).toHaveLength(2);
      }, { timeout: 3000 });
    });

    await act(async () => pressEnter());
    await act(flushLayoutFrames);

    await act(async () => {
      await vi.waitFor(() => {
        const body = new DOMParser()
          .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
          .body;
        expect(body.querySelectorAll('ol > li > p')).toHaveLength(1);
        expect(body.querySelector('ol')?.nextElementSibling?.tagName).toBe(
          'P',
        );
        expect(
          body.querySelector('ol')?.nextElementSibling?.textContent,
        ).toBe('');
        expect(selectedParagraphText()).toBe('');
      }, { timeout: 3000 });
    });
  });

  it('exits the list with two rapid Enter presses at the end of an item', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor ref={editorRef} value="<ol><li><p>ABCD</p></li></ol>" />,
      );
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const text = host.querySelector('ol li p')!.firstChild!;
    await act(async () => {
      surface.focus();
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => pressEnter());
    await act(async () => pressEnter());
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelectorAll('ol > li')).toHaveLength(1);
    expect(body.querySelector('ol')?.nextElementSibling?.tagName).toBe('P');
    expect(
      getComputedStyle(host.querySelector('ol > li')!, '::before').content,
    ).toContain('counter(item)');
  });

  it('creates an alphabetical list from the toolbar with a), b) markers', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor ref={editorRef} value="<p>Alpha</p><p>Beta</p>" />,
      );
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const buttonByLabel = (label: string) =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === label,
      )!;
    const paragraphs = Array.from(
      host.querySelectorAll('[data-testid="a4-page-content-1"] p'),
    );
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(paragraphs[0].firstChild!, 0);
    range.setEnd(
      paragraphs[1].firstChild!,
      paragraphs[1].textContent!.length,
    );
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => {
      await userEvent.click(buttonByLabel('Alphabetical list'));
    });
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelectorAll('ol.list-alpha > li > p')).toHaveLength(2);
    expect(
      getComputedStyle(
        host.querySelector('ol.list-alpha > li')!,
        '::before',
      ).content,
    ).toContain('counter(item, lower-alpha)');
    expect(
      getComputedStyle(
        host.querySelectorAll('ol.list-alpha > li')[1],
        '::before',
      ).content,
    ).toContain('counter(item, lower-alpha)');
  });

  it('nests a list item with the toolbar button and lifts it back', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value="<ol><li><p>One</p></li><li><p>Two</p></li></ol>"
        />,
      );
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const buttonByLabel = (label: string) =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === label,
      )!;
    const secondItemText = host.querySelectorAll('ol > li')[1]!.firstChild!
      .firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(secondItemText, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => {
      await userEvent.click(buttonByLabel('Nested list'));
    });
    await waitForEditorIdle();

    let body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelectorAll('ol > li > ol > li > p')).toHaveLength(1);
    expect(
      getComputedStyle(
        host.querySelector('ol > li > ol > li')!,
        '::before',
      ).content,
    ).toContain('counters(item, ".")');

    const nestedItemText = host.querySelector(
      'ol > li > ol > li > p',
    )!.firstChild!;
    const nestedRange = document.createRange();
    nestedRange.setStart(nestedItemText, 0);
    nestedRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(nestedRange);
    await act(async () => {
      await userEvent.click(buttonByLabel('Nested list'));
    });
    await waitForEditorIdle();

    body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelectorAll(':scope > ol > li')).toHaveLength(2);
    expect(body.querySelectorAll('ol > li > ol')).toHaveLength(0);
  });

  it('sets a custom start value from the toolbar and renders 2., 3.', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor ref={editorRef} value="<ol><li><p>One</p></li></ol>" />,
      );
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const itemText = host.querySelector('ol li p')!.firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(itemText, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    await act(async () => {
      await vi.waitFor(() => {
        expect(
          host.querySelector('[aria-label="List start number"]'),
        ).not.toBeNull();
      });
    });
    const input = host.querySelector<HTMLInputElement>(
      '[aria-label="List start number"]',
    )!;
    await act(async () => {
      await userEvent.clear(input);
      await userEvent.type(input, '2');
    });
    await waitForEditorIdle();

    const body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelector('ol')?.getAttribute('start')).toBe('2');
    expect(
      body.querySelector<HTMLElement>('ol')!.style.getPropertyValue(
        '--list-start',
      ),
    ).toBe('1');
    expect(
      getComputedStyle(host.querySelector('ol > li')!, '::before').content,
    ).toContain('counter(item)');
    const renderedCounterReset = getComputedStyle(
      host.querySelector('ol')!,
    ).counterReset;
    expect(
      renderedCounterReset,
      `rendered counter-reset (style="${host.querySelector('ol')?.getAttribute('style')}")`,
    ).toContain('1');
  });

  it('bolds list numbers from the toolbar and toggles them off', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor ref={editorRef} value="<ol><li><p>One</p></li></ol>" />,
      );
    });
    await waitForEditorIdle();

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const page = host.querySelector('[data-testid="a4-page-content-1"]')!;
    const itemText = page.querySelector('ol li p')!.firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(itemText, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    const buttonByLabel = (label: string) =>
      Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === label,
      )!;
    await act(async () => {
      await userEvent.click(buttonByLabel('Bold list numbers'));
    });
    await waitForEditorIdle();

    let body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelector('ol')?.classList.contains('list-bold-numbers'))
      .toBe(true);
    const listItem = page.querySelector('ol > li')!;
    expect(getComputedStyle(listItem, '::before').fontWeight).toBe('700');

    await act(async () => {
      await userEvent.click(buttonByLabel('Bold list numbers'));
    });
    await waitForEditorIdle();
    body = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(body.querySelector('ol')?.classList.contains('list-bold-numbers'))
      .toBe(false);
  });

  it('continues numbered list markers across soft pages', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const items = Array.from(
      { length: 60 },
      (_, index) =>
        `<li><p>Item ${index + 1}: enough content to wrap and fill several A4 pages.</p></li>`,
    ).join('');
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={`<ol>${items}</ol>`} />);
    });
    await waitForEditorIdle();

    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>(
        '[data-testid^="a4-page-content-"]',
      ),
    );
    expect(pageContents.length).toBeGreaterThan(1);

    const continuations = Array.from(
      host.querySelectorAll<HTMLElement>(
        'ol[data-flow-continuation="end"]',
      ),
    );
    expect(continuations.length).toBeGreaterThan(0);
    continuations.forEach((list) => {
      expect(list.style.getPropertyValue('--flow-list-start')).not.toBe('');
    });
    expect(
      continuations.every((list) =>
        Array.from(list.querySelectorAll('li')).every(
          (item) => !item.hasAttribute('data-flow-continuation-item'),
        ),
      ),
    ).toBe(true);
  });

  it('does not repeat the marker when a nested list item splits across pages', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const longText = Array.from(
      { length: 200 },
      () => 'long nested item content that keeps wrapping onto additional lines',
    ).join(' ');
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={`<ol start="3"><li><p>Parent</p><ol><li><p>${longText}</p></li><li><p>Next sub-item</p></li></ol></li></ol>`}
        />,
      );
    });
    await waitForEditorIdle();

    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>(
        '[data-testid^="a4-page-content-"]',
      ),
    );
    expect(pageContents.length).toBeGreaterThan(1);

    const continuationItems = Array.from(
      host.querySelectorAll<HTMLElement>(
        'li[data-flow-continuation-item="true"]',
      ),
    );
    expect(continuationItems.length).toBeGreaterThanOrEqual(2);
    continuationItems.forEach((item) => {
      expect(getComputedStyle(item, '::before').content).toBe('none');
    });

    const continuationLists = Array.from(
      host.querySelectorAll<HTMLElement>('ol[style*="--flow-list-start"]'),
    );
    expect(continuationLists.length).toBeGreaterThanOrEqual(2);
    continuationLists.forEach((list) => {
      expect(list.style.getPropertyValue('--flow-list-start')).not.toBe('');
    });

    pageContents.slice(1).forEach((page) => {
      const outer = page.querySelector<HTMLElement>(':scope > ol');
      const nested = outer?.querySelector<HTMLElement>('ol');
      expect(outer?.style.getPropertyValue('--flow-list-start')).toBe('3');
      expect(nested?.style.getPropertyValue('--flow-list-start')).toBe('1');
    });

    const canonical = new DOMParser()
      .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
      .body;
    expect(canonical.querySelectorAll('ol ol')).toHaveLength(1);
    expect(canonical.querySelectorAll('ol ol > li')).toHaveLength(2);

    const nextParagraph = Array.from(host.querySelectorAll('p')).find(
      (paragraph) => paragraph.textContent === 'Next sub-item',
    )!;
    const continuedNestedList = nextParagraph.closest('ol') as HTMLElement;
    const directItems = Array.from(continuedNestedList.children).filter(
      (child) => child.tagName === 'LI',
    );
    expect(continuedNestedList.style.getPropertyValue('--flow-list-start')).toBe(
      '1',
    );
    expect(directItems).toHaveLength(2);
    expect(directItems[0].hasAttribute('data-flow-continuation-item')).toBe(
      true,
    );
    expect(directItems[1].hasAttribute('data-flow-continuation-item')).toBe(
      false,
    );
  });

  it('renders the list marker on the same line as the item content', async () => {
    await act(async () => {
      root.render(
        <A4PageEditor
          value="<ol><li><p>First item</p></li><li><p>Second item</p></li></ol><ul><li><p>Bullet</p></li></ul>"
        />,
      );
    });
    await waitForEditorIdle();

    const page = host.querySelector('[data-testid="a4-page-content-1"]')!;
    const numberedItem = page.querySelector('ol > li')!;
    const numberedContent = page.querySelector('ol > li > p')!;
    expect(getComputedStyle(numberedItem).position).toBe('relative');
    const paddingPx = Number.parseFloat(
      getComputedStyle(numberedItem).paddingLeft,
    );
    expect(paddingPx).toBeGreaterThan(10);
    const numberedRect = numberedItem.getBoundingClientRect();
    const numberedContentRect = numberedContent.getBoundingClientRect();
    expect(numberedContentRect.top - numberedRect.top).toBeLessThan(
      numberedRect.height / 2,
    );
    expect(numberedContentRect.left - numberedRect.left).toBeGreaterThan(
      paddingPx * 0.8,
    );

    const bulletItem = page.querySelector('ul > li')!;
    expect(getComputedStyle(bulletItem).position).toBe('relative');
    const bulletRect = bulletItem.getBoundingClientRect();
    const bulletContentRect = page
      .querySelector('ul > li > p')!
      .getBoundingClientRect();
    expect(bulletContentRect.top - bulletRect.top).toBeLessThan(
      bulletRect.height / 2,
    );
  });

  it('reserves marker space for two-digit sub-item numbers', async () => {
    await act(async () => {
      root.render(
        <A4PageEditor
          value="<ol><li><p>Parent</p><ol><li><p>Sub content</p></li></ol></li></ol>"
        />,
      );
    });
    await waitForEditorIdle();

    const page = host.querySelector('[data-testid="a4-page-content-1"]')!;
    const nestedItem = page.querySelector('ol ol > li')!;
    const nestedContent = page.querySelector('ol ol > li > p')!;
    const paddingPx = Number.parseFloat(
      getComputedStyle(nestedItem).paddingLeft,
    );
    expect(paddingPx).toBeGreaterThan(40);
    const itemRect = nestedItem.getBoundingClientRect();
    const contentRect = nestedContent.getBoundingClientRect();
    expect(contentRect.left - itemRect.left).toBeGreaterThan(
      paddingPx * 0.8,
    );
  });

  it('keeps wrapped list content aligned under the marker text', async () => {
    await act(async () => {
      root.render(
        <A4PageEditor
          value={`<ol><li><p>${Array.from(
            { length: 12 },
            () => 'long wrapping sentence content',
          ).join(' ')}</p></li></ol>`}
        />,
      );
    });
    await waitForEditorIdle();

    const page = host.querySelector('[data-testid="a4-page-content-1"]')!;
    const item = page.querySelector('ol > li')!;
    const paragraph = page.querySelector('ol > li > p')!;
    const itemRect = item.getBoundingClientRect();
    const paragraphRect = paragraph.getBoundingClientRect();
    expect(paragraphRect.top - itemRect.top).toBeLessThan(
      itemRect.height / 2,
    );
    const paddingPx = Number.parseFloat(getComputedStyle(item).paddingLeft);
    expect(paddingPx).toBeGreaterThan(10);
    expect(paragraphRect.left - itemRect.left).toBeGreaterThan(
      paddingPx * 0.8,
    );
  });

  it('keeps committed pages mounted while Enter repaginates', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const paragraphs = Array.from(
      { length: 90 },
      (_, index) =>
        `<p>Line ${index + 1}: atomic pagination content with enough words to fill several pages.</p>`,
    ).join('');

    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={paragraphs} />);
    });
    await waitForEditorIdle();

    const committedPages = Array.from(
      host.querySelectorAll<HTMLElement>('[data-page-id].relative.group'),
    );
    expect(committedPages.length).toBeGreaterThan(1);
    const committedPageIds = committedPages.map(
      (pageElement) => pageElement.dataset.pageId,
    );
    const firstPageContent = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const targetParagraph = Array.from(
      firstPageContent.querySelectorAll('p'),
    ).at(-1)!;
    const targetText = targetParagraph.firstChild!;
    const splitOffset = Math.floor((targetText.textContent?.length ?? 0) / 2);
    const expectedBefore = targetText.textContent!.slice(0, splitOffset);
    const expectedAfter = targetText.textContent!.slice(splitOffset);
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;

    await act(async () => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(targetText, splitOffset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    const queuedFrames: FrameRequestCallback[] = [];
    let nextFrameId = 1;
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        queuedFrames.push(callback);
        return nextFrameId++;
      });

    const releaseQueuedFrames = async () => {
      while (queuedFrames.length > 0) {
        const callback = queuedFrames.shift()!;
        await act(async () => callback(performance.now()));
      }
    };

    try {
      await act(async () => {
        surface.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertParagraph',
          }),
        );
      });

      const pagesDuringReflow = Array.from(
        host.querySelectorAll<HTMLElement>('[data-page-id].relative.group'),
      );
      expect(surface).toHaveAttribute('aria-busy', 'true');
      expect(pagesDuringReflow).toHaveLength(committedPages.length);
      pagesDuringReflow.forEach((pageElement, index) => {
        expect(pageElement).toBe(committedPages[index]);
      });

      await releaseQueuedFrames();
    } finally {
      await releaseQueuedFrames();
      animationFrameSpy.mockRestore();
    }

    const repaginatedPages = Array.from(
      host.querySelectorAll<HTMLElement>('[data-page-id].relative.group'),
    );
    expect(surface).toHaveAttribute('aria-busy', 'false');
    repaginatedPages
      .slice(0, Math.min(committedPages.length, repaginatedPages.length))
      .forEach((pageElement, index) => {
        expect(pageElement.dataset.pageId).toBe(committedPageIds[index]);
        expect(pageElement).toBe(committedPages[index]);
      });

    const canonical = new DOMParser().parseFromString(
      editorRef.current?.getContent() ?? '',
      'text/html',
    );
    expect(
      Array.from(canonical.body.querySelectorAll('p'), (paragraph) =>
        paragraph.textContent,
      ),
    ).toEqual(expect.arrayContaining([expectedBefore, expectedAfter]));
    expect(selectedParagraphText()).toBe(expectedAfter);
    expect(window.getSelection()?.anchorOffset).toBe(0);
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

  it('follows the caret to the next page when Enter fills page 1, without making pages scrollable', async () => {
    host.style.height = '700px';
    const editorRef = createRef<A4PageEditorRef>();
    const paragraphs = Array.from(
      { length: 90 },
      (_, index) => `<p>Line ${index + 1}: fill page content marker.</p>`,
    ).join('');
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={paragraphs} />);
    });
    await waitForEditorIdle();

    const firstPage = host.querySelector<HTMLElement>(
      '[data-testid="a4-page-content-1"]',
    )!;
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const scrollContainer = surface.parentElement!.parentElement!;
    scrollContainer.parentElement!.style.height = '700px';
    scrollContainer.style.height = '600px';
    scrollContainer.style.overflow = 'auto';
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const lastParagraph = Array.from(firstPage.querySelectorAll('p')).at(-1)!;
    const text = lastParagraph.firstChild!;
    await act(async () => {
      surface.focus();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const range = document.createRange();
    range.setStart(text, text.textContent!.length);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    scrollContainer.scrollTop = 200;
    const previousScrollTop = scrollContainer.scrollTop;

    await pressEnter();
    await waitForEditorIdle();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await waitForEditorIdle();

    expect(selectedParagraphText()).toBe('');
    expect(scrollContainer.scrollTop).toBeGreaterThan(previousScrollTop);
    // A4 pages themselves stay fixed boxes; only the editor viewport scrolls.
    expect(getComputedStyle(firstPage).overflowY).toBe('hidden');
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
      Array.from(body.querySelectorAll<HTMLElement>('ul > li')).every(
        (listItem) => listItem.style.marginLeft === '2em',
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
      Array.from(body.querySelectorAll<HTMLElement>('ul > li')).every(
        (listItem) => listItem.style.marginLeft === '4em',
      ),
    ).toBe(true);

    await act(async () => {
      selectBoth();
    });
    await act(async () => {
      await userEvent.click(buttonByLabel('Decrease indent'));
    });
    await waitForEditorIdle();
    body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(
      Array.from(body.querySelectorAll<HTMLElement>('ul > li')).every(
        (listItem) => listItem.style.marginLeft === '2em',
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
