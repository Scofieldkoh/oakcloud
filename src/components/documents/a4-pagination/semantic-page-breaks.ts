import {
  ensureFlowId,
  normalizeCanonicalHtml,
  stripFlowMetadata,
} from './model';
import type { EditorRevision, EditorSessionKey } from './editor-session';
import {
  resolveA4Position,
  type A4Position,
  type A4Selection,
} from './structural-position';

export const INLINE_A4_PAGE_BREAK_HTML = '<span data-a4-break="page"></span>';
export const INLINE_A4_PAGE_BREAK_SELECTOR = 'span[data-a4-break="page"]';

export type A4PageBreakKind = 'legacy-top-level' | 'inline';

export interface A4SourceRangeBinding {
  sourceNodeId: string;
  startTextOffset: number;
  endTextOffset: number;
}

export interface A4BreakProjectionFragment {
  content: string;
  hardBreakBefore: boolean;
  sourceRanges: readonly A4SourceRangeBinding[];
}

export interface A4ProjectionSourceRevision {
  sessionKey: EditorSessionKey;
  documentRevision: EditorRevision;
}

export interface A4ProjectionFragmentPositionMap {
  fragmentIndex: number;
  sourceRanges: readonly A4SourceRangeBinding[];
}

/**
 * C04 proof boundary supplied by SEMANTICS and consumed by CORE. The revision
 * values are copied from CORE's CanonicalInputBridge snapshot; this map never
 * allocates, increments, or otherwise owns a revision.
 */
export interface A4ProjectionPositionMap extends A4ProjectionSourceRevision {
  fragments: readonly A4ProjectionFragmentPositionMap[];
}

export interface A4ProjectedTextPoint {
  fragmentIndex: number;
  sourceNodeId: string;
  projectedOffset: number;
  affinity?: A4Position['affinity'];
}

export interface A4MappedSourcePosition extends A4ProjectionSourceRevision {
  position: A4Position;
}

export interface A4PageBreakDescriptor {
  nodeId: string;
  kind: A4PageBreakKind;
  position: A4Position | null;
  splitNodeIds: readonly string[];
}

export interface A4BreakProjectionProof {
  internalHtml: string;
  breaks: readonly A4PageBreakDescriptor[];
  fragments: readonly A4BreakProjectionFragment[];
  positionMap: A4ProjectionPositionMap;
}

export type A4PageBreakPositionSupport =
  | { supported: true }
  | {
      supported: false;
      code: 'invalid-position' | 'table-cell-interior-unsupported';
      message: string;
    };

export interface A4PageBreakRemovalProof {
  changed: boolean;
  internalHtml: string;
  selection: A4Selection | null;
}

export interface A4ProjectedOrderedListMarker {
  itemNodeId: string | null;
  continuation: boolean;
  value: number | null;
  label: string | null;
}

interface BoundaryPoint {
  node: Node;
  offset: number;
}

interface SplitNodeContext extends A4SourceRangeBinding {
  tagName: string;
}

interface ListContinuationContext {
  listNodeId: string;
  itemNodeId: string;
  counterBeforeFirstItem: number;
  counterAfterSplitItem: number;
}

interface BreakContext {
  descriptor: A4PageBreakDescriptor;
  element: HTMLElement;
  before: BoundaryPoint;
  after: BoundaryPoint;
  splitNodes: SplitNodeContext[];
  listContinuations: ListContinuationContext[];
}

const STRUCTURAL_SOURCE_SELECTOR = [
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
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  INLINE_A4_PAGE_BREAK_SELECTOR,
  '[data-field-id]',
  '[data-placeholder-id]',
  '[data-placeholder-key]',
].join(',');

function createRoot(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = normalizeCanonicalHtml(html);
  return root;
}

function hydrateStructuralSourceIds(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(STRUCTURAL_SOURCE_SELECTOR)
    .forEach((element) => ensureFlowId(element));
}

function elementsByFlowId(root: HTMLElement, nodeId: string): HTMLElement[] {
  const matches: HTMLElement[] = [];
  if (root.dataset.flowId === nodeId) matches.push(root);
  root.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    if (element.dataset.flowId === nodeId) matches.push(element);
  });
  return matches;
}

function firstElementByFlowId(
  root: HTMLElement,
  nodeId: string,
): HTMLElement | null {
  return elementsByFlowId(root, nodeId)[0] ?? null;
}

function childIndex(parent: Node, child: Node): number {
  return Array.prototype.indexOf.call(parent.childNodes, child) as number;
}

function boundaryBefore(element: HTMLElement): BoundaryPoint {
  const parent = element.parentNode!;
  return { node: parent, offset: childIndex(parent, element) };
}

function boundaryAfter(element: HTMLElement): BoundaryPoint {
  const parent = element.parentNode!;
  return { node: parent, offset: childIndex(parent, element) + 1 };
}

