from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'missing patch anchor: {label}')


# CORE toolbar: preserve frozen Q1 labels while keeping rare details in menus.
path = Path('src/components/documents/a4-editor-toolbar.tsx')
text = path.read_text()
text = replace_once(
    text,
    "useState<'list' | 'text' | 'tables' | 'page' | null>(null)",
    "useState<'list' | 'text' | 'tables' | null>(null)",
    'toolbar menu state',
)
text = text.replace(
    'label="Page break" title="Page break"',
    'label="Insert page break" title="Insert page break"',
)
indent_anchor = (
    "        <ToolbarButton label=\"Increase indent\" icon={Indent} "
    "onSaveSelection={onSaveSelection} onClick={command({ type: 'indent' })} "
    "disabled={blocked} />\n"
    "        <ToolbarMenu label=\"List options\""
)
indent_replacement = (
    "        <ToolbarButton label=\"Increase indent\" icon={Indent} "
    "onSaveSelection={onSaveSelection} onClick={command({ type: 'indent' })} "
    "disabled={blocked} />\n"
    "        <ToolbarButton label=\"Nested list\" icon={ListTree} "
    "onSaveSelection={onSaveSelection} onClick={command({ type: 'nest-list' })} "
    "disabled={blocked} />\n"
    "        <ToolbarMenu label=\"List options\""
)
text = replace_once(text, indent_anchor, indent_replacement, 'direct nested-list control')
text = text.replace(
    "            <ToolbarButton label=\"Nested list\" icon={ListTree} "
    "onSaveSelection={onSaveSelection} onClick={command({ type: 'nest-list' })} "
    "disabled={blocked} />\n",
    '',
    1,
)
page_pattern = re.compile(
    r'\n      <ToolbarGroup label="Page options">.*?\n      </ToolbarGroup>\n',
    re.S,
)
page_replacement = '''
      <ToolbarGroup label="Page">
        <ToolbarButton label="Add blank page" icon={ListPlus} onSaveSelection={onSaveSelection} onClick={onAddBlankPage} disabled={blocked} />
        <ToolbarButton label="Remove page break" title="Remove the page break before the current page" icon={Unlink} onSaveSelection={onSaveSelection} onClick={onRemovePageBreak} disabled={blocked || !canRemovePageBreak} />
        <ToolbarButton label="Delete current page" icon={Trash2} onSaveSelection={onSaveSelection} onClick={onDeleteCurrentPage} disabled={blocked || !canDeletePage} destructive />
      </ToolbarGroup>
'''
if page_pattern.search(text):
    text = page_pattern.sub(page_replacement, text, count=1)
elif '<ToolbarGroup label="Page">' not in text:
    raise SystemExit('missing patch anchor: direct page controls')
path.write_text(text)

# CORE page editor: accessibility, de-duplication and busy/applicability separation.
path = Path('src/components/documents/a4-page-editor.tsx')
text = path.read_text()
text = replace_once(
    text,
    '  className?: string;\n  tenantId?: string;',
    '  className?: string;\n'
    '  /** Accessible name for the editable document surface. */\n'
    '  ariaLabel?: string;\n'
    '  /** Enable page-number authoring only when persistence/output support is complete. */\n'
    '  pageNumbersSupported?: boolean;\n'
    '  tenantId?: string;',
    'editor accessibility props',
)
text = replace_once(
    text,
    '      className,\n      tenantId: _tenantId,',
    "      className,\n      ariaLabel = 'Document editor',\n"
    '      pageNumbersSupported = false,\n      tenantId: _tenantId,',
    'editor prop destructuring',
)
text = text.replace('  Plus,\n', '', 1)
previous_button = '''            <button
              type="button"
              onClick={() => scrollToPage('up')}
              disabled={currentPageIdx === 0}
              className="p-1.5 rounded text-text-secondary hover:bg-background-tertiary disabled:opacity-50"
            >
              <ChevronUp className="w-4 h-4" />
            </button>'''
previous_replacement = '''            <button
              type="button"
              aria-label="Previous page"
              title="Previous page"
              onClick={() => scrollToPage('up')}
              disabled={currentPageIdx === 0}
              className="p-1.5 rounded text-text-secondary hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
            >
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
            </button>'''
