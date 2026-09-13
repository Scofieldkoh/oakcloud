from pathlib import Path

path = Path('__tests__/components/a4-page-editor.test.tsx')
text = path.read_text()
old = """    render(\n      <A4PageEditor value={`<p>First</p>${hardPageBreak}<p>Second</p>`} />,\n    );\n\n    expect(screen.getByTestId('a4-page-number-1')).toBeInTheDocument();"""
new = """    render(\n      <A4PageEditor\n        value={`<p>First</p>${hardPageBreak}<p>Second</p>`}\n        pageNumbersSupported\n      />,\n    );\n\n    expect(screen.getByTestId('a4-page-number-1')).toBeInTheDocument();"""
if old in text:
    text = text.replace(old, new, 1)
elif 'pageNumbersSupported' not in text:
    raise SystemExit('missing page-number test anchor')
path.write_text(text)
