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
  createCanonicalEditorDocument,
  validateA4DocumentPosition,
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

/**
 * Reader-only format detection. Markup is authoritative because partials do
 * not have contentJson and readers must understand v2 before writers enable it.
 */
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
 * Production C03/C04 tree-aware partition. The implementation is the S0-proven
 * visitor promoted behind a production name; proof aliases remain for G0/S0
 * regression compatibility. Runtime identity is hydrated before partitioning
 * so zero-text nodes (br, empty cells, atomics) participate in C02 identity.
 */
export function partitionA4SemanticBreaks(
  input: string | CanonicalEditorDocument,
  source: A4ProjectionSourceRevision,
): A4BreakProjectionProof {
  const canonical =
    typeof input === 'string' ? createCanonicalEditorDocument(input) : input;
  return projectA4SemanticBreaksForProof(canonical.internalHtml, source);
}

/** Maps a projected text point back to its revision-qualified canonical source. */
export function mapA4ProjectedTextPoint(
  positionMap: A4ProjectionPositionMap,
  point: A4ProjectedTextPoint,
): A4MappedSourcePosition | null {
  return mapProjectedTextOffsetToSource(positionMap, point);
}

/**
 * Zero-text child boundaries retain the source node id/index/affinity supplied
 * by the projected semantic ancestry. The result is accepted only if it still
 * validates against the canonical document; there is no visual-page fallback.
 */
export function mapA4ProjectedStructuralPoint(
  canonical: CanonicalEditorDocument,
  positionMap: A4ProjectionPositionMap,
  point: A4ProjectedStructuralPoint,
): A4ProjectedStructuralMapResult {
  const fragment = positionMap.fragments.find(
    (candidate) => candidate.fragmentIndex === point.fragmentIndex,
  );
  if (!fragment) return null;
  const binding = fragment.sourceRanges.find(
    (candidate) => candidate.sourceNodeId === point.position.nodeId,
  );
  if (!binding && point.position.kind === 'text') return null;
  const validation = validateA4DocumentPosition(canonical, point.position);
  if (validation.status === 'rejected') return null;
  return {
    sessionKey: positionMap.sessionKey,
    documentRevision: positionMap.documentRevision,
    position: point.position,
  };
}

/** Persisted form: authored old/new break markup retained, runtime projection removed. */
export function serializeA4CanonicalBreakDocument(
  canonical: CanonicalEditorDocument | string,
): string {
  return serializeA4SemanticProofHtml(
    typeof canonical === 'string' ? canonical : canonical.internalHtml,
  );
}
