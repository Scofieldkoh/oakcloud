'use client';

import { useState } from 'react';
import {
  Scissors,
  GripHorizontal,
  X,
  ChevronUp,
  ChevronDown,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface PageBreakIndicatorProps {
  id?: string;
  pageNumber?: number;
  isEditable?: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  className?: string;
  variant?: 'default' | 'compact' | 'preview';
}

export interface PageBreakInsertProps {
  onInsert: () => void;
  className?: string;
  disabled?: boolean;
}

// ============================================================================
// Page Break Indicator Component
// ============================================================================

export function PageBreakIndicator({
  id,
  pageNumber,
  isEditable = false,
  onRemove,
  onMoveUp,
  onMoveDown,
  className,
  variant = 'default',
}: PageBreakIndicatorProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (variant === 'preview') {
    // Simple preview-only indicator (used in PDF preview)
    return (
      <div
        id={id}
        className={cn(
          'relative py-4 my-4',
          'flex items-center justify-center',
          className
        )}
      >
        <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
        <div className="relative px-4 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          {pageNumber ? `Page ${pageNumber}` : 'Page Break'}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    // Compact inline indicator
    return (
      <div
        id={id}
        className={cn(
          'relative h-8 my-2',
          'flex items-center justify-center',
          className
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-300 dark:border-gray-700" />
        <div
          className={cn(
            'relative px-2 py-0.5 rounded text-xs flex items-center gap-1',
            'bg-background-secondary border border-border-secondary',
            'text-text-muted'
          )}
        >
          <Scissors className="w-3 h-3" />
          <span>Page Break</span>
        </div>

        {/* Remove button (shows on hover in edit mode) */}
        {isEditable && onRemove && isHovered && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 p-1 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
            title="Remove page break"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  // Default variant - full featured
  return (
    <div
      id={id}
      className={cn(
        'relative py-6 my-4',
        'group',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dashed line */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div className="border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
      </div>

      {/* Label */}
      <div className="relative flex items-center justify-center">
        <div
          className={cn(
            'px-4 py-2 rounded-lg flex items-center gap-2',
            'bg-background-secondary border border-border-primary',
            'shadow-sm transition-all',
            isHovered && 'shadow-md'
          )}
        >
          <Scissors className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-secondary">
            Page Break
          </span>
          {pageNumber && (
            <span className="text-xs text-text-muted px-2 py-0.5 bg-background-tertiary rounded">
              Page {pageNumber}
            </span>
          )}
        </div>
      </div>

      {/* Edit controls */}
      {isEditable && isHovered && (
        <div
          className={cn(
            'absolute right-4 top-1/2 -translate-y-1/2',
            'flex items-center gap-1',
            'bg-background-elevated border border-border-primary rounded-lg',
            'shadow-lg p-1',
            'animate-fade-in'
          )}
        >
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              className="p-1.5 rounded hover:bg-background-secondary text-text-muted hover:text-text-primary transition-colors"
              title="Move up"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              className="p-1.5 rounded hover:bg-background-secondary text-text-muted hover:text-text-primary transition-colors"
              title="Move down"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {(onMoveUp || onMoveDown) && onRemove && (
            <div className="w-px h-4 bg-border-secondary mx-0.5" />
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Remove page break"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Drag handle (for future drag-and-drop) */}
      {isEditable && isHovered && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <GripHorizontal className="w-5 h-5 text-text-muted opacity-50 cursor-grab" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Page Break Insert Button Component
// ============================================================================

export function PageBreakInsertButton({
  onInsert,
  className,
  disabled = false,
}: PageBreakInsertProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        'relative h-8 my-2 group cursor-pointer',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={disabled ? undefined : onInsert}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onInsert();
        }
      }}
    >
      {/* Hover line */}
      <div
        className={cn(
          'absolute inset-x-0 top-1/2 border-t border-dashed transition-colors',
          isHovered
            ? 'border-accent-primary'
            : 'border-transparent hover:border-gray-300 dark:hover:border-gray-700'
        )}
      />

      {/* Insert button */}
      <div
        className={cn(
          'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'px-3 py-1 rounded-full flex items-center gap-1.5',
          'text-xs font-medium transition-all',
          isHovered
            ? 'bg-accent-primary text-white'
            : 'bg-background-secondary text-text-muted opacity-0 group-hover:opacity-100'
        )}
      >
        <Scissors className="w-3 h-3" />
        Insert Page Break
      </div>
    </div>
  );
}

// ============================================================================
// Page Break Toolbar Component
// ============================================================================

interface PageBreakToolbarProps {
  onInsert: () => void;
  currentPage?: number;
  totalPages?: number;
  className?: string;
}

export function PageBreakToolbar({
  onInsert,
  currentPage,
  totalPages,
  className,
}: PageBreakToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 bg-background-secondary rounded-lg',
        className
      )}
    >
      <button
        type="button"
        onClick={onInsert}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-text-primary bg-background-elevated border border-border-primary hover:bg-background-tertiary transition-colors"
      >
        <Scissors className="w-4 h-4" />
        Insert Page Break
      </button>

      {currentPage !== undefined && totalPages !== undefined && (
        <span className="text-sm text-text-muted">
          Page {currentPage} of {totalPages}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Parse Content for Page Breaks
// ============================================================================

interface ParsedContent {
  segments: ContentSegment[];
  pageBreakCount: number;
}

interface ContentSegment {
  type: 'content' | 'pageBreak';
  content?: string;
  id: string;
  pageNumber?: number;
}

export function parseContentForPageBreaks(html: string): ParsedContent {
  const segments: ContentSegment[] = [];
  let pageNumber = 1;

  // Split by page break markers
  const parts = html.split(/<div[^>]*class="[^"]*page-break[^"]*"[^>]*>.*?<\/div>/gi);
  const pageBreaks = html.match(/<div[^>]*class="[^"]*page-break[^"]*"[^>]*>.*?<\/div>/gi) || [];

  parts.forEach((part, index) => {
    if (part.trim()) {
      segments.push({
        type: 'content',
        content: part,
        id: `content-${index}`,
      });
    }

    if (pageBreaks[index]) {
      pageNumber++;
      segments.push({
        type: 'pageBreak',
        id: `page-break-${index}`,
        pageNumber,
      });
    }
  });

  return {
    segments,
    pageBreakCount: pageBreaks.length,
  };
}

// ============================================================================
// Render Content with Page Breaks
// ============================================================================

interface RenderContentWithPageBreaksProps {
  html: string;
  isEditable?: boolean;
  onRemovePageBreak?: (index: number) => void;
  className?: string;
}

export function RenderContentWithPageBreaks({
  html,
  isEditable = false,
  onRemovePageBreak,
  className,
}: RenderContentWithPageBreaksProps) {
  const { segments } = parseContentForPageBreaks(html);

  return (
    <div className={className}>
      {segments.map((segment, index) =>
        segment.type === 'pageBreak' ? (
          <PageBreakIndicator
            key={segment.id}
            id={segment.id}
            pageNumber={segment.pageNumber}
            isEditable={isEditable}
            onRemove={
              onRemovePageBreak ? () => onRemovePageBreak(index) : undefined
            }
            variant={isEditable ? 'default' : 'preview'}
          />
        ) : (
          <div
            key={segment.id}
            dangerouslySetInnerHTML={{ __html: segment.content || '' }}
          />
        )
      )}
    </div>
  );
}

export default PageBreakIndicator;
