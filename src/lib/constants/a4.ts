/**
 * A4 Page Constants
 *
 * Standard A4 dimensions at 96 DPI for screen display.
 * A4: 210mm x 297mm = 794px x 1123px at 96 DPI
 *
 * These constants are shared between the template editor and PDF preview
 * to ensure consistent page break calculations and layout.
 */

// ============================================================================
// Base Dimensions
// ============================================================================

export const DPI = 96;
export const MM_TO_PX = DPI / 25.4; // ~3.78 px per mm

// A4 dimensions in mm
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

// A4 dimensions in pixels (at 96 DPI)
export const A4_WIDTH_PX = Math.round(A4_WIDTH_MM * MM_TO_PX); // 794px
export const A4_HEIGHT_PX = Math.round(A4_HEIGHT_MM * MM_TO_PX); // 1123px

// ============================================================================
// Default Margins (matching letterhead service defaults)
// ============================================================================

export const DEFAULT_MARGIN_TOP_MM = 25;
export const DEFAULT_MARGIN_RIGHT_MM = 20;
export const DEFAULT_MARGIN_BOTTOM_MM = 25;
export const DEFAULT_MARGIN_LEFT_MM = 20;

export const DEFAULT_MARGIN_TOP_PX = Math.round(DEFAULT_MARGIN_TOP_MM * MM_TO_PX); // ~95px
export const DEFAULT_MARGIN_RIGHT_PX = Math.round(DEFAULT_MARGIN_RIGHT_MM * MM_TO_PX); // ~76px
export const DEFAULT_MARGIN_BOTTOM_PX = Math.round(DEFAULT_MARGIN_BOTTOM_MM * MM_TO_PX); // ~95px
export const DEFAULT_MARGIN_LEFT_PX = Math.round(DEFAULT_MARGIN_LEFT_MM * MM_TO_PX); // ~76px

// ============================================================================
// Letterhead Dimensions (fixed for consistent calculations)
// ============================================================================

export const LETTERHEAD_HEADER_HEIGHT_PX = 80; // ~21mm
export const LETTERHEAD_FOOTER_HEIGHT_PX = 60; // ~16mm

// ============================================================================
// Content Area Calculations
// ============================================================================

// Content width (A4 width minus left and right margins)
export const A4_CONTENT_WIDTH_PX =
  A4_WIDTH_PX - DEFAULT_MARGIN_LEFT_PX - DEFAULT_MARGIN_RIGHT_PX; // ~642px

// Content height without letterhead (A4 height minus top and bottom margins)
export const A4_CONTENT_HEIGHT_PX =
  A4_HEIGHT_PX - DEFAULT_MARGIN_TOP_PX - DEFAULT_MARGIN_BOTTOM_PX; // ~933px

// Content height with letterhead (reduced by header and footer)
export const A4_CONTENT_HEIGHT_WITH_LETTERHEAD_PX =
  A4_CONTENT_HEIGHT_PX - LETTERHEAD_HEADER_HEIGHT_PX - LETTERHEAD_FOOTER_HEIGHT_PX; // ~793px

// ============================================================================
// Types
// ============================================================================

export interface PageMargins {
  top: number; // mm
  right: number;
  bottom: number;
  left: number;
}

export interface PageMarginsInPx {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert millimeters to pixels at 96 DPI
 */
export function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}

/**
 * Convert pixels to millimeters at 96 DPI
 */
export function pxToMm(px: number): number {
  return px / MM_TO_PX;
}

/**
 * Convert page margins from mm to pixels
 */
export function getMarginsInPx(margins: PageMargins): PageMarginsInPx {
  return {
    top: mmToPx(margins.top),
    right: mmToPx(margins.right),
    bottom: mmToPx(margins.bottom),
    left: mmToPx(margins.left),
  };
}

/**
 * Get default margins in pixels
 */
export function getDefaultMarginsInPx(): PageMarginsInPx {
  return {
    top: DEFAULT_MARGIN_TOP_PX,
    right: DEFAULT_MARGIN_RIGHT_PX,
    bottom: DEFAULT_MARGIN_BOTTOM_PX,
    left: DEFAULT_MARGIN_LEFT_PX,
  };
}

/**
 * Calculate content height per page based on letterhead state
 */
export function getContentHeightPerPage(withLetterhead: boolean): number {
  return withLetterhead ? A4_CONTENT_HEIGHT_WITH_LETTERHEAD_PX : A4_CONTENT_HEIGHT_PX;
}

/**
 * Calculate page break positions for given content height
 * Returns an array of pixel positions where page breaks should occur
 */
export function calculatePageBreaks(
  contentHeight: number,
  withLetterhead: boolean
): number[] {
  const pageHeight = getContentHeightPerPage(withLetterhead);
  const breaks: number[] = [];
  let position = pageHeight;

  while (position < contentHeight) {
    breaks.push(position);
    position += pageHeight;
  }

  return breaks;
}

/**
 * Calculate total number of pages for given content height
 */
export function calculatePageCount(
  contentHeight: number,
  withLetterhead: boolean
): number {
  const pageHeight = getContentHeightPerPage(withLetterhead);
  return Math.max(1, Math.ceil(contentHeight / pageHeight));
}

/**
 * Get the total height of a single A4 page including letterhead
 */
export function getPageTotalHeight(withLetterhead: boolean): number {
  if (withLetterhead) {
    return (
      DEFAULT_MARGIN_TOP_PX +
      LETTERHEAD_HEADER_HEIGHT_PX +
      A4_CONTENT_HEIGHT_WITH_LETTERHEAD_PX +
      LETTERHEAD_FOOTER_HEIGHT_PX +
      DEFAULT_MARGIN_BOTTOM_PX
    );
  }
  return A4_HEIGHT_PX;
}
