'use client';

import { useMemo } from 'react';
import { SearchableSelect, type SelectOption } from './searchable-select';

interface CompanySearchableSelectCompany {
  id: string;
  name: string;
  uen?: string | null;
}

interface CompanySearchableSelectProps {
  companies: CompanySearchableSelectCompany[];
  value: string;
  onChange: (companyId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  clearable?: boolean;
}

/**
 * Reusable searchable select for choosing a company.
 * Displays company name as label and UEN as description when available.
 */
export function CompanySearchableSelect({
  companies,
  value,
  onChange,
  placeholder = 'Search company...',
  disabled = false,
  loading = false,
  className,
  size = 'sm',
  clearable = true,
}: CompanySearchableSelectProps) {
  const options = useMemo<SelectOption[]>(
    () =>
      companies.map((company) => ({
        value: company.id,
        label: company.name,
        description: company.uen || undefined,
      })),
    [companies]
  );

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      className={className}
      size={size}
      clearable={clearable}
    />
  );
}

export default CompanySearchableSelect;
