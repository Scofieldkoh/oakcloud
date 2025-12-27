'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Search,
  FolderOpen,
  Clock,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/companies/pagination';

// ============================================================================
// Types
// ============================================================================

export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  content: string;
  placeholders: Array<{
    key: string;
    label: string;
    category: string;
    type: string;
    required: boolean;
  }>;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    firstName: string;
    lastName: string;
  };
  _count?: {
    documents: number;
  };
}

export interface TemplateSelectorProps {
  templates: DocumentTemplate[];
  selectedTemplate?: DocumentTemplate | null;
  onSelect: (template: DocumentTemplate) => void;
  onPreview?: (template: DocumentTemplate) => void;
  isLoading?: boolean;
  className?: string;
  showCategories?: boolean;
  showPreviewButton?: boolean;
}

// Template categories with icons and colors
const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; selectedColor: string }
> = {
  RESOLUTION: {
    label: 'Resolution',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    selectedColor: 'bg-blue-600 dark:bg-blue-500 text-white',
  },
  CONTRACT: {
    label: 'Contract',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    selectedColor: 'bg-purple-600 dark:bg-purple-500 text-white',
  },
  LETTER: {
    label: 'Letter',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
    selectedColor: 'bg-green-600 dark:bg-green-500 text-white',
  },
  NOTICE: {
    label: 'Notice',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    selectedColor: 'bg-amber-600 dark:bg-amber-500 text-white',
  },
  MINUTES: {
    label: 'Minutes',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950',
    selectedColor: 'bg-cyan-600 dark:bg-cyan-500 text-white',
  },
  CERTIFICATE: {
    label: 'Certificate',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950',
    selectedColor: 'bg-rose-600 dark:bg-rose-500 text-white',
  },
  OTHER: {
    label: 'Other',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-950',
    selectedColor: 'bg-gray-600 dark:bg-gray-500 text-white',
  },
};

// ============================================================================
// Category Badge Component
// ============================================================================

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.OTHER;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.color,
        config.bgColor
      )}
    >
      {config.label}
    </span>
  );
}

// ============================================================================
// Template Row Component (List View)
// ============================================================================

interface TemplateRowProps {
  template: DocumentTemplate;
  isSelected: boolean;
  onClick: () => void;
  onPreview?: () => void;
  showPreviewButton?: boolean;
}

function TemplateRow({
  template,
  isSelected,
  onClick,
  onPreview,
  showPreviewButton = false,
}: TemplateRowProps) {
  const placeholderCount = template.placeholders?.length || 0;

  return (
    <div
      className={cn(
        'group flex items-center gap-4 p-3 border-b border-border-secondary cursor-pointer transition-all',
        'hover:bg-background-secondary',
        isSelected && 'bg-accent-primary/5'
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
          isSelected
            ? 'border-oak-primary bg-oak-primary'
            : 'border-gray-400 dark:border-gray-500'
        )}
      >
        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
      </div>

      {/* Icon */}
      <div
        className={cn(
          'w-8 h-8 rounded flex items-center justify-center flex-shrink-0',
          CATEGORY_CONFIG[template.category]?.bgColor || 'bg-gray-100 dark:bg-gray-800'
        )}
      >
        <FileText
          className={cn(
            'w-4 h-4',
            CATEGORY_CONFIG[template.category]?.color || 'text-gray-600'
          )}
        />
      </div>

      {/* Template info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">
            {template.name}
          </span>
          <CategoryBadge category={template.category} />
        </div>
        {template.description && (
          <p className="text-sm text-text-muted truncate">{template.description}</p>
        )}
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-4 text-xs text-text-muted flex-shrink-0">
        <span className="flex items-center gap-1">
          <FolderOpen className="w-3 h-3" />
          {placeholderCount}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          v{template.version}
        </span>
      </div>

      {/* Preview button */}
      {showPreviewButton && onPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className={cn(
            'p-1.5 rounded opacity-0 group-hover:opacity-100',
            'bg-background-tertiary hover:bg-background-elevated transition-all',
            'text-text-muted hover:text-text-primary'
          )}
          title="Preview template"
        >
          <Eye className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Category Filter Component (Fixed colors for light mode)
// ============================================================================

interface CategoryFilterProps {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
}

function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'px-3 py-1.5 text-sm rounded-full transition-colors font-medium',
          selected === null
            ? 'bg-oak-primary text-white'
            : 'bg-background-tertiary text-text-secondary hover:text-text-primary hover:bg-background-elevated border border-border-primary'
        )}
      >
        All
      </button>
      {categories.map((category) => {
        const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.OTHER;
        const isSelected = selected === category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(category)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-full transition-colors font-medium border',
              isSelected
                ? config.selectedColor + ' border-transparent'
                : cn(config.bgColor, config.color, 'hover:opacity-80 border-transparent')
            )}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Template Selector Component
// ============================================================================

export function TemplateSelector({
  templates,
  selectedTemplate,
  onSelect,
  onPreview,
  isLoading = false,
  className,
  showCategories = true,
  showPreviewButton = true,
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Get unique categories from templates
  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category));
    return Array.from(cats).sort();
  }, [templates]);

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Category filter
      if (selectedCategory && template.category !== selectedCategory) {
        return false;
      }

      // Search filter (searches name AND description)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = template.name.toLowerCase().includes(query);
        const matchesDescription = template.description?.toLowerCase().includes(query);
        const matchesCategory = template.category.toLowerCase().includes(query);
        return matchesName || matchesDescription || matchesCategory;
      }

      return true;
    });
  }, [templates, selectedCategory, searchQuery]);

  // Paginated templates
  const paginatedTemplates = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filteredTemplates.slice(startIndex, startIndex + limit);
  }, [filteredTemplates, page, limit]);

  const totalPages = Math.ceil(filteredTemplates.length / limit);

  // Reset to page 1 when filters change
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category);
    setPage(1);
  }, []);

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  const handleSelect = useCallback(
    (template: DocumentTemplate) => {
      onSelect(template);
    },
    [onSelect]
  );

  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <div className="flex items-center gap-4">
          <div className="h-10 w-64 bg-background-secondary rounded animate-pulse" />
          <div className="h-10 w-32 bg-background-secondary rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 bg-background-secondary rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search templates by name or description..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
          />
        </div>
      </div>

      {/* Category Filter */}
      {showCategories && categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={handleCategoryChange}
        />
      )}

      {/* Templates List */}
      {paginatedTemplates.length === 0 ? (
        <div className="py-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-text-muted opacity-50 mb-3" />
          <p className="text-text-muted">
            {searchQuery || selectedCategory
              ? 'No templates match your search criteria'
              : 'No templates available'}
          </p>
          {(searchQuery || selectedCategory) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
              className="mt-2 text-sm text-accent-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="border border-border-primary rounded-lg overflow-hidden">
            {paginatedTemplates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                isSelected={selectedTemplate?.id === template.id}
                onClick={() => handleSelect(template)}
                onPreview={onPreview ? () => onPreview(template) : undefined}
                showPreviewButton={showPreviewButton}
              />
            ))}
          </div>

          {/* Pagination */}
          {filteredTemplates.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filteredTemplates.length}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={handleLimitChange}
            />
          )}
        </>
      )}
    </div>
  );
}

export default TemplateSelector;
