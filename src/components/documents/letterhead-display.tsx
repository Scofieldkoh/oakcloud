'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  LETTERHEAD_HEADER_HEIGHT_PX,
  LETTERHEAD_FOOTER_HEIGHT_PX,
} from '@/lib/constants/a4';
import type { Letterhead } from '@/hooks/use-letterhead';
import { hasHeaderContent, hasFooterContent } from '@/hooks/use-letterhead';

// ============================================================================
// Types
// ============================================================================

interface LetterheadHeaderProps {
  letterhead: Letterhead | null;
  className?: string;
}

interface LetterheadFooterProps {
  letterhead: Letterhead | null;
  pageNumber?: number;
  totalPages?: number;
  className?: string;
}

// ============================================================================
// Letterhead Header Component
// ============================================================================

/**
 * Renders the letterhead header area.
 * Shows actual letterhead content if available, otherwise shows a placeholder.
 */
export const LetterheadHeader = memo(function LetterheadHeader({
  letterhead,
  className,
}: LetterheadHeaderProps) {
  const hasContent = hasHeaderContent(letterhead);

  // Placeholder when no letterhead content
  if (!hasContent) {
    return (
      <div
        className={cn(
          'flex items-center justify-center',
          'bg-gray-50 dark:bg-gray-800/50',
          'border-b border-dashed border-gray-300 dark:border-gray-600',
          className
        )}
        style={{ height: LETTERHEAD_HEADER_HEIGHT_PX }}
      >
        <span className="text-sm text-gray-400 dark:text-gray-500 italic">
          [Letterhead Header]
        </span>
      </div>
    );
  }

  // Actual letterhead content
  return (
    <div
      className={cn('overflow-hidden bg-white dark:bg-gray-900', className)}
      style={{ height: LETTERHEAD_HEADER_HEIGHT_PX }}
    >
      <div className="flex items-center justify-center h-full px-6 gap-4">
        {/* Logo */}
        {letterhead?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- User-uploaded letterhead with unknown dimensions
          <img
            src={letterhead.logoUrl}
            alt="Logo"
            className="max-h-12 w-auto object-contain"
          />
        )}

        {/* Header Image */}
        {letterhead?.headerImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- User-uploaded letterhead with unknown dimensions
          <img
            src={letterhead.headerImageUrl}
            alt="Header"
            className="max-h-16 w-auto object-contain"
          />
        )}

        {/* Header HTML */}
        {letterhead?.headerHtml && (
          <div
            className="text-center text-xs leading-tight"
            dangerouslySetInnerHTML={{ __html: letterhead.headerHtml }}
          />
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Letterhead Footer Component
// ============================================================================

/**
 * Renders the letterhead footer area.
 * Shows actual letterhead content if available, otherwise shows a placeholder.
 * Always includes page numbers.
 */
export const LetterheadFooter = memo(function LetterheadFooter({
  letterhead,
  pageNumber = 1,
  totalPages = 1,
  className,
}: LetterheadFooterProps) {
  const hasContent = hasFooterContent(letterhead);

  // Placeholder when no letterhead content
  if (!hasContent) {
    return (
      <div
        className={cn(
          'flex items-center justify-center',
          'bg-gray-50 dark:bg-gray-800/50',
          'border-t border-dashed border-gray-300 dark:border-gray-600',
          className
        )}
        style={{ height: LETTERHEAD_FOOTER_HEIGHT_PX }}
      >
        <span className="text-xs text-gray-400 dark:text-gray-500 italic">
          [Letterhead Footer] — Page {pageNumber} of {totalPages}
        </span>
      </div>
    );
  }

  // Actual letterhead content
  return (
    <div
      className={cn('overflow-hidden bg-white dark:bg-gray-900', className)}
      style={{ height: LETTERHEAD_FOOTER_HEIGHT_PX }}
    >
      <div className="flex flex-col items-center justify-center h-full px-6 gap-1">
        {/* Footer Image */}
        {letterhead?.footerImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- User-uploaded letterhead with unknown dimensions
          <img
            src={letterhead.footerImageUrl}
            alt="Footer"
            className="max-h-8 w-auto object-contain"
          />
        )}

        {/* Footer HTML */}
        {letterhead?.footerHtml && (
          <div
            className="text-center text-xs leading-tight"
            dangerouslySetInnerHTML={{ __html: letterhead.footerHtml }}
          />
        )}

        {/* Page Numbers */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Page {pageNumber} of {totalPages}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Exports
// ============================================================================

export { LETTERHEAD_HEADER_HEIGHT_PX, LETTERHEAD_FOOTER_HEIGHT_PX };
