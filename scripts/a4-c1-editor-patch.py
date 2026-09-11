from pathlib import Path
import re

path = Path('src/components/documents/a4-page-editor.tsx')
s = path.read_text()

def once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    s = s.replace(old, new, 1)

once(
"import { buildA4PrintCss, PAGE_NUMBER_STRIP_MM } from './a4-print-styles';\n",
"import { buildA4PrintCss, PAGE_NUMBER_STRIP_MM } from './a4-print-styles';\nimport {\n  createCanonicalEditorSession,\n  type A4EditorSnapshot,\n  type CanonicalEditorIntentKind,\n  type CanonicalEditorSession,\n  type SnapshotResult,\n} from './a4-pagination/editor-session';\n",
'import session',
)

once(
"  onLayoutChange?: (layout: A4DocumentLayout) => void;\n}\n\nexport interface A4PageEditorRef {\n",
"  onLayoutChange?: (layout: A4DocumentLayout) => void;\n  /** Stable document identity. W2 should supply the persisted entity/item identity. */\n  sessionKey?: string;\n  contentJson?: Record<string, unknown>;\n  fields?: readonly unknown[];\n  onSnapshotChange?: (snapshot: A4EditorSnapshot) => void;\n}\n\nexport interface A4PageEditorRef {\n",
'props',
)
once(
"  getContent: () => string;\n  setContent: (html: string) => void;\n",
"  getContent: () => string;\n  getSnapshot: () => SnapshotResult;\n  prepareSnapshot: () => SnapshotResult;\n  setContent: (html: string) => void;\n",
'ref snapshot',
)

once(
"      layout,\n      onLayoutChange,\n    },\n",
"      layout,\n      onLayoutChange,\n      sessionKey,\n      contentJson,\n      fields,\n      onSnapshotChange,\n    },\n",
'destructure props',
)

once(
"    const lastValueRef = useRef<string | null>(null);\n    const isInternalUpdate = useRef(false);\n\n    const savedSelectionRef",
"    const lastValueRef = useRef<string | null>(null);\n    const isInternalUpdate = useRef(false);\n    const onChangeRef = useRef(onChange);\n    const onSnapshotChangeRef = useRef(onSnapshotChange);\n    onChangeRef.current = onChange;\n    onSnapshotChangeRef.current = onSnapshotChange;\n    const canonicalSessionRef = useRef<\n      CanonicalEditorSession<\n        FlowSelectionBookmark | null,\n        unknown,\n        InlineFormatPatch | null,\n        A4DocumentLayout\n      > | null\n    >(null);\n    const sessionsRef = useRef(\n      new Map<\n        string,\n        CanonicalEditorSession<\n          FlowSelectionBookmark | null,\n          unknown,\n          InlineFormatPatch | null,\n          A4DocumentLayout\n        >\n      >(),\n    );\n    const resolvedSessionKey = sessionKey ?? 'legacy-a4-editor';\n\n    const savedSelectionRef",
'session refs',
)

once(
"    const canonicalPagesHtml = useCallback((pageList: PageData[]) => {\n      return reassemblePageFragments(\n        pageList.map((page) => ({\n          content: page.content,\n          hardBreakBefore: page.hardBreakBefore,\n          oversized: page.oversized,\n        })),\n      );\n    }, []);\n",
"    const canonicalPagesHtml = useCallback((pageList: PageData[]) => {\n      const session = canonicalSessionRef.current;\n      if (session) return session.getState().internalHtml;\n      return reassemblePageFragments(\n        pageList.map((page) => ({\n          content: page.content,\n          hardBreakBefore: page.hardBreakBefore,\n          oversized: page.oversized,\n        })),\n      );\n    }, []);\n",
'canonical source',
)

once(
"    const pendingFlowSelectionRef = useRef<FlowSelectionBookmark | null>(null);\n    const pendingNonCancelableMutationRef",
"    const pendingFlowSelectionRef = useRef<FlowSelectionBookmark | null>(null);\n    const compositionTargetRef = useRef<FlowSelectionBookmark | null>(null);\n    const pendingNonCancelableMutationRef",
'composition target',
)

