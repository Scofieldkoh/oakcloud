import { describe, expect, it } from 'vitest';
import {
  captureFlowSelection,
  restoreFlowSelection,
} from '@/components/documents/a4-pagination/selection';

function setCaret(node: Node, offset: number): void {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('A4 pagination selection bookmarks', () => {
  it('captures a logical offset across continuation fragments', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div><p data-flow-id="paragraph">Hello </p></div>',
      '<div><p data-flow-id="paragraph">world</p></div>',
    ].join('');
    document.body.appendChild(root);
    const secondText = root.querySelectorAll('p')[1].firstChild!;
    setCaret(secondText, 3);

    const bookmark = captureFlowSelection(root);

    expect(bookmark?.anchor).toEqual({ flowId: 'paragraph', offset: 9 });
    expect(bookmark?.focus).toEqual({ flowId: 'paragraph', offset: 9 });
    root.remove();
  });

  it('restores the caret after content is split at a different position', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<div><p data-flow-id="paragraph">Hell</p></div>',
      '<div><p data-flow-id="paragraph">o world</p></div>',
    ].join('');
    document.body.appendChild(root);

    const restored = restoreFlowSelection(root, {
      anchor: { flowId: 'paragraph', offset: 9 },
      focus: { flowId: 'paragraph', offset: 9 },
      collapsed: true,
    });

    expect(restored).toBe(true);
    expect(window.getSelection()?.anchorNode?.textContent).toBe('o world');
    expect(window.getSelection()?.anchorOffset).toBe(5);
    root.remove();
  });

  it('restores a selection spanning different flow blocks', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p data-flow-id="first">Alpha</p><p data-flow-id="second">Beta</p>';
    document.body.appendChild(root);

    const restored = restoreFlowSelection(root, {
      anchor: { flowId: 'first', offset: 2 },
      focus: { flowId: 'second', offset: 2 },
      collapsed: false,
    });

    expect(restored).toBe(true);
    expect(window.getSelection()?.toString()).toBe('phaBe');
    root.remove();
  });
});
