import { describe, expect, it } from 'vitest';
import {
  applyA4S2Indent,
  continueA4S2OrderedList,
  getA4S2ContinueNumberingCapability,
  getA4S2ListIndentCapability,
  getA4S2NeutralTypingFormatPatch,
  indentA4S2ListItems,
  insertA4S2ParagraphBreak,
  normalizeA4S2IndentValue,
  outdentA4S2ListItems,
  readA4S2FormattingState,
  restartA4S2OrderedListAtSelection,
  setA4S2ListType,
} from '@/components/documents/a4-pagination/s2-semantics';
import { stripFlowMetadata } from '@/components/documents/a4-pagination/model';
import {
  captureA4Position,
  createCanonicalEditorDocument,
  type A4Position,
  type A4Selection,
  type A4TransactionResult,
  type CanonicalEditorDocument,
} from '@/components/documents/a4-pagination/structural-position';

function rootFor(canonical: CanonicalEditorDocument): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = canonical.internalHtml;
  return root;
}

function firstText(element: HTMLElement): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function position(
  canonical: CanonicalEditorDocument,
  selector: string,
  offset: number,
): A4Position {
  const root = rootFor(canonical);
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing selector: ${selector}`);
  const text = firstText(element);
  const point = text
    ? captureA4Position(root, text, offset, 'after')
    : captureA4Position(root, element, offset, 'after');
  if (!point) throw new Error(`Could not capture position: ${selector}`);
  return point;
}

function childPosition(
  canonical: CanonicalEditorDocument,
  selector: string,
  childIndex: number,
): A4Position {
  const root = rootFor(canonical);
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing selector: ${selector}`);
  const point = captureA4Position(root, element, childIndex, 'after');
  if (!point) throw new Error(`Could not capture child position: ${selector}`);
  return point;
}

function caret(
  canonical: CanonicalEditorDocument,
  selector: string,
  offset: number,
): A4Selection {
  const point = position(canonical, selector, offset);
  return { anchor: point, focus: point };
}

function childCaret(
  canonical: CanonicalEditorDocument,
  selector: string,
  childIndex: number,
): A4Selection {
  const point = childPosition(canonical, selector, childIndex);
  return { anchor: point, focus: point };
}

function selection(
  canonical: CanonicalEditorDocument,
  anchorSelector: string,
  anchorOffset: number,
  focusSelector: string,
  focusOffset: number,
): A4Selection {
  return {
    anchor: position(canonical, anchorSelector, anchorOffset),
    focus: position(canonical, focusSelector, focusOffset),
  };
}

function applied(result: A4TransactionResult): CanonicalEditorDocument {
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('Expected applied transaction');
  return result.document;
}

function clean(canonical: CanonicalEditorDocument): HTMLElement {
  const body = new DOMParser().parseFromString(
    stripFlowMetadata(canonical.internalHtml),
    'text/html',
  ).body;
  return body;
}

