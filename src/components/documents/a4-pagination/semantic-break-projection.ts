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
  type A4SourceRangeBinding,
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

export interface A4ProjectedChildBoundaryBinding {
  projectedNodeId: string;
  projectedIndex: number;
  sourceNodeId: string;
  sourceIndex: number;
}

export interface A4StructuralProjectionFragmentPositionMap {
  fragmentIndex: number;
  sourceRanges: readonly A4SourceRangeBinding[];
  childBoundaries: readonly A4ProjectedChildBoundaryBinding[];
}

export interface A4StructuralProjectionPositionMap
  extends A4ProjectionSourceRevision {
  fragments: readonly A4StructuralProjectionFragmentPositionMap[];
}

export type A4StructuralBreakProjectionProof = Omit<
  A4BreakProjectionProof,
  'positionMap'
> & {
  positionMap: A4StructuralProjectionPositionMap;
};

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

function uniqueFlowElement(root: HTMLElement, nodeId: string): HTMLElement | null {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-id]')).filter(
    (element) => element.dataset.flowId === nodeId,
  );
  return matches.length === 1 ? matches[0] : null;
}

interface A4StructuralChildInterval {
  start: number;
  end: number;
}

function directBreakChildInterval(
  projection: A4BreakProjectionProof,
  fragmentIndex: number,
  ownerNodeId: string,
  sourceChildCount: number,
): A4StructuralChildInterval {
  const previousBreak = projection.breaks[fragmentIndex - 1]?.position ?? null;
  const nextBreak = projection.breaks[fragmentIndex]?.position ?? null;
  const start =
    previousBreak?.kind === 'children' && previousBreak.nodeId === ownerNodeId
      ? previousBreak.index + 1
      : 0;
  const end =
    nextBreak?.kind === 'children' && nextBreak.nodeId === ownerNodeId
      ? nextBreak.index
      : sourceChildCount;
  return { start, end };
}

function projectedChildMatchesSource(
  projected: ChildNode,
  source: ChildNode,
): boolean {
  if (projected.nodeType !== source.nodeType) return false;

  if (projected.nodeType === Node.TEXT_NODE) {
    return projected.textContent === source.textContent;
  }

  if (projected.nodeType === Node.ELEMENT_NODE) {
    const projectedElement = projected as HTMLElement;
    const sourceElement = source as HTMLElement;
    const projectedFlowId = projectedElement.dataset.flowId;
    const sourceFlowId = sourceElement.dataset.flowId;
    if (projectedFlowId || sourceFlowId) {
      return Boolean(
        projectedFlowId &&
          sourceFlowId &&
          projectedFlowId === sourceFlowId,
      );
    }
    return projectedElement.isEqualNode(sourceElement);
  }

  return projected.isEqualNode(source);
}