once(
"      (sourcePages: PageData[], emitChange: boolean) => {\n        const renderedPages = renderedPagesRef.current;\n        pagesRef.current = sourcePages;\n        reflowGenerationRef.current += 1;\n",
"      (sourcePages: PageData[], emitChange: boolean) => {\n        const renderedPages = renderedPagesRef.current;\n        const session = canonicalSessionRef.current;\n        const projectionRevision = session?.createProjectionRevision() ?? null;\n        const canonical =\n          session?.getState().internalHtml ??\n          reassemblePageFragments(\n            sourcePages.map((page) => ({\n              content: page.content,\n              hardBreakBefore: page.hardBreakBefore,\n              oversized: page.oversized,\n            })),\n          );\n        pagesRef.current = sourcePages;\n        reflowGenerationRef.current += 1;\n",
'reflow capture',
)

inner_canonical = """            const canonical = reassemblePageFragments(
              pagesRef.current.map((page) => ({
                content: page.content,
                hardBreakBefore: page.hardBreakBefore,
                oversized: page.oversized,
              })),
            );
"""
once(inner_canonical, '', 'remove reflow reconstruction')

once(
"              if (generation !== reflowGenerationRef.current) return;\n\n              const nextPages = fragments.map",
"              if (generation !== reflowGenerationRef.current) return;\n              if (\n                session &&\n                projectionRevision &&\n                !session.publishProjection(projectionRevision)\n              ) {\n                return;\n              }\n\n              const nextPages = fragments.map",
'projection publication',
)

once(
"              pagesRef.current = nextPages;\n              lastValueRef.current = serializePages(nextPages);\n              pendingUpdateRef.current = emitChange;\n              setPages(nextPages);\n",
"              pagesRef.current = nextPages;\n              if (!session) {\n                lastValueRef.current = serializePages(nextPages);\n                pendingUpdateRef.current = emitChange;\n              }\n              setPages(nextPages);\n",
'reflow emit',
)

marker = """    useEffect(() => {
      scheduleReflow(pagesRef.current, false);
"""
if marker not in s:
    raise SystemExit('session init marker missing')
session_effect = """    useEffect(() => {
      const canonicalValue = sanitizeHtml(
        stripFlowMetadata(hydrateFlowHtml(ensureEditableCanonicalHtml(value))),
      );
      let session = sessionsRef.current.get(resolvedSessionKey) ?? null;
      if (!session) {
        const initialHtml = hydrateFlowHtml(ensureEditableCanonicalHtml(value));
        session = createCanonicalEditorSession({
          sessionKey: resolvedSessionKey,
          internalHtml: initialHtml,
          selection: null,
          typingMarks: null,
          contentJson: contentJson ?? {},
          fields,
          metadata: effectiveLayout,
          serializeContent: (internalHtml) =>
            sanitizeHtml(stripFlowMetadata(internalHtml)),
          onSnapshotChange: (snapshot) => {
            lastValueRef.current = snapshot.content;
            isInternalUpdate.current = true;
            onSnapshotChangeRef.current?.(snapshot);
            onChangeRef.current?.(snapshot.content);
          },
        });
        sessionsRef.current.set(resolvedSessionKey, session);
      } else {
        const current = session.getSnapshot();
        const currentContent = current.ok ? current.snapshot.content : null;
        const controlledEcho = canonicalValue === lastValueRef.current;
        if (!controlledEcho && currentContent !== canonicalValue) {
          session.replaceExternalState({
            internalHtml: hydrateFlowHtml(ensureEditableCanonicalHtml(value)),
            selection: null,
            contentJson: contentJson ?? session.getState().contentJson,
            fields: fields ?? session.getState().fields,
            metadata: effectiveLayout,
            resetHistory: true,
            acknowledged: true,
          });
        }
      }
      canonicalSessionRef.current = session;
      lastValueRef.current = canonicalValue;
      const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
      pagesRef.current = nextPages;
      setPages(nextPages);
      scheduleReflow(nextPages, false);
    }, [
      contentJson,
      effectiveLayout,
      fields,
      parsePages,
      resolvedSessionKey,
      scheduleReflow,
      value,
    ]);

"""
s = s.replace(marker, session_effect + marker, 1)

