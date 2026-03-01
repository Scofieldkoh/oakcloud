'use client';

import { useState } from 'react';
import { Search, Filter, X, ChevronDown } from 'lucide-react';
import type { WorkflowProjectStatus } from '@/hooks/use-workflow-projects';

export interface WorkflowProjectFilterValues {
  status?: WorkflowProjectStatus;
  clientName?: string;
  templateName?: string;
  assignee?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  progressMin?: number;
  progressMax?: number;
}

interface WorkflowProjectFiltersProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: WorkflowProjectFilterValues) => void;
  initialFilters?: WorkflowProjectFilterValues;
  initialQuery?: string;
  searchInputId?: string;
  clientOptions?: string[];
  templateOptions?: string[];
  assigneeOptions?: string[];
}

const statusOptions: Array<{ value: WorkflowProjectStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'AT_RISK', label: 'At Risk' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'COMPLETED', label: 'Completed' },
];

function getActiveFilterCount(filters: WorkflowProjectFilterValues): number {
  return Object.entries(filters).filter(([, value]) => {
    if (typeof value === 'number') return true;
    return value !== undefined && value !== '';
  }).length;
}

export function WorkflowProjectFilters({
  onSearch,
  onFilterChange,
  initialFilters,
  initialQuery = '',
  searchInputId,
  clientOptions = [],
  templateOptions = [],
  assigneeOptions = [],
}: WorkflowProjectFiltersProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<WorkflowProjectFilterValues>(initialFilters || {});

  const activeFilterCount = getActiveFilterCount(filters);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch(searchQuery);
  };

  const handleFilterChange = (key: keyof WorkflowProjectFilterValues, value: unknown) => {
    const normalizedValue = value === '' || value === null ? undefined : value;
    const nextFilters = { ...filters, [key]: normalizedValue };
    setFilters(nextFilters);
    onFilterChange(nextFilters);
  };

  const clearFilters = () => {
    setFilters({});
    onFilterChange({});
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 relative" role="search">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden="true" />
          <input
            type="text"
            id={searchInputId}
            placeholder="Search by project, client, template, or assignee..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="input input-sm pl-10"
            aria-label="Search workflow projects"
            title="Focus search (Ctrl/Cmd+K)"
          />
        </form>

        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-controls="workflow-project-filter-panel"
          aria-label={`${showFilters ? 'Hide' : 'Show'} filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
          className={`lg:hidden btn-secondary btn-sm flex items-center gap-2 ${
            activeFilterCount > 0 ? 'border-oak-primary' : ''
          }`}
        >
          <Filter className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-oak-primary text-white text-2xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center" aria-hidden="true">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {showFilters && (
        <div id="workflow-project-filter-panel" className="card animate-fade-in lg:hidden">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select
                value={filters.status || ''}
                onChange={(event) => handleFilterChange('status', event.target.value as WorkflowProjectStatus)}
                className="input input-sm"
              >
                <option value="">All statuses</option>
                {statusOptions.map((statusOption) => (
                  <option key={statusOption.value} value={statusOption.value}>
                    {statusOption.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Client</label>
              <select
                value={filters.clientName || ''}
                onChange={(event) => handleFilterChange('clientName', event.target.value || undefined)}
                className="input input-sm"
              >
                <option value="">All clients</option>
                {clientOptions.map((clientName) => (
                  <option key={clientName} value={clientName}>
                    {clientName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Template</label>
              <select
                value={filters.templateName || ''}
                onChange={(event) => handleFilterChange('templateName', event.target.value || undefined)}
                className="input input-sm"
              >
                <option value="">All templates</option>
                {templateOptions.map((templateName) => (
                  <option key={templateName} value={templateName}>
                    {templateName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Assignee</label>
              <select
                value={filters.assignee || ''}
                onChange={(event) => handleFilterChange('assignee', event.target.value || undefined)}
                className="input input-sm"
              >
                <option value="">All assignees</option>
                {assigneeOptions.map((assigneeName) => (
                  <option key={assigneeName} value={assigneeName}>
                    {assigneeName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Due Date From</label>
              <input
                type="date"
                value={filters.dueDateFrom || ''}
                onChange={(event) => handleFilterChange('dueDateFrom', event.target.value || undefined)}
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">Due Date To</label>
              <input
                type="date"
                value={filters.dueDateTo || ''}
                onChange={(event) => handleFilterChange('dueDateTo', event.target.value || undefined)}
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">Progress Min (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={filters.progressMin ?? ''}
                onChange={(event) => handleFilterChange('progressMin', event.target.value ? parseInt(event.target.value, 10) : undefined)}
                placeholder="0"
                className="input input-sm"
              />
            </div>

            <div>
              <label className="label">Progress Max (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={filters.progressMax ?? ''}
                onChange={(event) => handleFilterChange('progressMax', event.target.value ? parseInt(event.target.value, 10) : undefined)}
                placeholder="100"
                className="input input-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
