export interface FlowPoint {
  flowId: string;
  offset: number;
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

  return { flowId, offset: logicalOffset };
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
