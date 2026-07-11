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

  it('uses forward Delete to remove content across a soft boundary', async () => {
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
      await screen.findByTestId('a4-page-content-2');
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
      if (originalScrollHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          'scrollHeight',
          originalScrollHeight,
        );
      }
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

    fireEvent.click(screen.getAllByTitle('Delete page')[1]);

    await waitFor(() =>
      expect(screen.getAllByTestId(/a4-page-content-/)).toHaveLength(1),
    );
    expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent('One');
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
});
