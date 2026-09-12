from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{label}: start marker not found")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{label}: end marker not found")
    return text[:start_index] + replacement + text[end_index:]


editor_path = Path('src/components/documents/a4-page-editor.tsx')
editor = editor_path.read_text(encoding='utf-8')

editor = replace_once(
    editor,
    "import { cn } from '@/lib/utils';\n",
    "import { cn } from '@/lib/utils';\n"
    "import {\n"
    "  A4_EDITOR_DECORATION_ATTRIBUTES,\n"
    "  getA4SanitizerPolicy,\n"
    "} from '@/lib/a4-content-policy';\n"
    "import type {\n"
    "  FieldOwnerScope,\n"
    "  ParsedTemplateFieldSyntax,\n"
    "} from '@/lib/template-field-contract';\n",
    'shared F1 imports',
)
editor = editor.replace('  deleteFlowSelection,\n', '')
editor = editor.replace('  replaceFlowSelection,\n', '')
editor = replace_once(
    editor,
    "import {\n  paginateFlowHtml,\n  type HtmlMeasurer,\n} from './a4-pagination/engine';\n",
    "import {\n  paginateA4FlowHtml,\n  paginateFlowHtml,\n  type HtmlMeasurer,\n} from './a4-pagination/engine';\n",
    'S1 pagination import',
)
editor = editor.replace('  applyLogicalDelete,\n', '')
editor = editor.replace('  insertParagraphAtSelection,\n', '')
editor = replace_once(
    editor,
    "} from './a4-pagination/editor-session';\n",
    "} from './a4-pagination/editor-session';\n"
    "import type { A4ProjectionPositionMap } from './a4-pagination/semantic-page-breaks';\n"
    "import {\n"
    "  analyzeA4EditorFieldSource,\n"
    "  runA4EditorSemanticCommand,\n"
    "  type A4EditorSemanticCommand,\n"
    "} from './a4-editor-semantic-bridge';\n",
    'C2 bridge imports',
)

sanitize_start = 'function sanitizeHtml(html: string): string {'
sanitize_end = '// ============================================================================\n// Overflow helpers'
sanitize_replacement = """const A4_SANITIZER_POLICY = getA4SanitizerPolicy();

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: A4_SANITIZER_POLICY.allowedTags,
    ALLOWED_ATTR: [
      ...A4_SANITIZER_POLICY.allowedAttributes,
      ...A4_EDITOR_DECORATION_ATTRIBUTES,
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))/i,
  });
}

"""
editor = replace_between(
    editor,
    sanitize_start,
    sanitize_end,
    sanitize_replacement,
    'F1 sanitizer policy wiring',
)

editor = replace_once(
    editor,
    "  fields?: readonly unknown[];\n  onSnapshotChange?: (snapshot: A4EditorSnapshot) => void;\n",
    "  fields?: readonly unknown[];\n"
    "  /** Stable C05 owner scope supplied by the template/partial integration. */\n"
    "  fieldScope?: FieldOwnerScope;\n"
    "  /** Source-preserving F1 parser output for field decoration/navigation. */\n"
    "  onFieldAnalysis?: (analysis: ParsedTemplateFieldSyntax) => void;\n"
    "  onSnapshotChange?: (snapshot: A4EditorSnapshot) => void;\n",
    'field hook props',
)
editor = replace_once(
    editor,
    "      fields,\n      onSnapshotChange,\n",
    "      fields,\n      fieldScope,\n      onFieldAnalysis,\n      onSnapshotChange,\n",
    'field hook destructure',
)
editor = replace_once(
    editor,
    "    const onSnapshotChangeRef = useRef(onSnapshotChange);\n    const suppressNextOnChangeRef = useRef(false);\n    onChangeRef.current = onChange;\n    onSnapshotChangeRef.current = onSnapshotChange;\n",
    "    const onSnapshotChangeRef = useRef(onSnapshotChange);\n"
    "    const fieldScopeRef = useRef(fieldScope);\n"
    "    const onFieldAnalysisRef = useRef(onFieldAnalysis);\n"
    "    const suppressNextOnChangeRef = useRef(false);\n"
    "    onChangeRef.current = onChange;\n"
    "    onSnapshotChangeRef.current = onSnapshotChange;\n"
    "    fieldScopeRef.current = fieldScope;\n"
    "    onFieldAnalysisRef.current = onFieldAnalysis;\n",
    'field hook refs',
)
editor = replace_once(
    editor,
    "    const reflowGenerationRef = useRef(0);\n",
    "    const reflowGenerationRef = useRef(0);\n"
    "    const semanticProjectionMapRef = useRef<A4ProjectionPositionMap | null>(null);\n",
    'projection map ref',
)

