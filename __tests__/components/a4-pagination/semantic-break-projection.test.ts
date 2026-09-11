import { describe, expect, it } from 'vitest';
import {
  mapA4ProjectedStructuralPoint,
  partitionA4SemanticBreaks,
  type A4StructuralBreakProjectionProof,
} from '@/components/documents/a4-pagination/semantic-break-projection';
import {
  createCanonicalEditorDocument,
  type A4Position,
  type CanonicalEditorDocument,
} from '@/components/documents/a4-pagination/structural-position';

const SOURCE = {
  sessionKey: 's1-structural-projection',
  documentRevision: 11,
} as const;

function project(html: string): {
  canonical: CanonicalEditorDocument;
  projection: A4StructuralBreakProjectionProof;
} {
  const canonical = createCanonicalEditorDocument(html);
  return {
    canonical,
    projection: partitionA4SemanticBreaks(canonical, SOURCE),
  };
}

function mapPosition(
  canonical: CanonicalEditorDocument,
  projection: A4StructuralBreakProjectionProof,
  fragmentIndex: number,
  position: A4Position,
) {
  return mapA4ProjectedStructuralPoint(canonical, projection, {
    fragmentIndex,
    position,
  });
}

describe('A4 S1 structural projection mapping', () => {
  it('preserves each adjacent BR child boundary exactly', () => {
    const { canonical, projection } = project(
      '<p data-flow-id="p">A<br><br>B</p>',
    );

    for (const position of [
      { kind: 'children' as const, nodeId: 'p', index: 1, affinity: 'before' as const },
      { kind: 'children' as const, nodeId: 'p', index: 2, affinity: 'after' as const },
      { kind: 'children' as const, nodeId: 'p', index: 3, affinity: 'after' as const },
    ]) {
      expect(mapPosition(canonical, projection, 0, position)).toEqual({
        sessionKey: SOURCE.sessionKey,
        documentRevision: SOURCE.documentRevision,
        position,
      });
    }
  });

  it('does not collapse the boundary between adjacent zero-text atomic nodes', () => {
    const { canonical, projection } = project(
      '<p data-flow-id="p"><span data-field-id="a" contenteditable="false"></span><span data-reference-id="b" contenteditable="false"></span></p>',
    );
    const position: A4Position = {
      kind: 'children',
      nodeId: 'p',
      index: 1,
      affinity: 'after',
    };

    expect(mapPosition(canonical, projection, 0, position)).toEqual({
      sessionKey: SOURCE.sessionKey,
      documentRevision: SOURCE.documentRevision,
      position,
    });
  });

  it('keeps exact boundaries on both sides of a semantic break next to BR and atomic nodes', () => {
    const { canonical, projection } = project(
      '<p data-flow-id="p"><br><span data-a4-break="page"></span><span data-field-id="x" contenteditable="false"></span></p>',
    );

    expect(projection.fragments).toHaveLength(2);
    expect(projection.positionMap.fragments[0].childBoundaries).toContainEqual({
      projectedNodeId: 'p',
      projectedIndex: 1,
      sourceNodeId: 'p',
      sourceIndex: 1,
    });
    expect(projection.positionMap.fragments[1].childBoundaries).toContainEqual({
      projectedNodeId: 'p',
      projectedIndex: 0,
      sourceNodeId: 'p',
      sourceIndex: 2,
    });
    expect(
      mapPosition(canonical, projection, 0, {
        kind: 'children',
        nodeId: 'p',
        index: 1,
        affinity: 'after',
      }),
    ).toEqual({
      sessionKey: SOURCE.sessionKey,
      documentRevision: SOURCE.documentRevision,
      position: {
        kind: 'children',
        nodeId: 'p',
        index: 1,
        affinity: 'after',
      },
    });
    expect(
      mapPosition(canonical, projection, 1, {
        kind: 'children',
        nodeId: 'p',
        index: 0,
        affinity: 'before',
      }),
    ).toEqual({
      sessionKey: SOURCE.sessionKey,
      documentRevision: SOURCE.documentRevision,
      position: {
        kind: 'children',
        nodeId: 'p',
        index: 2,
        affinity: 'before',
      },
    });
  });

  it('maps empty paragraph and empty cell owners without inventing text offsets', () => {
    const { canonical, projection } = project(
      '<p data-flow-id="empty"></p>' +
        '<table><tbody><tr><td data-flow-id="cell"></td></tr></tbody></table>',
    );

    expect(
      mapPosition(canonical, projection, 0, {
        kind: 'children',
        nodeId: 'empty',
        index: 0,
        affinity: 'before',
      }),
    ).toMatchObject({
      position: {
        kind: 'children',
        nodeId: 'empty',
        index: 0,
        affinity: 'before',
      },
    });
    expect(
      mapPosition(canonical, projection, 0, {
        kind: 'children',
        nodeId: 'cell',
        index: 0,
        affinity: 'after',
      }),
    ).toMatchObject({
      position: {
        kind: 'children',
        nodeId: 'cell',
        index: 0,
        affinity: 'after',
      },
    });
  });

  it('keeps text projection mapping on the existing text-range path', () => {
    const { canonical, projection } = project(
      '<p data-flow-id="p">Hello<span data-a4-break="page"></span>World</p>',
    );

    expect(
      mapPosition(canonical, projection, 1, {
        kind: 'text',
        nodeId: 'p',
        offset: 2,
        affinity: 'after',
      }),
    ).toEqual({
      sessionKey: SOURCE.sessionKey,
      documentRevision: SOURCE.documentRevision,
      position: {
        kind: 'text',
        nodeId: 'p',
        offset: 7,
        affinity: 'after',
      },
    });
  });
});
