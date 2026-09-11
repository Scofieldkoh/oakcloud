import { describe, expect, it } from 'vitest';
import { createCanonicalInputBridge } from '@/components/documents/a4-pagination/editor-session';
import { paginateFlowHtml, type HtmlMeasurer } from '@/components/documents/a4-pagination/engine';
import { hydrateFlowHtml, reassemblePageFragments, stripFlowMetadata } from '@/components/documents/a4-pagination/model';
import {
  captureA4Position,
  captureA4SelectionFromDomPoints,
  resolveA4Position,
  type A4DomPoint,
  type A4Selection,
  type A4TransactionResult,
  type CanonicalEditorDocument,
} from '@/components/documents/a4-pagination/structural-position';
import {
  hydrateA4SemanticProofHtml,
  mapProjectedTextOffsetToSource,
  projectA4SemanticBreaksForProof,
  projectedOrderedListMarkersForProof,
  removeA4PageBreakForProof,
  serializeA4SemanticProofHtml,
  validateA4PageBreakPositionForProof,
  type A4ProjectionSourceRevision,
} from '@/components/documents/a4-pagination/semantic-page-breaks';

function rootFor(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

function roundTripPosition(
  root: HTMLElement,
  position: NonNullable<ReturnType<typeof captureA4Position>>,
) {
  const resolved = resolveA4Position(root, position);
  expect(resolved).not.toBeNull();
  return captureA4Position(root, resolved!.node, resolved!.offset);
}

function roundTripSelection(
  root: HTMLElement,
  selection: A4Selection,
): A4Selection | null {
  const anchor = resolveA4Position(root, selection.anchor);
  const focus = resolveA4Position(root, selection.focus);
  expect(anchor).not.toBeNull();
  expect(focus).not.toBeNull();
  return captureA4SelectionFromDomPoints(root, anchor!, focus!);
}

const proofSource = (
  sessionKey: string,
  documentRevision = 0,
): A4ProjectionSourceRevision => ({ sessionKey, documentRevision });

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

  it('round-trips structural affinity at breaks, empty content, atomics, and directional selections', () => {
    const root = rootFor(
      [
        '<p data-flow-id="line">A<br>B</p>',
        '<p data-flow-id="blank"><br></p>',
        '<p data-flow-id="fields"><span data-flow-id="field-a" data-field-id="a" contenteditable="false">{{a}}</span><span data-flow-id="field-b" data-field-id="b" contenteditable="false">{{b}}</span></p>',
        '<p data-flow-id="later">Later</p>',
        '<table data-flow-id="table"><tbody data-flow-id="body"><tr data-flow-id="row"><td data-flow-id="empty-cell"></td><td data-flow-id="filled-cell">X</td></tr></tbody></table>',
      ].join(''),
    );

    const line = root.querySelector<HTMLElement>('[data-flow-id="line"]')!;
    const firstText = line.childNodes[0] as Text;
    const secondText = line.childNodes[2] as Text;
    const beforeBreak = captureA4Position(root, firstText, 1)!;
    const afterBreak = captureA4Position(root, secondText, 0)!;
    expect(beforeBreak).toEqual({
      kind: 'children',
      nodeId: 'line',
      index: 1,
      affinity: 'before',
    });
    expect(afterBreak).toEqual({
      kind: 'children',
      nodeId: 'line',
      index: 2,
      affinity: 'after',
    });
    expect(roundTripPosition(root, beforeBreak)).toEqual(beforeBreak);
    expect(roundTripPosition(root, afterBreak)).toEqual(afterBreak);

    expect(resolveA4Position(root, {
      kind: 'text',
      nodeId: 'line',
      offset: 1,
      affinity: 'before',
    })).toEqual({ node: line, offset: 1 });
    expect(resolveA4Position(root, {
      kind: 'text',
      nodeId: 'line',
      offset: 1,
      affinity: 'after',
    })).toEqual({ node: line, offset: 2 });

    const blank = root.querySelector<HTMLElement>('[data-flow-id="blank"]')!;
    const blankPosition = captureA4Position(root, blank, 0)!;
    expect(blankPosition).toEqual({
      kind: 'children',
      nodeId: 'blank',
      index: 0,
      affinity: 'before',
    });
    expect(roundTripPosition(root, blankPosition)).toEqual(blankPosition);

    const fields = root.querySelector<HTMLElement>('[data-flow-id="fields"]')!;
    const betweenFields = captureA4Position(root, fields, 1)!;
    expect(betweenFields).toEqual({
      kind: 'children',
      nodeId: 'fields',
      index: 1,
      affinity: 'after',
    });
    expect(roundTripPosition(root, betweenFields)).toEqual(betweenFields);

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
    expect(roundTripPosition(root, cellPosition)).toEqual(cellPosition);
    expect(validateA4PageBreakPositionForProof(root, cellPosition)).toEqual({
      supported: false,
      code: 'table-cell-interior-unsupported',
      message:
        'Manual page breaks inside table cells are not supported by the S0 contract proof.',
    });

    const laterText = root.querySelector<HTMLElement>('[data-flow-id="later"]')!
      .firstChild!;
    const collapsedPoint: A4DomPoint = { node: laterText, offset: 3 };
    const collapsed = captureA4SelectionFromDomPoints(
      root,
      collapsedPoint,
      collapsedPoint,
    )!;
    expect(collapsed.anchor).toEqual(collapsed.focus);
    expect(roundTripSelection(root, collapsed)).toEqual(collapsed);

    const forward = captureA4SelectionFromDomPoints(
      root,
      { node: firstText, offset: 0 },
      { node: laterText, offset: 3 },
    )!;
    expect(roundTripSelection(root, forward)).toEqual(forward);

    const reverse = captureA4SelectionFromDomPoints(
      root,
      { node: laterText, offset: 3 },
      { node: firstText, offset: 1 },
    )!;
    expect(reverse.anchor).toMatchObject({ nodeId: 'later', offset: 3 });
    expect(reverse.focus).toEqual(beforeBreak);
    expect(roundTripSelection(root, reverse)).toEqual(reverse);
  });

  it('projects a nested inline break without creating a second logical numbered item', () => {
    const proof = projectA4SemanticBreaksForProof(
      '<ol start="5" data-flow-id="list"><li data-flow-id="item-5"><p data-flow-id="paragraph">Before<span data-flow-id="break-1" data-a4-break="page"></span>After</p></li><li data-flow-id="item-6"><p data-flow-id="next">Next</p></li></ol>',
      proofSource('single-break', 4),
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
    expect(proof.positionMap).toMatchObject({
      sessionKey: 'single-break',
      documentRevision: 4,
    });

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

    expect(projectedOrderedListMarkersForProof(proof.fragments[0].content, 'list')).toEqual([
      {
        itemNodeId: 'item-5',
        continuation: false,
        value: 5,
        label: '5.',
      },
    ]);
    expect(projectedOrderedListMarkersForProof(proof.fragments[1].content, 'list')).toEqual([
      {
        itemNodeId: 'item-5',
        continuation: true,
        value: null,
        label: null,
      },
      {
        itemNodeId: 'item-6',
        continuation: false,
        value: 6,
        label: '6.',
      },
    ]);

    expect(mapProjectedTextOffsetToSource(proof.positionMap, {
      fragmentIndex: 0,
      sourceNodeId: 'item-5',
      projectedOffset: 2,
    })).toEqual({
      sessionKey: 'single-break',
      documentRevision: 4,
      position: {
        kind: 'text',
        nodeId: 'item-5',
        offset: 2,
        affinity: 'after',
      },
    });
    expect(mapProjectedTextOffsetToSource(proof.positionMap, {
      fragmentIndex: 1,
      sourceNodeId: 'item-5',
      projectedOffset: 2,
    })).toEqual({
      sessionKey: 'single-break',
      documentRevision: 4,
      position: {
        kind: 'text',
        nodeId: 'item-5',
        offset: 8,
        affinity: 'after',
      },
    });

    const persisted = serializeA4SemanticProofHtml(proof.internalHtml);
    expect(persisted).toContain('<span data-a4-break="page"></span>');
    expect(persisted).not.toContain('data-flow-');
    expect(persisted).not.toContain('--flow-list-start');
  });

  it('keeps exact source ranges, ancestry, and numbering through two breaks in one ordered-list item', () => {
    const proof = projectA4SemanticBreaksForProof(
      '<ol start="5" data-flow-id="list"><li data-flow-id="item-5"><p data-flow-id="paragraph">Before <span data-flow-id="break-1" data-a4-break="page"></span>Middle <span data-flow-id="break-2" data-a4-break="page"></span>After</p></li><li data-flow-id="item-6"><p data-flow-id="next">Next</p></li></ol>',
      proofSource('two-breaks', 12),
    );

    expect(proof.breaks.map((entry) => entry.nodeId)).toEqual(['break-1', 'break-2']);
    expect(proof.fragments).toHaveLength(3);
    expect(proof.fragments.map((entry) => entry.hardBreakBefore)).toEqual([
      false,
      true,
      true,
    ]);

    const fragmentRoots = proof.fragments.map((fragment) => rootFor(fragment.content));
    fragmentRoots.forEach((fragment, index) => {
      const paragraph = fragment.querySelector(
        'ol[data-flow-id="list"] > li[data-flow-id="item-5"] > p[data-flow-id="paragraph"]',
      );
      expect(paragraph, `fragment ${index} keeps OL/LI/P ancestry`).not.toBeNull();
    });
    expect(fragmentRoots[0].querySelector('[data-flow-id="paragraph"]')?.textContent).toBe('Before ');
    expect(fragmentRoots[1].querySelector('[data-flow-id="paragraph"]')?.textContent).toBe('Middle ');
    expect(fragmentRoots[2].querySelector('[data-flow-id="paragraph"]')?.textContent).toBe('After');

    const middleParagraphRange = proof.positionMap.fragments[1].sourceRanges.find(
      (range) => range.sourceNodeId === 'paragraph',
    );
    expect(middleParagraphRange).toEqual({
      sourceNodeId: 'paragraph',
      startTextOffset: 7,
      endTextOffset: 14,
    });
    const middleItemRange = proof.positionMap.fragments[1].sourceRanges.find(
      (range) => range.sourceNodeId === 'item-5',
    );
    expect(middleItemRange).toEqual({
      sourceNodeId: 'item-5',
      startTextOffset: 7,
      endTextOffset: 14,
    });

    expect(mapProjectedTextOffsetToSource(proof.positionMap, {
      fragmentIndex: 1,
      sourceNodeId: 'paragraph',
      projectedOffset: 2,
    })).toEqual({
      sessionKey: 'two-breaks',
      documentRevision: 12,
      position: {
        kind: 'text',
        nodeId: 'paragraph',
        offset: 9,
        affinity: 'after',
      },
    });

    expect(fragmentRoots[0].querySelector<HTMLElement>('[data-flow-id="list"]')!.style.getPropertyValue('--flow-list-start')).toBe('4');
    expect(fragmentRoots[1].querySelector<HTMLElement>('[data-flow-id="list"]')!.style.getPropertyValue('--flow-list-start')).toBe('5');
    expect(fragmentRoots[2].querySelector<HTMLElement>('[data-flow-id="list"]')!.style.getPropertyValue('--flow-list-start')).toBe('5');
    expect(fragmentRoots[1].querySelector('[data-flow-id="list"]')?.getAttribute('data-flow-continuation')).toBe('both');
    expect(fragmentRoots[1].querySelector('[data-flow-id="item-5"]')?.getAttribute('data-flow-continuation-item')).toBe('true');
    expect(fragmentRoots[2].querySelector('[data-flow-id="item-5"]')?.getAttribute('data-flow-continuation-item')).toBe('true');

    expect(projectedOrderedListMarkersForProof(proof.fragments[0].content, 'list')).toEqual([
      { itemNodeId: 'item-5', continuation: false, value: 5, label: '5.' },
    ]);
    expect(projectedOrderedListMarkersForProof(proof.fragments[1].content, 'list')).toEqual([
      { itemNodeId: 'item-5', continuation: true, value: null, label: null },
    ]);
    expect(projectedOrderedListMarkersForProof(proof.fragments[2].content, 'list')).toEqual([
      { itemNodeId: 'item-5', continuation: true, value: null, label: null },
      { itemNodeId: 'item-6', continuation: false, value: 6, label: '6.' },
    ]);

    for (const breakNodeId of ['break-1', 'break-2']) {
      const removed = removeA4PageBreakForProof(proof.internalHtml, breakNodeId);
      expect(removed.changed).toBe(true);
      const canonical = rootFor(removed.internalHtml);
      expect(canonical.querySelectorAll('ol[data-flow-id="list"] > li')).toHaveLength(2);
      expect(canonical.querySelector('ol[data-flow-id="list"]')?.getAttribute('start')).toBe('5');
      expect(canonical.querySelector('[data-flow-id="item-5"]')?.textContent).toBe('Before Middle After');
      expect(canonical.querySelectorAll('[data-a4-break="page"]')).toHaveLength(1);
      expect(canonical.textContent).toBe('Before Middle AfterNext');
    }
  });

  it('preserves mixed nested-list ancestry and continuation identity around the break', () => {
    const proof = projectA4SemanticBreaksForProof(
      '<ol data-flow-id="outer-list"><li data-flow-id="outer-item"><p data-flow-id="parent">Parent</p><ul data-flow-id="nested-list"><li data-flow-id="nested-item"><p data-flow-id="nested-paragraph">Nested before<span data-flow-id="nested-break" data-a4-break="page"></span> nested after</p></li><li data-flow-id="nested-next"><p>Nested next</p></li></ul></li></ol>',
      proofSource('nested'),
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
      proofSource('legacy'),
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

  it('binds the C02 transaction and C04 position map to CORE revision authority only', () => {
    const selection: A4Selection = {
      anchor: { kind: 'text', nodeId: 'paragraph', offset: 0, affinity: 'after' },
      focus: { kind: 'text', nodeId: 'paragraph', offset: 0, affinity: 'after' },
    };
    const bridge = createCanonicalInputBridge<A4Selection>({
      sessionKey: 'bridge-session',
      content: '<p data-flow-id="paragraph">BeforeAfter</p>',
      selection,
    });
    const snapshotResult = bridge.getSnapshot();
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) throw new Error(snapshotResult.message);

    const proof = projectA4SemanticBreaksForProof(
      '<p data-flow-id="paragraph">Before<span data-flow-id="break-1" data-a4-break="page"></span>After</p>',
      {
        sessionKey: snapshotResult.snapshot.sessionKey,
        documentRevision: snapshotResult.snapshot.revision,
      },
    );
    const mapped = mapProjectedTextOffsetToSource(proof.positionMap, {
      fragmentIndex: 1,
      sourceNodeId: 'paragraph',
      projectedOffset: 1,
    })!;
    expect(mapped).toMatchObject({
      sessionKey: 'bridge-session',
      documentRevision: 0,
      position: { nodeId: 'paragraph', offset: 7 },
    });

    const renderedSelection: A4Selection = {
      anchor: mapped.position,
      focus: mapped.position,
    };
    expect(bridge.resolveNativeInputTarget({
      renderedRevision: mapped.documentRevision,
      origin: 'pointer',
      renderedSelection,
    })).toMatchObject({
      ok: true,
      baseRevision: 0,
      selection: renderedSelection,
      source: 'rendered-projection',
    });

    const document: CanonicalEditorDocument = { internalHtml: proof.internalHtml };
    const transaction: A4TransactionResult = {
      status: 'applied',
      document,
      selection: renderedSelection,
      changedNodeIds: ['paragraph', 'break-1'],
    };
    expect('revision' in transaction.document).toBe(false);
    const committedRevision = bridge.commitCanonical(
      serializeA4SemanticProofHtml(transaction.document.internalHtml),
      transaction.selection,
    );
    expect(committedRevision).toBe(1);
    expect(bridge.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { sessionKey: 'bridge-session', revision: 1 },
    });

    // The published map remains associated with revision 0; it cannot advance
    // itself and CORE rejects it once canonical revision 1 exists.
    expect(proof.positionMap.documentRevision).toBe(0);
    expect(bridge.resolveNativeInputTarget({
      renderedRevision: proof.positionMap.documentRevision,
      origin: 'pointer',
      renderedSelection,
    })).toMatchObject({
      ok: false,
      reason: 'stale-projection',
      currentRevision: 1,
      renderedRevision: 0,
    });
  });
});
