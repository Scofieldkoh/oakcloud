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
    """function repairCollapsedNativeTextSelection(
  result: DocumentTransactionResult,
  sourceSelection: FlowSelectionBookmark,
  insertedText: string,
): DocumentTransactionResult {
  if (
    !result.changed ||
    !sourceSelection.collapsed ||
    insertedText.length === 0 ||
    !result.selection ||
    !result.selection.collapsed
  ) {
    return result;
  }

  const source = sourceSelection.anchor;
  const returned = result.selection.anchor;
  const didNotAdvance =
    returned.flowId === source.flowId && returned.offset === source.offset;
  if (!didNotAdvance) return result;

  const container = document.createElement('div');
  container.innerHTML = result.html;
  const fragments = Array.from(
    container.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).filter((element) => element.dataset.flowId === source.flowId);
  const availableTextLength = fragments.reduce(
    (length, fragment) => length + (fragment.textContent?.length ?? 0),
    0,
  );
  const nextOffset = source.offset + insertedText.length;
  if (availableTextLength < nextOffset) return result;

  const point = { flowId: source.flowId, offset: nextOffset };
  return {
    ...result,
    selection: { anchor: point, focus: point, collapsed: true },
  };
}

interface NativeSelectionDragPoint {
  node: Node;
  offset: number;
  pageContent: HTMLElement;
}

function localClientPoint(clientX: number, clientY: number) {
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

function nativeSelectionPointAtClientPosition(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): NativeSelectionDragPoint | null {
  const { x, y } = localClientPoint(clientX, clientY);
  const ownerDocument = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caretPosition = ownerDocument.caretPositionFromPoint?.(x, y) ?? null;
  const caretRange = caretPosition
    ? null
    : ownerDocument.caretRangeFromPoint?.(x, y) ?? null;
  const node = caretPosition?.offsetNode ?? caretRange?.startContainer ?? null;
  const offset = caretPosition?.offset ?? caretRange?.startOffset ?? 0;
  if (!node || !root.contains(node)) return null;

  const pageContent = pageContentContainingNode(root, node);
  if (!pageContent) return null;
  if (node.nodeType !== Node.TEXT_NODE) {
    return { node, offset, pageContent };
  }

  const textNode = node as Text;
  const nativeOffset = Math.min(Math.max(offset, 0), textNode.length);
  const firstCandidate = Math.max(0, nativeOffset - 2);
  const lastCandidate = Math.min(textNode.length, nativeOffset + 2);
  let bestOffset = nativeOffset;
  let bestScore = Number.POSITIVE_INFINITY;

  for (
    let candidateOffset = firstCandidate;
    candidateOffset <= lastCandidate;
    candidateOffset += 1
  ) {
    const range = ownerDocument.createRange();
    let rect: DOMRect;
    let boundaryX: number;
    if (candidateOffset === 0) {
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(1, textNode.length));
      rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      boundaryX = rect.left;
    } else {
      range.setStart(textNode, 0);
      range.setEnd(textNode, candidateOffset);
      const rects = range.getClientRects();
      rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
      boundaryX = rect.right;
    }
    if (!rect.width && !rect.height) continue;
    const dx = boundaryX - x;
    const dy = rect.top + rect.height / 2 - y;
    const score = dx * dx + dy * dy * 16;
    if (score < bestScore) {
      bestScore = score;
      bestOffset = candidateOffset;
    }
  }

  return { node: textNode, offset: bestOffset, pageContent };
}

function selectionStartPoint(
""",
    "native selection helpers",
)

replace_once(
    "    const reflowGenerationRef = useRef(0);\n    const [isReflowing, setIsReflowing] = useState(false);",
    """    const reflowGenerationRef = useRef(0);
    const pairedCanonicalInputRef = useRef<{
      inputType: string;
      data: string | null;
      revision: number;
    } | null>(null);
    const nativeSelectionDragStartRef = useRef<NativeSelectionDragPoint | null>(
      null,
    );
    const [isReflowing, setIsReflowing] = useState(false);""",
    "native routing refs",
)

