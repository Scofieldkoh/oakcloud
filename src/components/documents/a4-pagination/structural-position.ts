import type { EditorRevision, EditorSessionKey } from './editor-session';
import {
  ensureFlowId,
  hydrateFlowContainer,
  normalizeCanonicalHtml,
  normalizeEditedFlowIds,
} from './model';
import type { FlowPoint, FlowSelectionBookmark } from './selection';

export type A4PositionAffinity = 'before' | 'after';

export type A4Position =
  | {
      kind: 'text';
      nodeId: string;
      offset: number;
      affinity: A4PositionAffinity;
    }
  | {
      kind: 'children';
      nodeId: string;
      index: number;
      affinity: A4PositionAffinity;
    };

export interface A4Selection {
  anchor: A4Position;
  focus: A4Position;
}

/**
 * C02 canonical document boundary. Runtime flow ids are semantic editing ids,
 * not persisted field ids and not a second durable document representation.
 */
export interface CanonicalEditorDocument {
  readonly internalHtml: string;
}

export type A4TransactionResult =
  | {
      status: 'applied';
      document: CanonicalEditorDocument;
      selection: A4Selection;
      changedNodeIds: readonly string[];
    }
  | { status: 'unchanged'; reason: string }
  | { status: 'rejected'; code: string; message: string };

export interface A4DomPoint {
  node: Node;
  offset: number;
}

export type A4PositionValidationCode =
  | 'missing-node'
  | 'ambiguous-node'
  | 'invalid-offset'
  | 'invalid-position';

export type A4PositionValidationResult =
  | { status: 'valid'; position: A4Position }
  | {
      status: 'rejected';
      code: A4PositionValidationCode;
      message: string;
    };

export type A4PositionComparisonResult =
  | { status: 'compared'; order: -1 | 0 | 1 }
  | {
      status: 'rejected';
      code: A4PositionValidationCode;
      message: string;
    };

export interface A4StructuralRange {
  start: A4Position;
  end: A4Position;
}

export interface A4NormalizedSelectionRange extends A4StructuralRange {
  direction: 'forward' | 'reverse';
  collapsed: boolean;
}

export type A4SelectionRangeResult =
  | { status: 'mapped'; range: A4NormalizedSelectionRange }
  | {
      status: 'rejected';
      code: A4PositionValidationCode;
      message: string;
    };

export type A4StructuralRangeComparisonResult =
  | { status: 'compared'; order: -1 | 0 | 1 }
  | {
      status: 'rejected';
      code: A4PositionValidationCode;
      message: string;
    };

export interface A4RevisionedPosition {
  sessionKey: EditorSessionKey;
  documentRevision: EditorRevision;
  position: A4Position;
}

export interface A4ChangeMapIdentity {
  sessionKey: EditorSessionKey;
  fromRevision: EditorRevision;
  toRevision: EditorRevision;
}

interface A4NodeChange {
  nodeId: string;
  beforeText: string;
  afterText: string;
  beforeChildren: readonly string[];
  afterChildren: readonly string[];
}

/**
 * A change map never allocates revisions. CORE supplies the before/after
 * revision identity and SEMANTICS records how retained semantic nodes changed.
 */
export interface A4ChangeMap extends A4ChangeMapIdentity {
  before: CanonicalEditorDocument;
  after: CanonicalEditorDocument;
  nodes: readonly A4NodeChange[];
  removedNodeIds: readonly string[];
}

export type A4ChangeMapResult =
  | {
      status: 'mapped' | 'unchanged';
      sessionKey: EditorSessionKey;
      documentRevision: EditorRevision;
      position: A4Position;
    }
  | {
      status: 'rejected';
      code:
        | 'session-mismatch'
        | 'stale-position'
        | 'deleted-node'
        | 'invalid-position';
      message: string;
    };

const STRUCTURAL_IDENTITY_SELECTOR = [
  'p',
  'div',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ol',
  'ul',
  'li',
  'table',
  'caption',
  'colgroup',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'br',
  '.page-break',
  '[data-a4-break="page"]',
  '[data-field-id]',
  '[data-placeholder-id]',
  '[data-placeholder-key]',
  '[data-reference-id]',
  '[data-field-key]',
  '[data-field-reference]',
  '[contenteditable="false"]',
].join(',');

