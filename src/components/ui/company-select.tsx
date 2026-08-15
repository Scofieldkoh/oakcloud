'use client';

import type { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { AsyncSearchSelect } from '@/components/ui/async-search-select';
import { useCompanySearch, type CompanySearchOption } from '@/hooks/use-company-search';

export interface CompanySelectProps {
  /** Currently selected company ID ('' for none). */
  value: string;
  /** Called with the selected company ID and the full option (or null on clear). */
  onChange: (companyId: string, company: CompanySearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
  /** Company IDs to hide from the list (e.g. already linked companies). */
  excludeIds?: string[];
  /** Always-visible options prepended to the list (e.g. a workspace-wide "All" option). */
  pinned?: CompanySearchOption[];
  /** Skips fetching entirely when false. */
  enabled?: boolean;
  /** Custom option rendering. */
  renderOption?: (item: CompanySearchOption, isHighlighted: boolean, isSelected: boolean) => ReactNode;
  /** Custom selected rendering. */
  renderSelected?: (item: CompanySearchOption) => ReactNode;
  emptySearchText?: string;
  noResultsText?: string;
}

/**
 * Single company select used by every company dropdown in the app. Backed by
 * the shared `useCompanySearch` source: it shows the first page of companies
 * without typing and pages through the rest on the server.
 */
export function CompanySelect({
  value,
  onChange,
  placeholder = 'Search companies...',
  disabled = false,
  className,
  icon = <Building2 className="h-4 w-4" />,
  excludeIds,
  pinned,
  enabled = true,
  renderOption,
  renderSelected,
  emptySearchText = 'No companies available',
  noResultsText = 'No companies match that search',
}: CompanySelectProps) {
  const {
    searchQuery,
    setSearchQuery,
    options,
    isLoading,
    page,
    setPage,
    hasMore,
    hasPreviousPage,
  } = useCompanySearch({ minChars: 0, limit: 50, paginated: true, excludeIds, pinned, enabled });

  const selectedRenderer = renderSelected ?? ((item: CompanySearchOption) => (
    <div className="flex-1 flex items-center gap-2 px-3 min-w-0">
      {icon && <span className="text-text-tertiary shrink-0">{icon}</span>}
      <span className="text-xs text-text-primary truncate">{item.label}</span>
      {item.description && (
        <span className="text-xs text-text-muted truncate hidden sm:inline">
          ({item.description})
        </span>
      )}
    </div>
  ));

  return (
    <AsyncSearchSelect<CompanySearchOption>
      value={value}
      onChange={onChange}
      options={options}
      isLoading={isLoading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      icon={icon}
      renderOption={renderOption}
      renderSelected={selectedRenderer}
      showSearchIcon={false}
      inputClassName="text-xs text-text-primary placeholder:text-text-secondary"
      emptySearchText={emptySearchText}
      noResultsText={noResultsText}
      pagination={{
        page,
        hasPreviousPage,
        hasNextPage: hasMore,
        onPreviousPage: () => setPage((current) => Math.max(0, current - 1)),
        onNextPage: () => setPage((current) => current + 1),
      }}
    />
  );
}
