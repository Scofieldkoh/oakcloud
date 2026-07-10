import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';

const pageBreak = '<!-- PAGE_BREAK -->';
const hardPageBreak =
  '<div class="page-break" data-break-type="hard"></div>';

describe('A4PageEditor', () => {
  it('applies document line spacing to editable pages', () => {
    render(<A4PageEditor value="<p>Hello</p>" />);

    const editor = screen.getByTestId('a4-page-content-1');
    const paragraph = editor.querySelector('p');
    fireEvent.change(screen.getByTitle('Line Spacing'), {
      target: { value: '2' },
    });

    const lineSpacing = screen.getByTitle('Line Spacing') as HTMLSelectElement;

    expect(editor).toHaveStyle({ lineHeight: '2' });
    expect(paragraph).not.toHaveStyle({ lineHeight: '2' });
    expect(lineSpacing.value).toBe('2');
  });

  it('keeps document line spacing unchanged when selecting paragraphs with inline spacing', () => {
    render(
      <A4PageEditor value={'<p style="line-height: 2;">Double</p><p style="line-height: 1.15;">Tight</p>'} />,
    );

    const editor = screen.getByTestId('a4-page-content-1');
    const lineSpacing = screen.getByTitle('Line Spacing') as HTMLSelectElement;
    const paragraphs = editor.querySelectorAll('p');

    fireEvent.change(lineSpacing, {
      target: { value: '3' },
    });

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

    expect(lineSpacing.value).toBe('3');
    expect(editor).toHaveStyle({ lineHeight: '3' });
  });

  it('updates editable page margins', () => {
    render(<A4PageEditor value="<p>Hello</p>" />);

    const editor = screen.getByTestId('a4-page-content-1');
    fireEvent.change(screen.getByTitle('Page Margin'), {
      target: { value: '25' },
    });

    expect(editor).toHaveStyle({
      top: '94px',
      left: '94px',
      width: '606px',
      height: '935px',
    });
  });

  it('toggles page numbers in the editor', () => {
    render(
      <A4PageEditor value={`<p>First</p>${hardPageBreak}<p>Second</p>`} />,
    );

    expect(screen.getByTestId('a4-page-number-1')).toBeInTheDocument();
    expect(screen.getByTestId('a4-page-number-2')).toBeInTheDocument();

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
    expect(onChange).toHaveBeenLastCalledWith(
      expect.not.stringContaining(pageBreak),
    );
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
    render(<A4PageEditor value="<p>Heading text</p>" />);

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

    fireEvent.change(screen.getByTitle('Paragraph Style'), {
      target: { value: 'h1' },
    });
    fireEvent.change(screen.getByTitle('Paragraph Spacing'), {
      target: { value: '1em' },
    });

    expect(editor.querySelector('h1')).not.toBeNull();
    expect(getComputedStyle(editor.querySelector('h1')!).fontSize).toBe('24pt');
    expect(getComputedStyle(editor.querySelector('h1')!).marginBottom).toBe('1em');
  });

  it('inserts a basic table from the toolbar', async () => {
    const onChange = vi.fn();
    render(<A4PageEditor value="<p>Before</p>" onChange={onChange} />);

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

  it('deletes the preceding character when backspacing across a soft page boundary', async () => {
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
    const onChange = vi.fn();

    try {
      render(
        <A4PageEditor value="<p>123456789012345</p>" onChange={onChange} />,
      );
      const secondPage = await screen.findByTestId('a4-page-content-2');
      act(() => {
        secondPage.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(secondPage);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
      fireEvent.keyDown(secondPage, { key: 'Backspace' });

      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(
          expect.stringContaining('12345678012345'),
        );
      });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.not.stringContaining(pageBreak),
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
});