const STRUCTURAL_BOUNDARY_SELECTOR = [
  'br',
  '.page-break',
  '[data-a4-break="page"]',
  '[data-field-id]',
  '[data-placeholder-id]',
  '[data-placeholder-key]',
  '[data-reference-id]',
  '[data-field-key]',
  '[data-field-reference]',
  '[contenteditable="false"]',
].join(',');

function rootForInternalHtml(internalHtml: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = internalHtml;
  return root;
}

/**
 * Hydrates every semantic node needed by C02. IDs are runtime flow identity;
 * stripFlowMetadata remains the persistence boundary and removes them.
 */
export function hydrateA4RuntimeIdentity(root: HTMLElement): void {
  hydrateFlowContainer(root);
  root
    .querySelectorAll<HTMLElement>(STRUCTURAL_IDENTITY_SELECTOR)
    .forEach((element) => ensureFlowId(element));
  normalizeEditedFlowIds(root);
}

export function hydrateA4RuntimeHtml(input: string): string {
  const root = document.createElement('div');
  // Internal documents already carry runtime ids. Avoid re-normalizing legacy
  // hard-break elements in that case because normalization intentionally strips
  // their transient attributes at the persisted HTML boundary.
  root.innerHTML = input.includes('data-flow-id=')
    ? input
    : normalizeCanonicalHtml(input);
  hydrateA4RuntimeIdentity(root);
  return root.innerHTML;
}

export function createCanonicalEditorDocument(
  input: string,
): CanonicalEditorDocument {
  return { internalHtml: hydrateA4RuntimeHtml(input) };
}

function flowElementsById(root: HTMLElement, nodeId: string): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  if (root.dataset.flowId === nodeId) candidates.push(root);
  root.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    if (element.dataset.flowId === nodeId) candidates.push(element);
  });
  return candidates;
}

function flowElementById(root: HTMLElement, nodeId: string): HTMLElement | null {
  const candidates = flowElementsById(root, nodeId);
  return candidates.length === 1 ? candidates[0] : null;
}

function flowElementForPoint(root: HTMLElement, node: Node): HTMLElement | null {
  if (!root.contains(node)) return null;
  let element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  while (element) {
    if (element.dataset.flowId) return element;
    if (element === root) break;
    element = element.parentElement;
  }
  return null;
}

function directChildWithin(ancestor: HTMLElement, node: Node): Node | null {
  let current: Node | null = node;
  while (current && current.parentNode !== ancestor) {
    current = current.parentNode;
  }
  return current?.parentNode === ancestor ? current : null;
}

function isStructuralBoundary(node: Node | null): boolean {
  return (
    node?.nodeType === Node.ELEMENT_NODE &&
    (node as Element).matches(STRUCTURAL_BOUNDARY_SELECTOR)
  );
}

function structuralAffinityAtChildBoundary(
  element: HTMLElement,
  index: number,
  fallback: A4PositionAffinity,
): A4PositionAffinity {
  const previousIsStructural = isStructuralBoundary(
    element.childNodes[index - 1] ?? null,
  );
  const nextIsStructural = isStructuralBoundary(
    element.childNodes[index] ?? null,
  );
  if (previousIsStructural && !nextIsStructural) return 'after';
  if (nextIsStructural && !previousIsStructural) return 'before';
  return fallback;
}

function textOffsetWithin(
  element: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  const range = document.createRange();
  range.setStart(element, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}

function textLength(element: HTMLElement): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    total += node.textContent?.length ?? 0;
  }
  return total;
}

function structuralBoundaryAtTextOffset(
  element: HTMLElement,
  offset: number,
  affinity: A4PositionAffinity,
): A4DomPoint | null {
  const candidates: A4DomPoint[] = [];
  element
    .querySelectorAll<HTMLElement>(STRUCTURAL_BOUNDARY_SELECTOR)
    .forEach((boundary) => {
      const parent = boundary.parentNode;
      if (!parent) return;
      const index = Array.prototype.indexOf.call(
        parent.childNodes,
        boundary,
      ) as number;
      if (index < 0) return;
      const point =
        affinity === 'before'
          ? { node: parent, offset: index }
          : { node: parent, offset: index + 1 };
      const logicalOffset = textOffsetWithin(element, point.node, point.offset);
      if (logicalOffset === offset) candidates.push(point);
    });
  if (candidates.length === 0) return null;
  return affinity === 'before'
    ? candidates[0]
    : candidates[candidates.length - 1];
}

