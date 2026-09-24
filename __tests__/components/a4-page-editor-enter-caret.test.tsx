import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';

describe('A4PageEditor Enter caret regression', () => {
  it('keeps the visible caret at the start of a new normal paragraph and after typing', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    render(<A4PageEditor ref={editorRef} value="<p>First line</p>" />);

    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => expect(surface).toHaveAttribute('aria-busy', 'false'));
    const firstText = screen
      .getByTestId('a4-page-content-1')
      .querySelector('p')
      ?.firstChild;
    expect(firstText).toBeTruthy();

    await act(async () => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(firstText!, 10);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      surface.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertParagraph',
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
      const paragraphs = screen
        .getByTestId('a4-page-content-1')
        .querySelectorAll('p');
      expect(paragraphs).toHaveLength(2);
      expect(window.getSelection()?.anchorNode).toBe(paragraphs[1]);
      expect(window.getSelection()?.anchorOffset).toBe(0);
    });

    await act(async () => {
      surface.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          data: 'X',
          inputType: 'insertText',
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(surface).toHaveAttribute('aria-busy', 'false');
      const paragraphs = screen
        .getByTestId('a4-page-content-1')
        .querySelectorAll('p');
      expect(paragraphs[1]).toHaveTextContent('X');
      expect(window.getSelection()?.anchorNode?.textContent).toBe('X');
      expect(window.getSelection()?.anchorOffset).toBe(1);
      expect(editorRef.current?.getContent()).toContain('<p>X</p>');
    });
  });
});
