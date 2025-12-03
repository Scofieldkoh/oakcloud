'use client';

import { Building2 } from 'lucide-react';
import { useTenants } from '@/hooks/use-admin';

interface TenantSelectorProps {
  value: string;
  onChange: (tenantId: string) => void;
  label?: string;
  placeholder?: string;
  helpText?: string;
  disabled?: boolean;
  className?: string;
  /** Compact variant without card wrapper */
  variant?: 'default' | 'compact';
}

/**
 * Reusable tenant selector component for SUPER_ADMIN users
 * Displays a dropdown to select a tenant for multi-tenant operations
 */
export function TenantSelector({
  value,
  onChange,
  label = 'Select Tenant',
  placeholder = '-- Select a tenant --',
  helpText = 'Please select a tenant to continue.',
  disabled = false,
  className = '',
  variant = 'default',
}: TenantSelectorProps) {
  const { data: tenantsData, isLoading } = useTenants({ status: 'ACTIVE', limit: 100 });

  const selectElement = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input input-sm w-full max-w-md"
      disabled={disabled || isLoading}
    >
      <option value="">{isLoading ? 'Loading tenants...' : placeholder}</option>
      {tenantsData?.tenants?.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.name} ({tenant.slug})
        </option>
      ))}
    </select>
  );

  if (variant === 'compact') {
    return (
      <div className={className}>
        <label className="label mb-2">{label}</label>
        {selectElement}
        {!value && helpText && (
          <p className="text-xs text-text-muted mt-1">{helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`mb-6 ${className}`}>
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-oak-light" />
          <div className="flex-1">
            <label className="label mb-1">{label}</label>
            {selectElement}
          </div>
        </div>
        {!value && helpText && (
          <p className="text-sm text-text-muted mt-2 ml-8">{helpText}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to manage tenant selection state for SUPER_ADMIN users
 * Returns the active tenant ID based on session context
 */
export function useActiveTenantId(
  isSuperAdmin: boolean,
  selectedTenantId: string,
  sessionTenantId: string | null | undefined
): string | undefined {
  if (isSuperAdmin) {
    return selectedTenantId || undefined;
  }
  return sessionTenantId || undefined;
}