function sameDomPoint(left: A4DomPoint, right: A4DomPoint): boolean {
  return left.node === right.node && left.offset === right.offset;
}

export function captureA4Position(
  root: HTMLElement,
  node: Node,
  offset: number,
  affinity: A4PositionAffinity = 'after',
): A4Position | null {
  if (!root.contains(node) || !Number.isInteger(offset) || offset < 0) {
    return null;
  }
  const flowElement = flowElementForPoint(root, node);
  const nodeId = flowElement?.dataset.flowId;
  if (!flowElement || !nodeId) return null;

  if (node.nodeType === Node.ELEMENT_NODE && node === flowElement) {
    if (offset > flowElement.childNodes.length) return null;
    return {
      kind: 'children',
      nodeId,
      index: offset,
      affinity: structuralAffinityAtChildBoundary(flowElement, offset, affinity),
    };
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const valueLength = node.textContent?.length ?? 0;
    if (offset > valueLength) return null;
    const directChild = directChildWithin(flowElement, node);
    if (directChild) {
      const childIndex = Array.prototype.indexOf.call(
        flowElement.childNodes,
        directChild,
      ) as number;
      if (offset === 0 && isStructuralBoundary(directChild.previousSibling)) {
        return {
          kind: 'children',
          nodeId,
          index: childIndex,
          affinity: 'after',
        };
      }
      if (
        offset === valueLength &&
        isStructuralBoundary(directChild.nextSibling)
      ) {
        return {
          kind: 'children',
          nodeId,
          index: childIndex + 1,
          affinity: 'before',
        };
      }
    }
  }

  const logicalOffset = textOffsetWithin(flowElement, node, offset);
  if (logicalOffset === null || logicalOffset > textLength(flowElement)) {
    return null;
  }
  return { kind: 'text', nodeId, offset: logicalOffset, affinity };
}

export function captureA4SelectionFromDomPoints(
  root: HTMLElement,
  anchor: A4DomPoint,
  focus: A4DomPoint,
): A4Selection | null {
  if (sameDomPoint(anchor, focus)) {
    const collapsed = captureA4Position(
      root,
      anchor.node,
      anchor.offset,
      'after',
    );
    return collapsed ? { anchor: collapsed, focus: collapsed } : null;
  }

  const capturedAnchor = captureA4Position(
    root,
    anchor.node,
    anchor.offset,
    'after',
  );
  const capturedFocus = captureA4Position(
    root,
    focus.node,
    focus.offset,
    'after',
  );
  if (!capturedAnchor || !capturedFocus) return null;
  return { anchor: capturedAnchor, focus: capturedFocus };
}

export function captureA4Selection(root: HTMLElement): A4Selection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return captureA4SelectionFromDomPoints(
    root,
    { node: selection.anchorNode!, offset: selection.anchorOffset },
    { node: selection.focusNode!, offset: selection.focusOffset },
  );
}

export function resolveA4Position(
  root: HTMLElement,
  position: A4Position,
): A4DomPoint | null {
  const element = flowElementById(root, position.nodeId);
  if (!element) return null;

  if (position.kind === 'children') {
    if (
      !Number.isInteger(position.index) ||
      position.index < 0 ||
      position.index > element.childNodes.length
    ) {
      return null;
    }
    return { node: element, offset: position.index };
  }

  const total = textLength(element);
  if (
    !Number.isInteger(position.offset) ||
    position.offset < 0 ||
    position.offset > total
  ) {
    return null;
  }

  const structuralBoundary = structuralBoundaryAtTextOffset(
    element,
    position.offset,
    position.affinity,
  );
  if (structuralBoundary) return structuralBoundary;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) textNodes.push(node as Text);

  if (textNodes.length === 0) {
    return position.offset === 0
      ? {
          node: element,
          offset:
            position.affinity === 'before' ? 0 : element.childNodes.length,
        }
      : null;
  }

  let consumed = 0;
  for (let index = 0; index < textNodes.length; index += 1) {
    const textNode = textNodes[index];
    const length = textNode.textContent?.length ?? 0;
    const start = consumed;
    const end = start + length;

    if (position.offset > start && position.offset < end) {
      return { node: textNode, offset: position.offset - start };
    }

    if (position.offset === start) {
      if (position.affinity === 'before' && index > 0) {
        const previous = textNodes[index - 1];
        return {
          node: previous,
          offset: previous.textContent?.length ?? 0,
        };
      }
      return { node: textNode, offset: 0 };
    }

    if (position.offset === end) {
      if (position.affinity === 'after' && index + 1 < textNodes.length) {
        return { node: textNodes[index + 1], offset: 0 };
      }
      return { node: textNode, offset: length };
    }

    consumed = end;
  }

  const last = textNodes[textNodes.length - 1];
  return { node: last, offset: last.textContent?.length ?? 0 };
}

