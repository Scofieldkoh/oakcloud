'use client';

import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { DeadlineCategory, DeadlineStatus } from '@/generated/prisma';

interface DeadlineFiltersProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: FilterValues) => void;
  initialFilters?: FilterValues;
  initialQuery?: string;
}

export interface FilterValues {
  category?: DeadlineCategory;
  status?: DeadlineStatus[];
  assigneeId?: string;
  isInScope?: boolean;
}

const STATUS_OPTIONS: { value: DeadlineStatus; label: string }[] = [
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'DUE_SOON', label: 'Due Soon' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'WAIVED', label: 'Waived' },
];

const CATEGORY_OPTIONS: { value: DeadlineCategory; label: string }[] = [
  { value: 'CORPORATE_SECRETARY', label: 'Corporate Secretary' },
  { value: 'TAX', label: 'Tax' },
  { value: 'ACCOUNTING', label: 'Accounting' },
  { value: 'AUDIT', label: 'Audit' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'OTHER', label: 'Other' },
];

export function DeadlineFilters({
  onSearch,
  onFilterChange,
  initialFilters,
  initialQuery = '',
}: DeadlineFiltersProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(initialFilters || {});

  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.status && filters.status.length > 0 ? 1 : 0) +
    (filters.isInScope !== undefined ? 1 : 0);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const handleFilterChange = (key: keyof FilterValues, value: unknown) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  return (
    <div className="space-y-3">
      {/* Search and Filter Toggle */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 relative" role="search">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search deadlines by title, company, reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm pl-10"
            aria-label="Search deadlines"
          />
        </form>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-controls="deadline-filter-panel"
          aria-label={`${showFilters ? 'Hide' : 'Show'} filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
          className={`btn-secondary btn-sm flex items-center gap-2 ${
            activeFilterCount > 0 ? 'border-oak-primary' : ''
          }`}
        >
          <Filter className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span
              className="bg-oak-primary text-white text-2xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
              aria-hidden="true"
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div id="deadline-filter-panel" className="card animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">Filters</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="btn-ghost btn-xs flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                aria-label="Clear all filters"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Category */}
            <div>
              <label className="label">Category</label>
              <select
                value={filters.category || ''}
                onChange={(e) =>
                  handleFilterChange('category', e.target.value as DeadlineCategory)
                }
                className="input input-sm"
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="label">Status</label>
              <select
                value={
                  filters.status && filters.status.length === 1
                    ? filters.status[0]
                    : filters.status && filters.status.length === 3
                      ? 'ACTIVE'
                      : ''
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'ACTIVE') {
                    handleFilterChange('status', ['UPCOMING', 'DUE_SOON', 'IN_PROGRESS']);
                  } else if (value) {
                    handleFilterChange('status', [value as DeadlineStatus]);
                  } else {
                    handleFilterChange('status', undefined);
                  }
                }}
                className="input input-sm"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active (Not Completed)</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* In Scope */}
            <div>
              <label className="label">Scope</label>
              <select
                value={filters.isInScope === undefined ? '' : filters.isInScope.toString()}
                onChange={(e) =>
                  handleFilterChange(
                    'isInScope',
                    e.target.value === '' ? undefined : e.target.value === 'true'
                  )
                }
                className="input input-sm"
              >
                <option value="">All deadlines</option>
                <option value="true">In scope</option>
                <option value="false">Out of scope</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
