'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of records */
  total: number;
  /** Current page size */
  limit: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Page size change handler */
  onLimitChange?: (limit: number) => void;
  /** Show/hide page size selector */
  showPageSize?: boolean;
  /** Additional class name */
  className?: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200];

/**
 * Pagination - Table pagination component with page size selector
 *
 * Features:
 * - Page navigation with Previous/Next buttons
 * - Page number display with ellipsis for large page counts
 * - Page size selector dropdown
 * - "Showing X to Y of Z results" display
 * - Fully responsive design
 *
 * @example
 * ```tsx
 * <Pagination
 *   page={data.page}
 *   totalPages={data.totalPages}
 *   total={data.total}
 *   limit={data.limit}
 *   onPageChange={setPage}
 *   onLimitChange={(newLimit) => {
 *     setLimit(newLimit);
 *     setPage(1);
 *   }}
 * />
 * ```
 */
export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  showPageSize = true,
  className,
}: PaginationProps) {
  // Calculate range of records being displayed
  const start = Math.max(1, (page - 1) * limit + 1);
  const end = Math.min(page * limit, total);

  // Generate page numbers to display with ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    if (page > 3) {
      pages.push('ellipsis');
    }

    // Show pages around current page
    const startPage = Math.max(2, page - 1);
    const endPage = Math.min(totalPages - 1, page + 1);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (page < totalPages - 2) {
      pages.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={cn('flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3', className)}>
      {/* Results info and page size selector */}
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span>
          Showing {start} to {end} of {total.toLocaleString()} results
        </span>

        {showPageSize && onLimitChange && (
          <>
            <span className="hidden sm:inline">•</span>
            <div className="flex items-center gap-2">
              <label htmlFor="page-size" className="whitespace-nowrap">
                Per page:
              </label>
              <select
                id="page-size"
                value={limit}
                onChange={(e) => onLimitChange(Number(e.target.value))}
                className="px-2 py-1 text-sm border border-border-primary rounded bg-background-primary hover:border-oak-primary/50 focus:outline-none focus:ring-2 focus:ring-oak-primary/30 transition-colors"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors',
            page === 1
              ? 'text-text-muted cursor-not-allowed'
              : 'text-text-primary hover:bg-background-tertiary'
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((pageNum, index) => {
            if (pageNum === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 text-text-muted"
                >
                  ...
                </span>
              );
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  'min-w-[32px] h-8 px-2 text-sm rounded-lg transition-colors',
                  pageNum === page
                    ? 'bg-oak-primary text-white font-medium'
                    : 'text-text-primary hover:bg-background-tertiary'
                )}
                aria-label={`Go to page ${pageNum}`}
                aria-current={pageNum === page ? 'page' : undefined}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next button */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors',
            page === totalPages
              ? 'text-text-muted cursor-not-allowed'
              : 'text-text-primary hover:bg-background-tertiary'
          )}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