# Replace imperative get/set with canonical snapshot authority.
once(
"        getContent: () => serializePages(pagesRef.current),\n        setContent: (html: string) => {\n          const newPages = parsePages(html, pagesRef.current);\n          pagesRef.current = newPages;\n          setPages(newPages);\n          scheduleReflow(newPages, false);\n          if (newPages.length > 0 && !newPages.find((p) => p.id === activePageId)) {\n            setActivePageId(newPages[0].id);\n          }\n        },\n",
"        getContent: () => {\n          const snapshot = canonicalSessionRef.current?.getSnapshot();\n          return snapshot?.ok ? snapshot.snapshot.content : lastValueRef.current ?? '';\n        },\n        getSnapshot: () =>\n          canonicalSessionRef.current?.getSnapshot() ?? {\n            ok: false,\n            reason: 'unreconciled-input',\n            message: 'The canonical editor session is not ready.',\n          },\n        prepareSnapshot: () =>\n          canonicalSessionRef.current?.prepareSnapshot() ?? {\n            ok: false,\n            reason: 'unreconciled-input',\n            message: 'The canonical editor session is not ready.',\n          },\n        setContent: (html: string) => {\n          const session = canonicalSessionRef.current;\n          const canonical = hydrateFlowHtml(ensureEditableCanonicalHtml(html));\n          if (session) {\n            session.replaceExternalState({\n              internalHtml: canonical,\n              selection: null,\n              resetHistory: true,\n              acknowledged: true,\n            });\n          }\n          const newPages = parsePages(canonical, pagesRef.current);\n          pagesRef.current = newPages;\n          setPages(newPages);\n          scheduleReflow(newPages, false);\n          if (newPages.length > 0 && !newPages.find((p) => p.id === activePageId)) {\n            setActivePageId(newPages[0].id);\n          }\n        },\n",
'imperative snapshot',
)

# Remove old controlled-value page authority; session effect above handles external loads/echoes.
pattern = re.compile(r"    useEffect\(\(\) => \{\n      const canonicalValue = stripFlowMetadata\([\s\S]*?\n    \}, \[value, parsePages, isPreviewMode, readOnly, scheduleReflow\]\);\n", re.M)
s, n = pattern.subn('', s, count=1)
if n != 1:
    raise SystemExit(f'value effect: expected 1, got {n}')

# Replace page-fragment history with per-session history. Keep a no-op compatibility callback
# only for legacy helper bodies that are migrated below in this patch.
pattern = re.compile(r"    const historyRef = useRef<\{ past: string\[\]; future: string\[\] \}>\([\s\S]*?\n    const commitDocumentSurface = useCallback", re.M)
history_replacement = """    const pushHistorySnapshot = useCallback((_pageList: PageData[]) => undefined, []);

    useEffect(() => {
      if (pendingUpdateRef.current && onChange && !canonicalSessionRef.current) {
        pendingUpdateRef.current = false;
        const html = serializePages(pages);
        isInternalUpdate.current = true;
        lastValueRef.current = html;
        onChange(html);
      }
    }, [pages, onChange, serializePages]);

    const restoreCanonicalHistoryResult = useCallback(
      (direction: 'undo' | 'redo') => {
        if (effectivePreviewMode) return;
        const session = canonicalSessionRef.current;
        if (!session) return;
        const result = direction === 'undo' ? session.undo() : session.redo();
        if (result.status !== 'applied') return;
        pendingFlowSelectionRef.current = result.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        scheduleReflow(nextPages, false);
      },
      [effectivePreviewMode, parsePages, scheduleReflow],
    );

    const handleUndo = useCallback(
      () => restoreCanonicalHistoryResult('undo'),
      [restoreCanonicalHistoryResult],
    );
    const handleRedo = useCallback(
      () => restoreCanonicalHistoryResult('redo'),
      [restoreCanonicalHistoryResult],
    );

    const commitDocumentSurface = useCallback"""
s, n = pattern.subn(history_replacement, s, count=1)
if n != 1:
    raise SystemExit(f'history block: expected 1, got {n}')

