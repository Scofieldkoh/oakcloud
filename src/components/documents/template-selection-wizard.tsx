'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  ChevronRight,
  Check,
  Filter,
  X,
  Loader2,
  FileSignature,
  ScrollText,
  Mail,
  BookOpen,
  Bell,
  Award,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';

// ============================================================================
// Types
// ============================================================================

export type TemplateCategory =
  | 'RESOLUTION'
  | 'CONTRACT'
  | 'LETTER'
  | 'MINUTES'
  | 'NOTICE'
  | 'CERTIFICATE'
  | 'OTHER';

export interface TemplateOption {
  id: string;
  name: string;
  description?: string | null;
  category: TemplateCategory;
  version: number;
  placeholders: PlaceholderDefinition[];
  updatedAt: string;
}

export interface PlaceholderDefinition {
  key: string;
  label: string;
  category: 'company' | 'contacts' | 'directors' | 'shareholders' | 'custom';
  required?: boolean;
}

export interface TemplateSelectionWizardProps {
  templates: TemplateOption[];
  isLoading?: boolean;
  onSelect: (template: TemplateOption) => void;
  onCancel?: () => void;
  selectedId?: string;
  showCategoryFilter?: boolean;
  showSearch?: boolean;
  className?: string;
}

// ============================================================================
// Category Config
// ============================================================================

