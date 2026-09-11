import {
  paginateA4FlowHtml,
  paginateFlowHtml,
  type A4FlowPaginationResult,
  type HtmlMeasurer,
} from './engine';
import type { A4ProjectionSourceRevision } from './semantic-page-breaks';
import type { PageFragment } from './model';
import type { CanonicalEditorDocument } from './structural-position';

export type A4StructuralPaginationResult = A4FlowPaginationResult;

/**
 * Named S1 adapter for CORE/WORKFLOW. The engine entry itself now consumes the
 * structural partition contract, so this is a stable semantic-facing name.
 */
export function paginateA4StructuralHtml(
  input: string | CanonicalEditorDocument,
  source: A4ProjectionSourceRevision,
  measurer: HtmlMeasurer,
  maxHeight: number,
): A4StructuralPaginationResult {
  return paginateA4FlowHtml(input, source, measurer, maxHeight);
}

/** Compatibility alias retained for callers migrating from text-only paging. */
export function paginateFlowHtmlStructuralCompat(
  input: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
): PageFragment[] {
  return paginateFlowHtml(input, measurer, maxHeight);
}
