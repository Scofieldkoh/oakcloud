import { hydrateFlowHtml } from './model';
import { paginateFlowHtml } from './engine';
import { createA4PageMeasurer, type A4MeasurerLayout } from './measure';

export interface BrowserPageFragment {
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

export interface BrowserPaginationLayout extends A4MeasurerLayout {
  contentHeightPx: number;
}

/**
 * Paginates canonical A4 content with the same engine and measurer used by
 * the editor, so page boundaries match the on-screen preview exactly.
 */
export function paginateA4Document(
  input: string,
  layout: BrowserPaginationLayout,
): BrowserPageFragment[] {
  const measurer = createA4PageMeasurer(layout);
  try {
    return paginateFlowHtml(hydrateFlowHtml(input), measurer, layout.contentHeightPx);
  } finally {
    measurer.dispose();
  }
}