replace_once(
    "        pagesRef.current = sourcePages;\n        reflowGenerationRef.current += 1;",
    """        if (!session) {
          pagesRef.current = sourcePages;
        }
        reflowGenerationRef.current += 1;""",
    "retain committed pages while session reflow is pending",
)

replace_once(
    """        result: DocumentTransactionResult,
        intentKind: CanonicalEditorIntentKind = 'structural',
      ) => {""",
    """        result: DocumentTransactionResult,
        intentKind: CanonicalEditorIntentKind = 'structural',
        publishParsedProjection = false,
      ) => {""",
    "commit projection policy",
)

replace_once(
    """        pendingFlowSelectionRef.current = committed.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        scheduleReflow(nextPages, false);""",
    """        pendingFlowSelectionRef.current = committed.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        if (publishParsedProjection) {
          pagesRef.current = nextPages;
          setPages(nextPages);
        }
        scheduleReflow(nextPages, false);""",
    "defer soft parsed projection",
)

replace_once(
    "      commitUserTransaction(appendHardPage(canonicalPagesHtml(pagesRef.current)));",
    """      commitUserTransaction(
        appendHardPage(canonicalPagesHtml(pagesRef.current)),
        'structural',
        true,
      );""",
    "hard page add immediate projection",
)

replace_once(
    """        commitUserTransaction(
          deleteHardPageSection(
            canonicalPagesHtml(currentPages),
            sectionIndex,
          ),
        );""",
    """        commitUserTransaction(
          deleteHardPageSection(
            canonicalPagesHtml(currentPages),
            sectionIndex,
          ),
          'structural',
          true,
        );""",
    "hard page delete immediate projection",
)

replace_once(
    """        if (session) {
          const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
          pagesRef.current = nextPages;
          setPages(nextPages);
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;
        }
        commitDocumentSurface();""",
    """        if (session) {
          const paired = pairedCanonicalInputRef.current;
          pairedCanonicalInputRef.current = null;
          if (
            paired &&
            paired.inputType === inputEvent.inputType &&
            paired.data === inputEvent.data &&
            paired.revision === session.getState().revision
          ) {
            return;
          }
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;
        }
        commitDocumentSurface();""",
    "bounded paired input reconciliation",
)

replace_once(
    """      (inputEvent: InputEvent) => {
        if (effectivePreviewMode) return;
        const surface = documentSurfaceRef.current;""",
    """      (inputEvent: InputEvent) => {
        if (effectivePreviewMode) return;
        pairedCanonicalInputRef.current = null;
        const surface = documentSurfaceRef.current;""",
    "bound paired input marker to one beforeinput sequence",
)

replace_once(
    """        if (inputType === 'insertText' || inputType === 'insertReplacementText') {
          inputEvent.preventDefault();
          const data = inputEvent.data ?? '';
          const pendingFormat = pendingTypingFormatRef.current;
          const result = pendingFormat
            ? insertTextWithFormat(canonical, bookmark, data, pendingFormat)
            : (() => {
                const replacement = document.createElement('div');
                replacement.textContent = data;
                return replaceLogicalSelection(canonical, bookmark, replacement.innerHTML);
              })();
          if (result.changed && result.selection) {
            pendingTypingPointRef.current = result.selection.anchor;
          }
          commitUserTransaction(result, 'insert-text');
          return;
        }""",
    """        if (inputType === 'insertText' || inputType === 'insertReplacementText') {
          inputEvent.preventDefault();
          const data = inputEvent.data ?? '';
          const pendingFormat = pendingTypingFormatRef.current;
          const result = pendingFormat
            ? insertTextWithFormat(canonical, bookmark, data, pendingFormat)
            : (() => {
                const replacement = document.createElement('div');
                replacement.textContent = data;
                return replaceLogicalSelection(canonical, bookmark, replacement.innerHTML);
              })();
          const repaired = repairCollapsedNativeTextSelection(
            result,
            bookmark,
            data,
          );
          if (repaired.changed && repaired.selection) {
            pendingTypingPointRef.current = repaired.selection.anchor;
          }
          const beforeRevision = session.getState().revision;
          commitUserTransaction(repaired, 'insert-text');
          if (session.getState().revision !== beforeRevision) {
            pairedCanonicalInputRef.current = {
              inputType,
              data: inputEvent.data,
              revision: session.getState().revision,
            };
          }
          return;
        }""",
    "collapsed insert-text caret repair",
)

