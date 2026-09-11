import type { EditorRevision, EditorSessionKey } from './editor-session';
import {
  mapProjectedTextOffsetToSource,
  projectA4SemanticBreaksForProof,
  serializeA4SemanticProofHtml,
  type A4BreakProjectionProof,
  type A4MappedSourcePosition,
  type A4ProjectedTextPoint,
  type A4ProjectionPositionMap,
  type A4ProjectionSourceRevision,
} from './semantic-page-breaks';
import {
  captureA4Position,
  createCanonicalEditorDocument,
  resolveA4Position,
  type A4Position,
  type CanonicalEditorDocument,
} from './structural-position';

export type A4BreakFormatLevel = 1 | 2;

export interface A4BreakReaderResult {
  formatLevel: A4BreakFormatLevel;
  hasLegacyBreaks: boolean;
  hasSemanticBreaks: boolean;
  canonical: CanonicalEditorDocument;
}

export interface A4ProjectedStructuralPoint {
  fragmentIndex: number;
  position: A4Position;
}

export type A4ProjectedStructuralMapResult =
  | A4MappedSourcePosition
  | {
      sessionKey: EditorSessionKey;
      documentRevision: EditorRevision;
      position: A4Position;
    }
  | null;

/** Reader-only detection; markup is authoritative for partials without JSON. */
export function detectA4BreakFormatLevel(input: string): A4BreakFormatLevel {
  return /<span\b[^>]*data-a4-break\s*=\s*["']page["'][^>]*>/i.test(input)
    ? 2
    : 1;
}

export function readA4BreakDocument(input: string): A4BreakReaderResult {
  const canonical = createCanonicalEditorDocument(input);
  return {
    formatLevel: detectA4BreakFormatLevel(input),
    hasLegacyBreaks: /<div\b[^>]*class\s*=\s*["'][^"']*\bpage-break\b/i.test(input),
    hasSemanticBreaks: detectA4BreakFormatLevel(input) === 2,
    canonical,
  };
}

/**
 * Production C03/C04 tree-aware partition. The S0 visitor is promoted behind
 * a production name and fed the fully hydrated C02 runtime identity tree.
 */
export function partitionA4SemanticBreaks(
  input: string | CanonicalEditorDocument,
  source: A4ProjectionSourceRevision,
): A4BreakProjectionProof {
  const canonical =
    typeof input === 'string' ? createCanonicalEditorDocument(input) : input;
  return projectA4SemanticBreaksForProof(canonical.internalHtml, source);
}

export function mapA4ProjectedTextPoint(
  positionMap: A4ProjectionPositionMap,
  point: A4ProjectedTextPoint,
): A4MappedSourcePosition | null {
  return mapProjectedTextOffsetToSource(positionMap, point);
}

function uniqueFlowElement(root: HTMLElement, nodeId: string): HTMLElement | null {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-id]')).filter(
    (element) => element.dataset.flowId === nodeId,
  );
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Maps both text and zero-text child boundaries from a projected fragment to
 * the canonical source. Child positions are first reduced to the fragment's
 * text offset, then recaptured against canonical runtime structure so a
 * before/after BR, atomic, empty block or break remains a children position.
 */
export function mapA4ProjectedStructuralPoint(
  canonical: CanonicalEditorDocument,
  projection: A4BreakProjectionProof,
  point: A4ProjectedStructuralPoint,
): A4ProjectedStructuralMapResult {
  if (point.position.kind === 'text') {
    return mapProjectedTextOffsetToSource(projection.positionMap, {
      fragmentIndex: point.fragmentIndex,
      sourceNodeId: point.position.nodeId,
      projectedOffset: point.position.offset,
      affinity: point.position.affinity,
    });
  }

  const fragment = projection.fragments[point.fragmentIndex];
  if (!fragment) return null;
  const fragmentRoot = document.createElement('div');
  fragmentRoot.innerHTML = fragment.content;
  const projectedOwner = uniqueFlowElement(fragmentRoot, point.position.nodeId);
  if (
    !projectedOwner ||
    point.position.index < 0 ||
    point.position.index > projectedOwner.childNodes.length
  ) {
    return null;
  }

  const projectedRange = document.createRange();
  projectedRange.setStart(projectedOwner, 0);
  projectedRange.setEnd(projectedOwner, point.position.index);
  const mappedText = mapProjectedTextOffsetToSource(projection.positionMap, {
    fragmentIndex: point.fragmentIndex,
    sourceNodeId: point.position.nodeId,
    projectedOffset: projectedRange.toString().length,
    affinity: point.position.affinity,
  });
  if (!mappedText) return null;

  const canonicalRoot = document.createElement('div');
  canonicalRoot.innerHTML = canonical.internalHtml;
  const canonicalDomPoint = resolveA4Position(canonicalRoot, mappedText.position);
  if (!canonicalDomPoint) return null;
  const structural = captureA4Position(
    canonicalRoot,
    canonicalDomPoint.node,
    canonicalDomPoint.offset,
    point.position.affinity,
  );
  if (!structural) return null;
  return {
    sessionKey: projection.positionMap.sessionKey,
    documentRevision: projection.positionMap.documentRevision,
    position: structural,
  };
}

/** Persisted form retains authored breaks and strips runtime projection data. */
export function serializeA4CanonicalBreakDocument(
  canonical: CanonicalEditorDocument | string,
): string {
  return serializeA4SemanticProofHtml(
    typeof canonical === 'string' ? canonical : canonical.internalHtml,
  );
}
