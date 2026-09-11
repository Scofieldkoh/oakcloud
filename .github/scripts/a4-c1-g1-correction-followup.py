from pathlib import Path

path = Path("src/components/documents/a4-page-editor.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, got {count}")
    text = text.replace(old, new, 1)


helper_start = text.index("interface NativeSelectionDragPoint {")
helper_end = text.index("function selectionStartPoint(", helper_start)
text = (
    text[:helper_start]
    + """function localClientPoint(clientX: number, clientY: number) {
  const transforms: Array<{
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
  }> = [];
  let currentWindow: Window = window;

  while (currentWindow.frameElement) {
    const frameElement = currentWindow.frameElement as HTMLElement;
    const frameRect = frameElement.getBoundingClientRect();
    transforms.push({
      left: frameRect.left,
      top: frameRect.top,
      scaleX: frameElement.clientWidth
        ? frameRect.width / frameElement.clientWidth
        : 1,
      scaleY: frameElement.clientHeight
        ? frameRect.height / frameElement.clientHeight
        : 1,
    });
    currentWindow = currentWindow.parent;
  }

  let x = clientX;
  let y = clientY;
  for (let index = transforms.length - 1; index >= 0; index -= 1) {
    const transform = transforms[index];
    x = (x - transform.left) / transform.scaleX;
    y = (y - transform.top) / transform.scaleY;
  }
  return { x, y };
}

function refineCrossPageNativeSelectionFocus(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !selectionSpansPages(root) ||
    selection.focusNode?.nodeType !== Node.TEXT_NODE
  ) {
    return;
  }

  const focusNode = selection.focusNode as Text;
  const anchorPage = pageContentContainingNode(root, selection.anchorNode);
  const focusPage = pageContentContainingNode(root, focusNode);
  if (!anchorPage || !focusPage) return;
  const pageContents = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-testid^=\"a4-page-content-\"][data-page-id]',
    ),
  );
  const anchorIndex = pageContents.indexOf(anchorPage);
  const focusIndex = pageContents.indexOf(focusPage);
  if (anchorIndex < 0 || focusIndex < 0 || anchorIndex === focusIndex) return;

  const forward = focusIndex > anchorIndex;
  const offset = selection.focusOffset;
  const candidateOffset = forward ? offset + 1 : offset - 1;
  if (candidateOffset < 0 || candidateOffset > focusNode.length) return;

  const glyphRange = root.ownerDocument.createRange();
  if (forward) {
    if (offset >= focusNode.length) return;
    glyphRange.setStart(focusNode, offset);
    glyphRange.setEnd(focusNode, offset + 1);
  } else {
    if (offset <= 0) return;
    glyphRange.setStart(focusNode, offset - 1);
    glyphRange.setEnd(focusNode, offset);
  }
  const rect = glyphRange.getBoundingClientRect();
  if (!rect.width && !rect.height) return;

  const local = localClientPoint(clientX, clientY);
  const candidates = [
    { x: clientX, y: clientY },
    local,
  ];
  const reachesCandidateGlyph = candidates.some(
    (point) =>
      point.y >= rect.top - 3 &&
      point.y <= rect.bottom + 3 &&
      point.x >= rect.left - 3 &&
      point.x <= rect.right + 3,
  );
  if (!reachesCandidateGlyph) return;

  selection.setBaseAndExtent(
    selection.anchorNode!,
    selection.anchorOffset,
    focusNode,
    candidateOffset,
  );
}

"""
    + text[helper_end:]
)

replace_once(
    """    const nativeSelectionDragStartRef = useRef<NativeSelectionDragPoint | null>(
      null,
    );
""",
    "",
    "remove pointer-start reconstruction ref",
)

replace_once(
    """        const surface = documentSurfaceRef.current ?? event.currentTarget;
        const target = getTableColumnResizeTarget(
          surface,
          event.target,
          event.clientX,
        );
        if (!target) {
          nativeSelectionDragStartRef.current =
            nativeSelectionPointAtClientPosition(
              surface,
              event.clientX,
              event.clientY,
            );
          return;
        }
        nativeSelectionDragStartRef.current = null;

        event.preventDefault();""",
    """        const target = getTableColumnResizeTarget(
          documentSurfaceRef.current ?? event.currentTarget,
          event.target,
          event.clientX,
        );
        if (!target) return;

        event.preventDefault();""",
    "preserve native mouse anchor",
)

old_mouseup_start = text.index("            onMouseUp={(event) => {")
old_mouseup_end = text.index("            onKeyUp={(event) => {", old_mouseup_start)
old_mouseup = text[old_mouseup_start:old_mouseup_end]
if "nativeSelectionDragStartRef.current" not in old_mouseup:
    raise SystemExit("cross-page mouseup candidate not found")
new_mouseup = """            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                refineCrossPageNativeSelectionFocus(
                  event.currentTarget,
                  event.clientX,
                  event.clientY,
                );
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}
"""
text = text[:old_mouseup_start] + new_mouseup + text[old_mouseup_end:]

replace_once(
    """          if (
            paired &&
            paired.inputType === inputEvent.inputType &&
            paired.data === inputEvent.data &&
            paired.revision === session.getState().revision
          ) {
            return;
          }
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;""",
    """          if (
            paired &&
            paired.inputType === inputEvent.inputType &&
            paired.data === inputEvent.data &&
            paired.revision === session.getState().revision
          ) {
            return;
          }
          const renderedSelection = captureFlowSelection(event.currentTarget);
          if (renderedSelection) {
            const target = session.resolveNativeInputTarget({
              renderedRevision:
                session.getRenderedProjection().documentRevision,
              origin: 'pointer',
              renderedSelection,
            });
            if (target.ok && target.selection) {
              pendingFlowSelectionRef.current = target.selection;
            }
          }
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;""",
    "preserve validated caret during unexpected input repair",
)

path.write_text(text)
