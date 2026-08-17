'use client';

import { Button } from '@/components/ui/button';
import { SingleDateInput } from '@/components/ui/single-date-input';
import type { ServiceAgreementFeeLineInput } from '@/services/service-agreement';
import { createServiceAgreementClientKey } from './client-key';

interface ServiceFeeEditorProps {
  fees: ServiceAgreementFeeLineInput[];
  entityIds: string[];
  companyNames: Map<string, string>;
  startDate: string;
  onChange: (fees: ServiceAgreementFeeLineInput[]) => void;
}

export function ServiceFeeEditor({
  fees,
  entityIds,
  companyNames,
  startDate,
  onChange,
}: ServiceFeeEditorProps) {
  const update = (
    index: number,
    patch: Partial<ServiceAgreementFeeLineInput>,
  ) => onChange(fees.map((fee, candidate) =>
    candidate === index ? { ...fee, ...patch } : fee));

  const addFee = (companyId: string) => {
    const displayOrder = fees.filter((fee) => fee.companyId === companyId).length;
    onChange([...fees, {
      clientKey: createServiceAgreementClientKey(),
      companyId,
      description: '',
      amount: '0.00',
      currency: 'SGD',
      billingFrequency: 'ANNUALLY',
      customFrequencyLabel: null,
      billingStartDate: startDate,
      displayOrder,
    }]);
  };

  return (
    <div className="space-y-3">
      {fees.map((fee, index) => (
        <div
          key={fee.clientKey}
          className="grid gap-2 rounded-md border border-border-secondary p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="text-xs text-text-secondary sm:col-span-2">
            {companyNames.get(fee.companyId) ?? 'Entity'} fee description
            <input
              value={fee.description}
              onChange={(event) => update(index, { description: event.target.value })}
              className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 text-sm sm:h-8"
            />
          </label>
          <label className="text-xs text-text-secondary">
            Amount
            <input
              inputMode="decimal"
              value={fee.amount}
              onChange={(event) => update(index, { amount: event.target.value })}
              className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 text-sm sm:h-8"
            />
          </label>
          <label className="text-xs text-text-secondary">
            Currency
            <input
              maxLength={3}
              value={fee.currency}
              onChange={(event) => update(index, {
                currency: event.target.value.toUpperCase(),
              })}
              className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 text-sm sm:h-8"
            />
          </label>
          <label className="text-xs text-text-secondary">
            Frequency
            <select
              value={fee.billingFrequency}
              onChange={(event) => update(index, {
                billingFrequency: event.target
                  .value as ServiceAgreementFeeLineInput['billingFrequency'],
                customFrequencyLabel: event.target.value === 'CUSTOM'
                  ? fee.customFrequencyLabel
                  : null,
              })}
              className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 text-xs sm:h-8"
            >
              {['MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY', 'ONE_TIME', 'CUSTOM'].map(
                (frequency) => (
                  <option key={frequency} value={frequency}>
                    {frequency.replaceAll('_', ' ')}
                  </option>
                ),
              )}
            </select>
          </label>
          {fee.billingFrequency === 'CUSTOM' ? (
            <label className="text-xs text-text-secondary">
              Custom frequency
              <input
                value={fee.customFrequencyLabel ?? ''}
                onChange={(event) => update(index, {
                  customFrequencyLabel: event.target.value,
                })}
                className="mt-1 h-11 w-full rounded border border-border-primary bg-background-primary px-2 text-sm sm:h-8"
              />
            </label>
          ) : null}
          <div className="text-xs text-text-secondary">
            <span>Billing start date</span>
            <SingleDateInput
              value={fee.billingStartDate ?? startDate}
              onChange={(next) => update(index, {
                billingStartDate: next || null,
              })}
              ariaLabel="Billing start date"
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onChange(
                fees
                  .filter((_, candidate) => candidate !== index)
                  .map((candidate, candidateIndex, remaining) => ({
                    ...candidate,
                    displayOrder: remaining
                      .slice(0, candidateIndex)
                      .filter((other) => other.companyId === candidate.companyId)
                      .length,
                  })),
              )}
            >
              Remove fee
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {entityIds.map((entityId) => (
          <Button
            key={entityId}
            variant="secondary"
            size="xs"
            onClick={() => addFee(entityId)}
          >
            Add fee for {companyNames.get(entityId) ?? 'entity'}
          </Button>
        ))}
      </div>
    </div>
  );
}