# Revision-qualified whole-surface reconciliation remains only for operations such as table resize.
pattern = re.compile(r"    const commitDocumentSurface = useCallback\(\(\) => \{[\s\S]*?\n    \}, \[effectivePreviewMode, preserveScrollPosition, pushHistorySnapshot, scheduleReflow\]\);", re.M)
commit_surface = """    const commitDocumentSurface = useCallback(() => {
      const surface = documentSurfaceRef.current;
      const session = canonicalSessionRef.current;
      if (effectivePreviewMode || !surface || !session) return;
      const state = session.getState();
      if (session.getRenderedProjection().documentRevision !== state.revision) {
        setSurfaceRepairGeneration((generation) => generation + 1);
        setPages(parsePages(state.internalHtml, pagesRef.current));
        return;
      }

      const currentPages = pagesRef.current;
      const metadataByPageId = new Map(currentPages.map((page) => [page.id, page]));
      const renderedPageElements = Array.from(
        surface.querySelectorAll<HTMLElement>(
          '[data-testid^=\"a4-page-content-\"][data-page-id]',
        ),
      );
      renderedPageElements.forEach(normalizeEditedFlowIds);
      normalizeFormattingSpans(surface);
      const bookmark = captureFlowSelection(surface) ?? state.selection;
      const renderedPages = renderedPageElements.flatMap((element) => {
        const page = metadataByPageId.get(element.dataset.pageId!);
        if (!page) return [];
        return [{
          ...page,
          content: sanitizeHtml(replaceTypedPageBreaks(element.innerHTML)),
        }];
      });
      if (renderedPages.length !== currentPages.length) {
        setSurfaceRepairGeneration((generation) => generation + 1);
        setPages(parsePages(state.internalHtml, currentPages));
        return;
      }
      const candidate = hydrateFlowHtml(
        ensureEditableCanonicalHtml(
          reassemblePageFragments(
            renderedPages.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
              oversized: page.oversized,
            })),
          ),
        ),
      );
      if (candidate === state.internalHtml) return;
      preserveScrollPosition();
      const result = session.dispatch({
        sessionKey: state.sessionKey,
        baseRevision: state.revision,
        intent: { kind: 'native-reconcile', origin: 'pointer', history: 'separate' },
        selection: bookmark,
        apply: () => ({
          status: 'applied',
          internalHtml: candidate,
          selection: bookmark,
        }),
      });
      if (result.status !== 'applied') return;
      pendingFlowSelectionRef.current = result.selection;
      const nextPages = parsePages(session.getState().internalHtml, currentPages);
      pagesRef.current = nextPages;
      setPages(nextPages);
      scheduleReflow(nextPages, false);
    }, [effectivePreviewMode, parsePages, preserveScrollPosition, scheduleReflow]);"""
s, n = pattern.subn(commit_surface, s, count=1)
if n != 1:
    raise SystemExit(f'commit surface: expected 1, got {n}')

# Canonical dispatcher: one successful edit -> one local revision + notification.
pattern = re.compile(r"    const commitUserTransaction = useCallback\([\s\S]*?\n    \);\n\n    const applyInsertionTransaction", re.M)
commit_user = """    const commitUserTransaction = useCallback(
      (
        result: DocumentTransactionResult,
        intentKind: CanonicalEditorIntentKind = 'structural',
      ) => {
        const session = canonicalSessionRef.current;
        if (effectivePreviewMode || !result.changed || !session) return;
        const state = session.getState();
        const selection = result.selection ?? state.selection;
        const canonical = hydrateFlowHtml(ensureEditableCanonicalHtml(result.html));
        preserveScrollPosition();
        const committed = session.dispatch({
          sessionKey: state.sessionKey,
          baseRevision: state.revision,
          intent: {
            kind: intentKind,
            origin: 'keyboard',
            history: intentKind === 'insert-text' ? 'typing' : 'separate',
          },
          selection,
          apply: () => ({
            status: 'applied',
            internalHtml: canonical,
            selection,
          }),
        });
        if (committed.status !== 'applied') return;
        pendingFlowSelectionRef.current = committed.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        scheduleReflow(nextPages, false);
      },
      [effectivePreviewMode, parsePages, preserveScrollPosition, scheduleReflow],
    );

    const applyInsertionTransaction"""
