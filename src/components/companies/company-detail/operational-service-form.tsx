'use client';

import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { ScheduleEntryEditor } from '@/components/services/shared/schedule-entry-editor';
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
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select
        id={id}
        className={`input input-sm w-full ${error ? 'border-status-error' : ''}`}
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
    control = <textarea {...accessibility} className="input input-sm min-h-24 px-3 py-2" disabled={disabled} value={field.value} onChange={(event) => onChange(event.target.value)} />;
  } else if (field.type === 'boolean') {
    control = (
      <select {...accessibility} className="input input-sm" disabled={disabled} value={field.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else {
    control = (
      <input
        {...accessibility}
        className="input input-sm"
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
      <label htmlFor={id} className="label">{label}</label>
      {control}
      {error ? <p id={errorId} className="mt-1.5 text-xs text-status-error">{error}</p> : null}
    </div>
  );
}

function DeadlineParameterValue({
  rule,
  parameter,
  disabled,
  onChange,
}: {
  rule: OperationalServiceValues['deadlineRules'][number];
  parameter: OperationalServiceValues['deadlineRules'][number]['parameters'][number];
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const id = `deadline-${rule.uiId}-${parameter.key}`;
  const value = rule.parameterValues[parameter.key];
  const options = parameter.validation && typeof parameter.validation === 'object' && !Array.isArray(parameter.validation) && 'options' in parameter.validation && Array.isArray(parameter.validation.options)
    ? parameter.validation.options.filter((option): option is string => typeof option === 'string')
    : [];
  if (parameter.type === 'BOOLEAN') {
    return <div><label htmlFor={id} className="label">{parameter.label}</label><select id={id} className="input input-sm w-full" disabled={disabled} value={typeof value === 'boolean' ? String(value) : ''} onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}><option value="">Not set</option><option value="true">Yes</option><option value="false">No</option></select></div>;
  }
  if (parameter.type === 'ENUM') {
    return <div><label htmlFor={id} className="label">{parameter.label}</label><select id={id} className="input input-sm w-full" disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)}><option value="">Select {parameter.label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
  }
  const isNumber = parameter.type === 'INTEGER' || parameter.type === 'DECIMAL';
  const inputValue = value === undefined || value === null ? '' : String(value);
  return <div><label htmlFor={id} className="label">{parameter.label}</label><input id={id} className="input input-sm" type={parameter.type === 'DATE' ? 'date' : 'text'} inputMode={isNumber ? 'decimal' : undefined} disabled={disabled} value={inputValue} onChange={(event) => {
    const next = event.target.value;
    if (!next) onChange(undefined);
    else if (parameter.type === 'INTEGER') onChange(Number.parseInt(next, 10));
    else if (parameter.type === 'DECIMAL') onChange(Number.parseFloat(next));
    else onChange(next);
  }} />{parameter.helpText ? <p className="mt-1 text-xs text-text-secondary">{parameter.helpText}</p> : null}</div>;
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
      {errors.deadlineRules ? <p role="alert" className="text-xs text-status-error">{errors.deadlineRules}</p> : null}
      <section className="space-y-3 border-t border-border-primary pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Service fields</h3>
          <Button size="xs" variant="secondary" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fields', [...values.fields, { uiId: uuid(), key: '', label: '', type: 'text', value: '', catalogDerived: false }])}>Add field</Button>
        </div>
        {values.fields.map((field, index) => (
          <div key={field.uiId} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
            <div>
              <label htmlFor={`field-${field.uiId}-name`} className="label">Field name</label>
              <input id={`field-${field.uiId}-name`} aria-label={`Field ${index + 1} name`} className="input input-sm" disabled={disabled || sectionsDisabled} value={field.key} onChange={(event) => updateValue('fields', values.fields.map((item) => item.uiId === field.uiId ? { ...item, key: event.target.value, label: item.catalogDerived ? item.label : event.target.value } : item))} />
            </div>
            <OperationalFieldValue field={field} disabled={disabled || sectionsDisabled} error={errors[`field-${field.uiId}-value`]} onChange={(value) => updateValue('fields', values.fields.map((item) => item.uiId === field.uiId ? { ...item, value } : item))} />
            <Button size="xs" variant="ghost" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fields', values.fields.filter((item) => item.uiId !== field.uiId))}>Remove</Button>
          </div>
        ))}
      </section>
      <section className="space-y-3 border-t border-border-primary pt-4">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Deadline rules</h3>
          <p className="text-xs text-text-secondary">Configure the rules associated with this service. Changes are reconciled after save.</p>
        </div>
        {values.deadlineRules.length === 0 ? <p className="text-sm text-text-secondary">No deadline rules are associated with this service variant.</p> : null}
        {values.deadlineRules.map((rule) => {
          const updateRule = (changes: Partial<typeof rule>) => updateValue('deadlineRules', values.deadlineRules.map((item) => item.uiId === rule.uiId ? { ...item, ...changes } : item));
          const updateParameters = (key: string, value: unknown) => updateRule({ parameterValues: value === undefined ? Object.fromEntries(Object.entries(rule.parameterValues).filter(([existingKey]) => existingKey !== key)) : { ...rule.parameterValues, [key]: value }, parameterProvenance: value === undefined ? Object.fromEntries(Object.entries(rule.parameterProvenance).filter(([existingKey]) => existingKey !== key)) as typeof rule.parameterProvenance : { ...rule.parameterProvenance, [key]: rule.parameterProvenance[key] ?? 'CLIENT_OVERRIDE' } });
          return (
            <article key={rule.uiId} className="space-y-3 rounded-lg border border-border-primary bg-background-primary p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h4 className="text-sm font-medium text-text-primary">{rule.name}</h4><p className="text-xs text-text-secondary">{rule.code}</p></div>
                <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" disabled={disabled || sectionsDisabled} checked={rule.enabled} onChange={(event) => updateRule({ enabled: event.target.checked })} /> Enabled</label>
              </div>
              {rule.applicabilityState && rule.applicabilityState !== 'APPLICABLE' ? <p role="status" className="text-xs text-status-warning">{rule.applicabilityReason ?? (rule.applicabilityState === 'MISSING_INPUT' ? 'Required inputs are missing.' : 'This rule does not apply to the company.')}</p> : null}
              {rule.parameters.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><h5 className="sr-only">Parameters</h5>{rule.parameters.map((parameter) => <div key={parameter.key} className="space-y-1"><DeadlineParameterValue rule={rule} parameter={parameter} disabled={disabled || sectionsDisabled} onChange={(value) => updateParameters(parameter.key, value)} /><label htmlFor={`deadline-${rule.uiId}-${parameter.key}-source`} className="sr-only">{parameter.label} provenance</label><select id={`deadline-${rule.uiId}-${parameter.key}-source`} className="input input-sm w-full" disabled={disabled || sectionsDisabled || !(parameter.key in rule.parameterValues)} value={rule.parameterProvenance[parameter.key] ?? 'CLIENT_OVERRIDE'} onChange={(event) => updateRule({ parameterProvenance: { ...rule.parameterProvenance, [parameter.key]: event.target.value as typeof rule.parameterProvenance[typeof parameter.key] } })}><option value="CLIENT_OVERRIDE">Client override</option><option value="CATALOG_DEFAULT">Catalog default</option><option value="COMPANY">Company source</option></select></div>)}</div> : null}
              <ScheduleEntryEditor value={rule.scheduleEntries} disabled={disabled || sectionsDisabled} onChange={(scheduleEntries) => updateRule({ scheduleEntries })} />
              {errors[`deadline-rule-${rule.uiId}-schedule`] ? <p role="alert" className="text-xs text-status-error">{errors[`deadline-rule-${rule.uiId}-schedule`]}</p> : null}
            </article>
          );
        })}
      </section>
      <section className="space-y-3 border-t border-border-primary pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Fees</h3>
          <Button size="xs" variant="secondary" disabled={disabled || sectionsDisabled} onClick={() => updateValue('fees', [...values.fees, { uiId: uuid(), id: uuid(), description: '', amount: '0.00', currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: '', billingStartDate: '', catalogDerived: false }])}>Add fee</Button>
        </div>
        {values.fees.map((fee, index) => {
          const prefix = `fee-${fee.uiId}`;
          const updateFee = (changes: Partial<typeof fee>) => updateValue('fees', values.fees.map((item) => item.uiId === fee.uiId ? { ...item, ...changes } : item));
          return (
            <div key={fee.uiId} className="grid grid-cols-1 gap-3 rounded-lg border border-border-primary bg-background-primary p-3 sm:grid-cols-2">
              <FormInput id={`${prefix}-description`} className="sm:col-span-2" label="Description" aria-label={`Fee ${index + 1} description`} disabled={disabled || sectionsDisabled} value={fee.description} error={errors[`${prefix}-description`]} onChange={(event) => updateFee({ description: event.target.value })} />
              <FormInput id={`${prefix}-amount`} label="Amount" aria-label={`Fee ${index + 1} amount`} inputMode="decimal" disabled={disabled || sectionsDisabled} value={fee.amount} error={errors[`${prefix}-amount`]} onChange={(event) => updateFee({ amount: event.target.value })} />
              <FormInput id={`${prefix}-currency`} label="Currency" aria-label={`Fee ${index + 1} currency`} className="uppercase" maxLength={3} disabled={disabled || sectionsDisabled} value={fee.currency} error={errors[`${prefix}-currency`]} onChange={(event) => updateFee({ currency: event.target.value.toUpperCase() })} />
              <SelectField id={`${prefix}-frequency`} label="Frequency" aria-label={`Fee ${index + 1} frequency`} disabled={disabled || sectionsDisabled} value={fee.billingFrequency} error={errors[`${prefix}-frequency`]} onChange={(event) => updateFee({ billingFrequency: event.target.value as typeof fee.billingFrequency, customFrequencyLabel: event.target.value === 'CUSTOM' ? fee.customFrequencyLabel : '' })}>
                <option value="">Select frequency</option>
                {['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'CUSTOM'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
              </SelectField>
              <FormInput id={`${prefix}-billing-start-date`} label="Billing start date" aria-label={`Fee ${index + 1} billing start date`} type="date" disabled={disabled || sectionsDisabled} value={fee.billingStartDate} error={errors[`${prefix}-billing-start-date`]} onChange={(event) => updateFee({ billingStartDate: event.target.value })} />
              {fee.billingFrequency === 'CUSTOM' ? <FormInput id={`${prefix}-custom-frequency`} className="sm:col-span-2" label="Custom frequency" aria-label={`Fee ${index + 1} custom frequency`} disabled={disabled || sectionsDisabled} value={fee.customFrequencyLabel} error={errors[`${prefix}-custom-frequency`]} onChange={(event) => updateFee({ customFrequencyLabel: event.target.value })} /> : null}
              <div className="sm:col-span-2"><Button size="xs" variant="ghost" disabled={disabled || sectionsDisabled || values.fees.length === 1} onClick={() => updateValue('fees', values.fees.filter((item) => item.uiId !== fee.uiId))}>Remove fee</Button></div>
            </div>
          );
        })}
      </section>
    </>
  );
}
