import {
  paginateA4Document as paginateIntegratedA4Document,
  type BrowserPageFragment,
  type BrowserPaginationLayout,
} from '@/components/documents/a4-pagination/paginate-in-browser.entry';

/**
 * W-owned browser bundle boundary. The implementation remains the integrated
 * SEMANTICS paginator; this bridge gives WORKFLOW/CORE one stable bundle entry
 * without copying any break parser, structural-position logic, or revision
 * authority into the output layer.
 */
export const A4_PAGINATION_BUNDLE_CONTRACT = 'w1-s1-structural-v1' as const;

export function paginateA4Document(
  input: string,
  layout: BrowserPaginationLayout,
): BrowserPageFragment[] {
  return paginateIntegratedA4Document(input, layout);
}
