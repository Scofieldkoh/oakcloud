import { hydrateFlowHtml } from './model';
import { paginateFlowHtml } from './engine';
import { createA4PageMeasurer, type A4MeasurerLayout } from './measure';
import {
  waitForA4FontReadiness,
  type A4FontSetLike,
} from './a4-font-faces';

export interface BrowserPageFragment {
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

export interface BrowserPaginationLayout extends A4MeasurerLayout {
  contentHeightPx: number;
}

export interface BrowserPaginationReadiness {
  layout: BrowserPaginationLayout;
  fontReady: boolean;
  fontRevision: string;
}

/**
 * Resolves the exact font revision before measuring. Existing synchronous
 * bundle consumers remain compatible; CORE/W3 can adopt this producer first,
 * then call paginateA4Document with the returned revision-qualified layout.
 */
export async function prepareA4BrowserPagination(
  layout: BrowserPaginationLayout,
  options: {
    fontSet?: A4FontSetLike | null;
    runtimeFontRevision?: string | number;
  } = {},
): Promise<BrowserPaginationReadiness> {
  const readiness = await waitForA4FontReadiness(layout.fontFamily, {
    fontSet: options.fontSet,
    runtimeRevision: options.runtimeFontRevision ?? 0,
  });
  return {
    layout: { ...layout, fontRevision: readiness.revision },
    fontReady: readiness.ready,
    fontRevision: readiness.revision,
  };
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
