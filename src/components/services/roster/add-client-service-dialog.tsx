'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClientServiceCreator } from '@/components/companies/company-detail/client-service-creator';
import { Button } from '@/components/ui/button';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAllCompanyOptions } from '@/hooks/use-all-company-options';
import type { ClientServiceDto } from '@/services/client-service';

interface AddClientServiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (service: ClientServiceDto) => void;
}

/** Select an accessible company before mounting the shared company-scoped creator. */
export function AddClientServiceDialog({ isOpen, onClose, onCreated }: AddClientServiceDialogProps) {
  const companyOptions = useAllCompanyOptions(undefined, { enabled: isOpen });
  const [companyId, setCompanyId] = useState('');
  const [creatorOpen, setCreatorOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCompanyId('');
      setCreatorOpen(false);
    }
  }, [isOpen]);

  const options = useMemo(
    () => (companyOptions.data ?? []).map((company) => ({
      value: company.id,
      label: company.name,
      description: company.uen ?? undefined,
    })),
    [companyOptions.data],
  );

  const openCreator = () => {
    if (!companyId) return;
    setCreatorOpen(true);
  };

  const handleCreated = (service: ClientServiceDto) => {
    setCreatorOpen(false);
    onClose();
    onCreated?.(service);
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !creatorOpen}
        onClose={onClose}
        title="Add service"
        description="Choose an accessible company, then complete the shared service form."
        size="md"
      >
        <ModalBody className="space-y-4">
          <SearchableSelect
            label="Company"
            options={options}
            value={companyId}
            onChange={setCompanyId}
            placeholder={companyOptions.isLoading ? 'Loading companies…' : 'Select a company'}
            loading={companyOptions.isLoading}
            error={companyOptions.error ? 'Unable to load accessible companies.' : undefined}
            popoverMinWidth={320}
          />
          {!companyOptions.isLoading && options.length === 0 && !companyOptions.error ? (
            <p className="text-sm text-text-secondary">No accessible companies are available.</p>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={openCreator} disabled={!companyId}>Continue</Button>
        </ModalFooter>
      </Modal>
      <ClientServiceCreator
        companyId={companyId}
        isOpen={isOpen && creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