function cloneRangeRoot(
  root: HTMLElement,
  start: BoundaryPoint,
  end: BoundaryPoint,
): HTMLElement {
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const clonedContents = range.cloneContents();
  const wrapper = document.createElement('div');
  let commonAncestor: Node | null = range.commonAncestorContainer;
  if (commonAncestor === root) {
    wrapper.appendChild(clonedContents);
    return wrapper;
  }

  if (commonAncestor.nodeType === Node.TEXT_NODE) {
    commonAncestor = commonAncestor.parentNode;
  }

  let nested: Node = clonedContents;
  while (commonAncestor && commonAncestor !== root) {
    if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
      const ancestorClone = commonAncestor.cloneNode(false) as HTMLElement;
      ancestorClone.appendChild(nested);
      nested = ancestorClone;
    }
    commonAncestor = commonAncestor.parentNode;
  }
  wrapper.appendChild(nested);
  return wrapper;
}

function textLengthBeforeBoundary(
  element: HTMLElement,
  boundary: BoundaryPoint,
): number {
  const range = document.createRange();
  range.setStart(element, 0);
  range.setEnd(boundary.node, boundary.offset);
  return range.toString().length;
}

function isExplicitBreak(element: HTMLElement): boolean {
  return (
    element.matches(INLINE_A4_PAGE_BREAK_SELECTOR) ||
    element.classList.contains('page-break')
  );
}

function explicitBreaks(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `.page-break, ${INLINE_A4_PAGE_BREAK_SELECTOR}`,
    ),
  ).filter(isExplicitBreak);
}

function directListItemContaining(
  list: HTMLElement,
  descendant: HTMLElement,
): HTMLElement | null {
  let current: HTMLElement | null = descendant;
  while (current && current.parentElement !== list) {
    current = current.parentElement;
  }
  return current?.tagName === 'LI' ? current : null;
}

function listCounterBase(list: HTMLElement): number {
  if (list.tagName !== 'OL') return 0;
  const start = Number.parseInt(list.getAttribute('start') ?? '1', 10);
  return Math.max(1, Number.isFinite(start) ? start : 1) - 1;
}

function listContinuationContext(
  list: HTMLElement,
  marker: HTMLElement,
): ListContinuationContext | null {
  const listNodeId = list.dataset.flowId;
  const item = directListItemContaining(list, marker);
  const itemNodeId = item?.dataset.flowId;
  if (!listNodeId || !item || !itemNodeId) return null;

  const items = Array.from(list.children).filter(
    (child) => child.tagName === 'LI',
  ) as HTMLElement[];
  const index = items.indexOf(item);
  if (index < 0) return null;
  const consumed = items
    .slice(0, index + 1)
    .filter((candidate) => !candidate.hasAttribute('data-flow-continuation-item'))
    .length;
  const base = listCounterBase(list);
  return {
    listNodeId,
    itemNodeId,
    counterBeforeFirstItem: base,
    counterAfterSplitItem: base + consumed,
  };
}

function breakContext(root: HTMLElement, element: HTMLElement): BreakContext {
  const before = boundaryBefore(element);
  const after = boundaryAfter(element);
  const inline = element.matches(INLINE_A4_PAGE_BREAK_SELECTOR);
  const splitNodes: SplitNodeContext[] = [];
  const listContinuations: ListContinuationContext[] = [];

  if (inline) {
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== root) {
      const sourceNodeId = ancestor.dataset.flowId;
      if (sourceNodeId) {
        splitNodes.push({
          sourceNodeId,
          startTextOffset: textLengthBeforeBoundary(ancestor, before),
          endTextOffset: ancestor.textContent?.length ?? 0,
          tagName: ancestor.tagName,
        });
      }
      if (ancestor.tagName === 'OL' || ancestor.tagName === 'UL') {
        const continuation = listContinuationContext(ancestor, element);
        if (continuation) listContinuations.push(continuation);
      }
      ancestor = ancestor.parentElement;
    }
  }

  const nodeId = ensureFlowId(element);
  const parentId = element.parentElement?.dataset.flowId;
  const position =
    inline && parentId
      ? ({
          kind: 'children',
          nodeId: parentId,
          index: before.offset,
          affinity: 'before',
        } satisfies A4Position)
      : null;

  return {
    descriptor: {
      nodeId,
      kind: inline ? 'inline' : 'legacy-top-level',
      position,
      splitNodeIds: splitNodes.map((node) => node.sourceNodeId),
    },
    element,
    before,
    after,
    splitNodes,
    listContinuations,
  };
}

function mergeContinuationSide(
  element: HTMLElement,
  side: 'start' | 'end',
): void {
  const existing = element.dataset.flowContinuation;
  element.dataset.flowContinuation =
    existing && existing !== side ? 'both' : side;
}

