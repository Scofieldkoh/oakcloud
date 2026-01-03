'use client';

import { Search, Calendar, Eye, Copy, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import type { DuplicateStatus } from '@/generated/prisma';
import { SearchableSelect } from '@/components/ui/searchable-select';

export interface ProcessingToolbarProps {
  search: string;
  onSearchChange: (query: string) => void;
  quickFilters: {
    needsReview?: boolean;
    uploadDatePreset?: 'TODAY';
    duplicateStatus?: DuplicateStatus;
  };
  onQuickFilterChange: (filters: {
    needsReview?: boolean;
    uploadDatePreset?: 'TODAY' | undefined;
    duplicateStatus?: DuplicateStatus | undefined;
  }) => void;
  companies: Array<{ id: string; name: string }>;
  selectedCompanyId?: string;
  onCompanyChange: (companyId?: string) => void;
  tags?: Array<{ id: string; name: string; color: string | null }>;
  selectedTagIds?: string[];
  onTagsChange?: (tagIds: string[]) => void;
  onAdjustColumns: () => void;
  hiddenColumnCount: number;
}

export function ProcessingToolbar({
  search,
  onSearchChange,
  quickFilters,
  onQuickFilterChange,
  companies,
  selectedCompanyId,
  onCompanyChange,
  tags = [],
  selectedTagIds = [],
  onTagsChange,
  onAdjustColumns,
  hiddenColumnCount,
}: ProcessingToolbarProps) {
  const [searchValue, setSearchValue] = useState(search);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    // Debounce search
    const timeoutId = setTimeout(() => {
      onSearchChange(value);
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  const toggleQuickFilter = (key: 'needsReview' | 'uploadDatePreset' | 'duplicateStatus', value: boolean | 'TODAY' | DuplicateStatus) => {
    const currentValue = quickFilters[key];
    onQuickFilterChange({
      [key]: currentValue === value ? undefined : value,
    });
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-background-secondary border border-border-primary rounded-lg">
      {/* Search Input */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by file name, vendor, document number..."
          className="w-full pl-10 pr-10 py-2 text-sm bg-background-primary border border-border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-oak-primary/50"
        />
        {searchValue && (
          <button
            onClick={() => {
              setSearchValue('');
              onSearchChange('');
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-background-tertiary rounded"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        )}
      </div>

      {/* Quick Filter Buttons */}
      <div className="flex items-center gap-2">
        {/* Upload Date: Today */}
        <button
          onClick={() => toggleQuickFilter('uploadDatePreset', 'TODAY')}
          className={`btn-sm flex items-center gap-1.5 ${
            quickFilters.uploadDatePreset === 'TODAY'
              ? 'bg-oak-primary text-white'
              : 'btn-ghost'
          }`}
          title="Uploaded today"
        >
          <Calendar className="w-4 h-4" />
          <span className="hidden lg:inline">Today</span>
        </button>

        {/* Needs Review */}
        <button
          onClick={() => toggleQuickFilter('needsReview', true)}
          className={`btn-sm flex items-center gap-1.5 ${
            quickFilters.needsReview
              ? 'bg-oak-primary text-white'
              : 'btn-ghost'
          }`}
          title="Needs review"
        >
          <Eye className="w-4 h-4" />
          <span className="hidden lg:inline">Review</span>
        </button>

        {/* Duplicates */}
        <button
          onClick={() => toggleQuickFilter('duplicateStatus', 'SUSPECTED')}
          className={`btn-sm flex items-center gap-1.5 ${
            quickFilters.duplicateStatus === 'SUSPECTED'
              ? 'bg-oak-primary text-white'
              : 'btn-ghost'
          }`}
          title="Show duplicates"
        >
          <Copy className="w-4 h-4" />
          <span className="hidden lg:inline">Duplicates</span>
        </button>
      </div>

      {/* Company Filter */}
      {companies.length > 0 && (
        <div className="w-48">
          <SearchableSelect
            options={[
              { value: '', label: 'All Companies' },
              ...companies.map(c => ({ value: c.id, label: c.name }))
            ]}
            value={selectedCompanyId || ''}
            onChange={(value) => onCompanyChange(value || undefined)}
            placeholder="Company"
            className="text-sm"
          />
        </div>
      )}

      {/* Tags Filter */}
      {tags.length > 0 && onTagsChange && (
        <div className="w-48">
          <SearchableSelect
            options={tags.map(t => ({ value: t.id, label: t.name }))}
            value={selectedTagIds.length === 1 ? selectedTagIds[0] : ''}
            onChange={(value) => onTagsChange(value ? [value] : [])}
            placeholder="Tags"
            className="text-sm"
          />
        </div>
      )}

      {/* Adjust Columns Button */}
      <button
        type="button"
        onClick={onAdjustColumns}
        className="btn-secondary btn-sm flex items-center gap-2"
        title="Adjust columns"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span className="hidden xl:inline">Columns</span>
        {hiddenColumnCount > 0 && (
          <span className="bg-background-tertiary text-text-secondary text-2xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
            {hiddenColumnCount}
          </span>
        )}
      </button>
    </div>
  );
}