describe('A4 S2 Enter semantics', () => {
  it('splits a list item in DOM order and moves trailing nested descendants once', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p style="text-align:center;margin-left:1rem">ABCD</p><ul><li><p>Child</p></li></ul></li><li><p>Next</p></li></ol>',
    );
    const result = insertA4S2ParagraphBreak(
      canonical,
      caret(canonical, 'ol > li:first-child > p', 2),
    );
    const body = clean(applied(result));
    const items = body.querySelectorAll(':scope > ol > li');
    expect(items).toHaveLength(3);
    expect(items[0].querySelector(':scope > p')?.textContent).toBe('AB');
    expect(items[1].querySelector(':scope > p')?.textContent).toBe('CD');
    expect(items[1].querySelector(':scope > ul > li > p')?.textContent).toBe('Child');
    expect(items[2].querySelector(':scope > p')?.textContent).toBe('Next');
    expect((items[1].querySelector(':scope > p') as HTMLElement).style.textAlign).toBe('center');
    expect((items[1].querySelector(':scope > p') as HTMLElement).style.marginLeft).toBe('1rem');
  });

  it('creates body text after Enter at the end of a heading but keeps heading style mid-heading', () => {
    const endCanonical = createCanonicalEditorDocument(
      '<h2 style="text-align:center">Title</h2>',
    );
    const endBody = clean(applied(insertA4S2ParagraphBreak(
      endCanonical,
      caret(endCanonical, 'h2', 5),
    )));
    expect(Array.from(endBody.children, (node) => node.tagName)).toEqual(['H2', 'P']);
    expect((endBody.children[1] as HTMLElement).style.textAlign).toBe('center');

    const middleCanonical = createCanonicalEditorDocument('<h2>Title</h2>');
    const middleBody = clean(applied(insertA4S2ParagraphBreak(
      middleCanonical,
      caret(middleCanonical, 'h2', 2),
    )));
    expect(Array.from(middleBody.children, (node) => node.tagName)).toEqual(['H2', 'H2']);
    expect(Array.from(middleBody.children, (node) => node.textContent)).toEqual(['Ti', 'tle']);
  });

  it('lifts an empty nested item one level before allowing a top-level exit', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>Parent</p><ol><li><p><br></p></li></ol></li><li><p>After</p></li></ol>',
    );
    const result = insertA4S2ParagraphBreak(
      canonical,
      childCaret(canonical, 'ol > li:first-child > ol > li > p', 0),
    );
    const body = clean(applied(result));
    const outerItems = body.querySelectorAll(':scope > ol > li');
    expect(outerItems).toHaveLength(3);
    expect(outerItems[0].querySelector(':scope > p')?.textContent).toBe('Parent');
    expect(outerItems[1].querySelector(':scope > p')?.textContent).toBe('');
    expect(outerItems[2].querySelector(':scope > p')?.textContent).toBe('After');
    expect(body.querySelector(':scope > ol > li > ol')).toBeNull();
  });

  it('exits an empty top-level item and keeps trailing ordered numbering semantic', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol start="5"><li><p>A</p></li><li><p><br></p></li><li><p>C</p></li></ol>',
    );
    const result = insertA4S2ParagraphBreak(
      canonical,
      childCaret(canonical, 'ol > li:nth-child(2) > p', 0),
    );
    const body = clean(applied(result));
    expect(Array.from(body.children, (node) => node.tagName)).toEqual(['OL', 'P', 'OL']);
    expect(body.children[0].getAttribute('start')).toBe('5');
    expect(body.children[2].getAttribute('start')).toBe('7');
    expect(body.children[2].textContent).toBe('C');
  });

  it('preserves authored blank paragraphs instead of replacing the blank document', () => {
    const canonical = createCanonicalEditorDocument('<p><br></p><p><br></p>');
    const body = clean(applied(insertA4S2ParagraphBreak(
      canonical,
      childCaret(canonical, 'p:first-child', 0),
    )));
    expect(body.querySelectorAll(':scope > p')).toHaveLength(3);
  });

  it('rejects Enter inside a Unicode grapheme cluster', () => {
    const canonical = createCanonicalEditorDocument('<p>A👨‍👩‍👧‍👦B</p>');
    const result = insertA4S2ParagraphBreak(
      canonical,
      caret(canonical, 'p', 2),
    );
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.code).toBe('invalid-grapheme-boundary');
  });

  it('keeps a semantic hard break on the correct side of an Enter split', () => {
    const canonical = createCanonicalEditorDocument(
      '<p>A<span data-a4-break="page"></span>B</p>',
    );
    const result = insertA4S2ParagraphBreak(
      canonical,
      childCaret(canonical, 'p', 2),
    );
    const body = clean(applied(result));
    expect(body.querySelectorAll('[data-a4-break="page"]')).toHaveLength(1);
    expect(body.querySelectorAll(':scope > p')).toHaveLength(2);
    expect(body.children[0].textContent).toBe('A');
    expect(body.children[0].querySelector('[data-a4-break="page"]')).not.toBeNull();
    expect(body.children[1].textContent).toBe('B');
  });
});

