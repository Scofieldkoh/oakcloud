export interface A4FontFaceDefinition {
  /** Font-family name declared in @font-face. */
  family: string;
  weight: 400 | 700;
  style: 'normal' | 'italic';
  /** File name under /public/fonts. */
  fileName: string;
}

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
