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
    return { kind: 'children', nodeId, index: offset, affinity };
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
    'before',
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
    if (position.index < 0 || position.index > element.childNodes.length) {
      return null;
    }
    return { node: element, offset: position.index };
  }

  const total = textLength(element);
  if (position.offset < 0 || position.offset > total) return null;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = position.offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }

  return position.offset === 0
    ? { node: element, offset: 0 }
    : { node: element, offset: element.childNodes.length };
}
