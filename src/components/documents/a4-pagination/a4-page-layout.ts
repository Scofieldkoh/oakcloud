import type { A4MarginsMm } from './layout';

/** A4 page size in pixels at 96 DPI (standard screen) for true WYSIWYG. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

/** 96 DPI pixels per millimetre. */
export const MM_TO_PX = 96 / 25.4;

export interface A4PageLayout {
  marginsMm: A4MarginsMm;
  topPx: number;
  rightPx: number;
  bottomPx: number;
  leftPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
}

/**
 * Converts millimetre margins into the pixel geometry used by the pagination
 * measurer, mirroring the on-screen A4 sheet dimensions.
 */
export function createA4PageLayout(marginsMm: A4MarginsMm): A4PageLayout {
  const topPx = Math.round(marginsMm.top * MM_TO_PX);
  const rightPx = Math.round(marginsMm.right * MM_TO_PX);
  const bottomPx = Math.round(marginsMm.bottom * MM_TO_PX);
  const leftPx = Math.round(marginsMm.left * MM_TO_PX);

  return {
    marginsMm,
    topPx,
    rightPx,
    bottomPx,
    leftPx,
    contentWidthPx: A4_WIDTH_PX - leftPx - rightPx,
    contentHeightPx: A4_HEIGHT_PX - topPx - bottomPx,
  };
}
