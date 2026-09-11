from pathlib import Path

path = Path("src/components/documents/a4-page-editor.tsx")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, got {count}")
    text = text.replace(old, new, 1)


# CORE owns the rendered projection revision/session identity. Keep a pending
# publication token until React has committed the matching page DOM.
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

# A session-backed reflow must not replace the last published projection with
# an unpaginated hard-section parse while the newer canonical revision is pending.
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

# Restore the canonical logical selection against the newly mounted projection
# before that projection is declared current. This prevents a same-revision
# keyboard event from observing a stale browser caret.
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

      if (!restoreFlowSelection(root, bookmark)) return false;
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
        pendingProjectionPublicationRef.current = null;
      }
    }, [pages, restorePendingFlowSelection, surfaceRepairGeneration]);

    useEffect(() => {
      const canonicalValue = sanitizeHtml("""
replace_once(anchor, restore_and_publish, "DOM-committed projection publication")

# The ordinary post-render path remains the fallback selection restoration path;
# it no longer discards a bookmark when mapping failed.
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

# Canonical soft edits schedule pagination while leaving the last committed pages
# mounted. Deterministic hard-page add/delete can publish their hard sections
# immediately because page count itself is the requested structural action.
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

# If a native input reaches React after a session-backed canonical handler, remount
# the committed projection from canonical authority without collapsing it to a
# hard-section parse. A logical bookmark is accepted only through C1 revision checks.
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
          if (!pendingFlowSelectionRef.current) {
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
                session.updateSelection(target.selection);
              }
            }
          }
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;
        }
        commitDocumentSurface();""",
    "canonical unexpected input repair",
)

# Pointer selections are normalized only at the rendered DOM endpoint. The page
# identity is used solely to detect a physical-page crossing; captureFlowSelection
# remains the projection-to-canonical mapping authority.
replace_once(
    """            onMouseUp={(event) => {
              if (!effectivePreviewMode) {
                syncActivePage(event.target);
                syncFormattingFromSelection();
              }
            }}""",
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
    "cross-page native mouse endpoint",
)

replace_once(
    """      savedSelectionRef.current = bookmark;
      setActiveFormats(""",
    """      savedSelectionRef.current = bookmark;
      canonicalSessionRef.current?.updateSelection(bookmark);
      setActiveFormats(""",
    "canonical pointer selection update",
)

path.write_text(text)
