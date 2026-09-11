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
 * C02 proof boundary. The revision is intentionally not stored here: CORE's
 * CanonicalInputBridge remains the sole session/document revision authority.
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

const STRUCTURAL_BOUNDARY_SELECTOR = [
  'br',
  '[data-a4-break="page"]',
  '[data-field-id]',
  '[data-placeholder-id]',
  '[data-placeholder-key]',
  '[contenteditable="false"]',
].join(',');

function flowElementById(root: HTMLElement, nodeId: string): HTMLElement | null {
  const candidates: HTMLElement[] = [];
  if (root.dataset.flowId === nodeId) candidates.push(root);
  root.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    if (element.dataset.flowId === nodeId) candidates.push(element);
  });
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
  const previousIsStructural = isStructuralBoundary(element.childNodes[index - 1] ?? null);
  const nextIsStructural = isStructuralBoundary(element.childNodes[index] ?? null);
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
  element.querySelectorAll<HTMLElement>(STRUCTURAL_BOUNDARY_SELECTOR).forEach((boundary) => {
    const parent = boundary.parentNode;
    if (!parent) return;
    const index = Array.prototype.indexOf.call(parent.childNodes, boundary) as number;
    if (index < 0) return;
    const point = affinity === 'before'
      ? { node: parent, offset: index }
      : { node: parent, offset: index + 1 };
    const logicalOffset = textOffsetWithin(element, point.node, point.offset);
    if (logicalOffset === offset) candidates.push(point);
  });
  if (candidates.length === 0) return null;
  return affinity === 'before' ? candidates[0] : candidates[candidates.length - 1];
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
  if (!root.contains(node) || offset < 0) return null;
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
    const collapsed = captureA4Position(root, anchor.node, anchor.offset, 'after');
    return collapsed ? { anchor: collapsed, focus: collapsed } : null;
  }

  const capturedAnchor = captureA4Position(root, anchor.node, anchor.offset, 'after');
  const capturedFocus = captureA4Position(root, focus.node, focus.offset, 'after');
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
    if (position.index < 0 || position.index > element.childNodes.length) {
      return null;
    }
    return { node: element, offset: position.index };
  }

  const total = textLength(element);
  if (position.offset < 0 || position.offset > total) return null;

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
          offset: position.affinity === 'before' ? 0 : element.childNodes.length,
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
        return { node: previous, offset: previous.textContent?.length ?? 0 };
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

  return { node: textNodes[textNodes.length - 1], offset: textNodes[textNodes.length - 1].textContent?.length ?? 0 };
}