export function validateA4Position(
  root: HTMLElement,
  position: A4Position,
): A4PositionValidationResult {
  const matches = flowElementsById(root, position.nodeId);
  if (matches.length === 0) {
    return {
      status: 'rejected',
      code: 'missing-node',
      message: `Semantic node ${position.nodeId} is no longer present.`,
    };
  }
  if (matches.length > 1) {
    return {
      status: 'rejected',
      code: 'ambiguous-node',
      message: `Semantic node ${position.nodeId} is ambiguous in the canonical document.`,
    };
  }

  const element = matches[0];
  const maximum =
    position.kind === 'text' ? textLength(element) : element.childNodes.length;
  const requested = position.kind === 'text' ? position.offset : position.index;
  if (!Number.isInteger(requested) || requested < 0 || requested > maximum) {
    return {
      status: 'rejected',
      code: 'invalid-offset',
      message: `Structural ${position.kind} offset ${requested} is outside semantic node ${position.nodeId}.`,
    };
  }

  if (!resolveA4Position(root, position)) {
    return {
      status: 'rejected',
      code: 'invalid-position',
      message: `Structural position on ${position.nodeId} cannot be resolved.`,
    };
  }
  return { status: 'valid', position };
}

export function validateA4DocumentPosition(
  canonical: CanonicalEditorDocument,
  position: A4Position,
): A4PositionValidationResult {
  return validateA4Position(rootForInternalHtml(canonical.internalHtml), position);
}

function compareDomPoints(left: A4DomPoint, right: A4DomPoint): -1 | 0 | 1 {
  if (sameDomPoint(left, right)) return 0;
  const leftRange = document.createRange();
  leftRange.setStart(left.node, left.offset);
  leftRange.collapse(true);
  const rightRange = document.createRange();
  rightRange.setStart(right.node, right.offset);
  rightRange.collapse(true);
  const comparison = leftRange.compareBoundaryPoints(
    Range.START_TO_START,
    rightRange,
  );
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

function comparisonRejection(
  result: A4PositionValidationResult,
): Extract<A4PositionComparisonResult, { status: 'rejected' }> {
  if (result.status === 'valid') {
    return {
      status: 'rejected',
      code: 'invalid-position',
      message: 'Structural position could not be compared.',
    };
  }
  return result;
}

export function compareA4Positions(
  canonical: CanonicalEditorDocument,
  left: A4Position,
  right: A4Position,
): A4PositionComparisonResult {
  const root = rootForInternalHtml(canonical.internalHtml);
  const leftValidation = validateA4Position(root, left);
  if (leftValidation.status === 'rejected') {
    return comparisonRejection(leftValidation);
  }
  const rightValidation = validateA4Position(root, right);
  if (rightValidation.status === 'rejected') {
    return comparisonRejection(rightValidation);
  }
  const leftPoint = resolveA4Position(root, left);
  const rightPoint = resolveA4Position(root, right);
  if (!leftPoint || !rightPoint) {
    return {
      status: 'rejected',
      code: 'invalid-position',
      message: 'Structural position could not be resolved for comparison.',
    };
  }
  return { status: 'compared', order: compareDomPoints(leftPoint, rightPoint) };
}

export function normalizeA4SelectionRange(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4SelectionRangeResult {
  const comparison = compareA4Positions(
    canonical,
    selection.anchor,
    selection.focus,
  );
  if (comparison.status === 'rejected') return comparison;
  const forward = comparison.order <= 0;
  return {
    status: 'mapped',
    range: {
      start: forward ? selection.anchor : selection.focus,
      end: forward ? selection.focus : selection.anchor,
      direction: forward ? 'forward' : 'reverse',
      collapsed: comparison.order === 0,
    },
  };
}

export function compareA4StructuralRanges(
  canonical: CanonicalEditorDocument,
  left: A4StructuralRange,
  right: A4StructuralRange,
): A4StructuralRangeComparisonResult {
  const starts = compareA4Positions(canonical, left.start, right.start);
  if (starts.status === 'rejected') return starts;
  if (starts.order !== 0) return starts;
  return compareA4Positions(canonical, left.end, right.end);
}

function childSignature(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return '#text';
  if (node.nodeType !== Node.ELEMENT_NODE) return `#node:${node.nodeType}`;
  const element = node as HTMLElement;
  const flowId = element.dataset.flowId;
  return flowId
    ? `id:${flowId}`
    : `tag:${element.tagName}:${element.textContent ?? ''}`;
}

function uniqueSemanticNodes(root: HTMLElement): Map<string, HTMLElement> {
  const grouped = new Map<string, HTMLElement[]>();
  root.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    const nodeId = element.dataset.flowId;
    if (!nodeId) return;
    grouped.set(nodeId, [...(grouped.get(nodeId) ?? []), element]);
  });
  const unique = new Map<string, HTMLElement>();
  grouped.forEach((elements, nodeId) => {
    if (elements.length === 1) unique.set(nodeId, elements[0]);
  });
  return unique;
}

