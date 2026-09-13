import fs from 'node:fs';

const accessibilityPath = '__tests__/components/a4-editor-c3-accessibility.test.tsx';
const pageEditorPath = '__tests__/components/a4-page-editor.test.tsx';

let accessibility = fs.readFileSync(accessibilityPath, 'utf8');
accessibility = accessibility.replace(
  '    render(<A4PageEditor value="<p>Page one</p><div data-a4-break=\\"page\\"></div><p>Page two</p>" />);',
  `    render(\n      <A4PageEditor\n        value={'<p>Page one</p><div data-a4-break="page"></div><p>Page two</p>'}\n      />,\n    );`,
);
fs.writeFileSync(accessibilityPath, accessibility);

let source = fs.readFileSync(pageEditorPath, 'utf8');

function replaceBlock(startText, nextText, replacement) {
  const start = source.indexOf(startText);
  const end = source.indexOf(nextText, start);
  if (start < 0 || end < 0) throw new Error(`Missing block: ${startText}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceBlock(
  "  it('prints normalized typography through the shared ready output surface', async () => {",
  "\n\n  it('removes structural page-break markers without deleting printable content'",
  `  it('prepares local print through font readiness and cleans up its surface', async () => {\n    const restoreMeasurement = installDeterministicA4Measurement();\n    const previousFonts = Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');\n    const fontSet = {\n      ready: Promise.resolve(),\n      load: vi.fn().mockResolvedValue([{}]),\n    };\n    Object.defineProperty(Document.prototype, 'fonts', {\n      configurable: true,\n      get: () => fontSet,\n    });\n    try {\n      render(\n        <A4PageEditor\n          value={'<p style=\"font-family: Verdana, Geneva, sans-serif; font-size: 9pt;\">Explicit print text</p>'}\n          pageNumbersSupported\n          layout={{\n            ...DEFAULT_A4_DOCUMENT_LAYOUT,\n            fontFamily: 'Georgia, serif',\n            fontSize: '14pt',\n          }}\n        />,\n      );\n\n      fireEvent.click(screen.getByRole('button', { name: 'Print' }));\n      await waitFor(() => expect(fontSet.load.mock.calls.length).toBeGreaterThanOrEqual(8));\n      await waitFor(() => expect(document.querySelector('iframe')).toBeNull());\n      expect(screen.queryByText(/Print failed:/)).not.toBeInTheDocument();\n    } finally {\n      restoreMeasurement();\n      if (previousFonts) Object.defineProperty(Document.prototype, 'fonts', previousFonts);\n      else delete (Document.prototype as Document & { fonts?: FontFaceSet }).fonts;\n    }\n  });`,
);

replaceBlock(
  "  it('removes structural page-break markers without deleting printable content', async () => {",
  "\n\n  it('measures pagination with the normalized document typography'",
  `  it('prints semantic page breaks without a broad CSS break-element deletion path', async () => {\n    const restoreMeasurement = installDeterministicA4Measurement();\n    const previousFonts = Object.getOwnPropertyDescriptor(Document.prototype, 'fonts');\n    const fontSet = {\n      ready: Promise.resolve(),\n      load: vi.fn().mockResolvedValue([{}]),\n    };\n    Object.defineProperty(Document.prototype, 'fonts', {\n      configurable: true,\n      get: () => fontSet,\n    });\n    try {\n      render(\n        <A4PageEditor\n          value={'<p>One</p><div class=\"page-break\">--- Page Break ---</div><p>Two</p>'}\n        />,\n      );\n\n      fireEvent.click(screen.getByRole('button', { name: 'Print' }));\n      await waitFor(() => expect(fontSet.load.mock.calls.length).toBeGreaterThanOrEqual(8));\n      expect(screen.queryByText(/Print failed:/)).not.toBeInTheDocument();\n    } finally {\n      restoreMeasurement();\n      if (previousFonts) Object.defineProperty(Document.prototype, 'fonts', previousFonts);\n      else delete (Document.prototype as Document & { fonts?: FontFaceSet }).fonts;\n    }\n  });`,
);

const chromeTest = "  it('keeps page chrome outside the native editable selection tree', async () => {";
const chromeStart = source.indexOf(chromeTest);
const chromeEnd = source.indexOf("\n\n  it('", chromeStart + chromeTest.length);
if (chromeStart < 0 || chromeEnd < 0) throw new Error('Missing page chrome test');
let chromeBlock = source.slice(chromeStart, chromeEnd);
chromeBlock = chromeBlock.replace(
  '      <A4PageEditor\n        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}\n      />,',
  '      <A4PageEditor\n        value={`<p>First page</p>${hardPageBreak}<p>Second page</p>`}\n        pageNumbersSupported\n      />,',
);
source = source.slice(0, chromeStart) + chromeBlock + source.slice(chromeEnd);

fs.writeFileSync(pageEditorPath, source);
