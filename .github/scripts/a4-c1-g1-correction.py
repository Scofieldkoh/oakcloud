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
    "  type A4EditorSnapshot,\n  type CanonicalEditorIntentKind,",
    "  type A4EditorSnapshot,\n  type A4ProjectionRevision,\n  type CanonicalEditorIntentKind,",
    "projection revision import",
)

replace_once(
    "function selectionStartPoint(\n",
    """function sameProjectionRevision(
  left: A4ProjectionRevision,
  right: A4ProjectionRevision,
): boolean {
  return (
    left.sessionKey === right.sessionKey &&
    left.documentRevision === right.documentRevision &&
    left.layoutRevision === right.layoutRevision &&
    left.fontRevision === right.fontRevision
  );
}

function nearestTextBoundaryAtPointer(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): { node: Text; offset: number } | null {
  const selection = window.getSelection();
  const focusNode = selection?.focusNode;
  if (!selection || !focusNode || focusNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const textNode = focusNode as Text;
  if (!root.contains(textNode) || textNode.length === 0) return null;

  const nativeOffset = Math.min(
    Math.max(selection.focusOffset, 0),
    textNode.length,
  );
  const firstCandidate = Math.max(0, nativeOffset - 2);
  const lastCandidate = Math.min(textNode.length, nativeOffset + 2);
  let bestOffset = nativeOffset;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let offset = firstCandidate; offset <= lastCandidate; offset += 1) {
    const range = root.ownerDocument.createRange();
    let rect: DOMRect;
    let boundaryX: number;
    if (offset === 0) {
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(1, textNode.length));
      rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      boundaryX = rect.left;
    } else {
      range.setStart(textNode, 0);
      range.setEnd(textNode, offset);
      const rects = range.getClientRects();
      rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
      boundaryX = rect.right;
    }
    if (!rect.width && !rect.height) continue;
    const dx = boundaryX - clientX;
    const dy = rect.top + rect.height / 2 - clientY;
    const score = dx * dx + dy * dy * 16;
    if (score < bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  return { node: textNode, offset: bestOffset };
}

function refineCrossPageNativeSelectionFocus(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selectionSpansPages(root)) return;
  const anchorNode = selection.anchorNode;
  if (!anchorNode) return;
  const point = nearestTextBoundaryAtPointer(root, clientX, clientY);
  if (!point) return;
  selection.setBaseAndExtent(
    anchorNode,
    selection.anchorOffset,
    point.node,
    point.offset,
  );
}

function selectionStartPoint(
""",
    "projection and native endpoint helpers",
)

replace_once(
    "    const reflowGenerationRef = useRef(0);\n    const [isReflowing, setIsReflowing] = useState(false);",
    """    const reflowGenerationRef = useRef(0);
    const pendingProjectionPublicationRef = useRef<{
      revision: A4ProjectionRevision;
      pages: PageData[];
      generation: number;
    } | null>(null);
    const [isReflowing, setIsReflowing] = useState(false);""",
    "pending projection publication ref",
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
    """              if (
                session &&
                projectionRevision &&
                !session.publishProjection(projectionRevision)
              ) {
                return;
              }

              const nextPages = fragments.map""",
    """              if (
                session &&
                projectionRevision &&
                !sameProjectionRevision(
                  projectionRevision,
                  session.createProjectionRevision(),
                )
              ) {
                return;
              }

              const nextPages = fragments.map""",
    "defer projection publication until DOM commit",
)

replace_once(
    """              pagesRef.current = nextPages;
              if (!session) {""",
    """              pagesRef.current = nextPages;
              if (session && projectionRevision) {
                pendingProjectionPublicationRef.current = {
                  revision: projectionRevision,
                  pages: nextPages,
                  generation,
                };
              }
              if (!session) {""",
    "queue pending projection publication",
)

anchor = """    useEffect(() => {
      const canonicalValue = sanitizeHtml("""
restore_and_publish = """    const restorePendingFlowSelection = useCallback(() => {
      const bookmark = pendingFlowSelectionRef.current;
      if (!bookmark) return true;
      const root = documentSurfaceRef.current;
      if (!root) return false;

      const targetFlowElement = Array.from(
        root.querySelectorAll<HTMLElement>('[data-flow-id]'),
      ).find((element) => element.dataset.flowId === bookmark.anchor.flowId);
      const targetEditor = targetFlowElement?.closest(
        '[contenteditable=\"true\"]',
      ) as HTMLDivElement | null;
      targetEditor?.focus({ preventScroll: true });
      const pageElement =
        targetFlowElement?.closest<HTMLElement>('[data-page-id]') ?? null;
      pendingSelectionFlowIdRef.current = bookmark.anchor.flowId;

      const beforeSelection = window.getSelection();
      const beforeOffset = beforeSelection?.anchorOffset ?? null;
      const beforeText = beforeSelection?.anchorNode?.textContent ?? null;
      if (!restoreFlowSelection(root, bookmark)) {
        console.info('[c1-debug-restore-failed]', JSON.stringify({ bookmark }));
        return false;
      }
      const afterSelection = window.getSelection();
      console.info(
        '[c1-debug-restore]',
        JSON.stringify({
          bookmark,
          beforeOffset,
          beforeText,
          afterOffset: afterSelection?.anchorOffset ?? null,
          afterText: afterSelection?.anchorNode?.textContent ?? null,
        }),
      );
      savedSelectionRef.current = captureFlowSelection(root) ?? bookmark;
      setEditorStatus(null);
      if (pageElement?.dataset.pageId) {
        setActivePageId(pageElement.dataset.pageId);
      }
      pendingFlowSelectionRef.current = null;
      return true;
    }, []);

    useLayoutEffect(() => {
      const pending = pendingProjectionPublicationRef.current;
      if (
        !pending ||
        pending.pages !== pages ||
        pending.generation !== reflowGenerationRef.current
      ) {
        return;
      }
      const session = canonicalSessionRef.current;
      if (
        !session ||
        !sameProjectionRevision(
          pending.revision,
          session.createProjectionRevision(),
        )
      ) {
        pendingProjectionPublicationRef.current = null;
        return;
      }
      if (!restorePendingFlowSelection()) return;
      if (session.publishProjection(pending.revision)) {
        documentSurfaceRef.current?.setAttribute(
          'data-document-revision',
          String(pending.revision.documentRevision),
        );
        console.info(
          '[c1-debug-publish]',
          JSON.stringify({ revision: pending.revision.documentRevision }),
        );
        pendingProjectionPublicationRef.current = null;
      }
    }, [pages, restorePendingFlowSelection, surfaceRepairGeneration]);

    useEffect(() => {
      const canonicalValue = sanitizeHtml("""