s, n = pattern.subn(commit_user, s, count=1)
if n != 1:
    raise SystemExit(f'commit user: expected 1, got {n}')

# Cross-page delete now works only from canonical authority.
pattern = re.compile(r"    const handleDeleteAcrossPages = useCallback\(\(\) => \{[\s\S]*?\n    \}, \[effectivePreviewMode, parsePages, pushHistorySnapshot, scheduleReflow\]\);", re.M)
delete_across = """    const handleDeleteAcrossPages = useCallback(() => {
      if (effectivePreviewMode || !documentSurfaceRef.current) return;
      const session = canonicalSessionRef.current;
      if (!session) return;
      const rendered = captureFlowSelection(documentSurfaceRef.current);
      if (!rendered || rendered.collapsed) return;
      const target = session.resolveNativeInputTarget({
        renderedRevision: session.getRenderedProjection().documentRevision,
        origin: 'keyboard',
        renderedSelection: rendered,
      });
      if (!target.ok || target.selection.collapsed) return;
      const collapsePoint = selectionStartPoint(target.selection);
      const canonical = session.getState().internalHtml;
      const deleted = deleteFlowSelection(canonical, target.selection);
      commitUserTransaction(
        {
          html: deleted,
          selection: {
            anchor: collapsePoint,
            focus: collapsePoint,
            collapsed: true,
          },
          changed: deleted !== canonical,
        },
        'delete-backward',
      );
    }, [commitUserTransaction, effectivePreviewMode]);"""
s, n = pattern.subn(delete_across, s, count=1)
if n != 1:
    raise SystemExit(f'delete across: expected 1, got {n}')

# Bounded replacement helper uses canonical state, not physical page fragments.
pattern = re.compile(r"    const handleReplaceAcrossPages = useCallback\([\s\S]*?\n    \);\n\n    useEffect\(\(\) => \{\n      if \(!pendingFocusStartPageId.current\)", re.M)
replace_across = """    const handleReplaceAcrossPages = useCallback(
      (
        html: string,
        transaction?: {
          pages: PageData[];
          canonical: string;
          bookmark: FlowSelectionBookmark;
          replacementPoint: FlowSelectionBookmark['anchor'];
          repairSurface: boolean;
        },
      ) => {
        if (effectivePreviewMode || !documentSurfaceRef.current) return;
        const session = canonicalSessionRef.current;
        if (!session) return;
        const rendered =
          transaction?.bookmark ?? captureFlowSelection(documentSurfaceRef.current);
        if (!rendered) return;
        const target = transaction
          ? { ok: true as const, selection: rendered }
          : session.resolveNativeInputTarget({
              renderedRevision: session.getRenderedProjection().documentRevision,
              origin: 'keyboard',
              renderedSelection: rendered,
            });
        if (!target.ok) return;
        const result = replaceLogicalSelection(
          session.getState().internalHtml,
          target.selection,
          html,
        );
        commitUserTransaction(result, 'insert-text');
        if (transaction?.repairSurface) {
          setSurfaceRepairGeneration((generation) => generation + 1);
        }
      },
      [commitUserTransaction, effectivePreviewMode],
    );

    useEffect(() => {
      if (!pendingFocusStartPageId.current)"""
s, n = pattern.subn(replace_across, s, count=1)
if n != 1:
    raise SystemExit(f'replace across: expected 1, got {n}')