editor = replace_once(
    editor,
    "              const fragments = paginateFlowHtml(\n                canonical,\n                measurer,\n                pageLayout.contentHeightPx,\n              );\n",
    "              const pagination = paginateA4FlowHtml(\n"
    "                { internalHtml: canonical },\n"
    "                {\n"
    "                  sessionKey: projectionRevision?.sessionKey ?? resolvedSessionKey,\n"
    "                  documentRevision:\n"
    "                    projectionRevision?.documentRevision ??\n"
    "                    session?.getState().revision ??\n"
    "                    0,\n"
    "                },\n"
    "                measurer,\n"
    "                pageLayout.contentHeightPx,\n"
    "              );\n"
    "              const fragments = pagination.pages;\n",
    'revision-qualified S1 pagination',
)
editor = replace_once(
    editor,
    "              if (\n                session &&\n                projectionRevision &&\n                !session.publishProjection(projectionRevision)\n              ) {\n                return;\n              }\n\n              const nextPages = fragments.map((fragment, index) => ({\n",
    "              if (\n"
    "                projectionRevision &&\n"
    "                (pagination.positionMap.sessionKey !== projectionRevision.sessionKey ||\n"
    "                  pagination.positionMap.documentRevision !==\n"
    "                    projectionRevision.documentRevision)\n"
    "              ) {\n"
    "                return;\n"
    "              }\n"
    "              if (\n"
    "                session &&\n"
    "                projectionRevision &&\n"
    "                !session.publishProjection(projectionRevision)\n"
    "              ) {\n"
    "                return;\n"
    "              }\n"
    "              semanticProjectionMapRef.current = pagination.positionMap;\n\n"
    "              const nextPages = fragments.map((fragment, index) => ({\n",
    'projection map publication',
)
editor = replace_once(
    editor,
    "      [fontFamily, fontSize, lineHeight, pageLayout, paragraphSpacing, serializePages],\n",
    "      [\n"
    "        fontFamily,\n"
    "        fontSize,\n"
    "        lineHeight,\n"
    "        pageLayout,\n"
    "        paragraphSpacing,\n"
    "        resolvedSessionKey,\n"
    "        serializePages,\n"
    "      ],\n",
    'schedule reflow dependencies',
)
editor = replace_once(
    editor,
    "            onSnapshotChangeRef.current?.(snapshot);\n            if (contentChanged && !suppressOnChange) {\n",
    "            onSnapshotChangeRef.current?.(snapshot);\n"
    "            const scope = fieldScopeRef.current;\n"
    "            if (scope) {\n"
    "              onFieldAnalysisRef.current?.(\n"
    "                analyzeA4EditorFieldSource(snapshot.content, scope),\n"
    "              );\n"
    "            }\n"
    "            if (contentChanged && !suppressOnChange) {\n",
    'snapshot field analysis hook',
)
editor = replace_once(
    editor,
    "    useEffect(() => {\n      scheduleReflow(pagesRef.current, false);\n",
    "    useEffect(() => {\n"
    "      const scope = fieldScopeRef.current;\n"
    "      const snapshot = canonicalSessionRef.current?.getSnapshot();\n"
    "      if (scope && snapshot?.ok) {\n"
    "        onFieldAnalysisRef.current?.(\n"
    "          analyzeA4EditorFieldSource(snapshot.snapshot.content, scope),\n"
    "        );\n"
    "      }\n"
    "    }, [fieldScope?.id, fieldScope?.kind, fieldScope?.label, resolvedSessionKey, value]);\n\n"
    "    useEffect(() => {\n      scheduleReflow(pagesRef.current, false);\n",
    'initial field analysis effect',
)

