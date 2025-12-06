'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  List,
  FileText,
  Hash,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface DocumentSection {
  id: string;
  title: string;
  anchor: string;
  level: number;
  order: number;
  pageBreakBefore?: boolean;
}

export interface SectionNavigatorProps {
  sections: DocumentSection[];
  activeSection?: string;
  onSectionClick?: (section: DocumentSection) => void;
  onScrollToSection?: (anchor: string) => void;
  className?: string;
  showPageNumbers?: boolean;
  pageNumbers?: Record<string, number>;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  sticky?: boolean;
  stickyTop?: number;
  maxHeight?: string;
}

// ============================================================================
// Section Item Component
// ============================================================================

interface SectionItemProps {
  section: DocumentSection;
  isActive: boolean;
  onClick: () => void;
  pageNumber?: number;
  depth?: number;
}

function SectionItem({
  section,
  isActive,
  onClick,
  pageNumber,
  depth = 0,
}: SectionItemProps) {
  const indentClass = depth > 0 ? `pl-${Math.min(depth * 3, 9)}` : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md transition-all',
        'flex items-start gap-2 group',
        'hover:bg-background-secondary',
        isActive
          ? 'bg-accent-primary/10 text-accent-primary font-medium'
          : 'text-text-secondary hover:text-text-primary',
        indentClass
      )}
      title={section.title}
    >
      {/* Level indicator */}
      <div
        className={cn(
          'mt-1 flex-shrink-0',
          isActive ? 'text-accent-primary' : 'text-text-muted'
        )}
      >
        {section.level === 1 ? (
          <Hash className="w-3.5 h-3.5" />
        ) : section.level === 2 ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <span className="w-3.5 h-3.5 flex items-center justify-center text-xs">
            •
          </span>
        )}
      </div>

      {/* Section title */}
      <span
        className={cn(
          'flex-1 text-sm truncate',
          section.level === 1 && 'font-medium',
          section.level === 3 && 'text-xs'
        )}
      >
        {section.title}
      </span>

      {/* Page number */}
      {pageNumber !== undefined && (
        <span
          className={cn(
            'text-xs tabular-nums flex-shrink-0',
            isActive ? 'text-accent-primary' : 'text-text-muted'
          )}
        >
          {pageNumber}
        </span>
      )}

      {/* Page break indicator */}
      {section.pageBreakBefore && (
        <span
          className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0"
          title="Page break before this section"
        >
          ↵
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Main Section Navigator Component
// ============================================================================

export function SectionNavigator({
  sections,
  activeSection,
  onSectionClick,
  onScrollToSection,
  className,
  showPageNumbers = false,
  pageNumbers = {},
  collapsible = true,
  defaultCollapsed = false,
  sticky = false,
  stickyTop = 0,
  maxHeight = '70vh',
}: SectionNavigatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [currentActive, setCurrentActive] = useState<string | null>(
    activeSection || null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Group sections by level for hierarchical display
  const sectionsByLevel = useMemo(() => {
    const grouped: Map<number, DocumentSection[]> = new Map();
    sections.forEach((section) => {
      const level = section.level || 1;
      if (!grouped.has(level)) {
        grouped.set(level, []);
      }
      grouped.get(level)!.push(section);
    });
    return grouped;
  }, [sections]);

  // Get section depth for indentation
  const getSectionDepth = useCallback(
    (section: DocumentSection): number => {
      return Math.max(0, section.level - 1);
    },
    []
  );

  // Handle section click
  const handleSectionClick = useCallback(
    (section: DocumentSection) => {
      setCurrentActive(section.anchor);
      onSectionClick?.(section);
      onScrollToSection?.(section.anchor);

      // Scroll element into view
      const element = document.getElementById(section.anchor);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [onSectionClick, onScrollToSection]
  );

  // Track scroll position to highlight active section
  useEffect(() => {
    if (!onScrollToSection) return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY + 100; // Offset for header

      // Find the current section based on scroll position
      let active: string | null = null;
      for (const section of sections) {
        const element = document.getElementById(section.anchor);
        if (element) {
          const offsetTop = element.offsetTop;
          if (scrollPosition >= offsetTop) {
            active = section.anchor;
          }
        }
      }

      if (active && active !== currentActive) {
        setCurrentActive(active);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections, currentActive, onScrollToSection]);

  // Sync with external activeSection prop
  useEffect(() => {
    if (activeSection && activeSection !== currentActive) {
      setCurrentActive(activeSection);
    }
  }, [activeSection, currentActive]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-background-secondary border border-border-primary rounded-lg overflow-hidden',
        sticky && 'sticky',
        className
      )}
      style={sticky ? { top: stickyTop } : undefined}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-3 border-b border-border-secondary',
          collapsible && 'cursor-pointer hover:bg-background-tertiary'
        )}
        onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={(e) => {
          if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            Contents
          </span>
          <span className="text-xs text-text-muted">
            ({sections.length} sections)
          </span>
        </div>

        {collapsible && (
          <ChevronDown
            className={cn(
              'w-4 h-4 text-text-muted transition-transform',
              isCollapsed && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Sections list */}
      {!isCollapsed && (
        <div
          className="p-2 overflow-y-auto"
          style={{ maxHeight }}
        >
          <nav aria-label="Document sections">
            {sections
              .sort((a, b) => a.order - b.order)
              .map((section) => (
                <SectionItem
                  key={section.id}
                  section={section}
                  isActive={currentActive === section.anchor}
                  onClick={() => handleSectionClick(section)}
                  pageNumber={showPageNumbers ? pageNumbers[section.anchor] : undefined}
                  depth={getSectionDepth(section)}
                />
              ))}
          </nav>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Floating Section Navigator (for overlay/modal use)
// ============================================================================

interface FloatingSectionNavigatorProps extends SectionNavigatorProps {
  isVisible: boolean;
  onToggle: () => void;
  position?: 'left' | 'right';
}

export function FloatingSectionNavigator({
  isVisible,
  onToggle,
  position = 'right',
  ...props
}: FloatingSectionNavigatorProps) {
  return (
    <>
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'fixed z-40 p-2 rounded-full shadow-lg transition-all',
          'bg-background-elevated border border-border-primary',
          'hover:bg-background-tertiary',
          'text-text-muted hover:text-text-primary',
          position === 'right' ? 'right-4' : 'left-4',
          'bottom-20'
        )}
        title={isVisible ? 'Hide navigation' : 'Show navigation'}
      >
        {isVisible ? (
          <EyeOff className="w-5 h-5" />
        ) : (
          <Eye className="w-5 h-5" />
        )}
      </button>

      {/* Navigation panel */}
      <div
        className={cn(
          'fixed z-30 w-72 transition-all duration-300',
          position === 'right' ? 'right-4' : 'left-4',
          'bottom-32 max-h-[60vh]',
          isVisible
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        <SectionNavigator {...props} sticky={false} maxHeight="50vh" />
      </div>
    </>
  );
}

// ============================================================================
// Mini Section Navigator (compact horizontal version)
// ============================================================================

interface MiniSectionNavigatorProps {
  sections: DocumentSection[];
  activeSection?: string;
  onSectionClick?: (section: DocumentSection) => void;
  className?: string;
}

export function MiniSectionNavigator({
  sections,
  activeSection,
  onSectionClick,
  className,
}: MiniSectionNavigatorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only show top-level sections
  const topLevelSections = useMemo(() => {
    return sections.filter((s) => s.level === 1);
  }, [sections]);

  if (topLevelSections.length === 0) {
    return null;
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin',
        className
      )}
    >
      {topLevelSections.map((section, index) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSectionClick?.(section)}
          className={cn(
            'px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors',
            activeSection === section.anchor
              ? 'bg-accent-primary text-white'
              : 'bg-background-secondary text-text-muted hover:text-text-primary hover:bg-background-tertiary'
          )}
        >
          <span className="text-xs opacity-60 mr-1">{index + 1}.</span>
          {section.title}
        </button>
      ))}
    </div>
  );
}

export default SectionNavigator;
