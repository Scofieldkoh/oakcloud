from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'missing interaction anchor: {label}')


# Preserve the familiar Tables label while keeping its actions contextual.
path = Path('src/components/documents/a4-editor-toolbar.tsx')
text = path.read_text()
text = text.replace('label="Table" disabled={disabled}', 'label="Tables" disabled={disabled}', 1)
text = text.replace(
    'label="Insert page break" title="Insert page break"',
    'label="Insert page break" title="Insert Page Break"',
    1,
)
path.write_text(text)

path = Path('__tests__/components/a4-editor-toolbar.test.tsx')
text = path.read_text().replace(
    "screen.getByRole('button', { name: 'Table' })",
    "screen.getByRole('button', { name: 'Tables' })",
)
path.write_text(text)

path = Path('__tests__/components/a4-page-editor.test.tsx')
text = path.read_text()

page_break_old = """    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Insert Page Break'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });"""
page_break_new = """    await act(async () => {
      const pageBreakButton = screen.getByRole('button', {
        name: 'Insert page break',
      });
      fireEvent.pointerDown(pageBreakButton, { button: 0, isPrimary: true });
      fireEvent.click(pageBreakButton, { button: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });"""
text = replace_once(text, page_break_old, page_break_new, 'page break activation')

color_first_old = """    fireEvent.change(screen.getByTitle('Text Color'), {
      target: { value: '#ff0000' },
    });"""
color_first_new = """    const textOptions = screen.getByRole('button', { name: 'Text options' });
    fireEvent.pointerDown(textOptions, { button: 0, isPrimary: true });
    fireEvent.click(textOptions, { button: 0 });
    fireEvent.pointerDown(screen.getByTitle('Text Color'), {
      button: 0,
      isPrimary: true,
    });
    fireEvent.change(screen.getByTitle('Text Color'), {
      target: { value: '#ff0000' },
    });"""
text = replace_once(text, color_first_old, color_first_new, 'selected text color menu')

font_old = """    expect(screen.getByLabelText('Font size')).toHaveValue('24pt');"""
font_new = """    const textOptions = screen.getByRole('button', { name: 'Text options' });
    fireEvent.pointerDown(textOptions, { button: 0, isPrimary: true });
    fireEvent.click(textOptions, { button: 0 });
    expect(screen.getByLabelText('Font size')).toHaveValue('24pt');"""
text = replace_once(text, font_old, font_new, 'font size menu')

table_open_old = """    fireEvent.click(screen.getByRole('button', { name: 'Tables' }));
    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Insert Table'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });"""
table_open_new = """    const tablesMenu = screen.getByRole('button', { name: 'Tables' });
    fireEvent.pointerDown(tablesMenu, { button: 0, isPrimary: true });
    fireEvent.click(tablesMenu, { button: 0 });
    await act(async () => {
      const insertTable = screen.getByTitle('Insert Table');
      fireEvent.pointerDown(insertTable, { button: 0, isPrimary: true });
      fireEvent.click(insertTable, { button: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });"""
text = replace_once(text, table_open_old, table_open_new, 'insert table activation')

table_mutate_old = """    fireEvent.click(screen.getByRole('button', { name: 'Tables' }));
    await act(async () => {
      fireEvent.mouseDown(screen.getByTitle('Add Table Row'));
      fireEvent.mouseDown(screen.getByTitle('Add Table Column'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });"""
table_mutate_new = """    const tablesMenu = screen.getByRole('button', { name: 'Tables' });
    fireEvent.pointerDown(tablesMenu, { button: 0, isPrimary: true });
    fireEvent.click(tablesMenu, { button: 0 });
    await act(async () => {
      const addRow = screen.getByTitle('Add Table Row');
      fireEvent.pointerDown(addRow, { button: 0, isPrimary: true });
      fireEvent.click(addRow, { button: 0 });
      const addColumn = screen.getByTitle('Add Table Column');
      fireEvent.pointerDown(addColumn, { button: 0, isPrimary: true });
      fireEvent.click(addColumn, { button: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });"""
text = replace_once(text, table_mutate_old, table_mutate_new, 'table row/column activation')

reversed_old = """    fireEvent.change(screen.getByTitle('Text Color'), {
      target: { value: '#ff0000' },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('color'));"""
reversed_new = """    const textOptions = screen.getByRole('button', { name: 'Text options' });
    fireEvent.pointerDown(textOptions, { button: 0, isPrimary: true });
    fireEvent.click(textOptions, { button: 0 });
    fireEvent.pointerDown(screen.getByTitle('Text Color'), {
      button: 0,
      isPrimary: true,
    });
    fireEvent.change(screen.getByTitle('Text Color'), {
      target: { value: '#ff0000' },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('color'));"""
text = replace_once(text, reversed_old, reversed_new, 'reversed selection color menu')

rerender_old = """      fireEvent.change(screen.getByLabelText('Text color'), {
        target: { value: '#ff0000' },
      });"""
rerender_new = """      const textOptions = screen.getByRole('button', { name: 'Text options' });
      fireEvent.pointerDown(textOptions, { button: 0, isPrimary: true });
      fireEvent.click(textOptions, { button: 0 });
      fireEvent.pointerDown(screen.getByLabelText('Text color'), {
        button: 0,
        isPrimary: true,
      });
      fireEvent.change(screen.getByLabelText('Text color'), {
        target: { value: '#ff0000' },
      });"""
text = replace_once(text, rerender_old, rerender_new, 'controlled rerender color menu')

path.write_text(text)
