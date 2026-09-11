from pathlib import Path

path = Path('__tests__/components/a4-page-editor.test.tsx')
s = path.read_text()
old = """      expect(selection.isCollapsed).toBe(false);
      expect(selection.anchorNode?.textContent).toBe('Beta');
      expect(selection.anchorOffset).toBe(2);
      expect(selection.focusNode?.textContent).toBe('Alpha');
      expect(selection.focusOffset).toBe(2);
"""
new = """      expect(selection.isCollapsed).toBe(false);
      const anchorElement =
        selection.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (selection.anchorNode as HTMLElement)
          : selection.anchorNode?.parentElement;
      const focusElement =
        selection.focusNode?.nodeType === Node.ELEMENT_NODE
          ? (selection.focusNode as HTMLElement)
          : selection.focusNode?.parentElement;
      expect(
        anchorElement?.closest('[data-testid=\"a4-page-content-2\"]'),
      ).toBeTruthy();
      expect(
        focusElement?.closest('[data-testid=\"a4-page-content-1\"]'),
      ).toBeTruthy();
      expect(selection.anchorOffset).toBe(2);
      expect(selection.focusOffset).toBe(2);
      expect(selection.toString()).toContain('pha');
      expect(selection.toString()).toContain('Be');
"""
if s.count(old) != 1:
    raise SystemExit(f'reversed selection assertion: expected 1 match, got {s.count(old)}')
path.write_text(s.replace(old, new, 1))
print('updated reversed selection regression to assert logical endpoints across formatted nodes')
