import { describe, expect, it } from 'vitest';
import {
  createA4CommandDocument,
  deleteA4Selection,
  getA4ListLevelContext,
  getDeleteBlankPageOrBreakCapability,
  getInsertManualBreakCapability,
  insertA4LineBreak,
  insertA4ManualPageBreak,
  insertA4ParagraphBreak,
  removeA4ManualPageBreak,
} from '@/components/documents/a4-pagination/structural-commands';
import {
  createA4ChangeMap,
  createCanonicalEditorDocument,
  mapA4PositionThroughChangeMap,
  normalizeA4SelectionRange,
  type A4Position,
  type A4Selection,
} from '@/components/documents/a4-pagination/structural-position';
import {
  detectA4BreakFormatLevel,
  readA4BreakDocument,
  serializeA4CanonicalBreakDocument,
} from '@/components/documents/a4-pagination/semantic-break-projection';
import {
  paginateA4StructuralHtml,
  paginateFlowHtmlStructuralCompat,
} from '@/components/documents/a4-pagination/structural-pagination';
import type { HtmlMeasurer } from '@/components/documents/a4-pagination/engine';

function caret(position: A4Position): A4Selection {
  return { anchor: position, focus: position };
}

function visibleText(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root.textContent ?? '';
}

const characterMeasurer: HtmlMeasurer = {
  measure: (html) => visibleText(html).length,
};

