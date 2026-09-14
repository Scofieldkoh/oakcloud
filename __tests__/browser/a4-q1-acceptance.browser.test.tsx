import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function boundaryListFixture() {
  return (
    '<ol>' +
    Array.from(
      { length: 30 },
      (_, index) =>
        `<li><p>Item ${index + 1} ${'Q1 boundary review text '.repeat(10)}</p></li>`,
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
  reverse = false,
) {
  const start = textNodeFor(startElement);
  const end = textNodeFor(endElement);
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.removeAllRanges();
  if (reverse) {
    selection.setBaseAndExtent(
      end,
      Math.min(endOffset, end.data.length),
      start,
      Math.min(startOffset, start.data.length),
    );
    return;
  }
  const range = document.createRange();
  range.setStart(start, Math.min(startOffset, start.data.length));
  range.setEnd(end, Math.min(endOffset, end.data.length));
  selection.addRange(range);
}

function canonicalText(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

function listItemCount(html: string) {
  return new DOMParser().parseFromString(html, 'text/html').querySelectorAll('li').length;
}

function listDepthForLabel(html: string, label: string) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const paragraph = Array.from(body.querySelectorAll('p')).find((candidate) =>
    (candidate.textContent ?? '').startsWith(label),
  );
  if (!paragraph) throw new Error(`Missing paragraph for ${label}`);
  let depth = 0;
  let cursor: Element | null = paragraph;
  while (cursor && cursor !== body) {
    if (cursor.tagName === 'OL' || cursor.tagName === 'UL') depth += 1;
    cursor = cursor.parentElement;
  }
  return depth;
}

describe('A4 editor G2/Q1 independent browser acceptance', () => {
  let host: HTMLDivElement;
  let root: Root;

  const waitForEditorIdle = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
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

  const boundary = () => {
    const pages = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pages.length).toBeGreaterThan(1);
    const firstPageParagraphs = pages[0].querySelectorAll('p');
    const start = firstPageParagraphs[firstPageParagraphs.length - 1];
    const end = pages[1].querySelector('p');
    if (!start || !end) throw new Error('Expected content around a page boundary');
    const startLabel = start.textContent?.match(/^Item \d+ /)?.[0] ?? '';
    const endLabel = end.textContent?.match(/^Item \d+ /)?.[0] ?? '';
    if (!startLabel || !endLabel) throw new Error('Expected numbered boundary labels');
    return { pages, start, end, startLabel, endLabel };
  };

  beforeEach(() => {
    host = document.createElement('div');
    host.style.height = '1600px';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('Q1-02 preserves the immediate Enter/type sequence after each prior boundary mutation', async () => {
    const operations = ['backspace', 'delete', 'bold', 'paste', 'field', 'break-remove'] as const;

    for (const operation of operations) {
      const editorRef = createRef<A4PageEditorRef>();
      await act(async () => {
        root.render(
          <A4PageEditor
            key={`q1-op-${operation}`}
            ref={editorRef}
            sessionKey={`q1-op-${operation}`}
            value={boundaryListFixture()}
          />,
        );
      });
      let surface = await waitForEditorIdle();
      let { end, endLabel } = boundary();
      surface.focus();

      if (operation === 'backspace') {
        setCollapsedCaret(end, Math.min(endLabel.length + 2, end.textContent?.length ?? 0));
        await act(async () => userEvent.keyboard('{Backspace}'));
      } else if (operation === 'delete') {
        setCollapsedCaret(end, Math.min(endLabel.length + 2, end.textContent?.length ?? 0));
        await act(async () => userEvent.keyboard('{Delete}'));
      } else if (operation === 'bold') {
        setCollapsedCaret(end, endLabel.length);
        const bold = host.querySelector<HTMLButtonElement>('button[aria-label="Bold"]');
        if (!bold) throw new Error('Expected Bold toolbar control');
        await act(async () => userEvent.click(bold));
      } else if (operation === 'paste') {
        setCollapsedCaret(end, endLabel.length);
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/plain', 'Q1PASTE');
        await act(async () => {
          surface.dispatchEvent(
            new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true,
              clipboardData,
            }),
          );
        });
      } else if (operation === 'field') {
        setCollapsedCaret(end, endLabel.length);
        editorRef.current?.insertAtCursor('{{custom.q1_boundary_field}}');
      } else {
        setCollapsedCaret(end, endLabel.length);
        const insertBreak = host.querySelector<HTMLButtonElement>(
          'button[aria-label="Insert page break"]',
        );
        if (!insertBreak) throw new Error('Expected Insert page break control');
        await act(async () => userEvent.click(insertBreak));
        await waitForEditorIdle();
        surface = host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!;
        surface.focus();
        await act(async () => userEvent.keyboard('{Backspace}'));
      }

      await waitForEditorIdle();
      surface = host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!;
      ({ end, endLabel } = boundary());
      surface.focus();
      setCollapsedCaret(end, endLabel.length);

      // One native sequence. There is deliberately no reflow/layout wait between Enter and Q1NEW.
      await act(async () => userEvent.keyboard(`{Enter}Q1NEW-${operation}`));
      await waitForEditorIdle();

      const canonical = editorRef.current?.getContent() ?? '';
      const text = canonicalText(canonical);
      for (let index = 1; index <= 30; index += 1) {
        expect(text).toContain(`Item ${index} `);
      }
      expect(text).toContain(`Q1NEW-${operation}`);
      expect(listItemCount(canonical)).toBe(31);
    }
  });

  it('Q1-03 handles forward and reverse cross-page Enter and Shift+Enter selections', async () => {
    const cases = [
      { reverse: false, lineBreak: false },
      { reverse: true, lineBreak: false },
      { reverse: false, lineBreak: true },
      { reverse: true, lineBreak: true },
    ];

    for (const [index, testCase] of cases.entries()) {
      const editorRef = createRef<A4PageEditorRef>();
      await act(async () => {
        root.render(
          <A4PageEditor
            key={`q1-selection-${index}`}
            ref={editorRef}
            sessionKey={`q1-selection-${index}`}
            value={boundaryListFixture()}
          />,
        );
      });
      const surface = await waitForEditorIdle();
      const { start, end } = boundary();
      const startLength = start.textContent?.length ?? 0;
      selectAcrossElements(
        start,
        Math.max(0, startLength - 8),
        end,
        Math.min(8, end.textContent?.length ?? 0),
        testCase.reverse,
      );
      surface.focus();
      const before = editorRef.current?.getContent() ?? '';

      await act(async () => {
        await userEvent.keyboard(
          testCase.lineBreak ? '{Shift>}{Enter}{/Shift}' : '{Enter}',
        );
      });
      await waitForEditorIdle();

      const after = editorRef.current?.getContent() ?? '';
      expect(after).not.toBe(before);
      expect(canonicalText(after)).toContain('Item 30 ');
      expect(window.getSelection()?.isCollapsed).toBe(true);
      if (testCase.lineBreak) expect(after).toContain('<br');
    }
  });

  it('Q1-05 inserts a hard break at the selected logical cross-page position', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          sessionKey="q1-break-selection"
          value={boundaryListFixture()}
        />,
      );
    });
    const surface = await waitForEditorIdle();
    const { start, end, startLabel, endLabel } = boundary();
    const startLength = start.textContent?.length ?? 0;
    selectAcrossElements(
      start,
      Math.max(startLabel.length, startLength - 8),
      end,
      Math.min(endLabel.length + 2, end.textContent?.length ?? 0),
    );
    surface.focus();

    const insertBreak = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Insert page break"]',
    );
    if (!insertBreak) throw new Error('Expected Insert page break control');
    await act(async () => userEvent.click(insertBreak));
    await waitForEditorIdle();

    const canonical = editorRef.current?.getContent() ?? '';
    const doc = new DOMParser().parseFromString(canonical, 'text/html');
    const breaks = doc.querySelectorAll('span[data-a4-break="page"]');
    expect(breaks).toHaveLength(1);
    expect(canonicalText(canonical)).toContain('Item 30 ');
    const breakIndex = canonical.indexOf('data-a4-break="page"');
    const finalItemIndex = canonical.indexOf('Item 30 ');
    expect(breakIndex).toBeGreaterThanOrEqual(0);
    expect(finalItemIndex).toBeGreaterThan(breakIndex);
  });

  it('Q1-07 makes native Tab and toolbar Increase indent equivalent across the page boundary', async () => {
    const run = async (mode: 'keyboard' | 'toolbar') => {
      const editorRef = createRef<A4PageEditorRef>();
      await act(async () => {
        root.render(
          <A4PageEditor
            key={`q1-indent-${mode}`}
            ref={editorRef}
            sessionKey={`q1-indent-${mode}`}
            value={boundaryListFixture()}
          />,
        );
      });
      const surface = await waitForEditorIdle();
      const { start, end, startLabel, endLabel } = boundary();
      selectAcrossElements(
        start,
        0,
        end,
        end.textContent?.length ?? 0,
      );
      surface.focus();
      if (mode === 'keyboard') {
        await act(async () => userEvent.keyboard('{Tab}'));
      } else {
        const indent = host.querySelector<HTMLButtonElement>(
          'button[aria-label="Increase indent"]',
        );
        if (!indent) throw new Error('Expected Increase indent control');
        await act(async () => userEvent.click(indent));
      }
      await waitForEditorIdle();
      const canonical = editorRef.current?.getContent() ?? '';
      return {
        startLabel,
        endLabel,
        startDepth: listDepthForLabel(canonical, startLabel),
        endDepth: listDepthForLabel(canonical, endLabel),
        text: canonicalText(canonical),
      };
    };

    const keyboard = await run('keyboard');
    const toolbar = await run('toolbar');
    expect(keyboard.startDepth).toBeGreaterThan(1);
    expect(keyboard.endDepth).toBe(keyboard.startDepth);
    expect(toolbar.startDepth).toBe(keyboard.startDepth);
    expect(toolbar.endDepth).toBe(keyboard.endDepth);
    expect(keyboard.text.indexOf(keyboard.startLabel)).toBeLessThan(
      keyboard.text.indexOf(keyboard.endLabel),
    );
    expect(toolbar.text.indexOf(toolbar.startLabel)).toBeLessThan(
      toolbar.text.indexOf(toolbar.endLabel),
    );
  });

  it('Q1-07/Q1-08 preserves paragraph semantics, exits headings, and lifts an empty nested list item', async () => {
    const editorRef = createRef<A4PageEditorRef>();

    await act(async () => {
      root.render(
        <A4PageEditor
          key="q1-heading"
          ref={editorRef}
          sessionKey="q1-heading"
          value="<h2>Heading title</h2>"
        />,
      );
    });
    let surface = await waitForEditorIdle();
    let heading = host.querySelector('h2');
    if (!heading) throw new Error('Expected heading');
    surface.focus();
    setCollapsedCaret(heading, heading.textContent?.length ?? 0);
    await act(async () => userEvent.keyboard('{Enter}BODY'));
    await waitForEditorIdle();
    let doc = new DOMParser().parseFromString(editorRef.current?.getContent() ?? '', 'text/html');
    expect(doc.querySelector('h2')?.textContent).toBe('Heading title');
    expect(Array.from(doc.body.children).some((element) => element.tagName === 'P' && element.textContent === 'BODY')).toBe(true);

    await act(async () => {
      root.render(
        <A4PageEditor
          key="q1-paragraph-inherit"
          ref={editorRef}
          sessionKey="q1-paragraph-inherit"
          value={'<p style="text-align: center; margin-left: 40px;">Centered source</p>'}
        />,
      );
    });
    surface = await waitForEditorIdle();
    const paragraph = host.querySelector('p');
    if (!paragraph) throw new Error('Expected paragraph');
    surface.focus();
    setCollapsedCaret(paragraph, 8);
    await act(async () => userEvent.keyboard('{Enter}NEXT'));
    await waitForEditorIdle();
    doc = new DOMParser().parseFromString(editorRef.current?.getContent() ?? '', 'text/html');
    const paragraphs = Array.from(doc.body.querySelectorAll('p'));
    expect(paragraphs).toHaveLength(2);
    for (const candidate of paragraphs) {
      expect(candidate.style.textAlign).toBe('center');
      expect(candidate.style.marginLeft).toBe('40px');
    }
    expect(doc.body.textContent).toContain('NEXT');

    await act(async () => {
      root.render(
        <A4PageEditor
          key="q1-nested-exit"
          ref={editorRef}
          sessionKey="q1-nested-exit"
          value="<ol><li><p>Parent</p><ol><li><p><br /></p></li></ol></li></ol>"
        />,
      );
    });
    surface = await waitForEditorIdle();
    const nestedEmpty = host.querySelector('ol ol li p');
    if (!nestedEmpty) throw new Error('Expected empty nested list item');
    surface.focus();
    setCollapsedCaret(nestedEmpty, 0);
    await act(async () => userEvent.keyboard('{Enter}LIFTED'));
    await waitForEditorIdle();
    doc = new DOMParser().parseFromString(editorRef.current?.getContent() ?? '', 'text/html');
    const topItems = Array.from(doc.body.querySelectorAll(':scope > ol > li'));
    expect(topItems).toHaveLength(2);
    expect(topItems[1].textContent).toContain('LIFTED');
  });

  it('Q1-09/Q1-12 pointer blank-page deletion is one action and Undo restores the full state', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          sessionKey="q1-blank-undo"
          value="<p>Q1 blank-page anchor</p>"
        />,
      );
    });
    await waitForEditorIdle();
    const original = editorRef.current?.getContent() ?? '';
    const add = host.querySelector<HTMLButtonElement>('button[aria-label="Add blank page"]');
    if (!add) throw new Error('Expected Add blank page control');
    await act(async () => userEvent.click(add));
    await waitForEditorIdle();
    const withBlankPage = editorRef.current?.getContent() ?? '';
    expect(withBlankPage).not.toBe(original);

    const pages = host.querySelectorAll('[data-testid^="a4-page-content-"]');
    expect(pages.length).toBeGreaterThan(1);
    const lastPage = pages[pages.length - 1] as HTMLElement;
    await act(async () => userEvent.click(lastPage));
    const deletePage = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete current page"]',
    );
    if (!deletePage) throw new Error('Expected Delete current page control');
    expect(deletePage.disabled).toBe(false);
    await act(async () => userEvent.click(deletePage));
    await waitForEditorIdle();
    expect(editorRef.current?.getContent()).toBe(original);

    const undo = host.querySelector<HTMLButtonElement>('button[aria-label="Undo"]');
    if (!undo) throw new Error('Expected Undo control');
    await act(async () => userEvent.click(undo));
    await waitForEditorIdle();
    expect(editorRef.current?.getContent()).toBe(withBlankPage);
  });
});