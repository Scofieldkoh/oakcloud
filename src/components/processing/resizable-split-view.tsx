'use client';

import { useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResizableSplitViewProps {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  defaultLeftWidth?: number; // percentage (0-100)
  minLeftWidth?: number; // percentage
  maxLeftWidth?: number; // percentage
  className?: string;
  leftPanelClassName?: string;
  rightPanelClassName?: string;
}

/**
 * ResizableSplitView - A draggable split panel layout
 *
 * Features:
 * - Drag handle to resize panels
 * - Min/max width constraints
 * - Keyboard accessibility
 * - Mobile responsive (stacks vertically)
 */
export function ResizableSplitView({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 50,
  minLeftWidth = 30,
  maxLeftWidth = 70,
  className,
  leftPanelClassName,
  rightPanelClassName,
}: ResizableSplitViewProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Clamp to min/max
      const clampedWidth = Math.min(Math.max(newLeftWidth, minLeftWidth), maxLeftWidth);
      setLeftWidth(clampedWidth);
    },
    [isDragging, minLeftWidth, maxLeftWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle keyboard resize
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 2; // 2% per key press
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLeftWidth((prev) => Math.max(prev - step, minLeftWidth));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLeftWidth((prev) => Math.min(prev + step, maxLeftWidth));
      }
    },
    [minLeftWidth, maxLeftWidth]
  );

  // Global mouse events for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col md:flex-row h-full w-full',
        isDragging && 'select-none',
        className
      )}
    >
      {/* Left Panel */}
      <div
        className={cn(
          'flex-shrink-0 overflow-auto',
          'md:h-full h-1/2',
          leftPanelClassName
        )}
        style={{
          width: `${leftWidth}%`,
        }}
      >
        {leftPanel}
      </div>

      {/* Resize Handle */}
      <div
        role="separator"
        aria-valuenow={leftWidth}
        aria-valuemin={minLeftWidth}
        aria-valuemax={maxLeftWidth}
        aria-label="Resize panels"
        tabIndex={0}
        className={cn(
          'hidden md:flex items-center justify-center',
          'w-2 bg-background-tertiary border-x border-border-primary',
          'cursor-col-resize hover:bg-oak-primary/10 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-inset',
          isDragging && 'bg-oak-primary/20'
        )}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        <GripVertical className="w-3 h-3 text-text-muted" />
      </div>

      {/* Right Panel */}
      <div
        className={cn(
          'flex-1 overflow-auto',
          'md:h-full h-1/2',
          rightPanelClassName
        )}
      >
        {rightPanel}
      </div>
    </div>
  );
}

/**
 * SplitViewHandle - Standalone resize handle for custom layouts
 */
export function SplitViewHandle({
  onResize,
  className,
}: {
  onResize: (delta: number) => void;
  className?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      startXRef.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, onResize]);

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        'w-2 bg-background-tertiary border-x border-border-primary',
        'cursor-col-resize hover:bg-oak-primary/10 transition-colors',
        isDragging && 'bg-oak-primary/20',
        className
      )}
      onMouseDown={handleMouseDown}
    >
      <GripVertical className="w-3 h-3 text-text-muted" />
    </div>
  );
}
