import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setCaretInsideEmptyElement(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(true);
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('A4 editor Q1-08 empty nested-list caret acceptance', () => {
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

  beforeEach(() => {
    host = document.createElement('div');
    host.style.height = '1200px';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('lifts an empty nested list item when Enter is pressed from a caret in <p><br /></p>', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(
        <A4PageEditor
          ref={editorRef}
          sessionKey="q1-08-empty-nested-list"
          value="<ol><li><p>Parent</p><ol><li><p><br /></p></li></ol></li></ol>"
        />,
      );
    });

    const surface = await waitForEditorIdle();
    const nestedEmpty = host.querySelector('ol ol li p');
    if (!nestedEmpty) throw new Error('Expected empty nested list paragraph');
    expect(nestedEmpty.textContent).toBe('');

    surface.focus();
    setCaretInsideEmptyElement(nestedEmpty);
    await act(async () => userEvent.keyboard('{Enter}LIFTED'));
    await waitForEditorIdle();

    const canonical = editorRef.current?.getContent() ?? '';
    const doc = new DOMParser().parseFromString(canonical, 'text/html');
    const topItems = Array.from(doc.body.querySelectorAll(':scope > ol > li'));

    expect(topItems).toHaveLength(2);
    expect(topItems[0].textContent).toContain('Parent');
    expect(topItems[1].textContent).toContain('LIFTED');
    expect(doc.body.textContent).toContain('Parent');
  });
});