# Non-cancelable native repair is bounded to the captured logical range.
pattern = re.compile(r"    const repairPendingNonCancelableMutation = useCallback\([\s\S]*?\n    \);\n\n    const handleDocumentInput", re.M)
repair = """    const repairPendingNonCancelableMutation = useCallback(
      (followup?: { inputType?: string; data?: string | null }) => {
        const pending = pendingNonCancelableMutationRef.current;
        const session = canonicalSessionRef.current;
        if (!pending || !session) return false;
        pendingNonCancelableMutationRef.current = null;
        const inputType = followup?.inputType || pending.inputType;
        const inputData = followup?.data ?? pending.data;
        if (pending.repairOnly || !pending.bookmark) {
          setSurfaceRepairGeneration((generation) => generation + 1);
          const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
          pagesRef.current = nextPages;
          setPages(nextPages);
          return true;
        }
        if (inputType.startsWith('delete')) {
          const direction = inputType.toLowerCase().includes('forward')
            ? 'forward'
            : 'backward';
          commitUserTransaction(
            applyLogicalDelete(
              session.getState().internalHtml,
              pending.bookmark,
              direction,
            ),
            direction === 'forward' ? 'delete-forward' : 'delete-backward',
          );
          setSurfaceRepairGeneration((generation) => generation + 1);
          return true;
        }
        if (typeof inputData === 'string') {
          const replacement = document.createElement('div');
          replacement.textContent = inputData;
          const result = replaceLogicalSelection(
            session.getState().internalHtml,
            pending.bookmark,
            replacement.innerHTML,
          );
          commitUserTransaction(result, 'insert-text');
          setSurfaceRepairGeneration((generation) => generation + 1);
          return true;
        }
        session.markUnreconciledInput(
          'A native edit could not be reconciled safely. Review the affected text before saving.',
        );
        setSurfaceRepairGeneration((generation) => generation + 1);
        return true;
      },
      [commitUserTransaction, parsePages],
    );

    const handleDocumentInput"""
s, n = pattern.subn(repair, s, count=1)
if n != 1:
    raise SystemExit(f'repair pending: expected 1, got {n}')

# Input no longer commits the entire rendered document. Composition retains latest DOM only.
pattern = re.compile(r"    const handleDocumentInput = useCallback\([\s\S]*?\n    const handleDocumentPaste", re.M)
input_handlers = """    const handleDocumentInput = useCallback(
      (event: ReactFormEvent<HTMLDivElement>) => {
        const inputEvent = event.nativeEvent as InputEvent;
        const session = canonicalSessionRef.current;
        if (inputEvent.isComposing) {
          session?.updateCompositionDom(event.currentTarget.innerHTML);
          return;
        }
        if (
          repairPendingNonCancelableMutation({
            inputType: inputEvent.inputType,
            data: inputEvent.data,
          })
        ) {
          return;
        }
        if (session) {
          const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
          pagesRef.current = nextPages;
          setPages(nextPages);
          setSurfaceRepairGeneration((generation) => generation + 1);
          return;
        }
        commitDocumentSurface();
      },
      [commitDocumentSurface, parsePages, repairPendingNonCancelableMutation],
    );

    const handleDocumentCompositionStart = useCallback(
      (event: ReactCompositionEvent<HTMLDivElement>) => {
        const session = canonicalSessionRef.current;
        const surface = documentSurfaceRef.current;
        if (!session || !surface) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered) return;
        const target = session.beginComposition({
          renderedRevision: session.getRenderedProjection().documentRevision,
          renderedSelection: rendered,
          affectedNodeIds: [rendered.anchor.flowId, rendered.focus.flowId],
        });
        compositionTargetRef.current = target.ok ? target.selection : null;
      },
      [],
    );

    const handleDocumentCompositionEnd = useCallback(
      (event: ReactCompositionEvent<HTMLDivElement>) => {
        const session = canonicalSessionRef.current;
        const target = compositionTargetRef.current;
        compositionTargetRef.current = null;
        if (!session || !target) return;
        const replacement = document.createElement('div');
        replacement.textContent = event.data;
        const result = replaceLogicalSelection(
          session.getState().internalHtml,
          target,
          replacement.innerHTML,
        );
        if (!result.changed || !result.selection) {
          session.markUnreconciledInput(
            'Text composition could not be reconciled with the canonical range.',
          );
          return;
        }
        const committed = session.finishComposition({
          internalHtml: hydrateFlowHtml(ensureEditableCanonicalHtml(result.html)),
          selection: result.selection,
        });
        if (committed.status !== 'applied') return;
        pendingFlowSelectionRef.current = result.selection;
        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
        pagesRef.current = nextPages;
        setPages(nextPages);
        setSurfaceRepairGeneration((generation) => generation + 1);
        scheduleReflow(nextPages, false);
      },
      [parsePages, scheduleReflow],
    );

    const handleDocumentPaste"""
s, n = pattern.subn(input_handlers, s, count=1)
if n != 1:
    raise SystemExit(f'input handlers: expected 1, got {n}')

