import { describe, expect, it } from 'vitest';
import { applyInlineFormat } from '@/components/documents/a4-pagination/formatting';
import { hydrateFlowHtml, stripFlowMetadata } from '@/components/documents/a4-pagination/model';
import {
  captureA4Position,
  createCanonicalEditorDocument,
  type A4Position,
  type A4Selection,
  type A4TransactionResult,
  type CanonicalEditorDocument,
} from '@/components/documents/a4-pagination/structural-position';
import { setA4S2ListType } from '@/components/documents/a4-pagination/s2-semantics';

function rootFor(canonical: CanonicalEditorDocument): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = canonical.internalHtml;
  return root;
}

function position(canonical: CanonicalEditorDocument, selector: string, offset: number): A4Position {
  const root = rootFor(canonical);
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing selector: ${selector}`);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode();
  if (!(text instanceof Text)) throw new Error(`Missing text node: ${selector}`);
  const captured = captureA4Position(root, text, offset, 'after');
  if (!captured) throw new Error(`Could not capture position: ${selector}`);
  return captured;
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

function clean(result: A4TransactionResult): HTMLElement {
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('Expected applied transaction');
  return new DOMParser().parseFromString(
    stripFlowMetadata(result.document.internalHtml),
    'text/html',
  ).body;
}

describe('A4 S2 adjacent list conversion regressions', () => {
  it('appends selected paragraphs to a preceding ordered list in reading order', () => {
    const canonical = createCanonicalEditorDocument(
      '<ol start="5"><li><p>A</p></li></ol><p>B</p><p>C</p>',
    );
    const body = clean(setA4S2ListType(
      canonical,
      selection(canonical, ':scope > p:first-of-type', 0, ':scope > p:nth-of-type(2)', 1),
      'ordered',
    ));
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(body.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C']);
  });

  it('prepends selected paragraphs to a following ordered list without reversing them', () => {
    const canonical = createCanonicalEditorDocument(
      '<p>A</p><p>B</p><ol start="3"><li><p>C</p></li></ol>',
    );
    const body = clean(setA4S2ListType(
      canonical,
      selection(canonical, ':scope > p:first-child', 0, ':scope > p:nth-child(2)', 1),
      'ordered',
    ));
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(body.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C']);
  });

  it('bridges compatible ordered lists and removes incompatible per-item values on unordered conversion', () => {
    const bridge = createCanonicalEditorDocument(
      '<ol start="5"><li><p>A</p></li></ol><p>B</p><p>C</p><ol start="8"><li><p>D</p></li></ol>',
    );
    const bridged = clean(setA4S2ListType(
      bridge,
      selection(bridge, ':scope > p:first-of-type', 0, ':scope > p:nth-of-type(2)', 1),
      'ordered',
    ));
    expect(bridged.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(Array.from(bridged.querySelectorAll('ol > li'), (li) => li.textContent))
      .toEqual(['A', 'B', 'C', 'D']);

    const conversion = createCanonicalEditorDocument(
      '<ol start="5"><li><p>A</p></li><li value="20"><p>B</p></li><li><p>C</p></li></ol>',
    );
    const converted = clean(setA4S2ListType(
      conversion,
      selection(conversion, 'ol > li:nth-child(2) > p', 0, 'ol > li:nth-child(2) > p', 1),
      'unordered',
    ));
    expect(converted.querySelector('ul > li')?.hasAttribute('value')).toBe(false);
  });
});

describe('A4 S2 selective formatting regression', () => {
  it('turns bold off only inside the selected range while preserving italic/color and outside bold', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight:bold;font-style:italic;color:red">ABCDE</span></p>',
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html').body;
    const paragraph = parsed.querySelector<HTMLElement>('p[data-flow-id]');
    if (!paragraph?.dataset.flowId) throw new Error('Missing paragraph flow id');

    const result = applyInlineFormat(
      html,
      {
        anchor: { flowId: paragraph.dataset.flowId, offset: 1 },
        focus: { flowId: paragraph.dataset.flowId, offset: 4 },
        collapsed: false,
      },
      { fontWeight: null },
    );
    expect(result.changed).toBe(true);
    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    const selected = Array.from(body.querySelectorAll<HTMLElement>('span'))
      .find((span) => span.textContent === 'BCD');
    expect(selected).toBeDefined();
    expect(selected?.style.fontWeight).toBe('');
    expect(selected?.style.fontStyle).toBe('italic');
    expect(selected?.style.color).toBe('red');

    const outside = Array.from(body.querySelectorAll<HTMLElement>('span'))
      .filter((span) => span.textContent === 'A' || span.textContent === 'E');
    expect(outside).toHaveLength(2);
    outside.forEach((span) => {
      expect(span.style.fontWeight).toBe('bold');
      expect(span.style.fontStyle).toBe('italic');
      expect(span.style.color).toBe('red');
    });
  });
});
