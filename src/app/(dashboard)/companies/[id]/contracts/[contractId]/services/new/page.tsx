'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Checkbox } from '@/components/ui/checkbox';
import { useCompany } from '@/hooks/use-companies';
import { useCompanyContracts } from '@/hooks/use-contracts';
import { useCreateContractService } from '@/hooks/use-contract-services';
import {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';
import type { ServiceType, ServiceStatus, BillingFrequency } from '@/generated/prisma';

interface PageProps {
  params: Promise<{ id: string; contractId: string }>;
}

export default function NewServicePage({ params }: PageProps) {
  const { id: companyId, contractId } = use(params);
  const router = useRouter();

  // Fetch company and contract data for display
  const { data: company } = useCompany(companyId);
  const { data: contractsData } = useCompanyContracts(companyId);
  const contract = contractsData?.contracts.find((c) => c.id === contractId);

  // Use the mutation hook
  const createServiceMutation = useCreateContractService(companyId, contractId);

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
    autoRenewal: false,
    renewalPeriodMonths: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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

    try {
      await createServiceMutation.mutateAsync({
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
      router.push(`/companies/${companyId}?tab=contracts`);
    } catch {
      // Error handled by mutation hook
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/companies/${companyId}?tab=contracts`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contracts
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
          Add Service
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {company?.name} &bull; {contract?.title || 'Contract'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Service Information */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Service Information</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="label">Service Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Monthly Bookkeeping"
                className={`input input-sm ${errors.name ? 'input-error' : ''}`}
              />
              {errors.name && (
                <p className="text-xs text-status-error mt-1.5">{errors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Service Type</label>
                <select
                  value={formData.serviceType}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      serviceType: e.target.value as ServiceType,
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
                      status: e.target.value as ServiceStatus,
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
          </div>
        </div>

        {/* Section 2: Billing Details */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Billing Details</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.rate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, rate: e.target.value }))
                  }
                  placeholder="0.00"
                  className={`input input-sm ${errors.rate ? 'input-error' : ''}`}
                />
                {errors.rate && (
                  <p className="text-xs text-status-error mt-1.5">{errors.rate}</p>
                )}
              </div>

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
            </div>

            {formData.serviceType === 'RECURRING' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Billing Frequency</label>
                  <select
                    value={formData.frequency}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        frequency: e.target.value as BillingFrequency,
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
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Schedule */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Schedule</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Start Date *</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className={`input input-sm ${errors.startDate ? 'input-error' : ''}`}
                />
                {errors.startDate && (
                  <p className="text-xs text-status-error mt-1.5">{errors.startDate}</p>
                )}
              </div>

              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  className="input input-sm"
                />
                {formData.serviceType === 'RECURRING' && (
                  <p className="text-xs text-text-muted mt-1.5">Leave empty for ongoing services</p>
                )}
              </div>
            </div>

            {formData.serviceType === 'RECURRING' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="auto-renewal"
                    checked={formData.autoRenewal}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        autoRenewal: e.target.checked,
                      }))
                    }
                    size="sm"
                  />
                  <label
                    htmlFor="auto-renewal"
                    className="text-sm text-text-primary cursor-pointer"
                  >
                    Auto-renewal
                  </label>
                </div>

                {formData.autoRenewal && (
                  <div>
                    <label className="label">Renewal Period</label>
                    <div className="flex items-center gap-2">
                      <input
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
                        className={`input input-sm w-24 ${errors.renewalPeriodMonths ? 'input-error' : ''}`}
                      />
                      <span className="text-sm text-text-muted">months</span>
                    </div>
                    {errors.renewalPeriodMonths && (
                      <p className="text-xs text-status-error mt-1.5">{errors.renewalPeriodMonths}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Scope of Work (Optional) */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Scope of Work</h2>
          </div>
          <div className="p-4">
            <RichTextEditor
              value={formData.scope}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, scope: value }))
              }
              placeholder="Describe the scope of work for this service..."
              minHeight={200}
            />
            <p className="text-xs text-text-muted mt-2">
              Optional. Detailed description of what this service includes.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/companies/${companyId}?tab=contracts`}
            className="btn-secondary btn-sm"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createServiceMutation.isPending}
            className="btn-primary btn-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {createServiceMutation.isPending ? 'Creating...' : 'Add Service'}
          </button>
        </div>
      </form>
    </div>
  );
}
