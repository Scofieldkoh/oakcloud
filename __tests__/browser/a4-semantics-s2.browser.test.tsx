import { describe, expect, it } from 'vitest';
import {
  continueA4S2OrderedList,
  indentA4S2ListItems,
  insertA4S2ParagraphBreak,
  readA4S2FormattingState,
  restartA4S2OrderedListAtSelection,
  setA4S2ListType,
} from '@/components/documents/a4-pagination/s2-semantics';
import { stripFlowMetadata } from '@/components/documents/a4-pagination/model';
import {
  captureA4Position,
  captureA4SelectionFromDomPoints,
  createCanonicalEditorDocument,
  type A4Selection,
  type A4TransactionResult,
  type CanonicalEditorDocument,
} from '@/components/documents/a4-pagination/structural-position';

function mountedRoot(canonical: CanonicalEditorDocument): HTMLElement {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  root.innerHTML = canonical.internalHtml;
  document.body.appendChild(root);
  return root;
}

function textNode(root: HTMLElement, selector: string): Text {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing selector: ${selector}`);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode();
  if (!(text instanceof Text)) throw new Error(`Missing text node: ${selector}`);
  return text;
}

function nativeSelection(
  canonical: CanonicalEditorDocument,
  anchorSelector: string,
  anchorOffset: number,
  focusSelector: string,
  focusOffset: number,
): A4Selection {
  const root = mountedRoot(canonical);
  try {
    const anchor = textNode(root, anchorSelector);
    const focus = textNode(root, focusSelector);
    const selection = window.getSelection();
    if (!selection) throw new Error('Browser selection is unavailable');
    selection.removeAllRanges();
    selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
    if (!selection.anchorNode || !selection.focusNode) {
      throw new Error('Native selection endpoints are unavailable');
    }
    const captured = captureA4SelectionFromDomPoints(
      root,
      { node: selection.anchorNode, offset: selection.anchorOffset },
      { node: selection.focusNode, offset: selection.focusOffset },
    );
    if (!captured) throw new Error('Native selection could not be captured structurally');
    return captured;
  } finally {
    window.getSelection()?.removeAllRanges();
    root.remove();
  }
}

function caret(
  canonical: CanonicalEditorDocument,
  selector: string,
  offset: number,
): A4Selection {
  const root = mountedRoot(canonical);
  try {
    const text = textNode(root, selector);
    const point = captureA4Position(root, text, offset, 'after');
    if (!point) throw new Error('Caret could not be captured structurally');
    return { anchor: point, focus: point };
  } finally {
    root.remove();
  }
}

function applied(result: A4TransactionResult): CanonicalEditorDocument {
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('Expected applied S2 transaction');
  return result.document;
}

function bodyFor(canonical: CanonicalEditorDocument): HTMLElement {
  return new DOMParser().parseFromString(
    stripFlowMetadata(canonical.internalHtml),
    'text/html',
  ).body;
}

describe('A4 S2 browser-native semantic boundaries', () => {
  it('keeps paragraph-to-list conversion in native backward-selection document order', () => {
    const canonical = createCanonicalEditorDocument(
      '<p>One</p><p>Two</p><ul><li><p>Three</p></li></ul>',
    );
    const selected = nativeSelection(canonical, 'p:nth-child(2)', 3, 'p:first-child', 0);
    const body = bodyFor(applied(setA4S2ListType(canonical, selected, 'unordered')));
    expect(Array.from(body.querySelectorAll(':scope > ul > li'), (li) => li.textContent))
      .toEqual(['One', 'Two', 'Three']);
  });

  it('splits a list item at a native structural caret without duplicating following content', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol start="5"><li><p>AlphaBeta</p></li><li><p>Next</p></li></ol>',
    );
    const body = bodyFor(applied(insertA4S2ParagraphBreak(
      canonical,
      caret(canonical, 'ol > li:first-child > p', 5),
    )));
    expect(Array.from(body.querySelectorAll('ol > li > p'), (p) => p.textContent))
      .toEqual(['Alpha', 'Beta', 'Next']);
    expect(body.textContent?.match(/Next/g)).toHaveLength(1);
    expect(body.querySelector('ol')?.getAttribute('start')).toBe('5');
  });

  it('indents a native range of adjacent items as one ordered nested group', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li><li><p>D</p></li></ol>',
    );
    const selected = nativeSelection(
      canonical,
      'ol > li:nth-child(2) > p',
      0,
      'ol > li:nth-child(3) > p',
      1,
    );
    const body = bodyFor(applied(indentA4S2ListItems(canonical, selected)));
    expect(Array.from(body.querySelectorAll(':scope > ol > li:first-child > ol > li'), (li) => li.textContent))
      .toEqual(['B', 'C']);
    expect(Array.from(body.querySelectorAll(':scope > ol > li'), (li) =>
      li.querySelector(':scope > p')?.textContent,
    )).toEqual(['A', 'D']);
  });

  it('reports per-property mixed formatting from a native selected range', () => {
    const canonical = createCanonicalEditorDocument(
      '<p><span style="font-weight:bold;font-style:italic;color:red">A</span><span style="font-style:italic;color:red">B</span></p>',
    );
    const selected = nativeSelection(canonical, 'p', 0, 'p', 2);
    const state = readA4S2FormattingState(canonical, selected);
    expect(state?.bold).toBe('mixed');
    expect(state?.italic).toBe('on');
    expect(state?.textColor).toEqual({ state: 'uniform', value: 'red' });
  });

  it('restarts and then explicitly continues ordered numbering without coupling unrelated content', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li></ol>',
    );
    const restarted = applied(restartA4S2OrderedListAtSelection(
      canonical,
      caret(canonical, 'ol > li:nth-child(2) > p', 0),
      5,
    ));
    let body = bodyFor(restarted);
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(2);
    expect(body.querySelector(':scope > ol:nth-child(2)')?.getAttribute('start')).toBe('5');

    const continued = applied(continueA4S2OrderedList(
      restarted,
      caret(restarted, 'ol:nth-child(2) > li:first-child > p', 0),
    ));
    body = bodyFor(continued);
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C']);
  });
});
