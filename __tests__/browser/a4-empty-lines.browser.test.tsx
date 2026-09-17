import { act, createRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { A4PageEditor, type A4PageEditorRef } from '@/components/documents/a4-page-editor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('A4 empty-line editing regressions', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.height = '1000px';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function idle() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      if (host.querySelector('[data-testid="a4-document-surface"]')?.getAttribute('aria-busy') === 'false') return;
    }
    throw new Error('Editor did not become idle');
  }

  async function render(value: string) {
    const ref = createRef<A4PageEditorRef>();
    await act(async () => root.render(<A4PageEditor ref={ref} value={value} />));
    await idle();
    await act(async () => host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!.focus());
    return ref;
  }

  function caret(element: Element, atEnd = false) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(!atEnd);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }

  function content(ref: React.RefObject<A4PageEditorRef | null>) {
    return new DOMParser().parseFromString(ref.current!.getContent(), 'text/html').body;
  }

  it('keeps soft page two mounted and the caret there during controlled typing', async () => {
    const initial = '<p>First page</p>' + '<p><br></p>'.repeat(65) + '<p>Later page</p>';
    const ref = createRef<A4PageEditorRef>();
    function ControlledEditor() {
      const [value, setValue] = useState(initial);
      return <A4PageEditor ref={ref} value={value} onChange={setValue} />;
    }
    await act(async () => root.render(<ControlledEditor />));
    await idle();
    const pages = host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]');
    expect(pages.length).toBeGreaterThan(1);
    const lastPage = pages[pages.length - 1];
    await act(async () => host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!.focus());
    caret(lastPage.querySelector('p:last-child')!, true);
    let removedPage = false;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node === lastPage || node.contains(lastPage)) removedPage = true;
        }
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    try {
      for (const character of 'abc') {
        await act(async () => userEvent.keyboard(character));
        await idle();
        expect(lastPage.isConnected).toBe(true);
        expect(lastPage.contains(window.getSelection()!.anchorNode)).toBe(true);
      }
      expect(removedPage).toBe(false);
      expect(content(ref).textContent).toContain('Later pageabc');
    } finally {
      observer.disconnect();
    }
  });

  it('restores the later-page Enter caret before observers can see the page-start fallback', async () => {
    const ref = await render('<p>First</p>' + '<p><br></p>'.repeat(65) + '<p>Later</p>');
    const pages = host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]');
    const lastPage = pages[pages.length - 1];
    expect(pages.length).toBeGreaterThan(1);
    caret(lastPage.querySelector('p:last-child')!, true);
    const invalidAnchors: Node[] = [];
    let observedUpdates = 0;
    const observer = new MutationObserver((records) => {
      if (!records.some((record) => record.type === 'childList' && lastPage.contains(record.target))) return;
      observedUpdates += 1;
      const anchor = window.getSelection()?.anchorNode;
      if (anchor && (anchor === lastPage || !lastPage.contains(anchor))) invalidAnchors.push(anchor);
    });
    observer.observe(host, { childList: true, subtree: true });
    try {
      for (let index = 0; index < 3; index += 1) {
        await act(async () => userEvent.keyboard('{Enter}'));
        await idle();
      }
      expect(observedUpdates).toBeGreaterThan(0);
      expect(invalidAnchors).toHaveLength(0);
      expect(content(ref).querySelectorAll('p')).toHaveLength(70);
    } finally {
      observer.disconnect();
    }
  });

  it('keeps later-page list typing, Enter and Backspace on the intended item', async () => {
    const initial = '<div data-flow-keep-together="true"><p>Signature</p>' + '<p><br></p>'.repeat(100) + '<p><br></p></div>';
    const ref = createRef<A4PageEditorRef>();
    function ControlledEditor() {
      const [value, setValue] = useState(initial);
      return <A4PageEditor ref={ref} value={value} onChange={setValue} />;
    }
    await act(async () => root.render(<ControlledEditor />));
    await idle();
    await act(async () => host.querySelector<HTMLElement>('[data-testid="a4-document-surface"]')!.focus());
    const visibleParagraphs = host.querySelectorAll('[data-testid^="a4-page-content-"] p');
    caret(visibleParagraphs[visibleParagraphs.length - 1]);
    await act(async () => userEvent.click(host.querySelector<HTMLElement>('[aria-label="Numbered list"]')!));
    await idle();
    expect(host.querySelector('[data-testid^="a4-page-content-"] li')?.contains(window.getSelection()!.anchorNode)).toBe(true);
    await act(async () => userEvent.keyboard('Testing'));
    await act(async () => userEvent.keyboard('{Enter}Second'));
    await idle();
    expect(Array.from(content(ref).querySelectorAll('li'), (item) => item.textContent)).toEqual(['Testing', 'Second']);
    await act(async () => userEvent.keyboard('{Backspace}'.repeat(6) + '{Backspace}{Enter}Third'));
    await idle();
    expect(Array.from(content(ref).querySelectorAll('li'), (item) => item.textContent)).toEqual(['Testing', 'Third']);
    expect(window.getSelection()?.anchorNode?.textContent).toBe('Third');
  });

  it('Backspace removes the empty paragraph before the caret, not a closing field brace', async () => {
    const ref = await render('<p>{{/each}}</p><p><br></p><p><br></p>');
    caret(host.querySelectorAll('[data-testid^="a4-page-content-"] p')[2]);
    await act(async () => userEvent.keyboard('{Backspace}'));
    await idle();
    expect(content(ref).textContent).toBe('{{/each}}');
    expect(content(ref).querySelectorAll('p')).toHaveLength(2);
  });

  it.each(['<ol><li>First</li><li><br></li></ol>', '<ol><li><p>First</p></li><li><p><br></p></li></ol>'])(
    'removes the empty list item and its number on Backspace: %s', async (markup) => {
      const ref = await render(markup);
      const item = host.querySelectorAll('[data-testid^="a4-page-content-"] li')[1];
      caret(item.querySelector('p') ?? item);
      await act(async () => userEvent.keyboard('{Backspace}X'));
      await idle();
      expect(content(ref).querySelectorAll('li')).toHaveLength(1);
      expect(content(ref).textContent).toBe('FirstX');
    },
  );

  it('removes the first list number with Backspace and restores it with undo', async () => {
    const ref = await render('<ol><li><p><br></p></li></ol>');
    caret(host.querySelector('[data-testid^="a4-page-content-"] li p')!);
    await act(async () => userEvent.keyboard('{Backspace}'));
    await idle();
    expect(content(ref).querySelector('li')).toBeNull();
    await act(async () => userEvent.keyboard('{Control>}z{/Control}'));
    await idle();
    expect(content(ref).querySelectorAll('li')).toHaveLength(1);
  });

  it('Delete at the top removes an empty paragraph, not the following company field', async () => {
    const ref = await render('<p><br></p><p><br></p><p>{{company.name}}</p>');
    caret(host.querySelector('[data-testid^="a4-page-content-"] p')!);
    await act(async () => userEvent.keyboard('{Delete}'));
    await idle();
    expect(content(ref).textContent).toBe('{{company.name}}');
    expect(content(ref).querySelectorAll('p')).toHaveLength(2);
  });

  it('removes only the adjacent line break among consecutive breaks in one paragraph', async () => {
    const ref = await render('<p>{{/each}}<br><br><br></p>');
    const paragraph = host.querySelector('[data-testid^="a4-page-content-"] p')!;
    const range = document.createRange();
    range.setStart(paragraph, 3);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () => userEvent.keyboard('{Backspace}X'));
    await idle();
    expect(content(ref).innerHTML).toBe('<p>{{/each}}<br>X<br></p>');
  });

  it('splits trailing empty lines instead of moving or splitting the preceding signature text', async () => {
    await render('<p style="height:600px">BEFORE</p><p>________________<br>{{this.name}}<br>{{/each}}' + '<br>'.repeat(45) + '</p>');
    const pages = host.querySelectorAll('[data-testid^="a4-page-content-"]');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].textContent).toContain('{{this.name}}');
    expect(pages[0].textContent).toContain('{{/each}}');
    expect(pages[1].textContent).toBe('');
  });

  it('flows excess blank lines out of a keep-together signature without an oversized page', async () => {
    const markup = '<div data-flow-keep-together="true"><p>________________</p><p>{{this.name}}</p><p>{{/each}}</p>' + '<p><br></p>'.repeat(100) + '</div>';
    const ref = await render(markup);
    const pages = host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]');
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0].textContent).toContain('{{this.name}}');
    expect(pages[0].textContent).toContain('{{/each}}');
    expect(host.textContent).not.toContain('This block is taller');
    for (const page of pages) expect(page.scrollHeight).toBeLessThanOrEqual(page.clientHeight + 1);
    expect(content(ref).querySelectorAll('p')).toHaveLength(103);
    const lastPage = pages[pages.length - 1];
    caret(lastPage.querySelector('p:last-child')!, true);
    await act(async () => userEvent.keyboard('Typed on the last page'));
    await idle();
    const updatedPages = host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]');
    expect(updatedPages.length).toBe(pages.length);
    expect(host.textContent).not.toContain('This block is taller');
    expect(updatedPages[updatedPages.length - 1].textContent).toContain('Typed on the last page');
    expect(updatedPages[updatedPages.length - 1].contains(window.getSelection()!.anchorNode)).toBe(true);
    for (const page of updatedPages) expect(page.scrollHeight).toBeLessThanOrEqual(page.clientHeight + 1);
  });

  it('deletes a leading inline blank line and supports undo without damaging the company field', async () => {
    const ref = await render('<p><br><br>{{company.name}}</p>');
    caret(host.querySelector('[data-testid^="a4-page-content-"] p')!);
    await act(async () => userEvent.keyboard('{Delete}'));
    await idle();
    expect(content(ref).innerHTML).toBe('<p><br>{{company.name}}</p>');
    await act(async () => userEvent.keyboard('{Control>}z{/Control}'));
    await idle();
    expect(content(ref).innerHTML).toBe('<p><br><br>{{company.name}}</p>');
  });

  it('keeps repeated empty paragraphs and the caret at the end across pages', async () => {
    const ref = await render('<p><br></p>');
    caret(host.querySelector('[data-testid^="a4-page-content-"] p')!);
    await act(async () => userEvent.keyboard('{Enter}'.repeat(65) + 'END'));
    await idle();
    expect(content(ref).querySelectorAll('p')).toHaveLength(66);
    expect(content(ref).lastElementChild?.textContent).toBe('END');
    expect(host.querySelectorAll('[data-testid^="a4-page-content-"]').length).toBeGreaterThan(1);
    expect(window.getSelection()?.anchorNode?.textContent).toBe('END');
  }, 30000);

  it('leaves a wrapped signature on page one while trailing blank paragraphs flow to page two', async () => {
    const ref = await render('<div><p>________________</p><p>{{this.name}}</p><p>{{/each}}</p><p><br></p></div>');
    caret(host.querySelectorAll('[data-testid^="a4-page-content-"] p')[3]);
    await act(async () => userEvent.keyboard('{Enter}'.repeat(65) + 'END'));
    await idle();
    const pages = host.querySelectorAll('[data-testid^="a4-page-content-"]');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].textContent).toContain('{{this.name}}');
    expect(pages[0].textContent).toContain('{{/each}}');
    expect(pages[pages.length - 1].textContent).toContain('END');
    expect(content(ref).querySelectorAll('p')).toHaveLength(69);
  }, 30000);
});
