'use client';

import { useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormInput } from '@/components/ui/form-input';
import type { ClientServiceDto } from '@/services/client-service';
import {
  isHttpRequestError,
  useArchiveClientService,
  useClientService,
  useUpdateClientService,
} from '@/hooks/use-client-services';

type FieldRow = { uiId: string; key: string; value: string };
type FeeRow = ClientServiceDto['feeLines'][number] & { uiId: string };
type FieldErrors = Record<string, string | undefined>;

const uuid = () => crypto.randomUUID();

function SelectField({
  id,
  label,
  error,
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        className={`input w-full ${error ? 'border-status-error' : ''}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        {...props}
      >
        {children}
      </select>
      {error ? <p id={errorId} className="mt-1.5 text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

export function ClientServiceEditor({
  service,
  isOpen,
  onClose,
}: {
  service: ClientServiceDto;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [serviceName, setServiceName] = useState(service.serviceName);
  const [familyName, setFamilyName] = useState(service.familyName);
  const [status, setStatus] = useState(service.status);
  const [cadence, setCadence] = useState(service.serviceCadence);
  const [customCadenceLabel, setCustomCadenceLabel] = useState(service.customCadenceLabel ?? '');
  const [startDate, setStartDate] = useState(service.startDate);
  const [endDate, setEndDate] = useState(service.endDate ?? '');
  const [updatedAt, setUpdatedAt] = useState(service.updatedAt);
  const [fees, setFees] = useState<FeeRow[]>(() => service.feeLines.map((fee) => ({ ...fee, uiId: uuid() })));
  const [fieldValues, setFieldValues] = useState<FieldRow[]>(() => Object.entries(service.fieldValues).map(([key, value]) => ({ uiId: uuid(), key, value })));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const errorId = useId();
  const update = useUpdateClientService();
  const archive = useArchiveClientService();
  const latestService = useClientService(service.id);

  const replaceForm = (next: ClientServiceDto) => {
    setServiceName(next.serviceName);
    setFamilyName(next.familyName);
    setStatus(next.status);
    setCadence(next.serviceCadence);
    setCustomCadenceLabel(next.customCadenceLabel ?? '');
    setStartDate(next.startDate);
    setEndDate(next.endDate ?? '');
    setUpdatedAt(next.updatedAt);
    setFees(next.feeLines.map((fee) => ({ ...fee, uiId: uuid() })));
    setFieldValues(Object.entries(next.fieldValues).map(([key, value]) => ({ uiId: uuid(), key, value })));
    setFieldErrors({});
  };

  const validate = () => {
    const errors: FieldErrors = {};
    if (!serviceName.trim()) errors.serviceName = 'Service name is required.';
    if (!familyName.trim()) errors.familyName = 'Service family is required.';
    if (cadence === 'CUSTOM' && !customCadenceLabel.trim()) errors.customCadenceLabel = 'Custom cadence is required.';
    if (endDate && endDate < startDate) errors.endDate = 'End date must be on or after start date.';
    for (const [index, fee] of fees.entries()) {
      const prefix = `fee-${fee.uiId}`;
      if (!fee.description.trim()) errors[`${prefix}-description`] = `Fee ${index + 1} description is required.`;
      if (!/^\d{1,16}(\.\d{1,2})?$/.test(fee.amount)) errors[`${prefix}-amount`] = `Fee ${index + 1} amount is invalid.`;
      if (!/^[A-Z]{3}$/.test(fee.currency.trim().toUpperCase())) errors[`${prefix}-currency`] = `Fee ${index + 1} currency must be a three-letter code.`;
      if (fee.billingFrequency === 'CUSTOM' && !fee.customFrequencyLabel?.trim()) errors[`${prefix}-custom-frequency`] = `Fee ${index + 1} custom frequency is required.`;
    }
    setFieldErrors(errors);
    return Object.values(errors).find(Boolean) ?? '';
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (hasConflict) {
      setFormError('Reload the latest service before saving again.');
      return;
    }
    setFormError('');
    try {
      await update.mutateAsync({
        id: service.id,
        companyId: service.companyId,
        data: {
          updatedAt,
          serviceName,
          familyName,
          status,
          serviceCadence: cadence,
          customCadenceLabel: cadence === 'CUSTOM' ? customCadenceLabel : null,
          startDate,
          endDate: endDate || null,
          fieldValues: Object.fromEntries(fieldValues.filter((field) => field.key.trim()).map((field) => [field.key.trim(), field.value])),
          feeLines: fees.map((fee, index) => ({
            id: fee.id,
            description: fee.description,
            amount: fee.amount,
            currency: fee.currency.trim().toUpperCase(),
            billingFrequency: fee.billingFrequency,
            customFrequencyLabel: fee.billingFrequency === 'CUSTOM' ? fee.customFrequencyLabel : null,
            billingStartDate: fee.billingStartDate || null,
            displayOrder: index,
          })),
        },
      });
      onClose();
    } catch (error) {
      if (isHttpRequestError(error, 409)) {
        setHasConflict(true);
        setFormError('This service was updated by someone else. Reload the latest service before saving again.');
        return;
      }
      setFormError(error instanceof Error ? error.message : 'Unable to save service changes.');
    }
  };

  const reloadLatest = async () => {
    setFormError('');
    try {
      const result = await latestService.refetch();
      if (!result.data) throw new Error('Unable to reload the latest service.');
      replaceForm(result.data);
      setHasConflict(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to reload the latest service.');
    }
  };

  const archiveService = async (reason?: string) => {
    setArchiveError('');
    try {
      await archive.mutateAsync({ id: service.id, companyId: service.companyId, reason: reason ?? '' });
      setArchiveOpen(false);
      onClose();
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Unable to archive service.');
      throw error;
    }
  };

  const updateFee = (index: number, changes: Partial<FeeRow>) => {
    setFees((current) => current.map((fee, feeIndex) => feeIndex === index ? { ...fee, ...changes } : fee));
  };

  return <>
    <Modal isOpen={isOpen} onClose={onClose} title="Edit service" description="Operational edits do not change the signed agreement." size="2xl">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4" aria-describedby={formError ? errorId : undefined}>
        {formError ? (
          <div id={errorId} role="alert" className="rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-sm text-status-error">
            <p>{formError}</p>
            {hasConflict ? <Button className="mt-2 min-h-11 sm:min-h-8" size="sm" variant="secondary" isLoading={latestService.isFetching} onClick={reloadLatest}>Reload latest service</Button> : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput id="client-service-name" label="Service name" value={serviceName} error={fieldErrors.serviceName} onChange={(event) => setServiceName(event.target.value)} />
          <FormInput id="client-service-family" label="Service family" value={familyName} error={fieldErrors.familyName} onChange={(event) => setFamilyName(event.target.value)} />
          <SelectField id="client-service-status" label="Status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ENDED">Ended</option>
          </SelectField>
          <SelectField id="client-service-cadence" label="Cadence" value={cadence} onChange={(event) => setCadence(event.target.value as typeof cadence)}>
            {['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'AD_HOC', 'CUSTOM'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
          </SelectField>
          {cadence === 'CUSTOM' ? <FormInput id="client-service-custom-cadence" className="sm:col-span-2" label="Custom cadence" value={customCadenceLabel} error={fieldErrors.customCadenceLabel} onChange={(event) => setCustomCadenceLabel(event.target.value)} /> : null}
          <FormInput id="client-service-start-date" type="date" label="Start date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <FormInput id="client-service-end-date" type="date" label="End date" value={endDate} error={fieldErrors.endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-primary">Service fields</h3>
            <Button className="min-h-11 sm:min-h-8" size="xs" variant="secondary" onClick={() => setFieldValues((current) => [...current, { uiId: uuid(), key: '', value: '' }])}>Add field</Button>
          </div>
          {fieldValues.map((field, index) => (
            <div key={field.uiId} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input aria-label={`Field ${index + 1} name`} className="input" value={field.key} onChange={(event) => setFieldValues((current) => current.map((item) => item.uiId === field.uiId ? { ...item, key: event.target.value } : item))} />
              <input aria-label={`Field ${index + 1} value`} className="input" value={field.value} onChange={(event) => setFieldValues((current) => current.map((item) => item.uiId === field.uiId ? { ...item, value: event.target.value } : item))} />
              <Button className="min-h-11 sm:min-h-8" size="xs" variant="ghost" onClick={() => setFieldValues((current) => current.filter((item) => item.uiId !== field.uiId))}>Remove</Button>
            </div>
          ))}
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-primary">Fees</h3>
            <Button className="min-h-11 sm:min-h-8" size="xs" variant="secondary" onClick={() => setFees((current) => [...current, { uiId: uuid(), id: uuid(), description: '', amount: '0.00', currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: null, billingStartDate: null, displayOrder: current.length }])}>Add fee</Button>
          </div>
          {fees.map((fee, index) => {
            const prefix = `fee-${fee.uiId}`;
            return (
              <div key={fee.uiId} className="grid grid-cols-1 gap-2 rounded-lg border border-border-primary p-3 sm:grid-cols-2">
                <FormInput id={`${prefix}-description`} className="sm:col-span-2" label="Description" aria-label={`Fee ${index + 1} description`} value={fee.description} error={fieldErrors[`${prefix}-description`]} onChange={(event) => updateFee(index, { description: event.target.value })} />
                <FormInput id={`${prefix}-amount`} label="Amount" aria-label={`Fee ${index + 1} amount`} inputMode="decimal" value={fee.amount} error={fieldErrors[`${prefix}-amount`]} onChange={(event) => updateFee(index, { amount: event.target.value })} />
                <FormInput id={`${prefix}-currency`} label="Currency" aria-label={`Fee ${index + 1} currency`} className="uppercase" maxLength={3} value={fee.currency} error={fieldErrors[`${prefix}-currency`]} onChange={(event) => updateFee(index, { currency: event.target.value.toUpperCase() })} />
                <SelectField id={`${prefix}-frequency`} label="Frequency" aria-label={`Fee ${index + 1} frequency`} value={fee.billingFrequency} onChange={(event) => updateFee(index, { billingFrequency: event.target.value as typeof fee.billingFrequency, customFrequencyLabel: event.target.value === 'CUSTOM' ? fee.customFrequencyLabel ?? '' : null })}>
                  {['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'CUSTOM'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
                </SelectField>
                <FormInput id={`${prefix}-billing-start-date`} label="Billing start date" aria-label={`Fee ${index + 1} billing start date`} type="date" value={fee.billingStartDate ?? ''} onChange={(event) => updateFee(index, { billingStartDate: event.target.value || null })} />
                {fee.billingFrequency === 'CUSTOM' ? <FormInput id={`${prefix}-custom-frequency`} className="sm:col-span-2" label="Custom frequency" aria-label={`Fee ${index + 1} custom frequency`} value={fee.customFrequencyLabel ?? ''} error={fieldErrors[`${prefix}-custom-frequency`]} onChange={(event) => updateFee(index, { customFrequencyLabel: event.target.value })} /> : null}
                <div className="sm:col-span-2"><Button className="min-h-11 sm:min-h-8" size="xs" variant="ghost" disabled={fees.length === 1} onClick={() => setFees((current) => current.filter((item) => item.uiId !== fee.uiId))}>Remove fee</Button></div>
              </div>
            );
          })}
        </section>
        <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3">
          <p className="text-sm text-text-secondary">Archiving removes this operational service from the active company view without changing the signed agreement.</p>
          <Button className="mt-2 min-h-11 sm:min-h-8" variant="danger" size="sm" onClick={() => { setArchiveError(''); setArchiveOpen(true); }}>Archive service</Button>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-primary p-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button isLoading={update.isPending} disabled={hasConflict} onClick={save}>Save changes</Button>
      </div>
    </Modal>
    <ConfirmDialog isOpen={archiveOpen} onClose={() => { setArchiveError(''); setArchiveOpen(false); }} onConfirm={archiveService} title="Archive service?" description="This service will no longer appear in the company Services list." confirmLabel="Archive service" requireReason reasonLabel="Archive reason" reasonPlaceholder="Explain why this service is being archived" reasonMinLength={10} isLoading={archive.isPending}>
      {archiveError ? <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/5 p-2 text-sm text-status-error">{archiveError}</div> : null}
    </ConfirmDialog>
  </>;
}