commit_anchor = "    const applyInsertionTransaction = useCallback(\n"
semantic_helper = """    const commitSemanticCommand = useCallback(
      (
        bookmark: FlowSelectionBookmark,
        command: A4EditorSemanticCommand,
        intentKind: CanonicalEditorIntentKind = 'structural',
        publishParsedProjection = false,
      ) => {
        const result = runA4EditorSemanticCommand(
          canonicalPagesHtml(pagesRef.current),
          bookmark,
          command,
        );
        if (result.status === 'applied') {
          setEditorStatus(null);
          commitUserTransaction(
            result.transaction,
            intentKind,
            publishParsedProjection,
          );
          return true;
        }
        if (result.status === 'rejected') {
          setEditorStatus(result.message);
        }
        return false;
      },
      [canonicalPagesHtml, commitUserTransaction],
    );

"""
editor = replace_once(editor, commit_anchor, semantic_helper + commit_anchor, 'semantic command dispatcher')

handle_delete_start = '    const handleDeleteAcrossPages = useCallback(() => {'
handle_delete_end = '    const handleReplaceAcrossPages = useCallback('
handle_delete_replacement = """    const handleDeleteAcrossPages = useCallback(
      (direction: 'backward' | 'forward') => {
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
        if (!target.ok || !target.selection || target.selection.collapsed) return;
        commitSemanticCommand(
          target.selection,
          { type: 'delete', direction },
          direction === 'forward' ? 'delete-forward' : 'delete-backward',
        );
      },
      [commitSemanticCommand, effectivePreviewMode],
    );

"""
editor = replace_between(editor, handle_delete_start, handle_delete_end, handle_delete_replacement, 'cross-page delete routing')

editor = replace_once(
    editor,
    "          commitUserTransaction(\n            applyLogicalDelete(\n              session.getState().internalHtml,\n              pending.bookmark,\n              direction,\n            ),\n            direction === 'forward' ? 'delete-forward' : 'delete-backward',\n          );\n",
    "          commitSemanticCommand(\n"
    "            pending.bookmark,\n"
    "            { type: 'delete', direction },\n"
    "            direction === 'forward' ? 'delete-forward' : 'delete-backward',\n"
    "          );\n",
    'non-cancelable delete repair',
)
editor = replace_once(
    editor,
    "      [commitUserTransaction, parsePages],\n    );\n\n    const handleDocumentInput",
    "      [commitSemanticCommand, commitUserTransaction, parsePages],\n    );\n\n    const handleDocumentInput",
    'repair dependencies',
)

cut_start = '    const handleDocumentCut = useCallback('
cut_end = '    const handleDocumentKeyDown = useCallback('
cut_replacement = """    const handleDocumentCut = useCallback(
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
        if (!target.ok || !target.selection || target.selection.collapsed) return;
        event.preventDefault();
        event.clipboardData.setData('text/plain', window.getSelection()?.toString() ?? '');
        commitSemanticCommand(
          target.selection,
          { type: 'delete', direction: 'backward' },
          'cut',
        );
      },
      [commitSemanticCommand, effectivePreviewMode],
    );

"""
editor = replace_between(editor, cut_start, cut_end, cut_replacement, 'cut semantic routing')

