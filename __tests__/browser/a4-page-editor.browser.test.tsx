import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

describe('A4PageEditor real layout pagination', () => {
  let host: HTMLDivElement;
  let root: Root;

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

  it('flows forward and backward without serializing soft pages', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const longDocument = Array.from(
      { length: 90 },
      (_, index) => `<p>Line ${index + 1}: deterministic pagination content.</p>`,
    ).join('');

    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={longDocument} />);
    });
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
