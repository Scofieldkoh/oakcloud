'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  List,
  ChevronRight,
  ChevronDown,
  FileText,
  AlignLeft,
  Hash,
  Minus,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface DocumentSection {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  element?: HTMLElement;
  children?: DocumentSection[];
}

export interface SectionNavigationProps {
  /**
   * Document content to parse for sections (HTML string)
   */
  content?: string;
  /**
   * Container element to find headings in (alternative to content)
   */
  containerRef?: React.RefObject<HTMLElement>;
  /**
   * Manually provided sections (overrides parsing)
   */
  sections?: DocumentSection[];
  /**
   * Currently active section ID
   */
  activeId?: string;
  /**
   * Callback when a section is clicked
   */
  onSectionClick?: (section: DocumentSection) => void;
  /**
   * Show section numbers (1.1, 1.2, etc.)
   */
  showNumbers?: boolean;
  /**
   * Collapsible nested sections
   */
  collapsible?: boolean;
  /**
   * Maximum heading level to include (1-6)
   */
  maxLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Title for the navigation
   */
  title?: string;
  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================================
// Section Parser
// ============================================================================

function parseContentSections(
  content: string,
  maxLevel: number = 6
): DocumentSection[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');

  const sections: DocumentSection[] = [];
  let idCounter = 0;

  headings.forEach((heading) => {
    const level = parseInt(heading.tagName.charAt(1)) as 1 | 2 | 3 | 4 | 5 | 6;
    if (level > maxLevel) return;

    const title = heading.textContent?.trim() || `Section ${idCounter + 1}`;
    const id = heading.id || `section-${idCounter}`;
    idCounter++;

    sections.push({
      id,
      title,
      level,
    });
  });

  return sections;
}

function parseContainerSections(
  container: HTMLElement,
  maxLevel: number = 6
): DocumentSection[] {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

  const sections: DocumentSection[] = [];
  let idCounter = 0;

  headings.forEach((heading) => {
    const level = parseInt(heading.tagName.charAt(1)) as 1 | 2 | 3 | 4 | 5 | 6;
    if (level > maxLevel) return;

    const title = heading.textContent?.trim() || `Section ${idCounter + 1}`;

    // Ensure heading has an ID for scrolling
    if (!heading.id) {
      heading.id = `section-${idCounter}`;
    }

    sections.push({
      id: heading.id,
      title,
      level,
      element: heading as HTMLElement,
    });

    idCounter++;
  });

  return sections;
}

function buildSectionTree(sections: DocumentSection[]): DocumentSection[] {
  const result: DocumentSection[] = [];
  const stack: DocumentSection[] = [];

  sections.forEach((section) => {
    const newSection = { ...section, children: [] };

    // Pop stack until we find a parent with a lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(newSection);
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.children) parent.children = [];
      parent.children.push(newSection);
    }

    stack.push(newSection);
  });

  return result;
}

function generateSectionNumbers(sections: DocumentSection[], prefix: string = ''): Map<string, string> {
  const numbers = new Map<string, string>();

  sections.forEach((section, index) => {
    const number = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
    numbers.set(section.id, number);

    if (section.children) {
      const childNumbers = generateSectionNumbers(section.children, number);
      childNumbers.forEach((v, k) => numbers.set(k, v));
    }
  });

  return numbers;
}

// ============================================================================
// Section Item Component
// ============================================================================

interface SectionItemProps {
  section: DocumentSection;
  isActive: boolean;
  onClick: () => void;
  showNumber?: string;
  collapsible: boolean;
  depth: number;
}

