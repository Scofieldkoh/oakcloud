'use client';

import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import type {
  BillingFrequency,
  CreateServiceVariantInput,
  ServiceCadence,
  ServiceVariantFeeTemplateInput,
  UpdateServiceVariantInput,
} from '@/lib/validations/service-catalog';
import type { ServiceVariantDto } from '@/services/service-catalog/types';

export interface ServicePartialOption {
  id: string;
  name: string;
  displayName: string | null;
}

interface ServiceVariantFormProps {
  familyId: string;
  initialValue?: ServiceVariantDto;
  partials: ServicePartialOption[];
  isLoadingPartials?: boolean;
  onCancel: () => void;
  onSubmit: (
    input: CreateServiceVariantInput | UpdateServiceVariantInput,
  ) => Promise<void>;
  isSubmitting?: boolean;
}

const CADENCES: Array<{ value: ServiceCadence; label: string }> = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'SEMI_ANNUALLY', label: 'Semi-annually' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'ONE_TIME', label: 'One time' },
  { value: 'AD_HOC', label: 'Ad hoc' },
  { value: 'CUSTOM', label: 'Custom' },
];

const BILLING_FREQUENCIES: Array<{
  value: BillingFrequency;
  label: string;
}> = CADENCES.filter(
  (cadence): cadence is { value: BillingFrequency; label: string } =>
    cadence.value !== 'AD_HOC',
);

function emptyFee(displayOrder: number): ServiceVariantFeeTemplateInput {
  return {
    description: '',
    defaultAmount: null,
    currency: 'SGD',
    billingFrequency: 'MONTHLY',
    customFrequencyLabel: null,
    displayOrder,
  };
}

