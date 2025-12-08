'use client';

import { Building2, ChevronDown, Check } from 'lucide-react';
import { useTenants } from '@/hooks/use-admin';
import { useTenantStore } from '@/stores/tenant-store';
import { useState, useEffect } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
 * Reusable tenant selector dropdown component for SUPER_ADMIN users
 * @deprecated Use the centralized tenant selector in the sidebar instead.
 * This component is kept for backwards compatibility during migration.
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
 * Hook to get the active tenant ID based on user role and centralized store.
 * For SUPER_ADMIN: Returns the tenant selected in the centralized store
 * For other users: Returns their session tenant ID
 */
export function useActiveTenantId(
  isSuperAdmin: boolean,
  sessionTenantId: string | null | undefined
): string | undefined {
  const { selectedTenantId } = useTenantStore();

  if (isSuperAdmin) {
    return selectedTenantId || undefined;
  }
  return sessionTenantId || undefined;
}

/**
 * Legacy hook signature for backwards compatibility during migration.
 * @deprecated Use useActiveTenantId(isSuperAdmin, sessionTenantId) instead
 */
export function useActiveTenantIdLegacy(
  isSuperAdmin: boolean,
  localSelectedTenantId: string,
  sessionTenantId: string | null | undefined
): string | undefined {
  const { selectedTenantId } = useTenantStore();

  if (isSuperAdmin) {
    // Prefer centralized store, fall back to local state during migration
    return selectedTenantId || localSelectedTenantId || undefined;
  }
  return sessionTenantId || undefined;
}

/**
 * Hook to get tenant store actions and state for components that need to interact with it
 */
export function useTenantSelection() {
  const { selectedTenantId, selectedTenantName, setSelectedTenant, clearSelectedTenant } = useTenantStore();
  return { selectedTenantId, selectedTenantName, setSelectedTenant, clearSelectedTenant };
}

interface TenantSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal for selecting a tenant - used in the sidebar for SUPER_ADMIN
 */
export function TenantSelectorModal({ isOpen, onClose }: TenantSelectorModalProps) {
  const { data: tenantsData, isLoading } = useTenants({ status: 'ACTIVE', limit: 100 });
  const { selectedTenantId, setSelectedTenant } = useTenantStore();
  const [tempSelectedId, setTempSelectedId] = useState(selectedTenantId);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync temp selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedId(selectedTenantId);
      setSearchQuery('');
    }
  }, [isOpen, selectedTenantId]);

  const filteredTenants = tenantsData?.tenants?.filter(
    (tenant) =>
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleSelect = (tenantId: string, tenantName: string) => {
    setTempSelectedId(tenantId);
  };

  const handleConfirm = () => {
    const tenant = tenantsData?.tenants?.find((t) => t.id === tempSelectedId);
    if (tenant) {
      setSelectedTenant(tenant.id, tenant.name);
    } else {
      setSelectedTenant('', '');
    }
    onClose();
  };

  const handleClear = () => {
    setTempSelectedId('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Tenant"
      description="Choose a tenant to manage. Your selection will be remembered across pages."
      size="md"
    >
      <ModalBody>
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search tenants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm w-full"
            autoFocus
          />
        </div>

        {/* Tenant List */}
        <div className="max-h-64 overflow-y-auto border border-border-primary rounded-lg divide-y divide-border-primary">
          {isLoading ? (
            <div className="p-4 text-center text-text-muted">Loading tenants...</div>
          ) : filteredTenants.length === 0 ? (
            <div className="p-4 text-center text-text-muted">
              {searchQuery ? 'No tenants match your search' : 'No tenants available'}
            </div>
          ) : (
            filteredTenants.map((tenant) => (
              <button
                key={tenant.id}
                onClick={() => handleSelect(tenant.id, tenant.name)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 text-left transition-colors',
                  tempSelectedId === tenant.id
                    ? 'bg-oak-primary/10'
                    : 'hover:bg-background-tertiary'
                )}
              >
                <Building2 className={cn(
                  'w-5 h-5 flex-shrink-0',
                  tempSelectedId === tenant.id ? 'text-oak-primary' : 'text-text-muted'
                )} />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'font-medium truncate',
                    tempSelectedId === tenant.id ? 'text-oak-primary' : 'text-text-primary'
                  )}>
                    {tenant.name}
                  </div>
                  <div className="text-xs text-text-muted truncate">{tenant.slug}</div>
                </div>
                {tempSelectedId === tenant.id && (
                  <Check className="w-5 h-5 text-oak-primary flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Selected info */}
        {tempSelectedId && (
          <div className="mt-3 p-2 bg-oak-primary/5 rounded-lg flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              Selected: <span className="font-medium text-text-primary">
                {filteredTenants.find((t) => t.id === tempSelectedId)?.name || tenantsData?.tenants?.find((t) => t.id === tempSelectedId)?.name}
              </span>
            </span>
            <button
              onClick={handleClear}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              Clear
            </button>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleConfirm}>
          Confirm Selection
        </Button>
      </ModalFooter>
    </Modal>
  );
}

interface SidebarTenantButtonProps {
  collapsed: boolean;
}

/**
 * Tenant selector button for the sidebar - only visible to SUPER_ADMIN
 */
export function SidebarTenantButton({ collapsed }: SidebarTenantButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { selectedTenantId, selectedTenantName } = useTenantStore();

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors w-full',
          selectedTenantId
            ? 'bg-oak-primary/10 text-oak-light hover:bg-oak-primary/20'
            : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
        )}
        title={collapsed ? (selectedTenantName || 'Select Tenant') : undefined}
      >
        <Building2 className="w-[18px] h-[18px] flex-shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            {selectedTenantId ? (
              <div className="truncate">
                <span className="text-2xs uppercase tracking-wider text-text-muted block">Tenant</span>
                <span className="font-medium truncate block">{selectedTenantName || 'Selected'}</span>
              </div>
            ) : (
              <span>Select Tenant</span>
            )}
          </div>
        )}
        {!collapsed && <ChevronDown className="w-4 h-4 flex-shrink-0 text-text-muted" />}
      </button>
      <TenantSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