export function createA4ChangeMap(
  before: CanonicalEditorDocument,
  after: CanonicalEditorDocument,
  identity: A4ChangeMapIdentity,
): A4ChangeMap {
  const beforeRoot = rootForInternalHtml(before.internalHtml);
  const afterRoot = rootForInternalHtml(after.internalHtml);
  const beforeNodes = uniqueSemanticNodes(beforeRoot);
  const afterNodes = uniqueSemanticNodes(afterRoot);
  const nodes: A4NodeChange[] = [];
  const removedNodeIds: string[] = [];

  beforeNodes.forEach((beforeNode, nodeId) => {
    const afterNode = afterNodes.get(nodeId);
    if (!afterNode) {
      removedNodeIds.push(nodeId);
      return;
    }
    nodes.push({
      nodeId,
      beforeText: beforeNode.textContent ?? '',
      afterText: afterNode.textContent ?? '',
      beforeChildren: Array.from(beforeNode.childNodes).map(childSignature),
      afterChildren: Array.from(afterNode.childNodes).map(childSignature),
    });
  });

  return {
    ...identity,
    before,
    after,
    nodes,
    removedNodeIds,
  };
}

function commonPrefixLength(left: string, right: string): number {
  const maximum = Math.min(left.length, right.length);
  let index = 0;
  while (index < maximum && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  prefixLength: number,
): number {
  const maximum = Math.min(left.length, right.length) - prefixLength;
  let count = 0;
  while (
    count < maximum &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

function commonArrayPrefixLength(
  left: readonly string[],
  right: readonly string[],
): number {
  const maximum = Math.min(left.length, right.length);
  let index = 0;
  while (index < maximum && left[index] === right[index]) index += 1;
  return index;
}

function commonArraySuffixLength(
  left: readonly string[],
  right: readonly string[],
  prefixLength: number,
): number {
  const maximum = Math.min(left.length, right.length) - prefixLength;
  let count = 0;
  while (
    count < maximum &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

function mapSpliceOffset(
  requested: number,
  affinity: A4PositionAffinity,
  beforeLength: number,
  afterLength: number,
  prefixLength: number,
  suffixLength: number,
): number {
  const beforeChangedEnd = beforeLength - suffixLength;
  const afterChangedEnd = afterLength - suffixLength;
  if (requested < prefixLength) return requested;
  if (requested > beforeChangedEnd) {
    return requested + (afterLength - beforeLength);
  }
  if (requested === prefixLength) {
    return affinity === 'before' ? prefixLength : afterChangedEnd;
  }
  if (requested === beforeChangedEnd) {
    return affinity === 'after' ? afterChangedEnd : prefixLength;
  }
  return affinity === 'before' ? prefixLength : afterChangedEnd;
}

export function mapA4PositionThroughChangeMap(
  changeMap: A4ChangeMap,
  source: A4RevisionedPosition,
): A4ChangeMapResult {
  if (source.sessionKey !== changeMap.sessionKey) {
    return {
      status: 'rejected',
      code: 'session-mismatch',
      message: 'The position belongs to a different editor session.',
    };
  }
  if (source.documentRevision !== changeMap.fromRevision) {
    return {
      status: 'rejected',
      code: 'stale-position',
      message: `The position targets revision ${source.documentRevision}, not retained revision ${changeMap.fromRevision}.`,
    };
  }
  if (changeMap.removedNodeIds.includes(source.position.nodeId)) {
    return {
      status: 'rejected',
      code: 'deleted-node',
      message: `Semantic node ${source.position.nodeId} was removed by the retained change.`,
    };
  }

  const node = changeMap.nodes.find(
    (candidate) => candidate.nodeId === source.position.nodeId,
  );
  if (!node) {
    return {
      status: 'rejected',
      code: 'invalid-position',
      message: `Semantic node ${source.position.nodeId} cannot be mapped through this change.`,
    };
  }

  let position: A4Position;
  if (source.position.kind === 'text') {
    const prefixLength = commonPrefixLength(node.beforeText, node.afterText);
    const suffixLength = commonSuffixLength(
      node.beforeText,
      node.afterText,
      prefixLength,
    );
    position = {
      ...source.position,
      offset: mapSpliceOffset(
        source.position.offset,
        source.position.affinity,
        node.beforeText.length,
        node.afterText.length,
        prefixLength,
        suffixLength,
      ),
    };
  } else {
    const prefixLength = commonArrayPrefixLength(
      node.beforeChildren,
      node.afterChildren,
    );
    const suffixLength = commonArraySuffixLength(
      node.beforeChildren,
      node.afterChildren,
      prefixLength,
    );
    position = {
      ...source.position,
      index: mapSpliceOffset(
        source.position.index,
        source.position.affinity,
        node.beforeChildren.length,
        node.afterChildren.length,
        prefixLength,
        suffixLength,
      ),
    };
  }

  const validation = validateA4DocumentPosition(changeMap.after, position);
  if (validation.status === 'rejected') {
    return {
      status: 'rejected',
      code: 'invalid-position',
      message: validation.message,
    };
  }

  return {
    status:
      JSON.stringify(position) === JSON.stringify(source.position)
        ? 'unchanged'
        : 'mapped',
    sessionKey: changeMap.sessionKey,
    documentRevision: changeMap.toRevision,
    position,
  };
}

/**
 * Compatibility adapter for existing text-offset FlowPoint callers. It cannot
 * invent zero-text boundary affinity; callers that need that distinction must
 * use A4Position directly.
 */
export function a4PositionFromFlowPoint(
  canonical: CanonicalEditorDocument,
  point: FlowPoint,
  affinity: A4PositionAffinity = 'after',
): A4PositionValidationResult {
  const position: A4Position = {
    kind: 'text',
    nodeId: point.flowId,
    offset: point.offset,
    affinity,
  };
  return validateA4DocumentPosition(canonical, position);
}

export function flowPointFromA4Position(
  canonical: CanonicalEditorDocument,
  position: A4Position,
): FlowPoint | null {
  const root = rootForInternalHtml(canonical.internalHtml);
  const validation = validateA4Position(root, position);
  if (validation.status === 'rejected') return null;
  const element = flowElementById(root, position.nodeId);
  const point = resolveA4Position(root, position);
  if (!element || !point) return null;
  const offset = textOffsetWithin(element, point.node, point.offset);
  return offset === null ? null : { flowId: position.nodeId, offset };
}

export function a4SelectionFromFlowBookmark(
  canonical: CanonicalEditorDocument,
  bookmark: FlowSelectionBookmark,
): A4Selection | null {
  const anchor = a4PositionFromFlowPoint(canonical, bookmark.anchor);
  const focus = a4PositionFromFlowPoint(canonical, bookmark.focus);
  if (anchor.status === 'rejected' || focus.status === 'rejected') return null;
  return { anchor: anchor.position, focus: focus.position };
}

export function flowBookmarkFromA4Selection(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): FlowSelectionBookmark | null {
  const anchor = flowPointFromA4Position(canonical, selection.anchor);
  const focus = flowPointFromA4Position(canonical, selection.focus);
  if (!anchor || !focus) return null;
  const comparison = compareA4Positions(
    canonical,
    selection.anchor,
    selection.focus,
  );
  if (comparison.status === 'rejected') return null;
  return {
    anchor,
    focus,
    collapsed: comparison.order === 0,
  };
}