export function ServiceVariantForm({
  familyId,
  initialValue,
  partials,
  isLoadingPartials = false,
  onCancel,
  onSubmit,
  isSubmitting = false,
}: ServiceVariantFormProps) {
  const [code, setCode] = useState(initialValue?.code ?? '');
  const [name, setName] = useState(initialValue?.name ?? '');
  const [description, setDescription] = useState(initialValue?.description ?? '');
  const [sowPartialId, setSowPartialId] = useState(
    initialValue?.sowPartial.id ?? partials[0]?.id ?? '',
  );
  const [serviceCadence, setServiceCadence] = useState<ServiceCadence>(
    initialValue?.serviceCadence ?? 'MONTHLY',
  );
  const [customCadenceLabel, setCustomCadenceLabel] = useState(
    initialValue?.customCadenceLabel ?? '',
  );
  const [displayOrder, setDisplayOrder] = useState(
    String(initialValue?.displayOrder ?? 0),
  );
  const [isActive, setIsActive] = useState(initialValue?.isActive ?? true);
  const [feeTemplates, setFeeTemplates] = useState<
    ServiceVariantFeeTemplateInput[]
  >(
    initialValue?.feeTemplates.map((fee) => ({
      ...fee,
      defaultAmount: fee.defaultAmount,
    })) ?? [],
  );

  const updateFee = (
    index: number,
    values: Partial<ServiceVariantFeeTemplateInput>,
  ) => {
    setFeeTemplates((current) =>
      current.map((fee, feeIndex) =>
        feeIndex === index ? { ...fee, ...values } : fee,
      ),
    );
  };

  const moveFee = (index: number, direction: -1 | 1) => {
    setFeeTemplates((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((fee, displayOrderValue) => ({
        ...fee,
        displayOrder: displayOrderValue,
      }));
    });
  };

  const removeFee = (index: number) => {
    setFeeTemplates((current) =>
      current
        .filter((_, feeIndex) => feeIndex !== index)
        .map((fee, displayOrderValue) => ({
          ...fee,
          displayOrder: displayOrderValue,
        })),
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({
      familyId,
      sowPartialId,
      code,
      name,
      description: description || null,
      serviceCadence,
      customCadenceLabel:
        serviceCadence === 'CUSTOM' ? customCadenceLabel : null,
      displayOrder: Number.parseInt(displayOrder, 10) || 0,
      isActive,
      feeTemplates: feeTemplates.map((fee, index) => ({
        ...fee,
        defaultAmount: fee.defaultAmount || null,
        customFrequencyLabel:
          fee.billingFrequency === 'CUSTOM'
            ? fee.customFrequencyLabel
            : null,
        displayOrder: index,
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            label="Variant code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MONTHLY-ACCOUNTING"
            required
          />
          <FormInput
            label="Variant name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Monthly accounting"
            required
          />
        </div>

        <label className="block text-xs font-medium text-text-secondary">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="mt-2 w-full rounded-lg border border-border-primary bg-background-primary px-3.5 py-2 text-sm text-text-primary focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-text-secondary">
            SOW partial
            <select
              aria-label="SOW partial"
              value={sowPartialId}
              onChange={(event) => setSowPartialId(event.target.value)}
              disabled={isLoadingPartials}
              required
              className="mt-2 h-9 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
            >
              <option value="">
                {isLoadingPartials ? 'Loading partials…' : 'Select a partial'}
              </option>
              {partials.map((partial) => (
                <option key={partial.id} value={partial.id}>
                  {partial.displayName || partial.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-text-secondary">
            Service cadence
            <select
              value={serviceCadence}
              onChange={(event) =>
                setServiceCadence(event.target.value as ServiceCadence)
              }
              className="mt-2 h-9 w-full rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
            >
              {CADENCES.map((cadence) => (
                <option key={cadence.value} value={cadence.value}>
                  {cadence.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {serviceCadence === 'CUSTOM' ? (
          <FormInput
            label="Custom cadence label"
            value={customCadenceLabel}
            onChange={(event) => setCustomCadenceLabel(event.target.value)}
            required
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            label="Display order"
            type="number"
            min={0}
            value={displayOrder}
            onChange={(event) => setDisplayOrder(event.target.value)}
          />
          <label className="flex min-h-11 items-center gap-2 self-end text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active
          </label>
        </div>

        <section className="border-t border-border-primary pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Default fee templates
              </h3>
              <p className="text-xs text-text-muted">
                Entity-agnostic defaults copied into agreements.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setFeeTemplates((current) => [
                  ...current,
                  emptyFee(current.length),
                ])
              }
            >
              Add fee row
            </Button>
          </div>

          {feeTemplates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-primary p-4 text-center text-xs text-text-muted">
              No default fee rows.
            </p>
          ) : (
            <div className="space-y-3">
              {feeTemplates.map((fee, index) => (
                <div
                  key={fee.id ?? `new-fee-${index}`}
                  className="rounded-lg border border-border-primary bg-background-primary p-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormInput
                      label="Fee description"
                      value={fee.description}
                      onChange={(event) =>
                        updateFee(index, { description: event.target.value })
                      }
                      required
                    />
                    <FormInput
                      label="Default amount"
                      inputMode="decimal"
                      value={fee.defaultAmount ?? ''}
                      onChange={(event) =>
                        updateFee(index, {
                          defaultAmount: event.target.value || null,
                        })
                      }
                      placeholder="0.00"
                    />
                    <FormInput
                      label="Currency"
                      value={fee.currency}
                      maxLength={3}
                      onChange={(event) =>
                        updateFee(index, {
                          currency: event.target.value.toUpperCase(),
                        })
                      }
                      required
                    />
                    <label className="block text-xs font-medium text-text-secondary">
                      Billing frequency
                      <select
                        value={fee.billingFrequency}
                        onChange={(event) =>
                          updateFee(index, {
                            billingFrequency: event.target
                              .value as BillingFrequency,
                          })
                        }
                        className="mt-2 h-8 w-full rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary"
                      >
                        {BILLING_FREQUENCIES.map((frequency) => (
                          <option key={frequency.value} value={frequency.value}>
                            {frequency.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {fee.billingFrequency === 'CUSTOM' ? (
                    <div className="mt-3">
                      <FormInput
                        label="Custom frequency label"
                        value={fee.customFrequencyLabel ?? ''}
                        onChange={(event) =>
                          updateFee(index, {
                            customFrequencyLabel: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      iconOnly
                      aria-label={`Move fee row ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveFee(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      iconOnly
                      aria-label={`Move fee row ${index + 1} down`}
                      disabled={index === feeTemplates.length - 1}
                      onClick={() => moveFee(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      iconOnly
                      aria-label={`Remove fee row ${index + 1}`}
                      onClick={() => removeFee(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-status-error" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-primary p-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {initialValue ? 'Save variant' : 'Create variant'}
        </Button>
      </div>
    </form>
  );
}