function SectionItem({
  section,
  isActive,
  onClick,
  showNumber,
  collapsible,
  depth,
}: SectionItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;

  const handleClick = () => {
    onClick();
    if (collapsible && hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const paddingLeft = depth * 12;

  return (
    <div>
      <button
        onClick={handleClick}
        className={`
          w-full flex items-center gap-2 py-1.5 px-2 rounded text-left transition-colors
          ${isActive ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'}
        `}
        style={{ paddingLeft: `${paddingLeft + 8}px` }}
      >
        {/* Expand/Collapse Icon */}
        {collapsible && hasChildren ? (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        ) : (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            <Minus className="w-2 h-2 text-text-tertiary" />
          </span>
        )}

        {/* Section Number */}
        {showNumber && (
          <span className="text-2xs text-text-tertiary font-mono shrink-0">
            {showNumber}
          </span>
        )}

        {/* Section Title */}
        <span className={`text-sm truncate ${isActive ? 'font-medium' : ''}`}>
          {section.title}
        </span>
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {section.children!.map((child) => (
            <SectionItem
              key={child.id}
              section={child}
              isActive={false}
              onClick={() => {}}
              showNumber={undefined}
              collapsible={collapsible}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SectionNavigation({
  content,
  containerRef,
  sections: providedSections,
  activeId,
  onSectionClick,
  showNumbers = true,
  collapsible = true,
  maxLevel = 3,
  title = 'Contents',
  className = '',
}: SectionNavigationProps) {
  const [internalActiveId, setInternalActiveId] = useState<string | undefined>(activeId);

  // Parse sections from content or container
  const flatSections = useMemo(() => {
    if (providedSections) return providedSections;
    if (content) return parseContentSections(content, maxLevel);
    if (containerRef?.current) return parseContainerSections(containerRef.current, maxLevel);
    return [];
  }, [providedSections, content, containerRef, maxLevel]);

  // Build tree structure
  const sectionTree = useMemo(() => buildSectionTree(flatSections), [flatSections]);

  // Generate numbers
  const sectionNumbers = useMemo(
    () => (showNumbers ? generateSectionNumbers(sectionTree) : new Map()),
    [sectionTree, showNumbers]
  );

  // Handle scroll spy
  useEffect(() => {
    if (!containerRef?.current || flatSections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInternalActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0px -80% 0px',
        threshold: 0,
      }
    );

    flatSections.forEach((section) => {
      if (section.element) {
        observer.observe(section.element);
      }
    });

    return () => observer.disconnect();
  }, [containerRef, flatSections]);

  // Handle section click
  const handleSectionClick = useCallback(
    (section: DocumentSection) => {
      setInternalActiveId(section.id);

      // Scroll to element if available
      if (section.element) {
        section.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const element = document.getElementById(section.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      onSectionClick?.(section);
    },
    [onSectionClick]
  );

  // Render flat list for simple navigation
  const renderFlatList = () => (
    <div className="space-y-0.5">
      {flatSections.map((section) => (
        <button
          key={section.id}
          onClick={() => handleSectionClick(section)}
          className={`
            w-full flex items-center gap-2 py-1.5 px-2 rounded text-left transition-colors
            ${
              internalActiveId === section.id
                ? 'bg-accent-primary/10 text-accent-primary font-medium'
                : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'
            }
          `}
          style={{ paddingLeft: `${(section.level - 1) * 12 + 8}px` }}
        >
          {showNumbers && sectionNumbers.has(section.id) && (
            <span className="text-2xs text-text-tertiary font-mono shrink-0">
              {sectionNumbers.get(section.id)}
            </span>
          )}
          <span className="text-sm truncate">{section.title}</span>
        </button>
      ))}
    </div>
  );

  if (flatSections.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 px-2 mb-3">
          <List className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{title}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <AlignLeft className="w-8 h-8 text-text-tertiary mb-2" />
          <p className="text-xs text-text-muted">No sections found</p>
          <p className="text-2xs text-text-tertiary mt-1">
            Add headings to your document to enable navigation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 mb-3">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-text-muted" />
          <span className="text-sm font-medium text-text-primary">{title}</span>
        </div>
        <span className="text-2xs text-text-tertiary">{flatSections.length} sections</span>
      </div>

      {/* Section List */}
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">{renderFlatList()}</div>
    </div>
  );
}

// ============================================================================
// Sidebar Wrapper
// ============================================================================

export interface SectionNavigationSidebarProps extends SectionNavigationProps {
  isOpen?: boolean;
  onClose?: () => void;
  position?: 'left' | 'right';
  width?: string;
}

export function SectionNavigationSidebar({
  isOpen = true,
  onClose,
  position = 'right',
  width = '240px',
  ...props
}: SectionNavigationSidebarProps) {
  if (!isOpen) return null;

  return (
    <aside
      className={`
        shrink-0 bg-background-elevated border-border-primary overflow-hidden
        ${position === 'left' ? 'border-r' : 'border-l'}
      `}
      style={{ width }}
    >
      <div className="p-4">
        <SectionNavigation {...props} />
      </div>
    </aside>
  );
}

export default SectionNavigation;
