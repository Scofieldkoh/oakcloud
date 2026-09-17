export interface FlowPoint {
  flowId: string;
  offset: number;
  boundary?: { flowId: string; side: 'before' | 'after' };
}

export interface FlowSelectionBookmark {
  anchor: FlowPoint;
  focus: FlowPoint;
  collapsed: boolean;
}

interface DomPoint {
  node: Node;
  offset: number;
}

/** Preserve zero-text line positions without changing legacy text offsets. */
export function lineBreakBoundaryForDomPoint(node: Node, offset: number): FlowPoint['boundary'] {
  let previous: Node | null = null;
  let next: Node | null = null;
  if (node.nodeType === Node.ELEMENT_NODE) {
    previous = node.childNodes[offset - 1] ?? null;
    next = node.childNodes[offset] ?? null;
  } else if (node.nodeType === Node.TEXT_NODE) {
    if (offset === 0) previous = node.previousSibling;
    if (offset === (node.textContent?.length ?? 0)) next = node.nextSibling;
  }
  for (const [candidate, side] of [[previous, 'after'], [next, 'before']] as const) {
    if (!(candidate instanceof HTMLElement) || candidate.tagName !== 'BR' || !candidate.dataset.flowId) continue;
    // A sole BR is the editable placeholder, not an additional line.
    if (candidate.parentNode?.childNodes.length === 1 && !candidate.parentElement?.dataset.flowContinuation) continue;
    return { flowId: candidate.dataset.flowId, side };
  }
  return undefined;
}

export function resolveFlowBoundary(root: HTMLElement, point: FlowPoint): DomPoint | null {
  if (!point.boundary) return null;
  const boundary = Array.from(root.querySelectorAll<HTMLElement>('br[data-flow-id]'))
    .find((element) => element.dataset.flowId === point.boundary!.flowId);
  const parent = boundary?.parentNode;
  if (!boundary || !parent) return null;
  const index = Array.prototype.indexOf.call(parent.childNodes, boundary) as number;
  return { node: parent, offset: index + (point.boundary.side === 'after' ? 1 : 0) };
}

function flowElementForBoundary(
  root: HTMLElement,
  node: Node | null,
  offset: number,
): HTMLElement | null {
  if (!node || !root.contains(node)) return null;

  let element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  while (element && element !== root) {
    if (element.dataset.flowId) return element;
    element = element.parentElement;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const boundaryElement = node as Element;
    const adjacent =
      boundaryElement.children[offset] ??
      boundaryElement.children[Math.max(0, offset - 1)];
    return (adjacent?.closest('[data-flow-id]') as HTMLElement | null) ?? null;
  }

  return null;
}

function textOffsetWithin(
  element: HTMLElement,
  node: Node,
  offset: number,
): number {
  const range = document.createRange();
  range.setStart(element, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

function capturePoint(
  root: HTMLElement,
  node: Node | null,
  offset: number,
): FlowPoint | null {
  const element = flowElementForBoundary(root, node, offset);
  const flowId = element?.dataset.flowId;
  if (!element || !flowId || !node) return null;

  const fragments = Array.from(
    root.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).filter((fragment) => fragment.dataset.flowId === flowId);
  let logicalOffset = 0;
  for (const fragment of fragments) {
    if (fragment === element) {
      logicalOffset += textOffsetWithin(fragment, node, offset);
      break;
    }
    logicalOffset += fragment.textContent?.length ?? 0;
  }

  const boundary = lineBreakBoundaryForDomPoint(node, offset);
  return { flowId, offset: logicalOffset, ...(boundary ? { boundary } : {}) };
}

export function captureFlowSelection(
  root: HTMLElement,
): FlowSelectionBookmark | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const anchor = capturePoint(
    root,
    selection.anchorNode,
    selection.anchorOffset,
  );
  const focus = capturePoint(
    root,
    selection.focusNode,
    selection.focusOffset,
  );
  if (!anchor || !focus) return null;

  return { anchor, focus, collapsed: selection.isCollapsed };
}

function textPoint(element: HTMLElement, requestedOffset: number): DomPoint {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = requestedOffset;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }

  return { node: element, offset: element.childNodes.length };
}

function restorePoint(root: HTMLElement, point: FlowPoint): DomPoint | null {
  if (point.boundary) return resolveFlowBoundary(root, point);
  const fragments = Array.from(
    root.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).filter((fragment) => fragment.dataset.flowId === point.flowId);
  if (fragments.length === 0) return null;

  let consumed = 0;
  for (const fragment of fragments) {
    const length = fragment.textContent?.length ?? 0;
    if (point.offset <= consumed + length) {
      return textPoint(fragment, Math.max(0, point.offset - consumed));
    }
    consumed += length;
  }

  return textPoint(
    fragments[fragments.length - 1],
    fragments[fragments.length - 1].textContent?.length ?? 0,
  );
}

export function restoreFlowSelection(
  root: HTMLElement,
  bookmark: FlowSelectionBookmark,
): boolean {
  const anchor = restorePoint(root, bookmark.anchor);
  const focus = restorePoint(root, bookmark.focus);
  const selection = window.getSelection();
  if (!anchor || !focus || !selection) return false;

  try {
    if (!bookmark.collapsed && selection.setBaseAndExtent) {
      selection.removeAllRanges();
      selection.setBaseAndExtent(
        anchor.node,
        anchor.offset,
        focus.node,
        focus.offset,
      );
      return true;
    }

    const range = document.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}

export function documentTextOffsetForFlowPoint(
  html: string,
  point: FlowSelectionBookmark['anchor'],
): number | null {
  const container = document.createElement('div');
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let documentOffset = 0;
  let flowOffset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    const flowElement = node.parentElement?.closest<HTMLElement>('[data-flow-id]');
    if (flowElement?.dataset.flowId === point.flowId) {
      if (point.offset <= flowOffset + length) {
        return documentOffset + Math.max(0, point.offset - flowOffset);
      }
      flowOffset += length;
    }
    documentOffset += length;
  }

  return null;
}

export function flowPointAtDocumentTextOffset(
  html: string,
  requestedOffset: number,
): FlowSelectionBookmark['anchor'] | null {
  const container = document.createElement('div');
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const offsetsByFlowId = new Map<string, number>();
  let remaining = Math.max(0, requestedOffset);
  let fallback: FlowSelectionBookmark['anchor'] | null = null;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    const flowElement = node.parentElement?.closest<HTMLElement>('[data-flow-id]');
    const flowId = flowElement?.dataset.flowId;
    if (!flowId) {
      remaining = Math.max(0, remaining - length);
      continue;
    }

    const flowOffset = offsetsByFlowId.get(flowId) ?? 0;
    fallback = { flowId, offset: flowOffset + length };
    if (remaining <= length) {
      return { flowId, offset: flowOffset + remaining };
    }

    offsetsByFlowId.set(flowId, flowOffset + length);
    remaining -= length;
  }

  return fallback;
}
