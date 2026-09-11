from pathlib import Path
import re

editor_path = Path('src/components/documents/a4-page-editor.tsx')
s = editor_path.read_text()

old = """              if (
                session &&
                projectionRevision &&
                !session.publishProjection(projectionRevision)
              ) {
                return;
              }
"""
new = """              if (session && canonicalSessionRef.current !== session) {
                return;
              }
              if (
                session &&
                projectionRevision &&
                !session.publishProjection(projectionRevision)
              ) {
                return;
              }
"""
if s.count(old) != 1:
    raise SystemExit(f'projection publication guard: expected 1 match, got {s.count(old)}')
s = s.replace(old, new, 1)
editor_path.write_text(s)

# C0 contained two regression tests that deliberately asserted the stale physical
# surface could replace canonical authority. C1 reverses that invariant: an
# unqualified native input repairs from the canonical session and emits no
# persistence change. Keep the coverage but reverse the expected behavior.
test_path = Path('__tests__/components/a4-page-editor.test.tsx')
t = test_path.read_text()
pattern = re.compile(
    r"  it\('commits page fragments in rendered DOM order',[\s\S]*?\n  \}\);\n\n  it\('retains filtered pages while committing visible fragments in DOM order',[\s\S]*?\n  \}\);",
    re.M,
)
replacement = """  it('rejects unqualified whole-surface DOM reconstruction as canonical authority', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}
        onChange={onChange}
      />,
    );

    const surface = screen.getByTestId('a4-document-surface');
    const firstPage = screen.getByTestId('a4-page-content-1');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const firstWrapper = firstPage.parentElement!.parentElement!;
    const secondWrapper = secondPage.parentElement!.parentElement!;
    const canonicalBefore = editorRef.current?.getContent();

    surface.insertBefore(secondWrapper, firstWrapper);
    secondPage.innerHTML = '<p>STALE SECOND PAGE</p>';
    fireEvent.input(surface);

    await waitFor(() => {
      expect(editorRef.current?.getContent()).toBe(canonicalBefore);
      expect(screen.getByTestId('a4-page-content-1')).toHaveTextContent('First page');
      expect(screen.getByTestId('a4-page-content-2')).toHaveTextContent('Second page');
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves hidden/later canonical content when a rendered fragment is stale', async () => {
    const editorRef = createRef<A4PageEditorRef>();
    const onChange = vi.fn();
    render(
      <A4PageEditor
        ref={editorRef}
        value={
          `<p>First visible</p>${hardPageBreak}` +
          `<p>[Remove Page]</p>${hardPageBreak}` +
          '<p>Second visible</p>'
        }
        onChange={onChange}
      />,
    );

    const surface = screen.getByTestId('a4-document-surface');
    const secondPage = screen.getByTestId('a4-page-content-2');
    const canonicalBefore = editorRef.current?.getContent();
    expect(canonicalBefore).toContain('[Remove Page]');

    secondPage.innerHTML = '<p>STALE VISIBLE FRAGMENT</p>';
    fireEvent.input(surface);

    await waitFor(() => {
      expect(editorRef.current?.getContent()).toBe(canonicalBefore);
      expect(editorRef.current?.getContent()).toContain('[Remove Page]');
      expect(screen.getByTestId('a4-page-content-2')).toHaveTextContent('Second visible');
    });
    expect(onChange).not.toHaveBeenCalled();
  });"""
t, n = pattern.subn(replacement, t, count=1)
if n != 1:
    raise SystemExit(f'legacy whole-surface tests: expected 1 pair, got {n}')
test_path.write_text(t)

print('added active-session guard and reversed stale-surface regression expectations')
