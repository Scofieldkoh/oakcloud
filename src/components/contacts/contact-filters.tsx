'use client';

import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { ContactType } from '@/generated/prisma';

interface ContactFiltersProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: FilterValues) => void;
  initialFilters?: FilterValues;
  initialQuery?: string;
}

export interface FilterValues {
  contactType?: ContactType;
}

const contactTypes: { value: ContactType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'CORPORATE', label: 'Corporate' },
];

export function ContactFilters({
  onSearch,
  onFilterChange,
  initialFilters,
  initialQuery = '',
}: ContactFiltersProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(initialFilters || {});

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    const newFilters: FilterValues = {
      ...filters,
      [key]: value ? (value as ContactType) : undefined,
    };
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
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name, email, ID number, UEN, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm pl-10"
          />
        </form>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-controls="contact-filter-panel"
          className={`btn-secondary btn-sm flex items-center gap-2 ${
            activeFilterCount > 0 ? 'border-oak-primary' : ''
          }`}
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-oak-primary text-white text-2xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div id="contact-filter-panel" className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">Filters</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="btn-ghost btn-xs flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
              >
                <X className="w-3.5 h-3.5" />
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Contact Type */}
            <div>
              <label className="label">Contact Type</label>
              <select
                value={filters.contactType || ''}
                onChange={(e) => handleFilterChange('contactType', e.target.value)}
                className="input input-sm"
              >
                <option value="">All types</option>
                {contactTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