# Paste is one canonical transaction.
s = s.replace('        commitUserTransaction(result);\n      },\n      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],\n    );\n\n    const handleDocumentKeyDown',
'''        commitUserTransaction(result, 'paste');
      },
      [canonicalPagesHtml, commitUserTransaction, effectivePreviewMode],
    );

    const handleDocumentCut = useCallback(
      (event: ReactClipboardEvent<HTMLDivElement>) => {
        if (effectivePreviewMode) return;
        const surface = documentSurfaceRef.current;
        const session = canonicalSessionRef.current;
        if (!surface || !session) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered || rendered.collapsed) return;
        const target = session.resolveNativeInputTarget({
          renderedRevision: session.getRenderedProjection().documentRevision,
          origin: 'keyboard',
          renderedSelection: rendered,
        });
        if (!target.ok || target.selection.collapsed) return;
        event.preventDefault();
        const selection = window.getSelection();
        const text = selection?.toString() ?? '';
        event.clipboardData.setData('text/plain', text);
        const collapsePoint = selectionStartPoint(target.selection);
        const canonical = session.getState().internalHtml;
        const deleted = deleteFlowSelection(canonical, target.selection);
        commitUserTransaction(
          {
            html: deleted,
            selection: {
              anchor: collapsePoint,
              focus: collapsePoint,
              collapsed: true,
            },
            changed: deleted !== canonical,
          },
          'cut',
        );
      },
      [commitUserTransaction, effectivePreviewMode],
    );

    const handleDocumentKeyDown''', 1)
if 'const handleDocumentCut' not in s:
    raise SystemExit('paste/cut replacement failed')

# Canonical beforeinput coverage for ordinary typing, Enter/Shift+Enter and deletion.
pattern = re.compile(r"    const handleBeforeInput = useCallback\([\s\S]*?\n    useEffect\(\(\) => \{\n      const surface = documentSurfaceRef.current;", re.M)
beforeinput = """    const handleBeforeInput = useCallback(
      (inputEvent: InputEvent) => {
        if (effectivePreviewMode) return;
        const surface = documentSurfaceRef.current;
        const session = canonicalSessionRef.current;
        if (!surface || !session) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered) {
          if (inputEvent.cancelable) inputEvent.preventDefault();
          return;
        }
        const target = session.resolveNativeInputTarget({
          renderedRevision: session.getRenderedProjection().documentRevision,
          origin: inputEvent.isComposing ? 'composition' : 'keyboard',
          renderedSelection: rendered,
        });
        if (!target.ok) {
          if (inputEvent.cancelable) inputEvent.preventDefault();
          setEditorStatus('Selection is from an older page layout; choose the text again.');
          return;
        }
        if (
          inputEvent.isComposing ||
          inputEvent.inputType.toLowerCase().includes('composition')
        ) {
          return;
        }
        const canonical = session.getState().internalHtml;
        const bookmark = target.selection;
        if (!inputEvent.cancelable) {
          pendingNonCancelableMutationRef.current = {
            pages: pagesRef.current,
            canonical,
            bookmark,
            collapsePoint: bookmark.anchor,
            targetPageId: pageContentFromTarget(
              surface,
              window.getSelection()?.focusNode ?? null,
            )?.dataset.pageId ?? null,
            inputType: inputEvent.inputType,
            data: inputEvent.data,
            repairOnly: false,
          };
          return;
        }

        const inputType = inputEvent.inputType;
        if (inputType === 'insertText' || inputType === 'insertReplacementText') {
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
        }
        if (inputType === 'insertParagraph') {
          inputEvent.preventDefault();
          commitUserTransaction(
            insertParagraphAtSelection(canonical, bookmark),
            'insert-paragraph',
          );
          return;
        }
        if (inputType === 'insertLineBreak') {
          inputEvent.preventDefault();
          commitUserTransaction(
            replaceLogicalSelection(canonical, bookmark, '<br>'),
            'insert-line-break',
          );
          return;
        }
        if (inputType === 'deleteContentBackward') {
          inputEvent.preventDefault();
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'backward'),
            'delete-backward',
          );
          return;
        }
        if (inputType === 'deleteContentForward') {
          inputEvent.preventDefault();
          commitUserTransaction(
            applyLogicalDelete(canonical, bookmark, 'forward'),
            'delete-forward',
          );
          return;
        }
        if (inputType === 'insertFromPaste' || inputType === 'deleteByCut') {
          inputEvent.preventDefault();
          return;
        }
        if (inputType) {
          inputEvent.preventDefault();
          setEditorStatus(`Unsupported native edit was blocked: ${inputType}`);
        }
      },
      [commitUserTransaction, effectivePreviewMode],
    );

    useEffect(() => {
      const surface = documentSurfaceRef.current;"""
