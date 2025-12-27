'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface TextRange {
  start: number;
  end: number;
  text: string;
}

export interface CommentHighlight extends TextRange {
  id: string;
  status?: 'OPEN' | 'RESOLVED';
}

export interface TextSelectionHighlightProps {
  /** The document text content */
  content: string;
  /** Array of comment highlights to display */
  commentHighlights?: CommentHighlight[];
  /** Currently active/focused highlight */
  activeHighlightId?: string | null;
  /** Enable selection mode to create new comments */
  enableSelection?: boolean;
  /** Callback when text is selected for a new comment */
  onTextSelected?: (selection: TextRange) => void;
  /** Callback when a highlight is clicked */
  onHighlightClick?: (commentId: string) => void;
  /** Custom class for the container */
  className?: string;
}

interface HighlightedSegment {
  text: string;
  type: 'normal' | 'highlight' | 'active';
  commentId?: string;
  start: number;
  end: number;
}

// ============================================================================
// Selection Tooltip Component
// ============================================================================

function SelectionTooltip({
  position,
  onAddComment,
}: {
  position: { x: number; y: number };
  onAddComment: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-50 bg-background-elevated border border-border-primary rounded-md shadow-lg py-1 px-1"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      <button
        type="button"
        onClick={onAddComment}
        className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-text-primary hover:bg-background-tertiary rounded transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Add Comment
      </button>
    </div>
  );
}

// ============================================================================
// Text Selection Highlight Component
// ============================================================================

