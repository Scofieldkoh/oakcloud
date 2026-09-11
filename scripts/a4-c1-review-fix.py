from pathlib import Path

editor_path = Path('src/components/documents/a4-page-editor.tsx')
editor = editor_path.read_text()

old_layout = """    const updateLayout = useCallback(
      (next: A4DocumentLayout) => {
        const normalized = normalizeA4DocumentLayout(next);
        if (layout === undefined) setInternalLayout(normalized);
        onLayoutChange?.(normalized);
      },
      [layout, onLayoutChange],
    );
"""
new_layout = """    const updateLayout = useCallback(
      (next: A4DocumentLayout) => {
        const normalized = normalizeA4DocumentLayout(next);
        const session = canonicalSessionRef.current;
        if (session) {
          const state = session.getState();
          session.dispatch({
            sessionKey: state.sessionKey,
            baseRevision: state.revision,
            intent: {
              kind: 'layout',
              origin: 'programmatic',
              history: 'separate',
              affectsLayout: true,
            },
            selection: state.selection,
            apply: () => ({
              status: 'applied',
              internalHtml: state.internalHtml,
              selection: state.selection,
              metadata: normalized,
              contentJson: {
                ...state.contentJson,
                editorLayout: normalized,
              },
            }),
          });
        }
        if (layout === undefined) setInternalLayout(normalized);
        onLayoutChange?.(normalized);
      },
      [layout, onLayoutChange],
    );
"""
if editor.count(old_layout) != 1:
    raise SystemExit('updateLayout shape changed')
editor = editor.replace(old_layout, new_layout, 1)

old_backspace = """        if (
          surface &&
          event.key === 'Backspace' &&
          pageContent &&
          isCaretAtEditorStart(pageContent)
        ) {
          event.preventDefault();
          const currentPages = pagesRef.current;
          const pageIndex = currentPages.findIndex(
            (page) => page.id === pageContent.dataset.pageId,
          );
          let sourcePages = currentPages;
          if (pageIndex >= 0) {
            const liveContent = sanitizeHtml(pageContent.innerHTML);
            if (currentPages[pageIndex].content !== liveContent) {
              const hydrated = document.createElement('div');
              hydrated.innerHTML = liveContent;
              hydrateFlowContainer(hydrated);
              pageContent.innerHTML = hydrated.innerHTML;
              sourcePages = currentPages.map((page, index) =>
                index === pageIndex
                  ? { ...page, content: sanitizeHtml(hydrated.innerHTML) }
                  : page,
              );
              pagesRef.current = sourcePages;
            }
          }
          const bookmark = captureFlowSelection(surface);
          if (!bookmark) return;
          commitUserTransaction(
            applyLogicalDelete(
              canonicalPagesHtml(sourcePages),
              bookmark,
              'backward',
            ),
          );
        }
"""
new_backspace = """        if (
          surface &&
          event.key === 'Backspace' &&
          pageContent &&
          isCaretAtEditorStart(pageContent)
        ) {
          event.preventDefault();
          const session = canonicalSessionRef.current;
          const bookmark = captureFlowSelection(surface);
          if (!session || !bookmark) return;
          const target = session.resolveNativeInputTarget({
            renderedRevision: session.getRenderedProjection().documentRevision,
            origin: 'keyboard',
            renderedSelection: bookmark,
          });
          if (!target.ok || !target.selection) return;
          commitUserTransaction(
            applyLogicalDelete(
              session.getState().internalHtml,
              target.selection,
              'backward',
            ),
            'delete-backward',
          );
        }
"""
if editor.count(old_backspace) != 1:
    raise SystemExit('Backspace edge shape changed')
editor = editor.replace(old_backspace, new_backspace, 1)

# Classify the explicit forward-delete edge as a delete transaction too.
old_forward = """            commitUserTransaction(
              applyLogicalDelete(
                canonicalPagesHtml(pagesRef.current),
                bookmark,
                'forward',
              ),
            );
"""
new_forward = """            commitUserTransaction(
              applyLogicalDelete(
                canonicalPagesHtml(pagesRef.current),
                bookmark,
                'forward',
              ),
              'delete-forward',
            );
"""
if editor.count(old_forward) != 1:
    raise SystemExit('forward delete edge shape changed')
editor = editor.replace(old_forward, new_forward, 1)
editor_path.write_text(editor)

browser_path = Path('__tests__/browser/a4-input-sequences.browser.test.tsx')
browser = browser_path.read_text()
if browser.count('it.fails(') != 3:
    raise SystemExit('expected three C0 expected-failure browser proofs')
browser = browser.replace('it.fails(', 'it(')
old_a = """        <A4PageEditor ref={editorRef} value={parentValue} onChange={onChange} />,
"""
new_a = """        <A4PageEditor
          ref={editorRef}
          sessionKey="document:A"
          value={parentValue}
          onChange={onChange}
        />,
"""
if browser.count(old_a) != 1:
    raise SystemExit('document A render shape changed')
browser = browser.replace(old_a, new_a, 1)
old_b = """        <A4PageEditor ref={editorRef} value={parentValue} onChange={onChange} />,
"""
new_b = """        <A4PageEditor
          ref={editorRef}
          sessionKey="document:B"
          value={parentValue}
          onChange={onChange}
        />,
"""
if browser.count(old_b) != 1:
    raise SystemExit('document B render shape changed')
browser = browser.replace(old_b, new_b, 1)
browser_path.write_text(browser)

session_test_path = Path('__tests__/components/a4-editor-session.test.ts')
test = session_test_path.read_text()
needle = """  it('does not redirect a stale pointer selection to the pending keyboard caret', () => {
"""
addition = """  it('keeps the pending canonical caret after delete/format until projection publication', () => {
    const session = createSession();
    apply(session, 'format', '<p><strong>Alpha</strong></p><p>Later</p>', 'after-format');
    expect(
      session.resolveNativeInputTarget({
        renderedRevision: 0,
        origin: 'keyboard',
        renderedSelection: 'stale-after-format',
      }),
    ).toMatchObject({ ok: true, baseRevision: 1, selection: 'after-format' });
    apply(session, 'insert-text', '<p><strong>Alpha</strong>X</p><p>Later</p>', 'after-x');
    expect(session.getSnapshot()).toMatchObject({
      ok: true,
      snapshot: { revision: 2, content: expect.stringContaining('<p>Later</p>') },
    });
  });

""" + needle
if test.count(needle) != 1:
    raise SystemExit('session test insertion point changed')
test = test.replace(needle, addition, 1)
session_test_path.write_text(test)

print('C1 review fixes applied')
