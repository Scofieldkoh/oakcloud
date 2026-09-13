from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'missing browser-fix anchor: {label}')


# Keep repagination visible without using it as a command lock or noisy live region.
path = Path('src/components/documents/a4-page-editor.tsx')
text = path.read_text()
old_status = '''          <span data-testid="a4-editor-status">
            {readOnly
              ? 'Viewing document'
              : effectivePreviewMode
                ? 'Viewing preview'
                : 'Editing'}
          </span>'''
new_status = '''          <span data-testid="a4-editor-status">
            {isReflowing
              ? 'Repaginating…'
              : readOnly
                ? 'Viewing document'
                : effectivePreviewMode
                  ? 'Viewing preview'
                  : 'Editing'}
          </span>'''
text = replace_once(text, old_status, new_status, 'visual repagination status')
path.write_text(text)

# Real-browser tests must follow the new labelled menus. Use direct element activation
# for controls inside the portalled menu; pointer/click exactly-once semantics are
# covered separately by the dedicated C3 toolbar regressions.
path = Path('__tests__/browser/a4-page-editor.browser.test.tsx')
text = path.read_text()

alpha_old = '''      await userEvent.click(buttonByLabel('List options'));
      await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Alphabetical list"]')!);'''
alpha_new = '''      await userEvent.click(buttonByLabel('List options'));
      const alphabeticalList = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Alphabetical list"]',
      );
      if (!alphabeticalList) throw new Error('Expected Alphabetical list control');
      alphabeticalList.click();'''
text = replace_once(text, alpha_old, alpha_new, 'alphabetical-list portal activation')

bold_old = '''      await userEvent.click(buttonByLabel('List options'));
      await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Bold list numbers"]')!);'''
bold_new = '''      await userEvent.click(buttonByLabel('List options'));
      const boldListNumbers = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Bold list numbers"]',
      );
      if (!boldListNumbers) throw new Error('Expected Bold list numbers control');
      boldListNumbers.click();'''
text = replace_once(text, bold_old, bold_new, 'bold-number portal activation')

bold_second_old = '''      await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Bold list numbers"]')!);'''
bold_second_new = '''      let boldListNumbers = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Bold list numbers"]',
      );
      if (!boldListNumbers) {
        await userEvent.click(buttonByLabel('List options'));
        boldListNumbers = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Bold list numbers"]',
        );
      }
      if (!boldListNumbers) throw new Error('Expected Bold list numbers control');
      boldListNumbers.click();'''
text = replace_once(text, bold_second_old, bold_second_new, 'bold-number second activation')

font_old = '''      const fontFamily = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Font family"]',
      )!;
      const fontSize = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Font size"]',
      )!;'''
font_new = '''      let fontFamily = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Font family"]',
      );
      if (!fontFamily) {
        const textOptions = Array.from(host.querySelectorAll('button')).find(
          (button) => button.getAttribute('aria-label') === 'Text options',
        );
        if (!textOptions) throw new Error('Expected Text options control');
        await act(async () => {
          await userEvent.click(textOptions);
        });
        fontFamily = document.querySelector<HTMLSelectElement>(
          'select[aria-label="Font family"]',
        );
      }
      const fontSize = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Font size"]',
      );
      if (!fontFamily || !fontSize) throw new Error('Expected text option controls');'''
text = replace_once(text, font_old, font_new, 'full-document text-options menu')

color_old = '''    const colorInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Text color"]',
    )!;
    expect(colorInput.value).toBe('#ff0000');'''
color_new = '''    let colorInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Text color"]',
    );
    if (!colorInput) {
      const textOptions = Array.from(host.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'Text options',
      );
      if (!textOptions) throw new Error('Expected Text options control');
      await act(async () => {
        await userEvent.click(textOptions);
      });
      colorInput = document.querySelector<HTMLInputElement>(
        'input[aria-label="Text color"]',
      );
    }
    if (!colorInput) throw new Error('Expected Text color control');
    expect(colorInput.value).toBe('#ff0000');'''
text = replace_once(text, color_old, color_new, 'controlled color menu')

path.write_text(text)