text = replace_once(text, previous_button, previous_replacement, 'previous-page label')
next_button = '''            <button
              type="button"
              onClick={() => scrollToPage('down')}
              disabled={currentPageIdx === displayPages.length - 1}
              className="p-1.5 rounded text-text-secondary hover:bg-background-tertiary disabled:opacity-50"
            >
              <ChevronDown className="w-4 h-4" />
            </button>'''
next_replacement = '''            <button
              type="button"
              aria-label="Next page"
              title="Next page"
              onClick={() => scrollToPage('down')}
              disabled={currentPageIdx === displayPages.length - 1}
              className="p-1.5 rounded text-text-secondary hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
            >
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            </button>'''
text = replace_once(text, next_button, next_replacement, 'next-page label')
top_add_pattern = re.compile(
    r'\n            \{!readOnly && !isPreviewMode && \(\n'
    r'              <button\n                type="button"\n'
    r'                onClick=\{handleAddPage\}.*?\n'
    r'              </button>\n            \)\}\n',
    re.S,
)
if top_add_pattern.search(text):
    text = top_add_pattern.sub('\n', text, count=1)
toolbar_anchor = '''            showPageNumbers={showPageNumbers}
            canDeletePage={hardSectionCount > 1}'''
toolbar_replacement = '''            showPageNumbers={showPageNumbers}
            pageNumbersSupported={pageNumbersSupported}
            canDeletePage={hardSectionCount > 1}'''
text = replace_once(text, toolbar_anchor, toolbar_replacement, 'page-number capability wiring')
text = text.replace('            mutationDisabled={isReflowing}\n', '', 1)
surface_anchor = '''            contentEditable={!effectivePreviewMode}
            suppressContentEditableWarning
            aria-busy={isReflowing}'''
surface_replacement = '''            role="textbox"
            aria-label={ariaLabel}
            aria-multiline="true"
            aria-readonly={effectivePreviewMode}
            tabIndex={0}
            contentEditable={!effectivePreviewMode}
            suppressContentEditableWarning
            aria-busy={isReflowing}'''
text = replace_once(text, surface_anchor, surface_replacement, 'editable textbox semantics')
text = replace_once(
    text,
    "              'flex flex-col items-center gap-8 outline-none',",
    "              'flex flex-col items-center gap-8 outline-none focus-visible:ring-2 "
    "focus-visible:ring-border-focus focus-visible:ring-offset-2',",
    'editor focus ring',
)
bottom_add_pattern = re.compile(
    r'\n          \{!readOnly && !effectivePreviewMode && \(\n'
    r'            <button\n              type="button"\n'
    r'              onClick=\{handleAddPage\}.*?\n'
    r'            </button>\n          \)\}\n',
    re.S,
)
if bottom_add_pattern.search(text):
    text = bottom_add_pattern.sub('\n', text, count=1)
status_pattern = re.compile(
    r'''          <span role="status" aria-live="polite" data-testid="a4-editor-status">\n'''
    r'''            \{isReflowing\n'''
    r'''              \? 'Repaginating…'\n'''
    r'''              : readOnly\n'''
    r'''                \? 'Viewing document'\n'''
    r'''                : effectivePreviewMode\n'''
    r'''                  \? 'Viewing preview'\n'''
    r'''                  : 'Editing'\}\n'''
    r'''          </span>'''
)
status_replacement = '''          <span data-testid="a4-editor-status">
            {readOnly
              ? 'Viewing document'
              : effectivePreviewMode
                ? 'Viewing preview'
                : 'Editing'}
          </span>'''
if status_pattern.search(text):
    text = status_pattern.sub(status_replacement, text, count=1)
elif '<span data-testid="a4-editor-status">' not in text:
    raise SystemExit('missing patch anchor: non-live editor status')
path.write_text(text)

# Browser regression: rare list details moved behind List options; semantics stay unchanged.
path = Path('__tests__/browser/a4-page-editor.browser.test.tsx')
text = path.read_text()
alpha_click = (
    "    await act(async () => {\n"
    "      await userEvent.click(buttonByLabel('Alphabetical list'));\n"
    "    });"
)
alpha_replacement = (
    "    await act(async () => {\n"
    "      await userEvent.click(buttonByLabel('List options'));\n"
    "      await userEvent.click(document.querySelector<HTMLButtonElement>("
    "'button[aria-label=\"Alphabetical list\"]')!);\n"
    "    });"
)
text = replace_once(text, alpha_click, alpha_replacement, 'alphabetical-list menu navigation')
start_anchor = '''    await act(async () => {
      await vi.waitFor(() => {
        expect(
          host.querySelector('[aria-label="List start number"]'),
        ).not.toBeNull();
      });
    });'''
