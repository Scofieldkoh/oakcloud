export interface A4MarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface A4DocumentLayout {
  version: 1;
  lineHeight: number;
  paragraphSpacing: string;
  marginsMm: A4MarginsMm;
}

export const DEFAULT_A4_DOCUMENT_LAYOUT: A4DocumentLayout = {
  version: 1,
  lineHeight: 1.5,
  paragraphSpacing: '0.5em',
  marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
};

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
    && left.lineHeight === right.lineHeight
    && left.paragraphSpacing === right.paragraphSpacing
    && left.marginsMm.top === right.marginsMm.top
    && left.marginsMm.right === right.marginsMm.right
    && left.marginsMm.bottom === right.marginsMm.bottom
    && left.marginsMm.left === right.marginsMm.left;
}
