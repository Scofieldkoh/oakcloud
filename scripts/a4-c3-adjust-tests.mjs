import fs from 'node:fs';

const path = '__tests__/components/a4-page-editor.test.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Ambiguous ${label}`);
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
  `      <A4PageEditor\n        value=\"\"\n        placeholder=\"Start writing\"\n        layout={{`,
  `      <A4PageEditor\n        value=\"\"\n        placeholder=\"Start writing\"\n        pageNumbersSupported\n        layout={{`,
  'placeholder page-number support',
);

const printStart = source.indexOf("  it('prints normalized typography without overriding inline partial styles', () => {");
const printEnd = source.indexOf("\n\n  it('measures pagination with the normalized document typography'", printStart);
if (printStart < 0 || printEnd < 0) throw new Error('Missing print test block');

const replacement = `  it('prints normalized typography through the shared ready output surface', async () => {\n    const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');\n    const fontSet = {\n      ready: Promise.resolve(),\n      load: vi.fn().mockResolvedValue([{}]),\n    };\n    Object.defineProperty(document, 'fonts', { configurable: true, value: fontSet });\n    const writeSpy = vi.spyOn(Document.prototype, 'write');\n    try {\n      render(\n        <A4PageEditor\n          value={'<p style=\"font-family: Verdana, Geneva, sans-serif; font-size: 9pt;\">Explicit print text</p>'}\n          pageNumbersSupported\n          layout={{\n            ...DEFAULT_A4_DOCUMENT_LAYOUT,\n            fontFamily: 'Georgia, serif',\n            fontSize: '14pt',\n          }}\n        />,\n      );\n\n      fireEvent.click(screen.getByRole('button', { name: 'Print' }));\n      await waitFor(() => expect(writeSpy).toHaveBeenCalled());\n      const written = writeSpy.mock.calls.flat().join('');\n      expect(written).toContain('font-family: Georgia, serif;');\n      expect(written).toContain('font-size: 14pt;');\n      expect(written).toContain('h1, h2, h3');\n      expect(written).toContain('Verdana, Geneva, sans-serif');\n      expect(written).toContain('font-size: 9pt');\n      expect(written).toContain('margin: 20mm 20mm 14mm 20mm');\n      expect(written).toContain('height: calc(calc(297mm - 20mm - 20mm) + 6mm);');\n      expect(written).toContain('print-page-number');\n    } finally {\n      writeSpy.mockRestore();\n      if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts);\n      else delete (document as Document & { fonts?: FontFaceSet }).fonts;\n    }\n  });\n\n  it('removes structural page-break markers without deleting printable content', async () => {\n    const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');\n    Object.defineProperty(document, 'fonts', {\n      configurable: true,\n      value: { ready: Promise.resolve(), load: vi.fn().mockResolvedValue([{}]) },\n    });\n    const writeSpy = vi.spyOn(Document.prototype, 'write');\n    try {\n      render(\n        <A4PageEditor\n          value={'<p>One</p><div class=\"page-break\">--- Page Break ---</div><p>Two</p>'}\n        />,\n      );\n\n      fireEvent.click(screen.getByRole('button', { name: 'Print' }));\n      await waitFor(() => expect(writeSpy).toHaveBeenCalled());\n      const written = writeSpy.mock.calls.flat().join('');\n      expect(written).not.toContain('--- Page Break ---');\n      expect(written).toContain('One');\n      expect(written).toContain('Two');\n    } finally {\n      writeSpy.mockRestore();\n      if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts);\n      else delete (document as Document & { fonts?: FontFaceSet }).fonts;\n    }\n  });`;

source = source.slice(0, printStart) + replacement + source.slice(printEnd);
fs.writeFileSync(path, source);