describe('A4 S2 list conversion and level semantics', () => {
  it('converts only the selected middle item and preserves surrounding list segments', () => {
    const canonical = createCanonicalEditorDocument(
      '<ul><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li></ul>',
    );
    const body = clean(applied(setA4S2ListType(
      canonical,
      caret(canonical, 'ul > li:nth-child(2) > p', 0),
      'ordered',
    )));
    expect(Array.from(body.children, (node) => node.tagName)).toEqual(['UL', 'OL', 'UL']);
    expect(Array.from(body.children, (node) => node.textContent)).toEqual(['A', 'B', 'C']);
  });

  it('preserves ordered values on unselected segments when a middle item becomes unordered', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol start="5"><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li></ol>',
    );
    const body = clean(applied(setA4S2ListType(
      canonical,
      caret(canonical, 'ol > li:nth-child(2) > p', 0),
      'unordered',
    )));
    expect(Array.from(body.children, (node) => node.tagName)).toEqual(['OL', 'UL', 'OL']);
    expect(body.children[0].getAttribute('start')).toBe('5');
    expect(body.children[2].getAttribute('start')).toBe('7');
  });

  it('preserves meaningful alpha, bold-marker and start semantics across ordered type conversion', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol start="5" class="list-bold-numbers"><li><p>A</p></li></ol>',
    );
    const body = clean(applied(setA4S2ListType(
      canonical,
      caret(canonical, 'ol > li > p', 0),
      'alpha',
    )));
    const list = body.querySelector('ol')!;
    expect(list.classList.contains('list-alpha')).toBe(true);
    expect(list.classList.contains('list-bold-numbers')).toBe(true);
    expect(list.getAttribute('start')).toBe('5');
  });

  it('prepends adjacent paragraphs to a following list without reversing them', () => {
    const canonical = createCanonicalEditorDocument(
      '<p>A</p><p>B</p><ul><li><p>C</p></li></ul>',
    );
    const body = clean(applied(setA4S2ListType(
      canonical,
      selection(canonical, 'p:first-child', 0, 'p:nth-child(2)', 1),
      'unordered',
    )));
    expect(body.querySelectorAll(':scope > ul')).toHaveLength(1);
    expect(Array.from(body.querySelectorAll(':scope > ul > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C']);
  });

  it('joins both compatible adjacent lists around selected paragraphs in document order', () => {
    const canonical = createCanonicalEditorDocument(
      '<ul><li><p>A</p></li></ul><p>B</p><p>C</p><ul><li><p>D</p></li></ul>',
    );
    const body = clean(applied(setA4S2ListType(
      canonical,
      selection(canonical, 'p:nth-of-type(1)', 0, 'p:nth-of-type(2)', 1),
      'unordered',
    )));
    expect(body.querySelectorAll(':scope > ul')).toHaveLength(1);
    expect(Array.from(body.querySelectorAll(':scope > ul > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C', 'D']);
  });

  it('keeps document order for a backward paragraph selection', () => {
    const canonical = createCanonicalEditorDocument('<p>A</p><p>B</p><p>C</p>');
    const body = clean(applied(setA4S2ListType(
      canonical,
      selection(canonical, 'p:nth-child(3)', 1, 'p:first-child', 0),
      'ordered',
    )));
    expect(Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C']);
  });

  it('indents contiguous selected items beneath one owner without reversing them', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li><li><p>D</p></li></ol>',
    );
    const selected = selection(
      canonical,
      'ol > li:nth-child(2) > p',
      0,
      'ol > li:nth-child(3) > p',
      1,
    );
    const body = clean(applied(indentA4S2ListItems(canonical, selected)));
    expect(Array.from(body.querySelectorAll(':scope > ol > li'), (li) =>
      li.querySelector(':scope > p')?.textContent,
    )).toEqual(['A', 'D']);
    expect(Array.from(body.querySelectorAll(':scope > ol > li:first-child > ol > li'), (li) => li.textContent))
      .toEqual(['B', 'C']);
  });

  it('reports first-item indent as unavailable and leaves content unchanged', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p></li><li><p>B</p></li></ol>',
    );
    const selected = caret(canonical, 'ol > li:first-child > p', 0);
    expect(getA4S2ListIndentCapability(canonical, selected, 'indent')).toMatchObject({
      applicable: false,
      code: 'first-item-cannot-indent',
    });
    expect(indentA4S2ListItems(canonical, selected).status).toBe('unchanged');
  });

  it('outdents contiguous nested items in their original order', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p><ol><li><p>B</p></li><li><p>C</p></li></ol></li><li><p>D</p></li></ol>',
    );
    const selected = selection(
      canonical,
      'ol > li:first-child > ol > li:first-child > p',
      0,
      'ol > li:first-child > ol > li:nth-child(2) > p',
      1,
    );
    const body = clean(applied(outdentA4S2ListItems(canonical, selected)));
    expect(Array.from(body.querySelectorAll(':scope > ol > li'), (li) =>
      li.querySelector(':scope > p')?.textContent,
    )).toEqual(['A', 'B', 'C', 'D']);
    expect(body.querySelector(':scope > ol > li > ol')).toBeNull();
  });

  it('reports outermost outdent as unavailable', () => {
    const canonical = createCanonicalEditorDocument('<ul><li><p>A</p></li></ul>');
    expect(getA4S2ListIndentCapability(
      canonical,
      caret(canonical, 'ul > li > p', 0),
      'outdent',
    )).toMatchObject({
      applicable: false,
      code: 'outermost-item-cannot-outdent',
    });
  });
});

