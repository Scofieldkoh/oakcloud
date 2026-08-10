import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import {
  flushA4Reflow,
  installDeterministicA4Measurement,
} from '../helpers/a4-editor-test-utils';

const pageBreak = '<!-- PAGE_BREAK -->';
const hardPageBreak =
  '<div class="page-break" data-break-type="hard"></div>';

describe('A4PageEditor', () => {
  it('renders persisted document content in read-only mode', async () => {
    render(
      <A4PageEditor
        value="<p>Persisted generated document content</p>"
        readOnly
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent(
        'Persisted generated document content',
      );
    });
  });

  it('applies global typography while preserving explicit partial formatting', () => {
    render(
      <A4PageEditor
        value={'<h1>Inherited heading</h1><p>Inherited partial text</p><p style="font-family: Verdana, Geneva, sans-serif; font-size: 9pt;">Explicit partial text</p>'}
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          fontFamily: 'Georgia, serif',
          fontSize: '14pt',
        }}
      />,
    );

    const page = screen.getByTestId('a4-page-content-1');
    expect(page).toHaveStyle({ fontFamily: 'Georgia, serif', fontSize: '14pt' });
    expect(getComputedStyle(page.querySelector('h1')!).fontFamily).toBe(
      'inherit',
    );
    expect(page.querySelectorAll('p')[0]).not.toHaveAttribute('style');
    expect(page.querySelectorAll('p')[1]).toHaveStyle({
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontSize: '9pt',
    });
  });

  it('styles placeholder text globally while page numbers retain their own size', () => {
    render(
      <A4PageEditor
        value=""
        placeholder="Start writing"
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          fontFamily: 'Georgia, serif',
          fontSize: '14pt',
        }}
      />,
    );

    expect(screen.getByText('Start writing')).toHaveStyle({
      fontFamily: 'Georgia, serif',
      fontSize: '14pt',
    });
    expect(screen.getByTestId('a4-page-number-1')).toHaveStyle({
      fontSize: '10pt',
    });
  });

  it('prints normalized typography without overriding inline partial styles', () => {
    vi.useFakeTimers();
    try {
      render(
        <A4PageEditor
          value={'<p style="font-family: Verdana, Geneva, sans-serif; font-size: 9pt;">Explicit print text</p>'}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            fontFamily: 'Georgia, serif',
            fontSize: '14pt',
          }}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Print' }));
      const printFrame = document.querySelector('iframe')!;
      const printDocument = printFrame.contentDocument!;
      expect(printDocument.querySelector('style')?.textContent).toContain(
        'font-family: Georgia, serif;',
      );
      expect(printDocument.querySelector('style')?.textContent).toContain(
        'font-size: 14pt;',
      );
      expect(printDocument.querySelector('style')?.textContent).toContain(
        'h1, h2, h3 {\n      font-family: inherit;',
      );
      expect(printDocument.querySelector('.content p')).toHaveStyle({
        fontFamily: 'Verdana, Geneva, sans-serif',
        fontSize: '9pt',
      });
      printFrame.remove();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('measures pagination with the normalized document typography', async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    const measuredTypography: Array<{ fontFamily: string; fontSize: string }> = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        if (this.style.position === 'fixed') {
          measuredTypography.push({
            fontFamily: this.style.fontFamily,
            fontSize: this.style.fontSize,
          });
        }
        return 0;
      },
    });

    try {
      render(
        <A4PageEditor
          value="<p>Measured text</p>"
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            fontFamily: 'Georgia, serif',
            fontSize: '14pt',
          }}
        />,
      );

      await waitFor(() => {
        expect(measuredTypography).toContainEqual({
          fontFamily: 'Georgia, serif',
          fontSize: '14pt',
        });
      });
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          originalScrollHeight,
        );
      }
    }
  });

  it('renders one editable document root for every physical page', async () => {
    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId(/a4-page-content-/)).toHaveLength(2),
    );
    expect(screen.getByTestId('a4-document-surface')).toHaveAttribute(
      'contenteditable',
      'true',
    );
    expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1);
    screen.getAllByTestId(/a4-page-content-/).forEach((page) => {
      expect(page).not.toHaveAttribute('contenteditable', 'true');
    });
  });

  it('commits page fragments in rendered DOM order', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}
        onChange={onChange}
      />,
    );

    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstWrapper = firstPage.parentElement!.parentElement!;
    const secondWrapper = secondPage.parentElement!.parentElement!;

    surface.insertBefore(secondWrapper, firstWrapper);
    secondPage.innerHTML = '<p>Second page edited</p>';
    fireEvent.input(surface);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emittedHtml = onChange.mock.calls.at(-1)?.[0] as string;
    const emittedText = new DOMParser()
      .parseFromString(emittedHtml, 'text/html')
      .body.textContent ?? '';
    expect(emittedText.indexOf('Second page edited')).toBeLessThan(
      emittedText.indexOf('First page'),
    );
  });

  it('retains filtered pages while committing visible fragments in DOM order', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={
          `<p>First visible</p>${hardPageBreak}` +
          `<p>[Remove Page]</p>${hardPageBreak}` +
          '<p>Second visible</p>'
        }
        onChange={onChange}
      />,
    );

    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstWrapper = firstPage.parentElement!.parentElement!;
    const secondWrapper = secondPage.parentElement!.parentElement!;

    expect(screen.getAllByTestId(/a4-page-content-/)).toHaveLength(2);
    surface.insertBefore(secondWrapper, firstWrapper);
    secondPage.innerHTML = '<p>Second visible edited</p>';
    fireEvent.input(surface);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emittedHtml = onChange.mock.calls.at(-1)?.[0] as string;
    const emittedText = new DOMParser()
      .parseFromString(emittedHtml, 'text/html')
      .body.textContent ?? '';
    expect(emittedText).toContain('[Remove Page]');
    expect(emittedText.indexOf('Second visible edited')).toBeLessThan(
      emittedText.indexOf('First visible'),
    );
  });

  it('keeps a native range spanning two physical pages', async () => {
    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}
      />,
    );

    const surface = screen.getByTestId('a4-document-surface');
    const pages = screen.getAllByTestId(/a4-page-content-/);
    const range = document.createRange();
    range.setStart(pages[0].querySelector('p')!.firstChild!, 1);
    range.setEnd(pages[1].querySelector('p')!.firstChild!, 2);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(surface.contains(selection.anchorNode)).toBe(true);
    expect(surface.contains(selection.focusNode)).toBe(true);
    expect(selection.toString()).toContain('irst');
    expect(selection.toString()).toContain('Se');
  });

  it('keeps page chrome outside the native editable selection tree', async () => {
    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}
      />,
    );

    const surface = screen.getByTestId('a4-document-surface');
    await screen.findByTestId('a4-page-content-2');

    expect(surface).not.toContainElement(screen.getByText('Page 1 of 2'));
    expect(surface).not.toContainElement(screen.getByTestId('a4-page-number-1'));
    expect(surface).not.toContainElement(
      screen.getAllByTitle('Delete explicit page section')[0],
    );
  });

  it('applies document line spacing without mutating canonical content or history', () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={'<p style="line-height: 1.15;">Hello</p>'}
        onChange={onChange}
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          lineHeight: 2,
          paragraphSpacing: '0.5em',
        }}
      />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    const paragraph = editor.querySelector('p');
    const canonicalBefore = editorRef.current?.getContent();
    expect(editor).toHaveStyle({ lineHeight: '2' });
    expect(paragraph).not.toHaveStyle({ lineHeight: '2' });
    expect(editorRef.current?.getContent()).toBe(canonicalBefore);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Undo'));

    expect(editorRef.current?.getContent()).toBe(canonicalBefore);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps document line spacing unchanged when selecting paragraphs with inline spacing', () => {
    render(
      <A4PageEditor
        value={'<p style="line-height: 2;">Double</p><p style="line-height: 1.15;">Tight</p>'}
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          lineHeight: 3,
          paragraphSpacing: '0.5em',
        }}
      />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    const paragraphs = editor.querySelectorAll('p');

    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(paragraphs[1].firstChild!, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      fireEvent.keyUp(editor);
    });

    expect(editor).toHaveStyle({ lineHeight: '3' });
  });

  it('updates editable page margins', () => {
    render(
      <A4PageEditor
        value="<p>Hello</p>"
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          marginsMm: { top: 25, right: 25, bottom: 25, left: 25 },
        }}
      />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    expect(editor).toHaveStyle({
      top: '94px',
      left: '94px',
      width: '606px',
      height: '935px',
    });
  });

  it('uses independent controlled margins for the measured content box', () => {
    render(
      <A4PageEditor
        value="<p>Hello</p>"
        layout={{
          ...DEFAULT_A4_DOCUMENT_LAYOUT,
          lineHeight: 2,
          paragraphSpacing: '8px',
          marginsMm: { top: 10, right: 15, bottom: 25, left: 30 },
        }}
      />,
    );

    expect(screen.getByTestId('a4-page-content-1')).toHaveStyle({
      top: '38px',
      right: '57px',
      bottom: '94px',
      left: '113px',
      lineHeight: '2',
    });
  });

  it('toggles page numbers in the editor', () => {
    render(
      <A4PageEditor value={`<p>First</p>${hardPageBreak}<p>Second</p>`} />,
    );

    expect(screen.getByTestId('a4-page-number-1')).toBeInTheDocument();
    expect(screen.getByTestId('a4-page-number-2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
    fireEvent.click(screen.getByLabelText('Show page numbers'));

    expect(screen.queryByTestId('a4-page-number-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('a4-page-number-2')).not.toBeInTheDocument();
  });

  it('merges with the previous page when backspacing at the start of a page', async () => {
    const onChange = vi.fn();

    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}
        onChange={onChange}
      />,
    );

    const secondPage = screen.getByTestId('a4-page-content-2');
    act(() => {
      secondPage.focus();

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(secondPage);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await act(async () => {
      fireEvent.keyDown(secondPage, { key: 'Backspace' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('a4-page-content-2')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('a4-page-content-1').innerHTML).toContain(
      'Second page',
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.not.stringContaining(pageBreak),
      );
    });
  });

  it('preserves live page content when backspacing from a later page', async () => {
    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p>Original second page</p>`}
      />,
    );

    const secondPage = screen.getByTestId('a4-page-content-2');
    act(() => {
      secondPage.focus();
      secondPage.innerHTML = '<p>Unsaved live second page</p>';

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(secondPage);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await act(async () => {
      fireEvent.keyDown(secondPage, { key: 'Backspace' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('a4-page-content-2')).not.toBeInTheDocument();
    });

    const firstPage = screen.getByTestId('a4-page-content-1');
    expect(firstPage.innerHTML).toContain('First page');
    expect(firstPage.innerHTML).toContain('Unsaved live second page');
    expect(firstPage.innerHTML).not.toContain('Original second page');
  });

  it('treats leading empty blocks as page start when backspacing from a later page', async () => {
    render(
      <A4PageEditor
        value={`<p>First page</p>${hardPageBreak}<p><br></p><p>Unless the context requires otherwise</p>`}
      />,
    );

    const secondPage = screen.getByTestId('a4-page-content-2');
    const unlessText = secondPage.querySelectorAll('p')[1]?.firstChild;
    expect(unlessText).toBeTruthy();

    act(() => {
      secondPage.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(unlessText!, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await act(async () => {
      fireEvent.keyDown(secondPage, { key: 'Backspace' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('a4-page-content-2')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('a4-page-content-1').innerHTML).toContain(
      'Unless the context requires otherwise',
    );
  });

  it('keeps the caret in place after typing inside the editor', async () => {
    render(<A4PageEditor value="<p>First line</p><p>Second line</p>" />);

    const editor = screen.getByTestId('a4-page-content-1');
    const secondText = editor.querySelectorAll('p')[1]?.firstChild;
    expect(secondText).toBeTruthy();

    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(secondText!, 6);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      secondText!.textContent = 'Second typed line';
      range.setStart(secondText!, 6);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      fireEvent.input(editor);
    });

    await waitFor(() => {
      const selection = window.getSelection();
      expect(selection?.anchorNode).toBe(secondText);
      expect(selection?.anchorOffset).toBe(6);
    });
  });

  it('renders list markers and indentation inside editor pages', () => {
    render(
      <A4PageEditor
        value={'<ul><li>Point</li></ul><ol><li>Number</li></ol><blockquote>Indented</blockquote>'}
      />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    const unorderedList = editor.querySelector('ul');
    const orderedList = editor.querySelector('ol');
    const blockquote = editor.querySelector('blockquote');

    expect(unorderedList).not.toBeNull();
    expect(orderedList).not.toBeNull();
    expect(blockquote).not.toBeNull();
    expect(getComputedStyle(unorderedList!).listStyleType).toBe('disc');
    expect(getComputedStyle(orderedList!).listStyleType).toBe('decimal');
    expect(getComputedStyle(blockquote!).marginLeft).toBe('40px');
  });

  it('splits the current page when inserting a page break', async () => {
    const onChange = vi.fn();
    render(<A4PageEditor value="<p>First</p>" onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('a4-document-surface')).toHaveAttribute(
        'aria-busy',
        'false',
      );
    });

    const firstPage = screen.getByTestId('a4-page-content-1');
    act(() => {
      firstPage.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(firstPage);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Insert Page Break'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('a4-page-content-2')).toBeInTheDocument();
    expect(screen.getByTestId('a4-page-content-1').innerHTML).not.toContain(
      'page-break',
    );
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining('data-break-type="hard"'),
      );
      expect(onChange).toHaveBeenLastCalledWith(
        expect.not.stringContaining(pageBreak),
      );
    });
  });

  it('selects all document pages with Ctrl+A', () => {
    render(
      <A4PageEditor value={`<p>First</p>${hardPageBreak}<p>Second</p>`} />,
    );

    const secondPage = screen.getByTestId('a4-page-content-2');
    act(() => {
      secondPage.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(secondPage);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    fireEvent.keyDown(secondPage, { key: 'a', ctrlKey: true });

    expect(window.getSelection()?.toString()).toContain('First');
    expect(window.getSelection()?.toString()).toContain('Second');
  });

  it('preserves and styles tables in editor pages', () => {
    render(
      <A4PageEditor
        value="<table><tbody><tr><th>Header</th><td>Value</td></tr></tbody></table>"
      />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    const table = editor.querySelector('table');
    const cell = editor.querySelector('td');

    expect(table).not.toBeNull();
    expect(cell).not.toBeNull();
    expect(getComputedStyle(table!).borderCollapse).toBe('collapse');
    expect(getComputedStyle(cell!).borderStyle).toBe('solid');
  });

  it('surfaces oversized content with an accessible warning and editable overflow', async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return 100_000;
      },
    });

    try {
      render(
        <A4PageEditor
          value={
            '<table><tbody><tr><td>Tall unsplittable row</td></tr></tbody></table>'
          }
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          'taller than the printable A4 area',
        );
      });
      expect(screen.getByTestId('a4-page-content-1')).toHaveStyle({
        overflow: 'auto',
      });
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          originalScrollHeight,
        );
      }
    }
  });

  it('applies selected text color and highlight formatting', () => {
    render(<A4PageEditor value="<p>Hello world</p>" />);

    const editor = screen.getByTestId('a4-page-content-1');
    const textNode = editor.querySelector('p')?.firstChild;
    expect(textNode).toBeTruthy();

    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode!, 0);
      range.setEnd(textNode!, 5);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
    fireEvent.change(screen.getByTitle('Text Color'), {
      target: { value: '#ff0000' },
    });

    const coloredTextNode = editor.querySelector('span')?.firstChild;
    expect(coloredTextNode).toBeTruthy();

    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(coloredTextNode!, 0);
      range.setEnd(coloredTextNode!, 5);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    fireEvent.change(screen.getByTitle('Highlight Color'), {
      target: { value: '#ffff00' },
    });

    expect(editor.innerHTML).toContain('color: rgb(255, 0, 0)');
    expect(editor.innerHTML).toContain('background-color: rgb(255, 255, 0)');
  });

  it('applies paragraph styles and spacing to editor pages', () => {
    render(
      <A4PageEditor
        value="<p>Heading text</p>"
        layout={{ ...DEFAULT_A4_DOCUMENT_LAYOUT, paragraphSpacing: '1em' }}
      />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    const textNode = editor.querySelector('p')?.firstChild;
    expect(textNode).toBeTruthy();

    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode!, 0);
      range.setEnd(textNode!, 12);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
    fireEvent.change(screen.getByTitle('Paragraph Style'), {
      target: { value: 'h1' },
    });

    expect(editor.querySelector('h1')).not.toBeNull();
    expect(getComputedStyle(editor.querySelector('h1')!).fontSize).toBe('24pt');
    expect(getComputedStyle(editor.querySelector('h1')!).marginBottom).toBe('1em');
  });

  it('inserts a basic table from the toolbar', async () => {
    const onChange = vi.fn();
    render(<A4PageEditor value="<p>Before</p>" onChange={onChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('a4-document-surface')).toHaveAttribute(
        'aria-busy',
        'false',
      );
    });

    const editor = screen.getByTestId('a4-page-content-1');
    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tables' }));
    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Insert Table'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(editor.querySelector('table')).not.toBeNull();
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('<table'));
    });
  });

  it('adds table rows and columns at the selected cell', async () => {
    render(
      <A4PageEditor value="<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('a4-document-surface')).toHaveAttribute(
        'aria-busy',
        'false',
      );
    });

    const editor = screen.getByTestId('a4-page-content-1');
    const cellText = editor.querySelector('td')?.firstChild;
    expect(cellText).toBeTruthy();

    act(() => {
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(cellText!, 0);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tables' }));
    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Add Table Row'));
      fireEvent.mouseDown(screen.getByTitle('Add Table Column'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(editor.querySelectorAll('tr')).toHaveLength(3);
    expect(editor.querySelectorAll('tr')[0].children).toHaveLength(3);
    expect(editor.querySelectorAll('tr')[1].children).toHaveLength(3);
  });

  it('supports Ctrl+Z and Ctrl+Y for editor changes', async () => {
    render(<A4PageEditor value="<p>Start</p>" />);

    const editor = screen.getByTestId('a4-page-content-1');
    const textNode = editor.querySelector('p')?.firstChild;
    expect(textNode).toBeTruthy();

    act(() => {
      editor.focus();
      textNode!.textContent = 'Start typed';
      fireEvent.input(editor);
    });

    await waitFor(() => {
      expect(editor.textContent).toContain('Start typed');
    });

    await act(async () => {
      fireEvent.keyDown(editor, { key: 'z', ctrlKey: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('a4-page-content-1').textContent).toBe('Start');

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('a4-page-content-1'), {
        key: 'y',
        ctrlKey: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByTestId('a4-page-content-1').textContent).toBe(
      'Start typed',
    );
  });

  it('treats legacy page-break comments as soft layout hints', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>First</p>${pageBreak}<p>Second</p>`}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('a4-page-content-2')).not.toBeInTheDocument();
    });
    expect(editorRef.current?.getContent()).toBe('<p>First</p><p>Second</p>');
  });

  it('uses the same physical paginator for generated preview content', async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return (this.textContent?.length ?? 0) * 100;
      },
    });

    try {
      render(
        <A4PageEditor
          value="<p>Editable</p>"
          previewContent="<p>123456789012345</p>"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

      await waitFor(() => {
        expect(screen.getByTestId('a4-page-content-2')).toBeInTheDocument();
      });
      expect(screen.getByTestId('a4-page-content-1').textContent).toContain(
        '123456789',
      );
      expect(screen.getByTestId('a4-page-content-2').textContent).toContain(
        '012345',
      );
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          originalScrollHeight,
        );
      }
    }
  });

  it('deletes the preceding logical character at a soft page boundary', async () => {
    const restoreMeasurement = installDeterministicA4Measurement({
      pixelsPerCharacter: 100,
      blockHeight: 0,
    });
    const onChange = vi.fn();

    try {
      render(
        <A4PageEditor value="<p>123456789012345</p>" onChange={onChange} />,
      );
      const pageTwoContent = await screen.findByTestId('a4-page-content-2');
      await flushA4Reflow();
      act(() => {
        pageTwoContent.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pageTwoContent);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
      fireEvent.keyDown(pageTwoContent, { key: 'Backspace' });

      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(
          expect.stringContaining('12345678012345'),
        );
      }, { timeout: 3000 });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.not.stringContaining('123456789012345'),
      );
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      restoreMeasurement();
    }
  });

  it('uses forward Delete to remove content across a soft boundary', async () => {
    const restoreMeasurement = installDeterministicA4Measurement({
      pixelsPerCharacter: 100,
      blockHeight: 0,
    });
    const onChange = vi.fn();

    try {
      render(
        <A4PageEditor value="<p>123456789012345</p>" onChange={onChange} />,
      );
      await screen.findByTestId('a4-page-content-2');
      await flushA4Reflow();
      const firstPage = screen.getByTestId('a4-page-content-1');
      const firstText = firstPage.querySelector('p')!.firstChild!;
      act(() => {
        firstPage.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(firstText, firstText.textContent!.length);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      });

      fireEvent.keyDown(screen.getByTestId('a4-document-surface'), {
        key: 'Delete',
      });

      await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining('12345678912345'),
      );
    } finally {
      restoreMeasurement();
    }
  });

  it('keeps a hard blank page after the first Add Page click', async () => {
    render(<A4PageEditor value="<p>One</p>" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Page' }));

    await waitFor(() =>
      expect(screen.getAllByTestId(/a4-page-content-/)).toHaveLength(2),
    );
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(screen.getAllByTestId(/a4-page-content-/)).toHaveLength(2);
  });

  it('deletes a hard page after the first confirmation action', async () => {
    render(
      <A4PageEditor value={`<p>One</p>${hardPageBreak}<p>Two</p>`} />,
    );
    const secondPage = screen.getByTestId('a4-page-content-2');
    fireEvent.mouseUp(secondPage);

    fireEvent.click(screen.getAllByTitle('Delete explicit page section')[1]);

    await waitFor(() =>
      expect(screen.getAllByTestId(/a4-page-content-/)).toHaveLength(1),
    );
    expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent('One');
  });

  it('exposes no page deletion for an automatically paginated document', async () => {
    const restoreMeasurement = installDeterministicA4Measurement({
      pixelsPerCharacter: 100,
      blockHeight: 0,
    });
    try {
      render(<A4PageEditor value="<p>123456789012345</p>" />);
      await screen.findByTestId('a4-page-content-2');
      await flushA4Reflow();
      expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent(
        '123456789',
      );
      expect(screen.getByTestId('a4-page-content-2')).toHaveTextContent(
        '012345',
      );

      expect(
        screen.queryByTitle('Delete explicit page section'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Delete current page' }),
      ).toBeDisabled();
    } finally {
      restoreMeasurement();
    }
  });

  it('deletes the whole hard section when its first soft fragment is removed', async () => {
    const restoreMeasurement = installDeterministicA4Measurement({
      pixelsPerCharacter: 100,
      blockHeight: 0,
    });
    const editorRef = createRef<A4PageEditorRef>();

    try {
      render(
        <A4PageEditor
          ref={editorRef}
          value={`<p>A</p>${hardPageBreak}<p>123456789012345</p>`}
        />,
      );
      await screen.findByTestId('a4-page-content-3');
      await flushA4Reflow();
      expect(screen.getByTestId('a4-page-content-2')).toHaveTextContent(
        '123456789',
      );
      expect(screen.getByTestId('a4-page-content-3')).toHaveTextContent(
        '012345',
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: 'Delete explicit page section starting at page 2',
        }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId('a4-page-content-2')).not.toBeInTheDocument();
      });
      expect(editorRef.current?.getContent()).toBe('<p>A</p>');
    } finally {
      restoreMeasurement();
    }
  });

  it('deletes the owning hard section when Delete Current Page fires in a later soft fragment', async () => {
    const restoreMeasurement = installDeterministicA4Measurement({
      pixelsPerCharacter: 100,
      blockHeight: 0,
    });
    const editorRef = createRef<A4PageEditorRef>();

    try {
      render(
        <A4PageEditor
          ref={editorRef}
          value={`<p>A</p>${hardPageBreak}<p>123456789012345</p>`}
        />,
      );
      await screen.findByTestId('a4-page-content-3');
      await flushA4Reflow();
      const pageThree = screen.getByTestId('a4-page-content-3');
      fireEvent.mouseUp(pageThree);

      fireEvent.click(
        screen.getByRole('button', { name: 'Delete current page' }),
      );

      await waitFor(() => {
        expect(screen.queryByTestId('a4-page-content-2')).not.toBeInTheDocument();
      });
      expect(editorRef.current?.getContent()).toBe('<p>A</p>');
    } finally {
      restoreMeasurement();
    }
  });

  it('undo restores a deleted hard section and redo removes it with one history entry per action', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>One</p>${hardPageBreak}<p>Two</p>`}
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Delete explicit page section starting at page 2',
      }),
    );
    await waitFor(() => {
      expect(editorRef.current?.getContent()).not.toContain('Two');
    });

    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(editorRef.current?.getContent()).toContain('Two');
    });

    fireEvent.keyDown(surface, { key: 'y', ctrlKey: true });
    await waitFor(() => {
      expect(editorRef.current?.getContent()).not.toContain('Two');
    });
  });

  it('deletes a selection spanning multiple pages as one document range', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstText = firstPage.querySelector('p')?.firstChild;
    const secondText = secondPage.querySelector('p')?.firstChild;
    expect(firstText).toBeTruthy();
    expect(secondText).toBeTruthy();

    act(() => {
      firstPage.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(firstText!, 2);
      range.setEnd(secondText!, 2);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    fireEvent.keyDown(firstPage, { key: 'Delete' });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.not.stringContaining('page-break'),
      );
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('Al'));
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('ta'));
      expect(onChange).not.toHaveBeenLastCalledWith(
        expect.stringContaining('pha'),
      );
    });
  });

  it('preserves a reversed non-collapsed selection through reflow', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstText = firstPage.querySelector('p')!.firstChild!;
    const secondText = secondPage.querySelector('p')!.firstChild!;

    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      selection.setBaseAndExtent(secondText, 2, firstText, 2);
      firstPage.querySelector('p')!.setAttribute('style', 'color: red');
      fireEvent.input(surface);
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('color: red'));
      const selection = window.getSelection()!;
      expect(selection.isCollapsed).toBe(false);
      expect(selection.anchorNode?.textContent).toBe('Beta');
      expect(selection.anchorOffset).toBe(2);
      expect(selection.focusNode?.textContent).toBe('Alpha');
      expect(selection.focusOffset).toBe(2);
    });
  });

  it('applies formatting to the logical selection after a controlled layout rerender', async () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollHeight',
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return (this.textContent?.length ?? 0) * 100;
      },
    });
    const value = `<p>Alpha</p>${hardPageBreak}<p>Beta</p>`;

    try {
      const { rerender } = render(
        <A4PageEditor
          value={value}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            fontSize: '11pt',
          }}
        />,
      );

      const surface = screen.getByTestId('a4-document-surface');
      const secondPage = screen.getByTestId('a4-page-content-2');
      const betaText = secondPage.querySelector('p')!.firstChild!;
      act(() => {
        surface.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(betaText, 0);
        range.setEnd(betaText, 4);
        selection.removeAllRanges();
        selection.addRange(range);
      });

      rerender(
        <A4PageEditor
          value={value}
          layout={{
            ...DEFAULT_A4_DOCUMENT_LAYOUT,
            fontSize: '14pt',
          }}
        />,
      );

      await act(async () => {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      });

      fireEvent.click(screen.getByRole('button', { name: 'Formats' }));
      fireEvent.change(screen.getByLabelText('Text color'), {
        target: { value: '#ff0000' },
      });

      await waitFor(() => {
        const betaPage = screen.getByTestId('a4-page-content-2');
        expect(betaPage.querySelector('span[style*="color"]')?.textContent).toBe(
          'Beta',
        );
      });
      expect(
        screen
          .getByTestId('a4-page-content-1')
          .querySelector('span[style*="color"]'),
      ).toBeNull();
    } finally {
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          originalScrollHeight,
        );
      }
    }
  });

  it('coalesces rapid controlled layout changes to the newest value', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    const value = '<p>Stable</p>';
    const renderLayout = (fontSize: string) => (
      <A4PageEditor
        ref={editorRef}
        value={value}
        onChange={onChange}
        layout={{ ...DEFAULT_A4_DOCUMENT_LAYOUT, fontSize }}
      />
    );
    const { rerender } = render(renderLayout('11pt'));
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    rerender(renderLayout('14pt'));
    rerender(renderLayout('20pt'));
    rerender(renderLayout('11pt'));

    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    expect(screen.getByTestId('a4-page-content-1')).toHaveStyle({
      fontSize: '11pt',
    });
    expect(screen.getByTestId('a4-editor-status')).toHaveTextContent('Editing');
    expect(editorRef.current?.getContent()).toBe('<p>Stable</p>');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('collapses a reversed cross-page deletion at the logical range start', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    const firstText = screen.getByTestId('a4-page-content-1').querySelector('p')!
      .firstChild!;
    const secondText = screen.getByTestId('a4-page-content-2').querySelector('p')!
      .firstChild!;

    act(() => {
      surface.focus();
      window.getSelection()!.setBaseAndExtent(secondText, 2, firstText, 2);
    });
    fireEvent.keyDown(surface, { key: 'Delete' });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('Al'));
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('ta'));
      const selection = window.getSelection()!;
      expect(selection.isCollapsed).toBe(true);
      expect(selection.anchorNode?.textContent).toBe('Al');
      expect(selection.anchorOffset).toBe(2);
    });
  });

  it('repairs a non-cancelable cross-page composition as one canonical transaction', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstText = firstPage.querySelector('p')!.firstChild!;
    const secondText = secondPage.querySelector('p')!.firstChild!;

    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(firstText, 2);
      range.setEnd(secondText, 2);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    surface.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: false,
        data: '文',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    );
    firstPage.parentElement!.insertBefore(
      document.createTextNode('ROGUE_IME_TEXT'),
      firstPage,
    );
    fireEvent.input(surface, {
      data: '文',
      inputType: 'insertCompositionText',
      isComposing: true,
    });

    await waitFor(() => {
      const canonical = editorRef.current?.getContent() ?? '';
      const text = new DOMParser()
        .parseFromString(canonical, 'text/html')
        .body.textContent ?? '';
      expect(text).toBe('Al文ta');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('a4-document-surface').textContent).not.toContain(
        'ROGUE_IME_TEXT',
      );
    });

    await waitFor(() => {
      const repairedSelection = window.getSelection()!;
      const selectionElement =
        repairedSelection.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (repairedSelection.anchorNode as HTMLElement)
          : repairedSelection.anchorNode?.parentElement;
      expect(repairedSelection.isCollapsed).toBe(true);
      expect(
        selectionElement?.closest('[data-testid^="a4-page-content-"]'),
      ).toBeTruthy();
    });

    const repairedSurface = screen.getByTestId('a4-document-surface');
    fireEvent.keyDown(repairedSurface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      const canonical = editorRef.current?.getContent() ?? '';
      const text = new DOMParser()
        .parseFromString(canonical, 'text/html')
        .body.textContent ?? '';
      expect(text).toBe('AlphaBeta');
    });
  });

  it('repairs non-cancelable boundary input without changing canonical history', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );

    const initialFirstPage = screen.getByTestId('a4-page-content-1');
    initialFirstPage.innerHTML = '<p>Alpha edited</p>';
    fireEvent.input(screen.getByTestId('a4-document-surface'));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    onChange.mockClear();

    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const paperContainer = firstPage.parentElement!;
    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(paperContainer, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    surface.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: false,
        data: '文',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    );
    paperContainer.insertBefore(
      document.createTextNode('ROGUE_BOUNDARY_IME'),
      firstPage,
    );
    fireEvent.input(surface, {
      data: '文',
      inputType: 'insertCompositionText',
      isComposing: true,
    });

    await waitFor(() => {
      const canonical = editorRef.current?.getContent() ?? '';
      const text = new DOMParser()
        .parseFromString(canonical, 'text/html')
        .body.textContent ?? '';
      expect(text).toBe('Alpha editedBeta');
      expect(screen.getByTestId('a4-document-surface').textContent).not.toContain(
        'ROGUE_BOUNDARY_IME',
      );
    });
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => {
      const repairedSelection = window.getSelection()!;
      const selectionElement =
        repairedSelection.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (repairedSelection.anchorNode as HTMLElement)
          : repairedSelection.anchorNode?.parentElement;
      expect(repairedSelection.isCollapsed).toBe(true);
      expect(
        selectionElement?.closest('[data-testid^="a4-page-content-"]'),
      ).toBeTruthy();
    });

    const repairedSurface = screen.getByTestId('a4-document-surface');
    fireEvent.keyDown(repairedSurface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      const canonical = editorRef.current?.getContent() ?? '';
      const text = new DOMParser()
        .parseFromString(canonical, 'text/html')
        .body.textContent ?? '';
      expect(text).toBe('AlphaBeta');
    });
  });

  it('repairs non-cancelable boundary input on an empty page without a flow node', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(<A4PageEditor ref={editorRef} value="" onChange={onChange} />);

    const surface = screen.getByTestId('a4-document-surface');
    const pageContent = screen.getByTestId('a4-page-content-1');
    const paperContainer = pageContent.parentElement!;
    await waitFor(() => expect(editorRef.current?.getContent()).not.toBe(''));
    const canonicalBeforeBoundary = editorRef.current?.getContent() ?? '';
    pageContent.innerHTML = '';
    expect(pageContent.querySelector('[data-flow-id]')).toBeNull();

    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(paperContainer, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    surface.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: false,
        data: '文',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    );
    paperContainer.insertBefore(
      document.createTextNode('ROGUE_EMPTY_BOUNDARY'),
      pageContent,
    );
    fireEvent.input(surface, {
      data: '文',
      inputType: 'insertCompositionText',
      isComposing: true,
    });

    await waitFor(() => {
      expect(editorRef.current?.getContent()).toBe(canonicalBeforeBoundary);
      expect(screen.getByTestId('a4-document-surface').textContent).not.toContain(
        'ROGUE_EMPTY_BOUNDARY',
      );
    });
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => {
      const selection = window.getSelection()!;
      const selectionElement =
        selection.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (selection.anchorNode as HTMLElement)
          : selection.anchorNode?.parentElement;
      expect(selection.isCollapsed).toBe(true);
      expect(selectionElement).toBe(screen.getByTestId('a4-page-content-1'));
    });

    fireEvent.keyDown(screen.getByTestId('a4-document-surface'), {
      key: 'z',
      ctrlKey: true,
    });
    expect(editorRef.current?.getContent()).toBe(canonicalBeforeBoundary);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces a selection spanning pages with pasted content', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstText = firstPage.querySelector('p')?.firstChild;
    const secondText = secondPage.querySelector('p')?.firstChild;

    act(() => {
      firstPage.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(firstText!, 2);
      range.setEnd(secondText!, 2);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    fireEvent.paste(firstPage, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'X' : ''),
      },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        expect.not.stringContaining('page-break'),
      );
      expect(onChange).toHaveBeenLastCalledWith(
        '<p>Al</p><p>X</p><p>ta</p>',
      );
    });
  });

  it('focuses an internal flow block when asked by the template validation panel', () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(<A4PageEditor ref={editorRef} value="<p>Focus this block</p>" />);

    const flowBlock = screen.getByTestId('a4-page-content-1').querySelector<HTMLElement>('[data-flow-id]');
    expect(flowBlock?.dataset.flowId).toBeTruthy();

    expect(editorRef.current?.focusFlowBlock).toBeTypeOf('function');
    act(() => {
      editorRef.current!.focusFlowBlock!(flowBlock!.dataset.flowId!);
    });

    expect(document.activeElement).toBe(screen.getByTestId('a4-document-surface'));
  });

  it('applies a pending bold format to typed text and toggles it off at the caret', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(<A4PageEditor ref={editorRef} value="<p>Alpha</p>" />);
    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    const page = screen.getByTestId('a4-page-content-1');
    const textNode = page.querySelector('p')!.firstChild!;
    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    act(() => {
      surface.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: 'X',
          cancelable: true,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen
          .getByTestId('a4-page-content-1')
          .querySelector('span[style*="font-weight"]')?.textContent,
      ).toBe('X');
    });
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });
    expect(editorRef.current!.getContent()).toContain('font-weight: bold');

    const boldSpan = screen
      .getByTestId('a4-page-content-1')
      .querySelector('span[style*="font-weight"]')!;
    const boldText = boldSpan.firstChild!;
    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(boldText, 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    act(() => {
      surface.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: 'Y',
          cancelable: true,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => {
      expect(editorRef.current!.getContent()).toContain('Y');
    });
    const body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.textContent).toBe('AlphaXY');
    expect(body.querySelector('p')?.lastChild?.textContent).toBe('Y');
    expect(
      body.querySelector('p')?.lastChild?.parentElement?.tagName,
    ).toBe('P');
  });

  it('toggles selected bold off and on while preserving colour and italic (VR2-01)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(
      <A4PageEditor
        ref={editorRef}
        value={
          '<p><span style="font-weight:bold;color:rgb(255, 0, 0);font-style:italic">abcdef</span></p>'
        }
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    const selectSpan = () => {
      const span = screen
        .getByTestId('a4-page-content-1')
        .querySelector('span')!;
      const text = span.firstChild!;
      act(() => {
        surface.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(text, 0);
        range.setEnd(text, text.textContent!.length);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    };

    selectSpan();
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });
    selectSpan();
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    const body = new DOMParser()
      .parseFromString(editorRef.current!.getContent(), 'text/html')
      .body;
    expect(body.textContent).toBe('abcdef');
    const boldSpan = Array.from(body.querySelectorAll('span')).find(
      (span) => span.style.fontWeight === 'bold',
    )!;
    expect(boldSpan.textContent).toBe('abcdef');
    expect(boldSpan.style.fontStyle).toBe('italic');
    expect(boldSpan.style.color).toBe('rgb(255, 0, 0)');
    expect(window.getSelection()?.toString()).toBe('abcdef');

    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      const undone = new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body;
      const plainSpan = Array.from(undone.querySelectorAll('span')).find(
        (span) => span.style.fontWeight === '',
      )!;
      expect(plainSpan.style.fontWeight).toBe('');
      expect(plainSpan.style.fontStyle).toBe('italic');
      expect(plainSpan.style.color).toBe('rgb(255, 0, 0)');
    });

    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      const restored = new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body;
      expect(
        Array.from(restored.querySelectorAll('span')).some(
          (span) => span.style.fontWeight === 'bold',
        ),
      ).toBe(true);
    });
  });

  it('cancels a pending bold while keeping a pending italic before typing (VR2-01)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(<A4PageEditor ref={editorRef} value="<p>Alpha</p>" />);
    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    const page = screen.getByTestId('a4-page-content-1');
    const textNode = page.querySelector('p')!.firstChild!;
    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(textNode, 5);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    act(() => {
      surface.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: 'X',
          cancelable: true,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => {
      const body = new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body;
      expect(body.textContent).toBe('AlphaX');
      const italicSpan = Array.from(body.querySelectorAll('span')).find(
        (span) => span.style.fontStyle === 'italic',
      )!;
      expect(italicSpan.textContent).toBe('X');
      expect(italicSpan.style.fontWeight).toBe('');
      expect(
        body.querySelector('span[style*="font-weight"]'),
      ).toBeNull();
    });

    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      const body = new DOMParser()
        .parseFromString(editorRef.current!.getContent(), 'text/html')
        .body;
      expect(body.textContent).toBe('Alpha');
      expect(body.querySelector('span')).toBeNull();
    });
  });

  it('keeps list creation, type switch, alignment, indent, and toggle-off as one history entry each (VR2-02)', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(<A4PageEditor ref={editorRef} value="<p>One</p><p>Two</p>" />);
    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    const parse = (html: string) =>
      new DOMParser().parseFromString(html, 'text/html').body;
    const selectBoth = () => {
      const page = screen.getByTestId('a4-page-content-1');
      const paragraphs = Array.from(page.querySelectorAll('p'));
      expect(paragraphs).toHaveLength(2);
      act(() => {
        surface.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(paragraphs[0].firstChild!, 0);
        range.setEnd(paragraphs[1].firstChild!, paragraphs[1].textContent!.length);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    };
    const waitIdle = () =>
      waitFor(() => {
        expect(surface).toHaveAttribute('aria-busy', 'false');
      });

    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Bulleted list' }));
    await waitIdle();
    let body = parse(editorRef.current!.getContent());
    expect(body.querySelectorAll('ul')).toHaveLength(1);
    expect(body.querySelectorAll('ul > li > p')).toHaveLength(2);

    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(editorRef.current!.getContent()).toBe('<p>One</p><p>Two</p>');
    });
    fireEvent.keyDown(surface, { key: 'y', ctrlKey: true });
    await waitIdle();

    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
    await waitIdle();
    body = parse(editorRef.current!.getContent());
    expect(body.querySelectorAll('ol')).toHaveLength(1);
    expect(body.querySelectorAll('ul')).toHaveLength(0);
    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(parse(editorRef.current!.getContent()).querySelector('ul')).not.toBeNull();
    });
    fireEvent.keyDown(surface, { key: 'y', ctrlKey: true });
    await waitIdle();

    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
    await waitIdle();
    body = parse(editorRef.current!.getContent());
    expect(
      Array.from(body.querySelectorAll<HTMLElement>('ol > li > p')).every(
        (paragraph) => paragraph.style.textAlign === 'center',
      ),
    ).toBe(true);
    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(
        Array.from(
          parse(editorRef.current!.getContent()).querySelectorAll('p'),
        ).every((paragraph) => paragraph.style.textAlign === ''),
      ).toBe(true);
    });
    fireEvent.keyDown(surface, { key: 'y', ctrlKey: true });
    await waitIdle();

    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Increase indent' }));
    await waitIdle();
    body = parse(editorRef.current!.getContent());
    expect(
      Array.from(body.querySelectorAll<HTMLElement>('ol > li > p')).every(
        (paragraph) => paragraph.style.marginLeft === '2em',
      ),
    ).toBe(true);
    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(
        Array.from(parse(editorRef.current!.getContent()).querySelectorAll('p')).every(
          (paragraph) => paragraph.style.marginLeft === '',
        ),
      ).toBe(true);
    });
    fireEvent.keyDown(surface, { key: 'y', ctrlKey: true });
    await waitIdle();

    selectBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
    await waitIdle();
    body = parse(editorRef.current!.getContent());
    expect(body.querySelectorAll('ol, ul')).toHaveLength(0);
    expect(
      Array.from(body.children, (node) => node.tagName),
    ).toEqual(['P', 'P']);
    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(parse(editorRef.current!.getContent()).querySelector('ol')).not.toBeNull();
    });
  });

  it('refuses insertion when the saved logical selection is stale', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value="<p>Alpha</p>"
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    const page = screen.getByTestId('a4-page-content-1');
    const textNode = page.querySelector('p')!.firstChild!;
    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(textNode, 2);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });
    fireEvent.blur(surface);
    act(() => {
      window.getSelection()?.removeAllRanges();
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    onChange.mockClear();

    act(() => {
      editorRef.current!.setContent('<p>Replaced</p>');
    });
    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
    });

    act(() => {
      editorRef.current!.insertHtmlAtCursor('<p>Dropped</p>');
    });
    await waitFor(() => {
      expect(
        screen.getByText(
          'Selection moved after repagination; choose the text again.',
        ),
      ).toBeInTheDocument();
    });
    expect(editorRef.current!.getContent()).toBe('<p>Replaced</p>');
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      editorRef.current!.insertAtCursor('Dropped text');
    });
    expect(editorRef.current!.getContent()).toBe('<p>Replaced</p>');
    expect(onChange).not.toHaveBeenCalled();
  });
});
