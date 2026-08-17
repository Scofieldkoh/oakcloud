import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  A4_FONT_FACES,
  type A4FontFaceDefinition,
} from './a4-font-faces';

const FONTS_DIR = join(process.cwd(), 'public', 'fonts');

const dataUriCache = new Map<string, string>();

function dataUriFor(fileName: string): string {
  const cached = dataUriCache.get(fileName);
  if (cached) return cached;
  const data = readFileSync(join(FONTS_DIR, fileName)).toString('base64');
  const uri = `url(data:font/woff2;base64,${data}) format('woff2')`;
  dataUriCache.set(fileName, uri);
  return uri;
}

function faceRule(definition: A4FontFaceDefinition): string {
  return `
    @font-face {
      font-family: '${definition.family}';
      font-style: ${definition.style};
      font-weight: ${definition.weight};
      font-display: block;
      src: ${dataUriFor(definition.fileName)};
    }`;
}

/**
 * @font-face rules with the font data embedded as data URIs, so the
 * server-rendered export HTML is self-contained and renders with the same
 * metrics as the client editor regardless of server fonts.
 */
export function buildA4FontFaceCssDataUris(): string {
  return A4_FONT_FACES.map(faceRule).join('');
}