describe('A4 S2 numbering semantics', () => {
  it('restarts numbering from a selected middle item by splitting the sequence', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li></ol>',
    );
    const body = clean(applied(restartA4S2OrderedListAtSelection(
      canonical,
      caret(canonical, 'ol > li:nth-child(2) > p', 0),
      5,
    )));
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(2);
    expect(Array.from(body.querySelectorAll(':scope > ol:first-child > li'), (li) => li.textContent))
      .toEqual(['A']);
    expect(body.querySelector(':scope > ol:nth-child(2)')?.getAttribute('start')).toBe('5');
    expect(Array.from(body.querySelectorAll(':scope > ol:nth-child(2) > li'), (li) => li.textContent))
      .toEqual(['B', 'C']);
  });

  it('continues an immediately preceding compatible ordered list explicitly', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol start="5"><li><p>A</p></li></ol><ol start="10"><li><p>B</p></li></ol>',
    );
    const selected = caret(canonical, 'ol:nth-child(2) > li > p', 0);
    expect(getA4S2ContinueNumberingCapability(canonical, selected).applicable).toBe(true);
    const body = clean(applied(continueA4S2OrderedList(canonical, selected)));
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(body.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent)).toEqual(['A', 'B']);
  });

  it('does not couple independent lists across intervening content', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol><li><p>A</p></li></ol><p>Gap</p><ol><li><p>B</p></li></ol>',
    );
    const capability = getA4S2ContinueNumberingCapability(
      canonical,
      caret(canonical, 'ol:nth-of-type(2) > li > p', 0),
    );
    expect(capability).toMatchObject({ applicable: false, code: 'no-continuation-source' });
  });
});

describe('A4 S2 indentation units and formatting state', () => {
  const metrics = { emPx: 12, remPx: 16, maxIndentPx: 120 };

  it('treats rem as rem and uses measured em/root sizes for the step', () => {
    expect(normalizeA4S2IndentValue('1rem', 'indent', metrics)).toEqual({
      changed: true,
      value: '2.5rem',
    });
  });

  it('preserves unsupported legacy indent expressions unchanged', () => {
    expect(normalizeA4S2IndentValue('calc(1em + 2px)', 'indent', metrics)).toEqual({
      changed: false,
      value: 'calc(1em + 2px)',
      code: 'unsupported-indent-unit',
    });
  });

  it('prevents indentation beyond the measured usable width', () => {
    expect(normalizeA4S2IndentValue('7em', 'indent', metrics)).toMatchObject({
      changed: false,
      code: 'indent-limit-reached',
    });
  });

  it('uses list level changes for lists and measured margin steps for ordinary paragraphs', () => {
    const listCanonical = createCanonicalEditorDocument(
      '<ul><li><p>A</p></li><li><p>B</p></li></ul>',
    );
    const listBody = clean(applied(applyA4S2Indent(
      listCanonical,
      caret(listCanonical, 'ul > li:nth-child(2) > p', 0),
      'indent',
      metrics,
    )));
    expect(listBody.querySelector('ul > li > ul > li > p')?.textContent).toBe('B');
    expect(listBody.querySelector<HTMLElement>('ul > li > ul > li')?.style.marginLeft).toBe('');

    const paragraphCanonical = createCanonicalEditorDocument('<p style="margin-left:1rem">A</p>');
    const paragraphBody = clean(applied(applyA4S2Indent(
      paragraphCanonical,
      caret(paragraphCanonical, 'p', 0),
      'indent',
      metrics,
    )));
    expect((paragraphBody.querySelector('p') as HTMLElement).style.marginLeft).toBe('2.5rem');
  });

  it('reports mixed bold independently from uniform italic and color state', () => {
    const canonical = createCanonicalEditorDocument(
      '<p><span style="font-weight:bold;font-style:italic;color:red">A</span><span style="font-style:italic;color:red">B</span></p>',
    );
    const state = readA4S2FormattingState(
      canonical,
      selection(canonical, 'p', 0, 'p', 2),
    );
    expect(state).not.toBeNull();
    expect(state?.bold).toBe('mixed');
    expect(state?.italic).toBe('on');
    expect(state?.textColor).toEqual({ state: 'uniform', value: 'red' });
  });

  it('exports the neutral typing patch CORE needs for collapsed Clear formatting', () => {
    expect(getA4S2NeutralTypingFormatPatch()).toEqual({
      fontFamily: null,
      fontSize: null,
      color: null,
      backgroundColor: null,
      fontWeight: null,
      fontStyle: null,
      textDecoration: null,
    });
  });
});
