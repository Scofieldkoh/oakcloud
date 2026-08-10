import { describe, expect, it } from 'vitest';
import {
  appendHardPage,
  applyLogicalDelete,
  deleteHardPageSection,
  hardSectionIndexForFragment,
  insertHardPageAtSelection,
  insertParagraphAtSelection,
  replaceLogicalSelection,
} from '@/components/documents/a4-pagination/document-actions';
import {
  HARD_PAGE_BREAK_HTML,
  ensureEditableCanonicalHtml,
  hydrateFlowHtml,
  stripFlowMetadata,
} from '@/components/documents/a4-pagination/model';
import type { FlowSelectionBookmark } from '@/components/documents/a4-pagination/selection';

function collapsed(flowId: string, offset: number): FlowSelectionBookmark {
  const point = { flowId, offset };
  return { anchor: point, focus: point, collapsed: true };
}

describe('A4 canonical document actions', () => {
  it('forward Delete removes the next character at a soft page boundary', () => {
    const result = applyLogicalDelete(
      '<p data-flow-id="a">One</p><p data-flow-id="b">Two</p>',
      collapsed('a', 3),
      'forward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>One</p><p>wo</p>');
    expect(result.selection).toEqual(collapsed('a', 3));
    expect(result.changed).toBe(true);
  });

  it('backward Delete removes the previous character at a soft page boundary', () => {
    const result = applyLogicalDelete(
      '<p data-flow-id="a">One</p><p data-flow-id="b">Two</p>',
      collapsed('b', 0),
      'backward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>On</p><p>Two</p>');
    expect(result.selection).toEqual(collapsed('b', 0));
    expect(result.changed).toBe(true);
  });

  it('forward Delete immediately before a hard break joins sections', () => {
    const result = applyLogicalDelete(
      `<p data-flow-id="a">One</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Two</p>`,
      collapsed('a', 3),
      'forward',
    );

    expect(stripFlowMetadata(result.html)).not.toContain('page-break');
    expect(stripFlowMetadata(result.html)).toBe('<p>One</p><p>Two</p>');
    expect(result.changed).toBe(true);
  });

  it('backward Delete immediately after a hard break joins sections', () => {
    const result = applyLogicalDelete(
      `<p data-flow-id="a">One</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Two</p>`,
      collapsed('b', 0),
      'backward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>One</p><p>Two</p>');
    expect(result.changed).toBe(true);
  });

  it('deletes one non-collapsed logical range across a hard break', () => {
    const result = applyLogicalDelete(
      `<p data-flow-id="a">Alpha</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Beta</p>`,
      {
        anchor: { flowId: 'a', offset: 2 },
        focus: { flowId: 'b', offset: 2 },
        collapsed: false,
      },
      'forward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>Al</p><p>ta</p>');
    expect(result.selection).toEqual(collapsed('a', 2));
    expect(result.changed).toBe(true);
  });

  it('retains an editable paragraph when a selection empties the document', () => {
    const result = applyLogicalDelete(
      '<p data-flow-id="a">All</p>',
      {
        anchor: { flowId: 'a', offset: 0 },
        focus: { flowId: 'a', offset: 3 },
        collapsed: false,
      },
      'backward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p><br></p>');
    expect(result.html).toMatch(/data-flow-id="[^"]+"/);
    expect(result.selection?.collapsed).toBe(true);
    expect(result.changed).toBe(true);
  });

  it('leaves the document unchanged for an unknown flow point', () => {
    const html = '<p data-flow-id="a">One</p>';
    const selection = collapsed('missing', 0);

    expect(applyLogicalDelete(html, selection, 'forward')).toEqual({
      html,
      selection,
      changed: false,
    });
  });

  it('inserts a hard page by splitting the selected flow block', () => {
    const result = insertHardPageAtSelection(
      '<p data-flow-id="a">OneTwo</p>',
      collapsed('a', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p>Two</p>`,
    );
    expect(result.selection).toEqual(collapsed('a', 3));
    expect(result.changed).toBe(true);
  });

  it('inserts an editable empty paragraph when splitting at document end', () => {
    const result = insertHardPageAtSelection(
      '<p data-flow-id="a">One</p>',
      collapsed('a', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p><br></p>`,
    );
    expect(result.selection?.anchor.offset).toBe(0);
    expect(result.selection?.anchor.flowId).not.toBe('a');
    expect(result.changed).toBe(true);
  });

  it('restores after the newly inserted break in a later hard section', () => {
    const result = insertHardPageAtSelection(
      `<p data-flow-id="a">First</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Second</p>`,
      collapsed('b', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>First</p>${HARD_PAGE_BREAK_HTML}<p>Sec</p>${HARD_PAGE_BREAK_HTML}<p>ond</p>`,
    );
    expect(result.selection).toEqual(collapsed('b', 3));
  });

  it('preserves a whitespace-only remainder when splitting a flow block', () => {
    const result = insertHardPageAtSelection(
      '<p data-flow-id="a">One   </p>',
      collapsed('a', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p>   </p>`,
    );
  });

  it('appends one persistent hard blank page in one transaction', () => {
    const result = appendHardPage('<p data-flow-id="a">One</p>');

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p><br></p>`,
    );
    expect(result.selection?.anchor.offset).toBe(0);
    expect(result.changed).toBe(true);
  });

  it('materializes an existing trailing blank section before appending', () => {
    const result = appendHardPage(
      `<p data-flow-id="a">One</p>${HARD_PAGE_BREAK_HTML}`,
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p><br></p>${HARD_PAGE_BREAK_HTML}<p><br></p>`,
    );
    expect(result.html).not.toContain(
      `${HARD_PAGE_BREAK_HTML}${HARD_PAGE_BREAK_HTML}`,
    );
  });

  it('deletes the requested hard page section and adjacent break once', () => {
    const result = deleteHardPageSection(
      `<p>A</p>${HARD_PAGE_BREAK_HTML}<p>B</p>${HARD_PAGE_BREAK_HTML}<p>C</p>`,
      1,
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>A</p>${HARD_PAGE_BREAK_HTML}<p>C</p>`,
    );
    expect(result.changed).toBe(true);
  });

  it('retains an editable blank document when deleting its only section', () => {
    const result = deleteHardPageSection(
      '<p data-flow-id="a">Only</p>',
      0,
    );

    expect(stripFlowMetadata(result.html)).toBe('<p><br></p>');
    expect(result.html).toMatch(/data-flow-id="[^"]+"/);
    expect(result.changed).toBe(true);
  });

  it('does not change the document for an invalid hard section index', () => {
    const html = `<p>A</p>${HARD_PAGE_BREAK_HTML}<p>B</p>`;

    expect(deleteHardPageSection(html, 2)).toEqual({
      html,
      selection: null,
      changed: false,
    });
  });

  it('maps every fragment to its owning hard section', () => {
    const fragments = [
      { content: '<p>A</p>', hardBreakBefore: false },
      { content: '<p>B1</p>', hardBreakBefore: true },
      { content: '<p>B2</p>', hardBreakBefore: false },
      { content: '<p>C</p>', hardBreakBefore: true },
    ];

    expect(hardSectionIndexForFragment(fragments, 0)).toBe(0);
    expect(hardSectionIndexForFragment(fragments, 1)).toBe(1);
    expect(hardSectionIndexForFragment(fragments, 2)).toBe(1);
    expect(hardSectionIndexForFragment(fragments, 3)).toBe(2);
    expect(hardSectionIndexForFragment(fragments, -1)).toBeNull();
    expect(hardSectionIndexForFragment(fragments, 4)).toBeNull();
  });

  it('replaces a collapsed selection with clipboard HTML exactly once', () => {
    const html = hydrateFlowHtml('<p>Alpha</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = replaceLogicalSelection(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 5 },
        collapsed: true,
      },
      '<p>One</p><p>Two</p>',
    );

    expect(result.changed).toBe(true);
    expect(result.html.match(/One/g)).toHaveLength(1);
    expect(result.html.match(/Two/g)).toHaveLength(1);
    expect(result.selection?.collapsed).toBe(true);
  });

  it('creates a stable editable paragraph for an empty canonical document', () => {
    expect(ensureEditableCanonicalHtml('')).toBe('<p><br></p>');
  });

  it('splits the first paragraph at the logical caret', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = insertParagraphAtSelection(html, {
      anchor: { flowId, offset: 5 },
      focus: { flowId, offset: 5 },
      collapsed: true,
    });

    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(Array.from(body.querySelectorAll('p'), (p) => p.textContent)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(result.selection?.anchor.offset).toBe(0);
  });

  it('Enter deletes a forward selection before splitting at its start', () => {
    const html = hydrateFlowHtml('<p>SELCASECASE</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = insertParagraphAtSelection(html, {
      anchor: { flowId, offset: 3 },
      focus: { flowId, offset: 7 },
      collapsed: false,
    });

    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(
      Array.from(body.querySelectorAll('p'), (paragraph) => paragraph.textContent),
    ).toEqual(['SEL', 'CASE']);
    expect(result.selection?.collapsed).toBe(true);
    expect(result.selection?.anchor.offset).toBe(0);
    expect(result.changed).toBe(true);
  });

  it('Enter deletes a reversed selection before splitting at its logical start', () => {
    const html = hydrateFlowHtml('<p>SELCASECASE</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = insertParagraphAtSelection(html, {
      anchor: { flowId, offset: 7 },
      focus: { flowId, offset: 3 },
      collapsed: false,
    });

    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(
      Array.from(body.querySelectorAll('p'), (paragraph) => paragraph.textContent),
    ).toEqual(['SEL', 'CASE']);
    expect(result.selection?.collapsed).toBe(true);
    expect(result.selection?.anchor.offset).toBe(0);
  });

  describe('Enter inside list items', () => {
    function listItemFlowId(html: string, selector: string): string {
      const body = new DOMParser()
        .parseFromString(html, 'text/html')
        .body.querySelector<HTMLElement>(selector);
      if (!body?.dataset.flowId) throw new Error(`no flow id for ${selector}`);
      return body.dataset.flowId;
    }

    it('splits a numbered list item into two numbered items', () => {
      const html = hydrateFlowHtml('<ol><li><p>ABCD</p></li></ol>');
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li'), 2),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(body.querySelectorAll('ol > li')).toHaveLength(2);
      expect(
        Array.from(body.querySelectorAll('ol > li > p'), (p) => p.textContent),
      ).toEqual(['AB', 'CD']);
      expect(result.selection?.collapsed).toBe(true);
      expect(result.selection?.anchor.offset).toBe(0);
      const ids = Array.from(
        body.querySelectorAll<HTMLElement>('[data-flow-id]'),
        (element) => element.dataset.flowId!,
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('creates an empty second item when Enter is pressed at the end', () => {
      const html = hydrateFlowHtml('<ol><li><p>ABCD</p></li></ol>');
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li'), 4),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(
        Array.from(body.querySelectorAll('ol > li > p'), (p) => p.innerHTML),
      ).toEqual(['ABCD', '<br>']);
      expect(result.selection?.collapsed).toBe(true);
    });

    it('splits bullet and numbered items consistently', () => {
      const html = hydrateFlowHtml('<ul><li><p>WXYZ</p></li></ul>');
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ul li'), 2),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(body.querySelectorAll('ul > li')).toHaveLength(2);
      expect(
        Array.from(body.querySelectorAll('ul > li > p'), (p) => p.textContent),
      ).toEqual(['WX', 'YZ']);
    });

    it('exits the list when Enter is pressed on an empty item', () => {
      const html = hydrateFlowHtml(
        '<ol><li><p>ABCD</p></li><li><p><br></p></li></ol>',
      );
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li:nth-of-type(2)'), 0),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(
        Array.from(body.querySelectorAll('ol > li > p'), (p) => p.textContent),
      ).toEqual(['ABCD']);
      expect(body.querySelectorAll('ol')).toHaveLength(1);
      expect(body.querySelector('ol')!.nextElementSibling?.tagName).toBe('P');
      expect(result.selection?.collapsed).toBe(true);
      expect(result.selection?.anchor.offset).toBe(0);
    });

    it('exits an empty bullet item at the start of a list', () => {
      const html = hydrateFlowHtml(
        '<ul><li><p><br></p></li><li><p>Keep</p></li></ul>',
      );
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ul li:nth-of-type(1)'), 0),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(Array.from(body.children, (node) => node.tagName)).toEqual([
        'P',
        'UL',
      ]);
      expect(body.children[1].textContent).toBe('Keep');
    });

    it('splits the list around a paragraph when exiting a middle item', () => {
      const html = hydrateFlowHtml(
        '<ol><li><p>A</p></li><li><p><br></p></li><li><p>C</p></li></ol>',
      );
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li:nth-of-type(2)'), 0),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(
        Array.from(body.children, (node) => node.tagName),
      ).toEqual(['OL', 'P', 'OL']);
      expect(
        Array.from(body.querySelectorAll('ol > li > p'), (p) => p.textContent),
      ).toEqual(['A', 'C']);
    });

    it('forwards a fast second Enter at the end of an item to the trailing empty item', () => {
      const html = hydrateFlowHtml(
        '<ol><li><p>ABCD</p></li><li><p><br></p></li></ol>',
      );
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li:nth-of-type(1)'), 4),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(body.querySelectorAll('ol > li')).toHaveLength(1);
      expect(body.querySelector('ol')!.nextElementSibling?.tagName).toBe('P');
      expect(result.selection?.collapsed).toBe(true);
      expect(result.selection?.anchor.offset).toBe(0);
    });

    it('splits normally when the trailing item is not empty', () => {
      const html = hydrateFlowHtml(
        '<ol><li><p>AB</p></li><li><p>CD</p></li></ol>',
      );
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li:nth-of-type(1)'), 2),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(
        Array.from(body.querySelectorAll('ol > li > p'), (p) => p.textContent),
      ).toEqual(['AB', '', 'CD']);
    });

    it('does not forward when the caret is mid-item', () => {
      const html = hydrateFlowHtml(
        '<ol><li><p>ABCD</p></li><li><p><br></p></li></ol>',
      );
      const result = insertParagraphAtSelection(
        html,
        collapsed(listItemFlowId(html, 'ol li:nth-of-type(1)'), 2),
      );

      const body = new DOMParser()
        .parseFromString(result.html, 'text/html')
        .body;
      expect(body.querySelectorAll('ol > li')).toHaveLength(3);
      expect(body.querySelector('ol')!.nextElementSibling).toBeNull();
    });
  });

  it('inserts block clipboard nodes at block boundaries without nesting', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = replaceLogicalSelection(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 5 },
        collapsed: true,
      },
      '<p>One</p><p>Two</p>',
    );

    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(
      Array.from(body.querySelectorAll('p'), (paragraph) => paragraph.textContent),
    ).toEqual(['Alpha', 'One', 'Two', 'Beta']);
    expect(body.querySelector('p p, p h1, p h2, p blockquote, p table, p ul, p ol')).toBeNull();
    expect(result.html.match(/One/g)).toHaveLength(1);
    expect(result.html.match(/Two/g)).toHaveLength(1);
  });

  it.each([
    ['<ul><li>One</li><li>Two</li></ul>', 'UL'],
    ['<table><tbody><tr><td>Cell</td></tr></tbody></table>', 'TABLE'],
    ['<hr>', 'HR'],
  ])('splits the containing paragraph for %s', (replacement, tagName) => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;
    const result = replaceLogicalSelection(
      html,
      collapsed(flowId, 5),
      replacement,
    );
    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(Array.from(body.children, (node) => node.tagName)).toEqual([
      'P',
      tagName,
      'P',
    ]);
    expect(body.children[0].textContent).toBe('Alpha');
    expect(body.children[2].textContent).toBe('Beta');
    expect(result.html).toBe(body.innerHTML);
  });

  it.each([
    ['start', 0, ['UL', 'P'], ['OneTwo', 'AlphaBeta']],
    ['middle', 5, ['P', 'UL', 'P'], ['Alpha', 'OneTwo', 'Beta']],
    ['end', 10, ['P', 'UL'], ['AlphaBeta', 'OneTwo']],
  ])(
    'replaces a list at the %s of a paragraph with canonical structure',
    (position, offset, expectedTags, expectedTexts) => {
      const html = hydrateFlowHtml('<p>AlphaBeta</p>');
      const flowId = new DOMParser()
        .parseFromString(html, 'text/html')
        .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;
      const result = replaceLogicalSelection(
        html,
        collapsed(flowId, offset),
        '<ul><li>One</li><li>Two</li></ul>',
      );
      const body = new DOMParser().parseFromString(result.html, 'text/html')
        .body;
      expect(Array.from(body.children, (node) => node.tagName)).toEqual(
        expectedTags,
      );
      expect(
        Array.from(body.children, (node) => node.textContent),
      ).toEqual(expectedTexts);
      expect(result.html).toBe(body.innerHTML);
      const ids = Array.from(
        body.querySelectorAll<HTMLElement>('[data-flow-id]'),
        (element) => element.dataset.flowId!,
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.html.match(/One/g)).toHaveLength(1);
      expect(result.html.match(/Two/g)).toHaveLength(1);
    },
  );

  it('preserves a custom start value on a pasted ordered list', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;
    const result = replaceLogicalSelection(
      html,
      collapsed(flowId, 5),
      '<ol start="3"><li>One</li></ol>',
    );
    const body = new DOMParser().parseFromString(result.html, 'text/html')
      .body;
    expect(body.querySelector('ol')?.getAttribute('start')).toBe('3');
  });

  it('replaces a forward selection with a list in canonical structure', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;
    const result = replaceLogicalSelection(
      html,
      {
        anchor: { flowId, offset: 0 },
        focus: { flowId, offset: 5 },
        collapsed: false,
      },
      '<ul><li>One</li></ul>',
    );
    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(Array.from(body.children, (node) => node.tagName)).toEqual([
      'UL',
      'P',
    ]);
    expect(body.textContent).toBe('OneBeta');
    expect(result.selection?.collapsed).toBe(true);
  });

  it('replaces a reversed selection with a list in canonical structure', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;
    const result = replaceLogicalSelection(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 0 },
        collapsed: false,
      },
      '<ul><li>One</li></ul>',
    );
    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(Array.from(body.children, (node) => node.tagName)).toEqual([
      'UL',
      'P',
    ]);
    expect(body.textContent).toBe('OneBeta');
  });

  it('keeps mixed inline and block replacement nodes in document order', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;
    const result = replaceLogicalSelection(
      html,
      collapsed(flowId, 5),
      '<p>One</p><hr><p>Two</p>',
    );
    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    expect(Array.from(body.children, (node) => node.tagName)).toEqual([
      'P',
      'P',
      'HR',
      'P',
      'P',
    ]);
    expect(body.textContent).toBe('AlphaOneTwoBeta');
    expect(result.html).toBe(body.innerHTML);
  });

  it('leaves a stale bookmark unchanged for a block-rich replacement', () => {
    const html = hydrateFlowHtml('<p>AlphaBeta</p>');
    const result = replaceLogicalSelection(
      html,
      collapsed('missing', 5),
      '<ul><li>One</li></ul>',
    );
    expect(result.changed).toBe(false);
    expect(result.html).toBe(html);
  });

  it('strips editor-owned flow metadata from clipboard HTML', () => {
    const html = hydrateFlowHtml('<p>Alpha</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = replaceLogicalSelection(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 5 },
        collapsed: true,
      },
      '<p data-flow-id="f1" data-flow-continuation="true">One</p>' +
        '<p data-flow-id="f1" data-flow-oversized="true">Two</p>',
    );

    expect(result.html).not.toContain('data-flow-continuation');
    expect(result.html).not.toContain('data-flow-oversized');
    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    const ids = Array.from(
      body.querySelectorAll<HTMLElement>('[data-flow-id]'),
      (element) => element.dataset.flowId!,
    );
    expect(ids).not.toContain('f1');
    expect(stripFlowMetadata(result.html)).toBe(
      '<p>Alpha</p><p>One</p><p>Two</p>',
    );
  });

  it('assigns globally unique flow ids after every replacement', () => {
    const html = hydrateFlowHtml('<p>Alpha</p>');
    const flowId = new DOMParser()
      .parseFromString(html, 'text/html')
      .body.querySelector<HTMLElement>('[data-flow-id]')!.dataset.flowId!;

    const result = replaceLogicalSelection(
      html,
      {
        anchor: { flowId, offset: 5 },
        focus: { flowId, offset: 5 },
        collapsed: true,
      },
      '<p>One</p><p>Two</p>',
    );

    const body = new DOMParser().parseFromString(result.html, 'text/html').body;
    const ids = Array.from(
      body.querySelectorAll<HTMLElement>('[data-flow-id]'),
      (element) => element.dataset.flowId!,
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