describe('A4 S1 structural commands', () => {
  it('keeps after-br, empty paragraph/cell, and adjacent atomic boundaries distinct', () => {
    const document = createA4CommandDocument(
      '<p data-flow-id="line">A<br data-flow-id="br">B</p>' +
        '<p data-flow-id="empty"><br></p>' +
        '<p data-flow-id="atomics"><span data-field-id="a" contenteditable="false">A</span><span data-field-id="b" contenteditable="false">B</span></p>' +
        '<table data-flow-id="table"><tbody><tr><td data-flow-id="cell"></td></tr></tbody></table>',
    );

    const afterBreak = {
      kind: 'children' as const,
      nodeId: 'line',
      index: 2,
      affinity: 'after' as const,
    };
    expect(normalizeA4SelectionRange(document, caret(afterBreak))).toMatchObject({
      status: 'mapped',
      range: { collapsed: true },
    });
    expect(
      normalizeA4SelectionRange(
        document,
        caret({ kind: 'children', nodeId: 'empty', index: 0, affinity: 'before' }),
      ),
    ).toMatchObject({ status: 'mapped' });
    expect(
      normalizeA4SelectionRange(
        document,
        caret({ kind: 'children', nodeId: 'cell', index: 0, affinity: 'after' }),
      ),
    ).toMatchObject({ status: 'mapped' });
    expect(
      normalizeA4SelectionRange(
        document,
        caret({ kind: 'children', nodeId: 'atomics', index: 1, affinity: 'after' }),
      ),
    ).toMatchObject({ status: 'mapped' });
  });

  it('normalizes reverse selections without losing direction', () => {
    const document = createA4CommandDocument(
      '<p data-flow-id="a">Alpha</p><p data-flow-id="b">Beta</p>',
    );
    expect(
      normalizeA4SelectionRange(document, {
        anchor: { kind: 'text', nodeId: 'b', offset: 2, affinity: 'after' },
        focus: { kind: 'text', nodeId: 'a', offset: 1, affinity: 'after' },
      }),
    ).toMatchObject({
      status: 'mapped',
      range: {
        direction: 'reverse',
        start: { nodeId: 'a', offset: 1 },
        end: { nodeId: 'b', offset: 2 },
      },
    });
  });

  it('rejects stale/invalid positions instead of moving to a visual page end', () => {
    const before = createA4CommandDocument('<p data-flow-id="p">Alpha</p>');
    const after = createA4CommandDocument('<p data-flow-id="p">Alpha!</p>');
    const changeMap = createA4ChangeMap(before, after, {
      sessionKey: 'doc-1',
      fromRevision: 4,
      toRevision: 5,
    });

    expect(
      mapA4PositionThroughChangeMap(changeMap, {
        sessionKey: 'doc-1',
        documentRevision: 3,
        position: { kind: 'text', nodeId: 'p', offset: 2, affinity: 'after' },
      }),
    ).toMatchObject({ status: 'rejected', code: 'stale-position' });
    expect(
      normalizeA4SelectionRange(
        before,
        caret({ kind: 'text', nodeId: 'missing', offset: 0, affinity: 'after' }),
      ),
    ).toMatchObject({ status: 'rejected', code: 'missing-node' });
  });

  it('maps retained structural positions through an insertion change', () => {
    const before = createCanonicalEditorDocument(
      '<p data-flow-id="p">Alpha</p>',
    );
    const after = createCanonicalEditorDocument(
      '<p data-flow-id="p">AlXpha</p>',
    );
    const changeMap = createA4ChangeMap(before, after, {
      sessionKey: 'doc-2',
      fromRevision: 1,
      toRevision: 2,
    });
    expect(
      mapA4PositionThroughChangeMap(changeMap, {
        sessionKey: 'doc-2',
        documentRevision: 1,
        position: { kind: 'text', nodeId: 'p', offset: 5, affinity: 'after' },
      }),
    ).toMatchObject({
      status: 'mapped',
      documentRevision: 2,
      position: { nodeId: 'p', offset: 6 },
    });
  });

  it('inserts and removes a semantic hard break inside one ordered-list item', () => {
    const document = createA4CommandDocument(
      '<ol start="5" data-flow-id="list"><li data-flow-id="item"><p data-flow-id="p">BeforeAfter</p></li><li data-flow-id="next"><p>Next</p></li></ol>',
    );
    const inserted = insertA4ManualPageBreak(
      document,
      caret({ kind: 'text', nodeId: 'p', offset: 6, affinity: 'after' }),
    );
    expect(inserted.status).toBe('applied');
    if (inserted.status !== 'applied') return;

    const root = document.createElement('div');
    root.innerHTML = inserted.document.internalHtml;
    expect(root.querySelectorAll('ol[data-flow-id="list"] > li')).toHaveLength(2);
    expect(root.querySelector('[data-flow-id="item"]')?.textContent).toBe('BeforeAfter');
    expect(root.querySelectorAll('[data-a4-break="page"]')).toHaveLength(1);
    expect(root.querySelector('ol')?.getAttribute('start')).toBe('5');

    const removed = removeA4ManualPageBreak(inserted.document, inserted.selection);
    expect(removed.status).toBe('applied');
    if (removed.status !== 'applied') return;
    const persisted = serializeA4CanonicalBreakDocument(removed.document);
    expect(persisted).toContain('<ol start="5">');
    expect(persisted).not.toContain('data-a4-break');
    expect(persisted).not.toContain('data-flow-');
  });

  it('removes exactly one adjacent manual break before ordinary text deletion', () => {
    const document = createA4CommandDocument(
      '<p data-flow-id="p">Before<span data-flow-id="break" data-a4-break="page"></span>After</p>',
    );
    const selection = caret({
      kind: 'children',
      nodeId: 'p',
      index: 2,
      affinity: 'after',
    });
    const deleted = deleteA4Selection(document, selection, 'backward');
    expect(deleted.status).toBe('applied');
    if (deleted.status !== 'applied') return;
    expect(deleted.document.internalHtml).not.toContain('data-a4-break');
    expect(visibleText(deleted.document.internalHtml)).toBe('BeforeAfter');
  });

  it('deletes a full Unicode grapheme rather than one UTF-16 code unit', () => {
    const family = '👨‍👩‍👧‍👦';
    const text = `A${family}B`;
    const document = createA4CommandDocument(
      `<p data-flow-id="p">${text}</p>`,
    );
    const deleted = deleteA4Selection(
      document,
      caret({
        kind: 'text',
        nodeId: 'p',
        offset: `A${family}`.length,
        affinity: 'after',
      }),
      'backward',
    );
    expect(deleted.status).toBe('applied');
    if (deleted.status !== 'applied') return;
    expect(visibleText(deleted.document.internalHtml)).toBe('AB');
  });

  it('deletes only a reverse selected range and preserves unselected siblings', () => {
    const document = createA4CommandDocument(
      '<p data-flow-id="a">Alpha</p><p data-flow-id="b">Beta</p><p data-flow-id="c">Gamma</p>',
    );
    const deleted = deleteA4Selection(
      document,
      {
        anchor: { kind: 'text', nodeId: 'b', offset: 2, affinity: 'after' },
        focus: { kind: 'text', nodeId: 'a', offset: 2, affinity: 'after' },
      },
      'backward',
    );
    expect(deleted.status).toBe('applied');
    if (deleted.status !== 'applied') return;
    expect(visibleText(deleted.document.internalHtml)).toContain('Al');
    expect(visibleText(deleted.document.internalHtml)).toContain('ta');
    expect(visibleText(deleted.document.internalHtml)).toContain('Gamma');
  });

  it('replaces a selected range with Enter and Shift+Enter semantics', () => {
    const source = createA4CommandDocument('<p data-flow-id="p">AlphaBeta</p>');
    const selected: A4Selection = {
      anchor: { kind: 'text', nodeId: 'p', offset: 7, affinity: 'after' },
      focus: { kind: 'text', nodeId: 'p', offset: 2, affinity: 'after' },
    };
    const paragraph = insertA4ParagraphBreak(source, selected);
    expect(paragraph.status).toBe('applied');
    if (paragraph.status === 'applied') {
      const root = document.createElement('div');
      root.innerHTML = paragraph.document.internalHtml;
      expect(root.querySelectorAll(':scope > p')).toHaveLength(2);
      expect(root.textContent).toBe('Alta');
    }

    const line = insertA4LineBreak(source, selected);
    expect(line.status).toBe('applied');
    if (line.status === 'applied') {
      const root = document.createElement('div');
      root.innerHTML = line.document.internalHtml;
      expect(root.querySelectorAll('p > br')).toHaveLength(1);
      expect(root.textContent).toBe('AlB');
    }
  });

  it('reports list context and refuses cell-interior page-break insertion', () => {
    const document = createA4CommandDocument(
      '<ol data-flow-id="outer"><li data-flow-id="outer-item"><p>One</p><ul data-flow-id="inner"><li data-flow-id="inner-item"><p data-flow-id="nested">Two</p></li></ul></li></ol>' +
        '<table><tbody><tr><td data-flow-id="cell">Cell</td></tr></tbody></table>',
    );
    expect(
      getA4ListLevelContext(document, {
        kind: 'text',
        nodeId: 'nested',
        offset: 1,
        affinity: 'after',
      }),
    ).toEqual({
      inList: true,
      level: 2,
      listNodeIds: ['outer', 'inner'],
      itemNodeId: 'inner-item',
    });
    expect(
      getInsertManualBreakCapability(
        document,
        caret({ kind: 'text', nodeId: 'cell', offset: 2, affinity: 'after' }),
      ),
    ).toMatchObject({
      applicable: false,
      code: 'table-cell-interior-unsupported',
    });
    expect(
      insertA4ManualPageBreak(
        document,
        caret({ kind: 'text', nodeId: 'cell', offset: 2, affinity: 'after' }),
      ),
    ).toMatchObject({ status: 'rejected', code: 'table-cell-interior-unsupported' });
  });

  it('never offers physical delete-page behavior for a soft continuation', () => {
    const document = createA4CommandDocument('<p data-flow-id="p">Long logical content</p>');
    expect(
      getDeleteBlankPageOrBreakCapability(
        document,
        caret({ kind: 'text', nodeId: 'p', offset: 4, affinity: 'after' }),
      ),
    ).toMatchObject({ applicable: false, scope: 'none' });
  });
});