replace_once(
    """        if (inputType === 'insertParagraph') {
          inputEvent.preventDefault();
          commitUserTransaction(
            insertParagraphAtSelection(canonical, bookmark),
            'insert-paragraph',
          );
          return;
        }""",
    """        if (inputType === 'insertParagraph') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitUserTransaction(
            insertParagraphAtSelection(canonical, bookmark),
            'insert-paragraph',
          );
          if (session.getState().revision !== beforeRevision) {
            pairedCanonicalInputRef.current = {
              inputType,
              data: inputEvent.data,
              revision: session.getState().revision,
            };
          }
          return;
        }""",
    "paired paragraph input",
)

replace_once(
    """        if (inputType === 'insertLineBreak') {
          inputEvent.preventDefault();
          commitUserTransaction(
            replaceLogicalSelection(canonical, bookmark, '<br>'),
            'insert-line-break',
          );
          return;
        }""",
    """        if (inputType === 'insertLineBreak') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitUserTransaction(
            replaceLogicalSelection(canonical, bookmark, '<br>'),
            'insert-line-break',
          );
          if (session.getState().revision !== beforeRevision) {
            pairedCanonicalInputRef.current = {
              inputType,
              data: inputEvent.data,
              revision: session.getState().revision,
            };
          }
          return;
        }""",
    "paired line-break input",
)

replace_once(
    """        if (inputType === 'deleteContentBackward') {
          inputEvent.preventDefault();
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'backward'),
            'delete-backward',
          );
          return;
        }""",
    """        if (inputType === 'deleteContentBackward') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'backward'),
            'delete-backward',
          );
          if (session.getState().revision !== beforeRevision) {
            pairedCanonicalInputRef.current = {
              inputType,
              data: inputEvent.data,
              revision: session.getState().revision,
            };
          }
          return;
        }""",
    "paired backward-delete input",
)

replace_once(
    """        if (inputType === 'deleteContentForward') {
          inputEvent.preventDefault();
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'forward'),
            'delete-forward',
          );
          return;
        }""",
    """        if (inputType === 'deleteContentForward') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'forward'),
            'delete-forward',
          );
          if (session.getState().revision !== beforeRevision) {
            pairedCanonicalInputRef.current = {
              inputType,
              data: inputEvent.data,
              revision: session.getState().revision,
            };
          }
          return;
        }""",
    "paired forward-delete input",
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
            nativeSelectionPointAtClientPosition(
              surface,
              event.clientX,
              event.clientY,
            );
          return;
        }
        nativeSelectionDragStartRef.current = null;

        event.preventDefault();""",
    "cross-page pointer start capture",
)

replace_once(
    """            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}""",
    """            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                const dragStart = nativeSelectionDragStartRef.current;
                nativeSelectionDragStartRef.current = null;
                const dragEnd = dragStart
                  ? nativeSelectionPointAtClientPosition(
                      event.currentTarget,
                      event.clientX,
                      event.clientY,
                    )
                  : null;
                if (
                  dragStart &&
                  dragEnd &&
                  dragStart.pageContent !== dragEnd.pageContent
                ) {
                  const selection = window.getSelection();
                  if (selection?.setBaseAndExtent) {
                    selection.removeAllRanges();
                    selection.setBaseAndExtent(
                      dragStart.node,
                      dragStart.offset,
                      dragEnd.node,
                      dragEnd.offset,
                    );
                  }
                }
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}""",
    "cross-page native mouse range",
)

path.write_text(text)
