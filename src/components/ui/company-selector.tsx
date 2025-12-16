'use client';

import { Briefcase, ChevronDown, Check, Building2 } from 'lucide-react';
import { useCompanies } from '@/hooks/use-companies';
import { useCompanyStore } from '@/stores/company-store';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { useSession } from '@/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Hook to get the active company ID from the centralized store.
 * Returns undefined if no company is selected (means "all companies")
 */
export function useActiveCompanyId(): string | undefined {
  const { selectedCompanyId } = useCompanyStore();
  return selectedCompanyId || undefined;
}

/**
 * Hook to get company store actions and state for components that need to interact with it
 */
export function useCompanySelection() {
  const { selectedCompanyId, selectedCompanyName, setSelectedCompany, clearSelectedCompany } = useCompanyStore();
  return { selectedCompanyId, selectedCompanyName, setSelectedCompany, clearSelectedCompany };
}

interface CompanySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal for selecting a company - used in the sidebar
 */
export function CompanySelectorModal({ isOpen, onClose }: CompanySelectorModalProps) {
  const { data: session } = useSession();
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Fetch companies for the active tenant
  const { data: companiesData, isLoading } = useCompanies({
    tenantId: activeTenantId,
    limit: 100,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  const { selectedCompanyId, setSelectedCompany } = useCompanyStore();
  const [tempSelectedId, setTempSelectedId] = useState(selectedCompanyId);
  const [searchQuery, setSearchQuery] = useState('');

  // Sync temp selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedId(selectedCompanyId);
      setSearchQuery('');
    }
  }, [isOpen, selectedCompanyId]);

  // Clear company selection when tenant changes
  useEffect(() => {
    if (activeTenantId && selectedCompanyId) {
      // Check if current company belongs to active tenant
      const companyExists = companiesData?.companies?.some(c => c.id === selectedCompanyId);
      if (!companyExists && companiesData?.companies) {
        setSelectedCompany('', '');
      }
    }
  }, [activeTenantId, selectedCompanyId, companiesData?.companies, setSelectedCompany]);

  const filteredCompanies = useMemo(() => {
    if (!companiesData?.companies) return [];
    return companiesData.companies.filter(
      (company) =>
        company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (company.uen && company.uen.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [companiesData?.companies, searchQuery]);

  const handleSelect = (companyId: string) => {
    setTempSelectedId(companyId);
  };

  const handleConfirm = () => {
    const company = companiesData?.companies?.find((c) => c.id === tempSelectedId);
    if (company) {
      setSelectedCompany(company.id, company.name);
    } else {
      setSelectedCompany('', '');
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
      title="Select Company"
      description="Choose a company to filter documents. Leave empty to view all companies."
      size="md"
    >
      <ModalBody>
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm w-full"
            autoFocus
          />
        </div>

        {/* Company List */}
        <div className="max-h-64 overflow-y-auto border border-border-primary rounded-lg divide-y divide-border-primary">
          {/* "All Companies" option */}
          <button
            onClick={() => handleSelect('')}
            className={cn(
              'w-full flex items-center gap-3 p-3 text-left transition-colors',
              tempSelectedId === ''
                ? 'bg-oak-primary/10'
                : 'hover:bg-background-tertiary'
            )}
          >
            <Building2 className={cn(
              'w-5 h-5 flex-shrink-0',
              tempSelectedId === '' ? 'text-oak-primary' : 'text-text-muted'
            )} />
            <div className="flex-1 min-w-0">
              <div className={cn(
                'font-medium truncate',
                tempSelectedId === '' ? 'text-oak-primary' : 'text-text-primary'
              )}>
                All Companies
              </div>
              <div className="text-xs text-text-muted truncate">View documents from all companies</div>
            </div>
            {tempSelectedId === '' && (
              <Check className="w-5 h-5 text-oak-primary flex-shrink-0" />
            )}
          </button>

          {isLoading ? (
            <div className="p-4 text-center text-text-muted">Loading companies...</div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-4 text-center text-text-muted">
              {searchQuery ? 'No companies match your search' : 'No companies available'}
            </div>
          ) : (
            filteredCompanies.map((company) => (
              <button
                key={company.id}
                onClick={() => handleSelect(company.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 text-left transition-colors',
                  tempSelectedId === company.id
                    ? 'bg-oak-primary/10'
                    : 'hover:bg-background-tertiary'
                )}
              >
                <Briefcase className={cn(
                  'w-5 h-5 flex-shrink-0',
                  tempSelectedId === company.id ? 'text-oak-primary' : 'text-text-muted'
                )} />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'font-medium truncate',
                    tempSelectedId === company.id ? 'text-oak-primary' : 'text-text-primary'
                  )}>
                    {company.name}
                  </div>
                  {company.uen && (
                    <div className="text-xs text-text-muted truncate">{company.uen}</div>
                  )}
                </div>
                {tempSelectedId === company.id && (
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
                {filteredCompanies.find((c) => c.id === tempSelectedId)?.name || companiesData?.companies?.find((c) => c.id === tempSelectedId)?.name}
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

interface SidebarCompanyButtonProps {
  collapsed: boolean;
}

/**
 * Company selector button for the sidebar
 */
export function SidebarCompanyButton({ collapsed }: SidebarCompanyButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { selectedCompanyId, selectedCompanyName } = useCompanyStore();

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors w-full',
          selectedCompanyId
            ? 'bg-oak-primary/10 text-oak-light hover:bg-oak-primary/20'
            : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
        )}
        title={collapsed ? (selectedCompanyName || 'All Companies') : undefined}
      >
        <Briefcase className="w-[18px] h-[18px] flex-shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            {selectedCompanyId ? (
              <div className="truncate">
                <span className="text-2xs uppercase tracking-wider text-text-muted block">Company</span>
                <span className="font-medium truncate block">{selectedCompanyName || 'Selected'}</span>
              </div>
            ) : (
              <span>All Companies</span>
            )}
          </div>
        )}
        {!collapsed && <ChevronDown className="w-4 h-4 flex-shrink-0 text-text-muted" />}
      </button>
      <CompanySelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
