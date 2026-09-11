import {
  paginateFlowHtml,
  type HtmlMeasurer,
} from './engine';
import {
  partitionA4SemanticBreaks,
} from './semantic-break-projection';
import type {
  A4BreakProjectionFragment,
  A4ProjectionPositionMap,
  A4ProjectionSourceRevision,
} from './semantic-page-breaks';
import type { PageFragment } from './model';
import type { CanonicalEditorDocument } from './structural-position';

export interface A4StructuralPaginationResult {
  pages: readonly PageFragment[];
  sourceFragments: readonly A4BreakProjectionFragment[];
  positionMap: A4ProjectionPositionMap;
}

/**
 * S1 pagination adapter. Manual hard-break partitioning happens against the
 * unsplit canonical tree before the existing soft pagination engine measures
 * each projected fragment. This avoids string-splitting nested break markup.
 */
export function paginateA4StructuralHtml(
  input: string | CanonicalEditorDocument,
  source: A4ProjectionSourceRevision,
  measurer: HtmlMeasurer,
  maxHeight: number,
): A4StructuralPaginationResult {
  const projection = partitionA4SemanticBreaks(input, source);
  const pages = projection.fragments.flatMap((fragment) => {
    const softPages = paginateFlowHtml(fragment.content, measurer, maxHeight);
    return softPages.map((page, pageIndex) => ({
      ...page,
      hardBreakBefore: pageIndex === 0 ? fragment.hardBreakBefore : false,
    }));
  });
  return {
    pages,
    sourceFragments: projection.fragments,
    positionMap: projection.positionMap,
  };
}

/**
 * Compatibility entry for legacy callers that only need PageFragment[]. New
 * revision-aware consumers should call paginateA4StructuralHtml.
 */
export function paginateFlowHtmlStructuralCompat(
  input: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
): PageFragment[] {
  return [...paginateA4StructuralHtml(
    input,
    { sessionKey: 'legacy-paginate-flow-html', documentRevision: 0 },
    measurer,
    maxHeight,
  ).pages];
}
