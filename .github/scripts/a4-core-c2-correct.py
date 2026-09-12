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

# C2 no longer needs the physical-selection ordering helper or the old no-op
# history shim once every native structural path is routed through C1 + S1.
editor = replace_between(
    editor,
    'function selectionStartPoint(',
    'function replaceTypedPageBreaks',
    '',
    'remove obsolete physical selection helper',
)
editor = replace_once(
    editor,
    '    const pushHistorySnapshot = useCallback((_pageList: PageData[]) => undefined, []);\n\n',
    '',
    'remove obsolete history shim',
)

page_start_helper = '''function projectedPageStartBookmark(
  pageContent: HTMLElement,
): FlowSelectionBookmark | null {
  const candidates = Array.from(
    pageContent.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).filter((element) => !element.matches('[data-a4-break="page"]'));
  const element =
    candidates.find((candidate) => !candidate.querySelector('[data-flow-id]')) ??
    candidates[0] ??
    null;
  const flowId = element?.dataset.flowId;
  if (!flowId) return null;
  const point = { flowId, offset: 0 };
  return { anchor: point, focus: point, collapsed: true };
}

'''
editor = replace_once(
    editor,
    'function getEditorSelectionRange(editor: HTMLElement): Range | null {',
    page_start_helper + 'function getEditorSelectionRange(editor: HTMLElement): Range | null {',
    'projected hard-page start adapter',
)

old_target = '''          const target = session.resolveNativeInputTarget({
            renderedRevision: session.getRenderedProjection().documentRevision,
            origin: 'keyboard',
            renderedSelection: bookmark,
          });
          if (!target.ok || !target.selection) {
'''
new_target = '''          const page = pagesRef.current.find(
            (candidate) => candidate.id === pageContent.dataset.pageId,
          );
          const semanticBookmark = page?.hardBreakBefore
            ? projectedPageStartBookmark(pageContent) ?? bookmark
            : bookmark;
          const target = session.resolveNativeInputTarget({
            renderedRevision: session.getRenderedProjection().documentRevision,
            origin: 'keyboard',
            renderedSelection: semanticBookmark,
          });
          if (!target.ok || !target.selection) {
'''
# This shape occurs only in the Backspace-at-rendered-page-start branch of the
# C2 keydown block after the first deterministic patch.
editor = replace_once(
    editor,
    old_target,
    new_target,
    'hard page start semantic selection',
)

editor_path.write_text(editor, encoding='utf-8')

component_path = Path('__tests__/components/a4-page-editor.test.tsx')
component = component_path.read_text(encoding='utf-8')
start = "  it('splits the current page when inserting a page break', async () => {"
end = "  it('selects all document pages with Ctrl+A', () => {"
replacement = '''  it('stores a semantic page break without treating physical pages as canonical state', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value="<p>First</p>"
        onChange={onChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('a4-document-surface')).toHaveAttribute(
        'aria-busy',
        'false',
      );
    });

    const firstPage = screen.getByTestId('a4-page-content-1');
    act(() => {
      firstPage.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(firstPage);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Insert Page Break'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const canonical = editorRef.current?.getContent() ?? '';
      expect(canonical).toContain('data-a4-break="page"');
      expect(canonical).not.toContain('data-break-type="hard"');
      expect(canonical).not.toContain('class="page-break"');
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining('data-a4-break="page"'),
      );
    });
    expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent('First');
  });

'''
component = replace_between(
    component,
    start,
    end,
    replacement,
    'semantic page break component assertion',
)
component_path.write_text(component, encoding='utf-8')
