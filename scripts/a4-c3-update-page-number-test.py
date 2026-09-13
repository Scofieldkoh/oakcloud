from pathlib import Path

# Temporary branch-only helper. Remove before the C3 PR is finalized.
path = Path('__tests__/components/a4-page-editor.test.tsx')
text = path.read_text()
old = """    render(\n      <A4PageEditor value={`<p>First</p>${hardPageBreak}<p>Second</p>`} />,\n    );\n\n    expect(screen.getByTestId('a4-page-number-1')).toBeInTheDocument();"""
new = """    render(\n      <A4PageEditor\n        value={`<p>First</p>${hardPageBreak}<p>Second</p>`}\n        pageNumbersSupported\n      />,\n    );\n\n    expect(screen.getByTestId('a4-page-number-1')).toBeInTheDocument();"""
if old in text:
    text = text.replace(old, new, 1)
elif 'pageNumbersSupported' not in text:
    raise SystemExit('missing page-number test anchor')

text = text.replace(
    "it('keeps a hard blank page after the first Add Page click'",
    "it('keeps a hard blank page after the first Add blank page click'",
    1,
)
text = text.replace(
    "screen.getByRole('button', { name: 'Add Page' })",
    "screen.getByRole('button', { name: 'Add blank page' })",
    1,
)
path.write_text(text)
