'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { isHttpRequestError, useCreateManualClientService, useManualClientServiceCatalogOptions } from '@/hooks/use-client-services';
import type { ClientServiceDto, DuplicateClientServiceMatches, ManualClientServiceCatalogVariantOption } from '@/services/client-service';
import { OperationalServiceForm } from './operational-service-form';
import {
  catalogReplacementForVariant,
  createManualPayload,
  emptyManualOperationalValues,
  manualFormIsDirty,
  replacementValuesChanged,
  validateOperationalServiceValues,
  type OperationalFieldErrors,
  type OperationalServiceValues,
} from './client-service-form-state';

export function ClientServiceCreator({
  companyId,
  isOpen,
  onClose,
  onCreated,
}: {
  companyId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (service: ClientServiceDto) => void;
}) {
  const catalog = useManualClientServiceCatalogOptions(companyId, isOpen);
  const createService = useCreateManualClientService();
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [values, setValues] = useState<OperationalServiceValues>(emptyManualOperationalValues);
  const [replacement, setReplacement] = useState<OperationalServiceValues | null>(null);
  const [errors, setErrors] = useState<OperationalFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [duplicates, setDuplicates] = useState<DuplicateClientServiceMatches | null>(null);
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const pending = createService.isPending;
  const selectedVariant = catalog.data?.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const selectOptions = useMemo(() => (catalog.data?.variants ?? []).map((variant) => ({
    value: variant.id,
    label: variant.name,
    group: variant.family.name,
    description: variant.customCadenceLabel ?? variant.serviceCadence.replaceAll('_', ' '),
  })), [catalog.data]);
  const dirty = manualFormIsDirty(selectedVariantId, values);

  const applyVariant = (variant: ManualClientServiceCatalogVariantOption) => {
    const next = catalogReplacementForVariant(variant);
    setValues((current) => ({ ...next, status: current.status, startDate: current.startDate, endDate: current.endDate }));
    setReplacement(next);
    setSelectedVariantId(variant.id);
    setErrors({});
    setDuplicates(null);
    setFormError('');
  };

  const requestVariantChange = (variantId: string) => {
    const next = catalog.data?.variants.find((variant) => variant.id === variantId);
    if (!next) return;
    if (replacement && replacementValuesChanged(values, replacement)) {
      setPendingVariantId(variantId);
      return;
    }
    applyVariant(next);
  };

  const confirmVariantChange = () => {
    const next = catalog.data?.variants.find((variant) => variant.id === pendingVariantId);
    if (next) applyVariant(next);
    setPendingVariantId(null);
  };

  const requestClose = () => {
    if (pending) return;
    if (dirty) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  };

  const confirmClose = () => {
    setCloseConfirmOpen(false);
    setDuplicates(null);
    setFormError('');
    setErrors({});
    setValues(emptyManualOperationalValues());
    setSelectedVariantId('');
    setReplacement(null);
    onClose();
  };

  const submit = async (confirmDuplicate: boolean) => {
    if (!selectedVariantId || !selectedVariant) return;
    const validationErrors = validateOperationalServiceValues(values);
    if (Object.values(validationErrors).some(Boolean)) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setFormError('');
    try {
      const created = await createService.mutateAsync({
        companyId,
        data: createManualPayload(selectedVariantId, values, confirmDuplicate),
      });
      onCreated(created);
    } catch (error) {
      if (isHttpRequestError(error, 409) && error.body.duplicates) {
        setDuplicates(error.body.duplicates);
        return;
      }
      if (isHttpRequestError(error, 404)) {
        setErrors({ serviceVariantId: error.message });
        return;
      }
      setFormError(error instanceof Error ? error.message : 'Unable to create service.');
    }
  };

  return <>
    <Modal isOpen={isOpen} onClose={requestClose} title="Add service" description="Add an operational service from the service catalog." size="2xl" closeOnEscape={!pending} closeOnOverlayClick={!pending}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
        {formError ? <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error">{formError}</div> : null}
        {duplicates ? (
          <div role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 text-sm">
            <p className="font-medium text-text-primary">A matching client service already exists ({duplicates.total} matching).</p>
            <ul className="mt-2 space-y-1 text-text-secondary">
              {duplicates.items.slice(0, 5).map((item) => (
                <li key={item.id}>{item.serviceName} · {item.startDate} · {item.status} · {item.source === 'MANUAL' ? 'Added manually' : 'Service agreement'}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button className="min-h-11 sm:min-h-8" size="sm" variant="secondary" disabled={pending} onClick={() => setDuplicates(null)}>Cancel</Button>
              <Button className="min-h-11 sm:min-h-8" size="sm" variant="primary" disabled={pending} isLoading={pending} onClick={() => submit(true)}>Add anyway</Button>
            </div>
          </div>
        ) : null}
        <div>
          <SearchableSelect
            label="Service"
            placeholder="Select service"
            options={selectOptions}
            value={selectedVariantId}
            onChange={requestVariantChange}
            disabled={pending}
            loading={catalog.isLoading}
            groupBy="group"
          />
          {errors.serviceVariantId ? <p className="mt-1.5 text-xs text-status-error">{errors.serviceVariantId}</p> : null}
          {catalog.isLoading ? <p role="status" className="mt-1.5 text-xs text-text-secondary">Loading service catalog…</p> : null}
          {!catalog.isLoading && catalog.error ? <p className="mt-1.5 text-xs text-status-error">{catalog.error instanceof Error ? catalog.error.message : 'This catalog service is no longer available.'} Choose another catalog service to continue.</p> : null}
          {!catalog.isLoading && !catalog.error && (catalog.data?.variants.length ?? 0) === 0 ? <p className="mt-1.5 text-xs text-text-secondary">No active services are available in the catalog.</p> : null}
        </div>
        <OperationalServiceForm values={values} onChange={setValues} errors={errors} disabled={pending} sectionsDisabled={!selectedVariant} />
      </div>
      <div className="flex justify-end gap-2 border-t border-border-primary p-4">
        <Button variant="secondary" disabled={pending} onClick={requestClose}>Cancel</Button>
        <Button isLoading={pending} disabled={!selectedVariantId || pending} onClick={() => submit(false)}>Add service</Button>
      </div>
    </Modal>
    <ConfirmDialog
      isOpen={Boolean(pendingVariantId)}
      onClose={() => setPendingVariantId(null)}
      onConfirm={confirmVariantChange}
      title="Discard catalog changes?"
      description="Changing the service discards modified cadence, service fields, and fees. Status and dates are kept."
      confirmLabel="Discard changes"
      variant="danger"
    />
    <ConfirmDialog
      isOpen={closeConfirmOpen}
      onClose={() => setCloseConfirmOpen(false)}
      onConfirm={confirmClose}
      title="Discard this draft?"
      description="Closing the form discards the service draft you have entered."
      confirmLabel="Discard"
      variant="danger"
    />
  </>;
}