function markSplitSide(
  fragment: HTMLElement,
  context: BreakContext,
  side: 'start' | 'end',
): void {
  context.splitNodes.forEach((splitNode) => {
    elementsByFlowId(fragment, splitNode.sourceNodeId).forEach((element) => {
      mergeContinuationSide(element, side);
    });
  });

  context.listContinuations.forEach((continuation) => {
    elementsByFlowId(fragment, continuation.listNodeId).forEach((list) => {
      mergeContinuationSide(list, side);
      if (list.tagName !== 'OL') return;
      const counter =
        side === 'start'
          ? continuation.counterBeforeFirstItem
          : continuation.counterAfterSplitItem;
      const current = list.style.getPropertyValue('--flow-list-start');
      if (side === 'end' || current === '') {
        if (counter > 0) {
          list.style.setProperty('--flow-list-start', String(counter));
        }
      }
    });
    if (side === 'end') {
      elementsByFlowId(fragment, continuation.itemNodeId).forEach((item) => {
        item.setAttribute('data-flow-continuation-item', 'true');
      });
    }
  });
}

function intersectRange(
  ranges: A4SourceRangeBinding[],
  binding: A4SourceRangeBinding,
): void {
  const existingIndex = ranges.findIndex(
    (candidate) => candidate.sourceNodeId === binding.sourceNodeId,
  );
  if (existingIndex < 0) {
    ranges.push(binding);
    return;
  }

  const existing = ranges[existingIndex];
  const startTextOffset = Math.max(
    existing.startTextOffset,
    binding.startTextOffset,
  );
  const endTextOffset = Math.min(existing.endTextOffset, binding.endTextOffset);
  if (startTextOffset > endTextOffset) {
    throw new Error(`Non-overlapping source ranges for ${binding.sourceNodeId}`);
  }
  ranges[existingIndex] = {
    sourceNodeId: binding.sourceNodeId,
    startTextOffset,
    endTextOffset,
  };
}

function buildSourceRanges(
  fragment: HTMLElement,
  canonical: HTMLElement,
  explicit: readonly A4SourceRangeBinding[],
): A4SourceRangeBinding[] {
  const ranges: A4SourceRangeBinding[] = [];
  fragment.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((projected) => {
    const sourceNodeId = projected.dataset.flowId;
    if (!sourceNodeId) return;
    const source = firstElementByFlowId(canonical, sourceNodeId);
    if (!source) return;
    if ((projected.textContent ?? '') === (source.textContent ?? '')) {
      intersectRange(ranges, {
        sourceNodeId,
        startTextOffset: 0,
        endTextOffset: source.textContent?.length ?? 0,
      });
    }
  });
  explicit.forEach((binding) => intersectRange(ranges, binding));
  return ranges;
}

function buildPositionMap(
  source: A4ProjectionSourceRevision,
  fragments: readonly A4BreakProjectionFragment[],
): A4ProjectionPositionMap {
  return {
    sessionKey: source.sessionKey,
    documentRevision: source.documentRevision,
    fragments: fragments.map((fragment, fragmentIndex) => ({
      fragmentIndex,
      sourceRanges: fragment.sourceRanges,
    })),
  };
}

export function hydrateA4SemanticProofHtml(input: string): string {
  const root = createRoot(input);
  hydrateStructuralSourceIds(root);
  return root.innerHTML;
}

export function projectA4SemanticBreaksForProof(
  input: string,
  source: A4ProjectionSourceRevision,
): A4BreakProjectionProof {
  const canonical = createRoot(input);
  hydrateStructuralSourceIds(canonical);
  const contexts = explicitBreaks(canonical).map((element) =>
    breakContext(canonical, element),
  );

  if (contexts.length === 0) {
    const fragments: A4BreakProjectionFragment[] = [
      {
        content: canonical.innerHTML,
        hardBreakBefore: false,
        sourceRanges: buildSourceRanges(canonical, canonical, []),
      },
    ];
    return {
      internalHtml: canonical.innerHTML,
      breaks: [],
      fragments,
      positionMap: buildPositionMap(source, fragments),
    };
  }

  const fragmentRoots: HTMLElement[] = [];
  let cursor: BoundaryPoint = { node: canonical, offset: 0 };
  contexts.forEach((context) => {
    fragmentRoots.push(cloneRangeRoot(canonical, cursor, context.before));
    cursor = context.after;
  });
  fragmentRoots.push(
    cloneRangeRoot(canonical, cursor, {
      node: canonical,
      offset: canonical.childNodes.length,
    }),
  );

  contexts.forEach((context, index) => {
    if (context.descriptor.kind !== 'inline') return;
    markSplitSide(fragmentRoots[index], context, 'start');
    markSplitSide(fragmentRoots[index + 1], context, 'end');
  });

  const explicitRangesByFragment = fragmentRoots.map(() =>
    [] as A4SourceRangeBinding[],
  );
  contexts.forEach((context, index) => {
    if (context.descriptor.kind !== 'inline') return;
    context.splitNodes.forEach((splitNode) => {
      explicitRangesByFragment[index].push({
        sourceNodeId: splitNode.sourceNodeId,
        startTextOffset: 0,
        endTextOffset: splitNode.startTextOffset,
      });
      explicitRangesByFragment[index + 1].push({
        sourceNodeId: splitNode.sourceNodeId,
        startTextOffset: splitNode.startTextOffset,
        endTextOffset: splitNode.endTextOffset,
      });
    });
  });

  const fragments = fragmentRoots.map((fragment, index) => ({
    content: fragment.innerHTML,
    hardBreakBefore: index > 0,
    sourceRanges: buildSourceRanges(
      fragment,
      canonical,
      explicitRangesByFragment[index],
    ),
  }));

  return {
    internalHtml: canonical.innerHTML,
    breaks: contexts.map((context) => context.descriptor),
    fragments,
    positionMap: buildPositionMap(source, fragments),
  };
}

