'use client';

import { useState, useMemo } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormInput } from '@/components/ui/form-input';
import { Copy, Search, Building2, FileText, CheckCircle2, DollarSign, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface Service {
  id: string;
  name: string;
  serviceType: string;
  status: string;
  rate: number;
  currency: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  scope: string | null;
  companyName: string;
  companyId: string;
  contractTitle: string;
}

interface CopyServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (service: Service) => void;
  currentCompanyId: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'text-status-success bg-status-success/10 border-status-success/20',
  PENDING: 'text-status-warning bg-status-warning/10 border-status-warning/20',
  COMPLETED: 'text-text-muted bg-background-tertiary border-border-primary',
  CANCELLED: 'text-status-error bg-status-error/10 border-status-error/20',
};

export function CopyServiceModal({
  isOpen,
  onClose,
  onCopy,
  currentCompanyId,
}: CopyServiceModalProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all companies in tenant
  const { data: companiesData } = useQuery({
    queryKey: ['companies-for-copy'],
    queryFn: async () => {
      const res = await fetch('/api/companies?limit=200');
      if (!res.ok) throw new Error('Failed to fetch companies');
      return res.json() as Promise<{ companies: Array<{ id: string; name: string }> }>;
    },
    enabled: isOpen,
  });

  // Fetch services from all companies in tenant
  const { data: allServicesData, isLoading: allServicesLoading } = useQuery({
    queryKey: ['all-services-for-copy', currentCompanyId],
    queryFn: async () => {
      const res = await fetch(`/api/services/all?excludeCompanyId=${currentCompanyId}`);
      if (!res.ok) throw new Error('Failed to fetch services');
      return res.json() as Promise<{ services: Service[] }>;
    },
    enabled: isOpen && !selectedCompanyId,
  });

  // Fetch services from selected company
  const { data: companyServicesData, isLoading: companyServicesLoading } = useQuery({
    queryKey: ['services-for-copy', selectedCompanyId],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${selectedCompanyId}/services`);
      if (!res.ok) throw new Error('Failed to fetch services');
      return res.json() as Promise<{ services: Service[] }>;
    },
    enabled: isOpen && !!selectedCompanyId,
  });

  // Determine which services data to use
  const servicesData = selectedCompanyId ? companyServicesData : allServicesData;
  const servicesLoading = selectedCompanyId ? companyServicesLoading : allServicesLoading;

  // Filter companies excluding current one
  const companyOptions = useMemo(() => {
    if (!companiesData?.companies) return [];
    return companiesData.companies
      .filter((c) => c.id !== currentCompanyId)
      .map((c) => ({
        value: c.id,
        label: c.name,
      }));
  }, [companiesData, currentCompanyId]);

  // Filter and map services
  const serviceOptions = useMemo(() => {
    if (!servicesData?.services) return [];
    const filtered = searchTerm
      ? servicesData.services.filter((s) =>
          s.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : servicesData.services;

    return filtered.map((s) => ({
      value: s.id,
      label: s.name,
      description: selectedCompanyId
        ? `${s.serviceType} • ${s.currency} ${s.rate.toFixed(2)} • ${s.frequency}`
        : `${s.companyName} • ${s.serviceType} • ${s.currency} ${s.rate.toFixed(2)}`,
    }));
  }, [servicesData, searchTerm, selectedCompanyId]);

  const selectedService = servicesData?.services.find((s) => s.id === selectedServiceId);

  const handleCopy = () => {
    if (selectedService) {
      onCopy(selectedService);
      onClose();
      // Reset state
      setSelectedCompanyId('');
      setSelectedServiceId('');
      setSearchTerm('');
    }
  };

  const handleClose = () => {
    onClose();
    setSelectedCompanyId('');
    setSelectedServiceId('');
    setSearchTerm('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Copy Service from Existing"
      size="lg"
    >
      <ModalBody className="space-y-5">
        {/* Description */}
        <div className="flex items-start gap-3 p-3 bg-status-info/5 border border-status-info/20 rounded-lg">
          <Copy className="w-4 h-4 text-status-info mt-0.5 flex-shrink-0" />
          <div className="text-sm text-text-secondary">
            Select a service from another company to copy its configuration. Dates will not be copied.
          </div>
        </div>

        {/* Step 1: Filter by Company (Optional) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">1</span>
            <h3 className="text-sm font-medium text-text-primary">Filter by Company (Optional)</h3>
          </div>
          <SearchableSelect
            options={companyOptions}
            value={selectedCompanyId}
            onChange={(value) => {
              setSelectedCompanyId(value);
              setSelectedServiceId('');
            }}
            placeholder="All companies"
            size="sm"
            clearable={true}
          />
        </div>

        {/* Step 2: Filter by Service Name */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">2</span>
            <h3 className="text-sm font-medium text-text-primary">Filter by Service Name</h3>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none z-10" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={selectedCompanyId ? "Search services..." : "Search services across all companies..."}
              className="w-full h-9 px-3 pl-9 rounded-lg border border-border-primary bg-background-secondary/30 text-sm text-text-primary placeholder:text-text-muted hover:border-oak-primary/50 focus:outline-none focus:ring-2 focus:ring-oak-primary/30 focus:border-oak-primary transition-colors"
            />
          </div>
        </div>

        {/* Step 3: Select Service */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">3</span>
            <h3 className="text-sm font-medium text-text-primary">Select Service</h3>
          </div>

          <SearchableSelect
            options={serviceOptions}
            value={selectedServiceId}
            onChange={setSelectedServiceId}
            placeholder={servicesLoading ? 'Loading services...' : 'Choose a service...'}
            size="sm"
            loading={servicesLoading}
          />

          <div className="h-3" />

          {servicesData?.services && servicesData.services.length === 0 && (
            <div className="text-center py-6 text-sm text-text-muted">
              {selectedCompanyId ? 'No services found for this company' : 'No services found'}
            </div>
          )}

          {serviceOptions.length === 0 && searchTerm && servicesData?.services && servicesData.services.length > 0 && (
            <div className="text-center py-6 text-sm text-text-muted">
              No services match your search
            </div>
          )}
        </div>

        {/* Service Preview */}
        {selectedService && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-status-success" />
              <h3 className="text-sm font-medium text-text-primary">Service Details</h3>
            </div>

            <div className="card p-0 overflow-hidden">
              {/* Header */}
              <div className="p-4 bg-background-secondary border-b border-border-primary">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-text-primary mb-1 truncate">
                      {selectedService.name}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Building2 className="w-3 h-3" />
                      <span className="truncate">{selectedService.companyName}</span>
                      <span>•</span>
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{selectedService.contractTitle}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-md border ${STATUS_COLORS[selectedService.status] || STATUS_COLORS.ACTIVE}`}>
                    {selectedService.status}
                  </span>
                </div>
              </div>

              {/* Details Grid */}
              <div className="p-4 grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <div className="p-1.5 bg-oak-primary/10 rounded">
                    <FileText className="w-3.5 h-3.5 text-oak-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <dt className="text-xs text-text-muted mb-0.5">Service Type</dt>
                    <dd className="text-sm font-medium text-text-primary">
                      {selectedService.serviceType === 'RECURRING' ? 'Recurring' : 'One-time'}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="p-1.5 bg-oak-primary/10 rounded">
                    <DollarSign className="w-3.5 h-3.5 text-oak-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <dt className="text-xs text-text-muted mb-0.5">Rate</dt>
                    <dd className="text-sm font-medium text-text-primary">
                      {selectedService.currency} {selectedService.rate.toFixed(2)}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="p-1.5 bg-oak-primary/10 rounded">
                    <Calendar className="w-3.5 h-3.5 text-oak-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <dt className="text-xs text-text-muted mb-0.5">Frequency</dt>
                    <dd className="text-sm font-medium text-text-primary">
                      {selectedService.frequency.charAt(0) + selectedService.frequency.slice(1).toLowerCase().replace('_', ' ')}
                    </dd>
                  </div>
                </div>

              </div>

              {/* Scope Preview */}
              {selectedService.scope && (
                <div className="px-4 pb-4">
                  <dt className="text-xs text-text-muted mb-1">Scope of Work</dt>
                  <dd className="text-xs text-text-secondary line-clamp-2 bg-background-tertiary p-2 rounded">
                    {selectedService.scope.replace(/<[^>]*>/g, ' ').trim().substring(0, 150)}
                    {selectedService.scope.length > 150 ? '...' : ''}
                  </dd>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCopy}
          disabled={!selectedService}
          leftIcon={<Copy className="w-4 h-4" />}
        >
          Copy to Form
        </Button>
      </ModalFooter>
    </Modal>
  );
}
