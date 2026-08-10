import { describe, expect, it } from 'vitest';
import {
  applyBlockAlignmentToSelection,
  applyInlineFormat,
  applyBlockFormatToSelection,
  applyIndentToSelection,
  applyListToSelection,
  applyOutdentToSelection,
  clearInlineFormatting,
  insertTextWithFormat,
  normalizeColorValue,
  normalizeFormattingSpans,
  readInlineToggleState,
  readLogicalFormatState,
  replaceFormattedSelection,
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

  it('inserts cancelled bold text at the middle caret boundary', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight:bold">abc</span></p>',
    );
    const point = collapsedPoint(html, 1);
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
    expect(body.textContent).toBe('aXbc');
    expect(Array.from(body.querySelectorAll('span'), (span) => span.textContent))
      .toEqual(['a', 'bc']);
  });

  it('inserts active bold text at the middle caret boundary', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight:bold">abc</span></p>',
    );
    const point = collapsedPoint(html, 1);
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
    expect(body.textContent).toBe('aXbc');
    const boldSpan = Array.from(body.querySelectorAll('span')).find(
      (span) => span.style.fontWeight === 'bold',
    )!;
    expect(boldSpan.textContent).toBe('aXbc');
  });

  const caretCases = [
    {
      wrapper: '<strong>abc</strong>',
      property: 'fontWeight',
      offset: 0,
      expectedText: 'Xabc',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<strong>abc</strong>',
      property: 'fontWeight',
      offset: 1,
      expectedText: 'aXbc',
      expectedSpans: ['a', 'bc'],
    },
    {
      wrapper: '<strong>abc</strong>',
      property: 'fontWeight',
      offset: 3,
      expectedText: 'abcX',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<em>abc</em>',
      property: 'fontStyle',
      offset: 0,
      expectedText: 'Xabc',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<em>abc</em>',
      property: 'fontStyle',
      offset: 1,
      expectedText: 'aXbc',
      expectedSpans: ['a', 'bc'],
    },
    {
      wrapper: '<em>abc</em>',
      property: 'fontStyle',
      offset: 3,
      expectedText: 'abcX',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<u>abc</u>',
      property: 'textDecoration',
      offset: 0,
      expectedText: 'Xabc',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<u>abc</u>',
      property: 'textDecoration',
      offset: 1,
      expectedText: 'aXbc',
      expectedSpans: ['a', 'bc'],
    },
    {
      wrapper: '<u>abc</u>',
      property: 'textDecoration',
      offset: 3,
      expectedText: 'abcX',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<span style="font-weight:bold">abc</span>',
      property: 'fontWeight',
      offset: 0,
      expectedText: 'Xabc',
      expectedSpans: ['abc'],
    },
    {
      wrapper: '<span style="font-weight:bold">abc</span>',
      property: 'fontWeight',
      offset: 1,
      expectedText: 'aXbc',
      expectedSpans: ['a', 'bc'],
    },
    {
      wrapper: '<span style="font-weight:bold">abc</span>',
      property: 'fontWeight',
      offset: 3,
      expectedText: 'abcX',
      expectedSpans: ['abc'],
    },
  ];

  it.each(caretCases)(
    'inserts cancelled text at the caret boundary inside $wrapper at offset $offset',
    ({ wrapper, property, offset, expectedText, expectedSpans }) => {
      const html = hydrateFlowHtml(`<p>${wrapper}</p>`);
      const point = collapsedPoint(html, offset);
      const result = insertTextWithFormat(
        html,
        {
          anchor: point,
          focus: point,
          collapsed: true,
        },
        'X',
        { [property]: null },
      );
      const body = parseBody(result.html);
      expect(body.textContent).toBe(expectedText);
      const wrappers = Array.from(
        body.querySelectorAll('strong,em,u,span'),
        (element) => element.textContent,
      );
      expect(wrappers).toEqual(expectedSpans);
    },
  );

  it('escapes only the cancelled property inside nested colour and italic wrappers', () => {
    const html = hydrateFlowHtml(
      '<p><span style="color:red;font-style:italic"><span style="font-weight:bold">abc</span></span></p>',
    );
    const point = collapsedPoint(html, 1);
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
    expect(body.textContent).toBe('aXbc');
    const boldSpans = Array.from(body.querySelectorAll('span')).filter(
      (span) => span.style.fontWeight === 'bold',
    );
    expect(boldSpans.map((span) => span.textContent)).toEqual(['a', 'bc']);
    const outer = body.querySelector<HTMLElement>('span[style*="color"]')!;
    expect(outer.style.fontStyle).toBe('italic');
    expect(normalizeColorValue(outer.style.color)).toBe('#ff0000');
  });

  it('clears formatting only inside the selected substring', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight: bold">abcdef</span></p>',
    );
    const flowId = parseBody(html).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const result = clearInlineFormatting(
      html,
      {
        anchor: { flowId, offset: 2 },
        focus: { flowId, offset: 4 },
        collapsed: false,
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

  it('removes only the requested inline property', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight:bold;color:red;font-style:italic">abcdef</span></p>',
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
      { fontWeight: null },
    );
    const selected = Array.from(parseBody(result.html).querySelectorAll('span'))
      .find((span) => span.textContent === 'cd')!;
    expect(selected.style.fontWeight).toBe('');
    expect(selected.style.fontStyle).toBe('italic');
    expect(normalizeColorValue(selected.style.color)).toBe('#ff0000');
  });

  it.each([
    ['fontFamily', 'font-family', 'Georgia, serif'],
    ['fontSize', 'font-size', '14pt'],
    ['color', 'color', '#ff0000'],
    ['backgroundColor', 'background-color', '#ffff00'],
    ['fontWeight', 'font-weight', 'bold'],
    ['fontStyle', 'font-style', 'italic'],
    ['textDecoration', 'text-decoration', 'underline'],
  ])(
    'removes only the %s property when it is nulled',
    (key, cssProperty, appliedValue) => {
      const preservedProperty =
        key === 'fontStyle' ? 'color' : 'font-style';
      const preservedValue = key === 'fontStyle' ? '#ff0000' : 'italic';
      const html = hydrateFlowHtml(
        `<p><span style="${cssProperty}:${appliedValue};${preservedProperty}:${preservedValue}">abcdef</span></p>`,
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
        { [key]: null },
      );
      const selected = Array.from(
        parseBody(result.html).querySelectorAll('span'),
      ).find((span) => span.textContent === 'cd')!;
      expect(selected.style.getPropertyValue(cssProperty)).toBe('');
      if (preservedProperty === 'color') {
        expect(normalizeColorValue(selected.style.color)).toBe('#ff0000');
      } else {
        expect(selected.style.fontStyle).toBe('italic');
      }
    },
  );

  it('reports uniform on, uniform off, and mixed inline toggle states', () => {
    const onHtml = hydrateFlowHtml(
      '<p><span style="font-weight:bold">abc</span></p>',
    );
    const onFlowId = parseBody(onHtml).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const onRoot = document.createElement('div');
    onRoot.innerHTML = onHtml;
    expect(
      readInlineToggleState(
        onRoot,
        {
          anchor: { flowId: onFlowId, offset: 0 },
          focus: { flowId: onFlowId, offset: 3 },
          collapsed: false,
        },
        'bold',
      ),
    ).toBe('on');

    const offHtml = hydrateFlowHtml('<p>abc</p>');
    const offFlowId = parseBody(offHtml).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const offRoot = document.createElement('div');
    offRoot.innerHTML = offHtml;
    expect(
      readInlineToggleState(
        offRoot,
        {
          anchor: { flowId: offFlowId, offset: 0 },
          focus: { flowId: offFlowId, offset: 3 },
          collapsed: false,
        },
        'bold',
      ),
    ).toBe('off');

    const mixedHtml = hydrateFlowHtml(
      '<p><span style="font-weight:bold">ab</span>cd</p>',
    );
    const mixedFlowId = parseBody(mixedHtml).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const mixedRoot = document.createElement('div');
    mixedRoot.innerHTML = mixedHtml;
    expect(
      readInlineToggleState(
        mixedRoot,
        {
          anchor: { flowId: mixedFlowId, offset: 0 },
          focus: { flowId: mixedFlowId, offset: 4 },
          collapsed: false,
        },
        'bold',
      ),
    ).toBe('mixed');
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

  it('groups adjacent blocks into one editable list and toggles it off', () => {
    const html = hydrateFlowHtml('<p>One</p><p>Two</p>');
    const ids = parseBody(html).querySelectorAll<HTMLElement>('[data-flow-id]');
    const selection = {
      anchor: { flowId: ids[0].dataset.flowId!, offset: 0 },
      focus: { flowId: ids[1].dataset.flowId!, offset: 3 },
      collapsed: false,
    };
    const listed = applyListToSelection(html, selection, 'unordered');
    const listedBody = parseBody(listed.html);
    expect(listedBody.querySelectorAll(':scope > ul')).toHaveLength(1);
    expect(
      Array.from(listedBody.querySelectorAll('ul > li'), (li) => li.textContent),
    ).toEqual(['One', 'Two']);
    expect(listedBody.querySelectorAll('ul > li > p')).toHaveLength(2);

    const unlisted = applyListToSelection(
      listed.html,
      listed.selection!,
      'unordered',
    );
    expect(Array.from(parseBody(unlisted.html).children, (node) => node.tagName))
      .toEqual(['P', 'P']);
  });

  it('groups adjacent blocks from a reversed selection into one list', () => {
    const html = hydrateFlowHtml('<p>One</p><p>Two</p>');
    const ids = parseBody(html).querySelectorAll<HTMLElement>('[data-flow-id]');
    const selection = {
      anchor: { flowId: ids[1].dataset.flowId!, offset: 3 },
      focus: { flowId: ids[0].dataset.flowId!, offset: 0 },
      collapsed: false,
    };
    const listed = applyListToSelection(html, selection, 'ordered');
    const body = parseBody(listed.html);
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(
      Array.from(body.querySelectorAll('ol > li'), (li) => li.textContent),
    ).toEqual(['One', 'Two']);
    expect(body.querySelectorAll('ol > li > p')).toHaveLength(2);
    expect(listed.selection).toEqual(selection);
  });

  it('resolves collapsed caret commands inside a legacy list item', () => {
    const html = hydrateFlowHtml('<ul><li>Item</li></ul>');
    const liId = parseBody(html).querySelector<HTMLElement>(
      'li',
    )!.dataset.flowId!;
    const caret = {
      anchor: { flowId: liId, offset: 0 },
      focus: { flowId: liId, offset: 0 },
      collapsed: true,
    };

    const aligned = applyBlockAlignmentToSelection(html, caret, 'center');
    const body = parseBody(aligned.html);
    expect(body.querySelector<HTMLElement>('ul > li > p')).not.toBeNull();
    expect(body.querySelector<HTMLElement>('ul > li > p')!.style.textAlign).toBe(
      'center',
    );
    expect(aligned.changed).toBe(true);
  });

  it('toggles off only the selected item and preserves the remaining list', () => {
    const html = hydrateFlowHtml('<ul><li>One</li><li>Two</li></ul>');
    const ids = parseBody(html).querySelectorAll<HTMLElement>('li');
    const result = applyListToSelection(
      html,
      {
        anchor: { flowId: ids[0].dataset.flowId!, offset: 0 },
        focus: { flowId: ids[0].dataset.flowId!, offset: 3 },
        collapsed: false,
      },
      'unordered',
    );
    const body = parseBody(result.html);
    expect(Array.from(body.children, (node) => node.tagName)).toEqual([
      'P',
      'UL',
    ]);
    expect(body.querySelector('p')!.textContent).toBe('One');
    expect(body.querySelectorAll('ul > li > p')).toHaveLength(1);
    expect(body.querySelector('ul > li > p')!.textContent).toBe('Two');
  });

  it('joins adjacent paragraphs into an existing matching list', () => {
    const html = hydrateFlowHtml(
      '<p>Before</p><ul><li>One</li></ul><p>After</p>',
    );
    const ids = parseBody(html).querySelectorAll<HTMLElement>('[data-flow-id]');
    const beforeId = ids[0].dataset.flowId!;
    const liId = Array.from(ids).find(
      (element) => element.tagName === 'LI',
    )!.dataset.flowId!;
    const selection = {
      anchor: { flowId: beforeId, offset: 0 },
      focus: { flowId: liId, offset: 3 },
      collapsed: false,
    };
    const listed = applyListToSelection(html, selection, 'unordered');
    const body = parseBody(listed.html);
    expect(body.querySelectorAll(':scope > ul')).toHaveLength(1);
    expect(
      Array.from(body.querySelectorAll('ul > li'), (li) => li.textContent),
    ).toEqual(['Before', 'One']);
    expect(body.querySelectorAll('ul > li > p')).toHaveLength(2);
    expect(body.textContent).toBe('BeforeOneAfter');
  });

  it('preserves inline formatting when creating a list', () => {
    const html = hydrateFlowHtml(
      '<p><span style="font-weight:bold">One</span></p><p>Two</p>',
    );
    const ids = parseBody(html).querySelectorAll<HTMLElement>('[data-flow-id]');
    const listed = applyListToSelection(
      html,
      {
        anchor: { flowId: ids[0].dataset.flowId!, offset: 0 },
        focus: { flowId: ids[1].dataset.flowId!, offset: 3 },
        collapsed: false,
      },
      'unordered',
    );
    const body = parseBody(listed.html);
    expect(body.textContent).toBe('OneTwo');
    expect(
      body.querySelector('ul > li > p > span[style*="font-weight"]')
        ?.textContent,
    ).toBe('One');
  });

  it('switches list type while retaining items, content, and flow ids', () => {
    const html = hydrateFlowHtml('<ul><li>One</li></ul>');
    const liId = parseBody(html).querySelector<HTMLElement>(
      'li',
    )!.dataset.flowId!;
    const caret = {
      anchor: { flowId: liId, offset: 0 },
      focus: { flowId: liId, offset: 0 },
      collapsed: true,
    };
    const result = applyListToSelection(html, caret, 'ordered');
    const body = parseBody(result.html);
    expect(body.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(body.querySelector<HTMLElement>('ol > li')!.dataset.flowId).toBe(
      liId,
    );
    expect(body.querySelector<HTMLElement>('ol > li > p')!.textContent).toBe(
      'One',
    );
  });

  it('applies alignment, indent, outdent, and paragraph style inside list items', () => {
    const html = hydrateFlowHtml('<ul><li>Item</li></ul>');
    const liId = parseBody(html).querySelector<HTMLElement>(
      'li',
    )!.dataset.flowId!;
    const caret = {
      anchor: { flowId: liId, offset: 0 },
      focus: { flowId: liId, offset: 0 },
      collapsed: true,
    };

    const aligned = applyBlockAlignmentToSelection(html, caret, 'center');
    const indented = applyIndentToSelection(aligned.html, caret);
    const indentedBody = parseBody(indented.html);
    expect(
      indentedBody.querySelector<HTMLElement>('ul > li > p')!.style.textAlign,
    ).toBe('center');
    expect(
      indentedBody.querySelector<HTMLElement>('ul > li > p')!.style.marginLeft,
    ).toBe('2em');

    const outdented = applyOutdentToSelection(indented.html, caret);
    const outdentedBody = parseBody(outdented.html);
    expect(
      outdentedBody.querySelector<HTMLElement>('ul > li > p')!.style.marginLeft,
    ).toBe('');
    expect(outdentedBody.querySelector('ul')).not.toBeNull();

    const headed = applyBlockFormatToSelection(outdented.html, caret, 'h1');
    const headedBody = parseBody(headed.html);
    expect(headedBody.querySelector('ul > li > h1')!.textContent).toBe('Item');
    expect(headedBody.querySelectorAll('ul > li > p')).toHaveLength(0);
  });

  it('clears inline and paragraph formatting inside a list item without removing the list', () => {
    const html = hydrateFlowHtml(
      '<ul><li><p style="text-align:center"><span style="font-weight:bold">Item</span></p></li></ul>',
    );
    const liId = parseBody(html).querySelector<HTMLElement>(
      'li',
    )!.dataset.flowId!;
    const result = clearInlineFormatting(html, {
      anchor: { flowId: liId, offset: 0 },
      focus: { flowId: liId, offset: 4 },
      collapsed: false,
    });
    const body = parseBody(result.html);
    expect(body.querySelector('ul')).not.toBeNull();
    const paragraph = body.querySelector('ul > li > p')!;
    expect(paragraph).not.toBeNull();
    expect(paragraph.hasAttribute('style')).toBe(false);
    expect(paragraph.querySelector('span')).toBeNull();
    expect(body.textContent).toBe('Item');
  });

  it('reports changed false when indent, outdent, or alignment is already at target', () => {
    const html = hydrateFlowHtml(
      '<ul><li><p style="margin-left:2em;text-align:center">Item</p></li></ul>',
    );
    const liId = parseBody(html).querySelector<HTMLElement>(
      'li',
    )!.dataset.flowId!;
    const caret = {
      anchor: { flowId: liId, offset: 0 },
      focus: { flowId: liId, offset: 0 },
      collapsed: true,
    };

    expect(applyIndentToSelection(html, caret).changed).toBe(false);
    expect(applyOutdentToSelection(html, caret).changed).toBe(true);
    expect(applyBlockAlignmentToSelection(html, caret, 'center').changed).toBe(
      false,
    );

    const plain = hydrateFlowHtml('<ul><li>Item</li></ul>');
    const plainLiId = parseBody(plain).querySelector<HTMLElement>(
      'li',
    )!.dataset.flowId!;
    const plainCaret = {
      anchor: { flowId: plainLiId, offset: 0 },
      focus: { flowId: plainLiId, offset: 0 },
      collapsed: true,
    };
    const first = applyIndentToSelection(plain, plainCaret);
    expect(first.changed).toBe(true);
    expect(applyIndentToSelection(first.html, plainCaret).changed).toBe(false);
  });

  it('formats only text descendants when replacing with a block-rich fragment', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = parseBody(html).querySelector<HTMLElement>(
      '[data-flow-id]',
    )!.dataset.flowId!;
    const result = replaceFormattedSelection(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 5 },
        collapsed: true,
      },
      '<table><tbody><tr><td>Cell</td></tr></tbody></table>',
      { fontWeight: 'bold' },
    );
    const body = parseBody(result.html);
    expect(
      body.querySelector('span > table, span > ul, span > ol, span > hr'),
    ).toBeNull();
    expect(Array.from(body.children, (node) => node.tagName)).toEqual([
      'P',
      'TABLE',
      'P',
    ]);
    expect(body.textContent).toBe('AlphaCellBeta');
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
