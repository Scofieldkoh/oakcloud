'use client';

import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  /** Title shown in the header */
  title: string;
  /** Optional count to show as badge */
  count?: number;
  /** Content to show when expanded */
  children: ReactNode;
  /** Whether to start collapsed on mobile (default: true) */
  defaultCollapsedMobile?: boolean;
  /** Whether to start collapsed on desktop (default: false) */
  defaultCollapsedDesktop?: boolean;
  /** Optional class for the container */
  className?: string;
  /** Optional class for the content wrapper */
  contentClassName?: string;
}

/**
 * A collapsible section that can be expanded/collapsed.
 * Collapsed by default on mobile, expanded on desktop.
 */
export function CollapsibleSection({
  title,
  count,
  children,
  defaultCollapsedMobile = true,
  defaultCollapsedDesktop = false,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  // Determine initial state based on screen size
  // Using a simple check - could be enhanced with useIsMobile hook
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return defaultCollapsedMobile;
    return window.innerWidth < 768 ? defaultCollapsedMobile : defaultCollapsedDesktop;
  });

  return (
    <div className={cn('mb-6', className)}>
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between gap-2 py-2 text-left group"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-secondary">{title}</span>
          {count !== undefined && (
            <span className="text-xs bg-background-tertiary text-text-muted px-1.5 py-0.5 rounded">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-text-muted group-hover:text-text-secondary transition-colors">
          <span className="text-xs">{isCollapsed ? 'Show' : 'Hide'}</span>
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Content - collapsible */}
      <div
        className={cn(
          'transition-all duration-200 overflow-hidden',
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A simpler version that only collapses on mobile.
 * On desktop, the toggle button is hidden and content is always visible.
 */
export function MobileCollapsibleSection({
  title,
  count,
  children,
  defaultCollapsed = true,
  className,
  contentClassName,
}: Omit<CollapsibleSectionProps, 'defaultCollapsedMobile' | 'defaultCollapsedDesktop'> & {
  defaultCollapsed?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn('mb-6', className)}>
      {/* Mobile Header - only visible on mobile */}
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="md:hidden w-full flex items-center justify-between gap-2 py-2 text-left group"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-secondary">{title}</span>
          {count !== undefined && (
            <span className="text-xs bg-background-tertiary text-text-muted px-1.5 py-0.5 rounded">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-text-muted group-hover:text-text-secondary transition-colors">
          <span className="text-xs">{isCollapsed ? 'Show' : 'Hide'}</span>
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Content - collapsible on mobile, always visible on desktop */}
      <div
        className={cn(
          'md:block',
          // Mobile: animate collapse/expand
          isCollapsed ? 'hidden' : 'block',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