s, n = pattern.subn(beforeinput, s, count=1)
if n != 1:
    raise SystemExit(f'beforeinput: expected 1, got {n}')

# Mark format operations distinctly where the common selected-inline path commits.
s = s.replace('          commitUserTransaction(\n            applyInlineFormat(', "          commitUserTransaction(\n            applyInlineFormat(", 1)
# Keep defaults structural for old command adapters; C2 will consume S1 command kinds.

# Ensure page-break compatibility mutation is committed into canonical session rather than only pages.
old = """        pagesRef.current = updatedPages;
        scheduleReflow(updatedPages, true);
        return updatedPages;
"""
if old in s:
    new = """        const session = canonicalSessionRef.current;
        if (session) {
          const canonical = reassemblePageFragments(
            updatedPages.map((page) => ({
              content: page.content,
              hardBreakBefore: page.hardBreakBefore,
              oversized: page.oversized,
            })),
          );
          const state = session.getState();
          session.dispatch({
            sessionKey: state.sessionKey,
            baseRevision: state.revision,
            intent: { kind: 'structural', origin: 'keyboard', history: 'separate' },
            selection: pendingFlowSelectionRef.current ?? state.selection,
            apply: () => ({
              status: 'applied',
              internalHtml: hydrateFlowHtml(ensureEditableCanonicalHtml(canonical)),
              selection: pendingFlowSelectionRef.current ?? state.selection,
            }),
          });
        }
        pagesRef.current = updatedPages;
        scheduleReflow(updatedPages, false);
        return updatedPages;
"""
    s = s.replace(old, new, 1)

# Wire composition/cut handlers and expose the projection revision on the editable surface.
once(
"            data-testid=\"a4-document-surface\"\n            contentEditable={!effectivePreviewMode}\n",
"            data-testid=\"a4-document-surface\"\n            data-document-revision={\n              canonicalSessionRef.current?.getRenderedProjection().documentRevision ?? 0\n            }\n            contentEditable={!effectivePreviewMode}\n",
'surface revision',
)
once(
"            onInput={handleDocumentInput}\n            onCompositionEnd={handleDocumentCompositionEnd}\n            onKeyDown={handleDocumentKeyDown}\n            onPaste={handleDocumentPaste}\n",
"            onInput={handleDocumentInput}\n            onCompositionStart={handleDocumentCompositionStart}\n            onCompositionEnd={handleDocumentCompositionEnd}\n            onKeyDown={handleDocumentKeyDown}\n            onPaste={handleDocumentPaste}\n            onCut={handleDocumentCut}\n",
'handlers',
)

# Save/selection callbacks should end the continuous typing group on explicit pointer/selection changes.
once(
"    const saveCursorPosition = useCallback(() => {\n      const surface = documentSurfaceRef.current;\n      if (surface) savedSelectionRef.current = captureFlowSelection(surface);\n    }, []);\n",
"    const saveCursorPosition = useCallback(() => {\n      const surface = documentSurfaceRef.current;\n      if (surface) {\n        savedSelectionRef.current = captureFlowSelection(surface);\n        canonicalSessionRef.current?.endTypingGroup();\n      }\n    }, []);\n",
'end typing selection',
)

# Static review guards: the ordinary input path must no longer call the whole-surface reconciler.
if '      commitDocumentSurface();\n    }, [commitDocumentSurface, repairPendingNonCancelableMutation]);' in s:
    raise SystemExit('stale ordinary input fallback still present')

path.write_text(s)
print('patched', path)
