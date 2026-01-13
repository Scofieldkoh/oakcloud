'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import type { Contract } from '@/hooks/use-contracts';
import type {
  CreateContractServiceInput,
  UpdateContractServiceInput,
} from '@/hooks/use-contract-services';
import {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';
import type { ServiceType, ServiceStatus, BillingFrequency } from '@/generated/prisma';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service?: Contract['services'][0];
  onSubmit: (data: CreateContractServiceInput | UpdateContractServiceInput) => Promise<void>;
}

export function ServiceModal({
  isOpen,
  onClose,
  service,
  onSubmit,
}: ServiceModalProps) {
  const isEditing = !!service;

  const [formData, setFormData] = useState<{
    name: string;
    serviceType: ServiceType;
    status: ServiceStatus;
    rate: string;
    currency: string;
    frequency: BillingFrequency;
    startDate: string;
    endDate: string;
    scope: string;
    autoRenewal: boolean;
    renewalPeriodMonths: string;
  }>({
    name: '',
    serviceType: 'RECURRING',
    status: 'ACTIVE',
    rate: '',
    currency: 'SGD',
    frequency: 'MONTHLY',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    scope: '',
    autoRenewal: true,
    renewalPeriodMonths: '12',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        serviceType: service.serviceType,
        status: service.status,
        rate: service.rate !== null ? String(service.rate) : '',
        currency: service.currency,
        frequency: service.frequency,
        startDate: service.startDate.split('T')[0],
        endDate: service.endDate?.split('T')[0] || '',
        scope: service.scope || '',
        autoRenewal: service.autoRenewal,
        renewalPeriodMonths: service.renewalPeriodMonths
          ? String(service.renewalPeriodMonths)
          : '',
      });
    } else {
      setFormData({
        name: '',
        serviceType: 'RECURRING',
        status: 'ACTIVE',
        rate: '',
        currency: 'SGD',
        frequency: 'MONTHLY',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        scope: '',
        autoRenewal: true,
        renewalPeriodMonths: '12',
      });
    }
    setErrors({});
  }, [service, isOpen]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Service name is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (formData.rate && isNaN(parseFloat(formData.rate))) {
      newErrors.rate = 'Rate must be a valid number';
    }

    if (
      formData.renewalPeriodMonths &&
      isNaN(parseInt(formData.renewalPeriodMonths))
    ) {
      newErrors.renewalPeriodMonths = 'Must be a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: formData.name.trim(),
        serviceType: formData.serviceType,
        status: formData.status,
        rate: formData.rate ? parseFloat(formData.rate) : null,
        currency: formData.currency,
        frequency: formData.frequency,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        scope: formData.scope.trim() || null,
        autoRenewal: formData.autoRenewal,
        renewalPeriodMonths: formData.renewalPeriodMonths
          ? parseInt(formData.renewalPeriodMonths)
          : null,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Service' : 'Add Service'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Service Name */}
        <FormInput
          label="Service Name"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="e.g., Monthly Bookkeeping"
          error={errors.name}
          required
        />

        {/* Type & Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Service Type</label>
            <select
              value={formData.serviceType}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  serviceType: e.target.value as typeof formData.serviceType,
                }))
              }
              className="input input-sm"
            >
              {SERVICE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  status: e.target.value as typeof formData.status,
                }))
              }
              className="input input-sm"
            >
              {SERVICE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rate & Frequency */}
        <div className="grid grid-cols-3 gap-4">
          <FormInput
            label="Rate"
            type="number"
            step="0.01"
            min="0"
            value={formData.rate}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, rate: e.target.value }))
            }
            placeholder="0.00"
            error={errors.rate}
          />

          <div>
            <label className="label">Currency</label>
            <select
              value={formData.currency}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, currency: e.target.value }))
              }
              className="input input-sm"
            >
              <option value="SGD">SGD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="MYR">MYR</option>
            </select>
          </div>

          {formData.serviceType === 'RECURRING' && (
            <div>
              <label className="label">Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    frequency: e.target.value as typeof formData.frequency,
                  }))
                }
                className="input input-sm"
              >
                {BILLING_FREQUENCIES.filter((f) => f.value !== 'ONE_TIME').map(
                  (freq) => (
                    <option key={freq.value} value={freq.value}>
                      {freq.label}
                    </option>
                  )
                )}
              </select>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="Start Date"
            type="date"
            value={formData.startDate}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, startDate: e.target.value }))
            }
            error={errors.startDate}
            required
          />

          <FormInput
            label="End Date"
            type="date"
            value={formData.endDate}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, endDate: e.target.value }))
            }
            hint={
              formData.serviceType === 'RECURRING'
                ? 'Leave empty for ongoing services'
                : undefined
            }
          />
        </div>

        {/* Auto Renewal (for recurring services) */}
        {formData.serviceType === 'RECURRING' && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoRenewal}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    autoRenewal: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded border-border-primary text-oak-light focus:ring-oak-light"
              />
              <span className="text-sm text-text-primary">Auto-renews</span>
            </label>

            {formData.autoRenewal && (
              <FormInput
                label=""
                type="number"
                min="1"
                max="120"
                value={formData.renewalPeriodMonths}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    renewalPeriodMonths: e.target.value,
                  }))
                }
                placeholder="12"
                error={errors.renewalPeriodMonths}
                className="w-24"
              />
            )}
            {formData.autoRenewal && (
              <span className="text-sm text-text-muted">months</span>
            )}
          </div>
        )}

        {/* Scope / Statement of Work */}
        <div>
          <label className="label">Scope of Work</label>
          <RichTextEditor
            value={formData.scope}
            onChange={(value) =>
              setFormData((prev) => ({ ...prev, scope: value }))
            }
            placeholder="Describe the scope of work for this service..."
            minHeight={200}
          />
          <p className="text-xs text-text-muted mt-1.5">
            Optional. Detailed description of what this service includes.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border-primary">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {isEditing ? 'Update Service' : 'Add Service'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
