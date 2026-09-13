import fs from 'node:fs';

const editorPath = 'src/components/documents/a4-page-editor.tsx';
const testPath = '__tests__/components/a4-editor-c3-accessibility.test.tsx';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Ambiguous ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

let editor = fs.readFileSync(editorPath, 'utf8');

editor = replaceOnce(
  editor,
  "import {\n  paginateA4FlowHtml,\n  paginateFlowHtml,\n  type HtmlMeasurer,\n} from './a4-pagination/engine';",
  "import {\n  paginateA4FlowHtml,\n  paginateFlowHtml,\n} from './a4-pagination/engine';",
  'engine import',
);

editor = replaceOnce(
  editor,
  "import { buildA4FontFaceCss } from './a4-pagination/a4-font-faces';",
  "import {\n  buildA4FontFaceCss,\n  createA4FontRevision,\n  waitForA4FontReadiness,\n} from './a4-pagination/a4-font-faces';\nimport {\n  createA4PageMeasurer,\n  type A4PageMeasurer,\n} from './a4-pagination/measure';",
  'font import',
);

editor = replaceOnce(
  editor,
  "import { cn } from '@/lib/utils';",
  "import { cn } from '@/lib/utils';\nimport {\n  assembleA4OutputPages,\n  createA4OutputPreparationSession,\n  type A4OutputPreparationSession,\n} from '@/lib/document-editor/a4-output-preparation';\nimport type { A4WorkflowStatus } from '@/lib/document-editor/a4-workflow-status';",
  'shared W3 imports',
);

editor = replaceOnce(
  editor,
  "function sanitizeHtml(html: string): string {\n  return DOMPurify.sanitize(html, {\n    ALLOWED_TAGS: A4_SANITIZER_POLICY.allowedTags,\n    ALLOWED_ATTR: [\n      ...A4_SANITIZER_POLICY.allowedAttributes,\n      ...A4_EDITOR_DECORATION_ATTRIBUTES,\n    ],\n    ALLOW_DATA_ATTR: false,\n    ALLOW_ARIA_ATTR: false,\n    ALLOWED_URI_REGEXP:\n      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))/i,\n  });\n}\n",
  "function sanitizeHtml(html: string): string {\n  return DOMPurify.sanitize(html, {\n    ALLOWED_TAGS: A4_SANITIZER_POLICY.allowedTags,\n    ALLOWED_ATTR: [\n      ...A4_SANITIZER_POLICY.allowedAttributes,\n      ...A4_EDITOR_DECORATION_ATTRIBUTES,\n    ],\n    ALLOW_DATA_ATTR: false,\n    ALLOW_ARIA_ATTR: false,\n    ALLOWED_URI_REGEXP:\n      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))/i,\n  });\n}\n\nfunction sanitizeOutputHtml(html: string): string {\n  return DOMPurify.sanitize(html, {\n    ALLOWED_TAGS: A4_SANITIZER_POLICY.allowedTags,\n    ALLOWED_ATTR: A4_SANITIZER_POLICY.allowedAttributes,\n    ALLOW_DATA_ATTR: false,\n    ALLOW_ARIA_ATTR: false,\n    ALLOWED_URI_REGEXP:\n      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\\-]+(?:[^a-z+.\\-:]|$))/i,\n  });\n}\n\nfunction workflowStatusText(status: A4WorkflowStatus): string {\n  if (status.message) return status.message;\n  switch (status.phase) {\n    case 'clean': return 'Up to date';\n    case 'dirty': return 'Unsaved changes';\n    case 'saving': return 'Saving…';\n    case 'saved': return 'Saved';\n    case 'conflict': return 'Save conflict';\n    case 'error': return 'Save failed';\n    case 'read-only': return 'Read only';\n  }\n}\n",
  'output sanitizer and status formatter',
);

editor = replaceOnce(
  editor,
  "  /** Enable page-number authoring only when persistence/output support is complete. */\n  pageNumbersSupported?: boolean;",
  "  /** Enable page-number authoring only when persistence/output support is complete. */\n  pageNumbersSupported?: boolean;\n  /** Revision-derived save state produced by the W3 workflow boundary. */\n  workflowStatus?: A4WorkflowStatus;",
  'workflow status prop',
);