describe('A4 S1 break readers and structural pagination', () => {
  it('reads old and new break formats without enabling a writer gate', () => {
    const legacy = '<p>Before</p><div class="page-break" data-break-type="hard"></div><p>After</p>';
    const semantic = '<p>Before<span data-a4-break="page"></span>After</p>';
    expect(detectA4BreakFormatLevel(legacy)).toBe(1);
    expect(detectA4BreakFormatLevel(semantic)).toBe(2);
    expect(readA4BreakDocument(legacy)).toMatchObject({
      formatLevel: 1,
      hasLegacyBreaks: true,
      hasSemanticBreaks: false,
    });
    expect(readA4BreakDocument(semantic)).toMatchObject({
      formatLevel: 2,
      hasSemanticBreaks: true,
    });
  });

  it('tree-partitions multiple nested breaks and preserves start=5 numbering intent', () => {
    const html = '<ol start="5" data-flow-id="list"><li data-flow-id="item"><p data-flow-id="p">Before <span data-a4-break="page"></span>Middle <span data-a4-break="page"></span>After</p></li><li><p>Next</p></li></ol>';
    const result = paginateA4StructuralHtml(
      html,
      { sessionKey: 's1-pages', documentRevision: 7 },
      characterMeasurer,
      100,
    );
    expect(result.sourceFragments).toHaveLength(3);
    expect(result.pages).toHaveLength(3);
    expect(result.pages.map((page) => page.hardBreakBefore)).toEqual([
      false,
      true,
      true,
    ]);
    expect(result.positionMap).toMatchObject({
      sessionKey: 's1-pages',
      documentRevision: 7,
    });
    expect(result.pages[0].content).toContain('start="5"');
    expect(result.pages[1].content).toContain('data-flow-continuation-item="true"');
  });

  it('keeps legacy paginate compatibility while stripping projection metadata from persisted form', () => {
    const html = '<ol start="5"><li><p>Before<span data-a4-break="page"></span>After</p></li></ol>';
    const pages = paginateFlowHtmlStructuralCompat(html, characterMeasurer, 100);
    expect(pages).toHaveLength(2);
    const reader = readA4BreakDocument(html);
    const persisted = serializeA4CanonicalBreakDocument(reader.canonical);
    expect(persisted).toContain('<span data-a4-break="page"></span>');
    expect(persisted).not.toContain('data-flow-');
    expect(persisted).not.toContain('--flow-list-start');
  });
});