start_replacement = '''    const listOptions = host.querySelector<HTMLButtonElement>(
      'button[aria-label="List options"]',
    );
    if (!listOptions) throw new Error('Expected List options control');
    await act(async () => userEvent.click(listOptions));
    await act(async () => {
      await vi.waitFor(() => {
        expect(
          document.querySelector('[aria-label="List start number"]'),
        ).not.toBeNull();
      });
    });'''
text = replace_once(text, start_anchor, start_replacement, 'list-start menu navigation')
text = text.replace(
    "    const input = host.querySelector<HTMLInputElement>(\n"
    "      '[aria-label=\"List start number\"]',\n"
    "    )!;",
    "    const input = document.querySelector<HTMLInputElement>(\n"
    "      '[aria-label=\"List start number\"]',\n"
    "    )!;",
    1,
)
bold_click = (
    "    await act(async () => {\n"
    "      await userEvent.click(buttonByLabel('Bold list numbers'));\n"
    "    });"
)
bold_replacement = (
    "    await act(async () => {\n"
    "      await userEvent.click(buttonByLabel('List options'));\n"
    "      await userEvent.click(document.querySelector<HTMLButtonElement>("
    "'button[aria-label=\"Bold list numbers\"]')!);\n"
    "    });"
)
text = replace_once(text, bold_click, bold_replacement, 'bold-number menu navigation')
text = text.replace(
    "      await userEvent.click(buttonByLabel('Bold list numbers'));",
    "      await userEvent.click(document.querySelector<HTMLButtonElement>("
    "'button[aria-label=\"Bold list numbers\"]')!);",
    1,
)
path.write_text(text)

# Toolbar component tests: retain Q1 names and direct page controls.
path = Path('__tests__/components/a4-editor-toolbar.test.tsx')
text = path.read_text()
text = text.replace("name: 'Page break'", "name: 'Insert page break'")
text = text.replace(
    "const pageOptions = screen.getByRole('button', { name: 'Page options' });",
    "const deletePage = screen.getByRole('button', { name: 'Delete current page' });",
)
text = text.replace('expect(pageOptions).toHaveFocus();', 'expect(deletePage).toHaveFocus();')
text = text.replace(
    "fireEvent.keyDown(pageOptions, { key: 'Home' });",
    "fireEvent.keyDown(deletePage, { key: 'Home' });",
)
rare_pattern = re.compile(
    r"  it\('keeps rare numbering, font and page-section controls in labelled menus', \(\) => \{.*?\n  \}\);",
    re.S,
)
rare_replacement = '''  it('keeps rare numbering and font controls in labelled menus', () => {
    renderToolbar({ onLegacyCommand: vi.fn() });

    expect(screen.queryByLabelText('Font family')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alphabetical list' })).not.toBeInTheDocument();

    openMenu('List options');
    expect(screen.getByRole('button', { name: 'Alphabetical list' })).toBeVisible();
    expect(screen.getByLabelText('List start number')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Escape' });

    openMenu('Text options');
    expect(screen.getByLabelText('Font family')).toBeVisible();
    expect(screen.getByLabelText('Font size')).toBeVisible();
  });'''
if rare_pattern.search(text):
    text = rare_pattern.sub(rare_replacement, text, count=1)
contextual_pattern = re.compile(
    r"  it\('disables contextual page-section operations when not applicable', \(\) => \{.*?\n  \}\);",
    re.S,
)
contextual_replacement = '''  it('keeps direct page operations labelled and disables them when not applicable', () => {
    renderToolbar({ canDeletePage: false, canRemovePageBreak: false });

    expect(screen.getByRole('button', { name: 'Add blank page' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove page break' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete current page' })).toBeDisabled();
  });'''
if contextual_pattern.search(text):
    text = contextual_pattern.sub(contextual_replacement, text, count=1)
path.write_text(text)
