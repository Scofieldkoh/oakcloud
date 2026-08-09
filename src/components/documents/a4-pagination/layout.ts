import {
  DEFAULT_DOCUMENT_FONT_FAMILY,
  DEFAULT_DOCUMENT_FONT_SIZE,
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_FONT_SIZE_OPTIONS,
} from '../document-typography';

export interface A4MarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface A4DocumentLayout {
  version: 1;
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  paragraphSpacing: string;
  marginsMm: A4MarginsMm;
}

export const DEFAULT_A4_DOCUMENT_LAYOUT: A4DocumentLayout = {
  version: 1,
  fontFamily: DEFAULT_DOCUMENT_FONT_FAMILY,
  fontSize: DEFAULT_DOCUMENT_FONT_SIZE,
  lineHeight: 1.5,
  paragraphSpacing: '0.5em',
  marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
};

const allowedFontFamilies = new Set<string>(
  DOCUMENT_FONT_OPTIONS.map((option) => option.value),
);
const allowedFontSizes = new Set<string>(DOCUMENT_FONT_SIZE_OPTIONS);

const clampMargin = (value: unknown) =>
  Math.min(60, Math.max(5, typeof value === 'number' ? value : 20));

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function normalizeA4DocumentLayout(value: unknown): A4DocumentLayout {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return structuredClone(DEFAULT_A4_DOCUMENT_LAYOUT);
  }
  const candidate = value as Partial<A4DocumentLayout>;
  const margins = candidate.marginsMm ?? DEFAULT_A4_DOCUMENT_LAYOUT.marginsMm;
  return {
    version: 1,
    fontFamily: typeof candidate.fontFamily === 'string'
      && allowedFontFamilies.has(candidate.fontFamily)
      ? candidate.fontFamily
      : DEFAULT_DOCUMENT_FONT_FAMILY,
    fontSize: typeof candidate.fontSize === 'string'
      && allowedFontSizes.has(candidate.fontSize)
      ? candidate.fontSize
      : DEFAULT_DOCUMENT_FONT_SIZE,
    lineHeight: Math.min(3, Math.max(1, Number(candidate.lineHeight) || 1.5)),
    paragraphSpacing: typeof candidate.paragraphSpacing === 'string'
      ? candidate.paragraphSpacing
      : DEFAULT_A4_DOCUMENT_LAYOUT.paragraphSpacing,
    marginsMm: {
      top: clampMargin(margins.top),
      right: clampMargin(margins.right),
      bottom: clampMargin(margins.bottom),
      left: clampMargin(margins.left),
    },
  };
}

export function extractA4DocumentLayout(contentJson: unknown): A4DocumentLayout {
  if (!isJsonObject(contentJson) || contentJson.version !== 1) {
    return structuredClone(DEFAULT_A4_DOCUMENT_LAYOUT);
  }

  return normalizeA4DocumentLayout(contentJson.layout);
}

export function mergeA4DocumentLayout(
  contentJson: unknown,
  layout: A4DocumentLayout,
): Record<string, unknown> {
  const existingContent = isJsonObject(contentJson) ? contentJson : {};

  return {
    ...existingContent,
    version: 1,
    layout: normalizeA4DocumentLayout(layout),
  };
}

export function a4LayoutsEqual(
  left: A4DocumentLayout,
  right: A4DocumentLayout,
): boolean {
  return left.version === right.version
    && left.fontFamily === right.fontFamily
    && left.fontSize === right.fontSize
    && left.lineHeight === right.lineHeight
    && left.paragraphSpacing === right.paragraphSpacing
    && left.marginsMm.top === right.marginsMm.top
    && left.marginsMm.right === right.marginsMm.right
    && left.marginsMm.bottom === right.marginsMm.bottom
    && left.marginsMm.left === right.marginsMm.left;
}

export function formatA4LayoutStatus(layout: A4DocumentLayout): string {
  const { top, right, bottom, left } = layout.marginsMm;
  return `A4 210 × 297 mm · margins T${top} R${right} B${bottom} L${left} mm`;
}