const measurerStart = editor.indexOf('function createPageMeasurer(');
const measurerEndMarker = '\n// ============================================================================\n// Single A4 Page Component';
const measurerEnd = editor.indexOf(measurerEndMarker, measurerStart);
if (measurerStart < 0 || measurerEnd < 0) throw new Error('Missing local page measurer');
const newMeasurer = `function createPageMeasurer(\n  pageLayout: A4PageLayout,\n  fontFamily: string,\n  fontSize: string,\n  lineHeight: string,\n  paragraphSpacing: string,\n): A4PageMeasurer {\n  return createA4PageMeasurer(\n    {\n      contentWidthPx: pageLayout.contentWidthPx,\n      fontFamily,\n      fontSize,\n      lineHeight,\n      paragraphSpacing,\n      layoutVersion: 1,\n      layoutRevision: 0,\n      fontRevision: createA4FontRevision(fontFamily),\n    },\n    { prepareHtml: sanitizeHtml },\n  );\n}\n`;
editor = editor.slice(0, measurerStart) + newMeasurer + editor.slice(measurerEnd);

editor = replaceOnce(
  editor,
  "      pageNumbersSupported = false,\n      tenantId: _tenantId,",
  "      pageNumbersSupported = false,\n      workflowStatus,\n      tenantId: _tenantId,",
  'workflow status destructuring',
);

editor = replaceOnce(
  editor,
  "    const [showPageNumbers, setShowPageNumbers] = useState(true);",
  "    const [showPageNumbers, setShowPageNumbers] = useState(pageNumbersSupported);\n    const activePrintSessionRef = useRef<A4OutputPreparationSession | null>(null);",
  'page number state',
);

editor = replaceOnce(
  editor,
  "    const [surfaceRepairGeneration, setSurfaceRepairGeneration] = useState(0);",
  "    useEffect(() => {\n      if (!pageNumbersSupported) setShowPageNumbers(false);\n    }, [pageNumbersSupported]);\n\n    useEffect(\n      () => () => {\n        const activePrint = activePrintSessionRef.current;\n        if (activePrint) {\n          activePrint.cancel('editor-unmounted');\n          void activePrint.dispose().catch(() => undefined);\n        }\n      },\n      [],\n    );\n\n    const [surfaceRepairGeneration, setSurfaceRepairGeneration] = useState(0);",
  'page number support and print cleanup',
);

