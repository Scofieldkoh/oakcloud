export interface A4FontFaceDefinition {
  /** Font-family name declared in @font-face. */
  family: string;
  weight: 400 | 700;
  style: 'normal' | 'italic';
  /** File name under /public/fonts. */
  fileName: string;
}

/**
 * Bump this value whenever any bundled font asset is replaced without changing
 * its file name. It participates in measurement cache keys so a deployment
 * cannot reuse metrics from a different font payload.
 */
export const A4_FONT_ASSET_REVISION = 1 as const;

/**
 * Metric-compatible open-source substitutes for the system fonts used by
 * document templates (Arimo ≈ Arial, Tinos ≈ Times New Roman,
 * Cousine ≈ Courier New). Declaring them under the system font names makes
 * every environment — editor, print frame, and server-side PDF export —
 * render text with identical metrics so line wrapping and pagination cannot
 * drift between machines.
 */
export const A4_FONT_FACES: A4FontFaceDefinition[] = [
  // Arial / Helvetica -> Arimo
  { family: 'Arial', weight: 400, style: 'normal', fileName: 'arimo-latin-400-normal.woff2' },
  { family: 'Arial', weight: 400, style: 'italic', fileName: 'arimo-latin-400-italic.woff2' },
  { family: 'Arial', weight: 700, style: 'normal', fileName: 'arimo-latin-700-normal.woff2' },
  { family: 'Arial', weight: 700, style: 'italic', fileName: 'arimo-latin-700-italic.woff2' },
  { family: 'Helvetica', weight: 400, style: 'normal', fileName: 'arimo-latin-400-normal.woff2' },
  { family: 'Helvetica', weight: 400, style: 'italic', fileName: 'arimo-latin-400-italic.woff2' },
  { family: 'Helvetica', weight: 700, style: 'normal', fileName: 'arimo-latin-700-normal.woff2' },
  { family: 'Helvetica', weight: 700, style: 'italic', fileName: 'arimo-latin-700-italic.woff2' },
  // Times New Roman / Times -> Tinos
  { family: 'Times New Roman', weight: 400, style: 'normal', fileName: 'tinos-latin-400-normal.woff2' },
  { family: 'Times New Roman', weight: 400, style: 'italic', fileName: 'tinos-latin-400-italic.woff2' },
  { family: 'Times New Roman', weight: 700, style: 'normal', fileName: 'tinos-latin-700-normal.woff2' },
  { family: 'Times New Roman', weight: 700, style: 'italic', fileName: 'tinos-latin-700-italic.woff2' },
  { family: 'Times', weight: 400, style: 'normal', fileName: 'tinos-latin-400-normal.woff2' },
  { family: 'Times', weight: 400, style: 'italic', fileName: 'tinos-latin-400-italic.woff2' },
  { family: 'Times', weight: 700, style: 'normal', fileName: 'tinos-latin-700-normal.woff2' },
  { family: 'Times', weight: 700, style: 'italic', fileName: 'tinos-latin-700-italic.woff2' },
  // Courier New / Courier -> Cousine
  { family: 'Courier New', weight: 400, style: 'normal', fileName: 'cousine-latin-400-normal.woff2' },
  { family: 'Courier New', weight: 400, style: 'italic', fileName: 'cousine-latin-400-italic.woff2' },
  { family: 'Courier New', weight: 700, style: 'normal', fileName: 'cousine-latin-700-normal.woff2' },
  { family: 'Courier New', weight: 700, style: 'italic', fileName: 'cousine-latin-700-italic.woff2' },
  { family: 'Courier', weight: 400, style: 'normal', fileName: 'cousine-latin-400-normal.woff2' },
  { family: 'Courier', weight: 400, style: 'italic', fileName: 'cousine-latin-400-italic.woff2' },
  { family: 'Courier', weight: 700, style: 'normal', fileName: 'cousine-latin-700-normal.woff2' },
  { family: 'Courier', weight: 700, style: 'italic', fileName: 'cousine-latin-700-italic.woff2' },
];

export interface A4FontSetLike {
  readonly ready: Promise<unknown>;
  load(font: string, text?: string): Promise<readonly unknown[]>;
}

export interface A4FontReadiness {
  revision: string;
  ready: boolean;
  requests: readonly string[];
}

function primaryFontFamily(fontFamily: string): string {
  const first = fontFamily.split(',')[0]?.trim() || fontFamily.trim();
  if (
    (first.startsWith("'") && first.endsWith("'")) ||
    (first.startsWith('"') && first.endsWith('"'))
  ) {
    return first.slice(1, -1);
  }
  return first;
}

function quoteFontFamily(fontFamily: string): string {
  return `"${fontFamily.replaceAll('"', '\\"')}"`;
}

/**
 * Produces the font component used by measurement/projection cache keys. CORE
 * can pass its monotonically increasing font revision while server/output
 * callers can keep the default runtime revision of zero.
 */
export function createA4FontRevision(
  fontFamily: string,
  runtimeRevision: string | number = 0,
): string {
  const primary = primaryFontFamily(fontFamily);
  const matchingFaces = A4_FONT_FACES
    .filter((definition) => definition.family === primary)
    .map(
      (definition) =>
        `${definition.family}:${definition.style}:${definition.weight}:${definition.fileName}`,
    )
    .join('|');
  const faceSignature = matchingFaces || `system:${primary}`;
  return [
    `assets:${A4_FONT_ASSET_REVISION}`,
    `runtime:${runtimeRevision}`,
    `stack:${fontFamily}`,
    faceSignature,
  ].join(';');
}

/**
 * Waits for the exact primary family/styles that affect A4 measurement, then
 * waits for the FontFaceSet to settle. The returned revision is deterministic
 * for cold and warm loads; callers use it as part of their cache/projection
 * identity rather than treating `document.fonts.ready` as an unversioned flag.
 */
export async function waitForA4FontReadiness(
  fontFamily: string,
  options: {
    fontSet?: A4FontSetLike | null;
    runtimeRevision?: string | number;
    sampleText?: string;
  } = {},
): Promise<A4FontReadiness> {
  const revision = createA4FontRevision(
    fontFamily,
    options.runtimeRevision ?? 0,
  );
  const fontSet = options.fontSet === undefined
    ? (typeof document !== 'undefined' ? document.fonts : null)
    : options.fontSet;
  if (!fontSet) {
    return { revision, ready: false, requests: [] };
  }

  const family = quoteFontFamily(primaryFontFamily(fontFamily));
  const requests = [
    `normal 400 16px ${family}`,
    `italic 400 16px ${family}`,
    `normal 700 16px ${family}`,
    `italic 700 16px ${family}`,
  ] as const;
  await Promise.all(
    requests.map((request) => fontSet.load(request, options.sampleText ?? 'Oakcloud A4')),
  );
  await fontSet.ready;
  return { revision, ready: true, requests };
}

/**
 * Builds @font-face rules for client-side documents (fonts served from
 * /public/fonts).
 */
export function buildA4FontFaceCss(): string {
  return A4_FONT_FACES.map(
    (definition) => `
    @font-face {
      font-family: '${definition.family}';
      font-style: ${definition.style};
      font-weight: ${definition.weight};
      font-display: block;
      src: url('/fonts/${definition.fileName}') format('woff2');
    }`,
  ).join('');
}