export function mapProjectedTextOffsetToSource(
  positionMap: A4ProjectionPositionMap,
  point: A4ProjectedTextPoint,
): A4MappedSourcePosition | null {
  const fragment = positionMap.fragments.find(
    (candidate) => candidate.fragmentIndex === point.fragmentIndex,
  );
  if (!fragment || point.projectedOffset < 0) return null;
  const binding = fragment.sourceRanges.find(
    (candidate) => candidate.sourceNodeId === point.sourceNodeId,
  );
  if (!binding) return null;
  const available = binding.endTextOffset - binding.startTextOffset;
  if (point.projectedOffset > available) return null;
  return {
    sessionKey: positionMap.sessionKey,
    documentRevision: positionMap.documentRevision,
    position: {
      kind: 'text',
      nodeId: point.sourceNodeId,
      offset: binding.startTextOffset + point.projectedOffset,
      affinity: point.affinity ?? 'after',
    },
  };
}

export function projectedOrderedListMarkersForProof(
  fragmentHtml: string,
  listNodeId: string,
): readonly A4ProjectedOrderedListMarker[] {
  const root = createRoot(fragmentHtml);
  const list = firstElementByFlowId(root, listNodeId);
  if (!list || list.tagName !== 'OL') return [];

  const flowStart = Number.parseInt(
    list.style.getPropertyValue('--flow-list-start'),
    10,
  );
  let counter = Number.isFinite(flowStart) ? flowStart : listCounterBase(list);
  return Array.from(list.children)
    .filter((child) => child.tagName === 'LI')
    .map((child) => {
      const item = child as HTMLElement;
      const continuation = item.hasAttribute('data-flow-continuation-item');
      if (!continuation) counter += 1;
      const value = continuation ? null : counter;
      return {
        itemNodeId: item.dataset.flowId ?? null,
        continuation,
        value,
        label: value === null ? null : `${value}.`,
      };
    });
}

export function serializeA4SemanticProofHtml(internalHtml: string): string {
  return stripFlowMetadata(normalizeCanonicalHtml(internalHtml));
}

export function removeA4PageBreakForProof(
  internalHtml: string,
  breakNodeId: string,
): A4PageBreakRemovalProof {
  const root = createRoot(internalHtml);
  const marker = firstElementByFlowId(root, breakNodeId);
  if (!marker || !isExplicitBreak(marker)) {
    return { changed: false, internalHtml, selection: null };
  }

  const parent = marker.parentElement;
  const parentId = parent?.dataset.flowId;
  const index = parent ? childIndex(parent, marker) : -1;
  const isInline = marker.matches(INLINE_A4_PAGE_BREAK_SELECTOR);
  marker.remove();

  const position: A4Position | null =
    isInline && parentId && index >= 0
      ? { kind: 'children', nodeId: parentId, index, affinity: 'after' }
      : null;
  return {
    changed: true,
    internalHtml: root.innerHTML,
    selection: position ? { anchor: position, focus: position } : null,
  };
}

export function validateA4PageBreakPositionForProof(
  root: HTMLElement,
  position: A4Position,
): A4PageBreakPositionSupport {
  const domPoint = resolveA4Position(root, position);
  if (!domPoint) {
    return {
      supported: false,
      code: 'invalid-position',
      message: 'The structural position no longer resolves in this document.',
    };
  }

  const element =
    domPoint.node.nodeType === Node.ELEMENT_NODE
      ? (domPoint.node as Element)
      : domPoint.node.parentElement;
  if (element?.closest('td, th')) {
    return {
      supported: false,
      code: 'table-cell-interior-unsupported',
      message:
        'Manual page breaks inside table cells are not supported by the S0 contract proof.',
    };
  }

  return { supported: true };
}