keydown_start = '    const handleDocumentKeyDown = useCallback('
keydown_end = '    const handleBeforeInput = useCallback('
keydown_replacement = """    const handleDocumentKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (effectivePreviewMode) return;
        const pageContent = syncActivePage(event.target);

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          selectAllDocument();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          handleRedo();
          return;
        }

        const surface = documentSurfaceRef.current;
        if (
          surface &&
          event.key === 'Delete' &&
          pageContent &&
          isCaretAtEditorEnd(pageContent)
        ) {
          const session = canonicalSessionRef.current;
          const bookmark = captureFlowSelection(surface);
          if (session && bookmark) {
            event.preventDefault();
            const target = session.resolveNativeInputTarget({
              renderedRevision: session.getRenderedProjection().documentRevision,
              origin: 'keyboard',
              renderedSelection: bookmark,
            });
            if (!target.ok || !target.selection) {
              const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
              pagesRef.current = nextPages;
              setPages(nextPages);
              setSurfaceRepairGeneration((generation) => generation + 1);
              return;
            }
            commitSemanticCommand(
              target.selection,
              { type: 'delete', direction: 'forward' },
              'delete-forward',
            );
            return;
          }
        }

        if (
          surface &&
          (event.key === 'Backspace' || event.key === 'Delete') &&
          selectionSpansPages(surface)
        ) {
          event.preventDefault();
          handleDeleteAcrossPages(event.key === 'Delete' ? 'forward' : 'backward');
          return;
        }

        if (
          surface &&
          event.key === 'Backspace' &&
          pageContent &&
          isCaretAtEditorStart(pageContent)
        ) {
          event.preventDefault();
          const session = canonicalSessionRef.current;
          const bookmark = captureFlowSelection(surface);
          if (!session || !bookmark) {
            if (session) {
              const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
              pagesRef.current = nextPages;
              setPages(nextPages);
              setSurfaceRepairGeneration((generation) => generation + 1);
            }
            return;
          }
          const target = session.resolveNativeInputTarget({
            renderedRevision: session.getRenderedProjection().documentRevision,
            origin: 'keyboard',
            renderedSelection: bookmark,
          });
          if (!target.ok || !target.selection) {
            const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);
            pagesRef.current = nextPages;
            setPages(nextPages);
            setSurfaceRepairGeneration((generation) => generation + 1);
            return;
          }
          commitSemanticCommand(
            target.selection,
            { type: 'delete', direction: 'backward' },
            'delete-backward',
          );
        }
      },
      [
        commitSemanticCommand,
        effectivePreviewMode,
        handleDeleteAcrossPages,
        handleRedo,
        handleUndo,
        parsePages,
        selectAllDocument,
        syncActivePage,
      ],
    );

"""
editor = replace_between(editor, keydown_start, keydown_end, keydown_replacement, 'keyboard semantic routing')

before_start = '    const handleBeforeInput = useCallback('
before_end = '    useEffect(() => {\n      const surface = documentSurfaceRef.current;\n      if (!surface || effectivePreviewMode) return;\n\n      surface.addEventListener(\'beforeinput\', handleBeforeInput);'
before_replacement = """    const handleBeforeInput = useCallback(
      (inputEvent: InputEvent) => {
        if (effectivePreviewMode) return;
        pairedCanonicalInputRef.current = null;
        const surface = documentSurfaceRef.current;
        const session = canonicalSessionRef.current;
        if (!surface || !session) return;
        const rendered = captureFlowSelection(surface);
        if (!rendered) {
          if (inputEvent.cancelable) {
            inputEvent.preventDefault();
            return;
          }
          const state = session.getState();
          pendingNonCancelableMutationRef.current = {
            pages: pagesRef.current,
            canonical: state.internalHtml,
            bookmark: null,
            collapsePoint: null,
            targetPageId:
              pageContentFromTarget(surface, window.getSelection()?.focusNode ?? null)
                ?.dataset.pageId ?? activePageIdRef.current ?? null,
            inputType: inputEvent.inputType,
            data: inputEvent.data,
            repairOnly: true,
          };
          return;
        }
        const target = session.resolveNativeInputTarget({
          renderedRevision: session.getRenderedProjection().documentRevision,
          origin: inputEvent.isComposing ? 'composition' : 'keyboard',
          renderedSelection: rendered,
        });
        if (!target.ok || !target.selection) {
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
            targetPageId:
              pageContentFromTarget(surface, window.getSelection()?.focusNode ?? null)
                ?.dataset.pageId ?? null,
            inputType: inputEvent.inputType,
            data: inputEvent.data,
            repairOnly: false,
          };
          return;
        }

        const inputType = inputEvent.inputType;
        const pairCommittedInput = (beforeRevision: number) => {
          if (session.getState().revision !== beforeRevision) {
            pairedCanonicalInputRef.current = {
              inputType,
              data: inputEvent.data,
              revision: session.getState().revision,
            };
          }
        };

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
          const repaired = repairCollapsedNativeTextSelection(result, bookmark, data);
          if (repaired.changed && repaired.selection) {
            pendingTypingPointRef.current = repaired.selection.anchor;
          }
          const hardSectionTopologyChanged =
            !bookmark.collapsed &&
            splitHardSections(canonical).length !== splitHardSections(repaired.html).length;
          const beforeRevision = session.getState().revision;
          commitUserTransaction(repaired, 'insert-text', hardSectionTopologyChanged);
          pairCommittedInput(beforeRevision);
          return;
        }
        if (inputType === 'insertParagraph') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitSemanticCommand(bookmark, { type: 'insert-paragraph' }, 'insert-paragraph');
          pairCommittedInput(beforeRevision);
          return;
        }
        if (inputType === 'insertLineBreak') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitSemanticCommand(bookmark, { type: 'insert-line-break' }, 'insert-line-break');
          pairCommittedInput(beforeRevision);
          return;
        }
        if (inputType === 'deleteContentBackward') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitSemanticCommand(
            bookmark,
            { type: 'delete', direction: 'backward' },
            'delete-backward',
          );
          pairCommittedInput(beforeRevision);
          return;
        }
        if (inputType === 'deleteContentForward') {
          inputEvent.preventDefault();
          const beforeRevision = session.getState().revision;
          commitSemanticCommand(
            bookmark,
            { type: 'delete', direction: 'forward' },
            'delete-forward',
          );
          pairCommittedInput(beforeRevision);
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
      [commitSemanticCommand, commitUserTransaction, effectivePreviewMode],
    );

"""
editor = replace_between(editor, before_start, before_end, before_replacement, 'beforeinput semantic routing')