const printStart = editor.indexOf('    const handlePrint = useCallback(() => {');
const printEndMarker = '\n\n    const scrollToPage = useCallback(';
const printEnd = editor.indexOf(printEndMarker, printStart);
if (printStart < 0 || printEnd < 0) throw new Error('Missing legacy print handler');
const newPrint = `    const handlePrint = useCallback(async () => {\n      if (activePrintSessionRef.current) return;\n\n      const outputSession = createA4OutputPreparationSession('local-print');\n      activePrintSessionRef.current = outputSession;\n      try {\n        const fontReadiness = await waitForA4FontReadiness(fontFamily);\n        outputSession.assertActive();\n        if (!fontReadiness.ready) {\n          throw new Error('Document fonts are not ready for local print.');\n        }\n        outputSession.markFontsReady();\n\n        const canonical =\n          canonicalSessionRef.current?.getState().internalHtml ??\n          canonicalPagesHtml(pagesRef.current);\n        const measurer = createPageMeasurer(\n          pageLayout,\n          fontFamily,\n          fontSize,\n          lineHeight,\n          paragraphSpacing,\n        );\n        let pagination;\n        try {\n          pagination = paginateA4FlowHtml(\n            { internalHtml: canonical },\n            {\n              sessionKey: resolvedSessionKey,\n              documentRevision:\n                canonicalSessionRef.current?.getState().revision ?? 0,\n            },\n            measurer,\n            pageLayout.contentHeightPx,\n          );\n        } finally {\n          measurer.dispose();\n        }\n        outputSession.assertActive();\n        outputSession.markPaginationReady();\n\n        const assembly = assembleA4OutputPages(pagination.pages, {\n          sanitizeFragment: sanitizeOutputHtml,\n          includePageNumbers: pageNumbersSupported && showPageNumbers,\n        });\n\n        const printFrame = document.createElement('iframe');\n        printFrame.setAttribute('aria-hidden', 'true');\n        Object.assign(printFrame.style, {\n          position: 'absolute',\n          top: '-9999px',\n          left: '-9999px',\n          width: '0',\n          height: '0',\n          border: 'none',\n        });\n        document.body.appendChild(printFrame);\n        outputSession.addCleanup(() => printFrame.remove());\n\n        const frameDoc =\n          printFrame.contentDocument ?? printFrame.contentWindow?.document ?? null;\n        const frameWindow = printFrame.contentWindow;\n        if (!frameDoc || !frameWindow) {\n          throw new Error('Unable to create the local print surface.');\n        }\n\n        frameDoc.open();\n        frameDoc.write(\`<!DOCTYPE html>\n<html>\n<head>\n  <title>Print</title>\n  <style>\n    \${buildA4FontFaceCss()}\n    \${buildA4PageContentStyles(paragraphSpacing)}\n    \${buildA4PrintCss(effectiveLayout, {\n      pageNumberStripMm:\n        pageNumbersSupported && showPageNumbers\n          ? PAGE_NUMBER_STRIP_MM\n          : undefined,\n    })}\n  </style>\n</head>\n<body>\${assembly.html}</body>\n</html>\`);\n        frameDoc.close();\n\n        const frameFontReadiness = await waitForA4FontReadiness(fontFamily, {\n          fontSet: frameDoc.fonts,\n        });\n        outputSession.assertActive();\n        if (!frameFontReadiness.ready) {\n          throw new Error('Print-frame fonts failed to become ready.');\n        }\n\n        outputSession.markInstalled();\n        outputSession.assertReady();\n        frameWindow.focus();\n        frameWindow.print();\n        setEditorStatus(null);\n      } catch (error) {\n        const message =\n          error instanceof Error ? error.message : 'Local print preparation failed.';\n        outputSession.fail(message);\n        setEditorStatus(\`Print failed: \${message}\`);\n      } finally {\n        try {\n          await outputSession.dispose();\n        } finally {\n          if (activePrintSessionRef.current === outputSession) {\n            activePrintSessionRef.current = null;\n          }\n        }\n      }\n    }, [\n      canonicalPagesHtml,\n      effectiveLayout,\n      fontFamily,\n      fontSize,\n      lineHeight,\n      pageLayout,\n      pageNumbersSupported,\n      paragraphSpacing,\n      resolvedSessionKey,\n      showPageNumbers,\n    ]);`;
editor = editor.slice(0, printStart) + newPrint + editor.slice(printEnd);

editor = replaceOnce(
  editor,
  "              onClick={handlePrint}",
  "              onClick={() => void handlePrint()}",
  'print click handler',
);

editor = replaceOnce(
  editor,
  "            {isReflowing\n              ? 'Repaginating…'\n              : readOnly\n                ? 'Viewing document'\n                : effectivePreviewMode\n                  ? 'Viewing preview'\n                  : 'Editing'}",
  "            {isReflowing\n              ? 'Repaginating…'\n              : workflowStatus\n                ? workflowStatusText(workflowStatus)\n                : readOnly\n                  ? 'Viewing document'\n                  : effectivePreviewMode\n                    ? 'Viewing preview'\n                    : 'Editing'}",
  'workflow status display',
);

fs.writeFileSync(editorPath, editor);

let test = fs.readFileSync(testPath, 'utf8');
test = replaceOnce(
  test,
  "  it('keeps pagination state visual rather than announcing each reflow', () => {",
  `  it('hides page-number chrome until persistence/output support is enabled', () => {\n    render(<A4PageEditor value=\"<p>Page one</p><div data-a4-break=\\\"page\\\"></div><p>Page two</p>\" />);\n\n    expect(screen.queryByTestId('a4-page-number-1')).not.toBeInTheDocument();\n  });\n\n  it('surfaces W3 revision-derived workflow status without a local timer', async () => {\n    render(\n      <A4PageEditor\n        value=\"<p>Status</p>\"\n        workflowStatus={{\n          phase: 'saving',\n          serverRevision: 4,\n          acknowledgedRevision: 4,\n          localRevision: 5,\n          dirty: true,\n          canSave: false,\n          shouldRetry: false,\n          message: null,\n        }}\n      />,\n    );\n\n    expect(await screen.findByTestId('a4-editor-status')).toHaveTextContent(/Saving|Repaginating/);\n  });\n\n  it('keeps pagination state visual rather than announcing each reflow', () => {`,
  'C3 integration tests',
);
fs.writeFileSync(testPath, test);
