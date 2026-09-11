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
});
