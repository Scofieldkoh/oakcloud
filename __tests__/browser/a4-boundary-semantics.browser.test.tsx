import { describe, expect, it } from 'vitest';
import { paginateFlowHtml, type HtmlMeasurer } from '@/components/documents/a4-pagination/engine';
import { hydrateFlowHtml, reassemblePageFragments, stripFlowMetadata } from '@/components/documents/a4-pagination/model';
import {
  captureA4Position,
  captureA4SelectionFromDomPoints,
} from '@/components/documents/a4-pagination/structural-position';
import {
  hydrateA4SemanticProofHtml,
  mapProjectedTextOffsetToSource,
  projectA4SemanticBreaksForProof,
  removeA4PageBreakForProof,
  serializeA4SemanticProofHtml,
  validateA4PageBreakPositionForProof,
} from '@/components/documents/a4-pagination/semantic-page-breaks';

function rootFor(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('A4 S0 structural semantics proof', () => {
  it('keeps one logical long list item through ordinary soft pagination', () => {
    const visibleText = (html: string): string => {
      const root = rootFor(html);
      return root.textContent ?? '';
    };
    const characterMeasurer: HtmlMeasurer = {
      measure: (html) => visibleText(html).length,
    };
    const canonical = hydrateFlowHtml(
      '<ol start="5"><li><p>alpha beta gamma delta epsilon zeta eta theta</p></li></ol>',
    );
    const source = rootFor(canonical);
    const itemId = source.querySelector<HTMLElement>('li')!.dataset.flowId!;
    const pages = paginateFlowHtml(canonical, characterMeasurer, 18);

    expect(pages.length).toBeGreaterThan(1);
    const projectedIds = pages.flatMap((page) =>
      Array.from(rootFor(page.content).querySelectorAll<HTMLElement>('li'))
        .map((item) => item.dataset.flowId)
        .filter(Boolean),
    );
    expect(projectedIds.filter((id) => id === itemId).length).toBeGreaterThan(1);
    expect(pages.slice(1).some((page) =>
      page.content.includes('data-flow-continuation-item="true"'),
    )).toBe(true);

    const reassembled = rootFor(
      stripFlowMetadata(reassemblePageFragments(pages)),
    );
    expect(reassembled.querySelectorAll('ol')).toHaveLength(1);
    expect(reassembled.querySelectorAll('ol > li')).toHaveLength(1);
    expect(reassembled.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(reassembled.textContent).toBe(
      'alpha beta gamma delta epsilon zeta eta theta',
    );
  });

  it('distinguishes zero-text structural positions and preserves reverse selection direction', () => {
    const root = rootFor(
      [
        '<p data-flow-id="line">A<br>B</p>',
        '<p data-flow-id="blank"><br></p>',
        '<p data-flow-id="fields"><span data-flow-id="field-a" data-field-id="a">{{a}}</span><span data-flow-id="field-b" data-field-id="b">{{b}}</span></p>',
        '<p data-flow-id="later">Later</p>',
        '<table data-flow-id="table"><tbody data-flow-id="body"><tr data-flow-id="row"><td data-flow-id="empty-cell"></td><td data-flow-id="filled-cell">X</td></tr></tbody></table>',
      ].join(''),
    );

    const line = root.querySelector<HTMLElement>('[data-flow-id="line"]')!;
    const beforeBreak = captureA4Position(root, line, 1);
    const afterBreak = captureA4Position(root, line, 2);
    expect(beforeBreak).toEqual({
      kind: 'children',
      nodeId: 'line',
      index: 1,
      affinity: 'after',
    });
    expect(afterBreak).toEqual({
      kind: 'children',
      nodeId: 'line',
      index: 2,
      affinity: 'after',
    });
    expect(beforeBreak).not.toEqual(afterBreak);

    const blank = root.querySelector<HTMLElement>('[data-flow-id="blank"]')!;
    expect(captureA4Position(root, blank, 0)).toEqual({
      kind: 'children',
      nodeId: 'blank',
      index: 0,
      affinity: 'after',
    });

    const fields = root.querySelector<HTMLElement>('[data-flow-id="fields"]')!;
    expect(captureA4Position(root, fields, 1)).toEqual({
      kind: 'children',
      nodeId: 'fields',
      index: 1,
      affinity: 'after',
    });

    const emptyCell = root.querySelector<HTMLElement>(
      '[data-flow-id="empty-cell"]',
    )!;
    const cellPosition = captureA4Position(root, emptyCell, 0)!;
    expect(cellPosition).toEqual({
      kind: 'children',
      nodeId: 'empty-cell',
      index: 0,
      affinity: 'after',
    });
    expect(validateA4PageBreakPositionForProof(root, cellPosition)).toEqual({
      supported: false,
      code: 'table-cell-interior-unsupported',
      message:
        'Manual page breaks inside table cells are not supported by the S0 contract proof.',
    });

    const firstText = line.firstChild!;
    const laterText = root.querySelector<HTMLElement>('[data-flow-id="later"]')!
      .firstChild!;
    const reverse = captureA4SelectionFromDomPoints(
      root,
      { node: laterText, offset: 3 },
      { node: firstText, offset: 1 },
    );
    expect(reverse?.anchor).toMatchObject({ nodeId: 'later', offset: 3 });
    expect(reverse?.focus).toMatchObject({ nodeId: 'line' });
  });

  it('projects a nested inline break without creating a second logical numbered item', () => {
    const proof = projectA4SemanticBreaksForProof(
      '<ol start="5" data-flow-id="list"><li data-flow-id="item-5"><p data-flow-id="paragraph">Before<span data-flow-id="break-1" data-a4-break="page"></span>After</p></li><li data-flow-id="item-6"><p data-flow-id="next">Next</p></li></ol>',
    );

    expect(proof.breaks).toHaveLength(1);
    expect(proof.breaks[0]).toMatchObject({
      nodeId: 'break-1',
      kind: 'inline',
      splitNodeIds: expect.arrayContaining(['paragraph', 'item-5', 'list']),
    });
    expect(proof.fragments).toHaveLength(2);
    expect(proof.fragments[0].hardBreakBefore).toBe(false);
    expect(proof.fragments[1].hardBreakBefore).toBe(true);

    const canonical = rootFor(proof.internalHtml);
    expect(canonical.querySelectorAll('ol > li')).toHaveLength(2);
    expect(canonical.querySelectorAll('[data-flow-id="item-5"]')).toHaveLength(1);

    const first = rootFor(proof.fragments[0].content);
    const second = rootFor(proof.fragments[1].content);
    expect(first.querySelector('[data-flow-id="item-5"]')?.textContent).toBe(
      'Before',
    );
    expect(second.querySelector('[data-flow-id="item-5"]')?.textContent).toBe(
      'After',
    );
    expect(
      second
        .querySelector('[data-flow-id="item-5"]')
        ?.getAttribute('data-flow-continuation-item'),
    ).toBe('true');
    expect(
      (first.querySelector('[data-flow-id="list"]') as HTMLElement).style.getPropertyValue(
        '--flow-list-start',
      ),
    ).toBe('4');
    expect(
      (second.querySelector('[data-flow-id="list"]') as HTMLElement).style.getPropertyValue(
        '--flow-list-start',
      ),
    ).toBe('5');
    expect(second.querySelector('[data-flow-id="item-6"]')?.textContent).toBe(
      'Next',
    );

    expect(mapProjectedTextOffsetToSource(proof, 0, 'item-5', 2)).toEqual({
      kind: 'text',
      nodeId: 'item-5',
      offset: 2,
      affinity: 'after',
    });
    expect(mapProjectedTextOffsetToSource(proof, 1, 'item-5', 2)).toEqual({
      kind: 'text',
      nodeId: 'item-5',
      offset: 8,
      affinity: 'after',
    });

    const persisted = serializeA4SemanticProofHtml(proof.internalHtml);
    expect(persisted).toContain('<span data-a4-break="page"></span>');
    expect(persisted).not.toContain('data-flow-');
    expect(persisted).not.toContain('--flow-list-start');
  });

  it('preserves mixed nested-list ancestry and continuation identity around the break', () => {
    const proof = projectA4SemanticBreaksForProof(
      '<ol data-flow-id="outer-list"><li data-flow-id="outer-item"><p data-flow-id="parent">Parent</p><ul data-flow-id="nested-list"><li data-flow-id="nested-item"><p data-flow-id="nested-paragraph">Nested before<span data-flow-id="nested-break" data-a4-break="page"></span> nested after</p></li><li data-flow-id="nested-next"><p>Nested next</p></li></ul></li></ol>',
    );

    const canonical = rootFor(proof.internalHtml);
    expect(canonical.querySelectorAll('ol > li')).toHaveLength(1);
    expect(canonical.querySelectorAll('ul > li')).toHaveLength(2);

    const second = rootFor(proof.fragments[1].content);
    expect(
      second
        .querySelector('[data-flow-id="outer-item"]')
        ?.getAttribute('data-flow-continuation-item'),
    ).toBe('true');
    expect(
      second
        .querySelector('[data-flow-id="nested-item"]')
        ?.getAttribute('data-flow-continuation-item'),
    ).toBe('true');
    expect(second.textContent).toBe(' nested afterNested next');
    expect(proof.breaks[0].splitNodeIds).toEqual(
      expect.arrayContaining([
        'nested-paragraph',
        'nested-item',
        'nested-list',
        'outer-item',
        'outer-list',
      ]),
    );
  });

  it('reads legacy top-level breaks compatibly and preserves tables, blank paragraphs, captions, and footers', () => {
    const proof = projectA4SemanticBreaksForProof(
      '<p><br></p><table><caption>Caption</caption><tbody><tr><td>Before</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table><div class="page-break"></div><p>After</p>',
    );

    expect(proof.breaks).toHaveLength(1);
    expect(proof.breaks[0].kind).toBe('legacy-top-level');
    expect(proof.fragments).toHaveLength(2);
    expect(rootFor(proof.fragments[0].content).querySelector('p > br')).toBeTruthy();
    expect(rootFor(proof.fragments[0].content).querySelector('caption')?.textContent).toBe(
      'Caption',
    );
    expect(rootFor(proof.fragments[0].content).querySelector('tfoot')?.textContent).toBe(
      'Footer',
    );

    const persisted = serializeA4SemanticProofHtml(proof.internalHtml);
    expect(persisted).toContain(
      '<div class="page-break" data-break-type="hard"></div>',
    );
    expect(persisted).not.toContain('data-flow-');
  });

  it('deletes one inline break logically while retaining one list item and its numbering intent', () => {
    const internal = hydrateA4SemanticProofHtml(
      '<ol start="5"><li><p>Before<span data-a4-break="page"></span>After</p></li><li><p>Next</p></li></ol>',
    );
    const hydratedRoot = rootFor(internal);
    const marker = hydratedRoot.querySelector<HTMLElement>(
      '[data-a4-break="page"]',
    )!;
    const breakNodeId = marker.dataset.flowId!;
    const paragraphId = marker.parentElement!.dataset.flowId!;

    const removed = removeA4PageBreakForProof(internal, breakNodeId);
    expect(removed.changed).toBe(true);
    expect(removed.selection).toEqual({
      anchor: {
        kind: 'children',
        nodeId: paragraphId,
        index: 1,
        affinity: 'after',
      },
      focus: {
        kind: 'children',
        nodeId: paragraphId,
        index: 1,
        affinity: 'after',
      },
    });

    const canonical = rootFor(removed.internalHtml);
    expect(canonical.querySelectorAll('ol > li')).toHaveLength(2);
    expect(canonical.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(canonical.querySelector('ol > li')?.textContent).toBe('BeforeAfter');
    expect(canonical.querySelector('[data-a4-break="page"]')).toBeNull();

    const persisted = serializeA4SemanticProofHtml(removed.internalHtml);
    expect(persisted).not.toContain('data-a4-break');
    expect(persisted).not.toContain('data-flow-');
  });
});
