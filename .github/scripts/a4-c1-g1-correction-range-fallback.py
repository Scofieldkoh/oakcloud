from pathlib import Path

path = Path("src/components/documents/a4-page-editor.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
    "function selectionStartPoint(\n",
    """interface NativeSelectionDragPoint {
  node: Node;
  offset: number;
  pageContent: HTMLElement;
}

function pointerBoundaryDistance(
  node: Text,
  offset: number,
  x: number,
  y: number,
): number {
  const range = node.ownerDocument.createRange();
  let rect: DOMRect;
  let boundaryX: number;
  if (offset <= 0) {
    range.setStart(node, 0);
    range.setEnd(node, Math.min(1, node.length));
    rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    boundaryX = rect.left;
  } else {
    range.setStart(node, 0);
    range.setEnd(node, Math.min(offset, node.length));
    const rects = range.getClientRects();
    rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    boundaryX = rect.right;
  }
  if (!rect.width && !rect.height) return Number.POSITIVE_INFINITY;
  const dx = boundaryX - x;
  const dy = rect.top + rect.height / 2 - y;
  return dx * dx + dy * dy * 16;
}

function nativeSelectionPointForPointerTarget(
  root: HTMLElement,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
): NativeSelectionDragPoint | null {
  const targetNode = target instanceof Node ? target : null;
  const targetElement =
    targetNode?.nodeType === Node.ELEMENT_NODE
      ? (targetNode as Element)
      : targetNode?.parentElement ?? null;
  const flowElement =
    targetElement?.closest<HTMLElement>('[data-flow-id]') ?? targetElement;
  if (!flowElement || !root.contains(flowElement)) return null;
  const pageContent = pageContentContainingNode(root, flowElement);
  if (!pageContent) return null;

  const ownerDocument = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const local = localClientPoint(clientX, clientY);
  const coordinateCandidates = [
    { x: clientX, y: clientY },
    local,
  ];
  let best: NativeSelectionDragPoint | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const point of coordinateCandidates) {
    const caretPosition = ownerDocument.caretPositionFromPoint?.(
      point.x,
      point.y,
    ) ?? null;
    const caretRange = caretPosition
      ? null
      : ownerDocument.caretRangeFromPoint?.(point.x, point.y) ?? null;
    const node = caretPosition?.offsetNode ?? caretRange?.startContainer ?? null;
    const offset = caretPosition?.offset ?? caretRange?.startOffset ?? 0;
    if (
      !node ||
      node.nodeType !== Node.TEXT_NODE ||
      !flowElement.contains(node)
    ) {
      continue;
    }
    const textNode = node as Text;
    const boundedOffset = Math.min(Math.max(offset, 0), textNode.length);
    const score = pointerBoundaryDistance(
      textNode,
      boundedOffset,
      point.x,
      point.y,
    );
    if (score < bestScore) {
      bestScore = score;
      best = { node: textNode, offset: boundedOffset, pageContent };
    }
  }

  return best;
}

function selectionStartPoint(
""",
    "collapsed drag endpoint helper",
)

replace_once(
    """    const pairedCanonicalInputRef = useRef<{
      inputType: string;
      data: string | null;
      revision: number;
    } | null>(null);
    const [isReflowing, setIsReflowing] = useState(false);""",
    """    const pairedCanonicalInputRef = useRef<{
      inputType: string;
      data: string | null;
      revision: number;
    } | null>(null);
    const nativeSelectionDragStartRef = useRef<NativeSelectionDragPoint | null>(
      null,
    );
    const [isReflowing, setIsReflowing] = useState(false);""",
    "collapsed drag start ref",
)

replace_once(
    """        const target = getTableColumnResizeTarget(
          documentSurfaceRef.current ?? event.currentTarget,
          event.target,
          event.clientX,
        );
        if (!target) return;

        event.preventDefault();""",
    """        const surface = documentSurfaceRef.current ?? event.currentTarget;
        const target = getTableColumnResizeTarget(
          surface,
          event.target,
          event.clientX,
        );
        if (!target) {
          nativeSelectionDragStartRef.current =
            nativeSelectionPointForPointerTarget(
              surface,
              event.target,
              event.clientX,
              event.clientY,
            );
          return;
        }
        nativeSelectionDragStartRef.current = null;

        event.preventDefault();""",
    "capture collapsed cross-page drag start",
)

replace_once(
    """            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                refineCrossPageNativeSelectionFocus(
                  event.currentTarget,
                  event.clientX,
                  event.clientY,
                );
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}""",
    """            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                const surface = event.currentTarget;
                const selection = window.getSelection();
                const nativeSpansPages = Boolean(
                  selection &&
                    !selection.isCollapsed &&
                    selectionSpansPages(surface),
                );
                if (nativeSpansPages) {
                  refineCrossPageNativeSelectionFocus(
                    surface,
                    event.clientX,
                    event.clientY,
                  );
                } else {
                  const dragStart = nativeSelectionDragStartRef.current;
                  const dragEnd = dragStart
                    ? nativeSelectionPointForPointerTarget(
                        surface,
                        event.target,
                        event.clientX,
                        event.clientY,
                      )
                    : null;
                  if (
                    selection &&
                    dragStart &&
                    dragEnd &&
                    dragStart.pageContent !== dragEnd.pageContent
                  ) {
                    selection.removeAllRanges();
                    selection.setBaseAndExtent(
                      dragStart.node,
                      dragStart.offset,
                      dragEnd.node,
                      dragEnd.offset,
                    );
                    refineCrossPageNativeSelectionFocus(
                      surface,
                      event.clientX,
                      event.clientY,
                    );
                  }
                }
                nativeSelectionDragStartRef.current = null;
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}""",
    "reconstruct only collapsed cross-page drag",
)

path.write_text(text)