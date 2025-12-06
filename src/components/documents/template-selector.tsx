'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  Grid,
  List,
  ChevronRight,
  Clock,
  User,
  FolderOpen,
  Star,
  StarOff,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';

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
  viewMode?: 'grid' | 'list';
}

// Template categories with icons and colors
const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  RESOLUTION: {
    label: 'Resolution',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
  },
  CONTRACT: {
    label: 'Contract',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
  },
  LETTER: {
    label: 'Letter',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
  },
  NOTICE: {
    label: 'Notice',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
  },
  MINUTES: {
    label: 'Minutes',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950',
  },
  CERTIFICATE: {
    label: 'Certificate',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950',
  },
  OTHER: {
    label: 'Other',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-950',
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
// Template Card Component (Grid View)
// ============================================================================

interface TemplateCardProps {
  template: DocumentTemplate;
  isSelected: boolean;
  onClick: () => void;
  onPreview?: () => void;
  showPreviewButton?: boolean;
}

function TemplateCard({
  template,
  isSelected,
  onClick,
  onPreview,
  showPreviewButton = false,
}: TemplateCardProps) {
  const placeholderCount = template.placeholders?.length || 0;
  const requiredCount = template.placeholders?.filter((p) => p.required).length || 0;

  return (
    <div
      className={cn(
        'group relative p-4 border rounded-lg cursor-pointer transition-all',
        'hover:border-accent-primary hover:shadow-sm',
        isSelected
          ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
          : 'border-border-primary bg-background-elevated'
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
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center">
            <ChevronRight className="w-3 h-3 text-white" />
          </div>
        </div>
      )}

      {/* Template icon and category */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            CATEGORY_CONFIG[template.category]?.bgColor || 'bg-gray-100 dark:bg-gray-800'
          )}
        >
          <FileText
            className={cn(
              'w-5 h-5',
              CATEGORY_CONFIG[template.category]?.color || 'text-gray-600'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <CategoryBadge category={template.category} />
        </div>
      </div>

      {/* Template name and description */}
      <h3 className="font-medium text-text-primary mb-1 line-clamp-2">
        {template.name}
      </h3>
      {template.description && (
        <p className="text-sm text-text-muted line-clamp-2 mb-3">
          {template.description}
        </p>
      )}

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <FolderOpen className="w-3 h-3" />
          {placeholderCount} fields
        </span>
        {requiredCount > 0 && (
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" />
            {requiredCount} required
          </span>
        )}
      </div>

      {/* Usage count */}
      {template._count?.documents !== undefined && (
        <div className="mt-2 pt-2 border-t border-border-secondary text-xs text-text-muted">
          Used {template._count.documents} times
        </div>
      )}

      {/* Preview button */}
      {showPreviewButton && onPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className={cn(
            'absolute bottom-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100',
            'bg-background-secondary hover:bg-background-tertiary transition-all',
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
// Template Row Component (List View)
// ============================================================================

function TemplateRow({
  template,
  isSelected,
  onClick,
  onPreview,
  showPreviewButton = false,
}: TemplateCardProps) {
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
          'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
          isSelected
            ? 'border-accent-primary bg-accent-primary'
            : 'border-border-primary'
        )}
      >
        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
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
// Category Filter Component
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
          'px-3 py-1.5 text-sm rounded-full transition-colors',
          selected === null
            ? 'bg-accent-primary text-white'
            : 'bg-background-secondary text-text-muted hover:text-text-primary hover:bg-background-tertiary'
        )}
      >
        All
      </button>
      {categories.map((category) => {
        const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.OTHER;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(category)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-full transition-colors',
              selected === category
                ? cn('text-white', 'bg-accent-primary')
                : cn('hover:text-text-primary', config.bgColor, config.color)
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
  viewMode: initialViewMode = 'grid',
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);

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

      // Search filter
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-40 bg-background-secondary rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Search and View Toggle */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-border-primary rounded-lg bg-background-elevated text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-2 rounded transition-colors',
              viewMode === 'grid'
                ? 'bg-background-tertiary text-text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'
            )}
            title="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'p-2 rounded transition-colors',
              viewMode === 'list'
                ? 'bg-background-tertiary text-text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-background-secondary'
            )}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category Filter */}
      {showCategories && categories.length > 0 && (
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      {/* Templates */}
      {filteredTemplates.length === 0 ? (
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
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedTemplate?.id === template.id}
              onClick={() => handleSelect(template)}
              onPreview={onPreview ? () => onPreview(template) : undefined}
              showPreviewButton={showPreviewButton}
            />
          ))}
        </div>
      ) : (
        <div className="border border-border-primary rounded-lg overflow-hidden">
          {filteredTemplates.map((template) => (
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
      )}

      {/* Results count */}
      <div className="text-xs text-text-muted text-center">
        Showing {filteredTemplates.length} of {templates.length} templates
      </div>
    </div>
  );
}

export default TemplateSelector;