export function TextSelectionHighlight({
  content,
  commentHighlights = [],
  activeHighlightId,
  enableSelection = true,
  onTextSelected,
  onHighlightClick,
  className,
}: TextSelectionHighlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectionTooltip, setSelectionTooltip] = useState<{
    position: { x: number; y: number };
    range: TextRange;
  } | null>(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectionTooltip(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle text selection
  const handleMouseUp = useCallback(() => {
    if (!enableSelection) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();

    if (!selectedText || !containerRef.current) return;

    // Check if selection is within our container
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      return;
    }

    // Calculate character offsets within the content
    // This is a simplified approach - for complex HTML, you'd need a more robust solution
    const walker = document.createTreeWalker(
      containerRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    let charOffset = 0;
    let startOffset = 0;
    let endOffset = 0;
    let foundStart = false;
    let foundEnd = false;

    let node: Node | null;
    while ((node = walker.nextNode()) && !foundEnd) {
      const nodeLength = node.textContent?.length || 0;

      if (!foundStart) {
        if (range.startContainer === node) {
          startOffset = charOffset + range.startOffset;
          foundStart = true;
        } else if (range.startContainer.contains(node)) {
          startOffset = charOffset;
          foundStart = true;
        }
      }

      if (foundStart && !foundEnd) {
        if (range.endContainer === node) {
          endOffset = charOffset + range.endOffset;
          foundEnd = true;
        } else if (range.endContainer.contains(node)) {
          endOffset = charOffset + nodeLength;
          foundEnd = true;
        }
      }

      charOffset += nodeLength;
    }

    if (!foundStart || !foundEnd || startOffset >= endOffset) return;

    // Get selection position for tooltip
    const selectionRect = range.getBoundingClientRect();
    const tooltipPosition = {
      x: selectionRect.left + selectionRect.width / 2,
      y: selectionRect.top,
    };

    setSelectionTooltip({
      position: tooltipPosition,
      range: {
        start: startOffset,
        end: endOffset,
        text: selectedText,
      },
    });
  }, [enableSelection]);

  // Handle add comment from tooltip
  const handleAddComment = useCallback(() => {
    if (selectionTooltip && onTextSelected) {
      onTextSelected(selectionTooltip.range);
    }
    setSelectionTooltip(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionTooltip, onTextSelected]);

  // Build highlighted segments
  const segments = useMemo((): HighlightedSegment[] => {
    if (commentHighlights.length === 0) {
      return [{ text: content, type: 'normal', start: 0, end: content.length }];
    }

    // Sort highlights by start position
    const sortedHighlights = [...commentHighlights]
      .filter((h) => h.start >= 0 && h.end <= content.length && h.start < h.end)
      .sort((a, b) => a.start - b.start);

    if (sortedHighlights.length === 0) {
      return [{ text: content, type: 'normal', start: 0, end: content.length }];
    }

    const result: HighlightedSegment[] = [];
    let currentPos = 0;

    for (const highlight of sortedHighlights) {
      // Add normal text before highlight
      if (highlight.start > currentPos) {
        result.push({
          text: content.slice(currentPos, highlight.start),
          type: 'normal',
          start: currentPos,
          end: highlight.start,
        });
      }

      // Add highlighted text (skip overlaps)
      if (highlight.start >= currentPos) {
        const isActive = highlight.id === activeHighlightId;
        result.push({
          text: content.slice(highlight.start, highlight.end),
          type: isActive ? 'active' : 'highlight',
          commentId: highlight.id,
          start: highlight.start,
          end: highlight.end,
        });
        currentPos = highlight.end;
      }
    }

    // Add remaining normal text
    if (currentPos < content.length) {
      result.push({
        text: content.slice(currentPos),
        type: 'normal',
        start: currentPos,
        end: content.length,
      });
    }

    return result;
  }, [content, commentHighlights, activeHighlightId]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        className="whitespace-pre-wrap"
        onMouseUp={handleMouseUp}
      >
        {segments.map((segment, index) => {
          if (segment.type === 'normal') {
            return <span key={index}>{segment.text}</span>;
          }

          const isActive = segment.type === 'active';
          const isHighlight = segment.type === 'highlight';

          return (
            <span
              key={index}
              onClick={() => segment.commentId && onHighlightClick?.(segment.commentId)}
              className={cn(
                'cursor-pointer transition-colors rounded-sm px-0.5 -mx-0.5',
                isActive && 'bg-accent-primary/30 ring-2 ring-accent-primary/50',
                isHighlight && 'bg-yellow-200/50 dark:bg-yellow-800/30 hover:bg-yellow-200/70 dark:hover:bg-yellow-800/50'
              )}
            >
              {segment.text}
            </span>
          );
        })}
      </div>

      {/* Selection tooltip */}
      {selectionTooltip && (
        <SelectionTooltip
          position={selectionTooltip.position}
          onAddComment={handleAddComment}
          onClose={() => setSelectionTooltip(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Helper Hook for Managing Text Selections
// ============================================================================

export function useTextSelection({
  onSelect,
}: {
  onSelect?: (selection: TextRange) => void;
} = {}) {
  const [selectedRange, setSelectedRange] = useState<TextRange | null>(null);

  const handleTextSelected = useCallback(
    (selection: TextRange) => {
      setSelectedRange(selection);
      onSelect?.(selection);
    },
    [onSelect]
  );

  const clearSelection = useCallback(() => {
    setSelectedRange(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return {
    selectedRange,
    handleTextSelected,
    clearSelection,
  };
}

// ============================================================================
// Helper Function to Build Highlights from Comments
// ============================================================================

export function buildCommentHighlights(
  comments: Array<{
    id: string;
    selectionStart?: number | null;
    selectionEnd?: number | null;
    selectedText?: string | null;
    status: 'OPEN' | 'RESOLVED';
    hiddenAt?: string | null;
  }>
): CommentHighlight[] {
  return comments
    .filter(
      (c) =>
        !c.hiddenAt &&
        c.selectionStart != null &&
        c.selectionEnd != null &&
        c.selectionStart < c.selectionEnd
    )
    .map((c) => ({
      id: c.id,
      start: c.selectionStart!,
      end: c.selectionEnd!,
      text: c.selectedText || '',
      status: c.status,
    }));
}
