'use client';

import { Search, Filter, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { CompanyStatus, EntityType } from '@prisma/client';
import { ENTITY_TYPES } from '@/lib/constants';

interface CompanyFiltersProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: FilterValues) => void;
  initialFilters?: FilterValues;
  initialQuery?: string;
}

export interface FilterValues {
  entityType?: EntityType;
  status?: CompanyStatus;
  hasCharges?: boolean;
  financialYearEndMonth?: number;
}

const statuses: { value: CompanyStatus; label: string }[] = [
  { value: 'LIVE', label: 'Live' },
  { value: 'STRUCK_OFF', label: 'Struck Off' },
  { value: 'WINDING_UP', label: 'Winding Up' },
  { value: 'DISSOLVED', label: 'Dissolved' },
  { value: 'IN_LIQUIDATION', label: 'In Liquidation' },
  { value: 'IN_RECEIVERSHIP', label: 'In Receivership' },
];

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export function CompanyFilters({ onSearch, onFilterChange, initialFilters, initialQuery = '' }: CompanyFiltersProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterValues>(initialFilters || {});

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

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
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name, UEN, SSIC, officer, shareholder, address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm pl-10"
          />
        </form>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-controls="company-filter-panel"
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
        <div id="company-filter-panel" className="card p-4 animate-fade-in">
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
            {/* Entity Type */}
            <div>
              <label className="label">Entity Type</label>
              <select
                value={filters.entityType || ''}
                onChange={(e) =>
                  handleFilterChange('entityType', e.target.value as EntityType)
                }
                className="input input-sm"
              >
                <option value="">All types</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="label">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) =>
                  handleFilterChange('status', e.target.value as CompanyStatus)
                }
                className="input input-sm"
              >
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Year End */}
            <div>
              <label className="label">FYE Month</label>
              <select
                value={filters.financialYearEndMonth || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'financialYearEndMonth',
                    e.target.value ? parseInt(e.target.value) : undefined
                  )
                }
                className="input input-sm"
              >
                <option value="">All months</option>
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Has Charges */}
            <div>
              <label className="label">Charges</label>
              <select
                value={filters.hasCharges === undefined ? '' : filters.hasCharges.toString()}
                onChange={(e) =>
                  handleFilterChange(
                    'hasCharges',
                    e.target.value === '' ? undefined : e.target.value === 'true'
                  )
                }
                className="input input-sm"
              >
                <option value="">All companies</option>
                <option value="true">With charges</option>
                <option value="false">Without charges</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
