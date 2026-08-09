import { describe, expect, it } from 'vitest';
import {
  applyInlineFormat,
  applyBlockFormatToSelection,
  insertTextWithFormat,
  normalizeColorValue,
  normalizeFormattingSpans,
  readLogicalFormatState,
} from '@/components/documents/a4-pagination/formatting';
import { hydrateFlowHtml } from '@/components/documents/a4-pagination/model';

function flowIds(html: string): [string, string] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const ids = Array.from(
    body.querySelectorAll<HTMLElement>('[data-flow-id]'),
    (element) => element.dataset.flowId!,
  );
  return [ids[0], ids[1]];
}

function parseBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

function collapsedPoint(
  html: string,
  offset: number,
): { flowId: string; offset: number; collapsed: true } {
  const flowId = parseBody(html).querySelector<HTMLElement>(
    '[data-flow-id]',
  )!.dataset.flowId!;
  return { flowId, offset, collapsed: true };
}

describe('A4 inline formatting transactions', () => {
  it('colours text across two flow blocks without wrapping block elements', () => {
    const html = hydrateFlowHtml('<p>Alpha</p><p>Beta</p>');
    const [first, second] = flowIds(html);
    const result = applyInlineFormat(
      html,
      {
        anchor: { flowId: first, offset: 2 },
        focus: { flowId: second, offset: 2 },
        collapsed: false,
      },
      { color: '#ff0000' },
    );

    const body = parseBody(result.html);
    expect(body.querySelector('span > p')).toBeNull();
    expect(body.querySelectorAll('span[style*="color"]')).toHaveLength(2);
    expect(body.textContent).toBe('AlphaBeta');
  });

  it('merges adjacent spans with the same normalized style', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><span style="font-size: 14pt">A</span><span style="font-size:14pt">B</span></p>';
    normalizeFormattingSpans(root);
    expect(root.querySelectorAll('span')).toHaveLength(1);
    expect(root.textContent).toBe('AB');
  });

  it('applies a pending bold format to text typed at a collapsed caret', () => {
    const html = hydrateFlowHtml('<p>Alpha</p>');
    const point = collapsedPoint(html, 5);
    const result = insertTextWithFormat(
      html,
      {
        anchor: point,
        focus: point,
        collapsed: true,
      },
      'X',
      { fontWeight: 'bold' },
    );

    const body = parseBody(result.html);
    const bold = body.querySelector('span[style*="font-weight"]');
    expect(bold?.textContent).toBe('X');
    expect(body.textContent).toBe('AlphaX');
    expect(result.selection?.collapsed).toBe(true);
    expect(result.changed).toBe(true);
  });

  it('turns bold off for text typed at a caret inside a bold wrapper', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight: bold">abc</span></p>',
    );
    const point = collapsedPoint(html, 3);
    const result = insertTextWithFormat(
      html,
      {
        anchor: point,
        focus: point,
        collapsed: true,
      },
      'X',
      { fontWeight: null },
    );

    const body = parseBody(result.html);
    const boldSpans = body.querySelectorAll('span[style*="font-weight"]');
    expect(boldSpans).toHaveLength(1);
    expect(boldSpans[0].textContent).toBe('abc');
    const paragraph = body.querySelector('p');
    expect(paragraph?.lastChild?.textContent).toBe('X');
    expect(paragraph?.lastChild?.parentElement?.tagName).toBe('P');
    expect(body.textContent).toBe('abcX');
  });

  it('clears formatting only inside the selected substring', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight: bold">abcdef</span></p>',
    );
    const flowId = parseBody(html).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const result = applyInlineFormat(
      html,
      {
        anchor: { flowId, offset: 2 },
        focus: { flowId, offset: 4 },
        collapsed: false,
      },
      {
        fontFamily: null,
        fontSize: null,
        color: null,
        backgroundColor: null,
        fontWeight: null,
        fontStyle: null,
        textDecoration: null,
      },
    );

    const body = parseBody(result.html);
    expect(body.textContent).toBe('abcdef');
    const spans = body.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe('ab');
    expect(spans[1].textContent).toBe('ef');
    expect(
      Array.from(spans, (span) =>
        (span.getAttribute('style') ?? '').replace(/;\s*$/, ''),
      ),
    ).toEqual(['font-weight: bold', 'font-weight: bold']);
  });

  it('normalizes rgb, named, and shorthand colours for controlled inputs', () => {
    expect(normalizeColorValue('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColorValue('#abc')).toBe('#aabbcc');
    expect(normalizeColorValue('Red')).toBe('#ff0000');

    const html = hydrateFlowHtml(
      '<p><span style="color: red; background-color: rgb(255, 255, 0)">Text</span></p>',
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    const state = readLogicalFormatState(root, {
      anchor: collapsedPoint(html, 0),
      focus: collapsedPoint(html, 0),
      collapsed: true,
    });
    expect(state.textColor).toBe('#ff0000');
    expect(state.highlightColor).toBe('#ffff00');
  });

  it('applies a paragraph style to every intersected block and keeps the bookmark', () => {
    const html = hydrateFlowHtml('<p>One</p><p>Two</p>');
    const ids = parseBody(html).querySelectorAll<HTMLElement>('[data-flow-id]');
    const selection = {
      anchor: { flowId: ids[0].dataset.flowId!, offset: 1 },
      focus: { flowId: ids[1].dataset.flowId!, offset: 1 },
      collapsed: false,
    };

    const result = applyBlockFormatToSelection(html, selection, 'h1');
    const body = parseBody(result.html);
    const headings = body.querySelectorAll('h1');
    expect(headings).toHaveLength(2);
    expect(headings[0].textContent).toBe('One');
    expect(headings[1].textContent).toBe('Two');
    expect(result.selection).toEqual(selection);
    expect(result.changed).toBe(true);
  });

  it('applies inline formatting to a reversed selection without moving boundaries', () => {
    const html = hydrateFlowHtml('<p>Alpha</p>');
    const flowId = parseBody(html).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const result = applyInlineFormat(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 1 },
        collapsed: false,
      },
      { color: '#ff0000' },
    );

    expect(result.selection?.anchor.offset).toBe(5);
    expect(result.selection?.focus.offset).toBe(1);
    expect(
      parseBody(result.html).querySelector('span[style*="color"]')?.textContent,
    ).toBe('lpha');
  });
});