split_start = '    const splitActivePageAtSelection = useCallback(() => {'
split_end = '    const clearPendingTypingFormat = useCallback(() => {'
split_replacement = """    const splitActivePageAtSelection = useCallback(() => {
      if (effectivePreviewMode) return;
      const surface = documentSurfaceRef.current;
      const session = canonicalSessionRef.current;
      if (!surface || !session) return;
      const rendered = captureFlowSelection(surface);
      if (!rendered) {
        setEditorStatus('Choose a document position before inserting a page break.');
        return;
      }
      const target = session.resolveNativeInputTarget({
        renderedRevision: session.getRenderedProjection().documentRevision,
        origin: 'keyboard',
        renderedSelection: rendered,
      });
      if (!target.ok || !target.selection) {
        setEditorStatus('Selection is from an older page layout; choose the text again.');
        return;
      }
      commitSemanticCommand(
        target.selection,
        { type: 'insert-manual-break' },
        'structural',
        true,
      );
    }, [commitSemanticCommand, effectivePreviewMode]);

"""
editor = replace_between(editor, split_start, split_end, split_replacement, 'manual break semantic routing')

editor = replace_once(
    editor,
    "      clearPendingTypingFormat();\n      if (bookmark.collapsed) {\n        setActiveFormats((prev) => ({\n          ...prev,\n          bold: false,\n          italic: false,\n          underline: false,\n        }));\n        return;\n      }\n",
    "      if (bookmark.collapsed) {\n"
    "        setPendingTypingFormat({\n"
    "          fontFamily: null,\n"
    "          fontSize: null,\n"
    "          color: null,\n"
    "          backgroundColor: null,\n"
    "          fontWeight: null,\n"
    "          fontStyle: null,\n"
    "          textDecoration: null,\n"
    "        });\n"
    "        setActiveFormats((prev) => ({\n"
    "          ...prev,\n"
    "          bold: false,\n"
    "          italic: false,\n"
    "          underline: false,\n"
    "          fontFamily: effectiveLayout.fontFamily,\n"
    "          fontSize: effectiveLayout.fontSize,\n"
    "          textColor: '#000000',\n"
    "          highlightColor: '#ffffff',\n"
    "        }));\n"
    "        return;\n"
    "      }\n"
    "      clearPendingTypingFormat();\n",
    'collapsed clear typing marks',
)
editor = replace_once(
    editor,
    "      restoreSelection,\n    ]);\n\n    const applySelectionTransaction",
    "      restoreSelection,\n      setPendingTypingFormat,\n    ]);\n\n    const applySelectionTransaction",
    'clear formatting dependencies',
)
editor = replace_once(
    editor,
    "            data-document-revision={\n              canonicalSessionRef.current?.getRenderedProjection().documentRevision ?? 0\n            }\n",
    "            data-document-revision={\n"
    "              canonicalSessionRef.current?.getRenderedProjection().documentRevision ?? 0\n"
    "            }\n"
    "            data-semantic-projection-revision={\n"
    "              semanticProjectionMapRef.current?.documentRevision ?? 0\n"
    "            }\n",
    'projection diagnostics',
)

