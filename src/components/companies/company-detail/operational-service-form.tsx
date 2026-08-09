'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import type { OperationalServiceValues } from './client-service-form-state';

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

function OperationalFieldValue({
  field,
  disabled,
  error,
  onChange,
}: {
  field: OperationalServiceValues['fields'][number];
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.uiId}-value`;
  const errorId = `${id}-error`;
  const label = field.label.trim() || field.key.trim() || 'Field value';
  const accessibility = {
    id,
    'aria-invalid': error ? 'true' : 'false',
    'aria-describedby': error ? errorId : undefined,
  } as const;

  let control: ReactNode;
  if (field.type === 'textarea') {
    control = <textarea {...accessibility} className="input min-h-24 p-3" disabled={disabled} value={field.value} onChange={(event) => onChange(event.target.value)} />;
  } else if (field.type === 'boolean') {
    control = (
      <select {...accessibility} className="input min-h-11 px-3 sm:min-h-8" disabled={disabled} value={field.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else {
    control = (
      <input
        {...accessibility}
        className="input min-h-11 px-3 sm:min-h-8"
        type={field.type === 'date' ? 'date' : 'text'}
        inputMode={field.type === 'number' || field.type === 'currency' ? 'decimal' : undefined}
        disabled={disabled}
        value={field.value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-text-secondary">{label}</label>
      {control}
      {error ? <p id={errorId} className="mt-1.5 text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

export interface OperationalServiceFormProps {
  values: OperationalServiceValues;
  onChange: (next: OperationalServiceValues) => void;
  errors: Record<string, string | undefined>;
  disabled?: boolean;
  sectionsDisabled?: boolean;
}

export function OperationalServiceForm({
  values,
  onChange,
  errors,
  disabled = false,
  sectionsDisabled = false,
}: OperationalServiceFormProps) {
  const updateValue = <K extends keyof OperationalServiceValues>(key: K, value: OperationalServiceValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField id="client-service-status" label="Status" disabled={disabled} value={values.status} onChange={(event) => updateValue('status', event.target.value as OperationalServiceValues['status'])}>
          <option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ENDED">Ended</option>
        </SelectField>
        <SelectField id="client-service-cadence" label="Cadence" disabled={disabled || sectionsDisabled} value={values.serviceCadence} onChange={(event) => updateValue('serviceCadence', event.target.value as OperationalServiceValues['serviceCadence'])}>
          {['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'AD_HOC', 'CUSTOM'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </SelectField>
        {values.serviceCadence === 'CUSTOM' ? <FormInput id="client-service-custom-cadence" className="sm:col-span-2" label="Custom cadence" disabled={disabled || sectionsDisabled} value={values.customCadenceLabel} error={errors.customCadenceLabel} onChange={(event) => updateValue('customCadenceLabel', event.target.value)} /> : null}
        <FormInput id="client-service-start-date" type="date" label="Start date" required disabled={disabled} value={values.startDate} error={errors.startDate} onChange={(event) => updateValue('startDate', event.target.value)} />
        <FormInput id="client-service-end-date" type="date" label="End date" disabled={disabled} value={values.endDate} error={errors.endDate} onChange={(event) => updateValue('endDate', event.target.value)} />
      </div>
      {errors.fieldValues ? <p role="alert" className="text-xs text-status-error">{errors.fieldValues}</p> : null}
      {errors.feeLines ? <p role="alert" className="text-xs text-status-error">{errors.feeLines}</p> : null}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Service fields</h3>
          <Button className="min-h-11 sm:min-h-8" size="xs" variant="secondary" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fields', [...values.fields, { uiId: uuid(), key: '', label: '', type: 'text', value: '', catalogDerived: false }])}>Add field</Button>
        </div>
        {values.fields.map((field, index) => (
          <div key={field.uiId} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
            <input aria-label={`Field ${index + 1} name`} className="input" disabled={disabled || sectionsDisabled} value={field.key} onChange={(event) => updateValue('fields', values.fields.map((item) => item.uiId === field.uiId ? { ...item, key: event.target.value, label: item.catalogDerived ? item.label : event.target.value } : item))} />
            <OperationalFieldValue field={field} disabled={disabled || sectionsDisabled} error={errors[`field-${field.uiId}-value`]} onChange={(value) => updateValue('fields', values.fields.map((item) => item.uiId === field.uiId ? { ...item, value } : item))} />
            <Button className="min-h-11 sm:min-h-8" size="xs" variant="ghost" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fields', values.fields.filter((item) => item.uiId !== field.uiId))}>Remove</Button>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Fees</h3>
          <Button className="min-h-11 sm:min-h-8" size="xs" variant="secondary" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fees', [...values.fees, { uiId: uuid(), id: uuid(), description: '', amount: '0.00', currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: '', billingStartDate: '', catalogDerived: false }])}>Add fee</Button>
        </div>
        {values.fees.map((fee, index) => {
          const prefix = `fee-${fee.uiId}`;
          const updateFee = (changes: Partial<typeof fee>) => updateValue('fees', values.fees.map((item) => item.uiId === fee.uiId ? { ...item, ...changes } : item));
          return (
            <div key={fee.uiId} className="grid grid-cols-1 gap-2 rounded-lg border border-border-primary p-3 sm:grid-cols-2">
              <FormInput id={`${prefix}-description`} className="sm:col-span-2" label="Description" aria-label={`Fee ${index + 1} description`} disabled={disabled || sectionsDisabled} value={fee.description} error={errors[`${prefix}-description`]} onChange={(event) => updateFee({ description: event.target.value })} />
              <FormInput id={`${prefix}-amount`} label="Amount" aria-label={`Fee ${index + 1} amount`} inputMode="decimal" disabled={disabled || sectionsDisabled} value={fee.amount} error={errors[`${prefix}-amount`]} onChange={(event) => updateFee({ amount: event.target.value })} />
              <FormInput id={`${prefix}-currency`} label="Currency" aria-label={`Fee ${index + 1} currency`} className="uppercase" maxLength={3} disabled={disabled || sectionsDisabled} value={fee.currency} error={errors[`${prefix}-currency`]} onChange={(event) => updateFee({ currency: event.target.value.toUpperCase() })} />
              <SelectField id={`${prefix}-frequency`} label="Frequency" aria-label={`Fee ${index + 1} frequency`} disabled={disabled || sectionsDisabled} value={fee.billingFrequency} error={errors[`${prefix}-frequency`]} onChange={(event) => updateFee({ billingFrequency: event.target.value as typeof fee.billingFrequency, customFrequencyLabel: event.target.value === 'CUSTOM' ? fee.customFrequencyLabel : '' })}>
                <option value="">Select frequency</option>
                {['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'CUSTOM'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
              </SelectField>
              <FormInput id={`${prefix}-billing-start-date`} label="Billing start date" aria-label={`Fee ${index + 1} billing start date`} type="date" disabled={disabled || sectionsDisabled} value={fee.billingStartDate} error={errors[`${prefix}-billing-start-date`]} onChange={(event) => updateFee({ billingStartDate: event.target.value })} />
              {fee.billingFrequency === 'CUSTOM' ? <FormInput id={`${prefix}-custom-frequency`} className="sm:col-span-2" label="Custom frequency" aria-label={`Fee ${index + 1} custom frequency`} disabled={disabled || sectionsDisabled} value={fee.customFrequencyLabel} error={errors[`${prefix}-custom-frequency`]} onChange={(event) => updateFee({ customFrequencyLabel: event.target.value })} /> : null}
              <div className="sm:col-span-2"><Button className="min-h-11 sm:min-h-8" size="xs" variant="ghost" disabled={disabled || sectionsDisabled || values.fees.length === 1} onClick={() => updateValue('fees', values.fees.filter((item) => item.uiId !== fee.uiId))}>Remove fee</Button></div>
            </div>
          );
        })}
      </section>
    </>
  );
}
