'use client';

import { forwardRef } from 'react';
import { Scissors, SplitSquareVertical } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface PageBreakIndicatorProps {
  /**
   * Page number after this break
   */
  pageNumber?: number;
  /**
   * Show page number label
   */
  showPageNumber?: boolean;
  /**
   * Visual variant
   */
  variant?: 'dashed' | 'solid' | 'scissors';
  /**
   * Editable mode - shows remove button on hover
   */
  editable?: boolean;
  /**
   * Callback when remove is clicked
   */
  onRemove?: () => void;
  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export const PageBreakIndicator = forwardRef<HTMLDivElement, PageBreakIndicatorProps>(
  function PageBreakIndicator(
    {
      pageNumber,
      showPageNumber = true,
      variant = 'dashed',
      editable = false,
      onRemove,
      className = '',
    },
    ref
  ) {
    const renderLine = () => {
      switch (variant) {
        case 'solid':
          return <div className="flex-1 h-px bg-border-secondary" />;
        case 'scissors':
          return (
            <>
              <div className="flex-1 h-px border-t border-dashed border-border-secondary" />
              <Scissors className="w-4 h-4 text-text-tertiary rotate-90 mx-2" />
              <div className="flex-1 h-px border-t border-dashed border-border-secondary" />
            </>
          );
        case 'dashed':
        default:
          return <div className="flex-1 h-px border-t border-dashed border-border-secondary" />;
      }
    };

    return (
      <div
        ref={ref}
        className={`
          group relative py-4 select-none
          ${editable ? 'cursor-pointer' : ''}
          ${className}
        `}
        contentEditable={false}
        data-page-break="true"
      >
        {/* Break line */}
        <div className="flex items-center">{renderLine()}</div>

        {/* Page label */}
        {showPageNumber && pageNumber !== undefined && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-background-primary">
            <span className="text-2xs text-text-tertiary uppercase tracking-wider">
              Page {pageNumber}
            </span>
          </div>
        )}

        {/* Label (when no page number) */}
        {!showPageNumber && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-background-primary">
            <span className="text-2xs text-text-tertiary uppercase tracking-wider flex items-center gap-1">
              <SplitSquareVertical className="w-3 h-3" />
              Page Break
            </span>
          </div>
        )}

        {/* Remove button (shown on hover in editable mode) */}
        {editable && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="
              absolute right-0 top-1/2 -translate-y-1/2 px-2 py-1
              text-2xs text-text-tertiary hover:text-status-error
              opacity-0 group-hover:opacity-100 transition-opacity
              bg-background-primary
            "
          >
            Remove
          </button>
        )}
      </div>
    );
  }
);

// ============================================================================
// Page Break Wrapper (for TipTap)
// ============================================================================

export interface PageBreakNodeProps {
  node: {
    attrs?: {
      pageNumber?: number;
    };
  };
  selected?: boolean;
  deleteNode?: () => void;
}

export function PageBreakNode({ node, selected, deleteNode }: PageBreakNodeProps) {
  return (
    <div
      className={`
        relative my-2
        ${selected ? 'ring-2 ring-accent-primary ring-offset-2 rounded' : ''}
      `}
    >
      <PageBreakIndicator
        pageNumber={node.attrs?.pageNumber}
        showPageNumber={!!node.attrs?.pageNumber}
        editable={!!deleteNode}
        onRemove={deleteNode}
        variant="scissors"
      />
    </div>
  );
}

// ============================================================================
// Page Break Insert Button
// ============================================================================

export interface PageBreakButtonProps {
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function PageBreakButton({
  onClick,
  disabled = false,
  size = 'sm',
  className = '',
}: PageBreakButtonProps) {
  const sizeClasses = size === 'sm' ? 'p-1.5' : 'p-2';
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Insert page break"
      className={`
        ${sizeClasses} rounded transition-colors
        ${
          disabled
            ? 'text-text-tertiary cursor-not-allowed'
            : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'
        }
        ${className}
      `}
    >
      <SplitSquareVertical className={iconSize} />
    </button>
  );
}

// ============================================================================
// Page Number Display
// ============================================================================

export interface PageNumberDisplayProps {
  currentPage: number;
  totalPages: number;
  className?: string;
}

export function PageNumberDisplay({
  currentPage,
  totalPages,
  className = '',
}: PageNumberDisplayProps) {
  return (
    <div className={`flex items-center gap-1 text-xs text-text-muted ${className}`}>
      <span>Page</span>
      <span className="font-medium text-text-primary">{currentPage}</span>
      <span>of</span>
      <span className="font-medium text-text-primary">{totalPages}</span>
    </div>
  );
}

export default PageBreakIndicator;