if 'applyLogicalDelete' in editor or 'insertParagraphAtSelection' in editor or 'deleteFlowSelection' in editor:
    raise SystemExit('legacy semantic mutation import/use remains after C2 patch')

editor_path.write_text(editor, encoding='utf-8')

browser_path = Path('__tests__/browser/a4-input-sequences.browser.test.tsx')
browser = browser_path.read_text(encoding='utf-8')
if "inserts and removes a semantic page break inside a later-page list item" not in browser:
    closing = '\n});\n'
    if not browser.endswith(closing):
        raise SystemExit('browser test closing marker changed')
    extra = r'''

  it('inserts and removes a semantic page break inside a later-page list item', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={boundaryListFixture()} />);
    });
    const surface = await waitForEditorIdle();
    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);
    const paragraph = pageContents[1].querySelector('p');
    if (!paragraph) throw new Error('Expected page-2 list content');
    const label = paragraph.textContent?.match(/^Item \d+ /)?.[0] ?? '';
    surface.focus();
    setCollapsedCaret(paragraph, label.length);

    const insertBreak = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Insert page break"]',
    );
    if (!insertBreak) throw new Error('Expected page-break toolbar command');
    await act(async () => {
      await userEvent.click(insertBreak);
    });
    await waitForEditorIdle();

    const withBreak = editorRef.current?.getContent() ?? '';
    const withBreakRoot = new DOMParser().parseFromString(withBreak, 'text/html');
    expect(withBreakRoot.querySelectorAll('span[data-a4-break="page"]')).toHaveLength(1);
    expect(withBreakRoot.querySelectorAll('li')).toHaveLength(30);
    for (let index = 1; index <= 30; index += 1) {
      expect(withBreakRoot.body.textContent ?? '').toContain(`Item ${index} `);
    }

    surface.focus();
    await act(async () => {
      await userEvent.keyboard('{Backspace}');
    });
    await waitForEditorIdle();

    const withoutBreak = editorRef.current?.getContent() ?? '';
    const withoutBreakRoot = new DOMParser().parseFromString(withoutBreak, 'text/html');
    expect(withoutBreakRoot.querySelectorAll('span[data-a4-break="page"]')).toHaveLength(0);
    expect(withoutBreakRoot.querySelectorAll('li')).toHaveLength(30);
    for (let index = 1; index <= 30; index += 1) {
      expect(withoutBreakRoot.body.textContent ?? '').toContain(`Item ${index} `);
    }
  });

  it('replaces a native cross-page selection with one semantic line break', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    await act(async () => {
      root.render(<A4PageEditor ref={editorRef} value={boundaryListFixture()} />);
    });
    const surface = await waitForEditorIdle();
    const pageContents = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid^="a4-page-content-"]'),
    );
    expect(pageContents.length).toBeGreaterThan(1);
    const firstPageParagraphs = pageContents[0].querySelectorAll('p');
    const secondPageFirstParagraph = pageContents[1].querySelector('p');
    const firstPageLastParagraph = firstPageParagraphs[firstPageParagraphs.length - 1];
    if (!firstPageLastParagraph || !secondPageFirstParagraph) {
      throw new Error('Expected paragraphs on both sides of a page boundary');
    }
    selectAcrossElements(
      firstPageLastParagraph,
      Math.max(0, (firstPageLastParagraph.textContent?.length ?? 0) - 6),
      secondPageFirstParagraph,
      Math.min(6, secondPageFirstParagraph.textContent?.length ?? 0),
    );
    surface.focus();
    const before = editorRef.current?.getContent() ?? '';

    await act(async () => {
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    });
    await waitForEditorIdle();

    const after = editorRef.current?.getContent() ?? '';
    expect(after).not.toBe(before);
    expect(after).toContain('<br');
    expect(canonicalText(after)).toContain('Item 30 ');
    expect(window.getSelection()?.isCollapsed).toBe(true);
  });
'''
    browser = browser[:-len(closing)] + extra + closing
    browser_path.write_text(browser, encoding='utf-8')