function uniqueSourceChildIndex(
  canonicalOwner: HTMLElement,
  projectedChild: ChildNode,
  interval: A4StructuralChildInterval,
): number | null {
  const matches: number[] = [];
  const lower = Math.max(0, interval.start);
  const upper = Math.min(canonicalOwner.childNodes.length, interval.end);
  for (let index = lower; index < upper; index += 1) {
    const sourceChild = canonicalOwner.childNodes[index];
    if (projectedChildMatchesSource(projectedChild, sourceChild)) {
      matches.push(index);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function mapProjectedChildBoundary(
  canonicalOwner: HTMLElement,
  projectedOwner: HTMLElement,
  projection: A4BreakProjectionProof,
  fragmentIndex: number,
  projectedIndex: number,
): number | null {
  if (
    !Number.isInteger(projectedIndex) ||
    projectedIndex < 0 ||
    projectedIndex > projectedOwner.childNodes.length
  ) {
    return null;
  }

  const ownerNodeId = canonicalOwner.dataset.flowId;
  if (!ownerNodeId) return null;
  const interval = directBreakChildInterval(
    projection,
    fragmentIndex,
    ownerNodeId,
    canonicalOwner.childNodes.length,
  );
  if (interval.start > interval.end) return null;

  if (projectedOwner.childNodes.length === 0) {
    if (canonicalOwner.childNodes.length === 0) return 0;
    return interval.start === interval.end ? interval.start : null;
  }

  const leftSourceIndex =
    projectedIndex > 0
      ? uniqueSourceChildIndex(
          canonicalOwner,
          projectedOwner.childNodes[projectedIndex - 1],
          interval,
        )
      : null;
  const rightSourceIndex =
    projectedIndex < projectedOwner.childNodes.length
      ? uniqueSourceChildIndex(
          canonicalOwner,
          projectedOwner.childNodes[projectedIndex],
          interval,
        )
      : null;

  let sourceIndex: number | null = null;
  if (leftSourceIndex !== null && rightSourceIndex !== null) {
    if (leftSourceIndex + 1 !== rightSourceIndex) return null;
    sourceIndex = rightSourceIndex;
  } else if (leftSourceIndex !== null) {
    sourceIndex = leftSourceIndex + 1;
  } else if (rightSourceIndex !== null) {
    sourceIndex = rightSourceIndex;
  }

  if (
    sourceIndex === null ||
    sourceIndex < interval.start ||
    sourceIndex > interval.end
  ) {
    return null;
  }
  return sourceIndex;
}

function buildStructuralPositionMap(
  canonical: CanonicalEditorDocument,
  projection: A4BreakProjectionProof,
): A4StructuralProjectionPositionMap {
  const canonicalRoot = document.createElement('div');
  canonicalRoot.innerHTML = canonical.internalHtml;

  return {
    sessionKey: projection.positionMap.sessionKey,
    documentRevision: projection.positionMap.documentRevision,
    fragments: projection.positionMap.fragments.map((fragmentMap) => {
      const fragment = projection.fragments[fragmentMap.fragmentIndex];
      if (!fragment) {
        return {
          fragmentIndex: fragmentMap.fragmentIndex,
          sourceRanges: fragmentMap.sourceRanges,
          childBoundaries: [],
        };
      }

      const fragmentRoot = document.createElement('div');
      fragmentRoot.innerHTML = fragment.content;
      const childBoundaries: A4ProjectedChildBoundaryBinding[] = [];
      fragmentRoot
        .querySelectorAll<HTMLElement>('[data-flow-id]')
        .forEach((projectedOwner) => {
          const nodeId = projectedOwner.dataset.flowId;
          if (!nodeId) return;
          const canonicalOwner = uniqueFlowElement(canonicalRoot, nodeId);
          if (!canonicalOwner) return;

          for (
            let projectedIndex = 0;
            projectedIndex <= projectedOwner.childNodes.length;
            projectedIndex += 1
          ) {
            const sourceIndex = mapProjectedChildBoundary(
              canonicalOwner,
              projectedOwner,
              projection,
              fragmentMap.fragmentIndex,
              projectedIndex,
            );
            if (sourceIndex === null) continue;
            childBoundaries.push({
              projectedNodeId: nodeId,
              projectedIndex,
              sourceNodeId: nodeId,
              sourceIndex,
            });
          }
        });

      return {
        fragmentIndex: fragmentMap.fragmentIndex,
        sourceRanges: fragmentMap.sourceRanges,
        childBoundaries,
      };
    }),
  };
}

/**
 * Production C03/C04 tree-aware partition. The S0 visitor is promoted behind
 * a production name and fed the fully hydrated C02 runtime identity tree.
 * S1 augments the revision-qualified text map with exact structural child
 * boundary bindings; CORE remains the only owner of document revisions.
 */
export function partitionA4SemanticBreaks(
  input: string | CanonicalEditorDocument,
  source: A4ProjectionSourceRevision,
): A4StructuralBreakProjectionProof {
  const canonical =
    typeof input === 'string' ? createCanonicalEditorDocument(input) : input;
  const projection = projectA4SemanticBreaksForProof(canonical.internalHtml, source);
  return {
    ...projection,
    positionMap: buildStructuralPositionMap(canonical, projection),
  };
}

export function mapA4ProjectedTextPoint(
  positionMap: A4ProjectionPositionMap,
  point: A4ProjectedTextPoint,
): A4MappedSourcePosition | null {
  return mapProjectedTextOffsetToSource(positionMap, point);
}

function recordedChildBoundary(
  positionMap: A4ProjectionPositionMap,
  fragmentIndex: number,
  nodeId: string,
  projectedIndex: number,
): A4ProjectedChildBoundaryBinding | null {
  const fragmentMap = positionMap.fragments.find(
    (candidate) => candidate.fragmentIndex === fragmentIndex,
  );
  if (!fragmentMap) return null;
  const structuralFragment = fragmentMap as A4ProjectionPositionMap['fragments'][number] &
    Partial<Pick<A4StructuralProjectionFragmentPositionMap, 'childBoundaries'>>;
  return (
    structuralFragment.childBoundaries?.find(
      (binding) =>
        binding.projectedNodeId === nodeId &&
        binding.projectedIndex === projectedIndex,
    ) ?? null
  );
}

/**
 * Maps text positions through the retained text-range contract and maps child
 * positions structurally. Children are never reduced to text offsets. The
 * production partition records exact child-boundary bindings; older proof
 * objects use the same bounded structural matcher on demand. Ambiguous cases
 * return null rather than redirecting a caret to a text-equivalent location.
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
  const canonicalRoot = document.createElement('div');
  canonicalRoot.innerHTML = canonical.internalHtml;
  const canonicalOwner = uniqueFlowElement(canonicalRoot, point.position.nodeId);
  if (!canonicalOwner) return null;

  const recorded = recordedChildBoundary(
    projection.positionMap,
    point.fragmentIndex,
    point.position.nodeId,
    point.position.index,
  );
  let sourceIndex = recorded?.sourceIndex ?? null;

  if (sourceIndex === null) {
    const fragmentRoot = document.createElement('div');
    fragmentRoot.innerHTML = fragment.content;
    const projectedOwner = uniqueFlowElement(fragmentRoot, point.position.nodeId);
    if (!projectedOwner) return null;
    sourceIndex = mapProjectedChildBoundary(
      canonicalOwner,
      projectedOwner,
      projection,
      point.fragmentIndex,
      point.position.index,
    );
  }
  if (sourceIndex === null) return null;

  const structural: A4Position = {
    kind: 'children',
    nodeId: point.position.nodeId,
    index: sourceIndex,
    affinity: point.position.affinity,
  };
  if (validateA4DocumentPosition(canonical, structural).status === 'rejected') {
    return null;
  }

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