replace_once(anchor, restore_and_publish, "DOM-committed projection publication")

replace_once(
    """    useEffect(() => {
      const bookmark = pendingFlowSelectionRef.current;
      const root = documentSurfaceRef.current;
      if (!bookmark || !root) return;

      const targetFlowElement = Array.from(
        root.querySelectorAll<HTMLElement>('[data-flow-id]'),
      ).find(
        (element) => element.dataset.flowId === bookmark.anchor.flowId,
      );
      const targetEditor = targetFlowElement?.closest(
        '[contenteditable=\"true\"]',
      ) as HTMLDivElement | null;
      targetEditor?.focus({ preventScroll: true });
      const pageElement = targetFlowElement?.closest<HTMLElement>(
        '[data-page-id]',
      ) ?? null;
      pendingSelectionFlowIdRef.current = bookmark.anchor.flowId;

      if (restoreFlowSelection(root, bookmark)) {
        savedSelectionRef.current = captureFlowSelection(root) ?? bookmark;
        setEditorStatus(null);
        if (pageElement?.dataset.pageId) {
          setActivePageId(pageElement.dataset.pageId);
        }
      }
      pendingFlowSelectionRef.current = null;
    }, [pages, surfaceRepairGeneration]);""",
    """    useEffect(() => {
      restorePendingFlowSelection();
    }, [pages, restorePendingFlowSelection, surfaceRepairGeneration]);""",
    "selection restoration fallback",
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
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;
        }
        commitDocumentSurface();""",
    "canonical unexpected input repair",
)

replace_once(
    """        const target = session.resolveNativeInputTarget({
          renderedRevision: session.getRenderedProjection().documentRevision,
          origin: inputEvent.isComposing ? 'composition' : 'keyboard',
          renderedSelection: rendered,
        });""",
    """        const renderedRevision =
          session.getRenderedProjection().documentRevision;
        const target = session.resolveNativeInputTarget({
          renderedRevision,
          origin: inputEvent.isComposing ? 'composition' : 'keyboard',
          renderedSelection: rendered,
        });
        if (
          inputEvent.inputType === 'insertParagraph' ||
          inputEvent.inputType === 'insertText'
        ) {
          const selection = window.getSelection();
          console.info(
            '[c1-debug-input]',
            JSON.stringify({
              inputType: inputEvent.inputType,
              data: inputEvent.data,
              stateRevision: session.getState().revision,
              renderedRevision,
              rendered,
              target,
              pendingFlowSelection: pendingFlowSelectionRef.current,
              domAnchorOffset: selection?.anchorOffset ?? null,
              domAnchorText: selection?.anchorNode?.textContent ?? null,
            }),
          );
        }""",
    "input routing diagnostics",
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
                const beforeSelection = window.getSelection();
                const beforeText = beforeSelection?.toString() ?? '';
                if (
                  beforeText.includes('First page') ||
                  beforeText.includes('pha') ||
                  beforeText.includes('Secon')
                ) {
                  console.info(
                    '[c1-debug-mouse-before]',
                    JSON.stringify({
                      clientX: event.clientX,
                      clientY: event.clientY,
                      anchorOffset: beforeSelection?.anchorOffset ?? null,
                      focusOffset: beforeSelection?.focusOffset ?? null,
                      anchorText: beforeSelection?.anchorNode?.textContent ?? null,
                      focusText: beforeSelection?.focusNode?.textContent ?? null,
                      selectedText: beforeText,
                      spansPages: selectionSpansPages(event.currentTarget),
                    }),
                  );
                }
                refineCrossPageNativeSelectionFocus(
                  event.currentTarget,
                  event.clientX,
                  event.clientY,
                );
                const afterSelection = window.getSelection();
                const afterText = afterSelection?.toString() ?? '';
                if (
                  beforeText.includes('First page') ||
                  beforeText.includes('pha') ||
                  beforeText.includes('Secon')
                ) {
                  console.info(
                    '[c1-debug-mouse-after]',
                    JSON.stringify({
                      anchorOffset: afterSelection?.anchorOffset ?? null,
                      focusOffset: afterSelection?.focusOffset ?? null,
                      focusText: afterSelection?.focusNode?.textContent ?? null,
                      selectedText: afterText,
                    }),
                  );
                }
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}""",
    "cross-page native mouse endpoint diagnostics",
)

path.write_text(text)