const CATEGORY_CONFIG: Record<
  TemplateCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  RESOLUTION: {
    label: 'Resolution',
    icon: FileSignature,
    color: 'text-blue-500 bg-blue-500/10',
  },
  CONTRACT: {
    label: 'Contract',
    icon: ScrollText,
    color: 'text-purple-500 bg-purple-500/10',
  },
  LETTER: {
    label: 'Letter',
    icon: Mail,
    color: 'text-green-500 bg-green-500/10',
  },
  MINUTES: {
    label: 'Minutes',
    icon: BookOpen,
    color: 'text-amber-500 bg-amber-500/10',
  },
  NOTICE: {
    label: 'Notice',
    icon: Bell,
    color: 'text-red-500 bg-red-500/10',
  },
  CERTIFICATE: {
    label: 'Certificate',
    icon: Award,
    color: 'text-teal-500 bg-teal-500/10',
  },
  OTHER: {
    label: 'Other',
    icon: MoreHorizontal,
    color: 'text-gray-500 bg-gray-500/10',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export function TemplateSelectionWizard({
  templates,
  isLoading = false,
  onSelect,
  onCancel,
  selectedId,
  showCategoryFilter = true,
  showSearch = true,
  className = '',
}: TemplateSelectionWizardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'ALL'>('ALL');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Get unique categories from templates
  const availableCategories = useMemo(() => {
    const categories = new Set(templates.map((t) => t.category));
    return Array.from(categories).sort();
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Category filter
      if (selectedCategory !== 'ALL' && template.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          template.name.toLowerCase().includes(query) ||
          template.description?.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [templates, selectedCategory, searchQuery]);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    if (selectedCategory !== 'ALL') {
      return { [selectedCategory]: filteredTemplates };
    }

    return filteredTemplates.reduce(
      (acc, template) => {
        if (!acc[template.category]) {
          acc[template.category] = [];
        }
        acc[template.category].push(template);
        return acc;
      },
      {} as Record<TemplateCategory, TemplateOption[]>
    );
  }, [filteredTemplates, selectedCategory]);

  const handleSelect = (template: TemplateOption) => {
    onSelect(template);
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
          <p className="text-text-muted text-sm">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Select Template</h2>
          <p className="text-sm text-text-muted mt-0.5">
            Choose a template to generate your document
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Search & Filter Bar */}
      {(showSearch || showCategoryFilter) && (
        <div className="flex items-center gap-3 mb-4">
          {showSearch && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {showCategoryFilter && (
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 text-text-muted mr-1" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as TemplateCategory | 'ALL')}
                className="px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_CONFIG[category].label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Template List */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="w-12 h-12 text-text-tertiary mb-3" />
            <p className="text-text-muted text-sm">No templates found</p>
            {searchQuery && (
              <p className="text-text-tertiary text-xs mt-1">
                Try adjusting your search or filter
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
              <div key={category}>
                {/* Category Header */}
                {selectedCategory === 'ALL' && (
                  <div className="flex items-center gap-2 mb-3">
                    {(() => {
                      const config = CATEGORY_CONFIG[category as TemplateCategory];
                      const Icon = config.icon;
                      return (
                        <>
                          <div className={`p-1.5 rounded ${config.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <h3 className="text-sm font-medium text-text-primary">
                            {config.label}
                          </h3>
                          <span className="text-xs text-text-muted">
                            ({categoryTemplates.length})
                          </span>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Template Cards */}
                <div className="grid gap-2">
                  {categoryTemplates.map((template) => {
                    const isSelected = selectedId === template.id;
                    const isHovered = hoveredId === template.id;
                    const config = CATEGORY_CONFIG[template.category];
                    const Icon = config.icon;

                    return (
                      <button
                        key={template.id}
                        onClick={() => handleSelect(template)}
                        onMouseEnter={() => setHoveredId(template.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={`
                          w-full text-left p-3 rounded-lg border transition-all
                          ${
                            isSelected
                              ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
                              : isHovered
                                ? 'border-border-secondary bg-background-secondary'
                                : 'border-border-primary bg-background-elevated hover:border-border-secondary'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-text-primary truncate">
                                {template.name}
                              </h4>
                              <span className="text-2xs text-text-tertiary shrink-0">
                                v{template.version}
                              </span>
                            </div>
                            {template.description && (
                              <p className="text-sm text-text-muted mt-0.5 line-clamp-2">
                                {template.description}
                              </p>
                            )}
                            {/* Placeholder count */}
                            {template.placeholders.length > 0 && (
                              <div className="flex items-center gap-1 mt-2">
                                <span className="text-2xs text-text-tertiary">
                                  {template.placeholders.length} placeholder
                                  {template.placeholders.length !== 1 ? 's' : ''}
                                </span>
                                <span className="text-text-tertiary">·</span>
                                <span className="text-2xs text-text-tertiary">
                                  {
                                    template.placeholders.filter((p) => p.required).length
                                  }{' '}
                                  required
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Selection indicator */}
                          <div className="shrink-0">
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            ) : (
                              <ChevronRight
                                className={`w-5 h-5 transition-colors ${
                                  isHovered ? 'text-text-primary' : 'text-text-tertiary'
                                }`}
                              />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="pt-4 mt-4 border-t border-border-primary flex items-center justify-between text-xs text-text-muted">
        <span>
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
        </span>
        {selectedId && (
          <span className="text-accent-primary font-medium">1 selected</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Compact Variant (for inline use)
// ============================================================================

export interface TemplateSelectDropdownProps {
  templates: TemplateOption[];
  value?: string;
  onChange: (templateId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TemplateSelectDropdown({
  templates,
  value,
  onChange,
  placeholder = 'Select template...',
  disabled = false,
  className = '',
}: TemplateSelectDropdownProps) {
  const selectedTemplate = templates.find((t) => t.id === value);

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`
        w-full px-3 py-2 text-sm border border-border-primary rounded-md
        bg-background-primary text-text-primary
        focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <option value="">{placeholder}</option>
      {Object.entries(
        templates.reduce(
          (acc, t) => {
            if (!acc[t.category]) acc[t.category] = [];
            acc[t.category].push(t);
            return acc;
          },
          {} as Record<TemplateCategory, TemplateOption[]>
        )
      ).map(([category, categoryTemplates]) => (
        <optgroup key={category} label={CATEGORY_CONFIG[category as TemplateCategory].label}>
          {categoryTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} (v{template.version})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default TemplateSelectionWizard;
