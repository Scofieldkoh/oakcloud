import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';

function boundaryListFixture() {
  return (
    '<ol>' +
    Array.from(
      { length: 30 },
      (_, index) =>
        `<li><p>Item ${index + 1} ${'Boundary review text '.repeat(10)}</p></li>`,
    ).join('') +
    '</ol>'
  );
}

function textNodeFor(element: Element): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  if (!(node instanceof Text)) throw new Error('Expected a text node');
  return node;
}

function setCollapsedCaret(element: Element, offset: number) {
  const node = textNodeFor(element);
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.data.length));
  range.collapse(true);
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectAcrossElements(
  startElement: Element,
  startOffset: number,
  endElement: Element,
  endOffset: number,
) {
  const start = textNodeFor(startElement);
  const end = textNodeFor(endElement);
  const range = document.createRange();
  range.setStart(start, Math.min(startOffset, start.data.length));
  range.setEnd(end, Math.min(endOffset, end.data.length));
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.removeAllRanges();
  selection.addRange(range);
}

function canonicalText(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

function canonicalListItemCount(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').querySelectorAll('li').length;
}

describe('A4PageEditor C0 native sequence regressions', () => {
  let host: HTMLDivElement;
  let root: Root;

  const waitForEditorIdle = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await act(async () => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      const surface = host.querySelector<HTMLElement>(
        '[data-testid="a4-document-surface"]',
      );
      if (surface?.getAttribute('aria-busy') === 'false') return surface;
    }
    throw new Error('A4 editor never reached the final idle state');
  };

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

  it('preserves every later-page item when Enter is followed immediately by typing', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    let parentValue = boundaryListFixture();

    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={parentValue}
          onChange={(html) => {
            parentValue = html;
          }}
        />,
      );
    });
    const surface = await waitForEditorIdle();
    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);

    const secondPageFirstParagraph = pageContents[1].querySelector('p');
    if (!secondPageFirstParagraph) throw new Error('Expected content on page 2');
    const label = secondPageFirstParagraph.textContent?.match(/^Item \d+ /)?.[0] ?? '';
    expect(label).not.toBe('');

    surface.focus();
    setCollapsedCaret(secondPageFirstParagraph, label.length);

    // Deliberately one native sequence: no act/reflow/layout wait between Enter and NEW.
    await act(async () => {
      await userEvent.keyboard('{Enter}NEW');
    });
    await waitForEditorIdle();

    const canonical = editorRef.current?.getContent() ?? '';
    const text = canonicalText(canonical);
    for (let index = 1; index <= 30; index += 1) {
      expect(text).toContain(`Item ${index} `);
    }
    expect(text).toContain('NEW');
    expect(canonicalListItemCount(canonical)).toBe(31);
    expect(parentValue).toBe(canonical);
  });

  it('replaces a selection spanning visual pages when Enter is pressed', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const value = boundaryListFixture();

    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={value} />);
    });
    const surface = await waitForEditorIdle();
    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);

    const firstPageParagraphs = pageContents[0].querySelectorAll('p');
    const secondPageFirstParagraph = pageContents[1].querySelector('p');
    const firstPageLastParagraph = firstPageParagraphs[firstPageParagraphs.length - 1];
    if (!firstPageLastParagraph || !secondPageFirstParagraph) {
      throw new Error('Expected paragraphs on both sides of a page boundary');
    }

    const startLength = firstPageLastParagraph.textContent?.length ?? 0;
    selectAcrossElements(
      firstPageLastParagraph,
      Math.max(0, startLength - 10),
      secondPageFirstParagraph,
      Math.min(8, secondPageFirstParagraph.textContent?.length ?? 0),
    );
    surface.focus();
    const before = editorRef.current?.getContent() ?? '';

    await act(async () => {
      await userEvent.keyboard('{Enter}');
    });
    await waitForEditorIdle();

    const after = editorRef.current?.getContent() ?? '';
    expect(after).not.toBe(before);
    expect(window.getSelection()?.isCollapsed).toBe(true);
    expect(canonicalText(after)).toContain('Item 30 ');
  });

  it('does not carry undo history from document A into document B', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    let parentValue = '<p>Document A</p>';
    const onChange = (html: string) => {
      parentValue = html;
    };

    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          sessionKey="document:A"
          value={parentValue}
          onChange={onChange}
        />,
      );
    });
    let surface = await waitForEditorIdle();
    const paragraphA = host.querySelector('[data-testid="a4-page-content-1"] p');
    if (!paragraphA) throw new Error('Expected document A paragraph');
    surface.focus();
    setCollapsedCaret(paragraphA, paragraphA.textContent?.length ?? 0);
    await act(async () => {
      await userEvent.keyboard('!');
    });
    await waitForEditorIdle();
    expect(canonicalText(editorRef.current?.getContent() ?? '')).toContain('Document A!');

    parentValue = '<p>Document B</p>';
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          sessionKey="document:B"
          value={parentValue}
          onChange={onChange}
        />,
      );
    });
    surface = await waitForEditorIdle();
    surface.focus();
    expect(canonicalText(editorRef.current?.getContent() ?? '')).toContain('Document B');

    await act(async () => {
      await userEvent.keyboard('{Control>}z{/Control}');
    });
    await waitForEditorIdle();

    const afterUndo = editorRef.current?.getContent() ?? '';
    expect(canonicalText(afterUndo)).toContain('Document B');
    expect(canonicalText(afterUndo)).not.toContain('Document A');
  });

  it('inserts and removes a semantic page break inside a later-page list item', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={boundaryListFixture()} />);
    });
    const surface = await waitForEditorIdle();
    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);
    const paragraph = pageContents[1].querySelector('p');
    if (!paragraph) throw new Error('Expected page-2 list content');
    const label = paragraph.textContent?.match(/^Item \d+ /)?.[0] ?? '';
    surface.focus();
    setCollapsedCaret(paragraph, label.length);

    const insertBreak = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Insert page break"]',
    );
    if (!insertBreak) throw new Error('Expected page-break toolbar command');
    await act(async () => {
      await userEvent.click(insertBreak);
    });
    await waitForEditorIdle();

    const withBreak = editorRef.current?.getContent() ?? '';
    const withBreakRoot = new DOMParser().parseFromString(withBreak, 'text/html');
    expect(withBreakRoot.querySelectorAll('span[data-a4-break="page"]')).toHaveLength(1);
    expect(withBreakRoot.querySelectorAll('li')).toHaveLength(30);
    for (let index = 1; index <= 30; index += 1) {
      expect(withBreakRoot.body.textContent ?? '').toContain(`Item ${index} `);
    }

    surface.focus();
    await act(async () => {
      await userEvent.keyboard('{Backspace}');
    });
    await waitForEditorIdle();

    const withoutBreak = editorRef.current?.getContent() ?? '';
    const withoutBreakRoot = new DOMParser().parseFromString(withoutBreak, 'text/html');
    expect(withoutBreakRoot.querySelectorAll('span[data-a4-break="page"]')).toHaveLength(0);
    expect(withoutBreakRoot.querySelectorAll('li')).toHaveLength(30);
    for (let index = 1; index <= 30; index += 1) {
      expect(withoutBreakRoot.body.textContent ?? '').toContain(`Item ${index} `);
    }
  });

  it('replaces a native cross-page selection with one semantic line break', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={boundaryListFixture()} />);
    });
    const surface = await waitForEditorIdle();
    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);
    const firstPageParagraphs = pageContents[0].querySelectorAll('p');
    const secondPageFirstParagraph = pageContents[1].querySelector('p');
    const firstPageLastParagraph = firstPageParagraphs[firstPageParagraphs.length - 1];
    if (!firstPageLastParagraph || !secondPageFirstParagraph) {
      throw new Error('Expected paragraphs on both sides of a page boundary');
    }
    selectAcrossElements(
      firstPageLastParagraph,
      Math.max(0, (firstPageLastParagraph.textContent?.length ?? 0) - 6),
      secondPageFirstParagraph,
      Math.min(6, secondPageFirstParagraph.textContent?.length ?? 0),
    );
    surface.focus();
    const before = editorRef.current?.getContent() ?? '';

    await act(async () => {
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    });
    await waitForEditorIdle();

    const after = editorRef.current?.getContent() ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain('<br');
    expect(canonicalText(after)).toContain('Item 30 ');
    expect(window.getSelection()?.isCollapsed).toBe(true);
  });


  it('uses S2 semantic list indentation for native Tab and Shift+Tab', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          value={'<ol><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ol>'}
        />,
      );
    });
    const surface = await waitForEditorIdle();
    const second = surface.querySelectorAll('ol > li > p')[1] as HTMLElement | undefined;
    if (!second) throw new Error('Expected second list item');
    surface.focus();
    setCollapsedCaret(second, 1);

    await act(async () => {
      await userEvent.keyboard('{Tab}');
    });
    await waitForEditorIdle();
    let canonical = editorRef.current?.getContent() ?? '';
    let doc = new DOMParser().parseFromString(canonical, 'text/html');
    expect(doc.querySelectorAll('ol > li:first-child > ol > li')).toHaveLength(1);
    expect(doc.body.textContent).toContain('OneTwoThree');

    const nested = surface.querySelector('ol > li:first-child > ol > li > p') as HTMLElement | null;
    if (!nested) throw new Error('Expected nested list item after Tab');
    surface.focus();
    setCollapsedCaret(nested, 1);
    await act(async () => {
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    });
    await waitForEditorIdle();
    canonical = editorRef.current?.getContent() ?? '';
    doc = new DOMParser().parseFromString(canonical, 'text/html');
    expect(doc.querySelectorAll(':scope > body > ol > li')).toHaveLength(3);
    expect(doc.body.textContent).toContain('OneTwoThree');
  });

});
