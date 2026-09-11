from pathlib import Path
import re

EDITOR = Path('src/components/documents/a4-page-editor.tsx')
TESTS = Path('__tests__/components/a4-page-editor.test.tsx')
BROWSER = Path('__tests__/browser/a4-input-sequences.browser.test.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


def replace_test(text: str, title: str, next_title: str, replacement: str) -> str:
    pattern = re.compile(
        re.escape("  it('" + title + "',")
        + r"[\s\S]*?(?=\n"
        + re.escape("  it('" + next_title + "',")
        + r")",
        re.M,
    )
    updated, count = pattern.subn(replacement.rstrip() + '\n', text, count=1)
    if count != 1:
        raise SystemExit(f'test {title!r}: expected 1 match, got {count}')
    return updated


editor = EDITOR.read_text()

# External loads/setContent may publish the complete snapshot to C1 consumers, but
# they must not echo back through the legacy HTML onChange callback as a user edit.
editor = replace_once(
    editor,
    """    const onChangeRef = useRef(onChange);\n    const onSnapshotChangeRef = useRef(onSnapshotChange);\n    onChangeRef.current = onChange;\n""",
    """    const onChangeRef = useRef(onChange);\n    const onSnapshotChangeRef = useRef(onSnapshotChange);\n    const suppressNextOnChangeRef = useRef(false);\n    onChangeRef.current = onChange;\n""",
    'onChange suppression ref',
)

editor = replace_once(
    editor,
    """          onSnapshotChange: (snapshot) => {\n            lastValueRef.current = snapshot.content;\n            isInternalUpdate.current = true;\n            onSnapshotChangeRef.current?.(snapshot);\n            onChangeRef.current?.(snapshot.content);\n          },\n""",
    """          onSnapshotChange: (snapshot) => {\n            const contentChanged = snapshot.content !== lastValueRef.current;\n            const suppressOnChange = suppressNextOnChangeRef.current;\n            suppressNextOnChangeRef.current = false;\n            lastValueRef.current = snapshot.content;\n            onSnapshotChangeRef.current?.(snapshot);\n            if (contentChanged && !suppressOnChange) {\n              isInternalUpdate.current = true;\n              onChangeRef.current?.(snapshot.content);\n            }\n          },\n""",
    'snapshot callback content filtering',
)

editor = replace_once(
    editor,
    """        if (!controlledEcho && currentContent !== canonicalValue) {\n          session.replaceExternalState({\n""",
    """        if (!controlledEcho && currentContent !== canonicalValue) {\n          suppressNextOnChangeRef.current = true;\n          session.replaceExternalState({\n""",
    'controlled external load suppression',
)

editor = replace_once(
    editor,
    """          if (session) {\n            session.replaceExternalState({\n              internalHtml: canonical,\n              selection: null,\n              resetHistory: true,\n              acknowledged: true,\n            });\n          }\n""",
    """          if (session) {\n            suppressNextOnChangeRef.current = true;\n            session.replaceExternalState({\n              internalHtml: canonical,\n              selection: null,\n              resetHistory: true,\n              acknowledged: true,\n            });\n          }\n""",
    'imperative setContent suppression',
)

# The first review script has already made layout changes canonical. Avoid no-op
# history entries and make undo/redo restore the complete layout snapshot too.
editor = replace_once(
    editor,
    """        if (session) {\n          const state = session.getState();\n          session.dispatch({\n            sessionKey: state.sessionKey,\n            baseRevision: state.revision,\n            intent: {\n              kind: 'layout',\n              origin: 'programmatic',\n              history: 'separate',\n              affectsLayout: true,\n            },\n            selection: state.selection,\n            apply: () => ({\n              status: 'applied',\n              internalHtml: state.internalHtml,\n              selection: state.selection,\n              metadata: normalized,\n              contentJson: {\n                ...state.contentJson,\n                editorLayout: normalized,\n              },\n            }),\n          });\n        }\n""",
    """        if (session) {\n          const state = session.getState();\n          if (JSON.stringify(state.metadata) !== JSON.stringify(normalized)) {\n            session.dispatch({\n              sessionKey: state.sessionKey,\n              baseRevision: state.revision,\n              intent: {\n                kind: 'layout',\n                origin: 'programmatic',\n                history: 'separate',\n                affectsLayout: true,\n              },\n              selection: state.selection,\n              apply: () => ({\n                status: 'applied',\n                internalHtml: state.internalHtml,\n                selection: state.selection,\n                metadata: normalized,\n                contentJson: {\n                  ...state.contentJson,\n                  editorLayout: normalized,\n                },\n              }),\n            });\n          }\n        }\n""",
    'layout no-op history guard',
)

editor = replace_once(
    editor,
    """        if (result.status !== 'applied') return;\n        pendingFlowSelectionRef.current = result.selection;\n        const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);\n        pagesRef.current = nextPages;\n        setPages(nextPages);\n        scheduleReflow(nextPages, false);\n      },\n      [effectivePreviewMode, parsePages, scheduleReflow],\n""",
    """        if (result.status !== 'applied') return;\n        const restoredState = session.getState();\n        const restoredLayout = normalizeA4DocumentLayout(restoredState.metadata);\n        if (JSON.stringify(restoredLayout) !== JSON.stringify(effectiveLayout)) {\n          if (layout === undefined) setInternalLayout(restoredLayout);\n          onLayoutChange?.(restoredLayout);\n        }\n        pendingFlowSelectionRef.current = result.selection;\n        const nextPages = parsePages(restoredState.internalHtml, pagesRef.current);\n        pagesRef.current = nextPages;\n        setPages(nextPages);\n        scheduleReflow(nextPages, false);\n      },\n      [\n        effectiveLayout,\n        effectivePreviewMode,\n        layout,\n        onLayoutChange,\n        parsePages,\n        scheduleReflow,\n      ],\n""",
    'complete history layout restore',
)

# The first review script removed the stale-page hydration. Finish that migration:
# if the rendered bookmark cannot be trusted, block native mutation and repair from
# canonical state rather than leaving rogue DOM on screen.
editor = replace_once(
    editor,
    """          const session = canonicalSessionRef.current;\n          const bookmark = captureFlowSelection(surface);\n          if (!session || !bookmark) return;\n          const target = session.resolveNativeInputTarget({\n            renderedRevision: session.getRenderedProjection().documentRevision,\n            origin: 'keyboard',\n            renderedSelection: bookmark,\n          });\n          if (!target.ok || !target.selection) return;\n          commitUserTransaction(\n            applyLogicalDelete(\n              session.getState().internalHtml,\n              target.selection,\n              'backward',\n            ),\n            'delete-backward',\n          );\n""",
    """          const session = canonicalSessionRef.current;\n          const bookmark = captureFlowSelection(surface);\n          if (!session || !bookmark) {\n            if (session) {\n              const nextPages = parsePages(\n                session.getState().internalHtml,\n                pagesRef.current,\n              );\n              pagesRef.current = nextPages;\n              setPages(nextPages);\n              setSurfaceRepairGeneration((generation) => generation + 1);\n            }\n            return;\n          }\n          const target = session.resolveNativeInputTarget({\n            renderedRevision: session.getRenderedProjection().documentRevision,\n            origin: 'keyboard',\n            renderedSelection: bookmark,\n          });\n          if (!target.ok || !target.selection) {\n            const nextPages = parsePages(\n              session.getState().internalHtml,\n              pagesRef.current,\n            );\n            pagesRef.current = nextPages;\n            setPages(nextPages);\n            setSurfaceRepairGeneration((generation) => generation + 1);\n            return;\n          }\n          commitUserTransaction(\n            applyLogicalDelete(\n              session.getState().internalHtml,\n              target.selection,\n              'backward',\n            ),\n            'delete-backward',\n          );\n""",
    'stale Backspace repair',
)

# Forward Delete at a physical edge is also a compatibility adapter; use session
# authority rather than a PageData projection.
editor = replace_once(
    editor,
    """          const bookmark = captureFlowSelection(surface);\n          if (bookmark) {\n            event.preventDefault();\n            commitUserTransaction(\n              applyLogicalDelete(\n                canonicalPagesHtml(pagesRef.current),\n                bookmark,\n                'forward',\n              ),\n              'delete-forward',\n            );\n            return;\n          }\n""",
    """          const session = canonicalSessionRef.current;\n          const bookmark = captureFlowSelection(surface);\n          if (session && bookmark) {\n            event.preventDefault();\n            const target = session.resolveNativeInputTarget({\n              renderedRevision: session.getRenderedProjection().documentRevision,\n              origin: 'keyboard',\n              renderedSelection: bookmark,\n            });\n            if (!target.ok || !target.selection) {\n              const nextPages = parsePages(\n                session.getState().internalHtml,\n                pagesRef.current,\n              );\n              pagesRef.current = nextPages;\n              setPages(nextPages);\n              setSurfaceRepairGeneration((generation) => generation + 1);\n              return;\n            }\n            commitUserTransaction(\n              applyLogicalDelete(\n                session.getState().internalHtml,\n                target.selection,\n                'forward',\n              ),\n              'delete-forward',\n            );\n            return;\n          }\n""",
    'canonical forward Delete edge',
)

editor = replace_once(
    editor,
    """        syncActivePage,\n      ],\n    );\n\n    const handleBeforeInput = useCallback(\n""",
    """        syncActivePage,\n        parsePages,\n      ],\n    );\n\n    const handleBeforeInput = useCallback(\n""",
    'handleKeyDown parsePages dependency',
)

# A non-cancelable mutation whose caret is outside flow nodes must be remembered
# as repair-only. This preserves canonical state and gives the projection a safe
# focus target after rogue browser DOM is discarded.
editor = replace_once(
    editor,
    """        const rendered = captureFlowSelection(surface);\n        if (!rendered) {\n          if (inputEvent.cancelable) inputEvent.preventDefault();\n          return;\n        }\n""",
    """        const rendered = captureFlowSelection(surface);\n        if (!rendered) {\n          if (inputEvent.cancelable) {\n            inputEvent.preventDefault();\n            return;\n          }\n          const state = session.getState();\n          pendingNonCancelableMutationRef.current = {\n            pages: pagesRef.current,\n            canonical: state.internalHtml,\n            bookmark: null,\n            collapsePoint: null,\n            targetPageId:\n              pageContentFromTarget(\n                surface,\n                window.getSelection()?.focusNode ?? null,\n              )?.dataset.pageId ?? activePageIdRef.current ?? null,\n            inputType: inputEvent.inputType,\n            data: inputEvent.data,\n            repairOnly: true,\n          };\n          return;\n        }\n""",
    'non-cancelable out-of-flow capture',
)

editor = replace_once(
    editor,
    """        if (pending.repairOnly || !pending.bookmark) {\n          setSurfaceRepairGeneration((generation) => generation + 1);\n          const nextPages = parsePages(session.getState().internalHtml, pagesRef.current);\n          pagesRef.current = nextPages;\n          setPages(nextPages);\n          return true;\n        }\n""",
    """        if (pending.repairOnly || !pending.bookmark) {\n          const nextPages = parsePages(\n            session.getState().internalHtml,\n            pagesRef.current,\n          );\n          const focusPageId = pending.targetPageId ?? nextPages[0]?.id ?? null;\n          if (focusPageId) pendingFocusStartPageId.current = focusPageId;\n          pagesRef.current = nextPages;\n          setPages(nextPages);\n          setSurfaceRepairGeneration((generation) => generation + 1);\n          return true;\n        }\n""",
    'repair-only focus recovery',
)

editor = replace_once(
    editor,
    """        const inputEvent = event.nativeEvent as InputEvent;\n        const session = canonicalSessionRef.current;\n        if (inputEvent.isComposing) {\n          session?.updateCompositionDom(event.currentTarget.innerHTML);\n          return;\n        }\n        if (\n          repairPendingNonCancelableMutation({\n            inputType: inputEvent.inputType,\n            data: inputEvent.data,\n          })\n        ) {\n          return;\n        }\n""",
    """        const inputEvent = event.nativeEvent as InputEvent;\n        const session = canonicalSessionRef.current;\n        if (\n          repairPendingNonCancelableMutation({\n            inputType: inputEvent.inputType,\n            data: inputEvent.data,\n          })\n        ) {\n          return;\n        }\n        if (inputEvent.isComposing) {\n          session?.updateCompositionDom(event.currentTarget.innerHTML);\n          return;\n        }\n""",
    'non-cancelable repair ordering',
)

EDITOR.write_text(editor)

# ---------------------------------------------------------------------------
# Migrate legacy tests that used direct DOM mutation as a persistence API.
# The replacement tests exercise either the canonical beforeinput path or an
# explicit fail-closed stale-projection repair.
# ---------------------------------------------------------------------------
tests = TESTS.read_text()

tests = replace_test(
    tests,
    'preserves live page content when backspacing from a later page',
    'treats leading empty blocks as page start when backspacing from a later page',
    """  it('rejects stale page DOM when backspacing from a later page', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>First page</p>${hardPageBreak}<p>Original second page</p>`}
        onChange={onChange}
      />,
    );

    const canonicalBefore = editorRef.current?.getContent();
    const secondPage = screen.getByTestId('a4-page-content-2');
    act(() => {
      secondPage.focus();
      secondPage.innerHTML = '<p>Unsaved live second page</p>';
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(secondPage);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await act(async () => {
      fireEvent.keyDown(secondPage, { key: 'Backspace' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(editorRef.current?.getContent()).toBe(canonicalBefore);
      expect(screen.getByTestId('a4-page-content-2')).toHaveTextContent(
        'Original second page',
      );
      expect(screen.getByTestId('a4-document-surface').textContent).not.toContain(
        'Unsaved live second page',
      );
    });
    expect(onChange).not.toHaveBeenCalled();
  });""",
)

tests = replace_test(
    tests,
    'keeps the caret in place after typing inside the editor',
    'renders list markers and indentation inside editor pages',
    """  it('keeps the canonical caret after beforeinput typing', async () => {
    render(<A4PageEditor value="<p>First line</p><p>Second line</p>" />);

    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => expect(surface).toHaveAttribute('aria-busy', 'false'));
    const editor = screen.getByTestId('a4-page-content-1');
    const secondText = editor.querySelectorAll('p')[1]?.firstChild;
    expect(secondText).toBeTruthy();

    act(() => {
      surface.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(secondText!, 6);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    surface.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: ' typed',
        inputType: 'insertText',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent(
        'Second typed line',
      );
      const selection = window.getSelection();
      expect(selection?.anchorNode?.textContent).toBe('Second typed line');
      expect(selection?.anchorOffset).toBe(12);
    });
  });""",
)

tests = replace_test(
    tests,
    'supports Ctrl+Z and Ctrl+Y for editor changes',
    'treats legacy page-break comments as soft layout hints',
    """  it('supports Ctrl+Z and Ctrl+Y for canonical beforeinput changes', async () => {
    render(<A4PageEditor value="<p>Start</p>" />);

    const surface = screen.getByTestId('a4-document-surface');
    await waitFor(() => expect(surface).toHaveAttribute('aria-busy', 'false'));
    const editor = screen.getByTestId('a4-page-content-1');
    const textNode = editor.querySelector('p')?.firstChild;
    expect(textNode).toBeTruthy();

    act(() => {
      surface.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(textNode!, 5);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    surface.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        data: ' typed',
        inputType: 'insertText',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('a4-page-content-1').textContent).toBe(
        'Start typed',
      );
    });

    fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('a4-page-content-1').textContent).toBe('Start');
    });

    fireEvent.keyDown(screen.getByTestId('a4-document-surface'), {
      key: 'y',
      ctrlKey: true,
    });
    await waitFor(() => {
      expect(screen.getByTestId('a4-page-content-1').textContent).toBe(
        'Start typed',
      );
    });
  });""",
)

tests = replace_test(
    tests,
    'preserves a reversed non-collapsed selection through reflow',
    'applies formatting to the logical selection after a controlled layout rerender',
    """  it('preserves a reversed non-collapsed selection through canonical formatting reflow', async () => {
    const onChange = vi.fn();
    render(
      <A4PageEditor
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstText = firstPage.querySelector('p')!.firstChild!;
    const secondText = secondPage.querySelector('p')!.firstChild!;

    act(() => {
      surface.focus();
      window.getSelection()!.setBaseAndExtent(secondText, 2, firstText, 2);
    });
    fireEvent.change(screen.getByTitle('Text Color'), {
      target: { value: '#ff0000' },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('color'));
      const selection = window.getSelection()!;
      expect(selection.isCollapsed).toBe(false);
      expect(selection.anchorNode?.textContent).toBe('Beta');
      expect(selection.anchorOffset).toBe(2);
      expect(selection.focusNode?.textContent).toBe('Alpha');
      expect(selection.focusOffset).toBe(2);
    });
  });""",
)

tests = replace_test(
    tests,
    'repairs a non-cancelable cross-page composition as one canonical transaction',
    'repairs non-cancelable boundary input without changing canonical history',
    """  it('reconciles a cross-page composition once at compositionend', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>Alpha</p>${hardPageBreak}<p>Beta</p>`}
        onChange={onChange}
      />,
    );
    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstText = firstPage.querySelector('p')!.firstChild!;
    const secondText = secondPage.querySelector('p')!.firstChild!;

    act(() => {
      surface.focus();
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(firstText, 2);
      range.setEnd(secondText, 2);
      selection.removeAllRanges();
      selection.addRange(range);
      fireEvent.compositionStart(surface, { data: '' });
    });

    surface.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: false,
        data: '文',
        inputType: 'insertCompositionText',
        isComposing: true,
      }),
    );
    firstPage.parentElement!.insertBefore(
      document.createTextNode('ROGUE_IME_TEXT'),
      firstPage,
    );
    fireEvent.input(surface, {
      data: '文',
      inputType: 'insertCompositionText',
      isComposing: true,
    });

    expect(
      new DOMParser()
        .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
        .body.textContent,
    ).toBe('AlphaBeta');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(surface, { data: '文' });

    await waitFor(() => {
      const canonical = editorRef.current?.getContent() ?? '';
      const text = new DOMParser()
        .parseFromString(canonical, 'text/html')
        .body.textContent ?? '';
      expect(text).toBe('Al文ta');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('a4-document-surface').textContent).not.toContain(
        'ROGUE_IME_TEXT',
      );
    });

    fireEvent.keyDown(screen.getByTestId('a4-document-surface'), {
      key: 'z',
      ctrlKey: true,
    });
    await waitFor(() => {
      const text = new DOMParser()
        .parseFromString(editorRef.current?.getContent() ?? '', 'text/html')
        .body.textContent ?? '';
      expect(text).toBe('AlphaBeta');
    });
  });""",
)

# Preserve the boundary-repair history test, but create its prior edit through the
# C1 canonical typing path rather than through a stale DOM persistence write.
tests = replace_once(
    tests,
    """    const initialFirstPage = screen.getByTestId('a4-page-content-1');\n    initialFirstPage.innerHTML = '<p>Alpha edited</p>';\n    fireEvent.input(screen.getByTestId('a4-document-surface'));\n    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));\n    onChange.mockClear();\n\n    const surface = screen.getByTestId('a4-document-surface');\n""",
    """    const surface = screen.getByTestId('a4-document-surface');\n    const initialFirstPage = screen.getByTestId('a4-page-content-1');\n    const alphaText = initialFirstPage.querySelector('p')!.firstChild!;\n    act(() => {\n      surface.focus();\n      const selection = window.getSelection()!;\n      const range = document.createRange();\n      range.setStart(alphaText, 5);\n      range.collapse(true);\n      selection.removeAllRanges();\n      selection.addRange(range);\n    });\n    surface.dispatchEvent(\n      new InputEvent('beforeinput', {\n        bubbles: true,\n        cancelable: true,\n        data: ' edited',\n        inputType: 'insertText',\n      }),\n    );\n    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));\n    onChange.mockClear();\n\n""",
    'boundary history setup migration',
)

TESTS.write_text(tests)

# The first review script promotes the three C0 browser proofs from expected-fail
# to required-pass. Add explicit identity only to the A->B history proof.
browser = BROWSER.read_text()
marker = "  it('does not carry undo history from document A into document B',"
start = browser.find(marker)
if start < 0:
    raise SystemExit('document switch browser proof not found')
prefix = browser[:start]
block = browser[start:]
legacy_render = "        <A4PageEditor ref={editorRef} value={parentValue} onChange={onChange} />," 
if block.count(legacy_render) != 2:
    raise SystemExit(
        f'document switch renders: expected 2 legacy renders, got {block.count(legacy_render)}'
    )
render_a = """        <A4PageEditor
          ref={editorRef}
          sessionKey="document:A"
          value={parentValue}
          onChange={onChange}
        />,"""
render_b = """        <A4PageEditor
          ref={editorRef}
          sessionKey="document:B"
          value={parentValue}
          onChange={onChange}
        />,"""
block = block.replace(legacy_render, render_a, 1)
block = block.replace(legacy_render, render_b, 1)
BROWSER.write_text(prefix + block)

print('C1 bounded repair, legacy test migration, and document identity fixes applied')
